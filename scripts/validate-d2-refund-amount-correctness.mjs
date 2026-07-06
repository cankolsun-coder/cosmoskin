import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  REFUNDABLE_PAYMENT_STATUSES,
  ERR_AMOUNT_EXCEEDS,
  ERR_AMOUNT_INVALID,
  ERR_REFERENCE_REQUIRED,
  ERR_SHIPPING_APPROVAL_REQUIRED,
  roundMoney,
  sumRefundAmounts,
  resolvePaidAmount,
  resolveProductRefundableCap,
  resolveShippingRefundableCap,
  buildRefundCaps,
  computeRemainingRefundable,
  validateRefundAmount
} from '../functions/api/admin/refunds.js';

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


const REFUNDS_API = 'functions/api/admin/refunds.js';
const ADMIN_ORDERS = 'assets/admin-orders.js';

function gitDiffFile(file) {
  try {
    return execSync(`git diff --name-only HEAD -- ${JSON.stringify(file)}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

if (!exists(REFUNDS_API)) failures.push(`Missing required file: ${REFUNDS_API}`);
if (!exists(ADMIN_ORDERS)) failures.push(`Missing required file: ${ADMIN_ORDERS}`);
if (failures.length) {
  console.error('COSMOSKIN D2A refund amount correctness validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const refundsSrc = read(REFUNDS_API);
const adminOrdersSrc = read(ADMIN_ORDERS);

// ---------------------------------------------------------------------------
// 1) D2A helpers exported
// ---------------------------------------------------------------------------
for (const marker of [
  'resolvePaidAmount',
  'resolveProductRefundableCap',
  'resolveShippingRefundableCap',
  'buildRefundCaps',
  'computeRemainingRefundable',
  'validateRefundAmount',
  'sumRefundAmounts',
  'loadRefundBalanceContext',
  'REFUND_RESPONSIBILITIES'
]) {
  if (!refundsSrc.includes(marker)) failures.push(`${REFUNDS_API}: missing D2A helper ${marker}`);
}
if (!refundsSrc.includes(ERR_AMOUNT_EXCEEDS)) {
  failures.push(`${REFUNDS_API}: missing amount exceeds error copy`);
}
if (!refundsSrc.includes(ERR_AMOUNT_INVALID)) {
  failures.push(`${REFUNDS_API}: missing invalid amount error copy`);
}

// Must not use total_amount blindly as product cap
if (/productRefundableCap\s*=\s*roundMoney\(order\.total_amount\)/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: product refundable cap must not use orders.total_amount without excluding shipping`);
}
if (!/total\s*-\s*shipping|total_minus_shipping/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: must derive product cap from total minus shipping when available`);
}
if (!/resolveShippingRefundableCap/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: shipping refundable cap helper missing`);
}
if (!/return\s+0;/.test(refundsSrc.split('resolveShippingRefundableCap')[1] || '')) {
  failures.push(`${REFUNDS_API}: shipping must default to non-refundable (return 0)`);
}

// ---------------------------------------------------------------------------
// 2) Unit-level product/shipping separation
// ---------------------------------------------------------------------------
const order = { payment_status: 'paid', total_amount: 899, subtotal_amount: 839, shipping_amount: 60, discount_amount: 0 };
const productCap = resolveProductRefundableCap(order, []);
if (!productCap.ok || productCap.productCap !== 839) {
  failures.push(`resolveProductRefundableCap must exclude shipping: expected 839, got ${productCap.productCap}`);
}

const customerShipping = resolveShippingRefundableCap(order, productCap, { responsibility: 'customer_preference' });
if (customerShipping !== 0) {
  failures.push('shipping must not be refundable for customer_preference by default');
}

const sellerShipping = resolveShippingRefundableCap(order, productCap, { responsibility: 'seller_fault' });
if (sellerShipping !== 60) {
  failures.push('shipping must be refundable for seller_fault');
}

const carrierShipping = resolveShippingRefundableCap(order, productCap, { responsibility: 'carrier_damage' });
if (carrierShipping !== 60) {
  failures.push('shipping must be refundable for carrier_damage');
}

const manualBlocked = buildRefundCaps(order, [], {
  refund_responsibility: 'manual_review',
  include_shipping_refund: true
});
if (manualBlocked.ok) {
  failures.push('manual shipping refund without reason must be rejected');
}
const manualOk = buildRefundCaps(order, [], {
  refund_responsibility: 'manual_review',
  include_shipping_refund: true,
  shipping_refund_reason: 'Operasyon onayı'
});
if (!manualOk.ok || manualOk.shippingRefundableCap !== 60) {
  failures.push('manual shipping refund with reason must include shipping cap');
}

const customerCaps = buildRefundCaps(order, [], { refund_responsibility: 'customer_preference' });
const sellerCaps = buildRefundCaps(order, [], { refund_responsibility: 'seller_fault' });
const customerMax = roundMoney((customerCaps.productRefundableCap ?? 0) + (customerCaps.shippingRefundableCap ?? 0));
const sellerMax = roundMoney((sellerCaps.productRefundableCap ?? 0) + (sellerCaps.shippingRefundableCap ?? 0));
if (!customerCaps.ok || customerMax !== 839) {
  failures.push('customer_preference max refundable must be product-only');
}
if (!sellerCaps.ok || sellerCaps.shippingRefundableCap !== 60 || sellerMax !== 899) {
  failures.push('seller_fault max refundable must include shipping');
}

