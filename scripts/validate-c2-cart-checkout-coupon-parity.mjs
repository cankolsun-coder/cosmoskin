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

const couponClient = 'assets/coupon-client.js';
const cartPage = 'cart.html';
const checkoutPage = 'checkout.html';
const cartJs = 'assets/master-upgrade.js';
const checkoutJs = 'assets/checkout-flow.js';
const mobileJs = 'assets/mobile-redesign.js';
const validateApi = 'functions/api/coupons/validate.js';
const checkoutApi = 'functions/api/create-checkout.js';
const integrationTests = 'tests/local-integration.test.mjs';

for (const rel of [couponClient, cartPage, checkoutPage, cartJs, checkoutJs, mobileJs, validateApi, checkoutApi, integrationTests]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN C2 cart/checkout coupon parity validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const couponSrc = read(couponClient);
const cartSrc = read(cartJs);
const checkoutSrc = read(checkoutJs);
const mobileSrc = read(mobileJs);
const validateSrc = read(validateApi);
const checkoutApiSrc = read(checkoutApi);
const cartHtml = read(cartPage);
const checkoutHtml = read(checkoutPage);
const testsSrc = read(integrationTests);

// Shared coupon client + storage
mustInclude(couponSrc, couponClient, "var STORAGE_KEY = 'cosmoskin_coupon_state_v1'");
mustInclude(couponSrc, couponClient, 'previewDiscount');
mustInclude(couponSrc, couponClient, '/coupons/validate');
mustInclude(couponSrc, couponClient, 'discountAmount');
mustNotInclude(couponSrc, couponClient, 'WELCOME10');
mustInclude(cartHtml, cartPage, 'coupon-client.js');
mustInclude(checkoutSrc, checkoutJs, 'coupon-client.js');
mustInclude(checkoutSrc, checkoutJs, 'ensureCosmoskinCouponClient');
mustInclude(checkoutSrc, checkoutJs, 'hydrateAndRevalidateCoupon');

// Cart must not bypass server validation
mustInclude(cartSrc, cartJs, 'COSMOSKIN_COUPON.validate');
mustNotInclude(cartSrc, cartJs, "if (code === 'WELCOME10')");
mustNotInclude(cartSrc, cartJs, "legacy === 'WELCOME10'");

// Checkout carryover + revalidation
mustInclude(checkoutSrc, checkoutJs, 'hydrateCouponFromCartStorage');
mustInclude(checkoutSrc, checkoutJs, 'hydrateAndRevalidateCoupon');
mustInclude(checkoutSrc, checkoutJs, 'COSMOSKIN_COUPON.validate');
mustInclude(checkoutSrc, checkoutJs, 'applyValidatedCoupon');
mustInclude(checkoutSrc, checkoutJs, 'applyValidatedCoupon(code, data)');
mustNotInclude(checkoutSrc, checkoutJs, 'clearCouponPersistence();\n      saveState();\n      renderSummary();\n      if (!options.silent) setStatus(data.freeShipping ?');

// Mobile parity
mustInclude(mobileSrc, mobileJs, 'COSMOSKIN_COUPON.validate');

// Server authority
mustInclude(validateSrc, validateApi, 'buildTrustedCartLines');
mustInclude(validateSrc, validateApi, 'validateCouponEligibility');
mustInclude(checkoutApiSrc, checkoutApi, 'validateCouponEligibility(context');
mustInclude(checkoutApiSrc, checkoutApi, 'payload.coupon_code || payload.couponCode');
mustNotInclude(checkoutApiSrc, checkoutApi, 'body.discount_amount');
mustNotInclude(checkoutApiSrc, checkoutApi, 'payload.discount_amount');

// Integration tests
mustInclude(testsSrc, integrationTests, "test('C2:");
mustInclude(testsSrc, integrationTests, 'cosrx-advanced-snail-96-mucin-essence');
mustInclude(testsSrc, integrationTests, 'WELCOME10');

// Regression guards
runValidator('scripts/validate-c1-coupon-eligibility-hardening.mjs');
runValidator('scripts/validate-c1b-coupon-exclusions-metadata.mjs');
runValidator('scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs');
runValidator('scripts/validate-i2-checkout-stock-false-negative.mjs');

if (errors.length) {
  console.error('COSMOSKIN C2 cart/checkout coupon parity validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN C2 cart/checkout coupon parity validation passed.');
