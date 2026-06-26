import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(qaDir, '..');
const evidenceDir = path.join(qaDir, 'evidence');
const screenshotsDir = path.join(evidenceDir, 'screenshots');
await fs.mkdir(screenshotsDir, { recursive: true });

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright-core'); } catch {}
  const explicit = process.env.COSMOSKIN_PLAYWRIGHT_CORE;
  if (!explicit) throw new Error('playwright-core bulunamadı. `cd qa && npm install` çalıştırın veya COSMOSKIN_PLAYWRIGHT_CORE belirtin.');
  return (await import(pathToFileURL(explicit).href)).default;
}
const { chromium } = await loadPlaywright();

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff2':'font/woff2' };
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? '/index.html' : decoded;
  const target = path.resolve(root, `.${relative}`);
  return target.startsWith(root) ? target : null;
}
const server = http.createServer(async (req, res) => {
  try {
    const target = safePath(req.url || '/');
    if (!target) { res.writeHead(403); return res.end('Forbidden'); }
    let file = target;
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isDirectory()) file = path.join(file, 'index.html');
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type':'text/plain; charset=utf-8' }); res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const productFiles = await fs.readdir(path.join(root, 'products'));
const productSlugs = productFiles.filter((name) => name.endsWith('.html')).map((name) => name.replace(/\.html$/,''));
const inventoryRows = (slugs = productSlugs) => slugs.filter(Boolean).map((slug) => ({ product_slug:slug, available_stock:8, in_stock:true, low_stock:false, status:'active', allow_backorder:false }));
const validBank = { id:'00000000-0000-4000-8000-000000000001', bankName:'Test Bankası', accountName:'COSMOSKIN TEST HESABI', iban:'TR330006100519786457841326', branch:'Test Şube', currency:'TRY', active:true, sortOrder:0 };
const cartFixture = [{ id:'beauty-of-joseon-relief-sun-spf50', slug:'beauty-of-joseon-relief-sun-spf50', name:'Relief Sun: Rice + Probiotics SPF 50+ PA++++', brand:'Beauty of Joseon', price:899, image:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp', url:'/products/beauty-of-joseon-relief-sun-spf50.html', qty:1 }];

const results = [];
let assertions = 0;
let failures = 0;
function record(test, passed, details = {}, related = []) {
  assertions += 1;
  if (!passed) failures += 1;
  results.push({ test, passed, details, relatedAuditIds:related });
}
function assert(test, condition, details = {}, related = []) { record(test, Boolean(condition), details, related); }

async function launchBrowser() {
  return chromium.launch({
    headless:true,
    executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-gpu-compositing','--use-gl=swiftshader'],
    timeout:30000
  });
}
let matrixBrowser = null;

const viewports = [
  {name:'360x800',width:360,height:800},{name:'390x844',width:390,height:844},{name:'430x932',width:430,height:932},
  {name:'768x1024',width:768,height:1024},{name:'1024x768',width:1024,height:768},{name:'1366x768',width:1366,height:768},{name:'1440x900',width:1440,height:900}
];

const flowFilter = String(process.env.QA_FLOW_FILTER || '').trim();
const viewportFilter = String(process.env.QA_VIEWPORT_FILTER || '').trim();
function shouldRunFlow(name){ return !flowFilter || flowFilter.split(',').map((v)=>v.trim()).includes(name); }

const matrixPages = [
  ['homepage','/index.html'],['listing','/allproducts.html'],['pdp','/products/beauty-of-joseon-relief-sun-spf50.html'],
  ['cart','/cart.html'],['checkout','/checkout.html'],['smart-routine','/account/routines/'],['account','/account/index.html'],
  ['admin','/admin/index.html'],['payment-success','/payment/success.html'],['payment-failure','/payment/failure.html'],['legal','/legal/kvkk-aydinlatma-metni.html']
];

async function installRoutes(page, mode = {}) {
  await page.addInitScript(({cart, user}) => {
    localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
    localStorage.setItem('cosmoskin_consent', JSON.stringify({essential:true,analytics:false}));
    localStorage.setItem('cosmoskin_cookie_prefs_v1', JSON.stringify({analytics:false}));
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText: async (value) => { window.__copiedIban = value; } } });
    window.__COSMOSKIN_QA_USER = user;
  }, { cart:cartFixture, user:null });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') {
      if (!url.pathname.startsWith('/api/')) {
        if (request.resourceType() === 'image') return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>'});
        return route.continue();
      }
      const json = (body, status=200) => route.fulfill({ status, contentType:'application/json; charset=utf-8', headers:{'cache-control':'no-store'}, body:JSON.stringify(body) });
      if (url.pathname === '/api/inventory' && request.method() === 'GET') {
        if (mode.inventoryUnavailable) return json({ok:false,code:'INVENTORY_SERVICE_UNAVAILABLE',error:'Stok servisi test kesintisi.'},503);
        const requested = String(url.searchParams.get('product_slugs') || '').split(',').filter(Boolean);
        const slugs = requested.length ? requested : productSlugs;
        return json({ok:true,inventory:inventoryRows(slugs),missing:[]});
      }
      if (url.pathname === '/api/inventory/check') {
        if (mode.inventoryUnavailable) return json({ok:false,code:'INVENTORY_SERVICE_UNAVAILABLE',error:'Stok servisi test kesintisi.'},503);
        const body = request.postDataJSON?.() || {};
        return json({ok:true,items:(body.items || []).map((item) => ({product_slug:item.product_slug,quantity:item.quantity,available_stock:8,can_purchase:true,message:'Stokta'}))});
      }
      if (url.pathname === '/api/payment/bank-accounts') {
        return mode.missingBank ? json({ok:true,configured:false,account:null,accounts:[],message:'Havale/EFT ödeme bilgileri henüz kullanıma hazır değil.'}) : json({ok:true,configured:true,account:validBank,accounts:[validBank]});
      }
      if (url.pathname === '/api/coupons/validate') {
        const body = request.postDataJSON?.() || {};
        if (String(body.code || '').toUpperCase() === 'EXPIRED') return json({ok:false,error:'Kupon süresi doldu.'},400);
        if (String(body.code || '').toUpperCase() !== 'FREESHIP') return json({ok:false,error:'Kupon bulunamadı veya aktif değil.'},404);
        const subtotal = 899;
        return json({ok:true,code:'FREESHIP',title:'Ücretsiz Kargo',type:'free_shipping',freeShipping:true,discountAmount:0,shippingAmount:0,totalAmount:subtotal,discountLabel:'Ücretsiz kargo',minSubtotal:0});
      }
      if (url.pathname === '/api/create-checkout') {
        const body = request.postDataJSON?.() || {};
        if (body.payment_method === 'bank_transfer') {
          if (mode.missingBank) return json({ok:false,code:'BANK_ACCOUNT_UNAVAILABLE',error:'Havale/EFT ödeme bilgileri doğrulanamadı. Sipariş oluşturulmadı.'},503);
          return json({ok:true,orderId:'11111111-1111-4111-8111-111111111111',orderNumber:'CS-LOCAL-0001',paymentMethod:'bank_transfer',paymentStatus:'awaiting_transfer',bankAccount:validBank,paymentDeadline:'2026-06-19T12:00:00.000Z'});
        }
        return json({ok:true,orderId:'22222222-2222-4222-8222-222222222222',orderNumber:'CS-LOCAL-0002',checkoutFormContent:'<div id="iyzipay-checkout-form" role="region" aria-label="iyzico güvenli ödeme formu">Güvenli iyzico ödeme formu test yer tutucusu</div>'});
      }
      if (url.pathname.includes('/api/reviews')) return json({ok:true,reviews:[],summary:{count:0,average:0}});
      if (url.pathname.includes('/api/order-tracking')) return json({ok:false,error:'Sipariş bilgileri doğrulanamadı.'},404);
      if (url.pathname.includes('/api/admin/session')) return json({ok:true,token:'v1.9999999999.localtestsignature',expiresAt:'2099-01-01T00:00:00Z'});
      if (url.pathname.startsWith('/api/admin/')) return json({ok:true,orders:[],products:[],inventory:[],summary:{},accounts:[]});
      if (url.pathname.includes('/api/account/') || url.pathname.includes('/api/get-orders')) return json({ok:true,orders:[],addresses:[],profile:null});
      return json({ok:true});
    }
    if (url.hostname.includes('jsdelivr') && url.pathname.includes('supabase')) {
      const clientFactory = `()=>({auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),signInWithPassword:async()=>({data:{user:{id:'local'}},error:null}),signUp:async()=>({data:{user:{id:'local'}},error:null}),resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null}),signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:null,error:null})})})`;
      const isEsm = url.pathname.includes('+esm');
      const body = isEsm
        ? `export const createClient=${clientFactory}; if(typeof window!=='undefined'){window.supabase={createClient};} export default {createClient};`
        : `window.supabase={createClient:${clientFactory}};`;
      return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body});
    }
    if (request.resourceType() === 'stylesheet') return route.fulfill({status:200,contentType:'text/css',body:''});
    if (request.resourceType() === 'script') return route.fulfill({status:200,contentType:'text/javascript',body:''});
    return route.fulfill({status:204,body:''});
  });
}

