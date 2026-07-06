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


const AUDIT_LIB = 'functions/api/_lib/admin-audit.js';
const ADMIN_LIB = 'functions/api/_lib/admin.js';
const USERS_API = 'functions/api/admin/users.js';

// ---------------------------------------------------------------------------
// 1) Required files exist
// ---------------------------------------------------------------------------
const requiredFiles = [AUDIT_LIB, ADMIN_LIB, USERS_API];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN A1 admin RBAC hardening validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const auditLib = read(AUDIT_LIB);
const adminLib = read(ADMIN_LIB);
const usersApi = read(USERS_API);

// Comment-stripped copies for checks that must only match actual executable
// code, not prose in comments describing intent/history.
const stripComments = (src) => src.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const auditLibCodeOnly = stripComments(auditLib);
const usersApiCodeOnly = stripComments(usersApi);

// ---------------------------------------------------------------------------
// 2) hasAdminPermission() must be isolated and inspected as a unit.
// ---------------------------------------------------------------------------
const hasPermFnStart = auditLibCodeOnly.indexOf('export async function hasAdminPermission');
if (hasPermFnStart === -1) {
  failures.push(`${AUDIT_LIB}: hasAdminPermission() export not found`);
}
const nextExportAfterHasPerm = hasPermFnStart === -1
  ? -1
  : auditLibCodeOnly.indexOf('\nexport ', hasPermFnStart + 1);
const hasPermFnBody = hasPermFnStart === -1
  ? ''
  : auditLibCodeOnly.slice(hasPermFnStart, nextExportAfterHasPerm === -1 ? undefined : nextExportAfterHasPerm);

if (hasPermFnBody) {
  // 2a) The confirmed P0 bypass must be gone: no path may return true when
  //     getAdminRecord() resolved no admin row at all.
  if (/if\s*\(\s*!admin\s*\)\s*return\s+true/.test(hasPermFnBody)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() still contains "if (!admin) return true" — the allow-all/no-match bypass must be removed`);
  }
  if (!/if\s*\(\s*!admin\s*\)\s*return\s+false/.test(hasPermFnBody)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() must explicitly "return false" when getAdminRecord() resolves no matching admin_users row (deny-by-default)`);
  }

  // 2b) Inactive admin must fail. Must appear as a real early-return, not a
  //     no-op / commented-out check.
  if (!/admin\.is_active\s*===\s*false/.test(hasPermFnBody) || !/return\s+false/.test(hasPermFnBody.slice(hasPermFnBody.indexOf('admin.is_active')))) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() must deny when admin.is_active === false`);
  }

  // 2c) Owner ['*'] permission path must remain intact — both the direct
  //     wildcard-permission check and the role==='owner' shortcut are
  //     acceptable; at least the wildcard check must survive since that is
  //     what the seeded owner rows (permissions: ['*']) actually rely on.
  if (!/direct\.includes\(\s*['"]\*['"]\s*\)/.test(hasPermFnBody)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() is missing the owner wildcard permission check (permissions.includes('*')) — this must keep passing for the seeded owner rows`);
  }
  if (!/role\s*===\s*['"]owner['"]/.test(hasPermFnBody)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() is missing the role === 'owner' shortcut`);
  }

  // 2d) Identity must come only from the server-trusted header lookup
  //     (getAdminRecord/getAccessEmail) — never from parsed request body/query.
  if (/context\.request\.json\(|body\.is_admin|body\.role|body\.permissions|body\.role_code/.test(hasPermFnBody)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() must not read any client-supplied body field (is_admin/role/role_code/permissions) — identity must come only from getAdminRecord()`);
  }
  if (!/getAdminRecord\(context\)/.test(hasPermFnBody)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() must resolve identity via getAdminRecord(context)`);
  }
} else {
  failures.push(`${AUDIT_LIB}: could not isolate hasAdminPermission() function body for inspection`);
}

// ---------------------------------------------------------------------------
// 3) getAdminRecord()/getAccessEmail() must not be reachable via a
//    client-controlled fallback (e.g. a body/query email overriding the
//    Cf-Access-Authenticated-User-Email header).
// ---------------------------------------------------------------------------
const getRecordFnStart = auditLibCodeOnly.indexOf('export async function getAdminRecord');
const getRecordFnBody = getRecordFnStart === -1
  ? ''
  : auditLibCodeOnly.slice(getRecordFnStart, auditLibCodeOnly.indexOf('\nexport ', getRecordFnStart + 1));
