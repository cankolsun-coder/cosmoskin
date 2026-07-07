#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function mustExist(rel) {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
}

function mustInclude(src, rel, needle) {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}`);
}

function mustMatch(src, rel, re, message) {
  if (!re.test(src)) errors.push(message || `${rel} missing required pattern: ${re}`);
}

function mustNotMatch(src, rel, re, message) {
  if (re.test(src)) errors.push(message || `${rel} matched forbidden pattern: ${re}`);
}

const files = {
  productsJson: 'products.json',
  productsData: 'assets/products-data.js',
  app: 'assets/app.js',
  productPage: 'assets/product-page.js',
  mobile: 'assets/mobile-redesign.js',
  checkoutFlow: 'assets/checkout-flow.js',
  search: 'js/search.js',
  collection: 'assets/collection-renderer.js',
  allproducts: 'assets/allproducts.js',
  effectiveApi: 'functions/api/catalog/effective-prices.js',
  pricing: 'functions/api/_lib/product-pricing.js',
  checkout: 'functions/api/create-checkout.js',
  couponValidate: 'functions/api/coupons/validate.js',
  coupons: 'functions/api/_lib/coupons.js',
  snapshot: 'functions/api/_lib/order-pricing-snapshot.js',
  inventory: 'functions/api/_lib/inventory.js',
  returns: 'functions/api/returns.js',
  adminProducts: 'functions/api/admin/products.js',
  adminPrice: 'functions/api/admin/products/[slug]/price.js',
  adminOrders: 'functions/api/admin/orders.js',
  accountOrders: 'functions/api/account/orders.js',
  adminRefunds: 'functions/api/admin/refunds.js',
  tests: 'tests/local-integration.test.mjs'
};

Object.values(files).forEach(mustExist);

if (errors.length) {
  console.error('COSMOSKIN P1C2 effective price commerce integrity validation failed (missing files):');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const productsData = read(files.productsData);
const app = read(files.app);
const productPage = read(files.productPage);
const mobile = read(files.mobile);
const checkoutFlow = read(files.checkoutFlow);
const effectiveApi = read(files.effectiveApi);
const pricing = read(files.pricing);
const checkout = read(files.checkout);
const couponValidate = read(files.couponValidate);
const coupons = read(files.coupons);
const snapshot = read(files.snapshot);
const inventory = read(files.inventory);
const returnsApi = read(files.returns);
const adminProducts = read(files.adminProducts);
const adminPrice = read(files.adminPrice);
const adminOrders = read(files.adminOrders);
const accountOrders = read(files.accountOrders);
const adminRefunds = read(files.adminRefunds);
const tests = read(files.tests);

for (const marker of [
  '/api/catalog/effective-prices',
  'mergeEffectivePrices',
  'effective_price_try',
  'effective_currency',
  'effective_price_source',
  'base_catalog_price_try',
  'has_price_override',
  'price_override_valid',
  'price_warning'
]) {
  mustInclude(productsData, files.productsData, marker);
}
mustInclude(productsData, files.productsData, "fetch('/api/catalog/effective-prices', { cache: 'no-store' })");
mustInclude(effectiveApi, files.effectiveApi, "'Cache-Control': 'no-store, max-age=0'");
mustInclude(effectiveApi, files.effectiveApi, 'price_override_valid');
mustInclude(effectiveApi, files.effectiveApi, 'price_warning');

for (const marker of [
  'normalizeProductReference',
  'COSMOSKIN_PRODUCT_HELPERS',
  '.pdp5-price',
  '.pdp5-actions [data-add-cart]',
  '[data-buy-now]',
  'script[type="application/ld+json"]',
  'refreshCatalogDrivenState',
  'canonicalizeCartItems',
  'cosmoskin:products-updated'
]) {
  mustInclude(app, files.app, marker);
}
mustInclude(productPage, files.productPage, 'effective_price_try');
mustInclude(productPage, files.productPage, 'getProductByHandle');
mustMatch(productPage, files.productPage, /price:\s*Number\(effective\?\./, 'PDP buy-now must resolve effective product price before adding to cart.');
mustMatch(mobile, files.mobile, /p && p\.price != null \? p\.price : raw\.price/, 'Mobile cart normalization must prefer effective product price over stored cart price.');
mustMatch(checkoutFlow, files.checkoutFlow, /product\.price != null \? product\.price :/, 'Checkout UI normalization must prefer effective product price over stored cart price.');
mustInclude(checkoutFlow, files.checkoutFlow, 'cosmoskin:products-updated');

for (const rel of [files.search, files.collection, files.allproducts]) {
  const src = read(rel);
  mustInclude(src, rel, 'COSMOSKIN_PRODUCTS');
  mustInclude(src, rel, 'price');
}
mustInclude(read(files.search), files.search, 'COSMOSKIN_PRODUCTS_READY');
mustInclude(read(files.collection), files.collection, 'cosmoskin:products-updated');
mustInclude(read(files.allproducts), files.allproducts, 'COSMOSKIN_PRODUCTS_READY');

mustInclude(pricing, files.pricing, 'buildPricedCatalogIndex');
mustInclude(pricing, files.pricing, 'resolveEffectivePricing');
mustInclude(pricing, files.pricing, 'product_price_overrides');
mustInclude(checkout, files.checkout, 'buildPricedCatalogIndex');
mustInclude(checkout, files.checkout, 'normalizeCart(context, payload.cart || [])');
mustNotMatch(checkout, files.checkout, /rawItem\.(?:price|unit_price|unitPrice|line_total|lineTotal)/, 'Checkout must not trust client-submitted item price or line total.');
mustInclude(checkout, files.checkout, 'buildIyzicoBasketItems(cart, totals.shipping, totals.discount || 0, coupon)');
mustInclude(checkout, files.checkout, 'buildOrderItemPricingSnapshots(cart, totals.discount || 0');
mustInclude(checkout, files.checkout, 'const vat = normalizeMoney((discountedSubtotal * VAT_RATE) / (1 + VAT_RATE));');
mustInclude(checkout, files.checkout, 'reserveInventoryForOrder(context, orderId, cart');

mustInclude(couponValidate, files.couponValidate, 'buildPricedCatalogIndex');
mustInclude(couponValidate, files.couponValidate, 'validateCouponEligibility');
mustInclude(coupons, files.coupons, 'eligibleSubtotal');
mustInclude(coupons, files.coupons, 'min_subtotal');
mustInclude(snapshot, files.snapshot, 'paid_unit_price');
mustInclude(snapshot, files.snapshot, 'paid_line_total');
mustInclude(snapshot, files.snapshot, 'PRICING_SNAPSHOT_VERSION_V2');

mustInclude(inventory, files.inventory, 'product_slug');
mustInclude(inventory, files.inventory, 'quantity');
mustNotMatch(inventory, files.inventory, /rawItem\.(?:price|unit_price)|client.*price/i, 'Inventory lifecycle must not depend on client price.');
mustInclude(adminProducts, files.adminProducts, 'Fiyat güncellemesi bu uçtan yapılamaz.');
mustInclude(adminPrice, files.adminPrice, "requireAdminPermission(context, 'products:pricing:update')");
mustNotMatch(adminPrice, files.adminPrice, /stock_(?:qty|on_hand|reserved)|available_stock|quantity/i, 'Price update endpoint must not update stock fields.');
mustInclude(adminPrice, files.adminPrice, 'upsertAdminProductPriceOverride');
mustInclude(pricing, files.pricing, 'product_price_audit_logs');
mustInclude(pricing, files.pricing, 'PRICE_AUDIT_FAILED');

for (const rel of [files.returns, files.adminRefunds]) {
  const src = read(rel);
  mustInclude(src, rel, 'paid_unit_price');
  mustInclude(src, rel, 'paid_line_total');
  mustNotMatch(src, rel, /buildPricedCatalogIndex|resolveEffectivePricing|product_price_overrides/, `${rel} must not recalculate refunds from current overrides.`);
}
for (const rel of [files.adminOrders, files.accountOrders]) {
  const src = read(rel);
  mustInclude(src, rel, 'order_items');
  mustInclude(src, rel, 'unit_price');
  mustInclude(src, rel, 'line_total');
  mustNotMatch(src, rel, /buildPricedCatalogIndex|resolveEffectivePricing|product_price_overrides/, `${rel} must display stored order prices, not current overrides.`);
}

for (const marker of [
  'P1C2: effective 1099 TRY price drives checkout',
  'beauty-of-joseon-relief-sun-spf50',
  'regular_price_try: 1099',
  'price: 899',
  'paid_unit_price',
  'PRICE_AUDIT_FAILED'
]) {
  mustInclude(tests, files.tests, marker);
}

const productsDiff = spawnSync('git', ['diff', '--name-only', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if (productsDiff.status === 0 && productsDiff.stdout.trim()) {
  errors.push('products.json is modified; P1C2 must not change static catalog prices.');
}

for (const [script, label] of [
  ['scripts/validate-p1c-admin-product-price-editing.mjs', 'P1C admin price editing'],
  ['scripts/validate-p1b-admin-product-price-readonly.mjs', 'P1B admin read-only pricing'],
  ['scripts/validate-p1a-product-price-source-drift.mjs', 'P1A price source drift']
]) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${label} regressed (${script}).`);
    if (result.stderr) errors.push(result.stderr.trim());
    if (result.stdout) errors.push(result.stdout.trim());
  }
}

if (errors.length) {
  console.error('COSMOSKIN P1C2 effective price commerce integrity validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN P1C2 effective price commerce integrity validation passed.');
console.log('- PDP, PLP/search/favorites/cart/checkout use the shared effective price path');
console.log('- checkout/coupon/Iyzico/order snapshots stay server-trusted and gross KDV-inclusive');
console.log('- inventory, refund/history, admin order/customer order, and P1A/P1B/P1C guards remain intact');
