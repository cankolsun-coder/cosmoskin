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
import { hasAdminPermission } from '../functions/api/_lib/admin-audit.js';
import { onRequestPost as adminUsersPost } from '../functions/api/admin/users.js';
import { onRequestGet as adminOrdersGet, onRequestPatch as adminOrdersPatch } from '../functions/api/admin/orders.js';
import { onRequestGet as adminOrderDetailGet } from '../functions/api/admin/orders/[id].js';
import { onRequestPost as adminOrderEmailsPost } from '../functions/api/admin/orders/[id]/emails.js';
import { onRequestPost as adminOrderShipmentsPost } from '../functions/api/admin/orders/[id]/shipments.js';
import { onRequestGet as adminReturnsGet, onRequestPatch as adminReturnsPatch } from '../functions/api/admin/returns.js';
import { onRequestGet as adminCustomersGet } from '../functions/api/admin/customers.js';
import { onRequestGet as adminProductsGet, onRequestPatch as adminProductsPatch, onRequestPost as adminProductsPost } from '../functions/api/admin/products.js';
import { onRequestGet as adminInventoryGet } from '../functions/api/admin/inventory.js';
import { onRequestPost as adminInventoryAdjustPost } from '../functions/api/admin/inventory/adjust.js';
import { onRequestPatch as adminInventorySlugPatch } from '../functions/api/admin/inventory/[slug].js';
import { onRequestGet as adminInventoryMovementsGet } from '../functions/api/admin/inventory/[slug]/movements.js';
import { onRequestGet as adminLotsGet, onRequestPost as adminLotsPost, onRequestPatch as adminLotsPatch } from '../functions/api/admin/lots.js';
import { onRequestGet as adminSuppliersGet, onRequestPost as adminSuppliersPost, onRequestPatch as adminSuppliersPatch } from '../functions/api/admin/suppliers.js';
import { onRequestGet as adminComplianceGet, onRequestPatch as adminCompliancePatch } from '../functions/api/admin/compliance.js';
import { onRequestGet as adminCouponsGet, onRequestPost as adminCouponsPost, onRequestPatch as adminCouponsPatch } from '../functions/api/admin/coupons/index.js';
import { onRequestGet as adminShipmentsGet } from '../functions/api/admin/shipments.js';
import { onRequestGet as adminEmailLogsGet } from '../functions/api/admin/email-logs.js';
import { onRequestGet as adminRefundsGet, onRequestPost as adminRefundsPost } from '../functions/api/admin/refunds.js';
import { onRequestGet as adminInvoicesGet, onRequestPost as adminInvoicesPost, onRequestPatch as adminInvoicesPatch } from '../functions/api/admin/invoices.js';
import { onRequestGet as adminBankAccountsGet, onRequestPost as adminBankAccountsPost, onRequestPatch as adminBankAccountsPatch } from '../functions/api/admin/bank-accounts.js';

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

function installAdminUsersFetch(row) {
  return installFetch(async (url) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response(row ? [row] : []);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return response([]);
  });
}
function ctxWithAccessEmail(email) {
  const headers = { 'CF-Connecting-IP': '192.0.2.20' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return contextFor(new Request('https://local.test/api/admin/loyalty/adjust-points', { headers }));
}

test('A1: hasAdminPermission denies by default when no admin_users row matches (no allow-all bypass)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('unknown@example.com'), 'orders:read'), false);
    assert.equal(await hasAdminPermission(ctxWithAccessEmail(null), 'orders:read'), false);
  } finally { restore(); }
});

test('A1: hasAdminPermission denies an inactive or disabled admin regardless of role', async () => {
  const restoreInactive = installAdminUsersFetch({ id: '1', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: [], is_active: false, status: 'active' });
  try { assert.equal(await hasAdminPermission(ctxWithAccessEmail('ops@cosmoskin.com.tr'), 'orders:read'), false); } finally { restoreInactive(); }
  const restoreDisabled = installAdminUsersFetch({ id: '1', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: [], is_active: true, status: 'disabled' });
  try { assert.equal(await hasAdminPermission(ctxWithAccessEmail('ops@cosmoskin.com.tr'), 'orders:read'), false); } finally { restoreDisabled(); }
});

