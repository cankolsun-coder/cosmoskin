#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BROWSER_CATALOG_PATH,
  CANONICAL_CATALOG_PATH,
  SERVER_CATALOG_MODULE_PATH,
  SERVER_CATALOG_PATH,
  buildServerCatalogPriceIndex,
  compareCatalogDocuments,
  extractBrowserFallbackCatalog,
  loadCanonicalCatalog,
  loadServerCatalog,
  normalizeCatalogPrice
} from './lib/product-price-catalog.mjs';

const root = process.cwd();
const errors = [];
const warnings = [];

const mustExist = (rel) => {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
};
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const mustInclude = (src, rel, marker) => {
  if (!src.includes(marker)) errors.push(`${rel} missing required marker: ${marker}`);
};
const mustNotMatch = (src, rel, re, message) => {
  if (re.test(src)) errors.push(message || `${rel} matched forbidden pattern: ${re}`);
};

const inspected = [
  CANONICAL_CATALOG_PATH,
  BROWSER_CATALOG_PATH,
  SERVER_CATALOG_PATH,
  SERVER_CATALOG_MODULE_PATH,
  'functions/api/create-checkout.js',
  'functions/api/coupons/validate.js',
  'functions/api/_lib/coupons.js',
  'functions/api/_lib/inventory.js',
  'functions/api/_lib/order-pricing-snapshot.js'
];

for (const rel of inspected) mustExist(rel);

