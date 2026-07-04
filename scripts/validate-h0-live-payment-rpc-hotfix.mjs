import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const MIGRATION = 'supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql';

// ---------------------------------------------------------------------------
// 1) Required files exist
// ---------------------------------------------------------------------------
const requiredFiles = [
  MIGRATION,
  'functions/api/iyzico-callback.js',
  'functions/api/cron/release-expired-inventory.js'
];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}

if (!exists(MIGRATION)) {
  console.error('COSMOSKIN H0 payment RPC hotfix validation failed:');
  console.error(`- Missing required file: ${MIGRATION}`);
  process.exit(1);
}

const migration = read(MIGRATION);
const iyzicoCallback = read('functions/api/iyzico-callback.js');
const cronRelease = read('functions/api/cron/release-expired-inventory.js');

// SQL line-comment-stripped copy, used for every regex that must only match
// actual executable SQL (not prose in `--` comments describing the SQL).
const codeOnly = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

// ---------------------------------------------------------------------------
// 2) All three RPC definitions must be present
// ---------------------------------------------------------------------------
const hasSuccessFn = /CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_success\s*\(/i.test(migration);
const hasFailureFn = /CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_failure\s*\(/i.test(migration);
const hasExpiryFn = /CREATE OR REPLACE FUNCTION public\.release_expired_inventory_reservations\s*\(/i.test(migration);

if (!hasSuccessFn) failures.push('process_iyzico_payment_success definition is missing from the H0 migration');
if (!hasFailureFn) failures.push('process_iyzico_payment_failure definition is missing from the H0 migration');
if (!hasExpiryFn) failures.push('release_expired_inventory_reservations definition is missing from the H0 migration');

// ---------------------------------------------------------------------------
// 3) Function signatures must match the exact current code call sites
// ---------------------------------------------------------------------------
const successCallMatch = iyzicoCallback.match(/rpc\(context,\s*'process_iyzico_payment_success',\s*\{([\s\S]*?)\}\s*\)/);
const failureCallMatch = iyzicoCallback.match(/rpc\(context,\s*'process_iyzico_payment_failure',\s*\{([\s\S]*?)\}\s*\)/);
const cronCallMatch = cronRelease.match(/rpc\(context,\s*'release_expired_inventory_reservations',\s*\{([\s\S]*?)\}\s*\)/);

if (!successCallMatch) failures.push('functions/api/iyzico-callback.js: process_iyzico_payment_success call site not found (cannot verify signature match)');
if (!failureCallMatch) failures.push('functions/api/iyzico-callback.js: process_iyzico_payment_failure call site not found (cannot verify signature match)');
if (!cronCallMatch) failures.push('functions/api/cron/release-expired-inventory.js: release_expired_inventory_reservations call site not found (cannot verify signature match)');

function extractParamNames(callBody) {
  return Array.from(callBody.matchAll(/(p_[a-zA-Z0-9_]+)\s*:/g)).map((m) => m[1]).sort();
}
function extractSqlSignatureParams(sqlFnName) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${sqlFnName}\\s*\\(([\\s\\S]*?)\\)\\s*\\n?RETURNS`, 'i');
  const m = migration.match(re);
  if (!m) return null;
  return Array.from(m[1].matchAll(/(p_[a-zA-Z0-9_]+)\s+/g)).map((x) => x[1]).sort();
}

if (successCallMatch && hasSuccessFn) {
  const calledParams = extractParamNames(successCallMatch[1]);
  const sqlParams = extractSqlSignatureParams('process_iyzico_payment_success');
  const missing = calledParams.filter((p) => !(sqlParams || []).includes(p));
  if (missing.length) failures.push(`process_iyzico_payment_success: SQL signature is missing parameter(s) used by the caller: ${missing.join(', ')}`);
}
if (failureCallMatch && hasFailureFn) {
  const calledParams = extractParamNames(failureCallMatch[1]);
  const sqlParams = extractSqlSignatureParams('process_iyzico_payment_failure');
  const missing = calledParams.filter((p) => !(sqlParams || []).includes(p));
  if (missing.length) failures.push(`process_iyzico_payment_failure: SQL signature is missing parameter(s) used by the caller: ${missing.join(', ')}`);
}
if (cronCallMatch && hasExpiryFn) {
  const calledParams = extractParamNames(cronCallMatch[1]);
  const sqlParams = extractSqlSignatureParams('release_expired_inventory_reservations');
  const missing = calledParams.filter((p) => !(sqlParams || []).includes(p));
  if (missing.length) failures.push(`release_expired_inventory_reservations: SQL signature is missing parameter(s) used by the caller: ${missing.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 4) Stale reservation vocabulary regression guard
// ---------------------------------------------------------------------------
if (/inventory_reservations[\s\S]{0,80}status\s*=\s*'active'/i.test(codeOnly) || /status\s*=\s*'active'[\s\S]{0,80}inventory_reservations/i.test(codeOnly)) {
  failures.push("H0 migration must not check/compare inventory_reservations.status = 'active' (stale vocabulary — live rows use 'reserved')");
}
if (!/status\s*=\s*'reserved'/.test(codeOnly)) {
  failures.push("H0 migration must check inventory_reservations.status = 'reserved' (current live vocabulary)");
}

// ---------------------------------------------------------------------------
// 5) reservation_expired must not be written as a raw status/event_type value
//    unless the migration also widens the order_status_events CHECK
//    constraints to allow it.
// ---------------------------------------------------------------------------
const orderStatusEventsInsertBlocks = codeOnly.match(/INSERT INTO public\.order_status_events[\s\S]*?\);/g) || [];
const writesReservationExpiredAsEnumValue = orderStatusEventsInsertBlocks.some((block) => /VALUES\s*\(\s*[^,]+,\s*'reservation_expired'\s*,\s*'reservation_expired'/i.test(block));
const widensOrderStatusEventsForReservationExpired = /order_status_events[\s\S]{0,400}ADD CONSTRAINT[\s\S]{0,600}'reservation_expired'/i.test(codeOnly);
if (writesReservationExpiredAsEnumValue && !widensOrderStatusEventsForReservationExpired) {
  failures.push("H0 migration writes order_status_events.status/event_type = 'reservation_expired' without widening the CHECK constraint to allow it");
}

// ---------------------------------------------------------------------------
// 6) review_required must be allowed exactly where the code writes it
// ---------------------------------------------------------------------------
const codeWritesReviewRequired = /fulfillment_status\s*:\s*[^,]*'review_required'/.test(iyzicoCallback) || /review_required/.test(iyzicoCallback);
if (codeWritesReviewRequired) {
  const fulfillmentConstraintMatch = codeOnly.match(/ADD CONSTRAINT orders_fulfillment_status_final_chk\s+CHECK\s*\(([\s\S]*?)\)\s*;/i);
  if (!fulfillmentConstraintMatch) {
    failures.push('H0 migration must add/recreate orders_fulfillment_status_final_chk to allow review_required (functions/api/iyzico-callback.js writes this value)');
  } else if (!/'review_required'/.test(fulfillmentConstraintMatch[1])) {
    failures.push("orders_fulfillment_status_final_chk in the H0 migration does not include 'review_required'");
  } else {
    const requiredExisting = ['not_started', 'unfulfilled', 'preparing', 'packed', 'shipped', 'delivered', 'returned', 'cancelled'];
    const missingExisting = requiredExisting.filter((v) => !fulfillmentConstraintMatch[1].includes(`'${v}'`));
    if (missingExisting.length) failures.push(`orders_fulfillment_status_final_chk must keep existing allowed values, missing: ${missingExisting.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// 7) No destructive SQL
// ---------------------------------------------------------------------------
if (/\bDROP\s+TABLE\b/i.test(codeOnly)) failures.push('H0 migration must not contain DROP TABLE');
if (/\bTRUNCATE\b/i.test(codeOnly)) failures.push('H0 migration must not contain TRUNCATE');
if (/\bDELETE\s+FROM\b/i.test(codeOnly)) failures.push('H0 migration must not contain DELETE FROM');
if (/\bDROP\s+SCHEMA\b/i.test(codeOnly)) failures.push('H0 migration must not contain DROP SCHEMA');

// Constraint changes must be additive (DROP CONSTRAINT IF EXISTS paired with
// an ADD CONSTRAINT of the same name somewhere in the file), never a bare
// unpaired drop.
const dropConstraintNames = Array.from(codeOnly.matchAll(/DROP CONSTRAINT IF EXISTS (\w+)/gi)).map((m) => m[1]);
for (const name of dropConstraintNames) {
  const re = new RegExp(`ADD CONSTRAINT ${name}\\b`, 'i');
  if (!re.test(codeOnly)) failures.push(`H0 migration drops constraint ${name} without re-adding it — not additive-only`);
}

// ---------------------------------------------------------------------------
// 8) Advisory locks / idempotency guards present
// ---------------------------------------------------------------------------
if (!/pg_advisory_xact_lock/.test(migration)) failures.push('H0 migration functions must use pg_advisory_xact_lock for concurrency safety');
const successFnBody = migration.match(/CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_success[\s\S]*?\n\$\$;/)?.[0] || '';
const failureFnBody = migration.match(/CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_failure[\s\S]*?\n\$\$;/)?.[0] || '';
const expiryFnBody = migration.match(/CREATE OR REPLACE FUNCTION public\.release_expired_inventory_reservations[\s\S]*?\n\$\$;/)?.[0] || '';
if (successFnBody && !/pg_advisory_xact_lock/.test(successFnBody)) failures.push('process_iyzico_payment_success must use pg_advisory_xact_lock');
if (failureFnBody && !/pg_advisory_xact_lock/.test(failureFnBody)) failures.push('process_iyzico_payment_failure must use pg_advisory_xact_lock');
if (expiryFnBody && !/pg_advisory_xact_lock/.test(expiryFnBody)) failures.push('release_expired_inventory_reservations must use pg_advisory_xact_lock per order');
if (successFnBody && !/payment_events/.test(successFnBody)) failures.push('process_iyzico_payment_success must record a payment_events row for idempotency');
if (failureFnBody && !/payment_events/.test(failureFnBody)) failures.push('process_iyzico_payment_failure must record a payment_events row for idempotency');
if (failureFnBody && !/coupon_redemptions/.test(failureFnBody)) failures.push('process_iyzico_payment_failure must release coupon_redemptions reserved at checkout');
if (failureFnBody && !/paid['"]?\s*,\s*['"]?refunded['"]?\s*,\s*['"]?partially_refunded/i.test(failureFnBody.replace(/\s+/g, ' '))) {
  failures.push('process_iyzico_payment_failure must guard against mutating an already-paid/refunded order');
}
if (expiryFnBody && !/status = 'reserved'/.test(expiryFnBody)) failures.push('release_expired_inventory_reservations must only release status = \'reserved\' rows (never converted/paid inventory)');

// ---------------------------------------------------------------------------
// 9) SECURITY DEFINER + service_role-only grants
// ---------------------------------------------------------------------------
if (!/GRANT EXECUTE ON FUNCTION public\.process_iyzico_payment_success[\s\S]*?service_role/i.test(migration)) {
  failures.push('process_iyzico_payment_success must be granted to service_role only');
}
if (!/GRANT EXECUTE ON FUNCTION public\.process_iyzico_payment_failure[\s\S]*?service_role/i.test(migration)) {
  failures.push('process_iyzico_payment_failure must be granted to service_role only');
}
if (!/GRANT EXECUTE ON FUNCTION public\.release_expired_inventory_reservations[\s\S]*?service_role/i.test(migration)) {
  failures.push('release_expired_inventory_reservations must be granted to service_role only');
}

// ---------------------------------------------------------------------------
// 10) H0 must not touch checkout UI, iyzico refund logic, customer
//     cancellation files, returns, RBAC, or storage policies.
// ---------------------------------------------------------------------------
// functions/api/returns.js is no longer zero-diff-forbidden as of H1 (2026-07-04),
// which added a minimal client-supplied file_path ownership guard to close a
// storage RLS gap (see COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_REPORT_20260704.md).
// H1 does not touch functions/api/admin/returns.js, so that file remains frozen here.
const forbiddenPaths = [
  'checkout.html',
  'assets/checkout.js',
  'functions/api/create-checkout.js',
  'functions/api/admin/refunds.js',
  'functions/api/_lib/iyzico.js',
  'functions/api/account/orders/[id]/cancel.js',
  'functions/api/_lib/order-cancellation.js',
  'functions/api/admin/returns.js',
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js'
];

function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

for (const file of forbiddenPaths) {
  if (!exists(file)) continue;
  const diff = gitDiffFile(file);
  if (diff) failures.push(`H0 scope violation: ${file} must not be modified by this batch`);
}

// Storage policy migrations must not be modified by H0 itself (RLS/storage was
// out of scope for H0). H1 (2026-07-04) is a separate, later-approved batch that
// legitimately owns the return-attachments storage RLS fix — its own migration,
// validator, and report filenames are explicitly known-good here so H0's guard
// keeps protecting against *unrelated* RLS/storage/RBAC drift without false-failing
// on H1's own, separately-validated changes (see validate-h1-return-attachment-storage-rls.mjs).
let modifiedFiles = [];
try {
  modifiedFiles = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  modifiedFiles = [];
}
let untrackedForH0 = [];
try {
  untrackedForH0 = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim().split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim());
} catch (_) {
  untrackedForH0 = [];
}
const KNOWN_H1_FILES = new Set([
  'supabase/migrations/20260704_h1_return_attachment_storage_rls.sql',
  'scripts/validate-h1-return-attachment-storage-rls.mjs',
  'COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_REPORT_20260704.md',
  'COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_CHANGED_FILES_20260704.txt',
  'COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_SUPABASE_RUNBOOK_20260704.md',
  'COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_ROLLBACK_PLAN_20260704.md',
  'COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_PLAN_20260704.md'
]);
const storageOrRlsTouched = [...new Set([...modifiedFiles, ...untrackedForH0])]
  .filter((f) => f !== MIGRATION && !KNOWN_H1_FILES.has(f) && /rls|storage|admin[-_]?users|admin[-_]?permissions/i.test(f));
if (storageOrRlsTouched.length) {
  failures.push(`H0 scope violation: RLS/storage/RBAC-related files must not be modified: ${storageOrRlsTouched.join(', ')}`);
}

// H0 itself must not touch order_status_events/orders RLS or storage.objects policies.
if (/create policy|alter policy|storage\.objects/i.test(migration)) {
  failures.push('H0 migration must not create/alter RLS policies or touch storage.objects (out of scope for this hotfix)');
}

// ---------------------------------------------------------------------------
// 10b) H0b standalone patch: supabase/migrations/20260704_h0b_release_expired_inventory_patch.sql
//      Small corrective patch that re-applies the already-approved
//      release_expired_inventory_reservations fixes on their own, because
//      live verification showed the function was still running its
//      pre-patch body after H0. Must touch ONLY this one function.
// ---------------------------------------------------------------------------
const H0B_PATCH = 'supabase/migrations/20260704_h0b_release_expired_inventory_patch.sql';
if (!exists(H0B_PATCH)) {
  failures.push(`Missing required file: ${H0B_PATCH}`);
} else {
  const h0bRaw = read(H0B_PATCH);
  const h0bCodeOnly = h0bRaw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  if (!/CREATE OR REPLACE FUNCTION public\.release_expired_inventory_reservations\s*\(/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: must CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations`);
  }
  // Must touch ONLY this one function — no other RPCs, no table/constraint/policy changes.
  if (/CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_success/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: must not define/modify process_iyzico_payment_success`);
  }
  if (/CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_failure/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: must not define/modify process_iyzico_payment_failure`);
  }
  if (/\bALTER\s+TABLE\b/i.test(h0bCodeOnly)) failures.push(`${H0B_PATCH}: must not contain ALTER TABLE (no table/constraint changes in this patch)`);
  if (/\bCREATE\s+POLICY\b|\bALTER\s+POLICY\b|storage\.objects/i.test(h0bCodeOnly)) failures.push(`${H0B_PATCH}: must not touch RLS/storage policies`);
  if (/\bDROP\s+TABLE\b/i.test(h0bCodeOnly)) failures.push(`${H0B_PATCH}: must not contain DROP TABLE`);
  if (/\bTRUNCATE\b/i.test(h0bCodeOnly)) failures.push(`${H0B_PATCH}: must not contain TRUNCATE`);
  if (/\bDELETE\s+FROM\b/i.test(h0bCodeOnly)) failures.push(`${H0B_PATCH}: must not contain DELETE FROM`);

  // Required live corrections.
  if (/'inventory'\s*,\s*'reservation_expiry_job'/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: order_status_events.source must be 'system', not 'inventory'`);
  }
  if (!/'system'\s*,\s*'reservation_expiry_job'/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: order_status_events.source = 'system' is missing`);
  }
  const h0bEligibilityMatch = h0bCodeOnly.match(/o\.status\s+IN\s*\(([^)]*)\)/i);
  if (!h0bEligibilityMatch) {
    failures.push(`${H0B_PATCH}: eligible-orders o.status IN (...) filter not found`);
  } else if (!/'pending'/.test(h0bEligibilityMatch[1])) {
    failures.push(`${H0B_PATCH}: eligible orders.status list is missing 'pending'`);
  }
  const h0bFulfillmentMatch = h0bCodeOnly.match(/fulfillment_status\s+IN\s*\(([^)]*)\)/i);
  if (!h0bFulfillmentMatch) {
    failures.push(`${H0B_PATCH}: fulfillment_status cancellation IN (...) list not found`);
  } else if (!/'unfulfilled'/.test(h0bFulfillmentMatch[1])) {
    failures.push(`${H0B_PATCH}: fulfillment_status cancellation list is missing 'unfulfilled'`);
  }

  // Preserved-from-H0 regressions guard.
  if (/inventory_reservations[\s\S]{0,80}status\s*=\s*'active'/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: must not use stale inventory_reservations.status = 'active' vocabulary`);
  }
  if (!/r\.status\s*=\s*'reserved'/.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: must filter r.status = 'reserved' (current live vocabulary)`);
  }
  const h0bEventsBlocks = h0bCodeOnly.match(/INSERT INTO public\.order_status_events[\s\S]*?\);/g) || [];
  const h0bWritesReservationExpiredAsEnum = h0bEventsBlocks.some((block) => /VALUES\s*\(\s*[^,]+,\s*'reservation_expired'\s*,\s*'reservation_expired'/i.test(block));
  if (h0bWritesReservationExpiredAsEnum) {
    failures.push(`${H0B_PATCH}: must not write order_status_events.status/event_type = 'reservation_expired' (no matching CHECK widening in this patch) — use 'stock_released'`);
  }
  if (!h0bEventsBlocks.some((block) => /'stock_released'\s*,\s*'stock_released'/i.test(block))) {
    failures.push(`${H0B_PATCH}: order_status_events audit row should use 'stock_released' for status/event_type`);
  }

  // service_role-only grants.
  if (!/GRANT EXECUTE ON FUNCTION public\.release_expired_inventory_reservations[\s\S]*?service_role/i.test(h0bCodeOnly)) {
    failures.push(`${H0B_PATCH}: release_expired_inventory_reservations must be granted to service_role only`);
  }

  if (!/pg_advisory_xact_lock/.test(h0bCodeOnly)) failures.push(`${H0B_PATCH}: must use pg_advisory_xact_lock for concurrency safety`);
}

