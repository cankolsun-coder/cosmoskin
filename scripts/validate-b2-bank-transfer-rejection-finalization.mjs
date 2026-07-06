import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

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


const COMMERCE_LIB = 'functions/api/_lib/commerce-finalization.js';
const CALLBACK = 'functions/api/iyzico-callback.js';
const ADMIN_ORDERS = 'functions/api/admin/orders.js';
const ADMIN_ORDER_STATUS = 'functions/api/admin/orders/[id]/status.js';
const EMAIL_EVENTS_LIB = 'functions/api/_lib/email-events.js';

// Brace-balanced extraction — same technique as the B1 validator, so a
// trailing comment block belonging to the *next* export is never swept in.
function extractBalancedFn(src, sigPrefix, name) {
  const start = src.indexOf(`${sigPrefix} ${name}`);
  if (start === -1) return '';
  const parenOpen = src.indexOf('(', start);
  if (parenOpen === -1) return '';
  let parenDepth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < src.length; i += 1) {
    if (src[i] === '(') parenDepth += 1;
    else if (src[i] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenClose = i; break; }
    }
  }
  if (parenClose === -1) return '';
  const openBrace = src.indexOf('{', parenClose);
  if (openBrace === -1) return '';
  let depth = 0;
  for (let i = openBrace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}
function extractFn(src, name) {
  return extractBalancedFn(src, 'export async function', name);
}
// ---------------------------------------------------------------------------
// 1) Required files exist / helper exported
// ---------------------------------------------------------------------------
const requiredFiles = [COMMERCE_LIB, CALLBACK, ADMIN_ORDERS, ADMIN_ORDER_STATUS, EMAIL_EVENTS_LIB];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN B2 bank transfer rejection finalization validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const commerceLib = read(COMMERCE_LIB);
const callback = read(CALLBACK);
const adminOrders = read(ADMIN_ORDERS);
const adminOrderStatus = read(ADMIN_ORDER_STATUS);

const rejectFnBody = extractFn(commerceLib, 'rejectManualBankTransferPayment');
const confirmFnBody = extractFn(commerceLib, 'confirmManualBankTransferPayment');
const finalizeFnBody = extractFn(commerceLib, 'finalizeCommerceAfterPayment');
const shipmentFnBody = extractFn(commerceLib, 'ensureShipmentShell');

if (!rejectFnBody) failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment() export not found`);
if (!confirmFnBody) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment() export not found (B1 helper must still exist, unchanged)`);
if (!finalizeFnBody) failures.push(`${COMMERCE_LIB}: finalizeCommerceAfterPayment() export not found (B1 helper must still exist, unchanged)`);
if (!shipmentFnBody) failures.push(`${COMMERCE_LIB}: ensureShipmentShell() export not found (B1 helper must still exist, unchanged)`);

// ---------------------------------------------------------------------------
// 2) B1 approval behavior must be provably unchanged.
//
//    Note: as of this batch, B1 itself is still an uncommitted working-tree
//    change (no commit boundary exists between "B1 state" and "B2 state" to
//    git-diff against), so this section proves non-interference structurally
//    instead of via a commit-to-commit diff:
//      a) chaining scripts/validate-b1-bank-transfer-finalization.mjs (see
//         §10 below) re-runs every one of B1's own structural/byte-identical
//         checks against the current working tree, including its
//         iyzico-callback.js-vs-HEAD extraction proof;
//      b) this section additionally proves B2 did not reach *inside* the
//         three B1 function bodies while editing the file, by asserting
//         zero B2-specific tokens leak into them (i.e. B2 was added
//         additively as new exports, never by editing existing B1 code).
// ---------------------------------------------------------------------------
const B2_ONLY_TOKENS = ['rejectManualBankTransferPayment', 'bank_transfer_payment_rejected'];
for (const [fnName, body] of [['confirmManualBankTransferPayment', confirmFnBody], ['finalizeCommerceAfterPayment', finalizeFnBody], ['ensureShipmentShell', shipmentFnBody]]) {
  if (!body) continue;
  for (const token of B2_ONLY_TOKENS) {
    if (body.includes(token)) {
      failures.push(`${COMMERCE_LIB}: ${fnName}() contains the B2-only token '${token}' — B2 must not edit B1's existing function bodies, only add new exports`);
    }
  }
}
// rejectManualBankTransferPayment must never be reachable from the card callback.
if (/rejectManualBankTransferPayment/.test(callback)) {
  failures.push(`${CALLBACK}: must not import or call rejectManualBankTransferPayment — that helper is manual-bank-transfer-only and must never run on the card/iyzico path`);
}
if (/confirmManualBankTransferPayment/.test(callback)) {
  failures.push(`${CALLBACK}: must not import or call confirmManualBankTransferPayment either — B2 must not touch the card/iyzico path at all`);
}
// The mark_payment_paid block (admin/orders.js) and the paid-status branch
// (status.js) — i.e. everything B1 owns — must still satisfy every B1
// structural requirement; re-checked in full by the chained B1 validator
// (§10 below), which independently re-verifies the import, the wiring
// condition, the email de-dup guard, and the absence of a hardcoded
// created_by: 'admin' literal in admin/orders.js, plus the wiring condition
// in admin/orders/[id]/status.js.

