#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
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

const search = read('js/search.js');
const bestsellers = read('assets/bestsellers.js');
const smartRoutine = read('assets/js/smart-routine.js');
const pdpProfessional = read('assets/pdp-professional.js');
const app = read('assets/app.js');
const checkout = read('functions/api/create-checkout.js');
const coupons = read('functions/api/coupons/validate.js');
const returnsApi = read('functions/api/returns.js');
const effectiveApi = read('functions/api/catalog/effective-prices.js');

for (const marker of [
  '/api/catalog/effective-prices',
  '_applyEffectiveOverlay',
  '_fetchEffectivePrices',
  'cosmoskin:products-updated',
  '_refreshVisibleResults'
]) {
  mustInclude(search, 'js/search.js', marker);
}

mustNotMatch(search, 'js/search.js', /localStorage[^\\n]*price/i, 'Search must not trust localStorage price.');
mustNotMatch(search, 'js/search.js', /_products\s*=\s*json\.products\s*\|\|\s*\[\]/, 'Search must not leave raw products.json prices without effective overlay.');

mustInclude(bestsellers, 'assets/bestsellers.js', 'cosmoskin:products-updated');
mustInclude(bestsellers, 'assets/bestsellers.js', 'getProductBySlug');
mustInclude(bestsellers, 'assets/bestsellers.js', 'currentTab');

for (const marker of [
  'resolveCatalogPrice',
  'refreshRoutinePricesFromCatalog',
  'cosmoskin:products-updated',
  'resolveCatalogPrice(product.slug, product.price)'
]) {
  mustInclude(smartRoutine, 'assets/js/smart-routine.js', marker);
}

mustNotMatch(smartRoutine, 'assets/js/smart-routine.js', /localStorage[^\\n]*price/i, 'Smart routine must not trust localStorage price.');

for (const marker of [
  'catalogPriceForSlug',
  'COSMOSKIN_PRODUCT_HELPERS',
  'cosmoskin:products-updated',
  'refreshPdpProfessionalPricing'
]) {
  mustInclude(pdpProfessional, 'assets/pdp-professional.js', marker);
}

mustInclude(app, 'assets/app.js', 'node.offers.price = String(product.price)');
mustInclude(app, 'assets/app.js', '.pdp5-price');
mustInclude(effectiveApi, 'functions/api/catalog/effective-prices.js', "'Cache-Control': 'no-store, max-age=0'");
mustInclude(checkout, 'functions/api/create-checkout.js', 'buildPricedCatalogIndex');
mustInclude(coupons, 'functions/api/coupons/validate.js', 'buildPricedCatalogIndex');
mustInclude(returnsApi, 'functions/api/returns.js', 'paid_unit_price');
mustInclude(returnsApi, 'functions/api/returns.js', 'paid_line_total');

try {
  const productsStat = statSync(join(root, 'products.json'));
  const gitDiff = spawnSync('git', ['diff', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
  if (gitDiff.stdout && gitDiff.stdout.trim()) {
    errors.push('products.json has uncommitted changes.');
  }
  if (!productsStat.isFile()) errors.push('products.json is missing.');
} catch (error) {
  errors.push(`products.json check failed: ${error.message}`);
}

const migrationHits = spawnSync('git', ['ls-files', 'supabase/migrations/*p1c3*'], { cwd: root, encoding: 'utf8' });
if (migrationHits.stdout && migrationHits.stdout.trim()) {
  errors.push('Unexpected P1C3 migration file detected.');
}

for (const script of [
  'scripts/validate-p1c-effective-price-commerce-integrity.mjs',
  'scripts/validate-p1c-effective-price-display-parity.mjs',
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
  console.error('COSMOSKIN P1C3 effective price fallback hardening validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN P1C3 effective price fallback hardening validation passed.');
console.log('- search/bestsellers/smart-routine/PDP fallback surfaces refresh effective prices after overlay updates');
console.log('- checkout/coupon/refund/inventory/P1A-P1C2 guards remain intact');