test('A1: owner permissions [\'*\'] pass every permission check after the deny-by-default flip', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('cankolsun@gmail.com'), 'loyalty:adjust'), true);
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('cankolsun@gmail.com'), 'admin.users.manage'), true);
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('cankolsun@gmail.com'), 'anything:not_seeded'), true);
  } finally { restore(); }
});

test('A1: client-supplied is_admin/role/permissions body fields cannot grant admin access', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    const forged = ctxWithAccessEmail('attacker@example.com');
    forged.request = new Request('https://local.test/api/admin/loyalty/adjust-points', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Cf-Access-Authenticated-User-Email': 'attacker@example.com' },
      body: JSON.stringify({ is_admin: true, role: 'owner', role_code: 'owner', permissions: ['*'] })
    });
    assert.equal(await hasAdminPermission(forged, 'loyalty:adjust'), false);
  } finally { restore(); }
});

test('A1: admin/users.js mutation requires admin.users.manage (or owner) — ADMIN_TOKEN alone is not enough', async () => {
  const adminEnv = { ADMIN_TOKEN: 'a'.repeat(64), ADMIN_SESSION_SECRET: 'b'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'false', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
  const issueRequest = new Request('https://local.test/api/admin/session', { method: 'POST', headers: { 'x-admin-token': adminEnv.ADMIN_TOKEN, 'CF-Connecting-IP': '192.0.2.21' } });
  const issued = await issueAdminSession({ request: issueRequest, env: adminEnv });

  const restoreNoMatch = installAdminUsersFetch(null);
  try {
    const req = new Request('https://local.test/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': issued.token, 'CF-Connecting-IP': '192.0.2.21' },
      body: JSON.stringify({ email: 'new-admin@cosmoskin.com.tr', role: 'owner' })
    });
    const res = await adminUsersPost({ request: req, env: adminEnv, params: {} });
    assert.equal(res.status, 403);
  } finally { restoreNoMatch(); }

  const restoreOwner = installFetch(async (url, init) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users') && (!init || init.method === undefined || init.method === 'GET')) {
      return response([{ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' }]);
    }
    if (href.includes('/rest/v1/admin_users')) return response([{ id: '2', email: 'new-admin@cosmoskin.com.tr', role: 'operations' }]);
    return response([]);
  });
  try {
    const req = new Request('https://local.test/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': issued.token, 'CF-Connecting-IP': '192.0.2.21', 'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com' },
      body: JSON.stringify({ email: 'new-admin@cosmoskin.com.tr', role: 'operations' })
    });
    const res = await adminUsersPost({ request: req, env: adminEnv, params: {} });
    assert.equal(res.status, 200);
  } finally { restoreOwner(); }
});

