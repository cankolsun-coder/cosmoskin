import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const AUDIT_LIB = 'functions/api/_lib/admin-audit.js';

const stripComments = (src) => src.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

function extractHandler(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  if (start === -1) return '';
  const nextExport = src.indexOf('\nexport ', start + 1);
  return src.slice(start, nextExport === -1 ? undefined : nextExport);
}

// ---------------------------------------------------------------------------
// 1) A1.2a coverage matrix — every GET/read-only admin endpoint gated in that
//    batch, A1.2b coverage matrix — every mutation (POST/PATCH) admin
//    endpoint gated in that batch, and A1.2c coverage matrix — every
//    finance/refund/bank-account admin endpoint gated in this batch. All
//    three reuse the existing colon-notation admin_permissions/admin_roles
//    naming — no dot-notation scheme beyond A1.1's pre-existing
//    'admin.users.manage'.
// ---------------------------------------------------------------------------
const GATED_READ_ENDPOINTS = [
  { file: 'functions/api/admin/orders.js', handler: 'onRequestGet', permission: 'orders:read' },
  { file: 'functions/api/admin/orders/[id].js', handler: 'onRequestGet', permission: 'orders:read' },
  { file: 'functions/api/admin/returns.js', handler: 'onRequestGet', permission: 'returns:read' },
  { file: 'functions/api/admin/customers.js', handler: 'onRequestGet', permission: 'customers:read' },
  { file: 'functions/api/admin/products.js', handler: 'onRequestGet', permission: 'products:read' },
  { file: 'functions/api/admin/inventory.js', handler: 'onRequestGet', permission: 'inventory:read' },
  { file: 'functions/api/admin/inventory/[slug]/movements.js', handler: 'onRequestGet', permission: 'inventory:read' },
  { file: 'functions/api/admin/lots.js', handler: 'onRequestGet', permission: 'lots:read' },
  { file: 'functions/api/admin/suppliers.js', handler: 'onRequestGet', permission: 'suppliers:read' },
  { file: 'functions/api/admin/compliance.js', handler: 'onRequestGet', permission: 'compliance:read' },
  { file: 'functions/api/admin/coupons/index.js', handler: 'onRequestGet', permission: 'coupons:read' },
  { file: 'functions/api/admin/shipments.js', handler: 'onRequestGet', permission: 'shipments:read' },
  { file: 'functions/api/admin/email-logs.js', handler: 'onRequestGet', permission: 'email_logs:read' }
];

const GATED_MUTATION_ENDPOINTS = [
  { file: 'functions/api/admin/orders.js', handler: 'onRequestPatch', permission: 'orders:update' },
  { file: 'functions/api/admin/orders/[id]/status.js', handler: 'onRequestPatch', permission: 'orders:update' },
  { file: 'functions/api/admin/orders/[id]/emails.js', handler: 'onRequestPost', permission: 'orders:update' },
  { file: 'functions/api/admin/orders/[id]/shipments.js', handler: 'onRequestPost', permission: 'shipments:create' },
  { file: 'functions/api/admin/returns.js', handler: 'onRequestPatch', permission: 'returns:update' },
  { file: 'functions/api/admin/products.js', handler: 'onRequestPatch', permission: 'inventory:adjust' },
  { file: 'functions/api/admin/products.js', handler: 'onRequestPost', permission: 'inventory:adjust' },
  { file: 'functions/api/admin/inventory/adjust.js', handler: 'onRequestPost', permission: 'inventory:adjust' },
  { file: 'functions/api/admin/inventory/[slug].js', handler: 'onRequestPatch', permission: 'inventory:adjust' },
  { file: 'functions/api/admin/lots.js', handler: 'onRequestPost', permission: 'inventory:adjust' },
  { file: 'functions/api/admin/lots.js', handler: 'onRequestPatch', permission: 'inventory:adjust' },
  { file: 'functions/api/admin/suppliers.js', handler: 'onRequestPost', permission: 'suppliers:manage' },
  { file: 'functions/api/admin/suppliers.js', handler: 'onRequestPatch', permission: 'suppliers:manage' },
  { file: 'functions/api/admin/compliance.js', handler: 'onRequestPatch', permission: 'products:update' },
  { file: 'functions/api/admin/coupons/index.js', handler: 'onRequestPost', permission: 'coupons:manage' },
  { file: 'functions/api/admin/coupons/index.js', handler: 'onRequestPatch', permission: 'coupons:manage' }
];

