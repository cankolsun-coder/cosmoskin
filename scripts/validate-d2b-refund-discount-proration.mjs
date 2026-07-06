import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  ERR_REFERENCE_REQUIRED,
  ERR_AMOUNT_EXCEEDS_PAID_ITEM,
  ERR_PRORATION_UNSAFE,
  allocateOrderDiscount,
  resolveOrderDiscountAmount,
  resolveItemProratedRefundableCap,
  resolveEffectiveRemainingRefundable,
  validateRefundAmount,
  computeRemainingRefundable,
  buildRefundCaps
} from '../functions/api/admin/refunds.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const D3A_MIGRATION_FILE = '20260706_d3a_order_item_pricing_snapshot.sql';
function migrationChangesExcludingD3A(lines = []) {
  return (lines || []).filter((line) => String(line).trim() && !String(line).includes(D3A_MIGRATION_FILE));
}
function isD3ACheckoutSnapshotChange(filePath) {
  try {
    return String(filePath).endsWith('functions/api/create-checkout.js')
      && fs.readFileSync(path.join(process.cwd(), filePath), 'utf8').includes('buildOrderItemPricingSnapshots');
  } catch (_) {
    return false;
  }
}


const REFUNDS_API = 'functions/api/admin/refunds.js';
const ADMIN_ORDERS = 'assets/admin-orders.js';

function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

