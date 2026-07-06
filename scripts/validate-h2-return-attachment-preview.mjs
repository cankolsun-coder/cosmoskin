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


const HELPER = 'functions/api/_lib/return-attachments.js';
const SUMMARY_API = 'functions/api/account/summary.js';
const RETURNS_API = 'functions/api/returns.js';
const ADMIN_RETURNS_API = 'functions/api/admin/returns.js';
const DASHBOARD_JS = 'assets/account-dashboard.js';
const ADMIN_RETURNS_JS = 'assets/admin-returns.js';
const CSS_FILE = 'assets/account-premium.css';
const SUPABASE_LIB = 'functions/api/_lib/supabase.js';

// ---------------------------------------------------------------------------
// 1) Required files exist
// ---------------------------------------------------------------------------
const requiredFiles = [HELPER, SUMMARY_API, RETURNS_API, ADMIN_RETURNS_API, DASHBOARD_JS, ADMIN_RETURNS_JS, CSS_FILE, SUPABASE_LIB];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN H2 return attachment preview validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const helper = read(HELPER);
// Comment-stripped copy for checks that must only match actual executable
// code, not prose in comments that merely *describes* what must not happen.
const helperCodeOnly = helper
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');
const summaryApi = read(SUMMARY_API);
const returnsApi = read(RETURNS_API);
const adminReturnsApi = read(ADMIN_RETURNS_API);
const dashboardJs = read(DASHBOARD_JS);
const adminReturnsJs = read(ADMIN_RETURNS_JS);
const css = read(CSS_FILE);
const supabaseLib = read(SUPABASE_LIB);

