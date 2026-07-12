#!/usr/bin/env node
// UX3 — Mini cart drawer premium redesign + multi-item layout hardening validator.
// Guards the collision fix (no fixed/min row heights, no 31dvh trap, no conflicting
// !important layers), the premium drawer structure, sale-display safety, and the
// HF1/C3 commerce behavior the drawer depends on.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const files = {
  phase6Css: 'assets/phase6-commerce.css',
  phase6Js: 'assets/phase6-commerce.js',
  appJs: 'assets/app.js',
  masterCss: 'assets/master-upgrade.css',
  uatCss: 'assets/cosmoskin-final-uat-fix.css',
  styleCss: 'assets/style.css',
  priceCss: 'assets/price-display.css'
};
for (const rel of Object.values(files)) {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
}
if (errors.length) {
  console.error('UX3 validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripComments(read(files.phase6Css));
const js = read(files.phase6Js);
const appJs = read(files.appJs);
const masterCss = read(files.masterCss);
const uatCss = read(files.uatCss);

function mustInclude(src, rel, needle, why = '') {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}${why ? ` (${why})` : ''}`);
}
function mustNotMatch(src, rel, regex, why = '') {
  const m = src.match(regex);
  if (m) errors.push(`${rel} contains forbidden pattern ${regex} → "${String(m[0]).slice(0, 80)}"${why ? ` (${why})` : ''}`);
}

// --- 1. HF1: cartHasItems must remain defined and gate the drawer hooks
if ((js.match(/function cartHasItems\s*\(/g) || []).length !== 1) {
  errors.push('phase6-commerce.js: cartHasItems must be defined exactly once (HF1 regression)');
}
if (!/function setCartDrawerCommerceState[\s\S]{0,400}cartHasItems\(/.test(js)) {
  errors.push('phase6-commerce.js: setCartDrawerCommerceState no longer gates on cartHasItems');
}
mustInclude(js, files.phase6Js, 'coupon.hidden = !has', 'coupon block must un-hide when cart has items');

// --- 2. Collision root cause must stay dead: no fixed/min row heights, no dvh traps
// Scan every rule body that targets drawer cart items.
// Only rules whose final selector compound is .cart-item itself (not .cart-items,
// not descendants like `.cart-item img`).
const drawerItemRule = /#cartDrawer[^{}]*\.cart-item(?!s)(?:\.[\w-]+|:[\w()-]+)*\s*\{[^}]*\}/g;
for (const rule of css.match(drawerItemRule) || []) {
  if (/min-height\s*:\s*(?!0[;\s!}])[0-9]/.test(rule)) errors.push(`phase6-commerce.css: drawer .cart-item rule reintroduces a min-height row lock → ${rule.slice(0, 90)}`);
  if (/[^-\w]height\s*:\s*\d+px/.test(rule)) errors.push(`phase6-commerce.css: drawer .cart-item rule sets a fixed pixel height → ${rule.slice(0, 90)}`);
  if (/align-items\s*:\s*center/.test(rule)) errors.push(`phase6-commerce.css: drawer .cart-item rule uses align-items:center (collision pattern) → ${rule.slice(0, 90)}`);
}
mustNotMatch(css, files.phase6Css, /min-height\s*:\s*78px/, 'the 78px row lock must never return');
mustNotMatch(css, files.phase6Css, /max-height\s*:\s*3[0-9]dvh/, '31dvh-class item list traps cause 1-item viewports');
const itemsRules = css.match(/#cartDrawer[^{}]*\.cart-items[^{}]*\{[^}]*\}/g) || [];
for (const rule of itemsRules) {
  if (/max-height\s*:\s*(?!none)[0-9a-z(]/i.test(rule)) errors.push(`phase6-commerce.css: drawer .cart-items has a max-height cap → ${rule.slice(0, 90)}`);
}
// Item list must be a scroll-safe flex column
mustInclude(css, files.phase6Css, 'flex-direction:column !important', 'items list must be a flex column');
if (!/#cartDrawer\.cart-drawer-premium \.cart-items\{[^}]*min-height:0 !important/.test(css)) {
  errors.push('phase6-commerce.css: premium .cart-items must set min-height:0 for safe flex scrolling');
}
if (!/#cartDrawer\.cart-drawer-premium \.cart-items\{[^}]*overflow-y:auto !important/.test(css)) {
  errors.push('phase6-commerce.css: premium .cart-items must scroll (overflow-y:auto)');
}

// --- 3. Competing layers must stay scoped away from the premium drawer
mustNotMatch(masterCss, files.masterCss, /(^|\n)\.cart-item\{/, 'master-upgrade drawer rules must be scoped to :not(.cart-drawer-premium)');
mustInclude(masterCss, files.masterCss, '#cartDrawer:not(.cart-drawer-premium) .cart-item');
mustInclude(uatCss, files.uatCss, '#cartDrawer:not(.cart-drawer-premium)');
mustNotMatch(uatCss, files.uatCss, /#cartDrawer (#cartItems|\.cart-items)\s*\{/, 'UAT drawer layout must not target the premium drawer');
// Only one drawer layer may remain in phase6-commerce.css: the UX3 block.
const shellRules = (css.match(/#cartDrawer\.(drawer|cart-drawer-premium)\s*\{/g) || []);
if (shellRules.some((s) => s.includes('.drawer'))) {
  errors.push('phase6-commerce.css: a legacy #cartDrawer.drawer shell layer re-appeared');
}

// --- 4. Premium structure markers (header, rows, states)
mustInclude(read(files.phase6Css), files.phase6Css, 'UX3 — Premium mini cart drawer');
mustInclude(css, files.phase6Css, 'cart-drawer-premium__name');
mustInclude(css, files.phase6Css, '-webkit-line-clamp:2', 'product title clamp');
mustInclude(css, files.phase6Css, 'minmax(0,1fr)', 'text column shrink protection');
mustInclude(css, files.phase6Css, 'cart-drawer-premium__empty');
mustInclude(css, files.phase6Css, 'cart-drawer-premium__count');
mustInclude(css, files.phase6Css, 'cart-drawer-premium__subtitle-short', 'compact mobile subtitle variant');
mustInclude(css, files.phase6Css, 'env(safe-area-inset-bottom', 'mobile safe-area support');
mustInclude(css, files.phase6Css, 'prefers-reduced-motion', 'reduced-motion safety');
// Title must be explicitly non-italic and the old weak kicker head must be gone
if (!/cart-drawer-premium__title\{[^}]*font-style:normal/.test(css)) {
  errors.push('phase6-commerce.css: drawer title must declare font-style:normal (no accidental italic)');
}
mustNotMatch(css, files.phase6Css, /cart-drawer-premium__(title|subtitle|kicker)[^{]*\{[^}]*font-style\s*:\s*italic/, 'no italic drawer headings');
mustInclude(js, files.phase6Js, 'cart-drawer-premium__title">Sepetin<', 'header title must be Sepetin');
mustInclude(js, files.phase6Js, 'cart-drawer-premium__subtitle-short', 'mobile subtitle variant in markup');
mustInclude(js, files.phase6Js, 'data-cart-drawer-count', 'item count badge');
mustNotMatch(js, files.phase6Js, /cart-drawer-premium__kicker/, 'weak kicker head removed in UX3');

// --- 5. Sale price / compare-at display safety in the drawer (P1E)
if (!/cart-drawer-premium__price\{[^}]*white-space:normal/.test(css)) {
  errors.push('phase6-commerce.css: price column must allow wrapping (white-space:normal) for sale + compare-at rows');
}
if (!/cart-drawer-premium__price \.cs-price\{[^}]*flex-wrap:wrap/.test(css)) {
  errors.push('phase6-commerce.css: .cs-price in drawer must flex-wrap for sale display');
}
mustInclude(appJs, files.appJs, 'priceDisplayHtml(displayProduct', 'drawer rows must render via shared price display helper');
mustNotMatch(js, files.phase6Js, /compare_at[^\n]*price:/, 'compare-at must never feed a payable price field');
mustNotMatch(appJs, files.appJs, /price:\s*[^,\n]*compare_at/, 'compare-at must never become payable in cart items');

// --- 6. CTA / footer must not overlay the item list (flex, not sticky-over-content)
if (!/#cartDrawer\.cart-drawer-premium \.cart-summary\{[^}]*flex:0 0 auto !important/.test(css)) {
  errors.push('phase6-commerce.css: premium summary must be a non-overlapping flex footer');
}
if (!/#cartDrawer\.cart-drawer-premium \.cart-summary\{[^}]*position:relative !important/.test(css)) {
  errors.push('phase6-commerce.css: premium summary must not be position:sticky over the item list');
}

// --- 7. Recommendations: populated-only, no plugin arrows, no empty placeholder
mustInclude(js, files.phase6Js, 'section.hidden = true', 'recommendations must hide when empty');
mustNotMatch(js, files.phase6Js, /data-phase6-rec-(prev|next)/, 'arrow carousel removed in UX3');
mustNotMatch(js, files.phase6Js, /Tamamlayıcı ürün hazırlanıyor/, 'no empty rec placeholder');
mustNotMatch(css, files.phase6Css, /phase6-rec-arrow/, 'arrow styles removed with the markup');

// --- 8. Cookie banner must sit under drawer/backdrop
const styleCss = read(files.styleCss);
const cookieRule = styleCss.match(/\.cookie \{[\s\S]{0,400}?z-index:\s*(\d+)/);
if (!cookieRule) errors.push('style.css: .cookie z-index rule not found');
else if (Number(cookieRule[1]) >= 310) errors.push(`style.css: .cookie z-index ${cookieRule[1]} still covers backdrop(310)/drawer(320)`);

// --- 9. products.json untouched + no commerce/admin-critical churn
const productsDiff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((productsDiff.stdout || '').trim()) errors.push('products.json is modified — forbidden for UX3');
const protectedFiles = [
  'functions/api/create-checkout.js', 'functions/api/coupons/validate.js',
  'functions/api/_lib/product-pricing.js', 'functions/api/_lib/order-pricing-snapshot.js',
  'functions/api/_lib/coupons.js', 'functions/api/_lib/inventory.js',
  'functions/api/admin/refunds.js', 'assets/checkout-flow.js', 'assets/coupon-client.js',
  'assets/cart-commerce.js', 'assets/inventory-client.js', 'assets/price-display.js',
  'functions/api/_lib/admin.js', 'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js', 'assets/admin-runtime.js'
];
const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
for (const file of (dirty.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
  if (protectedFiles.includes(file)) errors.push(`UX3 must not modify commerce/admin-critical file: ${file}`);
}

// --- 10. C3/C4/I2 coupon-parity canaries (full validators run separately)
mustInclude(js, files.phase6Js, 'cc.validateCoupon');
mustInclude(js, files.phase6Js, 'revalidateStoredCoupon');
mustInclude(js, files.phase6Js, 'couponDiscountAmount');
mustNotMatch(js, files.phase6Js, /fetch\('\/api\/coupons\/validate'/);

// --- 11. Delegate the HF1 behavioral suite (fast)
const hf1 = spawnSync(process.execPath, [join(root, 'scripts/validate-hf1-runtime-commerce-hotfix.mjs')], { cwd: root, encoding: 'utf8' });
if (hf1.status !== 0) errors.push(`HF1 validator failed:\n${(hf1.stdout || '') + (hf1.stderr || '')}`.trim());

if (errors.length) {
  console.error('COSMOSKIN UX3 mini cart premium layout hardening validation FAILED:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('UX3 mini cart premium layout hardening validation passed.');
