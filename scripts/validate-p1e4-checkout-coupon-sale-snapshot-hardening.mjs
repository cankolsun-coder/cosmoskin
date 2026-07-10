#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
const mustExist = (p) => { if (!existsSync(join(root, p))) errors.push(`Missing: ${p}`); };
const read = (p) => readFileSync(join(root, p), 'utf8');
const mustInclude = (src, p, needle) => { if (!src.includes(needle)) errors.push(`${p} missing: ${needle}`); };
const mustNotMatch = (src, p, re, message) => { if (re.test(src)) errors.push(message || `${p} matched forbidden: ${re}`); };

const pricing = 'functions/api/_lib/product-pricing.js';
const snapshot = 'functions/api/_lib/order-pricing-snapshot.js';
const checkout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';
const coupons = 'functions/api/_lib/coupons.js';
const checkoutFlow = 'assets/checkout-flow.js';
const cartCommerce = 'assets/cart-commerce.js';
const priceDisplay = 'assets/price-display.js';
const tests = 'tests/local-integration.test.mjs';

for (const p of [
  pricing, snapshot, checkout, couponValidate, coupons, checkoutFlow, cartCommerce, priceDisplay, tests, 'products.json'
]) {
  mustExist(p);
}

const pricingSrc = read(pricing);
const snapshotSrc = read(snapshot);
const checkoutSrc = read(checkout);
const couponSrc = read(couponValidate);
const couponsSrc = read(coupons);
const checkoutFlowSrc = read(checkoutFlow);
const testsSrc = read(tests);

// Payable resolver helpers
mustInclude(pricingSrc, pricing, 'getPayableUnitPriceTry');
mustInclude(pricingSrc, pricing, 'compareAtIsDisplayOnly');
mustInclude(pricingSrc, pricing, 'sale_active');
mustInclude(pricingSrc, pricing, 'compare_at_price_try');
mustNotMatch(pricingSrc, pricing, /effective_price_try\s*=\s*compare_at_price_try/, 'compare_at must never become payable in resolver');

// Snapshot payable guard
mustInclude(snapshotSrc, snapshot, 'isPayableSnapshotUnitPrice');
mustInclude(snapshotSrc, snapshot, 'paid_unit_price');
mustInclude(snapshotSrc, snapshot, 'paid_line_total');

// Checkout hardening
mustInclude(checkoutSrc, checkout, 'buildPricedCatalogIndex');
mustInclude(checkoutSrc, checkout, 'getPayableUnitPriceTry(product)');
mustInclude(checkoutSrc, checkout, 'buildPriceChangedNotice');
mustInclude(checkoutSrc, checkout, 'buildOrderItemPricingSnapshots');
mustInclude(checkoutSrc, checkout, 'buildIyzicoBasketItems(cart, totals.shipping, totals.discount || 0, coupon)');
mustInclude(checkoutSrc, checkout, 'const vat = normalizeMoney((discountedSubtotal * VAT_RATE) / (1 + VAT_RATE));');
mustNotMatch(checkoutSrc, checkout, /compare_at_price_try/, 'create-checkout must not reference compare_at_price_try');
mustNotMatch(checkoutSrc, checkout, /(?:unit_price|line_total)\s*=\s*[^;]*compare_at_price_try/, 'create-checkout must not assign payable fields from compare_at_price_try');
mustNotMatch(checkoutSrc, checkout, /rawItem\.(?:price|unit_price|unitPrice|line_total|lineTotal)/, 'checkout must not trust client item prices');
mustNotMatch(checkoutSrc, checkout, /payload\.totals\.(?:total|subtotal|discount)/, 'checkout must not charge from client totals');
mustInclude(checkoutSrc, checkout, 'buildPricingSnapshotMetadata');
mustInclude(checkoutSrc, checkout, 'Sepetindeki fiyatlar güncellendi. Lütfen toplamı kontrol edip tekrar dene.');

// Coupon hardening
mustInclude(couponSrc, couponValidate, 'buildPricedCatalogIndex');
mustInclude(couponSrc, couponValidate, 'getPayableUnitPriceTry');
mustInclude(couponSrc, couponValidate, 'trusted_subtotal');
mustNotMatch(couponSrc, couponValidate, /compare_at_price_try/, 'coupon validate must not reference compare_at_price_try');
mustNotMatch(couponSrc, couponValidate, /body\.subtotal|payload\.subtotal/, 'coupon validate must not trust client subtotal field');

