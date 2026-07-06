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


const ADMIN_LIB = 'functions/api/_lib/admin.js';
const ACCESS_JWT_LIB = 'functions/api/_lib/cloudflare-access-jwt.js';
const AUDIT_LIB = 'functions/api/_lib/admin-audit.js';
const RUNTIME = 'assets/admin-runtime.js';
const INVENTORY = 'functions/api/admin/inventory.js';
const DASHBOARD = 'functions/api/admin/dashboard.js';
const SESSION = 'functions/api/admin/session.js';

const stripComments = (src) => src.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

function extractFn(src, name) {
  const start = src.indexOf(`export async function ${name}`) !== -1
    ? src.indexOf(`export async function ${name}`)
    : src.indexOf(`export function ${name}`);
  if (start === -1) return '';
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

const requiredFiles = [ADMIN_LIB, ACCESS_JWT_LIB, AUDIT_LIB, RUNTIME, INVENTORY, DASHBOARD, SESSION];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN A1F admin RBAC session identity validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const adminLib = read(ADMIN_LIB);
const adminLibCode = stripComments(adminLib);
const accessJwtLib = read(ACCESS_JWT_LIB);
const accessJwtLibCode = stripComments(accessJwtLib);
const auditLib = read(AUDIT_LIB);
const auditLibCode = stripComments(auditLib);
const runtime = read(RUNTIME);
const inventory = read(INVENTORY);
const dashboard = read(DASHBOARD);

// ---------------------------------------------------------------------------
// 1) admin-runtime.js: 401 clears session; 403 does not.
// ---------------------------------------------------------------------------
if (/response\.status\s*===\s*401\s*\|\|\s*response\.status\s*===\s*403/.test(runtime)) {
  failures.push(`${RUNTIME}: must not treat 401 and 403 identically — 403 must not clear session or show token login screen`);
}
if (!/response\.status\s*===\s*401/.test(runtime) || !/clearSession\(SESSION_END_MESSAGE\)/.test(runtime)) {
  failures.push(`${RUNTIME}: must clear session on 401 invalid/expired admin session`);
}
if (!/response\.status\s*===\s*403/.test(runtime) || !/showPermissionError\(/.test(runtime)) {
  failures.push(`${RUNTIME}: must show a permission error on 403 without clearing session`);
}
if (/response\.status\s*===\s*403[\s\S]{0,220}showLoginPanel\(/.test(runtime)) {
  failures.push(`${RUNTIME}: must not call showLoginPanel() on 403 — permission denial is not a token/session failure`);
}
if (!/Bu işlem için yetkiniz bulunmuyor\./.test(runtime)) {
  failures.push(`${RUNTIME}: must surface the Turkish permission-denied copy for 403 responses`);
}

if (!/export async function resolveCloudflareAccessEmailFromJwt/.test(accessJwtLib)) {
  failures.push(`${ACCESS_JWT_LIB}: must export resolveCloudflareAccessEmailFromJwt(context) for verified JWT email fallback`);
}
if (!/Cf-Access-Jwt-Assertion/.test(accessJwtLibCode)) {
  failures.push(`${ACCESS_JWT_LIB}: must read Cf-Access-Jwt-Assertion server-side`);
}
const jwtVerifyIdx = accessJwtLibCode.indexOf('crypto.subtle.verify(');
const jwtEmailIdx = accessJwtLibCode.indexOf('payload.email');
if (jwtVerifyIdx === -1) {
  failures.push(`${ACCESS_JWT_LIB}: JWT email must be extracted only after crypto.subtle.verify() signature verification`);
} else if (jwtEmailIdx !== -1 && jwtEmailIdx < jwtVerifyIdx) {
  failures.push(`${ACCESS_JWT_LIB}: must not read JWT payload email before crypto.subtle.verify()`);
}
if (!/accessTeamDomain\(/.test(accessJwtLibCode) || !/CF_ACCESS_TEAM_DOMAIN|CLOUDFLARE_ACCESS_TEAM_DOMAIN/.test(accessJwtLib)) {
  failures.push(`${ACCESS_JWT_LIB}: must read CF_ACCESS_TEAM_DOMAIN / CLOUDFLARE_ACCESS_TEAM_DOMAIN and fail closed when missing`);
}
if (!/accessAudience\(/.test(accessJwtLibCode) || !/CF_ACCESS_AUD|CLOUDFLARE_ACCESS_AUD/.test(accessJwtLib)) {
  failures.push(`${ACCESS_JWT_LIB}: must verify JWT audience when CF_ACCESS_AUD / CLOUDFLARE_ACCESS_AUD is configured`);
}
if (/body\.email|searchParams\.get\(['"]email['"]\)|x-admin-email/i.test(accessJwtLibCode)) {
  failures.push(`${ACCESS_JWT_LIB}: must not trust client-supplied email from body/query/custom headers`);
}

// ---------------------------------------------------------------------------
// 2b) Signed admin session must include verified email protected by HMAC.
// ---------------------------------------------------------------------------
const issueFn = extractFn(adminLib, 'issueAdminSession');
if (!issueFn) {
  failures.push(`${ADMIN_LIB}: issueAdminSession() export not found`);
} else {
  if (!/resolveCloudflareAccessEmail\(context\)/.test(issueFn)) {
    failures.push(`${ADMIN_LIB}: issueAdminSession() must resolve Cloudflare Access identity via resolveCloudflareAccessEmail(context)`);
  }
  if (!/Cf-Access-Jwt-Assertion|resolveCloudflareAccessEmailFromJwt\(/.test(adminLibCode)) {
    failures.push(`${ADMIN_LIB}: admin identity must support Cf-Access-Jwt-Assertion fallback, not only Cf-Access-Authenticated-User-Email`);
  }
  if (!/Cloudflare Access kimliği doğrulanamadı\. \/api\/admin\/\* route kapsamını kontrol edin\./.test(issueFn)) {
    failures.push(`${ADMIN_LIB}: issueAdminSession() must return the documented 403 message when Cloudflare Access email is missing`);
  }
  if (!/resolveActiveAdminByEmail\(/.test(issueFn)) {
    failures.push(`${ADMIN_LIB}: issueAdminSession() must verify the Access email against admin_users before issuing a session`);
  }
  if (!/encodeSessionEmail\(/.test(issueFn) || !/emailB64/.test(issueFn)) {
    failures.push(`${ADMIN_LIB}: issueAdminSession() must embed the verified admin email inside the signed session token`);
  }
  if (!/hmac\(sessionSecret\(context\),\s*base\)/.test(issueFn) || !/`\$\{base\}\.\$\{signature\}`/.test(issueFn)) {
    failures.push(`${ADMIN_LIB}: issueAdminSession() must HMAC-sign the session base string that includes the email segment`);
  }
  if (/body\.email|searchParams\.get\(['"]email['"]\)|x-admin-email/i.test(issueFn)) {
    failures.push(`${ADMIN_LIB}: issueAdminSession() must not trust client-supplied email from body/query/custom headers`);
  }
}

if (!/export async function getVerifiedSessionEmail/.test(adminLib)) {
  failures.push(`${ADMIN_LIB}: must export getVerifiedSessionEmail(context) for RBAC identity fallback`);
}
if (!/decodeSessionEmail\(/.test(adminLibCode) || !/verifySignedSessionPayload\(/.test(adminLibCode)) {
  failures.push(`${ADMIN_LIB}: signed session verification must decode and validate the embedded email segment`);
}

// ---------------------------------------------------------------------------
// 3) getAdminRecord() identity resolution: Access header first, signed session second.
// ---------------------------------------------------------------------------
const getRecordFn = extractFn(auditLib, 'getAdminRecord');
if (!getRecordFn) {
  failures.push(`${AUDIT_LIB}: getAdminRecord() export not found`);
} else {
  if (!/getAccessEmail\(context\)/.test(getRecordFn)) {
    failures.push(`${AUDIT_LIB}: getAdminRecord() must still resolve Cloudflare Access email via getAccessEmail(context) first`);
  }
  if (!/getVerifiedSessionEmail\(context\)/.test(getRecordFn)) {
    failures.push(`${AUDIT_LIB}: getAdminRecord() must fall back to getVerifiedSessionEmail(context) when Access identity is absent`);
  }
  if (!/resolveCloudflareAccessEmailFromJwt\(context\)/.test(getRecordFn)) {
    failures.push(`${AUDIT_LIB}: getAdminRecord() must fall back to verified Cf-Access-Jwt-Assertion email before signed session email`);
  }
  const accessIdx = getRecordFn.indexOf('getAccessEmail(context)');
  const jwtIdx = getRecordFn.indexOf('resolveCloudflareAccessEmailFromJwt(context)');
  const sessionIdx = getRecordFn.indexOf('getVerifiedSessionEmail(context)');
  if (accessIdx !== -1 && jwtIdx !== -1 && jwtIdx < accessIdx) {
    failures.push(`${AUDIT_LIB}: resolveCloudflareAccessEmailFromJwt() must occur only after getAccessEmail(context)`);
  }
  if (jwtIdx !== -1 && sessionIdx !== -1 && sessionIdx < jwtIdx) {
    failures.push(`${AUDIT_LIB}: getVerifiedSessionEmail() fallback must occur only after resolveCloudflareAccessEmailFromJwt()`);
  }
  if (accessIdx !== -1 && sessionIdx !== -1 && sessionIdx < accessIdx) {
    failures.push(`${AUDIT_LIB}: getVerifiedSessionEmail() fallback must occur only after checking getAccessEmail(context)`);
  }
  if (/body\.email|searchParams\.get\(['"]email['"]\)|localStorage|x-admin-email/i.test(getRecordFn)) {
    failures.push(`${AUDIT_LIB}: getAdminRecord() must not trust email from request body/query/localStorage/arbitrary headers`);
  }
}

const hasPermFn = extractFn(auditLib, 'hasAdminPermission');
if (hasPermFn) {
  if (!/if\s*\(\s*!admin\s*\)\s*return\s+false/.test(hasPermFn)) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() must remain deny-by-default when no admin row resolves`);
  }
  if (!/direct\.includes\(\s*['"]\*['"]\s*\)/.test(hasPermFn)) {
    failures.push(`${AUDIT_LIB}: owner permissions ['*'] path must remain intact`);
  }
  if (!/admin\.is_active\s*===\s*false/.test(hasPermFn)) {
    failures.push(`${AUDIT_LIB}: inactive admin must still be denied`);
  }
}

// ---------------------------------------------------------------------------
// 4) assertAdmin unchanged: still requires valid token/session.
// ---------------------------------------------------------------------------
const assertFn = extractFn(adminLib, 'assertAdmin');
if (!assertFn || !/verifySignedSession\(/.test(assertFn)) {
  failures.push(`${ADMIN_LIB}: assertAdmin(context) must still validate the signed admin session/token`);
}

// ---------------------------------------------------------------------------
// 5) Endpoint coverage must remain intact.
// ---------------------------------------------------------------------------
if (!/requireAdminPermission\(context,\s*['"]inventory:read['"]\)/.test(inventory)) {
  failures.push(`${INVENTORY}: must still require inventory:read via requireAdminPermission()`);
}
if (/requireAdminPermission\(/.test(dashboard)) {
  failures.push(`${DASHBOARD}: dashboard escape hatch must remain assertAdmin-only (no requireAdminPermission)`);
}
if (!/assertAdmin\(context\)/.test(dashboard)) {
  failures.push(`${DASHBOARD}: dashboard must still call assertAdmin(context)`);
}

// ---------------------------------------------------------------------------
// 6) Scope guard: no migrations, no unrelated areas.
// ---------------------------------------------------------------------------
let migrationStatus = [];
try {
  migrationStatus = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatus = [];
}
if (migrationChangesExcludingD3A(migrationStatus).length) {
  failures.push(`A1F scope violation: supabase/migrations was modified — A1F must not create migrations or run SQL: ${migrationStatus.join(', ')}`);
}

const a1fForbidden = [
  'checkout.html',
  'functions/api/create-checkout.js',
  'functions/api/iyzico-callback.js',
  'functions/api/_lib/commerce-finalization.js',
  // functions/api/returns.js — D1 (2026-07-06) owns return eligibility/correctness fixes.
  'functions/api/_lib/coupons.js',
  'functions/api/_lib/loyalty-ledger.js'
];
function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}
for (const file of a1fForbidden) {
  if (!exists(file)) continue;
  if (file === 'functions/api/_lib/coupons.js' && process.env.COSMOSKIN_ALLOW_C1A_COUPON_HARDENING === '1') continue;
  if (isD3ACheckoutSnapshotChange(file)) { /* D3A checkout snapshot */ } else if (gitDiffFile(file)) failures.push(`A1F scope violation: ${file} must not be modified in this batch`);
}

// ---------------------------------------------------------------------------
// 7) Chain prior validators.
// ---------------------------------------------------------------------------
const chainedValidators = [
  'scripts/validate-a1-admin-rbac-hardening.mjs',
  'scripts/validate-a1-admin-endpoint-coverage.mjs',
  'scripts/validate-b2-bank-transfer-rejection-finalization.mjs',
  'scripts/validate-b1-bank-transfer-finalization.mjs',
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
  console.error('COSMOSKIN A1F admin RBAC session identity validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN A1F/A1F2 admin RBAC session identity validation passed.');
