import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeIban, isValidTurkishIban, validateBankAccount } from '../functions/api/_lib/bank-accounts.js';
import { calculateCouponPreview, onRequestPost as validateCoupon } from '../functions/api/coupons/validate.js';
import { calculateTotalsWithCoupon, getEftReservationMinutes, onRequestPost as createCheckout } from '../functions/api/create-checkout.js';
import { buildCheckItem, reserveInventoryForOrder, releaseInventoryReservations, convertInventoryReservations } from '../functions/api/_lib/inventory.js';
import { issueAdminSession, assertAdmin } from '../functions/api/_lib/admin.js';
import { onRequestPatch as adminStatusPatch } from '../functions/api/admin/orders/[id]/status.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { SUPABASE_URL:'https://local.supabase.test', SUPABASE_SERVICE_ROLE_KEY:'service-test', SUPABASE_TIMEOUT_MS:'3000' };
function response(body, status=200) { return new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}}); }
function contextFor(request, extra={}) { return { request, env:{...env,...extra.env}, params:extra.params||{} }; }
function requestJson(url, body, headers={}) { return new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}); }

const validBank = { bank_name:'Test Bankası', account_holder:'COSMOSKIN TEST', iban:'TR330006100519786457841326', currency:'TRY', is_active:true };
const validCustomer = {
  first_name:'Test', last_name:'Müşteri', email:'qa.user@cosmoskin.invalid', phone:'05551234567', city:'İstanbul', district:'Maltepe', postal_code:'34840',
  invoice_type:'Bireysel', address:'Test Mahallesi No 1 Daire 2', kvkk_acknowledged:true, preliminary_information_accepted:true, distance_sales_accepted:true
};

function installFetch(handler) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = previous; };
}

test('Turkish IBAN normalization and MOD-97 validation', () => {
  assert.equal(normalizeIban('tr33 0006 1005 1978 6457 8413 26'), 'TR330006100519786457841326');
  assert.equal(isValidTurkishIban('TR330006100519786457841326'), true);
  assert.equal(isValidTurkishIban('TR330006100519786457841327'), false);
  assert.deepEqual(validateBankAccount(validBank).errors, []);
  assert.equal(validateBankAccount({...validBank,is_active:false}).valid, false);
});

test('free-shipping coupon overrides shipping without negative totals', () => {
  const free = calculateCouponPreview({discount_type:'free_shipping'},899,'express');
  assert.equal(free.shipping,0); assert.equal(free.total,899); assert.equal(free.freeShipping,true);
  const percent = calculateCouponPreview({discount_type:'percent',discount_value:200},100,'standard');
  assert.equal(percent.discount,100); assert.equal(percent.total,0);
  const totals = calculateTotalsWithCoupon([{line_total:899}],{discount:0,freeShipping:true},'express');
  assert.deepEqual({shipping:totals.shipping,total:totals.total},{shipping:0,total:899});
  const restored = calculateTotalsWithCoupon([{line_total:899}],null,'standard');
  assert.equal(restored.shipping,89); assert.equal(restored.total,988);
});

test('EFT reservation duration is centrally bounded', () => {
  assert.equal(getEftReservationMinutes({EFT_RESERVATION_MINUTES:'1440'}),1440);
  assert.equal(getEftReservationMinutes({EFT_RESERVATION_MINUTES:'1'}),30);
  assert.equal(getEftReservationMinutes({EFT_RESERVATION_MINUTES:'999999'}),10080);
});

test('inventory rules distinguish missing, stock-zero, stock-one quantity-two and active stock', () => {
  const slug='beauty-of-joseon-relief-sun-spf50';
  const missing=buildCheckItem({product_slug:slug,quantity:1},new Map());
  assert.equal(missing.can_purchase,false); assert.match(missing.message,/satışta değil|stok kaydı|stokta yok/i);
  const zero=buildCheckItem({product_slug:slug,quantity:1},new Map([[slug,{status:'active',available_stock:0,allow_backorder:false}]]));
  assert.equal(zero.can_purchase,false); assert.match(zero.message,/stokta yok/i);
  const tooMany=buildCheckItem({product_slug:slug,quantity:2},new Map([[slug,{status:'active',available_stock:1,allow_backorder:false}]]));
  assert.equal(tooMany.can_purchase,false); assert.match(tooMany.message,/yalnızca 1/i);
  const ok=buildCheckItem({product_slug:slug,quantity:1},new Map([[slug,{status:'active',available_stock:1,allow_backorder:false,low_stock_threshold:2}]]));
  assert.equal(ok.can_purchase,true);
});