async function inspectPage(viewport, pageName, urlPath) {
  let page;
  try { page = await matrixBrowser.newPage({ viewport:{width:viewport.width,height:viewport.height} }); page.setDefaultTimeout(4000); page.setDefaultNavigationTimeout(12000); } catch (error) { assert(`matrix:${viewport.name}:${pageName}`, false, {url:urlPath,navigationError:error.message}, ['CS-P2-019','CS-P2-021','CS-P2-022']); return; }
  const pageErrors=[]; const consoleErrors=[]; const failedRequests=[];
  page.on('pageerror', (error)=>pageErrors.push(error.message));
  page.on('console', (message)=>{ if(message.type()==='error') consoleErrors.push(message.text()); });
  page.on('requestfailed', (request)=>{ const u=request.url(); if(u.startsWith(base)) failedRequests.push({url:u,error:request.failure()?.errorText||''}); });
  await installRoutes(page);
  let navigationError=null;
  try { await page.goto(base + urlPath, {waitUntil:'domcontentloaded',timeout:30000}); await page.waitForTimeout(500); } catch(error) { navigationError=error.message; }
  const metrics = navigationError ? null : await page.evaluate(() => {
    const visible = (el) => { const r=el.getBoundingClientRect(); const st=getComputedStyle(el); return st.display!=='none' && st.visibility!=='hidden' && Number(st.opacity||1)>0 && r.width>0 && r.height>0 && r.right>0 && r.bottom>0 && r.left<innerWidth && r.top<innerHeight; };
    const unnamed = Array.from(document.querySelectorAll('button,a[href],input,select,textarea')).filter(visible).filter((el)=>{
      const name=(el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||el.value||'').trim();
      return !name && !el.querySelector('img[alt]:not([alt=""])');
    }).length;
    const inputsClipped = Array.from(document.querySelectorAll('input,select,textarea')).filter(visible).filter((el)=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1;}).length;
    return {scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,h1:document.querySelectorAll('h1').length,unnamedVisibleControls:unnamed,inputsClipped};
  });
  const passed = !navigationError && metrics && metrics.scrollWidth <= metrics.clientWidth + 2 && pageErrors.length===0 && failedRequests.length===0 && metrics.inputsClipped===0 && metrics.h1===1;
  const id=`matrix:${viewport.name}:${pageName}`;
  assert(id, passed, {url:urlPath,navigationError,metrics,pageErrors,consoleErrors:consoleErrors.filter((v,i,a)=>a.indexOf(v)===i).slice(0,10),failedRequests}, ['CS-P2-019','CS-P2-021','CS-P2-022','CS-P2-024','CS-P2-027','CS-P3-033','CS-P3-034']);
  if (!passed) await page.screenshot({path:path.join(screenshotsDir,`${viewport.name}-${pageName}.png`),fullPage:false}).catch(()=>{});
  await page.close().catch(()=>{});
}

