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

const frameCss = 'assets/product-card-frame.css';
const productsData = 'assets/products-data.js';
const collectionRenderer = 'assets/collection-renderer.js';
const bestsellers = 'assets/bestsellers.js';
const allproducts = 'assets/allproducts.js';
const phase6 = 'assets/phase6-commerce.js';
const priceDisplay = 'assets/price-display.js';
const createCheckout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';
const tests = 'tests/local-integration.test.mjs';

for (const p of [
  frameCss, productsData, collectionRenderer, bestsellers, allproducts, phase6,
  'assets/master-upgrade.js', 'assets/mobile-redesign.js', 'assets/js/smart-routine.js',
  'js/search.js', priceDisplay, createCheckout, couponValidate, 'products.json', tests
]) {
  mustExist(p);
}

const frameSrc = read(frameCss);
const pdataSrc = read(productsData);
const collSrc = read(collectionRenderer);
const bestSrc = read(bestsellers);
const apSrc = read(allproducts);
const p6Src = read(phase6);
const testSrc = read(tests);

// Shared media frame system
mustInclude(frameSrc, frameCss, 'aspect-ratio');
mustInclude(frameSrc, frameCss, 'object-fit: contain');
mustInclude(frameSrc, frameCss, '.cs-product-card__media');
mustInclude(frameSrc, frameCss, '.product-card .product-media');
mustInclude(frameSrc, frameCss, '-webkit-line-clamp: 2');
mustInclude(frameSrc, frameCss, 'min-width: 0');
mustInclude(frameSrc, frameCss, '.phase6-rec-card img');
mustInclude(frameSrc, frameCss, '.smart-routine__product-media');
mustInclude(frameSrc, frameCss, 'body.cm-mobile-active .cm-product-card__media');
mustNotMatch(frameSrc, frameCss, /object-fit:\s*cover/, 'product card images must not use object-fit: cover');

// Bootstrap on storefront
mustInclude(pdataSrc, productsData, 'product-card-frame.css');
mustInclude(pdataSrc, productsData, 'product-card-frame-css');

// Renderers share cs-product-card
mustInclude(collSrc, collectionRenderer, 'product-card cs-product-card');
mustInclude(bestSrc, bestsellers, 'product-card cs-product-card bestseller-card');
mustInclude(apSrc, allproducts, 'product-card cs-product-card cs-catalog-card');
mustInclude(p6Src, phase6, 'product-card cs-product-card pdp-related-card');

// Images must not rely on natural height in mobile.css product card rule
const mobileCss = read('assets/mobile.css');
mustNotMatch(mobileCss, 'assets/mobile.css', /\.product-media img\s*\{[^}]*height:\s*auto/, 'mobile.css must not let product-media img height:auto drive card size');

// P1E sale display untouched
mustInclude(read(priceDisplay), priceDisplay, 'getPayablePrice');
mustNotMatch(read(priceDisplay), priceDisplay, /compare_at_price_try[^;\n]*=\s*[^;\n]*payable/, 'compare-at must not become payable in price display helper');

// Commerce paths untouched
mustNotMatch(read(createCheckout), createCheckout, /(?:unit_price|line_total)\s*=\s*[^;]*compare_at_price_try/, 'create-checkout must not assign payable from compare-at');
mustNotMatch(read(couponValidate), couponValidate, /compare_at_price_try/, 'coupon validate must not reference compare-at');

// Tests cover UX2
mustInclude(testSrc, tests, 'UX2:');
mustInclude(testSrc, tests, 'product-card-frame.css');
mustInclude(testSrc, tests, 'aspect-ratio');
mustInclude(testSrc, tests, 'cs-product-card');

// products.json must not be modified in this slice (static guard)
const productsJson = read('products.json');
if (productsJson.includes('"__ux2_modified__"')) {
  errors.push('products.json must not be modified for UX2');
}

for (const [script, label] of [
  ['scripts/validate-p1e3-storefront-sale-display.mjs', 'P1E3 storefront'],
  ['scripts/validate-c3-minicart-parity-premium-redesign.mjs', 'C3 minicart']
]) {
  const result = spawnSync('node', [join(root, script)], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    errors.push(`${label} regressed (${script}).`);
    if (result.stdout) errors.push(result.stdout.trim().split('\n').slice(-4).join('\n'));
    if (result.stderr) errors.push(result.stderr.trim().split('\n').slice(-4).join('\n'));
  }
}

if (errors.length) {
  console.error('COSMOSKIN UX2 product card image frame standardization validation failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log('COSMOSKIN UX2 product card image frame standardization validation passed.');
console.log('- Product card media uses fixed aspect-ratio frames with object-fit: contain');
console.log('- Listing/search/recommendation surfaces share cs-product-card frame guards');
console.log('- P1E sale display and commerce paths remain untouched');
