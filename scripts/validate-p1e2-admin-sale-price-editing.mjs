#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
const mustExist = (p) => { if (!existsSync(join(root, p))) errors.push(`Missing: ${p}`); };
const read = (p) => readFileSync(join(root, p), 'utf8');
const mustInclude = (src, p, needle) => { if (!src.includes(needle)) errors.push(`${p} missing: ${needle}`); };
const mustNotMatch = (src, p, re, message) => { if (re.test(src)) errors.push(message || `${p} matched forbidden: ${re}`); };

const pricing = 'functions/api/_lib/product-pricing.js';
const adminPrice = 'functions/api/admin/products/[slug]/price.js';
const adminHistory = 'functions/api/admin/products/[slug]/price-history.js';
const adminProducts = 'functions/api/admin/products.js';
const adminUi = 'assets/admin-products.js';
const checkout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';

for (const p of [pricing, adminPrice, adminHistory, adminProducts, adminUi, checkout, couponValidate, 'products.json']) {
  mustExist(p);
}

const pricingSrc = read(pricing);
const adminPriceSrc = read(adminPrice);
const adminHistorySrc = read(adminHistory);
const adminProductsSrc = read(adminProducts);
const adminUiSrc = read(adminUi);
const checkoutSrc = read(checkout);
const couponSrc = read(couponValidate);

mustInclude(adminPriceSrc, adminPrice, 'validateAdminPriceUpdateInput');
mustInclude(adminPriceSrc, adminPrice, 'sale_price_try');
mustInclude(adminPriceSrc, adminPrice, 'compare_at_price_try');
mustInclude(adminPriceSrc, adminPrice, "requireAdminPermission(context, 'products:pricing:update')");
mustInclude(pricingSrc, pricing, 'P1E_MIGRATION_REQUIRED_CODE');
mustInclude(pricingSrc, pricing, 'İndirimli fiyat normal fiyattan düşük olmalıdır.');
mustInclude(pricingSrc, pricing, 'Karşılaştırma fiyatı indirimli fiyattan yüksek olmalıdır.');
mustInclude(pricingSrc, pricing, 'İndirim tarihi aralığı geçerli değil.');
mustInclude(pricingSrc, pricing, 'old_sale_price_try');
mustInclude(pricingSrc, pricing, 'new_compare_at_price_try');
mustInclude(adminHistorySrc, adminHistory, 'normalizePriceHistoryItem');
mustInclude(adminHistorySrc, adminHistory, 'event_label');
mustInclude(adminProductsSrc, adminProducts, 'sale_price_try');
mustInclude(adminProductsSrc, adminProducts, 'Fiyat güncellemesi bu uçtan yapılamaz.');

mustInclude(adminUiSrc, adminUi, 'İndirimli fiyat');
mustInclude(adminUiSrc, adminUi, 'Üstü çizili fiyat');
mustInclude(adminUiSrc, adminUi, 'Sadece görsel karşılaştırma için kullanılır, tahsil edilmez.');
mustInclude(adminUiSrc, adminUi, 'data-price-sale');
mustInclude(adminUiSrc, adminUi, 'data-price-compare');
mustInclude(adminUiSrc, adminUi, 'validatePriceForm');
mustInclude(adminUiSrc, adminUi, 'data-price-error');

mustNotMatch(pricingSrc, pricing, /effective_price_try\s*=\s*compare_at_price_try/, 'compare_at_price_try must never become payable');
mustNotMatch(checkoutSrc, checkout, /(?:unit_price|line_total)\s*=\s*[^;]*compare_at_price_try/, 'checkout must not assign payable from compare_at_price_try');
mustNotMatch(couponSrc, couponValidate, /compare_at_price_try/, 'coupon validation must not use compare_at_price_try');

for (const [script, label] of [
  ['scripts/validate-p1e1-sale-price-resolver-model.mjs', 'P1E1 resolver'],
  ['scripts/validate-p1d-admin-price-audit-history.mjs', 'P1D history'],
  ['scripts/validate-p1c-admin-product-price-editing.mjs', 'P1C admin price editing']
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
  console.error('COSMOSKIN P1E2 admin sale price editing validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1E2 admin sale price editing validation passed.');