if (errors.length) {
  console.error('COSMOSKIN P1A product price source drift validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const canonical = loadCanonicalCatalog(root);
errors.push(...canonical.errors);

let browserFallback;
let serverCatalog;
try {
  browserFallback = extractBrowserFallbackCatalog(root);
  errors.push(...browserFallback.errors);
} catch (error) {
  errors.push(error.message);
}

try {
  serverCatalog = await loadServerCatalog(root);
  errors.push(...serverCatalog.errors);
} catch (error) {
  errors.push(`Failed to load ${SERVER_CATALOG_PATH}: ${error.message}`);
}

if (browserFallback) {
  errors.push(...compareCatalogDocuments(canonical, browserFallback, BROWSER_CATALOG_PATH));
  if (browserFallback.updated && canonical.updated && browserFallback.updated !== canonical.updated) {
    warnings.push(
      `${BROWSER_CATALOG_PATH} fallback updated stamp (${browserFallback.updated}) differs from ${CANONICAL_CATALOG_PATH} (${canonical.updated}); runtime fetch mitigates but offline first-paint may be stale.`
    );
  }
}

if (serverCatalog) {
  errors.push(...compareCatalogDocuments(canonical, serverCatalog, SERVER_CATALOG_PATH));
  if (serverCatalog.updated && canonical.updated && serverCatalog.updated !== canonical.updated) {
    errors.push(`${SERVER_CATALOG_PATH} updated stamp (${serverCatalog.updated}) differs from ${CANONICAL_CATALOG_PATH} (${canonical.updated})`);
  }
}

const catalogSrc = read(SERVER_CATALOG_MODULE_PATH);
mustInclude(catalogSrc, SERVER_CATALOG_MODULE_PATH, "import productSource from './products-data.js'");
mustInclude(catalogSrc, SERVER_CATALOG_MODULE_PATH, 'price: Number(product.price || 0)');

const checkout = read('functions/api/create-checkout.js');
const couponValidate = read('functions/api/coupons/validate.js');
const inventory = read('functions/api/_lib/inventory.js');
const orderSnapshot = read('functions/api/_lib/order-pricing-snapshot.js');
const browserSrc = read(BROWSER_CATALOG_PATH);

mustInclude(checkout, 'functions/api/create-checkout.js', "import { catalog } from './_lib/catalog.js'");
mustInclude(checkout, 'functions/api/create-checkout.js', 'const unitPrice = normalizeMoney(product.price)');
mustInclude(checkout, 'functions/api/create-checkout.js', 'buildOrderItemPricingSnapshots');
mustInclude(checkout, 'functions/api/create-checkout.js', 'buildIyzicoBasketItems');
mustNotMatch(
  checkout,
  'functions/api/create-checkout.js',
  /rawItem\.(?:price|unit_price|unitPrice)/,
  'create-checkout must not trust client-submitted unit price from raw cart items.'
);
mustNotMatch(
  checkout,
  'functions/api/create-checkout.js',
  /\bbody\.(?:total|subtotal|amount)\b/,
  'create-checkout must not trust client-submitted order totals.'
);

mustInclude(couponValidate, 'functions/api/coupons/validate.js', 'buildPricedCatalogIndex');
mustInclude(couponValidate, 'functions/api/coupons/validate.js', 'buildTrustedCartLines');
mustInclude(couponValidate, 'functions/api/coupons/validate.js', 'const unitPrice = Number(product?.price || 0)');
mustNotMatch(
  couponValidate,
  'functions/api/coupons/validate.js',
  /\bbody\.subtotal\b|\bsubtotal\s*=\s*Number\s*\(\s*body\.subtotal/i,
  'Coupon validate endpoint must not trust client-provided subtotal.'
);

mustInclude(inventory, 'functions/api/_lib/inventory.js', "import { catalog, products } from './catalog.js'");
mustInclude(inventory, 'functions/api/_lib/inventory.js', 'catalogProduct(slug)');
mustInclude(inventory, 'functions/api/_lib/inventory.js', 'if (!catalogProduct(normalized))');

mustInclude(orderSnapshot, 'functions/api/_lib/order-pricing-snapshot.js', 'paid_unit_price');
mustInclude(orderSnapshot, 'functions/api/_lib/order-pricing-snapshot.js', 'paid_line_total');

mustInclude(browserSrc, BROWSER_CATALOG_PATH, 'Editable source of truth: /products.json');
mustInclude(browserSrc, BROWSER_CATALOG_PATH, "fetch('/products.json'");

try {
  const catalogModule = await import(new URL('../functions/api/_lib/catalog.js', import.meta.url).href);
  const runtimeIndex = buildServerCatalogPriceIndex(catalogModule);
  for (const slug of canonical.slugs) {
    const runtime = runtimeIndex.get(slug);
    const expected = canonical.bySlug.get(slug);
    if (!runtime) {
      errors.push(`catalog.js runtime missing slug ${slug}`);
      continue;
    }
    if (!runtime.priceOk) errors.push(runtime.priceError);
    if (runtime.price !== expected.price) {
      errors.push(`catalog.js:${slug}: runtime price drift (${runtime.price} !== canonical ${expected.price})`);
    }
    if (runtime.id !== expected.id) {
      errors.push(`catalog.js:${slug}: runtime id drift (${runtime.id} !== canonical ${expected.id})`);
    }
  }
  for (const slug of runtimeIndex.keys()) {
    if (!canonical.slugs.has(slug)) {
      errors.push(`catalog.js runtime has extra slug ${slug}`);
    }
  }
} catch (error) {
  errors.push(`Failed to load runtime catalog module: ${error.message}`);
}

for (const slug of canonical.slugs) {
  const product = canonical.bySlug.get(slug);
  const priceCheck = normalizeCatalogPrice(product.price, `${CANONICAL_CATALOG_PATH}:${slug}`);
  if (!priceCheck.ok) errors.push(priceCheck.message);
}

const migrationsDir = join(root, 'supabase/migrations');
if (existsSync(migrationsDir)) {
  const p1aMigrations = readdirSync(migrationsDir).filter((name) => /p1a|price_source_drift/i.test(name));
  if (p1aMigrations.length) {
    errors.push(`P1A must not add migrations: ${p1aMigrations.join(', ')}`);
  }
}

if (warnings.length) {
  console.warn('COSMOSKIN P1A product price source drift validation warnings:');
  warnings.forEach((w) => console.warn(`- ${w}`));
}

if (errors.length) {
  console.error('COSMOSKIN P1A product price source drift validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1A product price source drift validation passed.');
console.log(`- canonical: ${CANONICAL_CATALOG_PATH} (${canonical.slugs.size} products, updated ${canonical.updated || 'n/a'})`);
console.log(`- browser fallback aligned: ${BROWSER_CATALOG_PATH}`);
console.log(`- server catalog aligned: ${SERVER_CATALOG_PATH}`);
console.log('- checkout/coupon/inventory/D3A snapshot paths use trusted server catalog price');
