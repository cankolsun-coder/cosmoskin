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
const checkoutApi = 'functions/api/create-checkout.js';
const accountDashboard = 'assets/account-dashboard.js';
const masterUpgrade = 'assets/master-upgrade.js';
const checkoutFlow = 'assets/checkout-flow.js';
const inventoryClient = 'assets/inventory-client.js';
const mobileRedesign = 'assets/mobile-redesign.js';
const integrationTests = 'tests/local-integration.test.mjs';

for (const rel of [inventoryLib, checkoutApi, accountDashboard, masterUpgrade, checkoutFlow, inventoryClient, mobileRedesign, integrationTests]) {
  mustExist(rel);
}

if (errors.length) {
  console.error('COSMOSKIN I1 inventory checkout blocking validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const inventorySrc = read(inventoryLib);
const checkoutSrc = read(checkoutApi);
const accountSrc = read(accountDashboard);
const cartSrc = read(masterUpgrade);
const checkoutUiSrc = read(checkoutFlow);
const stockClientSrc = read(inventoryClient);
const mobileSrc = read(mobileRedesign);
const testsSrc = read(integrationTests);

// Shared server validator
mustInclude(inventorySrc, inventoryLib, 'export async function validateCartStock');
mustInclude(inventorySrc, inventoryLib, 'available_stock: available');
mustInclude(inventorySrc, inventoryLib, "error: 'stock_unavailable'");
mustInclude(inventorySrc, inventoryLib, 'reason: item.reason');

// create-checkout fail-closed server enforcement
mustInclude(checkoutSrc, checkoutApi, 'validateCartStock(context');
mustInclude(checkoutSrc, checkoutApi, 'reserveInventoryForOrder');
mustInclude(checkoutSrc, checkoutApi, 'error.errorKey');
mustInclude(checkoutSrc, checkoutApi, 'payload.items = error.items');
mustNotInclude(checkoutSrc, checkoutApi, 'body.available_stock');
mustNotInclude(checkoutSrc, checkoutApi, 'payload.in_stock');

// Favorites must use live stock validation
mustInclude(accountSrc, accountDashboard, 'COSMOSKIN_STOCK.validateAdd');
mustInclude(accountSrc, accountDashboard, 'useLiveStock: true');
mustInclude(accountSrc, accountDashboard, 'favoriteStockState');
mustNotInclude(accountSrc, accountDashboard, 'hideStock: true');

// Desktop cart checkout blocking
mustInclude(cartSrc, masterUpgrade, 'cartBlockingItems');
mustInclude(cartSrc, masterUpgrade, 'data-cs-checkout-blocked');
mustInclude(cartSrc, masterUpgrade, 'Sepetinizde stokta olmayan ürünler var.');
mustInclude(cartSrc, masterUpgrade, 'Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.');

// Checkout UI blocking
mustInclude(checkoutUiSrc, checkoutFlow, 'refreshStockGate');
mustInclude(checkoutUiSrc, checkoutFlow, 'stockBlocked');
mustInclude(checkoutUiSrc, checkoutFlow, 'validateCartPurchasable');
mustInclude(checkoutUiSrc, checkoutFlow, 'Stok doğrulaması gerekli');

// Shared client helper
mustInclude(stockClientSrc, inventoryClient, 'validateCartPurchasable');
mustInclude(stockClientSrc, inventoryClient, 'getCartBlockingItems');
mustInclude(stockClientSrc, inventoryClient, 'favoriteStockState');

// Mobile regression guard
mustInclude(mobileSrc, mobileRedesign, 'validateCartBeforeContinue');
mustInclude(mobileSrc, mobileRedesign, 'data-cm-proceed-checkout');

// Integration tests
mustInclude(testsSrc, integrationTests, "test('I1: validateCartStock returns structured stock_unavailable");
mustInclude(testsSrc, integrationTests, "test('I1: create-checkout rejects out-of-stock cart before reservation");

// H0 reservation RPC preserved
mustInclude(checkoutSrc, checkoutApi, 'releaseInventoryReservations(context, reservedOrderId');

// C1 coupon path untouched
mustInclude(checkoutSrc, checkoutApi, 'validateCouponEligibility(context');

if (errors.length) {
  console.error('COSMOSKIN I1 inventory checkout blocking validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

for (const script of [
  'scripts/validate-h0-live-payment-rpc-hotfix.mjs',
  'scripts/validate-d3-refund-snapshot-persistence.mjs',
  'scripts/validate-c1-coupon-eligibility-hardening.mjs',
  'scripts/validate-c1b-coupon-exclusions-metadata.mjs',
  'scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs',
  'scripts/validate-d2b-refund-discount-proration.mjs',
  'scripts/validate-d2-refund-amount-correctness.mjs',
  'scripts/validate-d1-returns-refunds-correctness.mjs'
]) {
  if (has(script)) runValidator(script);
}

if (errors.length) {
  console.error('COSMOSKIN I1 inventory checkout blocking validation failed (regression chain):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN I1 inventory checkout blocking validation passed.');