const paid = resolvePaidAmount(order, [{ status: 'paid', amount: 899 }]);
if (!paid.ok || paid.paidAmount !== 899) {
  failures.push('resolvePaidAmount must accept paid order (payment gate only)');
}
const unpaid = resolvePaidAmount({ payment_status: 'pending_payment', total_amount: 899 }, []);
if (unpaid.ok) {
  failures.push('resolvePaidAmount must reject unpaid orders');
}

const refunds = [
  { status: 'completed', amount: 400 },
  { status: 'pending', amount: 200 },
  { status: 'failed', amount: 899 },
  { status: 'cancelled', amount: 899 }
];
const balance = computeRemainingRefundable(customerCaps, refunds);
if (balance.completedTotal !== 400 || balance.pendingTotal !== 200 || balance.remaining !== 239) {
  failures.push(`computeRemainingRefundable wrong for product-only cap: remaining=${balance.remaining}, expected 239`);
}

const withoutFailedCancelled = computeRemainingRefundable(customerCaps, [
  { status: 'completed', amount: 400 },
  { status: 'failed', amount: 899 },
  { status: 'cancelled', amount: 899 }
]);
if (withoutFailedCancelled.pendingTotal !== 0 || withoutFailedCancelled.remaining !== 439) {
  failures.push('failed/cancelled refunds must not reduce remaining refundable balance');
}

const over = validateRefundAmount(900, { remaining: 839 });
if (over.ok) failures.push('validateRefundAmount must reject amount above remaining product cap');
const zero = validateRefundAmount(0, { remaining: 839 });
if (zero.ok) failures.push('validateRefundAmount must reject zero amount');
const neg = validateRefundAmount(-10, { remaining: 839 });
if (neg.ok) failures.push('validateRefundAmount must reject negative amount');
const okPartial = validateRefundAmount(239, { remaining: 239 });
if (!okPartial.ok || okPartial.amount !== 239) {
  failures.push('validateRefundAmount must allow amount within remaining');
}

const sellerBalance = computeRemainingRefundable(sellerCaps, [
  { status: 'completed', amount: 500 },
  { status: 'completed', amount: 500 }
]);
if (sellerBalance.remaining !== 0) {
  failures.push('computeRemainingRefundable must clamp remaining at zero when over-refunded historically');
}
const secondAttempt = validateRefundAmount(1, { remaining: sellerBalance.remaining });
if (secondAttempt.ok) {
  failures.push('validateRefundAmount must reject when remaining is zero after cumulative completed refunds');
}

const pendingBalance = computeRemainingRefundable(customerCaps, [{ status: 'pending', amount: 839 }]);
if (pendingBalance.remaining !== 0) {
  failures.push('pending refunds must reserve full remaining product balance');
}

// ---------------------------------------------------------------------------
// 3) D1 preservation markers
// ---------------------------------------------------------------------------
if (!refundsSrc.includes(ERR_REFERENCE_REQUIRED)) {
  failures.push(`${REFUNDS_API}: D1 provider_reference rule removed`);
}
if (!/findCompletedRefund|idempotent:\s*true/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: D1 duplicate completion idempotency removed`);
}
if (!/requireAdminPermission\(context,\s*'refunds:update'\)/.test(refundsSrc)) {
  failures.push(`${REFUNDS_API}: refunds:update RBAC guard removed`);
}

// ---------------------------------------------------------------------------
// 4) Admin UI — product/shipping separation
// ---------------------------------------------------------------------------
if (!/Kargo bedeli standart ürün iadesine dahil edilmez/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must show shipping excluded policy copy`);
}
if (!/Satıcı kaynaklı hata durumunda kargo bedeli iade kapsamına alınabilir/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must show seller-fault shipping copy`);
}
if (!/Kalan iade edilebilir ürün tutarı/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must show remaining product refundable amount label`);
}
if (!/İade tutarı kalan iade edilebilir tutarı aşamaz/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must warn when amount exceeds remaining`);
}
if (!/refundBalanceSummary|refund_responsibility|include_shipping_refund|data-remaining-refundable/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must expose shipping inclusion/exclusion and responsibility in refund UI`);
}
if (!/resolveProductRefundableCap|resolveShippingRefundableCap/.test(adminOrdersSrc)) {
  failures.push(`${ADMIN_ORDERS}: must mirror server-side product/shipping cap helpers`);
}

// ---------------------------------------------------------------------------
// 5) Forbidden scope
// ---------------------------------------------------------------------------
const d2Forbidden = [
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'functions/api/_lib/commerce-finalization.js',
  'functions/api/_lib/order-email.js',
  'functions/api/_lib/email-events.js',
  'functions/api/iyzico-callback.js',
  'functions/api/_lib/coupons.js',
  'functions/api/_lib/loyalty-ledger.js'
];
for (const file of d2Forbidden) {
  if (!exists(file)) continue;
  if (gitDiffFile(file)) failures.push(`D2A scope violation: ${file} must not be modified in this batch`);
}

let migrationStatus = [];
try {
  migrationStatus = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationStatus = [];
}
if (migrationChangesExcludingD3A(migrationStatus).length) {
  failures.push(`D2A scope violation: supabase/migrations was modified — D2A must not create migrations: ${migrationStatus.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 6) Chain D1 + prior validators
// ---------------------------------------------------------------------------
const chainedValidators = [
  'scripts/validate-d1-returns-refunds-correctness.mjs',
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
  console.error('COSMOSKIN D2A refund amount correctness validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN D2A refund amount correctness validation passed.');
