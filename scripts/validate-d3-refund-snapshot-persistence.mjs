import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildOrderItemPricingSnapshots,
  PRICING_SNAPSHOT_VERSION,
  isValidPricingSnapshot,
  orderItemsHaveCompleteSnapshots
} from '../functions/api/_lib/order-pricing-snapshot.js';
import {
  resolveItemProratedRefundableCap,
  ERR_PRORATION_UNSAFE
} from '../functions/api/admin/refunds.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const MIGRATION = 'supabase/migrations/20260706_d3a_order_item_pricing_snapshot.sql';
const CHECKOUT = 'functions/api/create-checkout.js';
const REFUNDS_API = 'functions/api/admin/refunds.js';
const SNAPSHOT_LIB = 'functions/api/_lib/order-pricing-snapshot.js';
const ADMIN_ORDERS = 'assets/admin-orders.js';

function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

for (const file of [MIGRATION, CHECKOUT, REFUNDS_API, SNAPSHOT_LIB, ADMIN_ORDERS]) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN D3A refund snapshot persistence validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const migrationSrc = read(MIGRATION);
const checkoutSrc = read(CHECKOUT);
const refundsSrc = read(REFUNDS_API);
const snapshotLibSrc = read(SNAPSHOT_LIB);
const adminOrdersSrc = read(ADMIN_ORDERS);

for (const col of ['allocated_order_discount', 'paid_line_total', 'paid_unit_price', 'pricing_snapshot_version']) {
  if (!new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}`, 'i').test(migrationSrc)) {
    failures.push(`${MIGRATION}: must add nullable column ${col}`);
  }
}
if (/UPDATE\s+(?:public\.)?order_items/i.test(migrationSrc)) {
  failures.push(`${MIGRATION}: must not backfill historical orders in D3A`);
}

if (!checkoutSrc.includes('buildOrderItemPricingSnapshots')) {
  failures.push(`${CHECKOUT}: must persist pricing snapshots on order_items insert`);
}
if (!/allocated_order_discount|paid_line_total|paid_unit_price|pricing_snapshot_version/.test(checkoutSrc)) {
  failures.push(`${CHECKOUT}: must write snapshot columns through buildOrderItemPricingSnapshots`);
}

for (const marker of [
  'orderItemsHaveCompleteSnapshots',
  'isValidPricingSnapshot',
  'snapshotAllocationFromOrderItem',
  'order_items.pricing_snapshot',
  'snapshotBacked',
  'pricing_snapshot_version'
]) {
  if (!refundsSrc.includes(marker) && !snapshotLibSrc.includes(marker)) {
    failures.push(`${REFUNDS_API}: missing D3A snapshot marker/helper ${marker}`);
  }
}

if (!refundsSrc.includes('resolveItemProratedRefundableCapFromSnapshots') && !refundsSrc.includes('orderItemsHaveCompleteSnapshots')) {
  failures.push(`${REFUNDS_API}: must prefer stored snapshots before D2B reconstruction`);
}
if (!refundsSrc.includes('allocateOrderDiscount')) {
  failures.push(`${REFUNDS_API}: D2B reconstruction fallback removed`);
}

if (/refundable_amount/.test(refundsSrc) && /itemCap\s*=\s*.*refundable_amount/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: must not trust return_request_items.refundable_amount as final cap`);
}

if (!/calculateTotalsWithCoupon/.test(checkoutSrc) || !/totals\.subtotal/.test(checkoutSrc)) {
  failures.push(`${CHECKOUT}: checkout totals calculation appears removed`);
}

const cart = [
  { product_id: 'a', line_total: 600, quantity: 1 },
  { product_id: 'b', line_total: 400, quantity: 1 }
];
const snapshots = buildOrderItemPricingSnapshots(cart, 100);
const sumAlloc = snapshots.reduce((sum, row) => sum + row.allocated_order_discount, 0);
if (Math.abs(sumAlloc - 100) > 0.001) {
  failures.push(`buildOrderItemPricingSnapshots must sum allocated discount to order discount: got ${sumAlloc}`);
}
if (snapshots[0].paid_line_total !== 540 || snapshots[1].paid_line_total !== 360) {
  failures.push(`buildOrderItemPricingSnapshots wrong paid totals: ${snapshots[0].paid_line_total}/${snapshots[1].paid_line_total}`);
}
if (snapshots[1].pricing_snapshot_version !== PRICING_SNAPSHOT_VERSION) {
  failures.push('buildOrderItemPricingSnapshots must set pricing_snapshot_version');
}

const snapshotItems = [
  { id: 'oi-a', line_total: 600, quantity: 1, allocated_order_discount: 60, paid_line_total: 540, paid_unit_price: 540, pricing_snapshot_version: PRICING_SNAPSHOT_VERSION, product_slug: 'prod-a' },
  { id: 'oi-b', line_total: 400, quantity: 1, allocated_order_discount: 40, paid_line_total: 360, paid_unit_price: 360, pricing_snapshot_version: PRICING_SNAPSHOT_VERSION, product_slug: 'prod-b' }
];
if (!orderItemsHaveCompleteSnapshots(snapshotItems)) {
  failures.push('orderItemsHaveCompleteSnapshots must accept valid snapshot rows');
}
const snapCap = resolveItemProratedRefundableCap(
  { subtotal_amount: 1000, discount_amount: 100 },
  snapshotItems,
  [{ order_item_id: 'oi-a', quantity: 1 }],
  []
);
if (!snapCap.ok || !snapCap.snapshotBacked || snapCap.itemCap !== 540 || snapCap.discountSource !== 'order_items.pricing_snapshot') {
  failures.push(`resolveItemProratedRefundableCap must prefer snapshots: ${JSON.stringify(snapCap)}`);
}