test('atomic inventory RPC success and idempotent release/conversion responses', async () => {
  const calls=[];
  const restore=installFetch(async (url,options={})=>{
    calls.push({url:String(url),body:options.body?JSON.parse(options.body):null});
    if(String(url).endsWith('/rpc/reserve_order_inventory')) return response({ok:true,reservations:[{id:'r1'}]});
    if(String(url).endsWith('/rpc/release_order_inventory')) return response({ok:true,released:0,idempotent:true});
    if(String(url).endsWith('/rpc/convert_order_inventory')) return response({ok:true,converted:0,deducted:0,idempotent:true});
    return response([]);
  });
  try {
    const context={env};
    const reserved=await reserveInventoryForOrder(context,'11111111-1111-4111-8111-111111111111',[{product_slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}]);
    assert.equal(reserved.length,1);
    assert.equal((await releaseInventoryReservations(context,'11111111-1111-4111-8111-111111111111')).idempotent,true);
    assert.equal((await convertInventoryReservations(context,'11111111-1111-4111-8111-111111111111')).idempotent,true);
    assert.deepEqual(calls.map(c=>new URL(c.url).pathname.split('/').pop()),['reserve_order_inventory','release_order_inventory','convert_order_inventory']);
  } finally { restore(); }
});

test('missing atomic RPC fails closed with operational error', async () => {
  const restore=installFetch(async ()=>response({message:'Could not find the function public.reserve_order_inventory in the schema cache'},404));
  try {
    await assert.rejects(
      reserveInventoryForOrder({env},'11111111-1111-4111-8111-111111111111',[{product_slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}]),
      (error)=>error.code==='INVENTORY_ATOMIC_RPC_MISSING' && error.status===503
    );
  } finally { restore(); }
});

class AtomicInventoryMock {
  constructor(stock){this.stock=stock;this.reserved=0;this.orders=new Map();this.lock=Promise.resolve();}
  async serial(fn){const before=this.lock;let release;this.lock=new Promise(r=>release=r);await before;try{return await fn();}finally{release();}}
  reserve(orderId,qty){return this.serial(()=>{if(this.orders.has(orderId))return {ok:true,idempotent:true};if(this.stock-this.reserved<qty)return {ok:false,code:'INSUFFICIENT_STOCK'};this.reserved+=qty;this.orders.set(orderId,{qty,status:'active'});return {ok:true,idempotent:false};});}
  convert(orderId){return this.serial(()=>{const row=this.orders.get(orderId);if(!row||row.status==='converted')return {ok:true,idempotent:true};if(row.status!=='active')return {ok:false};this.stock-=row.qty;this.reserved-=row.qty;row.status='converted';return {ok:true,idempotent:false};});}
  release(orderId){return this.serial(()=>{const row=this.orders.get(orderId);if(!row||row.status==='released')return {ok:true,idempotent:true};if(row.status!=='active')return {ok:true,idempotent:true};this.reserved-=row.qty;row.status='released';return {ok:true,idempotent:false};});}
}

test('deterministic local concurrency model: two stock-one attempts yield one reservation', async () => {
  const inv=new AtomicInventoryMock(1);
  const [a,b]=await Promise.all([inv.reserve('order-a',1),inv.reserve('order-b',1)]);
  assert.equal([a,b].filter(x=>x.ok).length,1); assert.equal(inv.reserved,1); assert.equal(inv.stock,1);
  const successOrder=a.ok?'order-a':'order-b';
  assert.equal((await inv.convert(successOrder)).ok,true); assert.equal((await inv.convert(successOrder)).idempotent,true); assert.equal(inv.stock,0); assert.equal(inv.reserved,0);
  assert.equal((await inv.release(successOrder)).idempotent,true); assert.equal(inv.stock,0);
});

test('coupon API: valid free shipping, invalid and expired outcomes', async () => {
  const scenarios=[
    {code:'FREESHIP',coupon:{id:'c1',code:'FREESHIP',is_active:true,discount_type:'free_shipping',min_subtotal:0},status:200,free:true},
    {code:'BAD',coupon:null,status:404},
    {code:'EXPIRED',coupon:{id:'c2',code:'EXPIRED',is_active:true,discount_type:'fixed',discount_value:10,ends_at:'2020-01-01T00:00:00Z'},status:400}
  ];
  for(const scenario of scenarios){
    const restore=installFetch(async (url)=>{
      const u=String(url);
      if(u.includes('/rest/v1/coupons')) return response(scenario.coupon?[scenario.coupon]:[]);
      if(u.includes('/rest/v1/coupon_redemptions')) return response([]);
      return response([]);
    });
    try{
      const req=requestJson('https://local.test/api/coupons/validate',{code:scenario.code,cart:[{slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}]});
      const res=await validateCoupon(contextFor(req)); const data=await res.json(); assert.equal(res.status,scenario.status); if(scenario.free) assert.equal(data.freeShipping,true);
    }finally{restore();}
  }
});

