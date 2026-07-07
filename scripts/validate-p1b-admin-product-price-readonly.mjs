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
const adminPrice = 'functions/api/admin/products/[slug]/price.js';
const adminUi = 'assets/admin-products.js';
const adminHtml = 'admin/products.html';
const pricingLib = 'functions/api/_lib/product-pricing.js';
const checkout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';
const orderSnapshot = 'functions/api/_lib/order-pricing-snapshot.js';
const inventory = 'functions/api/_lib/inventory.js';
const p1aValidator = 'scripts/validate-p1a-product-price-source-drift.mjs';

for (const rel of [adminApi, adminPrice, adminUi, adminHtml, pricingLib, checkout, couponValidate, orderSnapshot, inventory, p1aValidator]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN P1B admin product price read-only validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const adminApiSrc = read(adminApi);
const adminPriceSrc = read(adminPrice);
const adminUiSrc = read(adminUi);
const adminHtmlSrc = read(adminHtml);
const pricingSrc = read(pricingLib);
const checkoutSrc = read(checkout);
const couponValidateSrc = read(couponValidate);

mustInclude(adminApiSrc, adminApi, "requireAdminPermission(context, 'products:read')");
mustInclude(adminApiSrc, adminApi, 'buildAdminPricingFields');
mustInclude(adminApiSrc, adminApi, 'catalog_price_try');
mustInclude(adminApiSrc, adminApi, 'permissions');
mustInclude(adminApiSrc, adminApi, 'can_edit_price');
mustInclude(adminApiSrc, adminApi, 'Fiyat güncellemesi bu uçtan yapılamaz.');

mustInclude(pricingSrc, pricingLib, 'CATALOG_MISSING_WARNING');
mustInclude(pricingSrc, pricingLib, 'Bu ürün için katalog fiyatı bulunamadı.');

mustInclude(adminPriceSrc, adminPrice, "requireAdminPermission(context, 'products:pricing:update')");

mustInclude(adminUiSrc, adminUi, 'effective_price_try');
mustInclude(adminUiSrc, adminUi, 'Katalog Fiyatı');
mustInclude(adminUiSrc, adminUi, 'can_edit_price');
mustInclude(adminUiSrc, adminUi, 'products:pricing:update');

mustNotMatch(
  adminUiSrc,
  adminUi,
  /COSMOSKIN_PRODUCTS|window\.COSMOSKIN|localStorage\.(?:get|set)Item\([^\)]*price/i,
  'Admin product UI must not use client/local catalog price sources.'
);
mustNotMatch(
  adminUiSrc,
  adminUi,
  /\bprice\s*:/,
  'Admin inventory save payload must not include price fields.'
);

mustInclude(adminHtmlSrc, adminHtml, 'Katalog Fiyatı');

mustInclude(checkoutSrc, checkout, 'const unitPrice = normalizeMoney(product.price)');
mustNotMatch(
  checkoutSrc,
  checkout,
  /rawItem\.(?:price|unit_price|unitPrice)/,
  'Checkout must not trust client-submitted unit price.'
);

mustInclude(couponValidateSrc, couponValidate, 'buildPricedCatalogIndex');

const migrationsDir = join(root, 'supabase/migrations');
if (existsSync(migrationsDir)) {
  const p1bOnlyMigrations = readdirSync(migrationsDir).filter((name) => /p1b(?!c)/i.test(name) && /admin_product_price/i.test(name));
  if (p1bOnlyMigrations.length) {
    errors.push(`P1B must not add migrations: ${p1bOnlyMigrations.join(', ')}`);
  }
}

const p1aResult = spawnSync(process.execPath, [join(root, p1aValidator)], { cwd: root, encoding: 'utf8' });
if (p1aResult.status !== 0) {
  errors.push('P1A drift guard regressed while validating P1B.');
  if (p1aResult.stderr) errors.push(p1aResult.stderr.trim());
  if (p1aResult.stdout) errors.push(p1aResult.stdout.trim());
}

if (errors.length) {
  console.error('COSMOSKIN P1B admin product price read-only validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1B admin product price read-only validation passed.');
console.log('- admin product API exposes trusted read-only/effective catalog price fields');
console.log('- admin UI shows Katalog Fiyatı with permission-aware edit affordances');
console.log('- checkout/coupon/inventory/D3A/P1A regression guards remain intact');
