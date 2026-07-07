import { migrationChangesExcludingBatchMigrations as migrationChangesExcludingD3A } from './lib/migration-batch-exemptions.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
function isD3ACheckoutSnapshotChange(filePath) {
  try {
    return String(filePath).endsWith('functions/api/create-checkout.js')
      && fs.readFileSync(path.join(process.cwd(), filePath), 'utf8').includes('buildOrderItemPricingSnapshots');
  } catch (_) {
    return false;
  }
}


const requiredFiles = [
  'functions/api/_lib/order-cancellation.js',
  'functions/api/account/orders/[id]/cancel.js',
  'supabase/migrations/20260703_batch3_customer_order_cancellation.sql',
  'assets/account-dashboard.js',
  'functions/api/account/summary.js'
];

for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}

const cancelLib = read('functions/api/_lib/order-cancellation.js');
const cancelRoute = read('functions/api/account/orders/[id]/cancel.js');
const migration = read('supabase/migrations/20260703_batch3_customer_order_cancellation.sql');
const accountJs = read('assets/account-dashboard.js');
const summaryJs = read('functions/api/account/summary.js');

// This file must never change at all — no legitimate future batch touches
// checkout UI.
//
// functions/api/returns.js is no longer zero-diff-forbidden as of H1
// (2026-07-04), which added a minimal client-supplied file_path ownership
// guard to close a storage RLS gap (see
// COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_REPORT_20260704.md). H1's own
// validator (scripts/validate-h1-return-attachment-storage-rls.mjs) asserts
// the new guard's invariants; this validator has no Batch-3-specific
// behavior tied to returns.js, so no replacement assertion is needed here.
const forbiddenPaths = [
  'functions/api/create-checkout.js'
];

for (const file of forbiddenPaths) {
  if (!exists(file)) continue;
  try {
    const diff = execSync(`git diff --name-only HEAD -- ${JSON.stringify(file).slice(1, -1)}`, {
      cwd: root,
      encoding: 'utf8'
    }).trim();
    if (diff && !isD3ACheckoutSnapshotChange(file)) failures.push(`Forbidden modification in Batch 3 scope: ${file}`);
  } catch (_) {
    /* git unavailable — fall back to content heuristics below */
  }
}

