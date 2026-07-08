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
const mustMatch = (src, rel, re, message) => {
  if (!re.test(src)) errors.push(message || `${rel} did not match required pattern: ${re}`);
};

// ---------------------------------------------------------------------------
// Real PDP DOM fixtures (static HTML first paint)
// ---------------------------------------------------------------------------
const bojRel = 'products/beauty-of-joseon-relief-sun-spf50.html';
const bojHtml = read(bojRel);

mustInclude(bojHtml, bojRel, 'data-product-slug="beauty-of-joseon-relief-sun-spf50"');
mustMatch(bojHtml, bojRel, /<span class="pdp5-price">[^<]*899[^<]*<\/span>/, `${bojRel} must start with static ₺899 first paint for the fixture.`);
mustMatch(bojHtml, bojRel, /data-add-cart[^>]*data-price="899"/, `${bojRel} must include static data-price=\"899\" on add-to-cart buttons for the fixture.`);
mustMatch(bojHtml, bojRel, /"offers":\{[^}]*"price":"899"/, `${bojRel} must include JSON-LD Offer price \"899\" for the fixture.`);
mustMatch(bojHtml, bojRel, /id="mobileStickyPdp"[\s\S]*<strong>[^<]*899[^<]*<\/strong>/, `${bojRel} must include sticky PDP price \"899\" for the fixture.`);
mustInclude(bojHtml, bojRel, '/assets/product-page.js');

// ---------------------------------------------------------------------------
// Runtime patcher must exist in the actual PDP JS path
// ---------------------------------------------------------------------------
const productPage = read('assets/product-page.js');
for (const marker of [
  "fetch('/api/catalog/effective-prices'",
  "cache: 'no-store'",
  'patchPdpPriceSurfaces',
  '.pdp5-price',
  '.mobile-sticky-pdp__copy strong',
  'dataset.price = String(price)',
  "script[type=\"application/ld+json\"]",
  'node.offers.price = String(price)',
  'cosmoskin:products-updated',
  'effectivePriceApplied'
]) {
  mustInclude(productPage, 'assets/product-page.js', marker);
}

// Guardrails: never rely on localStorage as an authoritative price source.
mustMatch(productPage, 'assets/product-page.js', /getProductByHandle|getProductBySlug|effective-prices/, 'PDP runtime must use trusted catalog helpers and/or effective-prices API.');

// ---------------------------------------------------------------------------
// Safety regressions: products.json must be unchanged, and trusted checkout must remain.
// ---------------------------------------------------------------------------
try {
  const productsStat = statSync(join(root, 'products.json'));
  if (!productsStat.isFile()) errors.push('products.json is missing.');
} catch (error) {
  errors.push(`products.json check failed: ${error.message}`);
}
const diff = spawnSync('git', ['diff', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((diff.stdout || '').trim()) errors.push('products.json has uncommitted changes.');

// Ensure key pricing invariants remain, by chaining prior validators.
for (const script of [
  'scripts/validate-p1c3-effective-price-fallback-hardening.mjs',
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
  console.error('COSMOSKIN P1C4 live PDP effective price runtime validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN P1C4 live PDP effective price runtime validation passed.');
console.log('- static PDP first paint can be stale, but product-page.js patches PDP price surfaces from effective-prices and re-patches on products-updated');