// ---------------------------------------------------------------------------
// 3) rejectManualBankTransferPayment() structural requirements.
// ---------------------------------------------------------------------------
if (rejectFnBody) {
  if (!/payment_method\s*!==\s*['"]bank_transfer['"]/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must reject non-bank_transfer orders`);
  }

  const alreadyPaidGuardIdx = rejectFnBody.indexOf("payment_status === 'paid'");
  const blockedReturnIdx = rejectFnBody.indexOf('blocked: true');
  const idempotencyCheckIdx = rejectFnBody.indexOf("event_type: 'eq.bank_transfer_payment_rejected'");
  const idempotentReturnIdx = rejectFnBody.indexOf('idempotent: true');
  const paymentsUpdateIdx = rejectFnBody.indexOf("updateRows(context, 'payments'");
  const inventoryReleaseIdx = rejectFnBody.indexOf('releaseInventoryReservations(context, orderId');
  const couponReleaseIdx = rejectFnBody.indexOf("updateRows(context, 'coupon_redemptions'");
  const eventsInsertIdx = rejectFnBody.indexOf("insertRow(context, 'payment_events'");

  if (alreadyPaidGuardIdx === -1 || blockedReturnIdx === -1) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must check for an already-paid/settled order and return a blocked result — must never mark a paid order failed`);
  }
  if (idempotencyCheckIdx === -1) failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must check payment_events for an existing 'bank_transfer_payment_rejected' record before writing anything`);
  if (idempotentReturnIdx === -1) failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must return an { idempotent: true } result when already rejected`);

  // Ordering: already-paid guard, then idempotency gate, then any write.
  if (alreadyPaidGuardIdx !== -1 && idempotencyCheckIdx !== -1 && paymentsUpdateIdx !== -1) {
    if (!(alreadyPaidGuardIdx < idempotencyCheckIdx && idempotencyCheckIdx < paymentsUpdateIdx)) {
      failures.push(`${COMMERCE_LIB}: the already-paid guard and the payment_events idempotency check must both occur BEFORE any write — an already-paid order or a repeat rejection must short-circuit before any further writes`);
    }
  }

  if (paymentsUpdateIdx === -1 || !/status:\s*['"]failed['"]/.test(rejectFnBody.slice(paymentsUpdateIdx, paymentsUpdateIdx + 400))) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must update the payments table's status to 'failed'`);
  }
  if (!/payment_status:\s*['"]failed['"]/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must set orders.payment_status to 'failed'`);
  }
  if (inventoryReleaseIdx === -1) failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must call releaseInventoryReservations(context, orderId, ...) (same idempotent RPC as the existing rejection path)`);
  if (rejectFnBody.includes('convertInventoryReservations')) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must never call convertInventoryReservations — a rejected order's stock must be released, never converted`);
  }
  if (couponReleaseIdx === -1 || !/status:\s*['"]released['"]/.test(rejectFnBody.slice(couponReleaseIdx, couponReleaseIdx + 400))) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must release the order's coupon_redemptions row(s) to status 'released'`);
  }
  if (eventsInsertIdx === -1) failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must insert a payment_events row for the manual rejection`);

  // Must NEVER call the finalize-on-success helpers — no invoice shell, no
  // loyalty award, no shipment shell for a payment that never completed.
  if (/finalizeCommerceAfterPayment\(context/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must NOT call finalizeCommerceAfterPayment() — a rejected order must never gain a 'used' coupon, an invoice shell, or a loyalty award`);
  }
  if (/ensureShipmentShell\(context/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must NOT call ensureShipmentShell() — a rejected order must never gain a shipment shell`);
  }
  if (/insertRow\(context,\s*['"]invoice_records['"]/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must not create an invoice_records row — no invoice shell for a payment that never completed`);
  }
  if (/awardOrderPoints|reverseOrderPoints|promoteOrderPoints/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must not call any loyalty ledger function directly — it must neither award nor reverse loyalty points itself (existing before/after-transition hooks in the calling routes, unchanged by B2, remain the only loyalty touchpoint)`);
  }
  if (/status:\s*['"]used['"]/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must never set a coupon_redemptions row to 'used' — only 'released'`);
  }

  // event_type/provider naming must not collide with the approval audit trail.
  if (!/event_type:\s*['"]bank_transfer_payment_rejected['"]/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must write payment_events.event_type = 'bank_transfer_payment_rejected'`);
  }
  if (!/provider:\s*['"]bank_transfer['"]/.test(rejectFnBody)) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must write payment_events.provider = 'bank_transfer'`);
  }

  // Must not expose raw Supabase errors — every awaited write must be
  // wrapped in a .catch() that logs and returns a safe default, never a
  // bare throw that would propagate an unsanitized DB error to the caller
  // (the one intentional throw is the payment_method guard above, which is
  // always caught by the calling routes).
  const catchCount = (rejectFnBody.match(/\.catch\(/g) || []).length;
  if (catchCount < 4) {
    failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment must wrap its Supabase write calls in .catch() handlers so raw Supabase errors are never exposed to the caller (found ${catchCount}, expected at least 4)`);
  }
}

// ---------------------------------------------------------------------------
// 4) Only known-valid status literals may be introduced.
// ---------------------------------------------------------------------------
const VALID_ORDER_STATUSES = ['pending_payment', 'pending_bank_transfer', 'paid', 'preparing', 'packed', 'shipped', 'delivered', 'cancelled', 'payment_failed', 'refunded', 'partially_refunded'];
const VALID_FULFILLMENT = ['not_started', 'unfulfilled', 'preparing', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'];
const VALID_PAYMENT_TABLE_STATUSES = ['initiated', 'awaiting_transfer', 'paid', 'failed', 'cancelled', 'initialize_failed', 'refunded', 'partially_refunded'];
if (rejectFnBody) {
  const statusLiterals = Array.from(rejectFnBody.matchAll(/\bstatus:\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  const paymentStatusLiterals = Array.from(rejectFnBody.matchAll(/\bpayment_status:\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  const fulfillmentLiterals = Array.from(rejectFnBody.matchAll(/\bfulfillment_status:\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  for (const s of statusLiterals) {
    if (!VALID_PAYMENT_TABLE_STATUSES.includes(s) && !VALID_ORDER_STATUSES.includes(s) && s !== 'processed' && s !== 'released') {
      failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment uses an unrecognized status literal '${s}' — must be one of the existing valid payments/orders/coupon_redemptions/payment_events status vocabularies`);
    }
  }
  for (const s of paymentStatusLiterals) {
    if (s !== 'failed') failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment sets an unexpected orders.payment_status literal '${s}' (expected 'failed')`);
  }
  for (const s of fulfillmentLiterals) {
    if (!VALID_FULFILLMENT.includes(s)) failures.push(`${COMMERCE_LIB}: rejectManualBankTransferPayment uses an unrecognized fulfillment_status literal '${s}'`);
  }
}

// ---------------------------------------------------------------------------
// 5) admin/orders.js wiring: permission guard retained, helper imported and
//    called only for bank_transfer orders on mark_bank_transfer_not_received,
//    email de-dup guard present.
// ---------------------------------------------------------------------------
if (!/requireAdminPermission\(context,\s*['"]orders:update['"]\)/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: onRequestPatch must keep requireAdminPermission(context, 'orders:update')`);
}
if (!/import\s*\{[^}]*rejectManualBankTransferPayment[^}]*\}\s*from\s*['"]\.\.\/_lib\/commerce-finalization\.js['"]/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: must import rejectManualBankTransferPayment from ../_lib/commerce-finalization.js`);
}
if (!/before\.payment_method === 'bank_transfer'/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: rejectManualBankTransferPayment must be called only when the order's payment_method is bank_transfer`);
}
const rejectionEmailIdx = adminOrders.indexOf("sendAndLogCommerceEmail(context, latestOrderForCancel, 'bank_transfer_not_received_cancelled'");
if (rejectionEmailIdx === -1) {
  failures.push(`${ADMIN_ORDERS}: bank_transfer_not_received_cancelled email send call not found`);
} else {
  const guardWindow = adminOrders.slice(Math.max(0, rejectionEmailIdx - 400), rejectionEmailIdx);
  if (!/bankTransferRejection\?\.idempotent !== true/.test(guardWindow)) {
    failures.push(`${ADMIN_ORDERS}: bank_transfer_not_received_cancelled email must be gated on the rejection result not being idempotent, to prevent duplicate sends on repeated rejection clicks`);
  }
  if (!/bankTransferRejection\?\.blocked !== true/.test(guardWindow)) {
    failures.push(`${ADMIN_ORDERS}: bank_transfer_not_received_cancelled email must also be gated on the rejection result not being blocked (an already-paid order must never receive a rejection email)`);
  }
}