let matrixCounter = 0;
const matrixLimit = Number(process.env.QA_MATRIX_LIMIT || 0);
const skipMatrix = process.env.QA_SKIP_MATRIX === '1';
if (!skipMatrix) for (const viewport of viewports) {
  if (viewportFilter && viewport.name !== viewportFilter) continue;
  matrixBrowser = await launchBrowser();
  try {
    for (const [pageName,urlPath] of matrixPages) {
      matrixCounter += 1;
      if (matrixLimit > 0 && matrixCounter > matrixLimit) break;
      console.log(`[browser-qa] ${matrixCounter}: ${viewport.name} ${pageName}`);
      await inspectPage(viewport,pageName,urlPath);
    }
  } finally {
    await Promise.race([matrixBrowser.close().catch(()=>{}),new Promise((resolve)=>setTimeout(resolve,2500))]);
    matrixBrowser = null;
  }
  if (matrixLimit > 0 && matrixCounter >= matrixLimit) break;
}

async function targeted(name, viewport, mode, fn, auditIds=[]) {
  let browser; let page; const errors=[]; const consoleErrors=[]; const failedRequests=[];
  try {
    console.log(`[browser-qa] flow: ${name}`);
    browser=await launchBrowser();
    page=await browser.newPage({viewport}); page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(15000);
    page.on('pageerror',(e)=>errors.push(e.message));
    page.on('console',(m)=>{if(m.type()==='error') consoleErrors.push(m.text());});
    page.on('requestfailed',(r)=>{if(r.url().startsWith(base)) failedRequests.push({url:r.url(),error:r.failure()?.errorText||''});});
    await installRoutes(page, mode);
    await fn(page);
    const passed=errors.length===0 && consoleErrors.length===0 && failedRequests.length===0;
    assert(`flow:${name}`, passed, {pageErrors:errors,consoleErrors,failedRequests}, auditIds);
  } catch(error) {
    assert(`flow:${name}`, false, {error:error.message,pageErrors:errors,consoleErrors,failedRequests}, auditIds);
    if (page) await page.screenshot({path:path.join(screenshotsDir,`flow-${name}.png`),fullPage:false}).catch(()=>{});
  } finally {
    if (page) await page.close().catch(()=>{});
    if (browser) await Promise.race([browser.close().catch(()=>{}),new Promise((resolve)=>setTimeout(resolve,2500))]);
  }
}

