#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];

const mustExist = (rel) => {
  const abs = join(root, rel);
  if (!existsSync(abs)) errors.push(`Missing required file: ${rel}`);
  return abs;
};
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const mustInclude = (source, rel, needle) => {
  if (!source.includes(needle)) errors.push(`${rel} missing required marker: ${needle}`);
};
const mustNotMatch = (source, rel, re, message) => {
  if (re.test(source)) errors.push(message || `${rel} matched forbidden pattern: ${re}`);
};

const couponsPath = mustExist('functions/api/_lib/coupons.js');
const validatePath = mustExist('functions/api/coupons/validate.js');
const checkoutPath = mustExist('functions/api/create-checkout.js');

const coupons = existsSync(couponsPath) ? read('functions/api/_lib/coupons.js') : '';
const validate = existsSync(validatePath) ? read('functions/api/coupons/validate.js') : '';
const checkout = existsSync(checkoutPath) ? read('functions/api/create-checkout.js') : '';

// ROUTINE5 must be server-verified from trusted routine table.
mustInclude(coupons, 'functions/api/_lib/coupons.js', 'customer_routine_results');
mustInclude(coupons, 'functions/api/_lib/coupons.js', 'hasTrustedSmartRoutineCompletion');

// Membership tier enforcement must read trusted DB tier.
mustInclude(coupons, 'functions/api/_lib/coupons.js', 'customer_membership_status');
mustInclude(coupons, 'functions/api/_lib/coupons.js', 'level_code');
mustInclude(coupons, 'functions/api/_lib/coupons.js', "['essential', 'signature', 'elite']");

// Reservation hardening: per-customer limit must consider reserved.
mustInclude(coupons, 'functions/api/_lib/coupons.js', 'isActiveRedemptionStatus');
mustInclude(coupons, 'functions/api/_lib/coupons.js', 'per_customer_limit_reached');

// Validate endpoint must not trust client subtotal.
mustInclude(validate, 'functions/api/coupons/validate.js', "import { catalog }");
mustNotMatch(
  validate,
  'functions/api/coupons/validate.js',
  /\bbody\.subtotal\b|\bsubtotal\s*=\s*Number\s*\(\s*body\.subtotal/i,
  'Coupon validate endpoint appears to trust client-provided subtotal.'
);

// Checkout must call the same eligibility engine and pass cart context.
mustInclude(checkout, 'functions/api/create-checkout.js', "validateCouponEligibility(context");
mustInclude(checkout, 'functions/api/create-checkout.js', 'cartItems: cart');

// Required reason codes must exist in coupon engine (static contract check).
for (const code of [
  'coupon_not_found',
  'coupon_inactive',
  'coupon_deprecated',
  'coupon_expired',
  'coupon_not_started',
  'invalid_discount',
  'min_subtotal_not_met',
  'authentication_required',
  'membership_required',
  'membership_tier_not_allowed',
  'birthday_month_required',
  'smart_routine_required',
  'first_order_required',
  'per_customer_limit_reached',
  'usage_limit_reached',
  'coupon_not_stackable',
  'product_excluded',
  'category_excluded'
]) {
  mustInclude(coupons, 'functions/api/_lib/coupons.js', `'${code}'`);
}

// No migrations created in C1A.
if (existsSync(join(root, 'supabase/migrations'))) {
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
  const c1aMigrations = migrations.filter((f) => /20260706.*c1/i.test(f));
  if (c1aMigrations.length) errors.push(`Unexpected C1A migration file(s) present: ${c1aMigrations.join(', ')}`);
}

if (errors.length) {
  console.error('COSMOSKIN C1A coupon eligibility hardening validation failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log('COSMOSKIN C1A coupon eligibility hardening validation passed.');

