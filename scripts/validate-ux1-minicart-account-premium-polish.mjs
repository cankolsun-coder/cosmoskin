#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const has = (rel) => existsSync(join(root, rel));

function mustExist(rel) {
  if (!has(rel)) errors.push(`Missing required file: ${rel}`);
}
function mustInclude(src, rel, needle) {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}`);
}
function mustNotInclude(src, rel, needle) {
  if (src.includes(needle)) errors.push(`${rel} must not include forbidden marker: ${needle}`);
}
function runValidator(script) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${script} failed:\n${result.stdout || ''}${result.stderr || ''}`.trim());
  }
}

function gitDiffNames() {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

const cssCart = 'assets/phase6-commerce.css';
const cssAccount = 'assets/phase6-commerce.css';
const tests = 'tests/local-integration.test.mjs';
const productsJson = 'products.json';

for (const rel of [cssCart, cssAccount, tests, productsJson]) mustExist(rel);
if (errors.length) {
  console.error('COSMOSKIN UX1 validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const cartCss = read(cssCart);
const accountCss = read(cssAccount);
const testsSrc = read(tests);

// Guardrails: UI-only scope
const diff = gitDiffNames();
if (diff.includes('products.json')) errors.push('products.json must not be modified');
for (const forbidden of [
  'functions/api/create-checkout.js',
  'assets/checkout-flow.js',
  'assets/coupon-client.js',
  'assets/cart-commerce.js',
  'assets/phase6-commerce.js',
  'assets/app.js',
  'functions/api/coupons/validate.js'
]) {
  if (diff.includes(forbidden)) errors.push(`UX1 must not modify commerce logic file: ${forbidden}`);
}

// Mini cart premium requirements
mustInclude(cartCss, cssCart, '#cartDrawer.cart-drawer-premium');
mustInclude(cartCss, cssCart, 'cart-drawer-premium__thumb img');
mustInclude(cartCss, cssCart, 'Ensure legacy compact cart rules don\'t beige-block premium thumbnails');
mustInclude(cartCss, cssCart, 'background:transparent !important');
mustInclude(cartCss, cssCart, '-webkit-line-clamp:2');
mustInclude(cartCss, cssCart, '.phase6-coupon-status.is-success');
mustInclude(cartCss, cssCart, '.phase6-coupon-status.is-error');
mustInclude(cartCss, cssCart, '.sum-row.total strong');
mustInclude(cartCss, cssCart, '#cartDrawer .cart-empty-state');

// Account overview premium hardening
mustInclude(accountCss, cssAccount, 'UX1 — Account overview premium polish');
mustInclude(accountCss, cssAccount, '.account-page .cs-stat>div{min-width:0');
mustInclude(accountCss, cssAccount, '.account-page .cs-quick-grid--compact .cs-quick-card strong');
mustInclude(accountCss, cssAccount, '-webkit-line-clamp:2');

// Tests
mustInclude(testsSrc, tests, "test('UX1:");

// Regressions
runValidator('scripts/validate-c4-checkout-order-creation-after-coupon.mjs');
runValidator('scripts/validate-c3-minicart-parity-premium-redesign.mjs');
runValidator('scripts/validate-c2-cart-checkout-coupon-parity.mjs');
runValidator('scripts/validate-i2-checkout-stock-false-negative.mjs');
runValidator('scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs');
runValidator('scripts/validate-production-launch-readiness.mjs');

if (errors.length) {
  console.error('COSMOSKIN UX1 mini cart + account premium polish validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN UX1 mini cart + account premium polish validation passed.');

