#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const mustInclude = (src, rel, needle) => {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}`);
};
const mustNotMatch = (src, rel, re, message) => {
  if (re.test(src)) errors.push(message || `${rel} matched forbidden pattern: ${re}`);
};

// ---------------------------------------------------------------------------
// Endpoint must exist + be admin protected + products:read-gated.
// ---------------------------------------------------------------------------
let historySrc = '';
try {
  historySrc = read('functions/api/admin/products/[slug]/price-history.js');
} catch (error) {
  errors.push('Missing endpoint: functions/api/admin/products/[slug]/price-history.js');
}
if (historySrc) {
  for (const marker of [
    'export async function onRequestGet',
    'assertAdmin',
    "requireAdminPermission(context, 'products:read')",
    "selectRows(context, 'product_price_audit_logs'",
    'order: \'changed_at.desc\'',
    'limit',
    'product_slug',
    'old_regular_price_try',
    'new_regular_price_try',
    'changed_by_admin',
    'changed_at',
    'reason',
    'source'
  ]) {
    mustInclude(historySrc, 'functions/api/admin/products/[slug]/price-history.js', marker);
  }
  mustNotMatch(historySrc, 'functions/api/admin/products/[slug]/price-history.js', /onRequestPatch|onRequestPost|onRequestDelete/, 'Price history must be read-only (GET only).');
}

// ---------------------------------------------------------------------------
// Admin UI must display history read-only.
// ---------------------------------------------------------------------------
const ui = read('assets/admin-products.js');
for (const marker of [
  'Fiyat Geçmişi',
  '/api/admin/products/',
  '/price-history',
  'old_regular_price_try',
  'new_regular_price_try',
  'changed_by_admin',
  'changed_at',
  'reason',
  'source',
  'Bu ürün için henüz fiyat değişikliği yok.'
]) {
  mustInclude(ui, 'assets/admin-products.js', marker);
}
mustNotMatch(ui, 'assets/admin-products.js', /price-history[^\\n]*PATCH|DELETE/i, 'Admin UI must not support editing/deleting audit logs.');

// Ensure pricing edits still write audit logs (P1C regression guard)
const pricingLib = read('functions/api/_lib/product-pricing.js');
mustInclude(pricingLib, 'functions/api/_lib/product-pricing.js', "insertRow(context, 'product_price_audit_logs'");

// Chain critical regressions
for (const script of [
  'scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs',
  'scripts/validate-p1c3-effective-price-fallback-hardening.mjs',
  'scripts/validate-p1c-effective-price-commerce-integrity.mjs',
  'scripts/validate-p1c-admin-product-price-editing.mjs',
  'scripts/validate-p1b-admin-product-price-readonly.mjs',
  'scripts/validate-p1a-product-price-source-drift.mjs'
]) {
  const child = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  if (child.status !== 0) {
    errors.push(`${script} regressed.`);
    if (child.stderr) errors.push(child.stderr.trim());
    if (child.stdout) errors.push(child.stdout.trim());
  }
}

if (errors.length) {
  console.error('COSMOSKIN P1D admin price audit history validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN P1D admin price audit history validation passed.');
console.log('- admin can view read-only price history via /api/admin/products/:slug/price-history');