// ---------------------------------------------------------------------------
// 2a) H2B root-cause guard: createSignedStorageUrl() must resolve the
//     Supabase-returned relative signedURL ("/object/sign/{bucket}/{path}
//     ?token=...", relative to the STORAGE SERVICE root) against
//     "${SUPABASE_URL}/storage/v1", never the bare project URL — the bug
//     that produced "No API key found in request" on every Görüntüle/İndir
//     click. See functions/api/_lib/supabase.js for the full explanation.
// ---------------------------------------------------------------------------
const signFnMatch = supabaseLib.match(/export async function createSignedStorageUrl[\s\S]*?\n\}/);
if (!signFnMatch) {
  failures.push(`${SUPABASE_LIB}: createSignedStorageUrl() function not found`);
} else {
  const fnBody = signFnMatch[0];
  // Regression guard: the exact pre-H2B buggy return line, which dropped the
  // required "/storage/v1" segment from Supabase's relative signedURL.
  if (/\$\{url\}\$\{signed\.startsWith\(['"]\/['"]\)\s*\?\s*['"]{2}\s*:\s*['"]\/['"]\}\$\{signed\}/.test(fnBody)) {
    failures.push(`${SUPABASE_LIB}: createSignedStorageUrl() still contains the pre-H2B buggy URL construction that drops "/storage/v1" (root cause of "No API key found in request")`);
  }
  // "/storage/v1" must appear both in the outgoing POST request URL AND
  // again in the response-URL-construction logic (the fix) — a single
  // occurrence means only the POST request has it, which is what the bug
  // looked like.
  const storageV1Occurrences = (fnBody.match(/\/storage\/v1/g) || []).length;
  if (storageV1Occurrences < 2) {
    failures.push(`${SUPABASE_LIB}: createSignedStorageUrl() must ensure the final returned URL includes "/storage/v1" even when Supabase's response is a bare "/object/sign/..." relative path (found "/storage/v1" only ${storageV1Occurrences} time(s) — expected at least 2: once in the request, once in the fix)`);
  }
  if (!/startsWith\(['"]\/storage\/v1/.test(fnBody)) {
    failures.push(`${SUPABASE_LIB}: createSignedStorageUrl() must guard against double-prefixing "/storage/v1" when Supabase's response already includes it`);
  }
}

// ---------------------------------------------------------------------------
// 2) Shared helper: single-purpose, never accepts client input, never
//    forwards raw provider errors, never signs an arbitrary path.
// ---------------------------------------------------------------------------
if (!/export\s+async\s+function\s+signReturnAttachments\s*\(/.test(helper)) {
  failures.push(`${HELPER}: signReturnAttachments() export is missing`);
}
const exportedFns = Array.from(helper.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)).map((m) => m[1]);
const unexpectedExports = exportedFns.filter((name) => name !== 'signReturnAttachments');
if (unexpectedExports.length) {
  failures.push(`${HELPER}: only signReturnAttachments should be exported, found extra export(s): ${unexpectedExports.join(', ')}`);
}
if (/context\.request/.test(helper)) {
  failures.push(`${HELPER}: must not read context.request (it must only operate on rows the caller already fetched, never on live request input)`);
}
if (/error\.message|error\.stack|_error\.message|_error\.stack/.test(helperCodeOnly)) {
  failures.push(`${HELPER}: must never forward a caught error's message/stack (raw Supabase/Storage provider text) to its return value`);
}
if (!/preview_error/.test(helper)) {
  failures.push(`${HELPER}: signing-failure path must return a fixed preview_error code, not raw error detail`);
}
if (!/isSafeStoragePath|isSafeAttachmentPath/.test(helper)) {
  failures.push(`${HELPER}: missing a path-shape guard before calling createSignedStorageUrl (defense-in-depth against a malformed/unexpected path)`);
}
if (!/createSignedStorageUrl/.test(helper)) {
  failures.push(`${HELPER}: must delegate actual signing to the existing createSignedStorageUrl() helper (no separate/duplicated Storage-signing implementation)`);
}
if (/apikey|service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(helper)) {
  failures.push(`${HELPER}: must not read/reference the service-role key directly — signing must stay delegated to createSignedStorageUrl()`);
}

// ---------------------------------------------------------------------------
// 3) functions/api/account/summary.js — the actual, confirmed data source
//    for the customer Returns tab — must enrich attachments via the shared
//    helper, sourced only from rows already scoped to the authenticated
//    user's own orders/returns (never from request body/query input).
// ---------------------------------------------------------------------------
if (!/import\s*\{\s*signReturnAttachments\s*\}\s*from\s*['"]\.\.\/_lib\/return-attachments\.js['"]/.test(summaryApi)) {
  failures.push(`${SUMMARY_API}: must import signReturnAttachments from ../_lib/return-attachments.js`);
}
if (!/signReturnAttachments\(/.test(summaryApi)) {
  failures.push(`${SUMMARY_API}: must call signReturnAttachments(...) — the primary H2 fix (customer Returns tab attachment enrichment) is not wired in`);
}
if (/signReturnAttachments\(\s*context\s*,\s*(body\.|req\.query|url\.searchParams)/i.test(summaryApi)) {
  failures.push(`${SUMMARY_API}: signReturnAttachments must not be called with client-supplied body/query input — only server-derived, already-owner-scoped rows`);
}
if (!/return_request_id:\s*returnInFilter/.test(summaryApi)) {
  failures.push(`${SUMMARY_API}: return_request_attachments fetch must still be scoped by return_request_id: returnInFilter (regression guard — ownership scoping must not be removed)`);
}

// ---------------------------------------------------------------------------
// 4) functions/api/returns.js — GET parity fix, and the H1 POST ownership
//    guard must remain fully intact (this batch must not weaken it).
// ---------------------------------------------------------------------------
if (!/import\s*\{\s*signReturnAttachments\s*\}\s*from\s*['"]\.\/_lib\/return-attachments\.js['"]/.test(returnsApi)) {
  failures.push(`${RETURNS_API}: must import signReturnAttachments from ./_lib/return-attachments.js (GET parity)`);
}
if (!/signReturnAttachments\(/.test(returnsApi)) {
  failures.push(`${RETURNS_API}: onRequestGet must call signReturnAttachments(...) for parity with functions/api/account/summary.js`);
}
// H1 regression guards, re-asserted narrowly here (the full check lives in
// validate-h1-return-attachment-storage-rls.mjs, chained below).
if (!/function\s+isOwnedAttachmentPath/.test(returnsApi) || !/function\s+isSafeAttachmentPath/.test(returnsApi)) {
  failures.push(`${RETURNS_API}: H1's isOwnedAttachmentPath/isSafeAttachmentPath ownership guard must remain present`);
}
if (!/rawAttachmentPaths\.some\(\(filePath\)\s*=>\s*!isOwnedAttachmentPath\(filePath,\s*user\.id\)\)/.test(returnsApi)) {
  failures.push(`${RETURNS_API}: onRequestPost's ownership-guard check must remain exactly as strict as H1 left it`);
}
// Must not accept an attachment id/path directly from request input for signing.
if (/signReturnAttachments\(\s*context\s*,\s*(body\.|url\.searchParams)/i.test(returnsApi)) {
  failures.push(`${RETURNS_API}: signReturnAttachments must not be called with client-supplied body/query input`);
}

// ---------------------------------------------------------------------------
// 5) No new endpoint may sign an arbitrary client-supplied file_path/id.
//    Only the two known, already-owner-scoped call sites may import the
//    shared helper.
// ---------------------------------------------------------------------------
const ALLOWED_HELPER_IMPORTERS = new Set([SUMMARY_API, RETURNS_API]);
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
const allJsFiles = [...new Set([...trackedFiles, ...untracked])].filter((f) => f.startsWith('functions/api/') && f.endsWith('.js'));
for (const file of allJsFiles) {
  if (ALLOWED_HELPER_IMPORTERS.has(file)) continue;
  if (!exists(file)) continue;
  let content = '';
  try { content = read(file); } catch (_) { continue; }
  if (/from\s*['"].*_lib\/return-attachments\.js['"]/.test(content)) {
    failures.push(`Scope violation: ${file} imports functions/api/_lib/return-attachments.js but is not one of the H2-approved call sites (${[...ALLOWED_HELPER_IMPORTERS].join(', ')})`);
  }
}

// ---------------------------------------------------------------------------
// 6) Admin attachment view must keep requiring real admin auth, and must
//    not be rewritten — H2 does not touch admin signing/fetch logic.
//    NOTE: the original absolute "must not be modified at all" check (a
//    git-diff-based zero-diff guard) was superseded by A1.2a (2026-07-05),
//    which legitimately adds a read-only requireAdminPermission('returns:read')
//    gate to this file's GET handler only (see
//    COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md and its own
//    validator, scripts/validate-a1-admin-endpoint-coverage.mjs). The two
//    content assertions below (assertAdmin present, withSignedAttachmentUrls
//    present) are what actually protect H2's invariants and remain in force.
// ---------------------------------------------------------------------------
if (!/assertAdmin\(context\)/.test(adminReturnsApi)) {
  failures.push(`${ADMIN_RETURNS_API}: assertAdmin(context) guard must remain present`);
}
if (!/withSignedAttachmentUrls/.test(adminReturnsApi)) {
  failures.push(`${ADMIN_RETURNS_API}: existing withSignedAttachmentUrls() signing must remain present (H2 does not rewrite admin signing logic)`);
}

// ---------------------------------------------------------------------------
// 7) Customer UI — regression guard for the exact bug this batch fixes, plus
//    the "never show raw storage path" rule.
// ---------------------------------------------------------------------------
if (/file\.file_name\s*\|\|\s*file\.file_path\s*\|\|\s*'Ek dosya'/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: old plain-file-name-only attachment rendering (file_name || file_path fallback) is still present — the H2 fix must replace it`);
}
if (/<span>'\s*\+\s*escapeHtml\(file\.file_name/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: attachments must not render as a bare <span> with only the file name (regression of the exact bug H2 fixes)`);
}
if (/file\.file_path/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: must never reference file.file_path (raw storage path) anywhere — customer UI must only use file_name/signed_url/download_url`);
}
if (!/function\s+renderReturnAttachment\s*\(/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: renderReturnAttachment() renderer is missing`);
}
if (!/signed_url/.test(dashboardJs) || !/download_url/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: renderReturnAttachment() must use the API's signed_url/download_url fields`);
}
if (!/Görüntüle/.test(dashboardJs) || !/İndir/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: attachment card must offer both "Görüntüle" and "İndir" actions`);
}
if (!/preview_kind/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: renderReturnAttachment() must branch on preview_kind (image/video/file) to pick thumbnail vs. card`);
}
if (!/cs-return-attachment/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: new attachment card markup (cs-return-attachment*) is missing`);
}

// ---------------------------------------------------------------------------
// 7b) H2B: no fallback to storage_path/raw object URL/public URL; the
//     missing-signed-URL branch must not render active Görüntüle/İndir
//     buttons; a real-signed-URL guard must gate what the renderer treats
//     as usable at all.
// ---------------------------------------------------------------------------
if (/file\.storage_path|file\.storage_bucket/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: must never reference file.storage_path/file.storage_bucket (raw storage location) in customer UI`);
}
if (/object\/public\/|file\.file_url\b/.test(dashboardJs)) {
  failures.push(`${DASHBOARD_JS}: must never use a raw/public Supabase object URL as a fallback for signed_url`);
}
if (!/isRealSignedUrl/.test(dashboardJs) || !dashboardJs.includes('storage\\/v1\\/object\\/sign\\/')) {
  failures.push(`${DASHBOARD_JS}: renderReturnAttachment() must only treat a URL as usable when it matches a real Supabase signed-object URL shape (/storage/v1/object/sign/) — regression guard for the "No API key found in request" root cause`);
}
const renderReturnAttachmentMatch = dashboardJs.match(/function renderReturnAttachment\s*\([\s\S]*?\n  \}/);
if (!renderReturnAttachmentMatch) {
  failures.push(`${DASHBOARD_JS}: could not isolate renderReturnAttachment() body for the missing-signed-URL branch check`);
} else {
  const fnBody = renderReturnAttachmentMatch[0];
  const missingBranchMatch = fnBody.match(/if\s*\(!viewUrl\)\s*\{[\s\S]*?\n\s*\}/);
  if (!missingBranchMatch) {
    failures.push(`${DASHBOARD_JS}: renderReturnAttachment() must have an explicit "if (!viewUrl)" missing-signed-URL branch`);
  } else {
    const missingBranch = missingBranchMatch[0];
    if (/Görüntüle|İndir|cs-mini-btn/.test(missingBranch)) {
      failures.push(`${DASHBOARD_JS}: the missing-signed-URL branch must not render active Görüntüle/İndir buttons`);
    }
    if (!/Dosya şu anda görüntülenemiyor/.test(missingBranch)) {
      failures.push(`${DASHBOARD_JS}: the missing-signed-URL branch must show the friendly "Dosya şu anda görüntülenemiyor." message`);
    }
  }
  if (!/onerror/.test(fnBody)) {
    failures.push(`${DASHBOARD_JS}: the image thumbnail must have an onerror fallback so a broken image never remains the main preview`);
  }
}

// ---------------------------------------------------------------------------
// 8) Admin UI polish must stay additive — file type/date only, no rewrite of
//    the signing/fetch call, admin auth untouched (already covered in #6).
// ---------------------------------------------------------------------------
if (!/withSignedAttachmentUrls|file_preview_url|file\.file_url/.test(adminReturnsJs)) {
  failures.push(`${ADMIN_RETURNS_JS}: existing signed-URL rendering must remain present`);
}

// ---------------------------------------------------------------------------
// 9) CSS must be additive/scoped only — no redesign of unrelated surfaces.
// ---------------------------------------------------------------------------
if (!/H2_RETURN_ATTACHMENT_PREVIEW/.test(css)) {
  failures.push(`${CSS_FILE}: missing H2_RETURN_ATTACHMENT_PREVIEW marker for the new scoped CSS block`);
} else {
  // Scoped to just the H2 block (marker to the next blank line), not to EOF —
  // this file has many unrelated CSS sections both before and after H2's own
  // addition, so a naive "marker to end of file" slice would false-positive
  // on pre-existing, out-of-scope selectors added by earlier/later batches.
  const markerIdx = css.indexOf('H2_RETURN_ATTACHMENT_PREVIEW');
  const blankLineIdx = css.indexOf('\n\n', markerIdx);
  const h2CssBlock = css.slice(markerIdx, blankLineIdx === -1 ? undefined : blankLineIdx);
  for (const forbidden of [/\.site-header/, /\.site-footer/, /\.cs-pdp-/, /\.cs-checkout-/, /\.cs-loyalty-/, /\.cs-tier-/]) {
    if (forbidden.test(h2CssBlock)) {
      failures.push(`${CSS_FILE}: H2 CSS addition touches an out-of-scope selector (${forbidden})`);
    }
  }
}

// ---------------------------------------------------------------------------
// 10) Bucket must stay private — no migration/SQL added or changed by H2.
// ---------------------------------------------------------------------------
let migrationDiff = [];
try {
  migrationDiff = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationDiff = [];
}
if (migrationChangesExcludingD3A(migrationDiff).length) {
  failures.push(`H2 must not add/modify any supabase/migrations/*.sql file (migration-free batch): ${migrationDiff.join(', ')}`);
}
if (/public\s*=\s*true/i.test(helper) || /public\s*=\s*true/i.test(summaryApi) || /public\s*=\s*true/i.test(returnsApi)) {
  failures.push('H2 must not flip any bucket to public');
}

// ---------------------------------------------------------------------------
// 11) Scope guard: H2 must not touch checkout, payment RPCs, H0/H0b/H0c
//     migrations, H1 storage RLS migration, loyalty ledger, order
//     cancellation, coupons, RBAC, or unrelated admin flows.
// ---------------------------------------------------------------------------
// functions/api/_lib/admin-audit.js is no longer zero-diff-forbidden as of A1.1
// (2026-07-04, RBAC deny-by-default hardening) — see
// COSMOSKIN_A1_ADMIN_RBAC_HARDENING_REPORT_20260704.md and its own validator
// (scripts/validate-a1-admin-rbac-hardening.mjs).
// functions/api/_lib/admin.js is no longer zero-diff-forbidden as of A1F
// (2026-07-05, admin RBAC session identity bridge) — see
// COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_REPORT_20260705.md and its own
// validator (scripts/validate-a1f-admin-rbac-session-identity.mjs).
// functions/api/admin/returns.js and functions/api/admin/orders.js are no
// longer zero-diff-forbidden as of A1.2a (2026-07-05, admin GET/read endpoint
// permission coverage) — see COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md
// and its own validator (scripts/validate-a1-admin-endpoint-coverage.mjs),
// which asserts only their GET handlers gained a permission gate.
// functions/api/admin/orders/[id]/status.js is no longer zero-diff-forbidden
// as of A1.2b (2026-07-05, admin mutation endpoint permission coverage) — see
// COSMOSKIN_A1_2B_ADMIN_MUTATION_COVERAGE_REPORT_20260705.md and the same
// validator, which asserts its status-transition/inventory/loyalty business
// logic is unchanged beyond the added permission check.
// functions/api/admin/refunds.js is no longer zero-diff-forbidden as of A1.2c
// (2026-07-05, admin finance/refund/bank-account endpoint permission coverage)
// — see COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_REPORT_20260705.md and the same
// validator, which asserts its refund creation/completion/loyalty-reversal
// business logic is unchanged beyond the added permission check.
// functions/api/iyzico-callback.js is no longer zero-diff-forbidden as of B1
// (2026-07-05, bank transfer approval finalization) — see
// COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_REPORT_20260705.md and its own
// validator (scripts/validate-b1-bank-transfer-finalization.mjs).
const forbiddenPaths = [
  'checkout.html',
  'assets/checkout.js',
  'functions/api/create-checkout.js',
  'functions/api/cron/release-expired-inventory.js',
  'functions/api/_lib/loyalty-ledger.js',
  'functions/api/_lib/order-cancellation.js',
  'functions/api/account/orders/[id]/cancel.js',
  'functions/api/_lib/coupons.js',
  'functions/api/admin/loyalty/adjust-points.js',
  'supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql',
  'supabase/migrations/20260704_h0b_release_expired_inventory_patch.sql',
  'supabase/migrations/20260704_h0c_release_expired_pending_status_patch.sql',
  'supabase/migrations/20260704_h1_return_attachment_storage_rls.sql'
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
  if (diff && !isD3ACheckoutSnapshotChange(file)) failures.push(`H2 scope violation: ${file} must not be modified by this batch`);
}

// ---------------------------------------------------------------------------
// 12) Chain H1 (which itself chains H0 and Batch 1/3/4/UI) — H2 must never
//     regress any prior batch's guarantees.
// ---------------------------------------------------------------------------
const chainedValidators = ['scripts/validate-h1-return-attachment-storage-rls.mjs'];
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
  console.error('COSMOSKIN H2 return attachment preview validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN H2 return attachment preview validation passed.');