// ---------------------------------------------------------------------------
// 6) admin/orders/[id]/status.js wiring: same helper, same permission, only
//    for bank_transfer orders being cancelled; created_by fix present.
// ---------------------------------------------------------------------------
if (!/requireAdminPermission\(context,\s*['"]orders:update['"]\)/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: onRequestPatch must keep requireAdminPermission(context, 'orders:update')`);
}
if (!/import\s*\{[^}]*rejectManualBankTransferPayment[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/_lib\/commerce-finalization\.js['"]/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: must import rejectManualBankTransferPayment from ../../../_lib/commerce-finalization.js`);
}
if (!/body\.status === 'cancelled' && current\.payment_method === 'bank_transfer'/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: rejectManualBankTransferPayment must be called only when body.status is 'cancelled' AND the order's payment_method is bank_transfer`);
}
if (!/created_by:\s*getAccessEmail\(context\)\s*\|\|\s*['"]admin['"]/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: the order_status_events insert must capture the real admin identity via created_by: getAccessEmail(context) || 'admin' (this field was previously missing entirely)`);
}

// ---------------------------------------------------------------------------
// 7) cancel_order (generic cancellation) must be left unchanged — B2 is
//    deliberately scoped to the dedicated mark_bank_transfer_not_received
//    action only, per the plan's §3 item 1/§12 open-question resolution.
// ---------------------------------------------------------------------------
if (/body\.action === 'cancel_order'[^\n]*&&[^\n]*rejectManualBankTransferPayment/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: rejectManualBankTransferPayment must not be wired into the generic cancel_order action in this batch — B2 is scoped to the dedicated mark_bank_transfer_not_received action only`);
}

// ---------------------------------------------------------------------------
// 8) email-events.js audit type integrity is owned by B2E (separate batch).
//    B2 payment/rejection behavior must remain unchanged; B2E may add
//    bank_transfer_reminder / bank_transfer_not_received_cancelled to EMAIL_TYPES
//    and harden safeEmailType() without failing this B2 validator.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 9) No migration/SQL added by this batch, and no email_events database
//    constraint change of any kind.
// ---------------------------------------------------------------------------
let migrationStatus = [];
try {
  migrationStatus = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatus = [];
}
const b2MigrationNamed = migrationStatus.filter((line) => /b2|bank_transfer_reject|email_events/i.test(line));
if (b2MigrationNamed.length) {
  failures.push(`B2 scope violation: a new migration file was detected — B2 must not create migrations or change any database constraint: ${b2MigrationNamed.join(', ')}`);
}
if (migrationChangesExcludingD3A(migrationStatus).length && !b2MigrationNamed.length) {
  // Any migration file change at all is out of scope for B2 — flag loudly
  // regardless of naming, since B2 must create zero migrations.
  failures.push(`B2 scope violation: supabase/migrations was modified — B2 must not create migrations or run SQL: ${migrationStatus.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 10) Chain H0/H1/H2/A1/B1/Batch 1/3/4/UI/production-readiness validators —
//     B2 must never regress any prior batch's guarantees, including B1's.
// ---------------------------------------------------------------------------
const chainedValidators = [
  'scripts/validate-b1-bank-transfer-finalization.mjs',
  'scripts/validate-a1-admin-rbac-hardening.mjs',
  'scripts/validate-a1-admin-endpoint-coverage.mjs',
  'scripts/validate-h2-return-attachment-preview.mjs',
  'scripts/validate-h1-return-attachment-storage-rls.mjs',
  'scripts/validate-h0-live-payment-rpc-hotfix.mjs',
  'scripts/validate-account-batch-1-safe-fixes.mjs',
  'scripts/validate-account-batch-3-order-cancellation.mjs',
  'scripts/validate-account-batch-4-loyalty-ledger.mjs',
  'scripts/validate-account-ui-polish.mjs'
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
  console.error('COSMOSKIN B2 bank transfer rejection finalization validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN B2 bank transfer rejection finalization validation passed.');