if (shouldRunFlow('mobile-menu-search-escape')) await targeted('mobile-menu-search-escape', {width:390,height:844}, {}, async(page)=>{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
  const toggle=page.locator('[data-cm-open-menu]:visible, #mobileToggle:visible').first(); await toggle.click();
  const menuVisible=await page.locator('.cm-mobile-drawer:visible, .cm-sheet:visible, .mobile-nav.open:visible, .mobile-menu.open:visible, [data-mobile-nav].open:visible').count();
  if(menuVisible===0) throw new Error('Mobil menü açılmadı.');
  await page.keyboard.press('Escape');
  const input=page.locator('.cm-searchbar input:visible, .site-search-input:visible').first(); await input.fill('torriden'); await page.waitForTimeout(450);
  const results=page.locator('.cs-live-search:visible, .site-search-results:not([hidden]):visible').first();
  if(await results.count()===0) throw new Error('Arama sonucu açılmadı.');
  await input.fill('zzzz-sonuc-yok'); await page.waitForTimeout(450);
  if(!(await results.innerText()).toLowerCase().includes('bulunamadı')) throw new Error('Arama boş durumu gösterilmedi.');
  await page.keyboard.press('Escape');
}, ['CS-P2-027']);

if (shouldRunFlow('pdp-quantity-favorite-cart')) await targeted('pdp-quantity-favorite-cart', {width:1366,height:768}, {}, async(page)=>{
  await page.goto(base+'/products/beauty-of-joseon-relief-sun-spf50.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900);
  const inc=page.locator('[data-pdp-quantity-inc]:visible'); if(await inc.count()!==1) throw new Error('PDP adet seçici oluşmadı.');
  await inc.click(); if((await page.locator('[data-pdp-quantity-value]').innerText()).trim()!=='2') throw new Error('Adet 2 olmadı.');
  const favorite=page.locator('.pdp5-favorite:visible'); await favorite.click(); if(await favorite.getAttribute('aria-pressed')!=='true') throw new Error('Favori durumu güncellenmedi.');
  await page.locator('.pdp5-actions [data-add-cart]:visible').click(); await page.waitForTimeout(400);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('cosmoskin_cart')||'[]'));
  if(!stored.some((item)=>item.id==='beauty-of-joseon-relief-sun-spf50' && Number(item.qty)>=2)) throw new Error('Seçili adet sepete aktarılmadı.');
}, ['CS-P1-014','CS-P2-028','CS-P0-003']);

