#!/usr/bin/env node
// UX3B — Storefront polish hotfix validator.
// Guards: (1) mini cart close button works via delegation + premium semantics,
// (2) PDP price hydration (no stale static price flash, add-to-cart guard,
// ready marking, reviews-shell exclusion), (3) account header parity with the
// homepage header, (4) no duplicate price injection under the PDP
// recommendations, (5) products.json + commerce/admin logic untouched.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const files = {
  appJs: 'assets/app.js',
  phase6Js: 'assets/phase6-commerce.js',
  phase6Css: 'assets/phase6-commerce.css',
  pdpJs: 'assets/product-page.js',
  pdpCss: 'assets/product-page.css',
  accountCss: 'assets/account-premium.css',
  styleCss: 'assets/style.css'
};
for (const rel of Object.values(files)) {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
}
if (errors.length) {
  console.error('UX3B validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
const appJs = read(files.appJs);
const phase6Js = read(files.phase6Js);
const phase6Css = read(files.phase6Css);
const pdpJs = read(files.pdpJs);
const pdpCss = read(files.pdpCss);
const accountCss = read(files.accountCss);

function mustInclude(src, rel, needle, why = '') {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}${why ? ` (${why})` : ''}`);
}
function mustMatch(src, rel, regex, why = '') {
  if (!regex.test(src)) errors.push(`${rel} missing required pattern ${regex}${why ? ` (${why})` : ''}`);
}
function mustNotMatch(src, rel, regex, why = '') {
  const m = src.match(regex);
  if (m) errors.push(`${rel} forbidden pattern ${regex} → "${String(m[0]).slice(0, 90)}"${why ? ` (${why})` : ''}`);
}

// --- 1. Mini cart close: delegated handler + premium button semantics
mustMatch(appJs, files.appJs, /document\.addEventListener\('click',[\s\S]{0,200}closest\('\.close-any'\)/,
  'close buttons must be event-delegated so injected drawer headers keep working');
mustNotMatch(appJs, files.appJs, /\$\$\('\.close-any'\)\.forEach\(\(btn\) => btn\.addEventListener/,
  'the per-node .close-any binding misses dynamically injected buttons');
mustMatch(appJs, files.appJs, /const btn = event\.target\.closest\('\.close-any'\);[\s\S]{0,120}closeDrawers\(\)/, 'delegated close must call closeDrawers');
mustInclude(phase6Js, files.phase6Js, 'cart-drawer-premium__close icon-close close-any', 'close button keeps binding + premium classes');
mustInclude(phase6Js, files.phase6Js, 'aria-label="Sepeti kapat"');
mustMatch(phase6Js, files.phase6Js, /cart-drawer-premium__close[^>]*type="button"/);
mustMatch(phase6Js, files.phase6Js, /cart-drawer-premium__close[^>]*>\s*<svg/, 'premium SVG close icon, not a bare text ×');
mustMatch(phase6Css, files.phase6Css, /cart-drawer-premium__close svg\{[^}]*width:1[3-8]px/, 'icon sized for optical centering');
mustMatch(phase6Css, files.phase6Css, /cart-drawer-premium__close:focus-visible\{[^}]*box-shadow/, 'visible focus ring');
mustMatch(phase6Css, files.phase6Css, /cart-drawer-premium__close:hover\{/, 'hover state');

// --- 2. PDP price hydration
mustInclude(pdpJs, files.pdpJs, "data-cs-price-hydrating", 'hydration state attribute');
mustInclude(pdpJs, files.pdpJs, 'markPdpPriceReady', 'ready marker');
mustMatch(pdpJs, files.pdpJs, /patchJsonLdOfferPrice\(price, currency\);\s*markPdpPriceReady\('patched'\)/, 'price ready is marked after the effective patch');
mustMatch(pdpJs, files.pdpJs, /priceReady = 'true'/, 'price nodes get data-price-ready');
mustInclude(pdpJs, files.pdpJs, 'PRICE_READY_TIMEOUT_MS', 'hard timeout fallback');
mustInclude(pdpJs, files.pdpJs, "markPdpPriceReady('static-fallback')", 'documented safe fallback when the API fails');
mustMatch(pdpJs, files.pdpJs, /await priceReadyPromise;[\s\S]{0,80}productFromButton/, 'buy-now must wait for price hydration');
mustInclude(pdpJs, files.pdpJs, 'holdPdpPurchaseButtons', 'add-to-cart held during hydration');
mustMatch(pdpJs, files.pdpJs, /data-price-waiting/, 'waiting attribute on purchase buttons');
// skeleton CSS keyed on the ready attribute with a pure-CSS reveal failsafe
mustMatch(pdpCss, files.pdpCss, /\.pdp5-price:not\(\[data-price-ready="true"\]\)/, 'main price skeleton until hydration');
mustMatch(pdpCss, files.pdpCss, /\.mobile-sticky-pdp__copy:not\(\[data-price-ready="true"\]\)/, 'sticky price skeleton until hydration');
mustMatch(pdpCss, files.pdpCss, /csPdpPriceReveal 0s linear 2\.[0-9]s forwards/, 'pure-CSS reveal failsafe so prices can never stay hidden');
mustMatch(pdpCss, files.pdpCss, /@keyframes csPdpPriceReveal\{[^}]*to\{[^}]*color:inherit/, 'reveal keyframe restores color');
// P1C4 core must remain: fetch + retries + products-updated repatch
mustInclude(pdpJs, files.pdpJs, "fetch('/api/catalog/effective-prices'");
mustInclude(pdpJs, files.pdpJs, 'cosmoskin:products-updated');
mustMatch(pdpJs, files.pdpJs, /setTimeout\(\(\) => \{ if \(lastEffective\) patchPdpPriceSurfaces\(lastEffective\); \}, 450\)/, 'P1C4 retry pass kept');
// JSON-LD must be fed the payable price and never compare-at
mustMatch(pdpJs, files.pdpJs, /const price = Number\(product && \(product\.price \?\? product\.effective_price_try/, 'payable price feeds all surfaces incl. JSON-LD');
mustNotMatch(pdpJs, files.pdpJs, /patchJsonLdOfferPrice\([^)]*compare_at/, 'JSON-LD must never use compare-at');
mustNotMatch(pdpJs, files.pdpJs, /price:\s*[^,\n]*compare_at_price_try(?!\s*\?\?)/, 'compare-at must never become payable');

// --- 3. Reviews-shell duplicate price exclusion
mustMatch(pdpJs, files.pdpJs, /node\.id === 'reviewsSection' \|\| node\.closest\('#reviewsSection'\)/,
  'the reviews shell carries data-product-price as DATA and must never receive injected price markup');

// --- 4. Account header parity with homepage
mustMatch(accountCss, files.accountCss, /\.account-page \.header\.account-header\{[\s\S]{0,400}height:74px/, 'account header must match the 74px Phase-8 homepage header');
mustNotMatch(accountCss, files.accountCss, /\.account-page \.header\.account-header\{[\s\S]{0,400}height:80px/, 'the 80px account header height diverged from home');
mustMatch(accountCss, files.accountCss, /account-header \.brand\{[^}]*gap:22px/, 'brand gap must match homepage (22px)');
mustMatch(accountCss, files.accountCss, /account-header \.brand \.brand-logo\{[^}]*width:46px[^}]*height:46px/, 'C+S logo must match homepage 46px');
// Desktop rules only — the ≤760/768px mobile blocks size the logo for the
// compact mobile header on purpose (homepage swaps to the cm-mobile header
// there, so there is no homepage counterpart to match).
mustNotMatch(accountCss, files.accountCss, /brand-logo\{display:block!important;width:3[0-9]px/, 'undersized desktop account logo (old 32px override)');
mustNotMatch(accountCss, files.accountCss, /brand-logo\{width:40px;height:40px/, 'stray 40px desktop logo variant');

// --- 5. products.json + protected commerce/admin files untouched
const productsDiff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((productsDiff.stdout || '').trim()) errors.push('products.json is modified — forbidden for UX3B');
const protectedFiles = [
  'functions/api/create-checkout.js', 'functions/api/coupons/validate.js',
  'functions/api/_lib/product-pricing.js', 'functions/api/_lib/order-pricing-snapshot.js',
  'functions/api/_lib/coupons.js', 'functions/api/_lib/inventory.js',
  'functions/api/admin/refunds.js', 'assets/checkout-flow.js', 'assets/coupon-client.js',
  'assets/cart-commerce.js', 'assets/inventory-client.js', 'assets/price-display.js',
  'functions/api/_lib/admin.js', 'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js', 'assets/admin-runtime.js',
  'functions/api/admin/products.js'
];
const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
for (const file of (dirty.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
  if (protectedFiles.includes(file)) errors.push(`UX3B must not modify commerce/admin-critical file: ${file}`);
}

// --- 6. Delegate fast regression suites (HF1 + UX3; heavier chains run in the release checklist)
for (const script of ['scripts/validate-hf1-runtime-commerce-hotfix.mjs', 'scripts/validate-ux3-minicart-premium-layout-hardening.mjs']) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${script} failed:\n${((result.stdout || '') + (result.stderr || '')).trim().slice(0, 400)}`);
}

if (errors.length) {
  console.error('COSMOSKIN UX3B storefront polish hotfix validation FAILED:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('UX3B storefront polish hotfix validation passed.');
