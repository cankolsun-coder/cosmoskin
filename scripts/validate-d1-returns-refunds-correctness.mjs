import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  RETURN_CLAIM_STATUSES,
  RETURN_WINDOW_DAYS,
  resolveDeliveryTimestamp,
  isDeliveredForReturn,
  withinReturnWindow,
  validateCumulativeReturnQuantities,
  buildClaimedQuantityMap
} from '../functions/api/returns.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const RETURNS_API = 'functions/api/returns.js';
const REFUNDS_API = 'functions/api/admin/refunds.js';
const ADMIN_RETURNS_API = 'functions/api/admin/returns.js';
const ACCOUNT_DASHBOARD = 'assets/account-dashboard.js';
const RETURN_ATTACHMENTS = 'functions/api/_lib/return-attachments.js';

function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

const requiredFiles = [RETURNS_API, REFUNDS_API, ADMIN_RETURNS_API, ACCOUNT_DASHBOARD];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN D1 returns/refunds correctness validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const returnsSrc = read(RETURNS_API);
const refundsSrc = read(REFUNDS_API);
const adminReturnsSrc = read(ADMIN_RETURNS_API);
const dashboardSrc = read(ACCOUNT_DASHBOARD);

// ---------------------------------------------------------------------------
// 1) Delivery gate — shipped without delivered_at must not qualify
// ---------------------------------------------------------------------------
if (/ELIGIBLE_ORDER_STATUSES.*shipped/.test(returnsSrc) || /ELIGIBLE_FULFILLMENT.*shipped/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: must not treat bare shipped status as return-eligible`);
}
if (/order\.updated_at\s*\|\|\s*order\.created_at/.test(returnsSrc) || /fulfilled_at\s*\|\|\s*order\.updated_at/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: return window must not fall back to updated_at or created_at`);
}
if (!/resolveDeliveryTimestamp/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: must resolve delivery from delivered_at / shipment delivered_at`);
}
if (!/Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz\./.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: missing delivered-gate customer error copy`);
}
if (!/İade süresi dolmuştur\./.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: missing return-window-expired customer error copy`);
}

const shippedNoDelivery = { status: 'shipped', fulfillment_status: 'shipped', delivered_at: null };
if (isDeliveredForReturn(shippedNoDelivery, null)) {
  failures.push(`${RETURNS_API}: isDeliveredForReturn must reject shipped order without delivery timestamp`);
}
const deliveredOrder = { status: 'delivered', payment_status: 'paid', delivered_at: '2026-06-01T10:00:00.000Z' };
const deliveryTs = resolveDeliveryTimestamp(deliveredOrder, []);
if (!isDeliveredForReturn(deliveredOrder, deliveryTs)) {
  failures.push(`${RETURNS_API}: isDeliveredForReturn must allow delivered order with delivered_at`);
}
for (const blocked of ['pending', 'pending_payment', 'pending_bank_transfer', 'payment_failed', 'cancelled', 'preparing']) {
  if (isDeliveredForReturn({ status: blocked, delivered_at: '2026-06-01T10:00:00.000Z' }, '2026-06-01T10:00:00.000Z')) {
    failures.push(`${RETURNS_API}: isDeliveredForReturn must block status ${blocked}`);
  }
}

// ---------------------------------------------------------------------------
// 2) Return window anchor
// ---------------------------------------------------------------------------
if (withinReturnWindow(null)) {
  failures.push(`${RETURNS_API}: withinReturnWindow must return false when delivery timestamp is missing`);
}
const oldDelivery = new Date(Date.now() - (RETURN_WINDOW_DAYS + 2) * 24 * 60 * 60 * 1000).toISOString();
if (withinReturnWindow(oldDelivery)) {
  failures.push(`${RETURNS_API}: withinReturnWindow must reject dates outside the ${RETURN_WINDOW_DAYS}-day window`);
}
const recentDelivery = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
if (!withinReturnWindow(recentDelivery)) {
  failures.push(`${RETURNS_API}: withinReturnWindow must allow recent delivery within window`);
}

// ---------------------------------------------------------------------------
// 3) Cumulative quantity — return_request_items based
// ---------------------------------------------------------------------------
if (!/return_request_items/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: cumulative quantity validation must query return_request_items`);
}
if (!/loadClaimedQuantitiesForOrder|buildClaimedQuantityMap|validateCumulativeReturnQuantities/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: cumulative quantity helpers must be present`);
}
if (!RETURN_CLAIM_STATUSES.includes('requested') || !RETURN_CLAIM_STATUSES.includes('refunded')) {
  failures.push(`${RETURNS_API}: RETURN_CLAIM_STATUSES must include requested and refunded`);
}
if (RETURN_CLAIM_STATUSES.includes('rejected') || RETURN_CLAIM_STATUSES.includes('cancelled')) {
  failures.push(`${RETURNS_API}: rejected/cancelled must not count toward cumulative claim totals`);
}

const claimed = buildClaimedQuantityMap(
  [{ return_request_id: 'r1', order_item_id: 'oi-1', quantity: 1 }],
  new Map([['r1', { id: 'r1', status: 'requested' }]])
);
const over = validateCumulativeReturnQuantities(
  [{ order_item_id: 'oi-1', product_slug: 'sku-a', quantity: 2, purchased_quantity: 2 }],
  claimed
);
if (over.ok) {
  failures.push(`${RETURNS_API}: validateCumulativeReturnQuantities must reject cumulative quantity above purchased`);
}
const rejectedExcluded = buildClaimedQuantityMap(
  [{ return_request_id: 'r2', order_item_id: 'oi-1', quantity: 2 }],
  new Map([['r2', { id: 'r2', status: 'rejected' }]])
);
if (rejectedExcluded.get('oi-1')) {
  failures.push(`${RETURNS_API}: rejected return items must not count in claimed map`);
}

// ---------------------------------------------------------------------------
// 4) Account UI mirror
// ---------------------------------------------------------------------------
if (/order\.updated_at\s*\|\|\s*order\.created_at/.test(dashboardSrc) || /fulfilled_at\s*\|\|\s*order\.updated_at/.test(dashboardSrc)) {
  failures.push(`${ACCOUNT_DASHBOARD}: client return eligibility must not fall back to created_at/updated_at`);
}
const isDeliveredOrderFn = dashboardSrc.match(/function isDeliveredOrder\([\s\S]*?\n  \}/);
if (isDeliveredOrderFn && /['"]shipped['"]/.test(isDeliveredOrderFn[0])) {
  failures.push(`${ACCOUNT_DASHBOARD}: isDeliveredOrder must not treat shipped alone as delivered`);
}

// ---------------------------------------------------------------------------
// 5) Refund provider_reference + idempotency
// ---------------------------------------------------------------------------
if (!/Tamamlanan iade için işlem referansı zorunludur/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: completed refund must require provider_reference`);
}
if (!/findCompletedRefund|idempotent:\s*true/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: must guard against duplicate completed refunds`);
}
if (/provider_reference:\s*clean\(body\.provider_reference[^)]*\)\s*\|\|\s*null/.test(refundsSrc) && !/if\s*\(\s*!providerReference\s*\)/.test(refundsSrc)) {
  // allow null for pending but completed path must validate
}
if (!/status === 'completed'/.test(refundsSrc) || !/!providerReference/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: must validate provider_reference when status is completed`);
}