const legacyItems = [{ id: 'oi-a', line_total: 600, quantity: 1 }, { id: 'oi-b', line_total: 400, quantity: 1 }];
const legacyCap = resolveItemProratedRefundableCap(
  { subtotal_amount: 1000, discount_amount: 100 },
  legacyItems,
  [{ order_item_id: 'oi-a', quantity: 1 }],
  []
);
if (!legacyCap.ok || legacyCap.snapshotBacked || legacyCap.itemCap !== 540) {
  failures.push('legacy orders without snapshots must fall back to D2B reconstruction');
}

const invalidItems = [
  { id: 'oi-a', line_total: 600, quantity: 1, allocated_order_discount: 60, paid_line_total: 700, paid_unit_price: 700, pricing_snapshot_version: PRICING_SNAPSHOT_VERSION }
];
if (isValidPricingSnapshot(invalidItems[0])) {
  failures.push('isValidPricingSnapshot must reject paid_line_total > line_total');
}
if (orderItemsHaveCompleteSnapshots(invalidItems)) {
  failures.push('orderItemsHaveCompleteSnapshots must reject invalid snapshot rows');
}
const invalidFallback = resolveItemProratedRefundableCap(
  { subtotal_amount: 1000, discount_amount: 100 },
  [
    { id: 'oi-a', line_total: 600, quantity: 1, allocated_order_discount: 60, paid_line_total: 700, paid_unit_price: 700, pricing_snapshot_version: PRICING_SNAPSHOT_VERSION },
    { id: 'oi-b', line_total: 400, quantity: 1 }
  ],
  [{ order_item_id: 'oi-a', quantity: 1 }],
  []
);
if (!invalidFallback.ok || invalidFallback.itemCap !== 540) {
  failures.push('mixed/invalid snapshot rows must fall back to D2B reconstruction when possible');
}

if (!refundsSrc.includes('resolveShippingRefundableCap')) {
  failures.push(`${REFUNDS_API}: D2A shipping rules regressed`);
}
if (!refundsSrc.includes('ERR_REFERENCE_REQUIRED')) {
  failures.push(`${REFUNDS_API}: D1 provider_reference rule removed`);
}

if (!/Kayıtlı ödeme tutarı|pricingSnapshotVersion|snapshotBacked/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must surface snapshot-backed refund diagnostics`);
}

const d3aForbidden = [
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'functions/api/_lib/commerce-finalization.js',
  'functions/api/_lib/coupons.js',
  'functions/api/iyzico-callback.js'
];
for (const file of d3aForbidden) {
  if (!exists(file)) continue;
  if (gitDiffFile(file)) failures.push(`D3A scope violation: ${file} must not be modified`);
}

const chainedValidators = [
  'scripts/validate-d2b-refund-discount-proration.mjs',
  'scripts/validate-d2-refund-amount-correctness.mjs',
  'scripts/validate-d1-returns-refunds-correctness.mjs',
  'scripts/validate-b2e-email-events-integrity.mjs',
  'scripts/validate-b2-bank-transfer-rejection-finalization.mjs',
  'scripts/validate-b1-bank-transfer-finalization.mjs',
  'scripts/validate-a1f-admin-rbac-session-identity.mjs',
  'scripts/validate-a1-admin-rbac-hardening.mjs',
  'scripts/validate-a1-admin-endpoint-coverage.mjs',
  'scripts/validate-h2-return-attachment-preview.mjs',
  'scripts/validate-h1-return-attachment-storage-rls.mjs',
  'scripts/validate-h0-live-payment-rpc-hotfix.mjs',
  'scripts/validate-account-batch-1-safe-fixes.mjs',
  'scripts/validate-account-batch-3-order-cancellation.mjs',
  'scripts/validate-account-batch-4-loyalty-ledger.mjs',
  'scripts/validate-account-ui-polish.mjs',
  'scripts/validate-production-launch-readiness.mjs'
];
if (!process.env.COSMOSKIN_SKIP_VALIDATOR_CHAIN) {
  const chainEnv = { ...process.env, COSMOSKIN_SKIP_VALIDATOR_CHAIN: '1' };
  for (const script of chainedValidators) {
    if (!exists(script)) {
      failures.push(`Guardrail missing: ${script} not found`);
      continue;
    }
    try {
      execSync(`node ${JSON.stringify(script)}`, { cwd: root, stdio: 'inherit', env: chainEnv });
    } catch (error) {
      failures.push(`Prior validator failed: ${script}\n${(error.stdout || '').toString()}${(error.stderr || '').toString()}`);
    }
  }
}

if (failures.length) {
  console.error('COSMOSKIN D3A refund snapshot persistence validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN D3A refund snapshot persistence validation passed.');
