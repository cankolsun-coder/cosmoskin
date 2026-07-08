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

const inventoryLib = 'functions/api/_lib/inventory.js';
const inventoryCheck = 'functions/api/inventory/check.js';
const checkoutApi = 'functions/api/create-checkout.js';
const checkoutFlow = 'assets/checkout-flow.js';
const inventoryClient = 'assets/inventory-client.js';
const mobileRedesign = 'assets/mobile-redesign.js';
const productsData = 'assets/products-data.js';
const integrationTests = 'tests/local-integration.test.mjs';

for (const rel of [inventoryLib, inventoryCheck, checkoutApi, checkoutFlow, inventoryClient, mobileRedesign, productsData, integrationTests]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN I2 checkout stock false-negative validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const inventorySrc = read(inventoryLib);
const inventoryCheckSrc = read(inventoryCheck);
const checkoutSrc = read(checkoutApi);
const checkoutUiSrc = read(checkoutFlow);
const stockClientSrc = read(inventoryClient);
const mobileSrc = read(mobileRedesign);
const productsDataSrc = read(productsData);
const testsSrc = read(integrationTests);

// Server authority + structured stock errors
mustInclude(inventorySrc, inventoryLib, 'export async function releaseExpiredReservationsBestEffort');
mustInclude(inventorySrc, inventoryLib, 'await releaseExpiredReservationsBestEffort(context)');
mustInclude(inventorySrc, inventoryLib, 'inventory_status: inv?.status || null');
mustInclude(inventoryCheckSrc, inventoryCheck, 'releaseExpiredReservationsBestEffort');
mustInclude(checkoutSrc, checkoutApi, 'validateCartStock(context');
mustInclude(checkoutSrc, checkoutApi, "error: 'stock_unavailable'");
mustInclude(checkoutSrc, checkoutApi, 'payload.items = error.items');

// Client must not block checkout on unknown local inventory
mustInclude(stockClientSrc, inventoryClient, 'buy.ok === false && !buy.unknown');
mustInclude(stockClientSrc, inventoryClient, 'await loadInventory(cartItems.map');
mustNotInclude(stockClientSrc, inventoryClient, 'var localState = getCartStockState(items)');
mustInclude(stockClientSrc, inventoryClient, 'formatCartStockMessage');
mustInclude(stockClientSrc, inventoryClient, 'formatItemStockMessage');
mustInclude(stockClientSrc, inventoryClient, 'mergeCheckItemIntoMap');
mustNotInclude(stockClientSrc, inventoryClient, 'localStorage.getItem');
mustNotInclude(stockClientSrc, inventoryClient, 'item.in_stock');
mustNotInclude(stockClientSrc, inventoryClient, 'item.stock');

// Checkout UI item-level clarity
mustInclude(checkoutUiSrc, checkoutFlow, 'stockBlockDetails');
mustInclude(checkoutUiSrc, checkoutFlow, 'formatStockGateMessage');
mustInclude(checkoutUiSrc, checkoutFlow, 'validateCartPurchasable');
mustInclude(checkoutUiSrc, checkoutFlow, 'loadInventory(preloadSlugs');

// Mobile cart proceed must use API gate
mustInclude(mobileSrc, mobileRedesign, 'validateCartPurchasable(totals.items)');
mustInclude(mobileSrc, mobileRedesign, 'if (!inv) return false');

// Effective price overlay must not strip stock fields
mustNotInclude(productsDataSrc, productsData, 'available_stock = undefined');

// Integration tests
mustInclude(testsSrc, integrationTests, "test('I2: validateCartStock passes when available stock meets requested quantity");
mustInclude(testsSrc, integrationTests, "test('I2: validateCartStock blocks fully reserved or insufficient quantity with item details");
mustInclude(testsSrc, integrationTests, "test('I2: inventory check endpoint releases expired reservations before validating stock");
mustInclude(testsSrc, integrationTests, "test('I2: checkout stock client defers to API when local inventory map is empty");

// I1 must not regress
runValidator('scripts/validate-i1-inventory-checkout-blocking.mjs');

if (errors.length) {
  console.error('COSMOSKIN I2 checkout stock false-negative validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN I2 checkout stock false-negative validation passed.');