// Coupon allocation still uses line_total from trusted cart
mustInclude(couponsSrc, coupons, 'eligibleSubtotal');
mustInclude(couponsSrc, coupons, 'line_total');

// Client stale total UX
mustInclude(checkoutFlowSrc, checkoutFlow, 'price_changed');
mustInclude(checkoutFlowSrc, checkoutFlow, 'repriced');

// Integration tests
for (const marker of [
  'P1E4: getPayableUnitPriceTry never returns compare-at display price',
  'P1E4: active sale coupon subtotal uses sale effective price (WELCOME10 cap 150)',
  'P1E4: active sale checkout charges sale price, KDV, snapshots, and ignores stale client totals',
  'P1E4: future and expired sales fail-closed to regular price at checkout',
  'P1E4: sale-priced cart with WELCOME10 coupon drives paid snapshots and iyzico basket totals',
  'assert.equal(data.trusted_subtotal, 1998)',
  'assert.equal(data.discount_amount, 150)',
  'P1E4: refund allocation uses paid sale snapshot, not compare-at or current catalog',
  'buildPriceChangedNotice'
]) {
  mustInclude(testsSrc, tests, marker);
}

// products.json unchanged
try {
  const productsDiff = spawnSync('git', ['diff', '--name-only', 'products.json'], { cwd: root, encoding: 'utf8', timeout: 5000 });
  if (productsDiff.error && productsDiff.error.code === 'ETIMEDOUT') {
    errors.push('git diff products.json timed out');
  } else if ((productsDiff.stdout || '').trim()) {
    errors.push('products.json was modified (forbidden for P1E4)');
  }
} catch (_error) {
  /* git unavailable */
}

// Nested regression chain (Section 17)
for (const [script, label] of [
  ['scripts/validate-p1e3-storefront-sale-display.mjs', 'P1E3 storefront'],
  ['scripts/validate-p1e2-admin-sale-price-editing.mjs', 'P1E2 admin sale'],
  ['scripts/validate-p1e1-sale-price-resolver-model.mjs', 'P1E1 resolver'],
  ['scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs', 'P1C4 PDP runtime'],
  ['scripts/validate-p1c3-effective-price-fallback-hardening.mjs', 'P1C3 fallback'],
  ['scripts/validate-p1c-effective-price-commerce-integrity.mjs', 'P1C commerce integrity'],
  ['scripts/validate-p1d-admin-price-audit-history.mjs', 'P1D audit history'],
  ['scripts/validate-c4-checkout-order-creation-after-coupon.mjs', 'C4 checkout coupon'],
  ['scripts/validate-c3-minicart-parity-premium-redesign.mjs', 'C3 minicart'],
  ['scripts/validate-c2-cart-checkout-coupon-parity.mjs', 'C2 cart coupon parity'],
  ['scripts/validate-i2-checkout-stock-false-negative.mjs', 'I2 stock'],
  ['scripts/validate-d3-refund-snapshot-persistence.mjs', 'D3 refund snapshot'],
  ['scripts/validate-d2b-refund-discount-proration.mjs', 'D2b refund proration'],
  ['scripts/validate-d2-refund-amount-correctness.mjs', 'D2 refund amount'],
  ['scripts/validate-production-launch-readiness.mjs', 'production readiness']
]) {
  const abs = join(root, script);
  if (!existsSync(abs)) {
    errors.push(`Missing nested validator: ${script}`);
    continue;
  }
  const result = spawnSync(process.execPath, [abs], { cwd: root, encoding: 'utf8', timeout: 900000 });
  if (result.status !== 0) {
    errors.push(`${label} regressed (${script}).`);
    if (result.stderr) errors.push(result.stderr.trim());
    if (result.stdout) errors.push(result.stdout.trim());
  }
}

if (errors.length) {
  console.error('COSMOSKIN P1E4 checkout/coupon/sale snapshot hardening validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1E4 checkout/coupon/sale snapshot hardening validation passed.');
console.log('- Payable price uses effective_price_try only; compare-at excluded from commerce math');
console.log('- Checkout/coupon rebuild trusted cart from server resolver at creation time');
console.log('- Order snapshots, KDV, iyzico/bank totals use sale effective price when active');
console.log('- Stale client totals ignored with optional price_changed/repriced response');