// ---------------------------------------------------------------------------
// 6) Admin return transitions (minimal)
// ---------------------------------------------------------------------------
if (!/validateReturnStatusTransition/.test(adminReturnsSrc)) {
  failures.push(`${ADMIN_RETURNS_API}: minimal return status transition guards must be present`);
}

// ---------------------------------------------------------------------------
// 7) RBAC must remain
// ---------------------------------------------------------------------------
if (!/requireAdminPermission\(context,\s*'returns:read'\)/.test(adminReturnsSrc)) {
  failures.push(`${ADMIN_RETURNS_API}: returns:read guard removed`);
}
if (!/requireAdminPermission\(context,\s*'returns:update'\)/.test(adminReturnsSrc)) {
  failures.push(`${ADMIN_RETURNS_API}: returns:update guard removed`);
}
if (!/requireAdminPermission\(context,\s*'refunds:update'\)/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: refunds:update guard removed`);
}

// ---------------------------------------------------------------------------
// 8) H1/H2 attachment contracts preserved
// ---------------------------------------------------------------------------
if (!/isOwnedAttachmentPath/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: attachment ownership path validation removed (H1 regression)`);
}
if (!/signReturnAttachments/.test(returnsSrc)) {
  failures.push(`${RETURNS_API}: signed attachment read path removed (H2 regression)`);
}
if (exists(RETURN_ATTACHMENTS) && !/signed_url|createSignedStorageUrl/.test(read(RETURN_ATTACHMENTS))) {
  failures.push(`${RETURN_ATTACHMENTS}: signed URL contract missing`);
}

// ---------------------------------------------------------------------------
// 9) Forbidden scope
// ---------------------------------------------------------------------------
const d1Forbidden = [
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'functions/api/_lib/commerce-finalization.js',
  'functions/api/_lib/order-email.js',
  'functions/api/_lib/email-events.js',
  'functions/api/iyzico-callback.js'
];
for (const file of d1Forbidden) {
  if (!exists(file)) continue;
  if (gitDiffFile(file)) failures.push(`D1 scope violation: ${file} must not be modified in this batch`);
}

let migrationStatus = [];
try {
  migrationStatus = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatus = [];
}
if (migrationStatus.length) {
  failures.push(`D1 scope violation: supabase/migrations was modified — D1 must not create migrations: ${migrationStatus.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 10) Chain prior validators
// ---------------------------------------------------------------------------
const chainedValidators = [
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
  console.error('COSMOSKIN D1 returns/refunds correctness validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN D1 returns/refunds correctness validation passed.');
