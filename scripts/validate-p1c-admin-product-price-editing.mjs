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

const migration = 'supabase/migrations/20260707_p1c_admin_product_price_editing.sql';
const pricingLib = 'functions/api/_lib/product-pricing.js';
const adminProducts = 'functions/api/admin/products.js';
const adminPrice = 'functions/api/admin/products/[slug]/price.js';
const adminUi = 'assets/admin-products.js';
const effectivePrices = 'functions/api/catalog/effective-prices.js';
const productsData = 'assets/products-data.js';
const checkout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';
const orderSnapshot = 'functions/api/_lib/order-pricing-snapshot.js';
const inventory = 'functions/api/_lib/inventory.js';
const productsJson = 'products.json';

for (const rel of [
  migration, pricingLib, adminProducts, adminPrice, adminUi, effectivePrices,
  productsData, checkout, couponValidate, orderSnapshot, inventory, productsJson,
  'scripts/validate-p1a-product-price-source-drift.mjs',
  'scripts/validate-p1b-admin-product-price-readonly.mjs'
]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN P1C admin product price editing validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const migrationSrc = read(migration);
const pricingSrc = read(pricingLib);
const adminProductsSrc = read(adminProducts);
const adminPriceSrc = read(adminPrice);
const adminUiSrc = read(adminUi);
const effectiveSrc = read(effectivePrices);
const productsDataSrc = read(productsData);
const checkoutSrc = read(checkout);
const couponSrc = read(couponValidate);

for (const marker of [
  'product_price_overrides',
  'product_price_audit_logs',
  'products:pricing:update',
  'regular_price_try > 0',
  "currency in ('TRY')"
]) {
  mustInclude(migrationSrc, migration, marker);
}

mustInclude(pricingSrc, pricingLib, 'resolveEffectivePricing');
mustInclude(pricingSrc, pricingLib, 'buildPricedCatalogIndex');
mustInclude(pricingSrc, pricingLib, 'upsertAdminProductPriceOverride');
mustInclude(pricingSrc, pricingLib, 'product_price_audit_logs');
mustInclude(pricingSrc, pricingLib, 'Fiyat tam TL olarak kaydedilmelidir.');
mustInclude(pricingSrc, pricingLib, 'Ürün katalogda bulunamadı.');

mustInclude(adminPriceSrc, adminPrice, "requireAdminPermission(context, 'products:pricing:update')");
mustInclude(adminProductsSrc, adminProducts, 'buildAdminPricingFields');
mustInclude(adminProductsSrc, adminProducts, 'permissions');
mustInclude(adminProductsSrc, adminProducts, 'can_edit_price');
mustInclude(adminProductsSrc, adminProducts, 'Fiyat güncellemesi bu uçtan yapılamaz.');

mustNotMatch(adminProductsSrc, adminProducts, /products\.price_try|selectRows\([^)]*['"]products['"]/i, 'Admin products inventory route must not read Supabase products.price_try.');
mustNotMatch(adminPriceSrc, adminPrice, /products\.json|writeFile|fs\./i, 'Admin price route must not write static products.json.');

mustInclude(adminUiSrc, adminUi, 'Fiyatı güncelle');
mustInclude(adminUiSrc, adminUi, '/api/admin/products/');
mustInclude(adminUiSrc, adminUi, 'can_edit_price');
mustInclude(adminUiSrc, adminUi, 'regular_price_try');

mustInclude(effectiveSrc, effectivePrices, 'effective_price_try');
mustInclude(effectiveSrc, effectivePrices, '/api/catalog/effective-prices');
mustInclude(productsDataSrc, productsData, '/api/catalog/effective-prices');
mustInclude(productsDataSrc, productsData, 'mergeEffectivePrices');

mustInclude(checkoutSrc, checkout, 'buildPricedCatalogIndex');
mustNotMatch(checkoutSrc, checkout, /rawItem\.(?:price|unit_price|unitPrice)/, 'Checkout must ignore client-submitted unit price.');
mustInclude(couponSrc, couponValidate, 'buildPricedCatalogIndex');

mustNotMatch(
  read(productsJson),
  productsJson,
  /"price"\s*:\s*null/,
  'products.json must not be modified with null prices in P1C.'
);

const forbiddenSql = readdirSync(join(root, 'supabase/migrations')).filter((name) => /p1d/i.test(name));
if (forbiddenSql.length) errors.push(`P1C must not add P1D migrations: ${forbiddenSql.join(', ')}`);

for (const [script, label] of [
  ['scripts/validate-p1a-product-price-source-drift.mjs', 'P1A drift guard'],
  ['scripts/validate-p1b-admin-product-price-readonly.mjs', 'P1B read-only guard'],
  ['scripts/validate-c1-coupon-eligibility-hardening.mjs', 'C1 coupon hardening'],
  ['scripts/validate-d3-refund-snapshot-persistence.mjs', 'D3A snapshot persistence'],
  ['scripts/validate-i1-inventory-checkout-blocking.mjs', 'I1 inventory blocking']
]) {
  const abs = join(root, script);
  if (!existsSync(abs)) continue;
  const result = spawnSync(process.execPath, [abs], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${label} regressed (${script}).`);
    if (result.stderr) errors.push(result.stderr.trim());
    if (result.stdout) errors.push(result.stdout.trim());
  }
}

if (errors.length) {
  console.error('COSMOSKIN P1C admin product price editing validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1C admin product price editing validation passed.');
console.log('- DB override layer + audit migration present (not executed from Cursor)');
console.log('- trusted server resolver wired into checkout, coupons, storefront overlay, and admin price API');
