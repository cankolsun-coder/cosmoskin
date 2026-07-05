import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { EMAIL_TYPES, safeEmailType } from '../functions/api/_lib/email-events.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const EMAIL_EVENTS_LIB = 'functions/api/_lib/email-events.js';
const ORDER_EMAIL_LIB = 'functions/api/_lib/order-email.js';
const COMMERCE_LIB = 'functions/api/_lib/commerce-finalization.js';
const ADMIN_ORDERS = 'functions/api/admin/orders.js';
const ADMIN_LIB = 'functions/api/_lib/admin.js';
const ACCESS_JWT_LIB = 'functions/api/_lib/cloudflare-access-jwt.js';
const AUDIT_LIB = 'functions/api/_lib/admin-audit.js';
const RUNTIME = 'assets/admin-runtime.js';

function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 1) Required files exist
// ---------------------------------------------------------------------------
const requiredFiles = [EMAIL_EVENTS_LIB, ORDER_EMAIL_LIB, COMMERCE_LIB, ADMIN_ORDERS];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN B2E email events integrity validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const emailEventsLib = read(EMAIL_EVENTS_LIB);

// ---------------------------------------------------------------------------
// 2) EMAIL_TYPES must include bank-transfer audit types
// ---------------------------------------------------------------------------
if (!EMAIL_TYPES.has('bank_transfer_reminder')) {
  failures.push(`${EMAIL_EVENTS_LIB}: EMAIL_TYPES must include bank_transfer_reminder`);
}
if (!EMAIL_TYPES.has('bank_transfer_not_received_cancelled')) {
  failures.push(`${EMAIL_EVENTS_LIB}: EMAIL_TYPES must include bank_transfer_not_received_cancelled`);
}

// ---------------------------------------------------------------------------
// 3) safeEmailType() must not silently map unknown types to order_created
// ---------------------------------------------------------------------------
if (/fallback\s*=\s*['"]order_created['"]/.test(emailEventsLib)) {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType() must not default fallback to order_created`);
}
if (safeEmailType('bank_transfer_reminder') !== 'bank_transfer_reminder') {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType('bank_transfer_reminder') must return bank_transfer_reminder, got ${safeEmailType('bank_transfer_reminder')}`);
}
if (safeEmailType('bank_transfer_not_received_cancelled') !== 'bank_transfer_not_received_cancelled') {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType('bank_transfer_not_received_cancelled') must return bank_transfer_not_received_cancelled, got ${safeEmailType('bank_transfer_not_received_cancelled')}`);
}
if (safeEmailType('order_created') !== 'order_created') {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType('order_created') must still return order_created`);
}
if (safeEmailType('payment_confirmed_manual') !== 'payment_confirmed_manual') {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType('payment_confirmed_manual') must still return payment_confirmed_manual`);
}
const unknownSample = 'cosmoskin_unsupported_email_type_b2e_guard';
if (safeEmailType(unknownSample) === 'order_created') {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType() must not map unknown types to order_created`);
}
if (safeEmailType(unknownSample) !== null) {
  failures.push(`${EMAIL_EVENTS_LIB}: safeEmailType() must return null for unsupported types`);
}
if (safeEmailType('bank_transfer_reminder') === 'order_created') {
  failures.push(`${EMAIL_EVENTS_LIB}: bank_transfer_reminder must not fall back to order_created`);
}
if (safeEmailType('bank_transfer_not_received_cancelled') === 'order_created') {
  failures.push(`${EMAIL_EVENTS_LIB}: bank_transfer_not_received_cancelled must not fall back to order_created`);
}

// recordEmailEvent must skip unsupported types instead of mislabeling
if (!/unsupported email_type/.test(emailEventsLib)) {
  failures.push(`${EMAIL_EVENTS_LIB}: recordEmailEvent() must warn and skip unsupported email_type values`);
}
if (!/if\s*\(\s*!emailType\s*\)/.test(emailEventsLib)) {
  failures.push(`${EMAIL_EVENTS_LIB}: recordEmailEvent() must skip insert when safeEmailType() returns null`);
}

// ---------------------------------------------------------------------------
// 4) Email sending templates / provider logic must remain untouched
// ---------------------------------------------------------------------------
if (gitDiffFile(ORDER_EMAIL_LIB)) {
  failures.push(`B2E scope violation: ${ORDER_EMAIL_LIB} must not be modified — audit labeling only`);
}

// ---------------------------------------------------------------------------
// 5) Admin auth/RBAC/JWT/session files must remain untouched
// ---------------------------------------------------------------------------
const b2eForbidden = [
  ADMIN_LIB,
  ACCESS_JWT_LIB,
  AUDIT_LIB,
  RUNTIME,
  'scripts/validate-a1f-admin-rbac-session-identity.mjs'
];
for (const file of b2eForbidden) {
  if (!exists(file)) continue;
  if (gitDiffFile(file)) failures.push(`B2E scope violation: ${file} must not be modified in this batch`);
}

// ---------------------------------------------------------------------------
// 6) No migrations / SQL in this batch
// ---------------------------------------------------------------------------
let migrationStatus = [];
try {
  migrationStatus = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatus = [];
}
const b2eMigrationNamed = migrationStatus.filter((line) => /b2e|email_events/i.test(line));
if (b2eMigrationNamed.length) {
  failures.push(`B2E scope violation: a new migration file was detected — B2E must not create migrations: ${b2eMigrationNamed.join(', ')}`);
}
if (migrationStatus.length && !b2eMigrationNamed.length) {
  failures.push(`B2E scope violation: supabase/migrations was modified — B2E must not create migrations or run SQL: ${migrationStatus.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 7) B1/B2 payment behavior files must not regress beyond email-events.js
// ---------------------------------------------------------------------------
if (gitDiffFile(COMMERCE_LIB)) {
  failures.push(`B2E scope violation: ${COMMERCE_LIB} must not be modified — B1/B2 payment finalization unchanged`);
}
if (gitDiffFile(ADMIN_ORDERS)) {
  failures.push(`B2E scope violation: ${ADMIN_ORDERS} must not be modified — bank-transfer send paths unchanged`);
}

// ---------------------------------------------------------------------------
// 8) Chain prior validators (B1/B2/A1/H0/H1/H2/Batch 1/3/4/UI/production)
// ---------------------------------------------------------------------------
const chainedValidators = [
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
  console.error('COSMOSKIN B2E email events integrity validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN B2E email events integrity validation passed.');
