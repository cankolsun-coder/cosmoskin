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

const checkoutApi = 'functions/api/create-checkout.js';
const checkoutFlow = 'assets/checkout-flow.js';
const integrationTests = 'tests/local-integration.test.mjs';

for (const rel of [checkoutApi, checkoutFlow, integrationTests]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN C4 checkout order creation validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const checkoutSrc = read(checkoutApi);
const flowSrc = read(checkoutFlow);
const testsSrc = read(integrationTests);

mustInclude(checkoutSrc, checkoutApi, 'serializeOrderItemInsertRow');
mustInclude(checkoutSrc, checkoutApi, 'persistOrderItems');
mustNotInclude(checkoutSrc, checkoutApi, 'cartWithSnapshots.map((item) => ({ ...item, order_id: orderId }))');
mustInclude(checkoutSrc, checkoutApi, 'validateCouponEligibility');
mustInclude(checkoutSrc, checkoutApi, 'buildOrderItemPricingSnapshots');
mustInclude(checkoutSrc, checkoutApi, 'mapPersistenceError');
mustNotInclude(checkoutSrc, checkoutApi, 'payload.totals.discount');
mustNotInclude(checkoutSrc, checkoutApi, 'body.discount_amount');

mustInclude(flowSrc, checkoutFlow, 'formatCheckoutApiError');
mustInclude(flowSrc, checkoutFlow, 'coupon_code: state.coupon.code');
mustInclude(flowSrc, checkoutFlow, 'formatCheckoutApiError(data)');
mustNotInclude(flowSrc, checkoutFlow, "new Error(data.error || 'İşlem başlatılamadı.')");

mustInclude(testsSrc, integrationTests, "test('C4:");
mustInclude(testsSrc, integrationTests, 'WELCOME10 bank transfer checkout creates order with total 2377');
mustInclude(testsSrc, integrationTests, 'serializeOrderItemInsertRow excludes non-column cart fields');
mustInclude(testsSrc, integrationTests, 'checkout-flow maps structured stock error');

runValidator('scripts/validate-c3-minicart-parity-premium-redesign.mjs');
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
  console.error('COSMOSKIN C4 checkout order creation after coupon validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN C4 checkout order creation after coupon validation passed.');