test('checkout blocks missing EFT bank account before inventory reservation or order creation', async () => {
  const calls=[];
  const restore=installFetch(async (url)=>{calls.push(String(url)); if(String(url).includes('/rest/v1/payment_bank_accounts')) return response([]); return response([]);});
  try{
    const req=requestJson('https://local.test/api/create-checkout',{payment_method:'bank_transfer',idempotency_key:'local-missing-bank-0001',cart:[{slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}],customer:validCustomer});
    const res=await createCheckout(contextFor(req)); const data=await res.json();
    assert.equal(res.status,503); assert.equal(data.code,'BANK_ACCOUNT_NOT_CONFIGURED');
    assert.equal(calls.some((url)=>url.includes('/rpc/reserve_order_inventory')),false);
    assert.equal(calls.some((url)=>url.includes('/rest/v1/orders')),false);
  }finally{restore();}
});

test('admin signed session is accepted and raw legacy token is disabled by default', async () => {
  const adminEnv={ADMIN_TOKEN:'a'.repeat(64),ADMIN_SESSION_SECRET:'b'.repeat(64),ADMIN_ALLOW_LEGACY_TOKEN:'false'};
  const issueRequest=new Request('https://local.test/api/admin/session',{method:'POST',headers:{'x-admin-token':adminEnv.ADMIN_TOKEN,'CF-Connecting-IP':'192.0.2.10'}});
  const issued=await issueAdminSession({request:issueRequest,env:adminEnv});
  assert.match(issued.token,/^v1\./);
  const signedRequest=new Request('https://local.test/api/admin/orders',{headers:{'x-admin-token':issued.token,'CF-Connecting-IP':'192.0.2.10'}});
  assert.equal(await assertAdmin({request:signedRequest,env:adminEnv}),true);
  const rawRequest=new Request('https://local.test/api/admin/orders',{headers:{'x-admin-token':adminEnv.ADMIN_TOKEN,'CF-Connecting-IP':'192.0.2.11'}});
  await assert.rejects(assertAdmin({request:rawRequest,env:adminEnv}),/yetkilendirmesi/i);
});

test('unauthorized admin mutation is rejected server-side before database access', async () => {
  let fetchCount=0; const restore=installFetch(async()=>{fetchCount++;return response([])});
  try{
    const req=new Request('https://local.test/api/admin/orders/1/status',{method:'PATCH',headers:{'content-type':'application/json','x-admin-token':'wrong','CF-Connecting-IP':'192.0.2.12'},body:JSON.stringify({status:'paid'})});
    const res=await adminStatusPatch({request:req,env:{ADMIN_TOKEN:'a'.repeat(64),ADMIN_SESSION_SECRET:'b'.repeat(64),ADMIN_ALLOW_LEGACY_TOKEN:'false'},params:{id:'1'}});
    assert.equal(res.status,401); assert.equal(fetchCount,0);
  }finally{restore();}
});

test('callback source contains no direct inventory read/update fallback and uses atomic processor', async () => {
  const source=await fs.readFile(path.join(root,'functions/api/iyzico-callback.js'),'utf8');
  assert.match(source,/process_iyzico_payment_success/);
  assert.doesNotMatch(source,/stock_on_hand\s*:\s*|convertInventoryReservations\s*,\s*releaseInventoryReservations/);
  assert.match(source,/PAYMENT_AMOUNT_MISMATCH/); assert.match(source,/PAYMENT_CURRENCY_MISMATCH/);
});

test('payment migration protects paid orders from expiry and exposes service-role-only processors', async () => {
  const sql=await fs.readFile(path.join(root,'supabase/migrations/20260616_payment_bank_and_callback_hardening.sql'),'utf8');
  assert.match(sql,/process_iyzico_payment_success/); assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/NOT IN \('paid','refunded','partially_refunded'\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.process_iyzico_payment_success/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.process_iyzico_payment_success.*service_role/s);
});

test('Smart Routine uses live inventory and warns rather than silently skipping changed products', async () => {
  const source=await fs.readFile(path.join(root,'assets/js/smart-routine.js'),'utf8');
  assert.match(source,/COSMOSKIN_STOCK/); assert.match(source,/checkItems/); assert.match(source,/refreshLiveInventory/);
  assert.match(source,/stok|ulaşılamıyor|değişti/i);
  const wizard=await fs.readFile(path.join(root,'assets/smart-routine-wizard.js'),'utf8');
  assert.match(wizard,/step<6|step===6/); assert.match(wizard,/data-wizard-back/); assert.match(wizard,/restart/);
});


