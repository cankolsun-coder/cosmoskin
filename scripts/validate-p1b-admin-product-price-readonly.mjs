#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

const mustExist = (rel) => {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
};
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const mustInclude = (src, rel, needle) => {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}`);
};
const mustNotMatch = (src, rel, re, message) => {
  if (re.test(src)) errors.push(message || `${rel} matched forbidden pattern: ${re}`);
};

const adminApi = 'functions/api/admin/products.js';
const adminUi = 'assets/admin-products.js';
const adminHtml = 'admin/products.html';
const checkout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';
const orderSnapshot = 'functions/api/_lib/order-pricing-snapshot.js';
const inventory = 'functions/api/_lib/inventory.js';
const p1aValidator = 'scripts/validate-p1a-product-price-source-drift.mjs';
const c1Validator = 'scripts/validate-c1-coupon-eligibility-hardening.mjs';
const d3Validator = 'scripts/validate-d3-refund-snapshot-persistence.mjs';
const i1Validator = 'scripts/validate-i1-inventory-checkout-blocking.mjs';

for (const rel of [adminApi, adminUi, adminHtml, checkout, couponValidate, orderSnapshot, inventory, p1aValidator, c1Validator, d3Validator, i1Validator]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN P1B admin product price read-only validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const adminApiSrc = read(adminApi);
const adminUiSrc = read(adminUi);
const adminHtmlSrc = read(adminHtml);
const checkoutSrc = read(checkout);
const couponValidateSrc = read(couponValidate);

mustInclude(adminApiSrc, adminApi, "import productSource from '../_lib/products-data.js'");
mustInclude(adminApiSrc, adminApi, 'catalog_price_try');
mustInclude(adminApiSrc, adminApi, 'catalog_price_source');
mustInclude(adminApiSrc, adminApi, "catalog_price_source: CATALOG_PRICE_SOURCE");
mustInclude(adminApiSrc, adminApi, 'catalog_price_warning');
mustInclude(adminApiSrc, adminApi, 'Bu ürün için katalog fiyatı bulunamadı.');
mustInclude(adminApiSrc, adminApi, 'Katalog fiyatı geçersiz görünüyor.');
mustInclude(adminApiSrc, adminApi, "requireAdminPermission(context, 'products:read')");

mustNotMatch(
  adminApiSrc,
  adminApi,
  /\bprice_try\b|products\.price_try|selectRows\([^)]*['"]products['"]/i,
  'Admin product API must not read price from Supabase products.price_try.'
);
mustNotMatch(
  adminApiSrc,
  adminApi,
  /body\.(?:catalog_price|price|catalog_price_try)/,
  'Admin product PATCH/POST must not accept client-submitted catalog price.'
);

mustInclude(adminUiSrc, adminUi, 'catalog_price_try');
mustInclude(adminUiSrc, adminUi, 'catalog_price_source');
mustInclude(adminUiSrc, adminUi, 'Katalog Fiyatı');
mustInclude(adminUiSrc, adminUi, 'Kaynak:');
mustInclude(adminUiSrc, adminUi, 'products.json');
mustInclude(adminUiSrc, adminUi, 'Admin fiyat düzenleme P1C aşamasında eklenecek.');
mustInclude(adminUiSrc, adminUi, 'catalog_price_warning');

mustNotMatch(
  adminUiSrc,
  adminUi,
  /data-price|data-catalog-price|COSMOSKIN_PRODUCTS|localStorage.*price|sessionStorage.*price/i,
  'Admin product UI must not use client/local catalog price sources.'
);
mustNotMatch(
  adminUiSrc,
  adminUi,
  /type=["']number["'][^>]*(?:catalog|price)|(?:catalog|price)[^>]*type=["']number["']/i,
  'Admin product UI must not expose editable catalog price input.'
);
mustNotMatch(
  adminUiSrc,
  adminUi,
  /\bprice\s*:/,
  'Admin product save payload must not include price fields.'
);

mustInclude(adminHtmlSrc, adminHtml, 'Katalog Fiyatı');

mustInclude(checkoutSrc, checkout, 'const unitPrice = normalizeMoney(product.price)');
mustNotMatch(
  checkoutSrc,
  checkout,
  /rawItem\.(?:price|unit_price|unitPrice)/,
  'Checkout must not trust client-submitted unit price.'
);

mustInclude(couponValidateSrc, couponValidate, 'buildTrustedCartLines');
mustInclude(couponValidateSrc, couponValidate, 'const unitPrice = Number(product?.price || 0)');

const migrationsDir = join(root, 'supabase/migrations');
if (existsSync(migrationsDir)) {
  const p1bMigrations = readdirSync(migrationsDir).filter((name) => /p1b|admin_product_price/i.test(name));
  if (p1bMigrations.length) {
    errors.push(`P1B must not add migrations: ${p1bMigrations.join(', ')}`);
  }
}

for (const [script, label] of [
  [p1aValidator, 'P1A drift guard'],
  [c1Validator, 'C1 coupon hardening'],
  [d3Validator, 'D3A snapshot persistence'],
  [i1Validator, 'I1 inventory checkout blocking']
]) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${label} regressed while validating P1B (${script}).`);
    if (result.stderr) errors.push(result.stderr.trim());
    if (result.stdout) errors.push(result.stdout.trim());
  }
}

if (errors.length) {
  console.error('COSMOSKIN P1B admin product price read-only validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1B admin product price read-only validation passed.');
console.log('- admin product API exposes trusted read-only catalog price fields');
console.log('- admin UI shows read-only Katalog Fiyatı with products.json source note');
console.log('- checkout/coupon/inventory/D3A/P1A regression guards remain intact');
