#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const has = (rel) => existsSync(join(root, rel));

function mustExist(rel) {
  if (!has(rel)) errors.push(`Missing required file: ${rel}`);
}
function mustInclude(src, rel, needle) {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}`);
}
function mustNotInclude(src, rel, needle) {
  if (src.includes(needle)) errors.push(`${rel} must not include forbidden marker: ${needle}`);
}
function runValidator(script) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${script} failed:\n${result.stdout || ''}${result.stderr || ''}`.trim());
  }
}

const cartCommerce = 'assets/cart-commerce.js';
const appJs = 'assets/app.js';
const phase6Js = 'assets/phase6-commerce.js';
const phase6Css = 'assets/phase6-commerce.css';
const cartJs = 'assets/master-upgrade.js';
const checkoutJs = 'assets/checkout-flow.js';
const cartHtml = 'cart.html';
const checkoutHtml = 'checkout.html';
const couponClient = 'assets/coupon-client.js';
const integrationTests = 'tests/local-integration.test.mjs';

for (const rel of [cartCommerce, appJs, phase6Js, phase6Css, cartJs, checkoutJs, cartHtml, checkoutHtml, couponClient, integrationTests]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN C3 mini cart parity validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const commerceSrc = read(cartCommerce);
const appSrc = read(appJs);
const phase6Src = read(phase6Js);
const phase6CssSrc = read(phase6Css);
const cartSrc = read(cartJs);
const checkoutSrc = read(checkoutJs);
const cartPage = read(cartHtml);
const checkoutPage = read(checkoutHtml);
const couponSrc = read(couponClient);
const testsSrc = read(integrationTests);

// Shared commerce model
mustInclude(commerceSrc, cartCommerce, 'COSMOSKIN_CART_COMMERCE');
mustInclude(commerceSrc, cartCommerce, 'computeTotals');
mustInclude(commerceSrc, cartCommerce, 'validateCoupon');
mustInclude(commerceSrc, cartCommerce, 'recommendationCandidates');
mustInclude(commerceSrc, cartCommerce, "COUPON_KEY = 'cosmoskin_coupon_state_v1'");
mustInclude(commerceSrc, cartCommerce, 'COSMOSKIN_COUPON.validate');
mustInclude(commerceSrc, cartCommerce, 'previewDiscount');

// Mini cart uses shared coupon path (not legacy direct fetch without token)
mustInclude(phase6Src, phase6Js, 'cc.validateCoupon');
mustInclude(phase6Src, phase6Js, "COUPON_KEY = 'cosmoskin_coupon_state_v1'");
mustNotInclude(phase6Src, phase6Js, "fetch('/api/coupons/validate'");
mustNotInclude(phase6Src, phase6Js, "if (code === 'WELCOME10')");
mustInclude(phase6Src, phase6Js, 'revalidateStoredCoupon');
mustInclude(phase6Src, phase6Js, 'cosmoskin:cart-drawer-opened');
mustInclude(phase6Src, phase6Js, 'cosmoskin:auth-state');

// App drawer totals + hydration
mustInclude(appSrc, appJs, 'COSMOSKIN_CART_COMMERCE.computeTotals');
mustInclude(appSrc, appJs, 'cart-drawer-premium__name');
mustInclude(appSrc, appJs, 'cosmoskin:cart-drawer-opened');
mustInclude(appSrc, appJs, 'Kupon İndirimi');
mustInclude(appSrc, appJs, 'cart-commerce.js');

// Cart page parity + conditional recommendations
mustInclude(cartSrc, cartJs, 'COSMOSKIN_CART_COMMERCE.computeTotals');
mustInclude(cartSrc, cartJs, 'recsSection');
mustInclude(cartSrc, cartJs, 'data-cs-cart-recs');
mustNotInclude(cartSrc, cartJs, "Sepete uygun öneriler</h2></div></div><div class=\"cs-recs-grid\">' + recommendations(items).map");
mustInclude(cartPage, cartHtml, 'cart-commerce.js');

// Checkout stays focused — no recommendation blocks
mustNotInclude(checkoutPage, checkoutHtml, 'Sepete uygun öneriler');
mustNotInclude(checkoutPage, checkoutHtml, 'phase6CartRecommendations');
mustNotInclude(checkoutSrc, checkoutJs, 'Sepete uygun öneriler');

// Premium drawer structure
mustInclude(phase6Src, phase6Js, 'cart-drawer-premium');
mustInclude(phase6Src, phase6Js, 'Sepetin');
mustInclude(phase6CssSrc, phase6Css, 'cart-drawer-premium__name');
mustInclude(phase6CssSrc, phase6Css, '-webkit-line-clamp:2');
mustInclude(phase6CssSrc, phase6Css, 'minmax(0,1fr)');
mustInclude(phase6CssSrc, phase6Css, 'cart-drawer-premium__empty');

// Recommendations: hide when empty
mustInclude(phase6Src, phase6Js, 'section.hidden = true');
mustNotInclude(phase6Src, phase6Js, 'Tamamlayıcı ürün hazırlanıyor');

// No direct localStorage coupon reads in mini cart (use coupon client)
mustNotInclude(phase6Src, phase6Js, 'JSON.parse(localStorage.getItem(COUPON_KEY)');
mustInclude(phase6Src, phase6Js, 'couponDiscountAmount');

// Coupon client shared storage
mustInclude(couponSrc, couponClient, "STORAGE_KEY = 'cosmoskin_coupon_state_v1'");
mustInclude(couponSrc, couponClient, 'resolveAccessToken');

// Integration tests
mustInclude(testsSrc, integrationTests, "test('C3:");
mustInclude(testsSrc, integrationTests, 'mini cart');
mustInclude(testsSrc, integrationTests, 'COSMOSKIN_CART_COMMERCE');

// Regression guards
runValidator('scripts/validate-c2-cart-checkout-coupon-parity.mjs');
runValidator('scripts/validate-c1-coupon-eligibility-hardening.mjs');
runValidator('scripts/validate-c1b-coupon-exclusions-metadata.mjs');
runValidator('scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs');
runValidator('scripts/validate-i2-checkout-stock-false-negative.mjs');
runValidator('scripts/validate-i1-inventory-checkout-blocking.mjs');
runValidator('scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs');
runValidator('scripts/validate-p1c3-effective-price-fallback-hardening.mjs');
runValidator('scripts/validate-p1c-effective-price-commerce-integrity.mjs');

if (errors.length) {
  console.error('COSMOSKIN C3 mini cart parity + premium redesign validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN C3 mini cart parity + premium redesign validation passed.');