test('newsletter sender env is consistent and does not hard-fail on contradictory BREVO sender rules', async () => {
  const envExample = await fs.readFile(path.join(root, '.env.example'), 'utf8');
  const source = await fs.readFile(path.join(root, 'functions/api/newsletter/subscribe.js'), 'utf8');
  assert.match(envExample, /NEWSLETTER_FROM_EMAIL=newsletter@cosmoskin\.com\.tr/);
  assert.match(source, /NEWSLETTER_FROM_EMAIL \|\| env\.BREVO_SENDER_EMAIL/);
  assert.doesNotMatch(source, /BREVO_SENDER_EMAIL\s*!==\s*['"]newsletter@cosmoskin\.com\.tr/);
  assert.match(source, /Newsletter e-posta gönderimi yapılandırması eksik/);
});

test('card checkout requires valid identity number for individual iyzico buyer payload', async () => {
  const api = await fs.readFile(path.join(root, 'functions/api/create-checkout.js'), 'utf8');
  const flow = await fs.readFile(path.join(root, 'assets/checkout-flow.js'), 'utf8');
  assert.match(api, /IDENTITY_NUMBER_REQUIRED/);
  assert.match(api, /requireCardIdentityNumber\(paymentMethod, customer, invoiceDetails\)/);
  assert.match(api, /identityNumber:\s*customer\.identity_number/);
  assert.match(flow, /Kartlı ödeme ile bireysel fatura için T\.C\. kimlik numarası zorunludur/);
  assert.match(flow, /T\.C\. Kimlik No \(kartlı ödeme için zorunlu\)/);
});

test('iyzico callback suppresses normal success email when paid processing RPC fails', async () => {
  const source = await fs.readFile(path.join(root, 'functions/api/iyzico-callback.js'), 'utf8');
  assert.match(source, /paymentVerifiedButProcessingFailed/);
  assert.match(source, /order_processing_review_required/);
  assert.match(source, /Normal başarı e-postası gönderilmedi/);
  assert.match(source, /confirmationEmailEligible/);
  const failureBranch = source.slice(source.indexOf('if \(paymentVerifiedButProcessingFailed\)'.replace(/\\/g,'')));
  assert.doesNotMatch(failureBranch.split('} else if')[0], /sendPaymentSuccessEmailSafely/);
});

test('sitemap contains only canonical legal URLs, not redirected root legal pages', async () => {
  const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
  ['teslimat-kargo.html', 'iade-degisim.html', 'mesafeli-satis.html', 'on-bilgilendirme.html'].forEach((legacy) => {
    assert.doesNotMatch(sitemap, new RegExp(`https://www\\.cosmoskin\\.com\\.tr/${legacy}`));
  });
  assert.match(sitemap, /https:\/\/www\.cosmoskin\.com\.tr\/legal\/teslimat-ve-kargo\.html/);
  assert.match(sitemap, /https:\/\/www\.cosmoskin\.com\.tr\/legal\/iade-ve-cayma-politikasi\.html/);
  assert.doesNotMatch(sitemap, /pages\.dev|local-dev-host|staging/);
});

test('mobile redesign cannot mount legacy checkout or legal support shells', async () => {
  const source = await fs.readFile(path.join(root, 'assets/mobile-redesign.js'), 'utf8');
  assert.doesNotMatch(source, /function checkout(?:Page|Delivery|Payment)\s*\(/);
  assert.doesNotMatch(source, /function supportPage\s*\(/);
  assert.doesNotMatch(source, /data-cm-delivery-form|data-cm-checkout-form|data-cm-legal-check|cosmoskin_checkout_mobile_draft/);
  assert.match(source, /\/checkout\\\.html\$\/\.test\(p\)\) return null/);
  assert.match(source, /\/legal\\\//);
});

test('contact form has Turnstile-ready spam protection without exposing secrets', async () => {
  const envExample = await fs.readFile(path.join(root, '.env.example'), 'utf8');
  const html = await fs.readFile(path.join(root, 'contact.html'), 'utf8');
  const client = await fs.readFile(path.join(root, 'assets/contact-form.js'), 'utf8');
  const api = await fs.readFile(path.join(root, 'functions/api/contact.js'), 'utf8');
  const headers = await fs.readFile(path.join(root, '_headers'), 'utf8');
  assert.match(envExample, /TURNSTILE_SITE_KEY=/);
  assert.match(envExample, /TURNSTILE_SECRET_KEY=/);
  assert.match(html, /data-turnstile-container/);
  assert.match(client, /cf-turnstile/);
  assert.match(api, /verifyTurnstile/);
  assert.match(headers, /https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(client, /TURNSTILE_SECRET_KEY/);
});
