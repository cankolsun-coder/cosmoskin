#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const couponsLib = 'functions/api/_lib/coupons.js';
const snapshotsLib = 'functions/api/_lib/order-pricing-snapshot.js';
const catalogLib = 'functions/api/_lib/catalog.js';
const validateApi = 'functions/api/coupons/validate.js';
const checkoutApi = 'functions/api/create-checkout.js';

for (const rel of [couponsLib, snapshotsLib, catalogLib, validateApi, checkoutApi]) mustExist(rel);
if (errors.length) {
  console.error('COSMOSKIN C1B1 coupon exclusions validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const couponsSrc = read(couponsLib);
const snapSrc = read(snapshotsLib);
const catalogSrc = read(catalogLib);
const validateSrc = read(validateApi);
const checkoutSrc = read(checkoutApi);

// Exclusion-aware eligibility engine markers.
mustInclude(couponsSrc, couponsLib, 'excluded_product_slugs');
mustInclude(couponsSrc, couponsLib, 'excluded_categories');
mustInclude(couponsSrc, couponsLib, 'eligible_subtotal');
mustInclude(couponsSrc, couponsLib, 'coupon_line_eligibility');
mustInclude(couponsSrc, couponsLib, 'Bu kupon sepetinizdeki ürünler için uygun değil.');
mustInclude(couponsSrc, couponsLib, 'Bu kupon bazı ürünlerde geçerli değildir.');

// Snapshot allocation must support eligible-only denominator + v2 version.
mustInclude(snapSrc, snapshotsLib, 'allocateOrderDiscountSnapshots');
mustInclude(snapSrc, snapshotsLib, 'PRICING_SNAPSHOT_VERSION_V2');
mustInclude(snapSrc, snapshotsLib, 'v2_eligible_lines_proportional_last_line_remainder');

// Server catalog must expose categorySlug (trusted categories).
mustInclude(catalogSrc, catalogLib, 'categorySlug');
mustInclude(catalogSrc, catalogLib, 'CATEGORY_SLUGS');

// Validate API must build trusted cart lines (categorySlug) and pass to eligibility.
mustInclude(validateSrc, validateApi, 'buildTrustedCartLines');
mustInclude(validateSrc, validateApi, 'categorySlug');
mustInclude(validateSrc, validateApi, 'cartItems: trustedCart');

// Checkout must pass coupon eligibility into snapshots/basket.
mustInclude(checkoutSrc, checkoutApi, 'eligibleSlugs');
mustInclude(checkoutSrc, checkoutApi, 'PRICING_SNAPSHOT_VERSION_V2');
mustInclude(checkoutSrc, checkoutApi, 'buildOrderItemPricingSnapshots(cart, totals.discount || 0');

if (errors.length) {
  console.error('COSMOSKIN C1B1 coupon exclusions validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN C1B1 coupon exclusions validation passed.');