// ---------------------------------------------------------------------------
// 10c) H0c standalone patch: supabase/migrations/20260704_h0c_release_expired_pending_status_patch.sql
//      H0b added orders.status = 'pending' to the eligibility filter, but left
//      the UPDATE's status CASE only moving 'pending_payment'/'pending_bank_transfer'
//      to 'cancelled' — an eligible 'pending' order would then be released/failed/
//      cancelled on payment_status/fulfillment_status while status stayed 'pending'.
//      Must touch ONLY this one function.
// ---------------------------------------------------------------------------
const H0C_PATCH = 'supabase/migrations/20260704_h0c_release_expired_pending_status_patch.sql';
if (!exists(H0C_PATCH)) {
  failures.push(`Missing required file: ${H0C_PATCH}`);
} else {
  const h0cRaw = read(H0C_PATCH);
  const h0cCodeOnly = h0cRaw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  if (!/CREATE OR REPLACE FUNCTION public\.release_expired_inventory_reservations\s*\(/i.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: must CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations`);
  }
  // Must touch ONLY this one function — no other RPCs, no table/constraint/policy changes.
  if (/CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_success/i.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: must not define/modify process_iyzico_payment_success`);
  }
  if (/CREATE OR REPLACE FUNCTION public\.process_iyzico_payment_failure/i.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: must not define/modify process_iyzico_payment_failure`);
  }
  if (/\bALTER\s+TABLE\b/i.test(h0cCodeOnly)) failures.push(`${H0C_PATCH}: must not contain ALTER TABLE (no table/constraint changes in this patch)`);
  if (/\bCREATE\s+POLICY\b|\bALTER\s+POLICY\b|storage\.objects/i.test(h0cCodeOnly)) failures.push(`${H0C_PATCH}: must not touch RLS/storage policies`);
  if (/\bDROP\s+TABLE\b/i.test(h0cCodeOnly)) failures.push(`${H0C_PATCH}: must not contain DROP TABLE`);
  if (/\bTRUNCATE\b/i.test(h0cCodeOnly)) failures.push(`${H0C_PATCH}: must not contain TRUNCATE`);
  if (/\bDELETE\s+FROM\b/i.test(h0cCodeOnly)) failures.push(`${H0C_PATCH}: must not contain DELETE FROM`);

  // Required live correction: the UPDATE's orders.status CASE must include 'pending',
  // matching the 'pending' value already present in the eligibility filter (H0b).
  const h0cStatusCaseMatch = h0cCodeOnly.match(/SET\s+status\s*=\s*CASE\s+WHEN\s+status\s+IN\s*\(([^)]*)\)\s+THEN\s+'cancelled'/i);
  if (!h0cStatusCaseMatch) {
    failures.push(`${H0C_PATCH}: UPDATE orders SET status = CASE WHEN status IN (...) THEN 'cancelled' ... not found`);
  } else if (!/'pending'/.test(h0cStatusCaseMatch[1])) {
    failures.push(`${H0C_PATCH}: UPDATE orders status CASE is missing 'pending' (must match the 'pending' eligibility value added in H0b)`);
  } else {
    const requiredStatusValues = ['pending', 'pending_payment', 'pending_bank_transfer'];
    const missingStatusValues = requiredStatusValues.filter((v) => !h0cStatusCaseMatch[1].includes(`'${v}'`));
    if (missingStatusValues.length) failures.push(`${H0C_PATCH}: UPDATE orders status CASE must keep existing values, missing: ${missingStatusValues.join(', ')}`);
  }

  // Eligibility filter and fulfillment_status list from H0b must still be present.
  const h0cEligibilityMatch = h0cCodeOnly.match(/o\.status\s+IN\s*\(([^)]*)\)/i);
  if (!h0cEligibilityMatch || !/'pending'/.test(h0cEligibilityMatch[1])) {
    failures.push(`${H0C_PATCH}: eligible orders.status list must still include 'pending' (from H0b)`);
  }
  const h0cFulfillmentMatch = h0cCodeOnly.match(/fulfillment_status\s+IN\s*\(([^)]*)\)/i);
  if (!h0cFulfillmentMatch || !/'unfulfilled'/.test(h0cFulfillmentMatch[1])) {
    failures.push(`${H0C_PATCH}: fulfillment_status cancellation list must still include 'unfulfilled' (from H0b)`);
  }
  if (!/'system'\s*,\s*'reservation_expiry_job'/i.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: order_status_events.source = 'system' must still be present (from H0b)`);
  }

  // Preserved-from-H0/H0b regressions guard.
  if (/inventory_reservations[\s\S]{0,80}status\s*=\s*'active'/i.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: must not use stale inventory_reservations.status = 'active' vocabulary`);
  }
  if (!/r\.status\s*=\s*'reserved'/.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: must filter r.status = 'reserved' (current live vocabulary)`);
  }
  const h0cEventsBlocks = h0cCodeOnly.match(/INSERT INTO public\.order_status_events[\s\S]*?\);/g) || [];
  const h0cWritesReservationExpiredAsEnum = h0cEventsBlocks.some((block) => /VALUES\s*\(\s*[^,]+,\s*'reservation_expired'\s*,\s*'reservation_expired'/i.test(block));
  if (h0cWritesReservationExpiredAsEnum) {
    failures.push(`${H0C_PATCH}: must not write order_status_events.status/event_type = 'reservation_expired' — use 'stock_released'`);
  }

  // service_role-only grants.
  if (!/GRANT EXECUTE ON FUNCTION public\.release_expired_inventory_reservations[\s\S]*?service_role/i.test(h0cCodeOnly)) {
    failures.push(`${H0C_PATCH}: release_expired_inventory_reservations must be granted to service_role only`);
  }

  if (!/pg_advisory_xact_lock/.test(h0cCodeOnly)) failures.push(`${H0C_PATCH}: must use pg_advisory_xact_lock for concurrency safety`);
}

// ---------------------------------------------------------------------------
// 11) Chain Batch 1-4 validators
// ---------------------------------------------------------------------------
const chainedValidators = [
  'scripts/validate-account-batch-1-safe-fixes.mjs',
  'scripts/validate-account-batch-3-order-cancellation.mjs',
  'scripts/validate-account-batch-4-loyalty-ledger.mjs',
  'scripts/validate-account-ui-polish.mjs'
];
for (const script of chainedValidators) {
  if (!exists(script)) {
    failures.push(`Guardrail missing: ${script} not found`);
    continue;
  }
  try {
    execSync(`node ${JSON.stringify(script)}`, { cwd: root, stdio: 'pipe' });
  } catch (error) {
    failures.push(`Prior validator failed: ${script}\n${(error.stdout || '').toString()}${(error.stderr || '').toString()}`);
  }
}

if (failures.length) {
  console.error('COSMOSKIN H0 payment RPC hotfix validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN H0 payment RPC hotfix validation passed.');