if (shouldRunFlow('cart-quantity-remove-empty')) await targeted('cart-quantity-remove-empty', {width:1366,height:768}, {}, async(page)=>{
  await page.goto(base+'/cart.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
  const inc=page.locator('#cartItems [data-inc]:visible').first(); if(await inc.count()===0) throw new Error('Sepet miktar artırma kontrolü bulunamadı.');
  await inc.evaluate((el)=>el.click()); await page.waitForTimeout(200);
  await page.locator('#cartItems [data-remove]:visible').first().evaluate((el)=>el.click()); await page.waitForTimeout(150);
  if(!(await page.locator('#cartItems').innerText()).includes('boş')) throw new Error('Boş sepet durumu gösterilmedi.');
}, ['CS-P0-003','CS-P3-031']);

async function fillCheckoutDelivery(page) {
  const values={firstName:'Test',lastName:'Müşteri',email:'qa.user@cosmoskin.invalid',phone:'05551234567',address:'Test Mahallesi No: 1 Daire: 2',city:'İstanbul',district:'Maltepe',postalCode:'34840'};
  for(const [name,value] of Object.entries(values)){const input=page.locator(`#csCheckoutContent [name="${name}"]`).first(); if(await input.count()) await input.fill(value);}
}
if (shouldRunFlow('checkout-validation-free-shipping-card')) await targeted('checkout-validation-free-shipping-card', {width:1366,height:768}, {}, async(page)=>{
  await page.goto(base+'/checkout.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(600);
  await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(150);
  if(!(await page.locator('#csCheckoutStatus').innerText()).trim()) throw new Error('Eksik alan doğrulama geri bildirimi yok.');
  await fillCheckoutDelivery(page); await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(300);
  const coupon=page.locator('#csCouponInput'); await coupon.fill('FREESHIP'); await page.locator('#csCouponApply').click(); await page.waitForTimeout(200);
  const summary=await page.locator('#csCheckoutSummary').innerText(); if(!summary.toLowerCase().includes('ücretsiz')) throw new Error('Ücretsiz kargo önizlemesi uygulanmadı.');
  await page.locator('[data-payment-method="card"]').click();
  await page.locator('input[name="legalSales"]').check(); await page.locator('input[name="legalKvkk"]').check();
  await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(100); // payment -> review
  await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(400); // submit
  await page.waitForFunction(()=>document.querySelector('#csCheckoutStatus')?.textContent?.toLocaleLowerCase('tr-TR').includes('güvenli ödeme formu hazırlandı'),null,{timeout:3000}).catch(()=>{});
  const paymentStatus=(await page.locator('#csCheckoutStatus').textContent()||'').toLocaleLowerCase('tr-TR');
  if(!paymentStatus.includes('güvenli ödeme formu hazırlandı')) throw new Error('Hosted iyzico geçiş formu hazırlanmadı: '+paymentStatus);
  if(await page.locator('input[name*="card" i],input[autocomplete="cc-number"],input[autocomplete="cc-csc"]').count()!==0) throw new Error('Yerel kart verisi alanı hâlâ mevcut.');
}, ['CS-P0-004','CS-P1-006','CS-P1-009','CS-P2-025']);

if (shouldRunFlow('checkout-eft-valid-bank-copy')) await targeted('checkout-eft-valid-bank-copy', {width:1366,height:768}, {}, async(page)=>{
  await page.goto(base+'/checkout.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(600); await fillCheckoutDelivery(page); await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(250);
  await page.locator('[data-payment-method="bank_transfer"]').click(); await page.waitForTimeout(250);
  if(!(await page.locator('.cs-checkout-bank-panel').innerText()).includes('TR330006100519786457841326')) throw new Error('Doğrulanmış IBAN görünmedi.');
  await page.locator('[data-copy-iban]').click(); if(await page.evaluate(()=>window.__copiedIban)!=='TR330006100519786457841326') throw new Error('Normalize IBAN panoya kopyalanmadı.');
  await page.locator('input[name="legalSales"]').check(); await page.locator('input[name="legalKvkk"]').check(); await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(100); await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(300);
  if(!(await page.locator('#csCheckoutContent').innerText()).includes('CS-LOCAL-0001')) throw new Error('EFT başarı ekranı sipariş numarasını göstermedi.');
}, ['CS-P0-001','CS-P1-007','CS-P1-016']);

if (shouldRunFlow('checkout-eft-missing-bank-blocked')) await targeted('checkout-eft-missing-bank-blocked', {width:1366,height:768}, {missingBank:true}, async(page)=>{
  await page.goto(base+'/checkout.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(600); await fillCheckoutDelivery(page); await page.locator('#csCheckoutAction:visible').click({force:true}); await page.waitForTimeout(250);
  await page.locator('[data-payment-method="bank_transfer"]').click(); await page.waitForTimeout(250);
  const action=page.locator('#csCheckoutAction'); if(!(await action.isDisabled())) throw new Error('Banka hesabı eksikken EFT submit aktif.');
  const bankCopy=(await page.locator('.cs-checkout-bank-panel').innerText()).toLocaleLowerCase('tr-TR'); if(!(bankCopy.includes('kullanıma hazır değil') || bankCopy.includes('oluşturulam'))) throw new Error('Eksik banka hesabı açıklaması yok: '+bankCopy);
}, ['CS-P0-001']);

if (shouldRunFlow('smart-routine-six-step-back-restart-add')) await targeted('smart-routine-six-step-back-restart-add', {width:1366,height:768}, {}, async(page)=>{
  await page.goto(base+'/account/routines/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900);
  const skin=page.locator('[data-sr-skins] button:visible').first(); if(await skin.count()) await skin.click();
  await page.locator('[data-wizard-next]').click();
  const goal=page.locator('[data-sr-goals] button:visible').first(); if(await goal.count()) await goal.click();
  await page.locator('[data-wizard-next]').click();
  await page.locator('[data-wizard-sensitivity="orta"]').click(); await page.locator('[data-wizard-next]').click();
  await page.locator('[data-wizard-experience="baslangic"]').click(); await page.locator('[data-wizard-back]').click();
  if((await page.locator('[data-wizard-progress-text]').innerText()).startsWith('3')===false) throw new Error('Geri adımı çalışmadı.');
  await page.locator('[data-wizard-next]').click(); await page.locator('[data-wizard-experience="baslangic"]').click(); await page.locator('[data-wizard-next]').click();
  await page.locator('[data-wizard-preference="tam"]').click(); await page.locator('[data-wizard-next]').click(); await page.waitForTimeout(700);
  if(!(await page.locator('[data-wizard-progress-text]').innerText()).startsWith('6')) throw new Error('Altı adımlı sonuç aşamasına geçilmedi.');
  const add=page.locator('[data-sr-add-all]').first(); if(await add.count()){await add.click(); await page.waitForTimeout(400);}
  await page.locator('[data-wizard-restart]').click(); if(!(await page.locator('[data-wizard-progress-text]').innerText()).startsWith('1')) throw new Error('Baştan başlatma çalışmadı.');
  const copy=((await page.locator('body').textContent())||'').toLocaleLowerCase('tr-TR'); if(!(copy.includes('patch test') || copy.includes('yama testi')) || !copy.includes('tıbbi tavsiye')) throw new Error('Güvenli kullanım uyarıları eksik.');
}, ['CS-P0-005','CS-P1-011','CS-P1-012','CS-P1-013']);

if (shouldRunFlow('auth-login-register-reset-pages')) await targeted('auth-login-register-reset-pages', {width:1366,height:768}, {}, async(page)=>{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(600); await page.locator('#accountBtn:visible').click();
  await page.locator('#accountDrawer.open [data-open-auth]:visible').first().click(); await page.waitForTimeout(150);
  if(await page.locator('#accountModal.open #loginForm:visible').count()!==1) throw new Error('Giriş formu açılmadı.');
  await page.locator('#accountModal.open [data-tab="registerPanel"]:visible').click(); if(await page.locator('#accountModal.open #registerForm:visible').count()!==1) throw new Error('Kayıt formu yok.');
  await page.goto(base+'/auth/reset.html',{waitUntil:'domcontentloaded'}); if(await page.locator('h1').count()!==1) throw new Error('Şifre sıfırlama sayfası tek H1 içermiyor.');
}, ['CS-P2-024']);

if (shouldRunFlow('admin-login-overflow')) await targeted('admin-login-overflow', {width:390,height:844}, {}, async(page)=>{
  await page.goto(base+'/admin/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
  if(await page.locator('meta[name="robots"][content*="noindex"]').count()!==1) throw new Error('Admin noindex eksik.');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth); if(overflow>2) throw new Error(`Admin yatay taşma: ${overflow}px`);
}, ['CS-P1-008','CS-P1-009','CS-P2-026','CS-P3-033']);

server.closeAllConnections?.();
await new Promise((resolve)=>server.close(resolve));
const summary={ generatedAt:new Date().toISOString(), environment:{browser:'Chromium',executable:process.env.CHROMIUM_PATH||'/usr/bin/chromium',baseUrl:base,mocks:'Local deterministic API and Supabase browser fixtures; no external production services'}, viewports, matrixPages:matrixPages.map(([name,url])=>({name,url})), assertions,passed:assertions-failures,failed:failures,results };
await fs.writeFile(path.join(evidenceDir,'browser-qa-results.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({assertions,passed:assertions-failures,failed:failures,evidence:path.join(evidenceDir,'browser-qa-results.json')},null,2));
process.exit(failures?1:0);
