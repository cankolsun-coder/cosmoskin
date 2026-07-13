#!/usr/bin/env node
// HF1 — Runtime commerce hotfix validator
// Guards: (1) cartHasItems defined & non-throwing in assets/phase6-commerce.js,
// (2) mini cart coupon/recommendation gating can run, (3) every pre-rendered
// PDP that ships the cart drawer also loads inventory-client.js,
// (4) products.json untouched vs git HEAD, (5) no unnecessary commerce-critical
// file churn in the working tree.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const has = (rel) => existsSync(join(root, rel));

const phase6Rel = 'assets/phase6-commerce.js';
const isntreeRel = 'products/isntree-hyaluronic-acid-watery-sun-gel.html';

for (const rel of [phase6Rel, isntreeRel, 'assets/inventory-client.js', 'assets/cart-commerce.js']) {
  if (!has(rel)) errors.push(`Missing required file: ${rel}`);
}
if (errors.length) {
  console.error('HF1 validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const phase6 = read(phase6Rel);

// --- 1. cartHasItems must be defined exactly once and called by the gating hooks
const callSites = (phase6.match(/cartHasItems\(/g) || []).length;
const definitions = (phase6.match(/function cartHasItems\s*\(/g) || []).length;
if (definitions !== 1) errors.push(`${phase6Rel}: expected exactly 1 cartHasItems definition, found ${definitions}`);
if (callSites < definitions + 1) errors.push(`${phase6Rel}: cartHasItems defined but never called — gating hooks lost`);

// Every non-definition identifier usage must resolve inside the same IIFE scope:
// simple containment check — definition must appear before first call site.
const defIndex = phase6.indexOf('function cartHasItems');
const firstCall = phase6.replace(/function cartHasItems\s*\(/, '#'.repeat('function cartHasItems('.length)).indexOf('cartHasItems(');
if (defIndex === -1) {
  errors.push(`${phase6Rel}: cartHasItems is called but not defined (C3 regression)`);
}

// --- 2. Behavioral: extract the helper and prove it cannot throw and gates correctly
const fnMatch = phase6.match(/function cartHasItems\s*\([\s\S]*?\n  \}/);
if (!fnMatch) {
  errors.push(`${phase6Rel}: unable to extract cartHasItems body for behavioral check`);
} else {
  const makeSandbox = (items, stored) => {
    const sandbox = {
      cartItems: () => items,
      localStorage: {
        getItem: () => (stored === '__THROW__' ? (() => { throw new Error('blocked'); })() : stored)
      },
      result: undefined
    };
    return sandbox;
  };
  const runCase = (items, stored, arg) => {
    const sandbox = makeSandbox(items, stored);
    vm.createContext(sandbox);
    vm.runInContext(`${fnMatch[0]}; result = cartHasItems(${arg === undefined ? '' : 'ARG'});`.replace('ARG', JSON.stringify(arg)), sandbox);
    return sandbox.result;
  };
  try {
    if (runCase([], null) !== false) errors.push('cartHasItems: empty cart must be false');
    if (runCase([{ id: 'a', qty: 1 }], null) !== true) errors.push('cartHasItems: single item must be true');
    if (runCase([{ id: 'a', qty: 2 }, { id: 'b', qty: 1 }, { id: 'c', quantity: 3 }], null) !== true) errors.push('cartHasItems: multi item must be true');
    if (runCase([{ id: 'a', qty: 0 }], null) !== false) errors.push('cartHasItems: zero-qty-only cart must be false');
    if (runCase([], JSON.stringify([{ id: 'guest', qty: 1 }])) !== true) errors.push('cartHasItems: guest localStorage fallback must be true');
    if (runCase([], '{not json') !== false) errors.push('cartHasItems: corrupt storage must be false, not throw');
    // explicit array argument form
    const sandbox = makeSandbox([], null);
    vm.createContext(sandbox);
    vm.runInContext(`${fnMatch[0]}; result = cartHasItems([{ id: 'x', qty: 1 }]);`, sandbox);
    if (sandbox.result !== true) errors.push('cartHasItems: explicit items argument must be honored');
  } catch (e) {
    errors.push(`cartHasItems threw during behavioral check: ${e.message}`);
  }
}

// --- 3. Gating hooks must reference the helper (coupon box + recommendations + CTA guard)
for (const marker of ['setCartDrawerCommerceState', 'renderCartRecommendations', 'revalidateStoredCoupon']) {
  if (!phase6.includes(marker)) errors.push(`${phase6Rel}: expected drawer gating hook missing: ${marker}`);
}
if (!/function setCartDrawerCommerceState[\s\S]{0,200}cartHasItems\(/.test(phase6)) {
  errors.push(`${phase6Rel}: setCartDrawerCommerceState no longer gates on cartHasItems`);
}

// --- 4. Every PDP with a cart drawer must load inventory-client.js
const pdpDir = join(root, 'products');
const missingInventory = [];
for (const file of readdirSync(pdpDir)) {
  if (!file.endsWith('.html')) continue;
  const src = readFileSync(join(pdpDir, file), 'utf8');
  if (src.includes('id="cartDrawer"') && !src.includes('/assets/inventory-client.js')) {
    missingInventory.push(`products/${file}`);
  }
}
if (missingInventory.length) {
  errors.push(`PDPs ship cart drawer without inventory-client.js: ${missingInventory.join(', ')}`);
}
const isntree = read(isntreeRel);
if (!/mobile-redesign\.js[^<]*"><\/script><script defer="" src="\/assets\/inventory-client\.js/.test(isntree)) {
  errors.push(`${isntreeRel}: inventory-client.js not loaded in canonical PDP order (after mobile-redesign.js)`);
}

// --- 5. products.json must be byte-identical to git HEAD
const productsDiff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((productsDiff.stdout || '').trim()) errors.push('products.json is modified — forbidden for HF1');

// --- 6. No unnecessary commerce-critical churn in this hotfix
const protectedFiles = [
  'functions/api/create-checkout.js',
  'functions/api/coupons/validate.js',
  'functions/api/_lib/product-pricing.js',
  'functions/api/_lib/order-pricing-snapshot.js',
  'functions/api/_lib/coupons.js',
  'functions/api/_lib/inventory.js',
  'functions/api/admin/refunds.js',
  'assets/checkout-flow.js',
  'assets/coupon-client.js',
  'assets/cart-commerce.js',
  'assets/inventory-client.js',
  'assets/price-display.js',
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'assets/admin-runtime.js'
];
const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
const dirtyFiles = (dirty.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
for (const file of dirtyFiles) {
  if (protectedFiles.includes(file)) {
    errors.push(`HF1 must not modify commerce/admin-critical file: ${file}`);
  }
}

// --- 7. Cheap regression canaries for C3/C4/I2/P1E surfaces HF1 sits next to
if (!phase6.includes('COSMOSKIN_CART_COMMERCE')) errors.push('C3 canary: phase6-commerce no longer uses shared cart commerce API');
if (!phase6.includes('validateCoupon')) errors.push('C3 canary: drawer coupon validation path missing');
if (!read('assets/inventory-client.js').includes('COSMOSKIN_STOCK')) errors.push('I2 canary: inventory client no longer exposes COSMOSKIN_STOCK');

if (errors.length) {
  console.error('COSMOSKIN HF1 runtime commerce hotfix validation FAILED:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('HF1 runtime commerce hotfix validation passed.');