if (!exists(REFUNDS_API)) failures.push(`Missing required file: ${REFUNDS_API}`);
if (!exists(ADMIN_ORDERS)) failures.push(`Missing required file: ${ADMIN_ORDERS}`);
if (failures.length) {
  console.error('COSMOSKIN D2B refund discount proration validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const refundsSrc = read(REFUNDS_API);
const adminOrdersSrc = read(ADMIN_ORDERS);

for (const marker of [
  'allocateOrderDiscount',
  'resolveItemProratedRefundableCap',
  'resolveOrderDiscountAmount',
  'resolveEffectiveRemainingRefundable',
  'ERR_AMOUNT_EXCEEDS_PAID_ITEM',
  'ERR_PRORATION_UNSAFE',
  'return_request_items',
  'loadCouponRedemptions'
]) {
  if (!refundsSrc.includes(marker)) {
    failures.push(`${REFUNDS_API}: missing D2B helper/marker ${marker}`);
  }
}

if (/refundable_amount/.test(refundsSrc) && /itemCap\s*=\s*.*refundable_amount/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: must not trust return_request_items.refundable_amount as final cap`);
}

if (/claw.?back|free.?shipping.?threshold|2500/.test(refundsSrc.replace(/\/\*[\s\S]*?\*\//g, ''))) {
  failures.push(`${REFUNDS_API}: free-shipping clawback must not be introduced in D2B`);
}

const orderItems = [
  { id: 'oi-a', line_total: 600, quantity: 1 },
  { id: 'oi-b', line_total: 400, quantity: 1 }
];
const order = { subtotal_amount: 1000, discount_amount: 100, shipping_amount: 0, total_amount: 900 };
const discount = resolveOrderDiscountAmount(order, [{ discount_amount: 100, status: 'used' }]);
if (discount.source !== 'orders.discount_amount' || discount.amount !== 100) {
  failures.push('resolveOrderDiscountAmount must prefer orders.discount_amount');
}

const allocations = allocateOrderDiscount(orderItems, 100, 1000);
const sumAllocated = allocations.reduce((sum, row) => sum + row.allocatedDiscount, 0);
if (Math.abs(sumAllocated - 100) > 0.001) {
  failures.push(`allocateOrderDiscount must sum to order discount: got ${sumAllocated}, expected 100`);
}
const paidA = allocations.find((row) => row.orderItemId === 'oi-a')?.linePaidTotal;
const paidB = allocations.find((row) => row.orderItemId === 'oi-b')?.linePaidTotal;
if (paidA !== 540 || paidB !== 360) {
  failures.push(`allocateOrderDiscount wrong paid totals: A=${paidA}, B=${paidB}, expected 540/360`);
}

const proration = resolveItemProratedRefundableCap(order, orderItems, [
  { order_item_id: 'oi-a', quantity: 1 }
], []);
if (!proration.ok || !proration.active || proration.itemCap !== 540) {
  failures.push(`resolveItemProratedRefundableCap must return prorated cap 540, got ${proration.itemCap}`);
}

const preDiscountBlocked = validateRefundAmount(600, {
  remaining: 900,
  effectiveRemaining: 540,
  itemProrationActive: true,
  itemProratedProductCap: 540
});
if (preDiscountBlocked.ok || preDiscountBlocked.error !== ERR_AMOUNT_EXCEEDS_PAID_ITEM) {
  failures.push('validateRefundAmount must reject undiscounted amount when item proration active');
}

const fullReturn = resolveItemProratedRefundableCap(order, orderItems, [
  { order_item_id: 'oi-a', quantity: 1 },
  { order_item_id: 'oi-b', quantity: 1 }
], []);
if (!fullReturn.ok || fullReturn.itemCap !== 900) {
  failures.push(`full-order item proration must equal paid product subtotal: got ${fullReturn.itemCap}`);
}

const mismatchFallback = resolveItemProratedRefundableCap(
  { subtotal_amount: 1000, discount_amount: 100 },
  orderItems,
  [{ order_item_id: 'oi-a', quantity: 1 }],
  []
);
if (!mismatchFallback.ok || !mismatchFallback.fallback) {
  // lines sum matches 1000 — test real mismatch
}
const mismatchItems = [{ id: 'oi-a', line_total: 500, quantity: 1 }];
const mismatchOrder = { subtotal_amount: 1000, discount_amount: 50 };
const fallback = resolveItemProratedRefundableCap(mismatchOrder, mismatchItems, [{ order_item_id: 'oi-a', quantity: 1 }], []);
if (!fallback.ok || !fallback.fallback || fallback.active) {
  failures.push('subtotal mismatch must fall back to D2A caps without item binding');
}

const unsafe = resolveItemProratedRefundableCap(order, orderItems, [{ order_item_id: 'missing', quantity: 1 }], []);
if (unsafe.ok || unsafe.error !== ERR_PRORATION_UNSAFE) {
  failures.push('unmatched return item must fail safe with ERR_PRORATION_UNSAFE');
}

const caps = buildRefundCaps(order, orderItems, { refund_responsibility: 'customer_preference' });
const balance = computeRemainingRefundable(caps, []);
const ctx = { ...caps, ...balance, itemProrationActive: true, itemProratedProductCap: 540, shippingRefundableCap: 0 };
const effective = resolveEffectiveRemainingRefundable(ctx);
if (effective !== 540) {
  failures.push(`effective remaining must min item cap and order remaining: got ${effective}`);
}

if (!refundsSrc.includes(ERR_REFERENCE_REQUIRED)) {
  failures.push(`${REFUNDS_API}: D1 provider_reference rule removed`);
}
if (!/findCompletedRefund|idempotent:\s*true/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: D1 idempotency removed`);
}
if (!/resolveShippingRefundableCap/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: D2A shipping rules regressed`);
}

if (!/İndirim tutarı iade edilecek ürünlere oransal olarak dağıtılır/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: missing discount proration copy`);
}
if (!/İade tutarı müşterinin ürün için fiilen ödediği tutarı aşamaz/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: missing paid item value copy`);
}
if (!/Dağıtılan indirim|allocateOrderDiscount|resolveItemProration/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must show allocated discount / proration in refund UI`);
}
if (!/Kargo bedeli standart ürün iadesine dahil edilmez/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: D2A shipping copy regressed`);
}

const d2bForbidden = [
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'functions/api/_lib/commerce-finalization.js',
  'functions/api/_lib/coupons.js',
  'functions/api/create-checkout.js'
];
for (const file of d2bForbidden) {
  if (!exists(file)) continue;
  if (file === 'functions/api/_lib/coupons.js' && process.env.COSMOSKIN_ALLOW_C1A_COUPON_HARDENING === '1') continue;
  if (isD3ACheckoutSnapshotChange(file)) continue;
  if (gitDiffFile(file)) failures.push(`D2B scope violation: ${file} must not be modified in this batch`);
}

let migrationStatus = [];
try {
  migrationStatus = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatus = [];
}
if (migrationChangesExcludingD3A(migrationStatus).length) {
  failures.push(`D2B scope violation: supabase/migrations modified: ${migrationStatus.join(', ')}`);
}

const chainedValidators = [
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
  console.error('COSMOSKIN D2B refund discount proration validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN D2B refund discount proration validation passed.');
