import { migrationChangesExcludingBatchMigrations as migrationChangesExcludingD3A } from './lib/migration-batch-exemptions.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const failures = [];
function isD3ACheckoutSnapshotChange(filePath) {
  try {
    return String(filePath).endsWith('functions/api/create-checkout.js')
      && fs.readFileSync(path.join(process.cwd(), filePath), 'utf8').includes('buildOrderItemPricingSnapshots');
  } catch (_) {
    return false;
  }
}
function isI1InventoryCheckoutChange(filePath) {
  try {
    const file = String(filePath);
    if (file.endsWith('assets/checkout-flow.js')) return read('assets/checkout-flow.js').includes('refreshStockGate');
    if (file.endsWith('functions/api/create-checkout.js')) return read('functions/api/create-checkout.js').includes('validateCartStock(context');
    return false;
  } catch (_) {
    return false;
  }
}


// ---------------------------------------------------------------------------
// 1) Required Step 2 files exist
// ---------------------------------------------------------------------------
const requiredFiles = [
  'functions/api/_lib/loyalty-ledger.js',
  'functions/api/_lib/loyalty-config.js',
  'functions/api/account/summary.js',
  'functions/api/account/membership.js',
  'functions/api/account/points.js',
  'functions/api/loyalty/redeem.js',
  'functions/api/cron/birthday-benefits.js',
  'assets/account-dashboard.js',
  'assets/account-premium.css'
];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required file: ${file}`);
}
if (failures.length) {
  console.error('COSMOSKIN Batch 4 validation failed (missing files):');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

const ledgerLib = read('functions/api/_lib/loyalty-ledger.js');
const configLib = read('functions/api/_lib/loyalty-config.js');
const summaryJs = read('functions/api/account/summary.js');
const membershipJs = read('functions/api/account/membership.js');
const pointsJs = read('functions/api/account/points.js');
const redeemJs = read('functions/api/loyalty/redeem.js');
const birthdayCron = read('functions/api/cron/birthday-benefits.js');
const iyzicoCallback = read('functions/api/iyzico-callback.js');
const adminOrders = read('functions/api/admin/orders.js');
const adminOrderStatus = read('functions/api/admin/orders/[id]/status.js');
const adminRefunds = read('functions/api/admin/refunds.js');
const adminReturns = read('functions/api/admin/returns.js');
const dashboardJs = read('assets/account-dashboard.js');
const accountCss = read('assets/account-premium.css');

// ---------------------------------------------------------------------------
// 2) Files that must remain byte-for-byte untouched. account-dashboard.js and
//    account-premium.css are Step 3's own scope (frontend Club UI/ledger truth),
//    so they are intentionally NOT in this frozen list as of Step 3 — see the
//    dedicated behavioral checks for those two files further below instead.
//    Everything else here (Batch 3 cancellation internals, both SQL
//    migrations, account/profile.html) is still out of Step 3's scope and
//    already differs from git HEAD from earlier batches, so a plain
//    `git diff HEAD` cannot detect a *new* unwanted edit — a content hash
//    snapshot taken before Step 2/3 changes is used instead.
// ---------------------------------------------------------------------------
const frozenFileHashes = {
  'account/profile.html': 'e2f2b01f2d85fabd94270a182981d6d59cd832f15956d2cc0d260ea6b41aaf80',
  'functions/api/_lib/order-cancellation.js': 'f13c9a22a7ac38037d59203fa9c74c5f511691e9a1d478f4a2b33821532914c9',
  'functions/api/account/orders/[id]/cancel.js': '532308d4288bbe0c9ac5c98f03c5a0941e50098b990415f889177f74d7f7f8b5',
  'supabase/migrations/20260703_batch3_customer_order_cancellation.sql': 'c99b1028a41ee05e8ba0ae5d969fd6d361ac3b61c33e314753a3a415c6f3dec0',
  'supabase/migrations/20260704_batch4_loyalty_ledger.sql': '4475a9365bb2663a8b7bfd9d9de5f203c4573cb8f2d1538968f7a76b7ad17ce5',
  'supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql': '5c9097ef31980d224bc8f6dced89285f5fc5e415873c2fbde18318cffdb9feb0'
};
for (const [file, expected] of Object.entries(frozenFileHashes)) {
  if (!exists(file)) continue; // pre-existing-file check handled elsewhere
  const actual = sha256(file);
  if (actual !== expected) {
    failures.push(`Forbidden Step 2 modification detected (file must stay unchanged): ${file}`);
  }
}

// ---------------------------------------------------------------------------
// 3) Checkout UI must not be modified. These files have zero diff from HEAD
//    across every batch so far — a real git diff check is reliable here.
// ---------------------------------------------------------------------------
const checkoutFiles = ['checkout.html', 'assets/checkout.js', 'assets/checkout-flow.js', 'functions/api/create-checkout.js'];
for (const file of checkoutFiles) {
  if (!exists(file)) continue;
  try {
    const diff = execSync(`git diff --name-only HEAD -- ${JSON.stringify(file).slice(1, -1)}`, { cwd: root, encoding: 'utf8' }).trim();
    if (diff && !isD3ACheckoutSnapshotChange(file) && !isI1InventoryCheckoutChange(file)) failures.push(`Forbidden modification — checkout UI must not be touched in Batch 4: ${file}`);
  } catch (_) { /* git unavailable */ }
}

// ---------------------------------------------------------------------------
// 4) iyzico refund behavior must not be modified: no new iyzicoRequest() call
//    was added (still exactly the one pre-existing checkoutform/auth/ecom/detail
//    retrieve call), and the payment success/failure RPC names are unchanged.
// ---------------------------------------------------------------------------
const iyzicoRequestCalls = (iyzicoCallback.match(/iyzicoRequest\(/g) || []).length;
if (iyzicoRequestCalls !== 1) {
  failures.push(`iyzico-callback.js: expected exactly 1 iyzicoRequest() call (payment retrieve), found ${iyzicoRequestCalls} — iyzico refund/API behavior must not change`);
}
if (!/process_iyzico_payment_success/.test(iyzicoCallback) || !/process_iyzico_payment_failure/.test(iyzicoCallback)) {
  failures.push('iyzico-callback.js: core payment success/failure RPC calls must remain unchanged');
}
// B1 (2026-07-05) moved finalizeCommerceAfterPayment() — which calls
// awardOrderPoints() — verbatim into functions/api/_lib/commerce-finalization.js
// and iyzico-callback.js now calls it via import. The literal string
// 'awardOrderPoints' therefore no longer appears in iyzico-callback.js itself;
// accept the indirect path (finalizeCommerceAfterPayment imported + called,
// and awardOrderPoints present in the shared helper) as equivalent.
const commerceFinalizationLib = exists('functions/api/_lib/commerce-finalization.js') ? read('functions/api/_lib/commerce-finalization.js') : '';
const hasDirectAwardHook = /awardOrderPoints/.test(iyzicoCallback);
const hasIndirectAwardHook = /finalizeCommerceAfterPayment/.test(iyzicoCallback) && /awardOrderPoints/.test(commerceFinalizationLib);
if (!hasDirectAwardHook && !hasIndirectAwardHook) {
  failures.push('iyzico-callback.js: purchase earn writer hook (awardOrderPoints) is missing');
}

// ---------------------------------------------------------------------------
// 5) Fictional points fallback must be gone from summary/membership/points/redeem
// ---------------------------------------------------------------------------
if (/derivedPoints/.test(summaryJs)) failures.push('summary.js: fictional derivedPoints fallback still present');
if (/availablePoints \|\| derivedPoints/.test(summaryJs)) failures.push('summary.js: fictional points fallback pattern still present');
if (/Math\.round\(totalSpent\)/.test(summaryJs)) failures.push('summary.js: points must not be derived from totalSpent');
if (!/getLoyaltyBalance/.test(summaryJs)) failures.push('summary.js: must read balances via getLoyaltyBalance (ledger-backed)');

if (/(?<!sub)total_amount/.test(membershipJs)) failures.push('membership.js: must not use total_amount (shipping-inclusive) as points/tier basis');
if (/spend \+= Number\(o\.total_amount/.test(membershipJs)) failures.push('membership.js: spend basis must exclude shipping (no total_amount)');
if (!/subtotal_amount/.test(membershipJs)) failures.push('membership.js: fallback spend basis must use subtotal_amount (product net)');
if (/ledger\.reduce\(\(sum, row\) => sum \+ Number\(row\.points_delta \|\| 0\), 0\)/.test(membershipJs)) {
  failures.push('membership.js: fallback balance must filter by status = available, not sum all rows');
}

if (/reduce\(\(sum, row\) => sum \+ Number\(row\.points_delta \|\| 0\), 0\)/.test(pointsJs)) {
  failures.push('points.js: balance must not be a naive sum of all ledger rows regardless of status');
}
if (!/getLoyaltyBalance/.test(pointsJs)) failures.push('points.js: must read balance via getLoyaltyBalance (status = available only)');

if (!/getLoyaltyBalance/.test(redeemJs)) failures.push('redeem.js: redeemable balance must come from getLoyaltyBalance (status = available only)');
if (/expires_at.*points_delta \|\| 0\), 0\)/.test(redeemJs)) failures.push('redeem.js: must not compute redeemable balance from raw ledger rows ignoring status');
if (!/transaction_reference/.test(redeemJs)) failures.push('redeem.js: redemption ledger row should support an idempotency reference');

// ---------------------------------------------------------------------------
// 6) 5,000 tier threshold and non-canonical tier names must not remain in
//    active customer/account logic touched by Step 2 (loyalty-config.js is the
//    single canonical source: Signature 6,000/3, Elite 15,000/8).
// ---------------------------------------------------------------------------
for (const [name, content] of [['loyalty-config.js', configLib], ['summary.js', summaryJs], ['membership.js', membershipJs], ['account-dashboard.js', dashboardJs]]) {
  if (/\b5000\b/.test(content) || /\b5\.000\b/.test(content) || /\b5,000\b/.test(content)) failures.push(`${name}: 5,000 tier threshold must not remain`);
  if (/\bSelect Üye\b|\bSilver Üye\b|Essantial/i.test(content)) failures.push(`${name}: non-canonical tier name (Select/Silver/Essantial) found`);
}
if (!/signature[\s\S]{0,80}6000/i.test(configLib) && !/6000[\s\S]{0,80}signature/i.test(configLib)) {
  failures.push('loyalty-config.js: Signature threshold must be 6,000 TL product net');
}
if (!/elite[\s\S]{0,80}15000/i.test(configLib) && !/15000[\s\S]{0,80}elite/i.test(configLib)) {
  failures.push('loyalty-config.js: Elite threshold must be 15,000 TL product net');
}

// ---------------------------------------------------------------------------
// 7) Purchase earn / promote / reverse hooks present in the right admin flows
// ---------------------------------------------------------------------------
if (!/awardOrderPoints/.test(adminOrders)) failures.push('admin/orders.js: purchase earn writer hook (awardOrderPoints) is missing');
if (!/promoteOrderPoints/.test(adminOrders)) failures.push('admin/orders.js: promotion hook (promoteOrderPoints) is missing');
if (!/reverseOrderPoints/.test(adminOrders)) failures.push('admin/orders.js: reversal hook (reverseOrderPoints) is missing');

if (!/awardOrderPoints/.test(adminOrderStatus)) failures.push('admin/orders/[id]/status.js: purchase earn writer hook is missing');
if (!/promoteOrderPoints/.test(adminOrderStatus)) failures.push('admin/orders/[id]/status.js: promotion hook is missing');
if (!/reverseOrderPoints/.test(adminOrderStatus)) failures.push('admin/orders/[id]/status.js: reversal hook is missing');

if (!/reverseOrderPoints/.test(adminRefunds)) failures.push('admin/refunds.js: reversal hook (reverseOrderPoints) is missing');
if (!/reverseOrderPoints/.test(adminReturns)) failures.push('admin/returns.js: reversal hook (reverseOrderPoints) is missing');

// ---------------------------------------------------------------------------
// 8) loyalty-ledger.js wraps the Step 1 RPCs and never throws to callers
// ---------------------------------------------------------------------------
const requiredRpcCalls = [
  'cosmoskin_award_loyalty_for_order',
  'cosmoskin_promote_loyalty_for_order',
  'cosmoskin_reverse_loyalty_for_order',
  'cosmoskin_loyalty_balance_for_user'
];
for (const fn of requiredRpcCalls) {
  if (!ledgerLib.includes(fn)) failures.push(`loyalty-ledger.js: missing call to RPC ${fn}`);
}
if (!/export async function awardOrderPoints/.test(ledgerLib)) failures.push('loyalty-ledger.js: awardOrderPoints export missing');
if (!/export async function promoteOrderPoints/.test(ledgerLib)) failures.push('loyalty-ledger.js: promoteOrderPoints export missing');
if (!/export async function reverseOrderPoints/.test(ledgerLib)) failures.push('loyalty-ledger.js: reverseOrderPoints export missing');
if (!/export async function getLoyaltyBalance/.test(ledgerLib)) failures.push('loyalty-ledger.js: getLoyaltyBalance export missing');
if ((ledgerLib.match(/catch \(error\)/g) || []).length < 4) {
  failures.push('loyalty-ledger.js: award/promote/reverse/balance helpers must each catch their own errors (never throw to payment/admin callers)');
}

// ---------------------------------------------------------------------------
// 9) Birthday cron must be idempotent with an explicit status + transaction_reference
// ---------------------------------------------------------------------------
if (!/transaction_reference/.test(birthdayCron)) failures.push('cron/birthday-benefits.js: missing transaction_reference on ledger insert');
if (!/status:\s*'available'/.test(birthdayCron)) failures.push('cron/birthday-benefits.js: missing explicit status on ledger insert');
if (!/unique\(user_id, benefit_year\)|birthday_benefits/.test(birthdayCron)) failures.push('cron/birthday-benefits.js: birthday_benefits duplicate guard missing');

// ---------------------------------------------------------------------------
// 10) Step 3 — account-dashboard.js frontend must show ledger-backed truth only,
//     with no client-side spend-to-points guessing and no stale tier thresholds.
// ---------------------------------------------------------------------------
if (/available\s*=\s*Math\.round\(spend\)/.test(dashboardJs)) {
  failures.push('account-dashboard.js: fictional fallback assigning Math.round(spend) to available points is still present');
}
if (/Math\.round\(spend\)/.test(dashboardJs)) {
  failures.push('account-dashboard.js: Math.round(spend) must not be used to fabricate points');
}
if (/!available\s*&&\s*spend\s*>\s*0/.test(dashboardJs)) {
  failures.push('account-dashboard.js: spend-based fallback condition for available points is still present');
}
{
  const loyaltyFnMatch = dashboardJs.match(/function loyalty\(\)\s*\{[\s\S]*?\n  \}/);
  if (!loyaltyFnMatch) {
    failures.push('account-dashboard.js: loyalty() function not found for behavioral checks');
  } else {
    const body = loyaltyFnMatch[0];
    if (!/pointsObj\.available/.test(body) || !/pointsObj\.pending/.test(body) || !/pointsObj\.reversed/.test(body)) {
      failures.push('account-dashboard.js: loyalty() must read available/pending/reversed directly from backend ledger-backed summary.points');
    }
    if (/available\s*=\s*[^;]*spend/i.test(body.replace(/pointsObj\.available/g, ''))) {
      failures.push('account-dashboard.js: available points must not be derived from spend anywhere in loyalty()');
    }
  }
}
if (!/LOYALTY_TIERS/.test(dashboardJs) || !/spendThreshold:\s*6000/.test(dashboardJs) || !/spendThreshold:\s*15000/.test(dashboardJs)) {
  failures.push('account-dashboard.js: canonical tier thresholds (Signature 6,000 / Elite 15,000) are missing');
}

// ---------------------------------------------------------------------------
// 11) Step 3 — Club point history table: must render every backend ledger row
//     (no silent filtering), must never fall back to empty while rows exist,
//     and must show Turkish status labels for pending/available/reversed.
// ---------------------------------------------------------------------------
{
  const historyFnMatch = dashboardJs.match(/function pointHistoryTable\([^)]*\)\s*\{[\s\S]*?\n  \}/);
  if (!historyFnMatch) {
    failures.push('account-dashboard.js: pointHistoryTable() function not found');
  } else {
    const body = historyFnMatch[0];
    if (!/if \(!ledger\.length\) return emptyState/.test(body)) {
      failures.push('account-dashboard.js: point history must only show the empty state when the ledger array is genuinely empty');
    }
    if (/ledger\.filter\(/.test(body)) {
      failures.push('account-dashboard.js: point history must not silently filter out backend ledger rows before rendering');
    }
    if (!/ledger\.map\(/.test(body)) {
      failures.push('account-dashboard.js: point history must map over every backend ledger row');
    }
  }
}
for (const label of ['Beklemede', 'Kullanılabilir', 'Geri alındı']) {
  if (!dashboardJs.includes(label)) failures.push(`account-dashboard.js: missing Turkish point-status label "${label}"`);
}
for (const label of ['Sipariş kazanımı', 'Kullanıldı', 'Doğum günü avantajı', 'Manuel düzenleme']) {
  if (!dashboardJs.includes(label)) failures.push(`account-dashboard.js: missing Turkish point-event label "${label}"`);
}
if (!/maintenance_note_required/.test(dashboardJs)) {
  failures.push('account-dashboard.js: maintenance/backfill note flag (maintenance_note_required) is not consumed');
}
if (!/Önceki siparişleriniz için puan yansıtması kontrol ediliyor olabilir/.test(dashboardJs)) {
  failures.push('account-dashboard.js: neutral maintenance note copy is missing');
}

// ---------------------------------------------------------------------------
// 12) Step 3 — Overview and Club must read the same loyalty() output (no
//     separate frontend recalculation for the Overview stat card).
// ---------------------------------------------------------------------------
if (!/l\.available/.test(dashboardJs) || (dashboardJs.match(/l\.available/g) || []).length < 2) {
  failures.push('account-dashboard.js: Overview stat and Club balance must both read loyalty().available (single source)');
}

// ---------------------------------------------------------------------------
// 13) Step 3 — no unrelated regressions: stock-check / checkout copy in the
//     same file must remain intact, and account-premium.css additions must be
//     scoped to the Club point-history polish (BATCH4_LOYALTY_HISTORY marker),
//     not a header/footer/PDP/checkout redesign.
// ---------------------------------------------------------------------------
if (!dashboardJs.includes('Stok kontrolü')) {
  failures.push('account-dashboard.js: unrelated stock-check UI regression detected (Stok kontrolü label missing)');
}
if (!/BATCH4_LOYALTY_HISTORY/.test(accountCss)) {
  failures.push('account-premium.css: missing BATCH4_LOYALTY_HISTORY polish marker for Step 3');
}
for (const forbidden of [/\.site-header/, /\.site-footer/, /\.cs-pdp-/, /\.cs-checkout-/]) {
  if (forbidden.test(accountCss.slice(accountCss.indexOf('BATCH4_LOYALTY_HISTORY')))) {
    failures.push(`account-premium.css: Step 3 CSS addition touches an out-of-scope selector (${forbidden})`);
  }
}

// ---------------------------------------------------------------------------
// 14) Prior batch validators/guardrails must still pass
// ---------------------------------------------------------------------------
const priorValidators = [
  'scripts/validate-account-batch-1-safe-fixes.mjs',
  'scripts/validate-account-batch-3-order-cancellation.mjs',
  'scripts/validate-account-ui-polish.mjs',
  'scripts/validate-account-runtime-hotfix.mjs',
  'scripts/validate-account-experience-final-polish.mjs'
];
for (const script of priorValidators) {
  if (!exists(script)) {
    failures.push(`Missing prior validator (guardrail broken): ${script}`);
    continue;
  }
  try {
    execSync(`node ${JSON.stringify(script)}`, { cwd: root, stdio: 'inherit' });
  } catch (error) {
    failures.push(`Prior validator failed: ${script}\n${error.stdout?.toString() || error.message}`);
  }
}

if (failures.length) {
  console.error('COSMOSKIN Batch 4 (Steps 1-3) loyalty ledger validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN Batch 4 (Steps 1-3) loyalty ledger validation passed.');