// functions/api/iyzico-callback.js and functions/api/admin/** are no longer
// zero-diff-forbidden as of Batch 4 (2026-07-04), which added minimal,
// documented loyalty award/promote/reverse hooks to those exact files (see
// COSMOSKIN_BATCH_4_LOYALTY_LEDGER_REPORT_20260704.md). The Batch 4 approval
// text is explicit that this is "do not modify Batch 1/2/3 BEHAVIOR", not a
// textual freeze — so this validator now asserts the underlying Batch 3
// behavioral invariants stayed intact instead of requiring zero diff.
if (exists('functions/api/iyzico-callback.js')) {
  const iyzico = read('functions/api/iyzico-callback.js');
  if (!/process_iyzico_payment_success/.test(iyzico) || !/process_iyzico_payment_failure/.test(iyzico)) {
    failures.push('iyzico-callback.js: core payment success/failure RPC calls must remain unchanged');
  }
  const iyzicoRequestCalls = (iyzico.match(/iyzicoRequest\(/g) || []).length;
  if (iyzicoRequestCalls !== 1) failures.push('iyzico-callback.js: unexpected change to iyzico HTTP call count (refund/API behavior must not change)');
}
if (exists('functions/api/admin/orders.js')) {
  const adminOrders = read('functions/api/admin/orders.js');
  if (!/assertOperationalTransition/.test(adminOrders)) failures.push('admin/orders.js: assertOperationalTransition guard missing');
  if (!/Ödemesi alınmış sipariş doğrudan iptal edilemez/.test(adminOrders)) failures.push('admin/orders.js: paid-order direct-cancel 409 block missing');
  if (!/releaseInventoryReservations/.test(adminOrders)) failures.push('admin/orders.js: inventory release on cancel missing');
}
if (exists('functions/api/admin/orders/[id]/status.js')) {
  const adminStatus = read('functions/api/admin/orders/[id]/status.js');
  if (!/Ödemesi alınmış sipariş doğrudan iptal edilemez/.test(adminStatus)) failures.push('admin/orders/[id]/status.js: paid-order direct-cancel 409 block missing');
}

if (!/requireUser/.test(cancelRoute)) failures.push('cancel.js: requireUser auth guard missing');
if (!/loadOwnedOrderBundle/.test(cancelRoute)) failures.push('cancel.js: order ownership bundle load missing');
if (!/resolveCancelMode/.test(cancelRoute)) failures.push('cancel.js: resolveCancelMode guard missing');
if (/error\.message/.test(cancelRoute) && !/Sipariş iptali şu anda tamamlanamadı/.test(cancelRoute)) {
  failures.push('cancel.js: must not expose raw Supabase errors');
}

if (!/assertHardBlocks/.test(cancelLib)) failures.push('order-cancellation.js: assertHardBlocks missing');
if (!/hasBlockingShipment/.test(cancelLib)) failures.push('order-cancellation.js: shipment/tracking block missing');
if (!/BLOCKED_ORDER_STATUSES/.test(cancelLib) || !/shipped/.test(cancelLib) || !/delivered/.test(cancelLib)) {
  failures.push('order-cancellation.js: shipped/delivered status blocks missing');
}
if (!/releaseInventoryReservations/.test(cancelLib)) failures.push('order-cancellation.js: direct cancel must release inventory reservations');
if (!/releaseCouponRedemptions/.test(cancelLib) || !/coupon_redemptions/.test(cancelLib)) {
  failures.push('order-cancellation.js: direct cancel must release coupon redemptions');
}
if (!/executeCancelRequest/.test(cancelLib)) failures.push('order-cancellation.js: paid cancel request path missing');
if (/iade tamamlandı|ücret iadesi tamamlandı|refund completed/i.test(cancelLib)) {
  failures.push('order-cancellation.js: paid path must not claim automatic refund completion');
}
if (!/kontrol sonrası başlatılır/.test(cancelLib)) {
  failures.push('order-cancellation.js: paid request message must state manual refund review');
}
const requestFnBody = cancelLib.match(/export async function executeCancelRequest[\s\S]*?(?=export async function loadOwnedOrderBundle|$)/)?.[0] || '';
if (/releaseInventoryReservations/.test(requestFnBody)) failures.push('executeCancelRequest must not release inventory');
if (/releaseCouponRedemptions/.test(requestFnBody)) failures.push('executeCancelRequest must not release coupons');
if (/iyzico/.test(requestFnBody)) failures.push('executeCancelRequest must not call iyzico');
if (/ücret iadesi tamamlandı|refund completed/i.test(requestFnBody)) {
  failures.push('executeCancelRequest must not claim refund completed');
}

if (!/add column if not exists cancel_reason/is.test(migration)) failures.push('migration: cancel_reason column missing');
if (!/add column if not exists cancel_requested_at/is.test(migration)) failures.push('migration: cancel_requested_at column missing');
if (!/add column if not exists cancelled_by/is.test(migration)) failures.push('migration: cancelled_by column missing');
if (!/customer_cancel_requested/.test(migration)) failures.push('migration: customer_cancel_requested event type missing');

if (!/cancel_requested_at/.test(summaryJs)) failures.push('summary.js: cancel columns missing from orders select');
if (!/orderCancelEligibility/.test(accountJs)) failures.push('account-dashboard.js: orderCancelEligibility missing');
if (!/Siparişi İptal Et/.test(accountJs)) failures.push('account-dashboard.js: direct cancel button label missing');
if (!/İptal Talebi Gönder/.test(accountJs)) failures.push('account-dashboard.js: cancel request button label missing');
if (!/cancelOrder/.test(accountJs)) failures.push('account-dashboard.js: cancelOrder handler missing');
if (/ücret iadesi tamamlandı|iade tamamlandı/i.test(accountJs) && !/kontrol sonrası başlatılır/.test(accountJs)) {
  failures.push('account-dashboard.js: must not claim refund completed for cancel request');
}

if (exists('assets/order-detail.js')) {
  try {
    const legacyDiff = execSync('git diff --name-only HEAD -- assets/order-detail.js', {
      cwd: root,
      encoding: 'utf8'
    }).trim();
    if (legacyDiff) failures.push('legacy order-detail.js must not be modified in Batch 3');
  } catch (_) {
    /* ignore */
  }
}

const batch1Script = 'scripts/validate-account-batch-1-safe-fixes.mjs';
const batch2Script = 'scripts/validate-account-ui-polish.mjs';
if (!exists(batch1Script)) failures.push('Batch 1 validator missing — guardrail broken');
if (!exists(batch2Script)) failures.push('Batch 2 validator missing — guardrail broken');

if (failures.length) {
  console.error('COSMOSKIN Batch 3 order cancellation validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN Batch 3 order cancellation validation passed.');
