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
function mustNotInclude(src, rel, needle) {
  if (src.includes(needle)) errors.push(`${rel} must not include forbidden marker: ${needle}`);
}

const couponsLib = 'functions/api/_lib/coupons.js';
const couponAdminLib = 'functions/api/_lib/coupon-admin.js';
const adminApi = 'functions/api/admin/coupons/index.js';
const adminUi = 'assets/admin-coupons.js';
const checkoutApi = 'functions/api/create-checkout.js';
const validateApi = 'functions/api/coupons/validate.js';
const snapshotsLib = 'functions/api/_lib/order-pricing-snapshot.js';

for (const rel of [couponsLib, couponAdminLib, adminApi, adminUi, checkoutApi, validateApi, snapshotsLib]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN C1B2 admin coupon metadata validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const couponsSrc = read(couponsLib);
const couponAdminSrc = read(couponAdminLib);
const adminApiSrc = read(adminApi);
const adminUiSrc = read(adminUi);
const checkoutSrc = read(checkoutApi);
const validateSrc = read(validateApi);
const snapSrc = read(snapshotsLib);

// Admin UI visibility (Turkish labels).
for (const label of [
  'Uygun üyelik seviyeleri',
  'Giriş zorunlu',
  'İlk sipariş şartı',
  'Doğum günü şartı',
  'Akıllı Rutin şartı',
  'Hariç tutulan ürünler',
  'Hariç tutulan kategoriler',
  'Kural kaynağı: metadata',
  'Kural kaynağı: sistem varsayılanı',
  'Checkout kuralları sunucu tarafında yeniden doğrulanır.'
]) {
  mustInclude(adminUiSrc, adminUi, label);
}

// Shared canonical resolver for admin display.
mustInclude(couponsSrc, couponsLib, 'resolveCouponPresentation');
mustInclude(couponsSrc, couponsLib, 'merged.discount_type = (merged.discount_type ?? merged.type ??');
mustInclude(couponsSrc, couponsLib, 'Bu kuponda eski ve yeni indirim alanları farklı. Checkout kanonik alanı kullanır.');
mustInclude(couponAdminSrc, couponAdminLib, 'resolveCouponPresentation');
mustInclude(adminUiSrc, adminUi, 'field_conflicts');

// Metadata sanitization must reject invalid tiers and preserve merge semantics.
mustInclude(couponsSrc, couponsLib, 'sanitizeEligibilityMetadataPatch');
mustInclude(couponsSrc, couponsLib, "MEMBERSHIP_TIER_CODES = ['essential', 'signature', 'elite']");
mustInclude(couponsSrc, couponsLib, 'const nextMetadata = { ...existing };');
mustInclude(couponAdminSrc, couponAdminLib, 'sanitizeEligibilityMetadataPatch');
mustInclude(adminApiSrc, adminApi, 'buildCouponPatchPayload');

// Admin API permission gate.
mustInclude(adminApiSrc, adminApi, "requireAdminPermission(context, 'coupons:read')");
mustInclude(adminApiSrc, adminApi, "requireAdminPermission(context, 'coupons:manage')");

// Checkout must still use shared eligibility engine (no admin bypass).
mustInclude(checkoutSrc, checkoutApi, 'validateCouponEligibility(context');
mustInclude(validateSrc, validateApi, 'validateCouponEligibility(context');

// C1A protections remain in coupons engine.
mustInclude(couponsSrc, couponsLib, 'customer_routine_results');
mustInclude(couponsSrc, couponsLib, 'customer_membership_status');
mustInclude(couponsSrc, couponsLib, 'hasTrustedSmartRoutineCompletion');

// C1B1 exclusion allocation remains.
mustInclude(couponsSrc, couponsLib, 'coupon_line_eligibility');
mustInclude(couponsSrc, couponsLib, 'eligible_subtotal');
mustInclude(snapSrc, snapshotsLib, 'allocateOrderDiscountSnapshots');
mustInclude(snapSrc, snapshotsLib, 'PRICING_SNAPSHOT_VERSION_V2');

// Admin must not destructively wipe unknown metadata keys.
mustNotInclude(couponsSrc, couponsLib, 'metadata: body.metadata');
mustNotInclude(adminApiSrc, adminApi, 'metadata: body.metadata');

if (errors.length) {
  console.error('COSMOSKIN C1B2 admin coupon metadata validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN C1B2 admin coupon metadata validation passed.');
