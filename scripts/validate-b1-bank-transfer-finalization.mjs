import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const COMMERCE_LIB = 'functions/api/_lib/commerce-finalization.js';
const CALLBACK = 'functions/api/iyzico-callback.js';
const ADMIN_ORDERS = 'functions/api/admin/orders.js';
const ADMIN_ORDER_STATUS = 'functions/api/admin/orders/[id]/status.js';

const stripComments = (src) => src.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

// Brace-balanced extraction: finds `sigPrefix + name` then returns the full
// function source up to (and including) the matching closing brace, so a
// trailing comment block belonging to the *next* export is never swept in
// (unlike a naive "up to the next \nexport " cut).
function extractBalancedFn(src, sigPrefix, name) {
  const start = src.indexOf(`${sigPrefix} ${name}`);
  if (start === -1) return '';
  // Find the end of the parameter list first (paren-depth balanced), so a
  // destructured-default-param brace (e.g. `{ note = null } = {}`) in the
  // signature is never mistaken for the function body's opening brace.
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
function extractHandler(src, name) {
  return extractBalancedFn(src, 'export async function', name);
}
function gitShowHead(file) {
  try {
    return execSync(`git show HEAD:${JSON.stringify(file).replace(/^"|"$/g, '')}`, { cwd: root, encoding: 'utf8' });
  } catch (_) {
    return null;
  }
}
function gitShowRef(ref, file) {
  try {
    return execSync(`git show ${ref}:${JSON.stringify(file).replace(/^"|"$/g, '')}`, { cwd: root, encoding: 'utf8' });
  } catch (_) {
    return null;
  }
}
/** Pre-extraction iyzico-callback: HEAD when B1 is uncommitted, else walk history. */
function getPreExtractionCallback() {
  const head = gitShowHead(CALLBACK);
  if (head && /\basync function finalizeCommerceAfterPayment\b/.test(head)) {
    return head;
  }
  for (let n = 1; n <= 30; n += 1) {
    const prev = gitShowRef(`HEAD~${n}`, CALLBACK);
    if (prev && /\basync function finalizeCommerceAfterPayment\b/.test(prev)) {
      return prev;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1) Required files exist
// ---------------------------------------------------------------------------
const requiredFiles = [COMMERCE_LIB, CALLBACK, ADMIN_ORDERS, ADMIN_ORDER_STATUS];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN B1 bank transfer finalization validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const commerceLib = read(COMMERCE_LIB);
const callback = read(CALLBACK);
const adminOrders = read(ADMIN_ORDERS);
const adminOrderStatus = read(ADMIN_ORDER_STATUS);

// ---------------------------------------------------------------------------
// 2) Shared helper must export all three functions
// ---------------------------------------------------------------------------
const confirmFnBody = extractFn(commerceLib, 'confirmManualBankTransferPayment');
const finalizeFnBody = extractFn(commerceLib, 'finalizeCommerceAfterPayment');
const shipmentFnBody = extractFn(commerceLib, 'ensureShipmentShell');
if (!confirmFnBody) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment() export not found`);
if (!finalizeFnBody) failures.push(`${COMMERCE_LIB}: finalizeCommerceAfterPayment() export not found`);
if (!shipmentFnBody) failures.push(`${COMMERCE_LIB}: ensureShipmentShell() export not found`);

// ---------------------------------------------------------------------------
// 3) Byte-identical extraction proof: the two functions that used to live in
//    iyzico-callback.js (pre-extraction baseline) must be byte-identical to
//    the versions now living in the shared helper. When B1 is already
//    committed at HEAD, the baseline is read from git history (HEAD~n).
// ---------------------------------------------------------------------------
const baselineCallback = getPreExtractionCallback();
if (baselineCallback === null) {
  console.warn(`${CALLBACK}: pre-extraction version was not found in the recent git history; skipping byte-identical extraction proof and validating current callback/helper structure instead.`);
} else {
  // Baseline defined these as plain `async function`, not `export async function`.
  const headFinalizeBody = extractBalancedFn(baselineCallback, 'async function', 'finalizeCommerceAfterPayment');
  const headShipmentBody = extractBalancedFn(baselineCallback, 'async function', 'ensureShipmentShell');

  if (!headFinalizeBody) {
    failures.push(`${CALLBACK} (baseline): finalizeCommerceAfterPayment() body not found — cannot prove byte-identical extraction`);
  } else if (headFinalizeBody.replace(/^async function/, 'export async function').trim() !== finalizeFnBody.trim()) {
    failures.push(`${COMMERCE_LIB}: finalizeCommerceAfterPayment() is not byte-identical to the version previously in ${CALLBACK} — card payment behavior may have changed`);
  }
  if (!headShipmentBody) {
    failures.push(`${CALLBACK} (baseline): ensureShipmentShell() body not found — cannot prove byte-identical extraction`);
  } else if (headShipmentBody.replace(/^async function/, 'export async function').trim() !== shipmentFnBody.trim()) {
    failures.push(`${COMMERCE_LIB}: ensureShipmentShell() is not byte-identical to the version previously in ${CALLBACK} — card payment behavior may have changed`);
  }
}

// ---------------------------------------------------------------------------
// 4) iyzico-callback.js must no longer define these two functions locally,
//    must import both from the shared helper, and must still call both
//    (same call sites, same order) — i.e. this was a pure relocation, not a
//    behavior change.
// ---------------------------------------------------------------------------
if (/\basync function finalizeCommerceAfterPayment\b/.test(callback) || /\basync function ensureShipmentShell\b/.test(callback)) {
  failures.push(`${CALLBACK}: must not define finalizeCommerceAfterPayment/ensureShipmentShell locally anymore — they must live only in ${COMMERCE_LIB}`);
}
if (!/import\s*\{[^}]*finalizeCommerceAfterPayment[^}]*\}\s*from\s*['"]\.\/_lib\/commerce-finalization\.js['"]/.test(callback)) {
  failures.push(`${CALLBACK}: must import finalizeCommerceAfterPayment from ./_lib/commerce-finalization.js`);
}
if (!/import\s*\{[^}]*ensureShipmentShell[^}]*\}\s*from\s*['"]\.\/_lib\/commerce-finalization\.js['"]/.test(callback)) {
  failures.push(`${CALLBACK}: must import ensureShipmentShell from ./_lib/commerce-finalization.js`);
}
if (!/finalizeCommerceAfterPayment\(context,\s*orderId\)/.test(callback)) {
  failures.push(`${CALLBACK}: must still call finalizeCommerceAfterPayment(context, orderId) on the card-success path`);
}
if (!/ensureShipmentShell\(context,\s*orderId\)/.test(callback)) {
  failures.push(`${CALLBACK}: must still call ensureShipmentShell(context, orderId) on the card-success path`);
}
// confirmManualBankTransferPayment must never be imported/used by the card callback.
if (/confirmManualBankTransferPayment/.test(callback)) {
  failures.push(`${CALLBACK}: must not import or call confirmManualBankTransferPayment — that helper is manual-bank-transfer-only and must never run on the card/iyzico path`);
}

// ---------------------------------------------------------------------------
// 5) iyzico-callback.js: everything else must be byte-identical to the
//    pre-extraction baseline once the extracted function bodies and the
//    changed import line are removed from both copies.
// ---------------------------------------------------------------------------
if (baselineCallback !== null) {
  function stripExtractedAndImports(src, isBaseline) {
    let out = src;
    if (isBaseline) {
      out = out.replace(/\nasync function ensureShipmentShell[\s\S]*?\n}\n\nasync function finalizeCommerceAfterPayment[\s\S]*?\n}\n/, '\n');
      out = out.replace(/import \{ awardOrderPoints \} from '\.\/_lib\/loyalty-ledger\.js';/, '');
    } else {
      out = out.replace(/import \{ ensureShipmentShell, finalizeCommerceAfterPayment \} from '\.\/_lib\/commerce-finalization\.js';/, '');
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  const baselineStripped = stripExtractedAndImports(baselineCallback, true);
  const workingStripped = stripExtractedAndImports(callback, false);
  if (baselineStripped !== workingStripped) {
    failures.push(`${CALLBACK}: changes beyond the finalizeCommerceAfterPayment/ensureShipmentShell extraction were detected — B1 must not alter card payment (iyzico) behavior`);
  }
}

// ---------------------------------------------------------------------------
// 6) confirmManualBankTransferPayment() structural requirements:
//    - guards on payment_method !== 'bank_transfer'
//    - checks payment_events for an existing confirmation BEFORE any write,
//      and returns {idempotent:true} without performing any further writes
//    - updates payments.status to 'paid'
//    - updates orders.payment_status to 'paid' (defensive fallback)
//    - calls the idempotent convert_order_inventory RPC (via convertInventoryReservations)
//    - reuses finalizeCommerceAfterPayment() for coupon + invoice + loyalty
//      (must NOT duplicate coupon_redemptions/invoice_records writes itself)
//    - reuses ensureShipmentShell()
//    - inserts a payment_events row for the manual confirmation
// ---------------------------------------------------------------------------
if (confirmFnBody) {
  if (!/payment_method\s*!==\s*['"]bank_transfer['"]/.test(confirmFnBody)) {
    failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must reject non-bank_transfer orders`);
  }
  const idempotencyCheckIdx = confirmFnBody.indexOf("event_type: 'eq.bank_transfer_payment_confirmed'");
  const idempotentReturnIdx = confirmFnBody.indexOf('idempotent: true');
  const paymentsUpdateIdx = confirmFnBody.indexOf("updateRows(context, 'payments'");
  const inventoryConvertIdx = confirmFnBody.indexOf('convertInventoryReservations(context, orderId)');
  const finalizeCallIdx = confirmFnBody.indexOf('finalizeCommerceAfterPayment(context, orderId)');
  const shipmentCallIdx = confirmFnBody.indexOf('ensureShipmentShell(context, orderId)');
  const eventsInsertIdx = confirmFnBody.indexOf("insertRow(context, 'payment_events'");

  if (idempotencyCheckIdx === -1) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must check payment_events for an existing 'bank_transfer_payment_confirmed' record before writing anything`);
  if (idempotentReturnIdx === -1) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must return an { idempotent: true } result when already confirmed`);
  if (idempotencyCheckIdx !== -1 && idempotentReturnIdx !== -1 && paymentsUpdateIdx !== -1 && !(idempotencyCheckIdx < idempotentReturnIdx && idempotentReturnIdx < paymentsUpdateIdx)) {
    failures.push(`${COMMERCE_LIB}: the payment_events idempotency check and its early return must occur BEFORE the payments table update — a repeat approval must short-circuit before any further writes`);
  }
  if (paymentsUpdateIdx === -1 || !/status:\s*['"]paid['"]/.test(confirmFnBody.slice(paymentsUpdateIdx, paymentsUpdateIdx + 400))) {
    failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must update the payments table's status to 'paid'`);
  }
  if (!/payment_status:\s*['"]paid['"]/.test(confirmFnBody)) {
    failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must set orders.payment_status to 'paid'`);
  }
  if (inventoryConvertIdx === -1) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must call convertInventoryReservations(context, orderId) (same idempotent RPC as the card path)`);
  if (finalizeCallIdx === -1) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must call finalizeCommerceAfterPayment(context, orderId) to reuse the card path's coupon/invoice/loyalty finalization instead of duplicating it`);
  if (shipmentCallIdx === -1) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must call ensureShipmentShell(context, orderId)`);
  if (eventsInsertIdx === -1) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must insert a payment_events row for the manual confirmation`);
  if (finalizeCallIdx !== -1 && idempotentReturnIdx !== -1 && !(idempotentReturnIdx < finalizeCallIdx)) {
    failures.push(`${COMMERCE_LIB}: the idempotency short-circuit must occur before finalizeCommerceAfterPayment() is called`);
  }
  // Must not duplicate coupon/invoice writes itself — that would risk drifting
  // from the card path's logic instead of staying consistent with it.
  if (/insertRow\(context,\s*['"]coupon_redemptions['"]/.test(confirmFnBody) || /insertRow\(context,\s*['"]invoice_records['"]/.test(confirmFnBody)) {
    failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must not write coupon_redemptions/invoice_records itself — it must reuse finalizeCommerceAfterPayment() so both payment paths stay consistent`);
  }
  // event_type/provider naming must not collide with the card ('iyzico') audit trail.
  if (!/event_type:\s*['"]bank_transfer_payment_confirmed['"]/.test(confirmFnBody)) {
    failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must write payment_events.event_type = 'bank_transfer_payment_confirmed'`);
  }
  if (!/provider:\s*['"]bank_transfer['"]/.test(confirmFnBody)) {
    failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment must write payment_events.provider = 'bank_transfer' (must never write provider:'iyzico')`);
  }
}

// ---------------------------------------------------------------------------
// 7) Only known-valid status literals may be introduced. Cross-checked
//    against the existing valid-status vocabularies already enforced by
//    admin/orders.js (VALID_ORDER_STATUSES / VALID_PAYMENT_STATUSES /
//    VALID_FULFILLMENT) and by the payments table's CHECK constraint.
// ---------------------------------------------------------------------------
const VALID_ORDER_STATUSES = ['pending_payment', 'pending_bank_transfer', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'payment_failed', 'refunded', 'partially_refunded'];
const VALID_FULFILLMENT = ['not_started', 'unfulfilled', 'preparing', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'];
const VALID_PAYMENT_TABLE_STATUSES = ['initiated', 'awaiting_transfer', 'paid', 'failed', 'initialize_failed', 'refunded', 'partially_refunded'];
if (confirmFnBody) {
  const statusLiterals = Array.from(confirmFnBody.matchAll(/\bstatus:\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  const paymentStatusLiterals = Array.from(confirmFnBody.matchAll(/\bpayment_status:\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  const fulfillmentLiterals = Array.from(confirmFnBody.matchAll(/\bfulfillment_status:\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  for (const s of statusLiterals) {
    if (!VALID_PAYMENT_TABLE_STATUSES.includes(s) && !VALID_ORDER_STATUSES.includes(s) && s !== 'processed') {
      failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment uses an unrecognized status literal '${s}' — must be one of the existing valid payments/orders/payment_events status vocabularies`);
    }
  }
  for (const s of paymentStatusLiterals) {
    if (s !== 'paid') failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment sets an unexpected orders.payment_status literal '${s}' (expected 'paid')`);
  }
  for (const s of fulfillmentLiterals) {
    if (!VALID_FULFILLMENT.includes(s)) failures.push(`${COMMERCE_LIB}: confirmManualBankTransferPayment uses an unrecognized fulfillment_status literal '${s}'`);
  }
}

// ---------------------------------------------------------------------------
// 8) admin/orders.js wiring: permission guard retained, helper imported and
//    called only for bank_transfer orders on mark_payment_paid, email
//    de-dup guard present, real admin identity captured instead of a
//    hardcoded 'admin' literal for the status-change audit event.
// ---------------------------------------------------------------------------
if (!/requireAdminPermission\(context,\s*['"]orders:update['"]\)/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: onRequestPatch must keep requireAdminPermission(context, 'orders:update')`);
}
if (!/import\s*\{[^}]*confirmManualBankTransferPayment[^}]*\}\s*from\s*['"]\.\.\/_lib\/commerce-finalization\.js['"]/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: must import confirmManualBankTransferPayment from ../_lib/commerce-finalization.js`);
}
if (!/body\.action === 'mark_payment_paid' && before\.payment_method === 'bank_transfer'/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: confirmManualBankTransferPayment must be called only when action is mark_payment_paid AND the order's payment_method is bank_transfer`);
}
if (!/getAccessEmail\(context\)/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: must capture the real admin identity via getAccessEmail(context) instead of relying solely on a hardcoded 'admin' literal`);
}
if (/created_by:\s*'admin',\s*\n\s*metadata:\s*\{\s*payment_status/.test(adminOrders)) {
  failures.push(`${ADMIN_ORDERS}: the status-change order_status_events call still hardcodes created_by: 'admin' — must use getAccessEmail(context) || 'admin'`);
}
// Email de-dup: payment_confirmed_manual must be gated on before.payment_status !== 'paid'.
const paymentEmailBlockIdx = adminOrders.indexOf("sendAndLogStatusEmail(context, latestOrderForPayment, 'paid', 'payment_confirmed_manual')");
if (paymentEmailBlockIdx === -1) {
  failures.push(`${ADMIN_ORDERS}: payment_confirmed_manual email send call not found`);
} else {
  const guardWindow = adminOrders.slice(Math.max(0, paymentEmailBlockIdx - 400), paymentEmailBlockIdx);
  if (!/before\.payment_status !== 'paid'/.test(guardWindow)) {
    failures.push(`${ADMIN_ORDERS}: payment_confirmed_manual email must be gated on before.payment_status !== 'paid' to prevent duplicate sends on repeated approval clicks`);
  }
  if (!/bankTransferConfirmation\?\.idempotent !== true/.test(guardWindow)) {
    failures.push(`${ADMIN_ORDERS}: payment_confirmed_manual email must also be gated on the bank-transfer confirmation result not being idempotent (belt-and-suspenders against a race between two near-simultaneous approval clicks)`);
  }
}
// mark_payment_paid handling must never run for a card-payment order or any
// other action — confirmManualBankTransferPayment throws on payment_method
// !== 'bank_transfer', so a missing guard would break card 'mark_payment_paid'
// admin corrections; the regex above already requires both conditions ANDed.

// ---------------------------------------------------------------------------
// 9) admin/orders/[id]/status.js wiring: same helper, same permission, only
//    for bank_transfer orders being marked paid.
// ---------------------------------------------------------------------------
if (!/requireAdminPermission\(context,\s*['"]orders:update['"]\)/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: onRequestPatch must keep requireAdminPermission(context, 'orders:update')`);
}
if (!/import\s*\{[^}]*confirmManualBankTransferPayment[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/_lib\/commerce-finalization\.js['"]/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: must import confirmManualBankTransferPayment from ../../../_lib/commerce-finalization.js`);
}
if (!/body\.status === 'paid' && current\.payment_method === 'bank_transfer'/.test(adminOrderStatus)) {
  failures.push(`${ADMIN_ORDER_STATUS}: confirmManualBankTransferPayment must be called only when body.status is 'paid' AND the order's payment_method is bank_transfer`);
}

// ---------------------------------------------------------------------------
// 10) B1-era rejection/cancellation guardrail — REVISED for B2.
//
//     At B1 time, the mark_bank_transfer_not_received block (admin/orders.js)
//     and the cancelled-status branch (admin/orders/[id]/status.js) were
//     required to be byte-identical to HEAD, because B1 was explicitly
//     scoped to approval only and forbidden from touching rejection.
//
//     COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_PLAN_20260705.md
//     intentionally and legitimately owns rejection/cancellation
//     finalization from this point forward (payments row, payment_events
//     audit, coupon/inventory release centralization via
//     rejectManualBankTransferPayment()) — so the two byte-identical checks
//     that used to guard this exact block/branch are removed here. B2's own
//     validator (scripts/validate-b2-bank-transfer-rejection-finalization.mjs)
//     is now the authoritative guardrail for rejection/cancellation
//     correctness; this file keeps guarding everything that remains B1's
//     concern (the approval path, the card/iyzico callback, and the parts of
//     the cancellation guards that neither B1 nor B2 should ever touch).
// ---------------------------------------------------------------------------
function extractBlock(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) return '';
  const end = src.indexOf(endMarker, start + startMarker.length);
  return src.slice(start, end === -1 ? undefined : end);
}
const headAdminOrders = gitShowHead(ADMIN_ORDERS);
if (headAdminOrders !== null) {
  // assertOperationalTransition() and the paid-order direct-cancel 409 guard
  // are structural safety checks neither B1 nor B2 is allowed to weaken —
  // still enforced byte-identical/present here, unchanged from B1.
  const headAssertTransition = extractFn(headAdminOrders, 'onRequestPatch') && (() => {
    const start = headAdminOrders.indexOf('function assertOperationalTransition');
    const end = headAdminOrders.indexOf('\nfunction buildTrackingUrl');
    return start === -1 ? '' : headAdminOrders.slice(start, end === -1 ? undefined : end);
  })();
  const workingAssertTransition = (() => {
    const start = adminOrders.indexOf('function assertOperationalTransition');
    const end = adminOrders.indexOf('\nfunction buildTrackingUrl');
    return start === -1 ? '' : adminOrders.slice(start, end === -1 ? undefined : end);
  })();
  if (!headAssertTransition || headAssertTransition !== workingAssertTransition) {
    failures.push(`${ADMIN_ORDERS}: assertOperationalTransition() must remain byte-identical to HEAD — neither B1 nor B2 may touch order status transition/cancellation guards`);
  }
  const headCancelGuard = /Ödemesi alınmış sipariş doğrudan iptal edilemez\. Önce kontrollü iade sürecini başlatın\./.test(headAdminOrders);
  const workingCancelGuard = /Ödemesi alınmış sipariş doğrudan iptal edilemez\. Önce kontrollü iade sürecini başlatın\./.test(adminOrders);
  if (headCancelGuard && !workingCancelGuard) {
    failures.push(`${ADMIN_ORDERS}: paid-order direct-cancel 409 guard must remain present — neither B1 nor B2 may touch this guard`);
  }
}

// ---------------------------------------------------------------------------
// 11) No migration/SQL added by this batch.
// ---------------------------------------------------------------------------
let migrationStatusBefore = [];
try {
  migrationStatusBefore = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatusBefore = [];
}
const b1MigrationNamed = migrationStatusBefore.filter((line) => /b1|bank_transfer_finaliz/i.test(line));
if (b1MigrationNamed.length) {
  failures.push(`B1 scope violation: a new B1-named migration file was detected — B1 must not create migrations: ${b1MigrationNamed.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 12) Chain H0/H1/H2/A1/Batch 1/3/4/UI/production-readiness validators — B1
//     must never regress any prior batch's guarantees.
// ---------------------------------------------------------------------------
const chainedValidators = [
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
  console.error('COSMOSKIN B1 bank transfer finalization validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN B1 bank transfer finalization validation passed.');
