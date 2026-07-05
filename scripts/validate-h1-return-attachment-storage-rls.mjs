import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const MIGRATION = 'supabase/migrations/20260704_h1_return_attachment_storage_rls.sql';
const RETURNS_API = 'functions/api/returns.js';

// ---------------------------------------------------------------------------
// 1) Required files exist
// ---------------------------------------------------------------------------
const requiredFiles = [MIGRATION, RETURNS_API];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}

if (!exists(MIGRATION) || !exists(RETURNS_API)) {
  console.error('COSMOSKIN H1 return attachment storage RLS validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const migration = read(MIGRATION);
const returnsApi = read(RETURNS_API);

// SQL line-comment-stripped copy, used for every regex that must only match
// actual executable SQL (not prose in `--` comments describing intent).
const codeOnly = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const POLICY_NAMES = [
  'Customers can upload own return attachments',
  'Customers can read own return attachments',
  'Customers can delete own return attachments'
];

// ---------------------------------------------------------------------------
// 2) The migration must DROP + recreate exactly the 3 named policies, and
//    must not still contain the old, unscoped auth.uid() IS NOT NULL-only
//    condition (the exact bug this migration exists to fix).
// ---------------------------------------------------------------------------
for (const name of POLICY_NAMES) {
  const dropRe = new RegExp(`DROP POLICY IF EXISTS\\s+"${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"\\s+ON storage\\.objects`, 'i');
  const createRe = new RegExp(`CREATE POLICY\\s+"${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"[\\s\\S]{0,40}ON storage\\.objects`, 'i');
  if (!dropRe.test(codeOnly)) failures.push(`H1 migration must DROP POLICY IF EXISTS "${name}" ON storage.objects`);
  if (!createRe.test(codeOnly)) failures.push(`H1 migration must CREATE POLICY "${name}" ON storage.objects`);
}

// Extract each CREATE POLICY block (from CREATE POLICY "<name>" up to the closing `);`)
// so ownership predicates can be checked per-command, not just anywhere in the file.
function extractPolicyBlock(name) {
  const re = new RegExp(`CREATE POLICY\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?\\);`, 'i');
  return codeOnly.match(re)?.[0] || '';
}

const uploadBlock = extractPolicyBlock('Customers can upload own return attachments');
const readBlock = extractPolicyBlock('Customers can read own return attachments');
const deleteBlock = extractPolicyBlock('Customers can delete own return attachments');

const OWNERSHIP_PREDICATE = /\(storage\.foldername\(name\)\)\[2\]\s*=\s*auth\.uid\(\)::text/i;
const BUCKET_PREDICATE = /bucket_id\s*=\s*'return-attachments'/i;

for (const [label, block] of [
  ['upload (INSERT)', uploadBlock],
  ['read (SELECT)', readBlock],
  ['delete (DELETE)', deleteBlock]
]) {
  if (!block) {
    failures.push(`H1 migration: could not locate the ${label} policy body to inspect its condition`);
    continue;
  }
  if (!BUCKET_PREDICATE.test(block)) failures.push(`H1 migration: ${label} policy is missing the bucket_id = 'return-attachments' predicate`);
  if (!OWNERSHIP_PREDICATE.test(block)) {
    failures.push(`H1 migration: ${label} policy is missing the ownership predicate (storage.foldername(name))[2] = auth.uid()::text — this is the exact gap H1 must close`);
  }
  // Regression guard: must not regress to the old bug (auth.uid() IS NOT NULL as the
  // *only* gate, with no ownership/foldername predicate alongside it).
  if (/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i.test(block) && !OWNERSHIP_PREDICATE.test(block)) {
    failures.push(`H1 migration: ${label} policy still checks only auth.uid() IS NOT NULL with no ownership predicate (unfixed)`);
  }
}

// ---------------------------------------------------------------------------
// 3) Bucket must remain private — no public flip, no storage.buckets touched.
// ---------------------------------------------------------------------------
if (/UPDATE\s+storage\.buckets/i.test(codeOnly)) failures.push('H1 migration must not modify storage.buckets (bucket config, including public/private, must stay untouched)');
if (/INSERT\s+INTO\s+storage\.buckets/i.test(codeOnly)) failures.push('H1 migration must not INSERT INTO storage.buckets (bucket already exists live, out of scope)');
if (/public\s*=\s*true/i.test(codeOnly) && /return-attachments/i.test(codeOnly)) {
  failures.push('H1 migration must not make return-attachments (or any bucket) public');
}

// ---------------------------------------------------------------------------
// 4) Unrelated buckets / tables must not be touched.
// ---------------------------------------------------------------------------
if (/review-images/i.test(codeOnly)) failures.push('H1 migration must not reference/modify the review-images bucket (unrelated, out of scope)');
if (/\bALTER\s+TABLE\b/i.test(codeOnly)) failures.push('H1 migration must not contain ALTER TABLE (return_requests/return_request_attachments schemas must not change)');
if (/CREATE OR REPLACE FUNCTION/i.test(codeOnly)) failures.push('H1 migration must not define/replace any function (storage-policy-only batch)');

// Only storage.objects may be targeted by DROP/CREATE POLICY in this file.
const policyTargets = Array.from(codeOnly.matchAll(/(?:DROP POLICY IF EXISTS\s+"[^"]+"|CREATE POLICY\s+"[^"]+")\s+ON\s+([a-zA-Z0-9_.]+)/gi)).map((m) => m[1]);
const nonStorageObjectsTargets = policyTargets.filter((t) => t.toLowerCase() !== 'storage.objects');
if (nonStorageObjectsTargets.length) failures.push(`H1 migration must only create/drop policies on storage.objects, found: ${[...new Set(nonStorageObjectsTargets)].join(', ')}`);

// Only the 3 named return-attachments policies may be dropped/created — no other
// policy name should appear (guards against accidentally touching another bucket's
// or table's policy under a similar-looking name).
const allPolicyNamesInFile = Array.from(codeOnly.matchAll(/(?:DROP POLICY IF EXISTS|CREATE POLICY)\s+"([^"]+)"/gi)).map((m) => m[1]);
const unexpectedPolicyNames = [...new Set(allPolicyNamesInFile)].filter((n) => !POLICY_NAMES.includes(n));
if (unexpectedPolicyNames.length) failures.push(`H1 migration references unexpected policy name(s) outside the 3 approved return-attachments policies: ${unexpectedPolicyNames.join(', ')}`);

// ---------------------------------------------------------------------------
// 5) No destructive SQL, no file deletion.
// ---------------------------------------------------------------------------
if (/\bDROP\s+TABLE\b/i.test(codeOnly)) failures.push('H1 migration must not contain DROP TABLE');
if (/\bTRUNCATE\b/i.test(codeOnly)) failures.push('H1 migration must not contain TRUNCATE');
if (/\bDELETE\s+FROM\b/i.test(codeOnly)) failures.push('H1 migration must not contain DELETE FROM (no storage.objects rows/files may be deleted by this migration)');
if (/\bDROP\s+SCHEMA\b/i.test(codeOnly)) failures.push('H1 migration must not contain DROP SCHEMA');
if (/\bDROP\s+BUCKET\b/i.test(codeOnly)) failures.push('H1 migration must not drop any bucket');

// ---------------------------------------------------------------------------
// 6) functions/api/returns.js must guard client-supplied file_path against
//    ownership, path traversal, and malformed paths — and must not expose
//    raw Supabase/storage errors.
// ---------------------------------------------------------------------------
if (!/function\s+isOwnedAttachmentPath/.test(returnsApi)) {
  failures.push('functions/api/returns.js: isOwnedAttachmentPath ownership guard helper is missing');
}
if (!/customer\/\$\{userId\}\//.test(returnsApi)) {
  failures.push("functions/api/returns.js: ownership guard must require paths to start with 'customer/{auth.uid()}/'");
}
if (!/\.\.\s*\)/.test(returnsApi) && !/includes\('\.\.'\)/.test(returnsApi)) {
  failures.push('functions/api/returns.js: path-traversal guard (rejecting ".." sequences) is missing');
}
if (!/rawAttachmentPaths/.test(returnsApi) || !/isOwnedAttachmentPath\(filePath,\s*user\.id\)/.test(returnsApi)) {
  failures.push('functions/api/returns.js: onRequestPost must verify every client-supplied attachment file_path against the authenticated user before persisting it');
}
// Must reject the whole request (not silently drop) on ownership failure, with a
// friendly Turkish error and no raw provider error text. Extracted by index/slice
// rather than brace-counting regex, since the rejection body itself contains
// nested object-literal braces that would confuse a naive lazy-brace regex.
const guardConditionIdx = returnsApi.indexOf('rawAttachmentPaths.some(');
const guardBlock = guardConditionIdx === -1 ? '' : returnsApi.slice(guardConditionIdx, guardConditionIdx + 400);
if (!guardConditionIdx || guardConditionIdx === -1) {
  failures.push('functions/api/returns.js: could not locate the ownership-guard rejection block (rawAttachmentPaths.some(...) => json({...}))');
} else {
  if (!/return json\(\{\s*ok:false/.test(guardBlock)) failures.push('functions/api/returns.js: ownership guard must return {ok:false,...} on rejection');
  if (!/status:\s*40[013]/.test(guardBlock)) failures.push('functions/api/returns.js: ownership guard must reject with an appropriate 4xx status');
  if (/error\.message/.test(guardBlock) || /error\.stack/.test(guardBlock)) {
    failures.push('functions/api/returns.js: ownership guard rejection must not expose raw error.message/error.stack');
  }
  if (!/[çğıöşüÇĞİÖŞÜ]/.test(guardBlock)) failures.push('functions/api/returns.js: ownership guard rejection message does not look like Turkish copy');
}
// The guard must not call out to Supabase/Storage at all (pure string/path check),
// so it cannot leak a raw provider error by construction.
const guardHelperMatch = returnsApi.match(/function isOwnedAttachmentPath[\s\S]*?\n\}/);
const safePathHelperMatch = returnsApi.match(/function isSafeAttachmentPath[\s\S]*?\n\}/);
if (guardHelperMatch && /await|fetch\(|createSignedStorageUrl|storage\.from/.test(guardHelperMatch[0])) {
  failures.push('functions/api/returns.js: isOwnedAttachmentPath must be a pure/local check, not a live Storage/Supabase call (avoids leaking raw provider errors)');
}
if (!safePathHelperMatch) {
  failures.push('functions/api/returns.js: isSafeAttachmentPath (path traversal / malformed path guard) is missing');
} else if (!/\.\.|\\\\|\\0/.test(safePathHelperMatch[0])) {
  failures.push('functions/api/returns.js: isSafeAttachmentPath must reject ".." / backslash / null-byte sequences');
}

// ---------------------------------------------------------------------------
// 7) Existing valid-upload behavior must not break: the original insertRows
//    call for return_request_attachments must remain present and awaited,
//    unchanged in shape (same guard already enforced by
//    validate-return-attachment-persistence.mjs, re-asserted narrowly here).
// ---------------------------------------------------------------------------
if (!returnsApi.includes("await insertRows(context,'return_request_attachments'")) {
  failures.push('functions/api/returns.js: return_request_attachments insert must remain explicit/awaited (existing valid uploads must keep working)');
}
if (/return_request_attachments'[^;]+catch\(\(\)=>null\)/s.test(returnsApi)) {
  failures.push('functions/api/returns.js: return_request_attachments insert failure must not be silently swallowed');
}

// ---------------------------------------------------------------------------
// 8) Scope guard: H1 must not touch checkout, payment RPCs, H0/H0b/H0c
//    migrations, loyalty ledger, order cancellation, coupons, account UI
//    design files, admin RBAC default, or any other bucket's policy file.
// ---------------------------------------------------------------------------
// assets/account-premium.css is no longer zero-diff-forbidden as of H2
// (2026-07-04), which added a minimal, scoped, additive CSS block (marker:
// H2_RETURN_ATTACHMENT_PREVIEW) for customer return-attachment preview/
// download cards — see COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_REPORT_20260704.md.
// H2's own validator (scripts/validate-h2-return-attachment-preview.mjs)
// asserts that addition stays scoped; this file has no H1-specific CSS
// behavior tied to account-premium.css, so no replacement assertion is
// needed here.
// functions/api/_lib/admin-audit.js is no longer zero-diff-forbidden as of A1.1
// (2026-07-04, RBAC deny-by-default hardening) — see
// COSMOSKIN_A1_ADMIN_RBAC_HARDENING_REPORT_20260704.md and its own validator
// (scripts/validate-a1-admin-rbac-hardening.mjs).
// functions/api/_lib/admin.js is no longer zero-diff-forbidden as of A1F
// (2026-07-05, admin RBAC session identity bridge) — see
// COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_REPORT_20260705.md and its own
// validator (scripts/validate-a1f-admin-rbac-session-identity.mjs).
// functions/api/admin/returns.js is no longer zero-diff-forbidden as of A1.2a
// (2026-07-05, admin GET/read endpoint permission coverage) — see
// COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md and its own validator
// (scripts/validate-a1-admin-endpoint-coverage.mjs), which asserts only the
// GET handler gained a permission gate and the PATCH/storage-signing logic
// this H1 validator cares about is unchanged.
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
  'supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql',
  'supabase/migrations/20260704_h0b_release_expired_inventory_patch.sql',
  'supabase/migrations/20260704_h0c_release_expired_pending_status_patch.sql'
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
  if (diff) failures.push(`H1 scope violation: ${file} must not be modified by this batch`);
}

// Unrelated storage buckets: no other *.sql migration (besides the H1 file itself)
// should be modified with new storage.objects/storage.buckets statements as part
// of this diff.
let modifiedFiles = [];
try {
  modifiedFiles = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  modifiedFiles = [];
}
let untrackedFiles = [];
try {
  untrackedFiles = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim().split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim());
} catch (_) {
  untrackedFiles = [];
}
const otherMigrationsTouched = [...modifiedFiles, ...untrackedFiles].filter((f) => f.startsWith('supabase/migrations/') && f !== MIGRATION);
for (const file of otherMigrationsTouched) {
  if (!exists(file)) continue;
  const content = read(file);
  if (/storage\.objects|storage\.buckets/i.test(content) && file !== MIGRATION) {
    failures.push(`H1 scope violation: unrelated migration ${file} touches storage.objects/storage.buckets — only ${MIGRATION} may do so in this batch`);
  }
}

// ---------------------------------------------------------------------------
// 9) Chain H0 and Batch 1/3/4/UI validators.
// ---------------------------------------------------------------------------
const chainedValidators = [
  'scripts/validate-h0-live-payment-rpc-hotfix.mjs',
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
  console.error('COSMOSKIN H1 return attachment storage RLS validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN H1 return attachment storage RLS validation passed.');