// ---------------------------------------------------------------------------
// A1.2a: admin GET/read endpoint permission coverage. Shared parametrized
// helper reused across all 13 gated endpoints instead of hand-writing near-
// duplicate tests per file.
// ---------------------------------------------------------------------------
function adminReadEnv() {
  return { ADMIN_TOKEN: 'a'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'true', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
}
function adminReadRequest(url, email) {
  const headers = { 'x-admin-token': 'a'.repeat(64), 'CF-Connecting-IP': '192.0.2.30' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return new Request(url, { headers });
}
const A1_2A_READ_ENDPOINTS = [
  { label: 'admin/orders.js', permission: 'orders:read', handler: adminOrdersGet, url: 'https://local.test/api/admin/orders', params: {} },
  { label: 'admin/orders/[id].js', permission: 'orders:read', handler: adminOrderDetailGet, url: 'https://local.test/api/admin/orders/order-1', params: { id: 'order-1' } },
  { label: 'admin/returns.js', permission: 'returns:read', handler: adminReturnsGet, url: 'https://local.test/api/admin/returns', params: {} },
  { label: 'admin/customers.js', permission: 'customers:read', handler: adminCustomersGet, url: 'https://local.test/api/admin/customers', params: {} },
  { label: 'admin/products.js', permission: 'products:read', handler: adminProductsGet, url: 'https://local.test/api/admin/products', params: {} },
  { label: 'admin/inventory.js', permission: 'inventory:read', handler: adminInventoryGet, url: 'https://local.test/api/admin/inventory', params: {} },
  { label: 'admin/inventory/[slug]/movements.js', permission: 'inventory:read', handler: adminInventoryMovementsGet, url: 'https://local.test/api/admin/inventory/test-slug/movements', params: { slug: 'test-slug' } },
  { label: 'admin/lots.js', permission: 'lots:read', handler: adminLotsGet, url: 'https://local.test/api/admin/lots', params: {} },
  { label: 'admin/suppliers.js', permission: 'suppliers:read', handler: adminSuppliersGet, url: 'https://local.test/api/admin/suppliers', params: {} },
  { label: 'admin/compliance.js', permission: 'compliance:read', handler: adminComplianceGet, url: 'https://local.test/api/admin/compliance', params: {} },
  { label: 'admin/coupons/index.js', permission: 'coupons:read', handler: adminCouponsGet, url: 'https://local.test/api/admin/coupons', params: {} },
  { label: 'admin/shipments.js', permission: 'shipments:read', handler: adminShipmentsGet, url: 'https://local.test/api/admin/shipments', params: {} },
  { label: 'admin/email-logs.js', permission: 'email_logs:read', handler: adminEmailLogsGet, url: 'https://local.test/api/admin/email-logs', params: {} }
];

test('A1.2a: every gated GET/read admin endpoint denies an assertAdmin()-valid caller with no matching admin_users row (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, url, params } of A1_2A_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'unknown@example.com'), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2a: every gated GET/read admin endpoint lets the seeded owner (permissions [\'*\']) through the new permission gate', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, url, params } of A1_2A_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'cankolsun@gmail.com'), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2a: an inactive or disabled admin is still denied on a gated read endpoint, even with the right role', async () => {
  const restoreInactive = installAdminUsersFetch({ id: '2', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: ['orders:read'], is_active: false, status: 'active' });
  try {
    const res = await adminOrdersGet({ request: adminReadRequest('https://local.test/api/admin/orders', 'ops@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403);
  } finally { restoreInactive(); }
  const restoreDisabled = installAdminUsersFetch({ id: '2', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: ['orders:read'], is_active: true, status: 'disabled' });
  try {
    const res = await adminOrdersGet({ request: adminReadRequest('https://local.test/api/admin/orders', 'ops@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403);
  } finally { restoreDisabled(); }
});

test('A1.2a: a caller whose only permission is unrelated cannot pass a differently-named read gate', async () => {
  const restore = installAdminUsersFetch({ id: '3', email: 'warehouse@cosmoskin.com.tr', role: 'warehouse', role_code: 'warehouse', permissions: ['inventory:read'], is_active: true, status: 'active' });
  try {
    const res = await adminReturnsGet({ request: adminReadRequest('https://local.test/api/admin/returns', 'warehouse@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403, 'a warehouse-role caller holding only inventory:read must not pass the returns:read gate');
  } finally { restore(); }
});

test('A1.2a/A1.2b: mutation handlers sharing a file with a gated GET carry only their own (mutation) permission, never the GET one', async () => {
  function handlerBody(src, name) {
    const start = src.indexOf(`export async function ${name}`);
    if (start === -1) return '';
    const next = src.indexOf('\nexport ', start + 1);
    return src.slice(start, next === -1 ? undefined : next);
  }
  const filesWithMutationPermission = {
    orders: { src: await fs.readFile(path.join(root, 'functions/api/admin/orders.js'), 'utf8'), handlers: { onRequestPatch: 'orders:update' } },
    returns: { src: await fs.readFile(path.join(root, 'functions/api/admin/returns.js'), 'utf8'), handlers: { onRequestPatch: 'returns:update' } },
    products: { src: await fs.readFile(path.join(root, 'functions/api/admin/products.js'), 'utf8'), handlers: { onRequestPatch: 'inventory:adjust', onRequestPost: 'inventory:adjust' } },
    lots: { src: await fs.readFile(path.join(root, 'functions/api/admin/lots.js'), 'utf8'), handlers: { onRequestPost: 'inventory:adjust', onRequestPatch: 'inventory:adjust' } },
    suppliers: { src: await fs.readFile(path.join(root, 'functions/api/admin/suppliers.js'), 'utf8'), handlers: { onRequestPost: 'suppliers:manage', onRequestPatch: 'suppliers:manage' } },
    compliance: { src: await fs.readFile(path.join(root, 'functions/api/admin/compliance.js'), 'utf8'), handlers: { onRequestPatch: 'products:update' } },
    coupons: { src: await fs.readFile(path.join(root, 'functions/api/admin/coupons/index.js'), 'utf8'), handlers: { onRequestPost: 'coupons:manage', onRequestPatch: 'coupons:manage' } }
  };
  for (const [name, { src, handlers }] of Object.entries(filesWithMutationPermission)) {
    for (const [handlerName, expectedPermission] of Object.entries(handlers)) {
      const body = handlerBody(src, handlerName);
      assert.ok(body, `${name}.js: ${handlerName} not found`);
      assert.match(body, /assertAdmin\(context\)/, `${name}.js ${handlerName}: assertAdmin must remain present`);
      const calls = Array.from(body.matchAll(/requireAdminPermission\(context,\s*['"]([a-zA-Z_]+:[a-zA-Z_]+)['"]\)/g)).map((m) => m[1]);
      assert.deepEqual(calls, [expectedPermission], `${name}.js ${handlerName}: must call requireAdminPermission with exactly its own mutation permission '${expectedPermission}', not the file's GET/read permission`);
    }
  }
});

test('A1.2c: the deliberate escape-hatch routes remain untouched (dashboard.js, inventory/health.js)', async () => {
  const escapeHatches = {
    dashboard: await fs.readFile(path.join(root, 'functions/api/admin/dashboard.js'), 'utf8'),
    inventoryHealth: await fs.readFile(path.join(root, 'functions/api/admin/inventory/health.js'), 'utf8')
  };
  for (const [name, source] of Object.entries(escapeHatches)) {
    assert.doesNotMatch(source, /requireAdminPermission/, `${name}: must remain the deliberate assertAdmin-only escape hatch — must not gain a requireAdminPermission(...) call`);
    assert.match(source, /assertAdmin\(context\)/, `${name}: must remain assertAdmin-gated`);
  }
});

// ---------------------------------------------------------------------------
// A1.2b: admin mutation endpoint permission coverage. Shared parametrized
// helper reused across all 16 gated mutation handlers instead of hand-writing
// near-duplicate tests per file.
// ---------------------------------------------------------------------------
function adminMutationRequest(url, method, email, body = {}) {
  const headers = { 'x-admin-token': 'a'.repeat(64), 'CF-Connecting-IP': '192.0.2.31', 'content-type': 'application/json' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}
const A1_2B_MUTATION_ENDPOINTS = [
  { label: 'admin/orders.js PATCH', permission: 'orders:update', handler: adminOrdersPatch, method: 'PATCH', url: 'https://local.test/api/admin/orders', params: {}, body: { id: 'order-1', status: 'preparing' } },
  { label: 'admin/orders/[id]/status.js PATCH', permission: 'orders:update', handler: adminStatusPatch, method: 'PATCH', url: 'https://local.test/api/admin/orders/order-1/status', params: { id: 'order-1' }, body: { status: 'preparing' } },
  { label: 'admin/orders/[id]/emails.js POST', permission: 'orders:update', handler: adminOrderEmailsPost, method: 'POST', url: 'https://local.test/api/admin/orders/order-1/emails', params: { id: 'order-1' }, body: { email_type: 'order_created' } },
  { label: 'admin/orders/[id]/shipments.js POST', permission: 'shipments:create', handler: adminOrderShipmentsPost, method: 'POST', url: 'https://local.test/api/admin/orders/order-1/shipments', params: { id: 'order-1' }, body: { carrier: 'DHL', tracking_number: '123' } },
  { label: 'admin/returns.js PATCH', permission: 'returns:update', handler: adminReturnsPatch, method: 'PATCH', url: 'https://local.test/api/admin/returns', params: {}, body: { id: 'ret-1', status: 'approved' } },
  { label: 'admin/products.js PATCH', permission: 'inventory:adjust', handler: adminProductsPatch, method: 'PATCH', url: 'https://local.test/api/admin/products', params: {}, body: { product_slug: 'test-slug', stock_qty: 5 } },
  { label: 'admin/products.js POST', permission: 'inventory:adjust', handler: adminProductsPost, method: 'POST', url: 'https://local.test/api/admin/products', params: {}, body: { product_slug: 'test-slug' } },
  { label: 'admin/inventory/adjust.js POST', permission: 'inventory:adjust', handler: adminInventoryAdjustPost, method: 'POST', url: 'https://local.test/api/admin/inventory/adjust', params: {}, body: { product_slug: 'test-slug', quantity: 1 } },
  { label: 'admin/inventory/[slug].js PATCH', permission: 'inventory:adjust', handler: adminInventorySlugPatch, method: 'PATCH', url: 'https://local.test/api/admin/inventory/test-slug', params: { slug: 'test-slug' }, body: { stock_on_hand: 5 } },
  { label: 'admin/lots.js POST', permission: 'inventory:adjust', handler: adminLotsPost, method: 'POST', url: 'https://local.test/api/admin/lots', params: {}, body: { product_slug: 'test-slug', quantity: 1 } },
  { label: 'admin/lots.js PATCH', permission: 'inventory:adjust', handler: adminLotsPatch, method: 'PATCH', url: 'https://local.test/api/admin/lots', params: {}, body: { id: 'lot-1' } },
  { label: 'admin/suppliers.js POST', permission: 'suppliers:manage', handler: adminSuppliersPost, method: 'POST', url: 'https://local.test/api/admin/suppliers', params: {}, body: { name: 'Test Tedarikçi' } },
  { label: 'admin/suppliers.js PATCH', permission: 'suppliers:manage', handler: adminSuppliersPatch, method: 'PATCH', url: 'https://local.test/api/admin/suppliers', params: {}, body: { id: 'sup-1', name: 'Test Tedarikçi' } },
  { label: 'admin/compliance.js PATCH', permission: 'products:update', handler: adminCompliancePatch, method: 'PATCH', url: 'https://local.test/api/admin/compliance', params: {}, body: { product_slug: 'test-slug' } },
  { label: 'admin/coupons/index.js POST', permission: 'coupons:manage', handler: adminCouponsPost, method: 'POST', url: 'https://local.test/api/admin/coupons', params: {}, body: { code: 'TEST10' } },
  { label: 'admin/coupons/index.js PATCH', permission: 'coupons:manage', handler: adminCouponsPatch, method: 'PATCH', url: 'https://local.test/api/admin/coupons', params: {}, body: { id: 'cp-1' } }
];

test('A1.2b: every gated mutation admin endpoint denies an assertAdmin()-valid caller with no matching admin_users row (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, method, url, params, body } of A1_2B_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'unknown@example.com', body), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2b: every gated mutation admin endpoint lets the seeded owner (permissions [\'*\']) through the new permission gate', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, method, url, params, body } of A1_2B_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'cankolsun@gmail.com', body), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2b: a caller holding only the file\'s read permission cannot perform the mutation (read does not imply write)', async () => {
  const cases = [
    { readOnlyPermission: 'orders:read', endpoint: A1_2B_MUTATION_ENDPOINTS[0] }, // admin/orders.js PATCH needs orders:update
    { readOnlyPermission: 'inventory:read', endpoint: A1_2B_MUTATION_ENDPOINTS.find((e) => e.label === 'admin/inventory/adjust.js POST') },
    { readOnlyPermission: 'coupons:read', endpoint: A1_2B_MUTATION_ENDPOINTS.find((e) => e.label === 'admin/coupons/index.js POST') }
  ];
  for (const { readOnlyPermission, endpoint } of cases) {
    const restore = installAdminUsersFetch({ id: '4', email: 'reader@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: [readOnlyPermission], is_active: true, status: 'active' });
    try {
      const res = await endpoint.handler({ request: adminMutationRequest(endpoint.url, endpoint.method, 'reader@cosmoskin.com.tr', endpoint.body), env: adminReadEnv(), params: endpoint.params });
      assert.equal(res.status, 403, `${endpoint.label}: a caller holding only '${readOnlyPermission}' must not be able to perform the mutation (needs '${endpoint.permission}')`);
    } finally { restore(); }
  }
});

test('A1.2b: a mutation permission does not accidentally unlock the file\'s unrelated GET/read route', async () => {
  const cases = [
    { mutationOnlyPermission: 'orders:update', getHandler: adminOrdersGet, url: 'https://local.test/api/admin/orders', params: {} },
    { mutationOnlyPermission: 'suppliers:manage', getHandler: adminSuppliersGet, url: 'https://local.test/api/admin/suppliers', params: {} },
    { mutationOnlyPermission: 'coupons:manage', getHandler: adminCouponsGet, url: 'https://local.test/api/admin/coupons', params: {} }
  ];
  for (const { mutationOnlyPermission, getHandler, url, params } of cases) {
    const restore = installAdminUsersFetch({ id: '5', email: 'writer@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: [mutationOnlyPermission], is_active: true, status: 'active' });
    try {
      const res = await getHandler({ request: adminReadRequest(url, 'writer@cosmoskin.com.tr'), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `a caller holding only '${mutationOnlyPermission}' must not be able to pass the file's separate GET/read permission gate`);
    } finally { restore(); }
  }
});

test('A1.2b: high-caution order status transition endpoints keep their business-logic markers alongside the new permission gate', async () => {
  const ordersSrc = await fs.readFile(path.join(root, 'functions/api/admin/orders.js'), 'utf8');
  const statusSrc = await fs.readFile(path.join(root, 'functions/api/admin/orders/[id]/status.js'), 'utf8');
  for (const marker of ['assertOperationalTransition', 'releaseInventoryReservations', 'convertInventoryReservations', 'awardOrderPoints', 'promoteOrderPoints', 'reverseOrderPoints']) {
    assert.match(ordersSrc, new RegExp(marker), `admin/orders.js: business-logic marker '${marker}' must remain present alongside the A1.2b permission gate`);
  }
  for (const marker of ['releaseInventoryReservations', 'convertInventoryReservations', 'awardOrderPoints', 'promoteOrderPoints', 'reverseOrderPoints']) {
    assert.match(statusSrc, new RegExp(marker), `admin/orders/[id]/status.js: business-logic marker '${marker}' must remain present alongside the A1.2b permission gate`);
  }
});

// ---------------------------------------------------------------------------
// A1.2c: admin finance / refund / bank-account endpoint permission coverage.
// refunds.js has no separate seeded read permission, so GET and POST both
// reuse 'refunds:update' (per the A1.2 plan). bank-accounts.js deliberately
// uses a single 'bank_accounts:manage' string across GET/POST/PATCH (per the
// plan's "fraud-sensitive even to read" rationale for IBAN/payment-routing
// data) rather than a read/write split.
// ---------------------------------------------------------------------------
const A1_2C_FINANCE_READ_ENDPOINTS = [
  { label: 'admin/refunds.js GET', permission: 'refunds:update', handler: adminRefundsGet, url: 'https://local.test/api/admin/refunds', params: {} },
  { label: 'admin/invoices.js GET', permission: 'invoices:read', handler: adminInvoicesGet, url: 'https://local.test/api/admin/invoices', params: {} },
  { label: 'admin/bank-accounts.js GET', permission: 'bank_accounts:manage', handler: adminBankAccountsGet, url: 'https://local.test/api/admin/bank-accounts', params: {} }
];
const A1_2C_FINANCE_MUTATION_ENDPOINTS = [
  { label: 'admin/refunds.js POST', permission: 'refunds:update', handler: adminRefundsPost, method: 'POST', url: 'https://local.test/api/admin/refunds', params: {}, body: { order_id: 'order-1', status: 'pending' } },
  { label: 'admin/invoices.js POST', permission: 'invoices:update', handler: adminInvoicesPost, method: 'POST', url: 'https://local.test/api/admin/invoices', params: {}, body: { order_id: 'order-1' } },
  { label: 'admin/invoices.js PATCH', permission: 'invoices:update', handler: adminInvoicesPatch, method: 'PATCH', url: 'https://local.test/api/admin/invoices', params: {}, body: { id: 'inv-1' } },
  { label: 'admin/bank-accounts.js POST', permission: 'bank_accounts:manage', handler: adminBankAccountsPost, method: 'POST', url: 'https://local.test/api/admin/bank-accounts', params: {}, body: { bank_name: 'Test Bank', account_holder: 'Test Holder', iban: 'TR330006100519786457841326' } },
  { label: 'admin/bank-accounts.js PATCH', permission: 'bank_accounts:manage', handler: adminBankAccountsPatch, method: 'PATCH', url: 'https://local.test/api/admin/bank-accounts', params: {}, body: { id: 'bank-1' } }
];

test('A1.2c: non-authorized admin cannot access finance read endpoints (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, url, params } of A1_2C_FINANCE_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'unknown@example.com'), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: non-authorized admin cannot call finance mutation endpoints (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, method, url, params, body } of A1_2C_FINANCE_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'unknown@example.com', body), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: owner (permissions [\'*\']) can access finance read endpoints', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, url, params } of A1_2C_FINANCE_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'cankolsun@gmail.com'), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: owner (permissions [\'*\']) can call finance mutation endpoints', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, method, url, params, body } of A1_2C_FINANCE_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'cankolsun@gmail.com', body), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: read-only finance permission cannot perform the finance mutation (read does not imply write)', async () => {
  const restore = installAdminUsersFetch({ id: '6', email: 'accountant@cosmoskin.com.tr', role: 'accountant', role_code: 'accountant', permissions: ['invoices:read'], is_active: true, status: 'active' });
  try {
    const res = await adminInvoicesPost({ request: adminMutationRequest('https://local.test/api/admin/invoices', 'POST', 'accountant@cosmoskin.com.tr', { order_id: 'order-1' }), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403, 'a caller holding only invoices:read must not be able to perform the invoices:update mutation');
  } finally { restore(); }
});

test('A1.2c: a finance mutation permission does not accidentally unlock the file\'s unrelated GET/read route', async () => {
  const restore = installAdminUsersFetch({ id: '7', email: 'writer@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: ['invoices:update'], is_active: true, status: 'active' });
  try {
    const res = await adminInvoicesGet({ request: adminReadRequest('https://local.test/api/admin/invoices', 'writer@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403, 'a caller holding only invoices:update must not be able to pass the separate invoices:read gate');
  } finally { restore(); }
});

test('A1.2c: high-caution finance endpoints keep their business-logic markers alongside the new permission gate', async () => {
  const refundsSrc = await fs.readFile(path.join(root, 'functions/api/admin/refunds.js'), 'utf8');
  const invoicesSrc = await fs.readFile(path.join(root, 'functions/api/admin/invoices.js'), 'utf8');
  const bankAccountsSrc = await fs.readFile(path.join(root, 'functions/api/admin/bank-accounts.js'), 'utf8');
  for (const marker of ['STATUSES', 'provider_reference', 'reverseOrderPoints', 'return_requests', 'sendCommerceTransactionalEmail']) {
    assert.match(refundsSrc, new RegExp(marker), `admin/refunds.js: business-logic marker '${marker}' must remain present alongside the A1.2c permission gate`);
  }
  for (const marker of ['TYPES', 'STATUSES', 'provider_reference', 'invoice_number', 'pdf_url', 'order_status_events']) {
    assert.match(invoicesSrc, new RegExp(marker), `admin/invoices.js: business-logic marker '${marker}' must remain present alongside the A1.2c permission gate`);
  }
  for (const marker of ['normalizeBankAccount', 'validateBankAccount', 'toDbPayload', 'sort_order']) {
    assert.match(bankAccountsSrc, new RegExp(marker), `admin/bank-accounts.js: business-logic marker '${marker}' must remain present alongside the A1.2c permission gate`);
  }
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
