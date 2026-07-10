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

const priceDisplay = 'assets/price-display.js';
const priceCss = 'assets/price-display.css';
const productsData = 'assets/products-data.js';
const productPage = 'assets/product-page.js';
const appJs = 'assets/app.js';
const masterUpgrade = 'assets/master-upgrade.js';
const searchJs = 'js/search.js';
const checkoutFlow = 'assets/checkout-flow.js';
const couponClient = 'assets/coupon-client.js';
const cartCommerce = 'assets/cart-commerce.js';
const createCheckout = 'functions/api/create-checkout.js';
const couponValidate = 'functions/api/coupons/validate.js';
const pricing = 'functions/api/_lib/product-pricing.js';

for (const p of [
  priceDisplay, priceCss, productsData, productPage, appJs, masterUpgrade, searchJs,
  checkoutFlow, 'assets/collection-renderer.js', 'assets/allproducts.js', 'assets/bestsellers.js',
  'assets/phase6-commerce.js', 'assets/mobile-redesign.js', 'assets/js/smart-routine.js',
  couponClient, cartCommerce, createCheckout, couponValidate, pricing, 'products.json'
]) {
  mustExist(p);
}

const pdSrc = read(priceDisplay);
const cssSrc = read(priceCss);
const pdataSrc = read(productsData);
const pdpSrc = read(productPage);
const appSrc = read(appJs);
const masterSrc = read(masterUpgrade);
const searchSrc = read(searchJs);
const checkoutSrc = read(checkoutFlow);
const couponSrc = read(couponValidate);
const createCheckoutSrc = read(createCheckout);

// Helper module
mustInclude(pdSrc, priceDisplay, 'COSMOSKIN_PRICE_DISPLAY');
mustInclude(pdSrc, priceDisplay, 'normalizePriceDisplay');
mustInclude(pdSrc, priceDisplay, 'renderPriceHtml');
mustInclude(pdSrc, priceDisplay, 'getPayablePrice');
mustInclude(pdSrc, priceDisplay, 'shouldShowSalePrice');
mustInclude(pdSrc, priceDisplay, 'getCompareAtPrice');
mustNotMatch(pdSrc, priceDisplay, /compare_at_price_try[^;\n]*=\s*[^;\n]*payable/, 'compare-at must not be assigned to payable in helper');

// CSS premium sale styling
mustInclude(cssSrc, priceCss, '.cs-price--sale');
mustInclude(cssSrc, priceCss, '.cs-price__compare');
mustInclude(cssSrc, priceCss, '.cs-price__badge');
mustInclude(cssSrc, priceCss, 'min-width:0');

// products-data sale merge + bootstrap
mustInclude(pdataSrc, productsData, 'sale_price_try');
mustInclude(pdataSrc, productsData, 'compare_at_price_try');
mustInclude(pdataSrc, productsData, 'sale_active');
mustInclude(pdataSrc, productsData, 'price_display_mode');
mustInclude(pdataSrc, productsData, 'price-display.js');

// PDP runtime sale display + payable safety
mustInclude(pdpSrc, productPage, 'COSMOSKIN_PRICE_DISPLAY');
mustInclude(pdpSrc, productPage, 'renderPriceHtml');
mustInclude(pdpSrc, productPage, 'compare_at_price_try');
mustInclude(pdpSrc, productPage, 'sale_active');
mustInclude(pdpSrc, productPage, 'patchJsonLdOfferPrice');
mustInclude(pdpSrc, productPage, 'btn.dataset.price = String(price)');
mustInclude(pdpSrc, productPage, 'cosmoskin:products-updated');
mustNotMatch(pdpSrc, productPage, /compare_at_price_try[^;\n]*dataset\.price/, 'PDP must not set data-price from compare-at');
mustNotMatch(pdpSrc, productPage, /node\.offers\.price\s*=\s*String\([^)]*compare_at/, 'JSON-LD must not use compare-at as offer price');

// app.js cards + mini cart
mustInclude(appSrc, appJs, 'priceDisplayHtml');
mustInclude(appSrc, appJs, 'COSMOSKIN_PRICE_DISPLAY');
mustInclude(appSrc, appJs, 'cart-drawer-premium__price');

// PLP / cards / search
mustInclude(masterSrc, masterUpgrade, 'priceHtml');
mustInclude(read('assets/collection-renderer.js'), 'assets/collection-renderer.js', 'priceDisplayHtml');
mustInclude(read('assets/allproducts.js'), 'assets/allproducts.js', 'priceDisplayHtml');
mustInclude(read('assets/bestsellers.js'), 'assets/bestsellers.js', 'priceDisplayHtml');
mustInclude(read('assets/phase6-commerce.js'), 'assets/phase6-commerce.js', 'priceDisplayHtml');
mustInclude(searchSrc, searchJs, 'sale_active');
mustInclude(searchSrc, searchJs, 'compare_at_price_try');
mustInclude(searchSrc, searchJs, '_searchPriceHtml');

// Cart / checkout display (totals remain payable)
mustInclude(masterSrc, masterUpgrade, 'priceHtml(p, { compact: true, multiplier: qty');
mustInclude(checkoutSrc, checkoutFlow, 'checkoutItemPriceHtml');

// Compare-at never in commerce math
mustNotMatch(createCheckoutSrc, createCheckout, /compare_at_price_try/, 'create-checkout must not use compare_at_price_try');
mustNotMatch(couponSrc, couponValidate, /compare_at_price_try/, 'coupon validate must not use compare_at_price_try');
mustNotMatch(read('assets/cart-commerce.js'), 'assets/cart-commerce.js', /compare_at_price_try/, 'cart-commerce must not use compare_at_price_try');

// Future/expired/invalid fail-closed in helper
mustInclude(pdSrc, priceDisplay, "mode !== 'sale'");
mustInclude(pdSrc, priceDisplay, 'price_display_mode');

// products.json unchanged (bounded git check)
try {
  const productsDiff = spawnSync('git', ['diff', '--name-only', 'products.json'], { cwd: root, encoding: 'utf8', timeout: 5000 });
  if (productsDiff.error && productsDiff.error.code === 'ETIMEDOUT') {
    errors.push('git diff products.json timed out');
  } else if ((productsDiff.stdout || '').trim()) {
    errors.push('products.json was modified (forbidden for P1E3)');
  }
} catch (_error) {
  /* git unavailable in some environments; static commerce guards still apply */
}

// Regression guards via source inspection (Section 19 runs full validator chain separately).
mustInclude(read(pricing), pricing, 'compare_at_price_try');
mustInclude(read('assets/cart-commerce.js'), 'assets/cart-commerce.js', 'computeTotals');
mustInclude(appSrc, appJs, 'cart-drawer-premium__item');
mustInclude(appSrc, appJs, 'totals()');

if (errors.length) {
  console.error('COSMOSKIN P1E3 storefront sale display validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1E3 storefront sale display validation passed.');