// A1.2c: refunds.js has no separate seeded read permission (only
// 'refunds:update', per the A1.2 plan §2 rows 14-15) so GET and POST reuse
// the same string. bank-accounts.js deliberately uses one 'bank_accounts:manage'
// string across GET/POST/PATCH (per the A1.2 plan §2 row 17's explicit
// "fraud-sensitive even to read" rationale for IBAN/payment-routing data) —
// this is an intentional exception to the read/write split used elsewhere.
const GATED_FINANCE_ENDPOINTS = [
  { file: 'functions/api/admin/refunds.js', handler: 'onRequestGet', permission: 'refunds:update' },
  { file: 'functions/api/admin/refunds.js', handler: 'onRequestPost', permission: 'refunds:update' },
  { file: 'functions/api/admin/invoices.js', handler: 'onRequestGet', permission: 'invoices:read' },
  { file: 'functions/api/admin/invoices.js', handler: 'onRequestPost', permission: 'invoices:update' },
  { file: 'functions/api/admin/invoices.js', handler: 'onRequestPatch', permission: 'invoices:update' },
  { file: 'functions/api/admin/bank-accounts.js', handler: 'onRequestGet', permission: 'bank_accounts:manage' },
  { file: 'functions/api/admin/bank-accounts.js', handler: 'onRequestPost', permission: 'bank_accounts:manage' },
  { file: 'functions/api/admin/bank-accounts.js', handler: 'onRequestPatch', permission: 'bank_accounts:manage' }
];

const ALL_GATED_ENDPOINTS = [...GATED_READ_ENDPOINTS, ...GATED_MUTATION_ENDPOINTS, ...GATED_FINANCE_ENDPOINTS];

function checkGatedEndpoint({ file, handler, permission }, batchLabel) {
  if (!exists(file)) {
    failures.push(`Missing expected ${batchLabel} file: ${file}`);
    return;
  }
  const codeOnly = stripComments(read(file));
  const body = extractHandler(codeOnly, handler);
  if (!body) {
    failures.push(`${file}: could not isolate ${handler}() for inspection`);
    return;
  }
  const assertIdx = body.indexOf('assertAdmin(context)');
  const requireIdx = body.indexOf('requireAdminPermission(context');
  if (assertIdx === -1) {
    failures.push(`${file}: ${handler} must keep calling assertAdmin(context)`);
  }
  if (requireIdx === -1) {
    failures.push(`${file}: ${handler} must call requireAdminPermission(context, '${permission}')`);
  } else if (assertIdx !== -1 && requireIdx < assertIdx) {
    failures.push(`${file}: ${handler} must call requireAdminPermission(...) after assertAdmin(context), never before`);
  }
  const exactCallPattern = new RegExp(`requireAdminPermission\\(context,\\s*['"]${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)`);
  if (requireIdx !== -1 && !exactCallPattern.test(body)) {
    failures.push(`${file}: ${handler} must call requireAdminPermission(context, '${permission}') with this exact permission string — do not swap a read permission into a mutation handler or vice versa`);
  }
  const requireCallCount = (body.match(/requireAdminPermission\(/g) || []).length;
  if (requireCallCount > 1) {
    failures.push(`${file}: ${handler} calls requireAdminPermission(...) ${requireCallCount} times — expected exactly one permission check per handler`);
  }
  if (!/import\s*\{[^}]*requireAdminPermission[^}]*\}\s*from\s*['"][./]*_lib\/admin-audit\.js['"]/.test(read(file))) {
    failures.push(`${file}: must import requireAdminPermission from _lib/admin-audit.js`);
  }
}

for (const endpoint of GATED_READ_ENDPOINTS) checkGatedEndpoint(endpoint, 'A1.2a');
for (const endpoint of GATED_MUTATION_ENDPOINTS) checkGatedEndpoint(endpoint, 'A1.2b');
for (const endpoint of GATED_FINANCE_ENDPOINTS) checkGatedEndpoint(endpoint, 'A1.2c');

