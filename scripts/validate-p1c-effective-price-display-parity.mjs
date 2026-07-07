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

const productsData = read('assets/products-data.js');
const app = read('assets/app.js');
const productPage = read('assets/product-page.js');
const checkoutFlow = read('assets/checkout-flow.js');
const mobile = read('assets/mobile-redesign.js');
const effectiveApi = read('functions/api/catalog/effective-prices.js');

for (const marker of [
  'mergeEffectivePrices',
  '/api/catalog/effective-prices',
  'effective_price_try',
  'price_try',
  'price_override_valid',
  'price_warning'
]) {
  mustInclude(productsData, 'assets/products-data.js', marker);
}

for (const marker of [
  'normalizeProductReference',
  '.pdp5-price',
  '.pdp5-actions [data-add-cart]',
  '[data-buy-now]',
  '.product-card',
  'canonicalizeCartItems',
  'cosmoskin:products-updated'
]) {
  mustInclude(app, 'assets/app.js', marker);
}

mustInclude(productPage, 'assets/product-page.js', 'getProductByHandle');
mustInclude(productPage, 'assets/product-page.js', 'effective_price_try');
mustInclude(checkoutFlow, 'assets/checkout-flow.js', 'product.price != null ? product.price');
mustInclude(checkoutFlow, 'assets/checkout-flow.js', 'cosmoskin:products-updated');
mustInclude(mobile, 'assets/mobile-redesign.js', 'p && p.price != null ? p.price : raw.price');
mustInclude(effectiveApi, 'functions/api/catalog/effective-prices.js', "'Cache-Control': 'no-store, max-age=0'");

for (const rel of ['js/search.js', 'assets/collection-renderer.js', 'assets/allproducts.js']) {
  const src = read(rel);
  mustInclude(src, rel, 'COSMOSKIN_PRODUCTS');
  mustInclude(src, rel, 'price');
}

mustNotMatch(productPage, 'assets/product-page.js', /price:\s*Number\(btn\.dataset\.price/, 'PDP must not add static data-price to cart when effective product lookup exists.');

const parent = spawnSync(process.execPath, ['scripts/validate-p1c-effective-price-commerce-integrity.mjs'], { cwd: root, encoding: 'utf8' });
if (parent.status !== 0) {
  errors.push('P1C2 commerce integrity validator failed.');
  if (parent.stderr) errors.push(parent.stderr.trim());
  if (parent.stdout) errors.push(parent.stdout.trim());
}

if (errors.length) {
  console.error('COSMOSKIN P1C effective price display parity validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN P1C effective price display parity validation passed.');
console.log('- PDP/PLP/search/favorites/cart display surfaces share the effective product price overlay.');