if (!getRecordFnBody) {
  failures.push(`${AUDIT_LIB}: getAdminRecord() export not found`);
} else if (!/getAccessEmail\(context\)/.test(getRecordFnBody)) {
  failures.push(`${AUDIT_LIB}: getAdminRecord() must resolve the caller's email via getAccessEmail(context) (the Cf-Access-Authenticated-User-Email header), not any other source`);
}
if (/body\.email|query\.get\(['"]email['"]\)|searchParams\.get\(['"]email['"]\)/.test(auditLibCodeOnly)) {
  failures.push(`${AUDIT_LIB}: no function in this file may resolve admin identity from a client-supplied body/query email parameter`);
}

// ---------------------------------------------------------------------------
// 4) requireAdminPermission() must still throw a friendly 403 and must never
//    forward a raw provider/Supabase error message.
// ---------------------------------------------------------------------------
const requireFnStart = auditLibCodeOnly.indexOf('export async function requireAdminPermission');
const requireFnBody = requireFnStart === -1
  ? ''
  : auditLibCodeOnly.slice(requireFnStart, auditLibCodeOnly.indexOf('\nexport ', requireFnStart + 1));
if (!requireFnBody) {
  failures.push(`${AUDIT_LIB}: requireAdminPermission() export not found`);
} else {
  if (!/status\s*=\s*403/.test(requireFnBody)) {
    failures.push(`${AUDIT_LIB}: requireAdminPermission() must reject with a 403 status`);
  }
  if (!/[çğıöşüÇĞİÖŞÜ]/.test(requireFnBody)) {
    failures.push(`${AUDIT_LIB}: requireAdminPermission() rejection message does not look like Turkish copy`);
  }
  if (/error\.message|error\.stack|err\.message|err\.stack/.test(requireFnBody)) {
    failures.push(`${AUDIT_LIB}: requireAdminPermission() must not forward a raw caught error's message/stack`);
  }
}

// ---------------------------------------------------------------------------
// 5) No self-flag / client-controlled admin bypass anywhere in the API tree.
//    Broad regression guard: scans every tracked+untracked functions/api/**
//    file for a client-supplied is_admin/role/permissions field being read
//    and used to grant/skip an authorization check. admin/users.js's
//    legitimate *write-only* use of body.role (to set another row's role
//    column, itself now gated by requireAdminPermission — see §7 below) is
//    allowlisted explicitly rather than matched by a blind regex.
// ---------------------------------------------------------------------------
let trackedFiles = [];
try {
  trackedFiles = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  trackedFiles = [];
}
let untracked = [];
try {
  untracked = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim().split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim());
} catch (_) {
  untracked = [];
}
const allApiFiles = [...new Set([...trackedFiles, ...untracked])].filter((f) => f.startsWith('functions/api/') && f.endsWith('.js'));
const BYPASS_PATTERN = /(body|payload|input)\.(is_admin|isAdmin|admin|role|role_code|permissions)\b/;
const ALLOWLISTED_BYPASS_FILES = new Set([USERS_API]);
for (const file of allApiFiles) {
  if (ALLOWLISTED_BYPASS_FILES.has(file)) continue;
  if (!exists(file)) continue;
  let content = '';
  try { content = stripComments(read(file)); } catch (_) { continue; }
  if (BYPASS_PATTERN.test(content)) {
    failures.push(`Scope/security violation: ${file} reads a client-supplied is_admin/role/role_code/permissions field — no endpoint may trust client-provided admin flags`);
  }
}
// admin/users.js itself: body.role/body.status may only ever be used to
// build the payload written to admin_users, never read back to decide
// whether *this* request is authorized.
const usersApiRoleUses = Array.from(usersApiCodeOnly.matchAll(/body\.role\b/g));
if (usersApiRoleUses.length === 0) {
  failures.push(`${USERS_API}: expected body.role usage (role assignment) not found — file may have been restructured unexpectedly`);
}
if (/if\s*\(\s*body\.is_admin/.test(usersApiCodeOnly) || /if\s*\(\s*body\.role\s*===\s*['"]owner['"]\s*\)\s*(return|await\s+assertAdmin)/.test(usersApiCodeOnly)) {
  failures.push(`${USERS_API}: must never branch its own authorization on a client-supplied is_admin/role value`);
}

// ---------------------------------------------------------------------------
// 6) functions/api/admin/users.js must require a real, RBAC-checked
//    permission (not just assertAdmin()) before any admin_users mutation —
//    this is the fix for "ADMIN_TOKEN alone can manage admin_users without
//    RBAC permission".
// ---------------------------------------------------------------------------
if (!/import\s*\{[^}]*requireAdminPermission[^}]*\}\s*from\s*['"]\.\.\/_lib\/admin-audit\.js['"]/.test(usersApi)) {
  failures.push(`${USERS_API}: must import requireAdminPermission from ../_lib/admin-audit.js`);
}

function extractHandler(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  if (start === -1) return '';
  const nextExport = src.indexOf('\nexport ', start + 1);
  return src.slice(start, nextExport === -1 ? undefined : nextExport);
}

const postHandler = extractHandler(usersApiCodeOnly, 'onRequestPost');
const patchHandler = extractHandler(usersApiCodeOnly, 'onRequestPatch');

for (const [name, handler] of [['onRequestPost', postHandler], ['onRequestPatch', patchHandler]]) {
  if (!handler) {
    failures.push(`${USERS_API}: ${name} handler not found`);
    continue;
  }
  const assertIdx = handler.indexOf('assertAdmin(context)');
  const requireIdx = handler.indexOf('requireAdminPermission(context');
  if (assertIdx === -1) {
    failures.push(`${USERS_API}: ${name} must call assertAdmin(context)`);
  }
  if (requireIdx === -1) {
    failures.push(`${USERS_API}: ${name} must call requireAdminPermission(context, ...) — a shared-token holder must not be able to mutate admin_users without an RBAC-checked permission`);
  } else if (assertIdx !== -1 && requireIdx < assertIdx) {
    failures.push(`${USERS_API}: ${name} must call assertAdmin(context) before requireAdminPermission(context, ...)`);
  }
  // The permission check must run before any admin_users write (insertRow/updateRows).
  const insertIdx = handler.search(/insertRow\(context,\s*['"]admin_users['"]/);
  const updateIdx = handler.search(/updateRows\(context,\s*['"]admin_users['"]/);
  const writeIdx = insertIdx === -1 ? updateIdx : (updateIdx === -1 ? insertIdx : Math.min(insertIdx, updateIdx));
  if (requireIdx !== -1 && writeIdx !== -1 && requireIdx > writeIdx) {
    failures.push(`${USERS_API}: ${name} must call requireAdminPermission(context, ...) before writing to admin_users, not after`);
  }
}

// ---------------------------------------------------------------------------
// 7) Every existing requireAdminPermission() call site must still pair
//    assertAdmin() first — this is the invariant the whole identity model
//    relies on (Cf-Access-Authenticated-User-Email is only meaningful
//    layered behind the shared-secret session gate, never in front of or
//    instead of it).
// ---------------------------------------------------------------------------
const REQUIRE_PERMISSION_CALL_SITES = [
  'functions/api/admin/loyalty/adjust-points.js',
  'functions/api/admin/shipments/[id]/sync.js',
  'functions/api/admin/shipments/[id]/label.js',
  'functions/api/admin/orders/[id]/dhl-shipment.js',
  'functions/api/admin/returns/[id]/dhl-return-shipment.js',
  'functions/api/admin/coupons/issue-customer-coupon.js',
  'functions/api/email/retry-failed.js',
  'functions/api/invoices/qnb-create.js',
  USERS_API
];
for (const file of REQUIRE_PERMISSION_CALL_SITES) {
  if (!exists(file)) continue;
  const content = stripComments(read(file));
  if (!/requireAdminPermission\(/.test(content)) {
    failures.push(`${file}: expected to call requireAdminPermission(...) but it does not (either A1 removed required coverage, or this list is stale)`);
    continue;
  }
  const assertIdx = content.indexOf('assertAdmin(context)');
  const requireIdx = content.indexOf('requireAdminPermission(context');
  if (assertIdx === -1) {
    failures.push(`${file}: calls requireAdminPermission() but is missing assertAdmin(context) — identity/session gate must always run first`);
  } else if (requireIdx !== -1 && requireIdx < assertIdx) {
    failures.push(`${file}: requireAdminPermission(...) must be called after assertAdmin(context), never before`);
  }
}

// ---------------------------------------------------------------------------
// 8) Coverage must not have silently expanded beyond A1.1's declared scope
//    (A1.2 coverage expansion is explicitly out of scope for this batch).
//    A1.2a (2026-07-05, admin GET/read endpoint permission coverage — see
//    COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md), A1.2b
//    (2026-07-05, admin mutation endpoint permission coverage — see
//    COSMOSKIN_A1_2B_ADMIN_MUTATION_COVERAGE_REPORT_20260705.md), and A1.2c
//    (2026-07-05, admin finance/refund/bank-account endpoint permission
//    coverage — see COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_REPORT_20260705.md),
//    all backed by their own validator
//    (scripts/validate-a1-admin-endpoint-coverage.mjs), are now approved,
//    separate batches that legitimately added requireAdminPermission() to the
//    handlers of the files removed from this list below. The two deliberate
//    escape-hatch routes remain fully out of scope and are still covered by
//    this list.
// ---------------------------------------------------------------------------
const A1_2_DEFERRED_FILES = [
  'functions/api/admin/inventory/health.js',
  'functions/api/admin/dashboard.js',
  'functions/api/reviews/[[path]].js'
];
for (const file of A1_2_DEFERRED_FILES) {
  if (!exists(file)) continue;
  const content = read(file);
  if (/requireAdminPermission\(/.test(content)) {
    failures.push(`A1.2 scope violation: ${file} now calls requireAdminPermission(...) — coverage expansion is out of scope for A1.1 and must ship as its own approved batch`);
  }
}

// ---------------------------------------------------------------------------
// 9) Scope guard: A1.1 is RBAC-only. No checkout, payment, returns, storage,
//    loyalty, coupons, customer account UI, or Cloudflare config file may be
//    touched, and no migration/SQL may be added unless explicitly justified.
//    functions/api/admin/returns.js is no longer zero-diff-forbidden as of
//    A1.2a (2026-07-05) — see
//    COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md and its own
//    validator, scripts/validate-a1-admin-endpoint-coverage.mjs.
// ---------------------------------------------------------------------------
// functions/api/iyzico-callback.js is no longer zero-diff-forbidden as of B1
// (2026-07-05, bank transfer approval finalization) — see
// COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_REPORT_20260705.md and its own
// validator (scripts/validate-b1-bank-transfer-finalization.mjs).
// functions/api/_lib/admin.js and assets/admin-runtime.js are no longer
// zero-diff-forbidden as of A1F (2026-07-05, admin RBAC session identity
// bridge + 403 UX fix) — see
// COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_REPORT_20260705.md and its own
// validator (scripts/validate-a1f-admin-rbac-session-identity.mjs).
const forbiddenPaths = [
  'checkout.html',
  'assets/checkout.js',
  'functions/api/create-checkout.js',
  'functions/api/cron/release-expired-inventory.js',
  'functions/api/_lib/loyalty-ledger.js',
  'functions/api/_lib/order-cancellation.js',
  'functions/api/account/orders/[id]/cancel.js',
  'functions/api/_lib/coupons.js',
  // functions/api/returns.js — D1 (2026-07-06) owns return eligibility/correctness fixes.
  'functions/api/_lib/return-attachments.js',
  'functions/api/_lib/supabase.js',
  'functions/api/account/summary.js',
  'functions/api/account/profile.js',
  'functions/api/account/notifications.js',
  // assets/account-dashboard.js — D1 (2026-07-06) owns return eligibility UI mirror only.
  'assets/account-premium.css',
  'wrangler.toml',
  '.env.example',
  '_headers'
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
  if (file === 'functions/api/_lib/coupons.js' && process.env.COSMOSKIN_ALLOW_C1A_COUPON_HARDENING === '1') continue;
  if (diff && !isD3ACheckoutSnapshotChange(file)) failures.push(`A1.1 scope violation: ${file} must not be modified by this batch`);
}

let migrationDiff = [];
try {
  migrationDiff = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationDiff = [];
}
if (migrationChangesExcludingD3A(migrationDiff).length) {
  failures.push(`A1.1 must not add/modify any supabase/migrations/*.sql file (no schema/data change is needed — admin_users already has the required columns and seeded owner rows): ${migrationDiff.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 10) Chain H0/H1/H2 and Batch 1/3/4/UI validators — A1.1 must never regress
//     any prior batch's guarantees.
// ---------------------------------------------------------------------------
const chainedValidators = [
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
  console.error('COSMOSKIN A1 admin RBAC hardening validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN A1 admin RBAC hardening validation passed.');
