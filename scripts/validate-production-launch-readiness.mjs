#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, normalize } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const has = (file) => existsSync(join(root, file));
const read = (file) => readFileSync(join(root, file), 'utf8');
const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);

function walk(dir, out = []) {
  if (!has(dir)) return out;
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules' || name === '.git' || name === '__MACOSX') continue;
    const rel = relative(root, join(root, dir, name)).replace(/\\/g, '/');
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const requiredPages = [
  'index.html',
  'allproducts.html',
  'brands.html',
  'cart.html',
  'checkout.html',
  'payment/success.html',
  'routine.html',
  'account/profile.html',
  'hakkimizda.html',
  'contact.html',
  'odeme-ve-guvenlik.html',
  'legal/on-bilgilendirme-formu.html',
  'legal/mesafeli-satis-sozlesmesi.html',
  'legal/kvkk-aydinlatma-metni.html',
  'legal/cerez-politikasi.html',
  'legal/iade-ve-cayma-politikasi.html',
  'legal/teslimat-ve-kargo.html',
  'legal/uyelik-sozlesmesi.html',
  'legal/cosmoskin-club-kurallari.html'
];
for (const file of requiredPages) if (!has(file)) addError(`Missing launch-critical page: ${file}`);

const requiredRuntimeFiles = [
  '_redirects',
  '_headers',
  'robots.txt',
  'sitemap.xml',
  '.env.example',
  'assets/app.js',
  'assets/checkout-flow.js',
  'assets/account-dashboard.js',
  'assets/pdp-professional.js',
  'assets/routine-data-model.js',
  'assets/skin-profile-store.js',
  'assets/js/smart-routine.js',
  'assets/routines.js',
  'functions/api/create-checkout.js',
  'functions/api/payment/bank-accounts.js',
  'functions/api/_lib/bank-accounts.js',
  'functions/api/_lib/order-email.js',
  'scripts/validate-cosmoskin-icons.mjs',
  'scripts/validate-pdp-routine-intelligence.mjs',
  'scripts/validate-legal-commerce-readiness.mjs',
  'scripts/validate-checkout-payment-email-e2e.mjs'
];
for (const file of requiredRuntimeFiles) if (!has(file)) addError(`Missing launch-critical runtime file: ${file}`);

const sitemap = has('sitemap.xml') ? read('sitemap.xml') : '';
const robots = has('robots.txt') ? read('robots.txt') : '';
const redirects = has('_redirects') ? read('_redirects') : '';
const headers = has('_headers') ? read('_headers') : '';
const envExample = has('.env.example') ? read('.env.example') : '';

for (const marker of ['https://www.cosmoskin.com.tr/', 'https://www.cosmoskin.com.tr/routine.html', 'https://www.cosmoskin.com.tr/odeme-ve-guvenlik.html', 'https://www.cosmoskin.com.tr/legal/on-bilgilendirme-formu.html', 'https://www.cosmoskin.com.tr/legal/mesafeli-satis-sozlesmesi.html', 'https://www.cosmoskin.com.tr/legal/kvkk-aydinlatma-metni.html', 'https://www.cosmoskin.com.tr/legal/cerez-politikasi.html']) {
  if (!sitemap.includes(marker)) addError(`Sitemap missing canonical launch URL: ${marker}`);
}
for (const privatePath of ['/checkout.html', '/cart.html', '/account/', '/admin/', '/auth/', '/payment/success.html']) {
  if (sitemap.includes(privatePath)) addError(`Sitemap contains private/noindex route: ${privatePath}`);
}
for (const bad of ['pages.dev', 'staging.cosmoskin', 'cosmoskin.pages.dev']) {
  if (sitemap.includes(bad)) addError(`Sitemap contains staging/dev host: ${bad}`);
}
if (!robots.includes('Sitemap: https://www.cosmoskin.com.tr/sitemap.xml')) addError('robots.txt does not point to production sitemap.');
if (!robots.includes('Disallow: /admin/')) addWarning('robots.txt does not explicitly disallow /admin/.');

for (const route of ['/api/*', '/admin/*', '/account/*', '/checkout.html', '/payment/*']) {
  if (!headers.includes(route)) addError(`_headers missing sensitive cache/noindex block: ${route}`);
}
if (!headers.includes('X-Content-Type-Options: nosniff')) addError('_headers missing nosniff security header.');
if (!headers.includes('Content-Security-Policy-Report-Only')) addWarning('_headers lacks CSP report-only policy.');

for (const marker of ['/kvkk.html /legal/kvkk-aydinlatma-metni.html 301', '/cerez-politikasi.html /legal/cerez-politikasi.html 301', '/account/routines.html          /account/routines/']) {
  if (!redirects.includes(marker)) addError(`_redirects missing expected launch alias/route: ${marker}`);
}
if (/\/api\/.*\s+\/.*\.html/.test(redirects)) addError('_redirects appears to route /api/* to static HTML.');

if (/eyJ[A-Za-z0-9_-]{20,}\.|sk_(live|test)|service_role_[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]{30,}/.test(envExample)) {
  addError('.env.example appears to contain a real-looking secret token.');
}
for (const marker of ['SUPABASE_URL=', 'SUPABASE_SERVICE_ROLE_KEY=', 'SUPABASE_ANON_KEY=', 'BREVO_API_KEY=', 'ORDER_FROM_EMAIL=siparis@cosmoskin.com.tr', 'CONTACT_FROM_EMAIL=destek@cosmoskin.com.tr', 'ADMIN_SESSION_SECRET=']) {
  if (!envExample.includes(marker)) addError(`.env.example missing expected env marker: ${marker}`);
}

const htmlScanFiles = [
  ...walk('.').filter((file) => file.endsWith('.html') && !file.startsWith('snippets/') && !file.startsWith('__MACOSX/') && file !== 'supabase-email-template.html')
];
const clientScanFiles = [
  ...walk('assets').filter((file) => /\.(js|mjs)$/.test(file)),
  ...htmlScanFiles
];
const runtimeScanFiles = [
  'checkout.html', 'cart.html', 'payment/success.html', 'odeme-ve-guvenlik.html',
  'assets/checkout-flow.js', 'assets/app.js', 'assets/account-dashboard.js', 'assets/pdp-professional.js',
  'functions/api/create-checkout.js', 'functions/api/payment/bank-accounts.js', 'functions/api/_lib/bank-accounts.js', 'functions/api/_lib/order-email.js',
  ...walk('email-previews').filter((file) => file.endsWith('.html'))
].filter((file, index, arr) => has(file) && arr.indexOf(file) === index);

for (const file of htmlScanFiles) {
  const source = read(file);
  if (/rel=["']canonical["'][^>]*(pages\.dev|staging\.cosmoskin|cosmoskin\.pages\.dev)|(?:pages\.dev|staging\.cosmoskin|cosmoskin\.pages\.dev)/i.test(source)) {
    addError(`HTML contains staging/dev canonical or URL: ${file}`);
  }
}
for (const file of clientScanFiles) {
  const source = read(file);
  if (/SUPABASE_SERVICE_ROLE|service[_-]?role|SERVICE_ROLE_KEY/i.test(source)) addError(`Client/static file references service role key pattern: ${file}`);
}
for (const file of runtimeScanFiles) {
  const source = read(file);
  if (/TR84\s*0006|TR70\s*0006|TR840006|TR700006/.test(source)) addError(`Runtime/preview file contains hardcoded IBAN: ${file}`);
  if (/COSMOSKIN BEAUTY/.test(source)) addError(`Runtime/preview file contains fixed test customer name: ${file}`);
  if (/0531\s*217\s*32\s*00/.test(source)) addError(`Runtime/preview file contains public phone number: ${file}`);
  if (/\bTCKN\b/.test(source)) addError(`Runtime/preview file surfaces TCKN acronym: ${file}`);
  if (/example\.com|test firma|lorem|dummy/i.test(source)) addWarning(`Placeholder-like token found in scoped file: ${file}`);
}

const publicTextFiles = [
  ...['index.html','allproducts.html','brands.html','routine.html','cart.html','checkout.html','payment/success.html','account/profile.html','odeme-ve-guvenlik.html','cosmoskin-club.html','contact.html'].filter(has),
  ...walk('legal').filter((file) => file.endsWith('.html')),
  ...walk('products').filter((file) => file.endsWith('.html')).slice(0, 37)
];
for (const file of publicTextFiles) {
  const source = read(file);
  if (/\b(Select|Silver)\b/.test(source)) addError(`Old COSMOSKIN Club level name found: ${file}`);
  if (/kapıda ödeme (vardır|aktif|seçeneği|ile ödeme alınır)/i.test(source)) addError(`Potential cash-on-delivery promise found: ${file}`);
}

const checkoutFlow = has('assets/checkout-flow.js') ? read('assets/checkout-flow.js') : '';
for (const marker of ['name="legalPreInformation"', 'name="legalDistanceSales"', 'name="legalPrivacy"', 'name="marketingEmailOptIn"', '/payment/bank-accounts', 'data-copy-iban data-iban=', 'data-copy-iban data-iban=']) {
  if (!checkoutFlow.includes(marker)) addError(`Checkout flow missing launch marker: ${marker}`);
}
if (/window\.COSMOSKIN_BANK_TRANSFER|COSMOSKIN_CONFIG\.bankAccounts|checkout\.bankTransfer/.test(checkoutFlow)) addError('Checkout flow still reads a static bank-account fallback.');

const createCheckout = has('functions/api/create-checkout.js') ? read('functions/api/create-checkout.js') : '';
for (const marker of ['validateCheckoutConsents', 'preliminary_information_accepted', 'distance_sales_accepted', 'kvkk_acknowledged', 'getValidatedBankAccounts', 'BANK_ACCOUNT_NOT_CONFIGURED', 'reserveInventoryForOrder', 'checkout_idempotency_key']) {
  if (!createCheckout.includes(marker)) addError(`Create checkout missing launch marker: ${marker}`);
}
if (!/identity_number:\s*paymentMethod === 'card' \? customer\.identity_number : null/.test(createCheckout)) addError('Create checkout does not explicitly limit identity number persistence to card payments.');

const orderEmail = has('functions/api/_lib/order-email.js') ? read('functions/api/_lib/order-email.js') : '';
for (const marker of ['bankAccountsBlock(bankAccounts, order)', 'Havale/EFT banka bilgileri bu e-postaya eklenemedi', 'destek@cosmoskin.com.tr']) {
  if (!orderEmail.includes(marker)) addError(`Order email helper missing launch marker: ${marker}`);
}
if (/Takip No:\s*\$\{shipment\.tracking_number\}/.test(orderEmail) && !orderEmail.includes('if (shipment.tracking_number)')) {
  addError('Order email may render a tracking number without guarding its presence.');
}

const bankLib = has('functions/api/_lib/bank-accounts.js') ? read('functions/api/_lib/bank-accounts.js') : '';
const bankEndpoint = has('functions/api/payment/bank-accounts.js') ? read('functions/api/payment/bank-accounts.js') : '';
if (/FALLBACK_BANK_ACCOUNTS|fallbackAccounts|fallback:\s*true|güvenli COSMOSKIN yedeği/i.test(bankLib + bankEndpoint)) {
  addError('Bank account runtime contains fallback-bank behavior.');
}

const migrationFiles = walk('supabase/migrations').filter((file) => file.endsWith('.sql'));
const migrationText = migrationFiles.map(read).join('\n');
for (const marker of ['payment_bank_accounts', 'customer_skin_profiles', 'customer_routine_results', 'reserve_order_inventory', 'release_order_inventory']) {
  if (!migrationText.includes(marker)) addError(`Supabase migrations missing expected marker: ${marker}`);
}
if (!migrationFiles.some((file) => file.includes('20260702_routine_data_sync'))) addError('Routine data sync migration is missing from migration folder.');

const productPages = walk('products').filter((file) => file.endsWith('.html'));
if (productPages.length < 30) addError(`Unexpectedly low product page count: ${productPages.length}`);
for (const file of productPages.slice(0, 37)) {
  const source = read(file);
  if (!source.includes('/assets/pdp-professional.js')) addError(`Product page missing PDP professional asset: ${file}`);
  if (!source.includes('rel="canonical"')) addError(`Product page missing canonical: ${file}`);
}

const assetMissing = [];
const linkFiles = [...htmlScanFiles].filter((file) => !file.startsWith('snippets/'));
for (const file of linkFiles) {
  const source = read(file);
  for (const match of source.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const url = match[1].trim();
    if (!url || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) continue;
    let rel = url.split('?')[0].split('#')[0];
    if (!rel) continue;
    if (rel.startsWith('/api/')) continue;
    if (rel.startsWith('/')) rel = rel.slice(1);
    else rel = normalize(join(dirname(file), rel)).replace(/\\/g, '/');
    if (rel.endsWith('/')) rel += 'index.html';
    if (!has(rel)) assetMissing.push(`${file} -> ${url}`);
  }
}
if (assetMissing.length) addError(`Missing local href/src targets detected:\n${assetMissing.slice(0, 10).join('\n')}`);

if (errors.length) {
  console.error('COSMOSKIN production launch readiness validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) {
    console.error('Warnings:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log(`COSMOSKIN production launch readiness validation passed: ${requiredPages.length} critical pages, ${productPages.length} product pages, ${migrationFiles.length} migrations checked.`);
if (warnings.length) {
  console.log('Non-blocking warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