// ---------------------------------------------------------------------------
// 2) Cross-contamination guard: every requireAdminPermission(...) call found
//    anywhere in a file touched by any of the three batches must be one of
//    that file's *expected* strings — catches a read permission leaking into
//    a mutation handler, a mutation permission leaking into GET, or a typo
//    silently creating an unreviewed new permission string.
// ---------------------------------------------------------------------------
const permissionsByFile = new Map();
for (const { file, permission } of ALL_GATED_ENDPOINTS) {
  if (!permissionsByFile.has(file)) permissionsByFile.set(file, new Set());
  permissionsByFile.get(file).add(permission);
}
for (const [file, expected] of permissionsByFile) {
  if (!exists(file)) continue;
  const content = stripComments(read(file));
  const calls = Array.from(content.matchAll(/requireAdminPermission\(context,\s*['"]([a-zA-Z_]+:[a-zA-Z_]+)['"]\)/g)).map((m) => m[1]);
  for (const permission of calls) {
    if (!expected.has(permission)) {
      failures.push(`${file}: calls requireAdminPermission(context, '${permission}') which is not an expected permission for this file (expected one of: ${[...expected].join(', ')}) — verify no cross-contamination between GET/read and mutation handlers`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Handlers that must remain completely ungated (assertAdmin-only): any
//    handler not in any of the three matrices above, inside a file that DID
//    get a gate on a different handler. This is the "mutation endpoint
//    changed when it shouldn't have" / "GET accidentally gated a second
//    time" guard.
// ---------------------------------------------------------------------------
const ALL_HANDLERS_BY_FILE = new Map([
  ['functions/api/admin/orders.js', ['onRequestGet', 'onRequestPatch']],
  ['functions/api/admin/orders/[id].js', ['onRequestGet']],
  ['functions/api/admin/orders/[id]/status.js', ['onRequestPatch']],
  ['functions/api/admin/orders/[id]/emails.js', ['onRequestPost']],
  ['functions/api/admin/orders/[id]/shipments.js', ['onRequestPost']],
  ['functions/api/admin/returns.js', ['onRequestGet', 'onRequestPatch']],
  ['functions/api/admin/customers.js', ['onRequestGet']],
  ['functions/api/admin/products.js', ['onRequestGet', 'onRequestPatch', 'onRequestPost']],
  ['functions/api/admin/inventory.js', ['onRequestGet']],
  ['functions/api/admin/inventory/adjust.js', ['onRequestPost']],
  ['functions/api/admin/inventory/[slug].js', ['onRequestPatch']],
  ['functions/api/admin/inventory/[slug]/movements.js', ['onRequestGet']],
  ['functions/api/admin/lots.js', ['onRequestGet', 'onRequestPost', 'onRequestPatch']],
  ['functions/api/admin/suppliers.js', ['onRequestGet', 'onRequestPost', 'onRequestPatch']],
  ['functions/api/admin/compliance.js', ['onRequestGet', 'onRequestPatch']],
  ['functions/api/admin/coupons/index.js', ['onRequestGet', 'onRequestPost', 'onRequestPatch']],
  ['functions/api/admin/shipments.js', ['onRequestGet']],
  ['functions/api/admin/email-logs.js', ['onRequestGet']],
  ['functions/api/admin/refunds.js', ['onRequestGet', 'onRequestPost']],
  ['functions/api/admin/invoices.js', ['onRequestGet', 'onRequestPost', 'onRequestPatch']],
  ['functions/api/admin/bank-accounts.js', ['onRequestGet', 'onRequestPost', 'onRequestPatch']]
]);
const gatedSet = new Set(ALL_GATED_ENDPOINTS.map((e) => `${e.file}::${e.handler}`));
for (const [file, handlers] of ALL_HANDLERS_BY_FILE) {
  if (!exists(file)) continue;
  for (const handler of handlers) {
    if (gatedSet.has(`${file}::${handler}`)) continue;
    const codeOnly = stripComments(read(file));
    const body = extractHandler(codeOnly, handler);
    if (!body) continue;
    if (!/assertAdmin\(context\)/.test(body)) {
      failures.push(`${file}: ${handler} must still call assertAdmin(context) — neither A1.2a, A1.2b, nor A1.2c may weaken an ungated handler's existing auth`);
    }
    if (/requireAdminPermission\(/.test(body)) {
      failures.push(`Scope violation: ${file} ${handler} gained a requireAdminPermission(...) call but is not in the A1.2a, A1.2b, or A1.2c coverage matrix — this handler was not approved for gating in this batch`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4) The deliberate assertAdmin-only escape-hatch routes (and the never-gate
//    session-issuance endpoint) must show zero requireAdminPermission(...)
//    additions and must never become public. (A1.2c's finance files are no
//    longer in this "must stay ungated" bucket — they are now fully covered
//    by the GATED_FINANCE_ENDPOINTS matrix above and validated the same way
//    as every other gated file.)
// ---------------------------------------------------------------------------
const ESCAPE_HATCH_FILES = [
  'functions/api/admin/dashboard.js',
  'functions/api/admin/inventory/health.js'
];
const NEVER_GATE_FILES = [
  'functions/api/admin/session.js'
];

for (const file of [...ESCAPE_HATCH_FILES, ...NEVER_GATE_FILES]) {
  if (!exists(file)) {
    failures.push(`Missing file: ${file}`);
    continue;
  }
  const content = read(file);
  if (ESCAPE_HATCH_FILES.includes(file) && !/assertAdmin\(context\)/.test(content)) {
    failures.push(`${file}: must remain assertAdmin(context)-gated — it must never become public`);
  }
  if (/requireAdminPermission\(/.test(content)) {
    failures.push(`${file}: must remain assertAdmin-only (deliberate escape hatch or never-gate route) — must not gain a requireAdminPermission(...) call`);
  }
  if (/public\s*[:=]\s*true/i.test(content)) {
    failures.push(`${file}: must not be flipped to public`);
  }
}

// ---------------------------------------------------------------------------
// 5) No response-shape / query-logic / validation-logic / business-logic
//    drift: for every gated file, the only functional addition allowed
//    relative to HEAD is the new admin-audit import and requireAdminPermission
//    (...) call(s). Strips every requireAdminPermission(...) call and the
//    requireAdminPermission import from both the old (HEAD) and new (working
//    tree) copies and asserts the remainder is byte-identical.
// ---------------------------------------------------------------------------
function gitShowHead(file) {
  try {
    return execSync(`git show HEAD:${JSON.stringify(file).replace(/^"|"$/g, '')}`, { cwd: root, encoding: 'utf8' });
  } catch (_) {
    return null;
  }
}
function stripPermissionScaffolding(src) {
  return src
    .replace(/\s*import\s*\{\s*requireAdminPermission\s*\}\s*from\s*['"][./]*_lib\/admin-audit\.js['"];?/g, '')
    .replace(/\s*await\s+requireAdminPermission\(context,\s*['"][a-zA-Z_]+:[a-zA-Z_]+['"]\);?/g, '');
}
// functions/api/admin/orders.js and functions/api/admin/orders/[id]/status.js
// are no longer expected to be byte-identical-to-HEAD-minus-RBAC-scaffolding
// as of B1 (2026-07-05, bank transfer approval finalization) — B1 legitimately
// added confirmManualBankTransferPayment() wiring, an admin-identity capture
// fix, and an email de-dup guard to these two files. Their B1-specific
// correctness (scope, idempotency, business-logic markers) is verified by
// scripts/validate-b1-bank-transfer-finalization.mjs instead; this check
// still covers every other A1.2a/A1.2b/A1.2c file untouched by B1.
const BYTE_DIFF_EXEMPT_FILES = new Set([
  'functions/api/admin/orders.js',
  'functions/api/admin/orders/[id]/status.js',
  // D1 (2026-07-06) owns return/refund business-logic changes in these files;
  // D2 (2026-07-06) extends admin/refunds.js with amount balance validation.
  'functions/api/admin/refunds.js',
  'functions/api/admin/returns.js'
]);
const allTouchedFiles = new Set(ALL_GATED_ENDPOINTS.map((e) => e.file));
for (const file of allTouchedFiles) {
  if (!exists(file)) continue;
  if (BYTE_DIFF_EXEMPT_FILES.has(file)) continue;
  const headContent = gitShowHead(file);
  if (headContent === null) continue; // file did not exist at HEAD (unexpected here, skip)
  const workingContent = read(file);
  if (stripPermissionScaffolding(headContent) !== stripPermissionScaffolding(workingContent)) {
    failures.push(`${file}: changes beyond the requireAdminPermission import/call(s) were detected — A1.2a/A1.2b/A1.2c must not alter response shape, query logic, validation logic, or business logic`);
  }
}

// ---------------------------------------------------------------------------
// 6) High-caution files: orders.js PATCH, orders/[id]/status.js PATCH
//    (A1.2b), and refunds.js, invoices.js, bank-accounts.js (A1.2c) must
//    retain every named business-logic marker untouched — status transition
//    guards, refund completion / provider_reference handling, invoice
//    generation fields, bank-account validation, and event/loyalty logging.
//    This is a belt-and-suspenders check on top of §5's generic byte-diff
//    for the endpoints explicitly called out as highest-risk.
// ---------------------------------------------------------------------------
const HIGH_CAUTION_MARKERS = {
  'functions/api/admin/orders.js': [
    'assertOperationalTransition', 'releaseInventoryReservations', 'convertInventoryReservations',
    'recordEvent', 'awardOrderPoints', 'promoteOrderPoints', 'reverseOrderPoints',
    'sendAndLogShipmentEmail', 'sendAndLogStatusEmail', 'sendAndLogCommerceEmail'
  ],
  'functions/api/admin/orders/[id]/status.js': [
    'releaseInventoryReservations', 'convertInventoryReservations', 'awardOrderPoints',
    'promoteOrderPoints', 'reverseOrderPoints', 'order_status_events'
  ],
  'functions/api/admin/refunds.js': [
    'STATUSES', 'provider_reference', 'reverseOrderPoints', "completed_at: status === 'completed'",
    'return_requests', 'sendCommerceTransactionalEmail', 'logRefundEmail', 'findCompletedRefund',
    'validateRefundAmount', 'computeRemainingRefundable',
    'resolveProductRefundableCap', 'resolveShippingRefundableCap', 'buildRefundCaps'
  ],
  'functions/api/admin/invoices.js': [
    'TYPES', 'STATUSES', 'provider_reference', 'invoice_number', 'pdf_url', 'isUrl', 'order_status_events'
  ],
  'functions/api/admin/bank-accounts.js': [
    'normalizeBankAccount', 'validateBankAccount', 'toDbPayload', 'NO_STORE', 'sort_order'
  ]
};
for (const [file, markers] of Object.entries(HIGH_CAUTION_MARKERS)) {
  if (!exists(file)) continue;
  const content = read(file);
  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`High-caution regression: ${file} is missing expected business-logic marker '${marker}' — status transition/refund/invoice/bank-account/loyalty logic must not be altered by this batch`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7) Permission-naming guard: no *new* dot-notation permission string may be
//    introduced anywhere in functions/api/**, beyond the one pre-existing,
//    deliberate A1.1 exception ('admin.users.manage'). A1.2a/A1.2b/A1.2c must
//    reuse the colon-notation admin_permissions/admin_roles convention
//    exclusively.
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
const allApiFiles = [...new Set([...trackedFiles, ...untracked])].filter((f) => f.startsWith('functions/api/') && f.endsWith('.js') && exists(f));
const DOT_NOTATION_PATTERN = /requireAdminPermission\(context,\s*['"](admin\.[a-zA-Z_.]+)['"]\)/g;
const ALLOWED_DOT_NOTATION_STRINGS = new Set(['admin.users.manage']);
for (const file of allApiFiles) {
  const content = stripComments(read(file));
  let match;
  while ((match = DOT_NOTATION_PATTERN.exec(content))) {
    if (!ALLOWED_DOT_NOTATION_STRINGS.has(match[1])) {
      failures.push(`${file}: introduces a new dot-notation permission string '${match[1]}' — reuse an existing colon-notation admin_permissions string instead (e.g. 'refunds:update'); do not invent a parallel dot-notation scheme`);
    }
  }
}

// ---------------------------------------------------------------------------
// 8) A1.1's deny-by-default behavior must not have regressed. Re-run the
//    core assertions directly (fast, explicit failure messages) in addition
//    to chaining the full A1.1 validator below.
// ---------------------------------------------------------------------------
if (!exists(AUDIT_LIB)) {
  failures.push(`Missing required file: ${AUDIT_LIB}`);
} else {
  const auditLibCodeOnly = stripComments(read(AUDIT_LIB));
  const hasPermFnStart = auditLibCodeOnly.indexOf('export async function hasAdminPermission');
  const hasPermFnBody = hasPermFnStart === -1 ? '' : auditLibCodeOnly.slice(hasPermFnStart, auditLibCodeOnly.indexOf('\nexport ', hasPermFnStart + 1) === -1 ? undefined : auditLibCodeOnly.indexOf('\nexport ', hasPermFnStart + 1));
  if (!hasPermFnBody) {
    failures.push(`${AUDIT_LIB}: hasAdminPermission() export not found`);
  } else {
    if (/if\s*\(\s*!admin\s*\)\s*return\s+true/.test(hasPermFnBody)) {
      failures.push(`${AUDIT_LIB}: A1.1 deny-by-default was weakened — "if (!admin) return true" must not reappear`);
    }
    if (!/if\s*\(\s*!admin\s*\)\s*return\s+false/.test(hasPermFnBody)) {
      failures.push(`${AUDIT_LIB}: A1.1 deny-by-default was weakened — "if (!admin) return false" is missing`);
    }
    if (!/admin\.is_active\s*===\s*false/.test(hasPermFnBody) || !/admin\.status\s*===\s*['"]disabled['"]/.test(hasPermFnBody)) {
      failures.push(`${AUDIT_LIB}: A1.1's inactive/disabled admin denial checks were weakened`);
    }
    if (!/direct\.includes\(\s*['"]\*['"]\s*\)/.test(hasPermFnBody) || !/role\s*===\s*['"]owner['"]/.test(hasPermFnBody)) {
      failures.push(`${AUDIT_LIB}: A1.1's owner wildcard path was weakened`);
    }
  }
}

// ---------------------------------------------------------------------------
// 9) No migration/SQL, no touching of checkout/payment/customer-return-flow/
//    storage/loyalty/coupons-business-logic/order-cancellation/products/
//    inventory/shipments/RBAC-core-helper/Cloudflare-config files. This is a
//    genuine, real zero-diff check for every file below — none of them carry
//    a pre-existing uncommitted diff from an earlier batch.
// ---------------------------------------------------------------------------
// NOTE: functions/api/_lib/admin-audit.js and functions/api/admin/users.js
// are intentionally NOT in this list. Both already carry a legitimate,
// previously-approved A1.1 diff relative to HEAD (uncommitted at the time
// this batch runs), so a naive git-diff-is-empty check would produce a false
// positive here regardless of what A1.2a/A1.2b/A1.2c does. Their RBAC-relevant
// invariants are instead verified by check #8 above and by chaining the A1.1
// validator itself (§10 below), which performs a full structural inspection
// of both. Likewise, the 21 route files already gated by A1.2a/A1.2b are not
// in this list — their zero-drift is instead verified by the byte-diff check
// (§5) and the cross-contamination/ungated-handler checks (§2/§3) above,
// which are stricter and more precise than a blanket zero-diff would allow.
// functions/api/iyzico-callback.js is no longer zero-diff-forbidden as of B1
// (2026-07-05, bank transfer approval finalization) — see
// COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_REPORT_20260705.md and its own
// validator (scripts/validate-b1-bank-transfer-finalization.mjs), which
// asserts the only change is a byte-identical extraction of
// finalizeCommerceAfterPayment()/ensureShipmentShell() into
// functions/api/_lib/commerce-finalization.js — card payment behavior is
// unchanged.
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
  'functions/api/_lib/bank-accounts.js',
  'functions/api/_lib/inventory.js',
  'functions/api/account/summary.js',
  'functions/api/account/profile.js',
  'functions/api/account/notifications.js',
  // assets/account-dashboard.js — D1 (2026-07-06) owns return eligibility UI mirror only.
  'assets/account-premium.css',
  'wrangler.toml',
  '.env.example',
  '_headers',
  'functions/api/admin/inventory/health.js',
  'functions/api/admin/dashboard.js',
  'functions/api/admin/loyalty/adjust-points.js',
  'functions/api/admin/coupons/issue-customer-coupon.js',
  'functions/api/admin/shipments/[id]/sync.js',
  'functions/api/admin/shipments/[id]/label.js',
  'functions/api/admin/orders/[id]/dhl-shipment.js',
  'functions/api/admin/returns/[id]/dhl-return-shipment.js'
];
// functions/api/_lib/admin.js, assets/admin-runtime.js, and
// functions/api/admin/session.js are no longer zero-diff-forbidden as of A1F
// (2026-07-05) — see COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_REPORT_20260705.md.
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
  if (diff) failures.push(`A1.2a/A1.2b/A1.2c scope violation: ${file} must not be modified by this batch`);
}

let migrationDiff = [];
try {
  migrationDiff = execSync('git status --porcelain -- supabase/migrations', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (_) {
  migrationDiff = [];
}
if (migrationDiff.length) {
  failures.push(`A1.2a/A1.2b/A1.2c must not add/modify any supabase/migrations/*.sql file: ${migrationDiff.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 10) Chain A1.1 and H0/H1/H2/Batch 1/3/4/UI validators — A1.2a/A1.2b/A1.2c
//     must never regress any prior batch's guarantees.
// ---------------------------------------------------------------------------
const chainedValidators = [
  'scripts/validate-a1-admin-rbac-hardening.mjs',
  'scripts/validate-h2-return-attachment-preview.mjs',
  'scripts/validate-h1-return-attachment-storage-rls.mjs',
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
  console.error('COSMOSKIN A1.2a/A1.2b/A1.2c admin endpoint permission coverage validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN A1.2a/A1.2b/A1.2c admin endpoint permission coverage validation passed.');
