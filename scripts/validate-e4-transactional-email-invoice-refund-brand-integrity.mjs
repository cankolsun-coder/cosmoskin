#!/usr/bin/env node
// E4 — Transactional email / invoice / refund / brand integrity validator.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const files = {
  brand: 'functions/api/_lib/email-brand.js',
  orderEmail: 'functions/api/_lib/order-email.js',
  restockEmail: 'functions/api/_lib/restock-email.js',
  emailEvents: 'functions/api/_lib/email-events.js',
  lifecycle: 'functions/api/_lib/lifecycle-emails.js',
  refunds: 'functions/api/admin/refunds.js',
  returns: 'functions/api/admin/returns.js',
  invoices: 'functions/api/admin/invoices.js',
  preview: 'scripts/email-preview.mjs',
  testPdf: 'scripts/make-test-invoice-pdf.mjs',
  migration: 'supabase/migrations/20260714161845_e4_email_event_types.sql',
  wordmark: 'assets/img/email/cosmoskin-wordmark-email-v1.png'
};
for (const rel of Object.values(files)) {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
}
if (errors.length) {
  console.error('E4 validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const src = Object.fromEntries(Object.entries(files).map(([k, rel]) => [k, rel.endsWith('.png') ? '' : read(rel)]));

function mustMatch(key, regex, why) {
  if (!regex.test(src[key])) errors.push(`${files[key]}: ${why} (missing ${regex})`);
}
function mustNotMatch(key, regex, why) {
  const m = src[key].match(regex);
  if (m) errors.push(`${files[key]}: ${why} → "${String(m[0]).slice(0, 80)}"`);
}

// --- 1. refund_completed wiring: durable-claim dispatcher on both admin paths
mustMatch('lifecycle', /export async function sendRefundCompletedEmailOnce/, 'refund dispatcher missing');
mustMatch('lifecycle', /refund_completed:\$\{scope\}/, 'refund idempotency key missing');
mustMatch('lifecycle', /returnRequestId \? `return:\$\{returnRequestId\}` : \(refundId/, 'return-linked refunds must converge on the return-scoped claim key');
// durable claim: CAS on refund_records.metadata + email_events pending claim
mustMatch('lifecycle', /updateRowsWhere\(context, 'refund_records'/, 'refund-record CAS claim missing');
mustMatch('lifecycle', /pending_claimed/, 'refund claim state machine (pending_claimed → sent|failed) missing');
mustMatch('lifecycle', /claimEmailEvent\(context, \{\s*\n?\s*emailType: 'refund_completed'/, 'email_events pending-claim missing');
mustMatch('lifecycle', /REFUND_CLAIM_STALE_MS/, 'stale-claim retry policy missing');
mustMatch('lifecycle', /refund_email_claim_unavailable/, 'claim-store outage must refuse to send (retryable), never fail open');
mustMatch('emailEvents', /export async function claimEmailEvent/, 'claim insert helper missing');
mustMatch('emailEvents', /export async function settleEmailEventClaim/, 'claim settle helper missing');
mustMatch('emailEvents', /isUniqueViolationError/, 'unique-violation detection missing');
mustMatch('lifecycle', /pending_retry: true/, 'failed sends must be flagged for retry');
mustMatch('refunds', /sendRefundCompletedEmailOnce\(/, 'refunds endpoint must use the once-dispatcher');
mustMatch('refunds', /admin_refunds_repeat/, 'repeated completion callback must run through the idempotent dispatcher');
mustMatch('refunds', /const refund = await insertRow\(context, 'refund_records', payload\);[\s\S]+sendRefundCompletedEmailOnce/, 'email must fire after the committed refund');
mustMatch('refunds', /sendRefundCompletedEmailOnce\(context, \{[\s\S]{0,220}\}\)\.catch\(/, 'email failure must not roll back the refund');
mustMatch('returns', /sendRefundCompletedEmailOnce\(context,\{order,returnRequestId:id/, 'returns endpoint must use the once-dispatcher');
mustNotMatch('returns', /sendReturnEmail\(context,order,'refund_completed'/, 'legacy duplicate-prone refund email path must be gone');
// E4 must not touch refund math
mustMatch('refunds', /resolveItemProratedRefundableCap/, 'refund proration pipeline must remain untouched');
mustMatch('refunds', /validateRefundAmount\(body\.amount, balanceCtx\)/, 'refund amount validation must remain untouched');

// --- 2. invoice_ready wiring: guarded, versioned, deduped
mustMatch('lifecycle', /export async function maybeSendInvoiceReadyEmail/, 'invoice dispatcher missing');
mustMatch('lifecycle', /INVOICE_READY_STATUSES = new Set\(\['issued', 'ready'\]\)/, 'ready-status guard missing');
mustMatch('lifecycle', /invoice_pdf_missing/, 'invoice without PDF must never send');
mustMatch('lifecycle', /invoiceEmailVersionKey/, 'invoice version key missing');
mustMatch('lifecycle', /priorStamp\.version_key === versionKey/, 'metadata-stamp dedup missing');
mustMatch('lifecycle', /normalizeInvoiceForEmail/, 'naming-drift adapter missing');
mustMatch('lifecycle', /invoice\.file_url \|\| invoice\.invoice_pdf_url/, 'adapter must tolerate pdf_url/file_url drift');
mustMatch('invoices', /dispatchInvoiceReadyEmail\(context,invoice\.id,'admin_invoices_create'\)/, 'invoice create must dispatch');
mustMatch('invoices', /dispatchInvoiceReadyEmail\(context,id,'admin_invoices_update'\)/, 'invoice update must dispatch');
mustMatch('emailEvents', /'invoice_ready'/, 'invoice_ready must be a known email type');
mustMatch('migration', /'invoice_ready','order_cancelled'/, 'additive email_type migration must exist');
mustMatch('migration', /email_events_idempotency_claim_uniq/, 'unique idempotency-claim index missing from migration');
// DB1C-0 governance: unique 14-digit UTC migration version, exactly one E4 migration
{
  const { readdirSync } = await import('node:fs');
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
  const e4Migrations = migrations.filter((f) => f.includes('e4_email_event_types'));
  if (e4Migrations.length !== 1) errors.push(`expected exactly one E4 migration, found: ${e4Migrations.join(', ') || '(none)'}`);
  const e4Name = e4Migrations[0] || '';
  if (!/^\d{14}_/.test(e4Name)) errors.push(`E4 migration must use a 14-digit UTC version prefix: ${e4Name}`);
  const prefix = e4Name.slice(0, 14);
  if (prefix && migrations.filter((f) => f.startsWith(prefix)).length !== 1) errors.push(`E4 migration version prefix collides with another migration: ${prefix}`);
}
mustMatch('orderEmail', /invoice_ready: \{/, 'invoice_ready copy missing');
mustMatch('orderEmail', /Faturanı Görüntüle/, 'invoice CTA missing');

// --- 3. Image integrity: canonical resolver + no unsafe/relative sources
mustMatch('brand', /export function resolveEmailProductImage/, 'canonical image resolver missing');
mustMatch('brand', /localhost\|127\\\.0\\\.0\\\.1|localhost/, 'unsafe-host rejection missing');
mustMatch('brand', /EMAIL_PRODUCT_FALLBACK_PATH/, 'branded fallback missing');
mustMatch('orderEmail', /resolveEmailProductImage/, 'order emails must use the canonical resolver');
mustMatch('restockEmail', /resolveEmailProductImage/, 'restock email must use the canonical resolver');
mustMatch('restockEmail', /emailProductThumb/, 'restock email must render the framed product image');
mustMatch('restockEmail', /priceLineHtml/, 'restock email must show the effective display price');
mustMatch('restockEmail', /tab=notifications/, 'restock email must link notification preferences');
// template-source audit: no relative/local/empty srcs can be emitted
for (const key of ['brand', 'orderEmail', 'restockEmail']) {
  mustNotMatch(key, /src="\/(?!\/)/, 'template emits a root-relative img src');
  mustNotMatch(key, /src="assets\//, 'template emits a relative img src');
  mustNotMatch(key, /src="https?:\/\/localhost/, 'template emits a localhost src');
  mustNotMatch(key, /src="\$\{[^}]*\}"\s*width=""|src=""/, 'template can emit an empty src');
}

// --- 4. Branding: canonical shell + hosted wordmark, no legacy logo stack
for (const key of ['orderEmail', 'restockEmail']) {
  mustMatch(key, /renderEmailShell/, 'template must use the canonical shared shell');
  mustNotMatch(key, /Didot|Bodoni|Baskerville/, 'legacy custom-font wordmark must be gone');
}
mustMatch('brand', /cosmoskin-wordmark-email-v1\.png/, 'hosted wordmark asset missing from shell');
mustMatch('brand', /alt="COSMOSKIN"/, 'wordmark alt text missing');
mustMatch('brand', /EMAIL_WORDMARK_WIDTH = 300/, 'wordmark must have explicit non-tracking dimensions');

// --- 5. Preview/test safety: default no-send, allowlist, no fiscal provider
mustMatch('preview', /E4_TEST_EMAIL_ALLOWLIST/, 'test-recipient allowlist missing');
mustMatch('preview', /Refusing to send/, 'preview must refuse un-allowlisted sends');
mustNotMatch('preview', /qnb-create|invoices\/qnb|from ['"][^'"]*qnb/i, 'preview/test tooling must never import the fiscal provider');
mustNotMatch('preview', /selectRows|insertRow|updateRows|supabase\.js/, 'preview tooling must not touch the database');
mustNotMatch('testPdf', /qnb-create|invoices\/qnb|from ['"][^'"]*qnb/i, 'test-invoice tooling must never import the fiscal provider');
mustMatch('testPdf', /TEST BELGESIDIR - MALI DEGERI YOKTUR/, 'test invoice must be visibly watermarked');
mustMatch('testPdf', /TEST-2026-0001/, 'test invoice must use non-production numbering');

// --- 6. Rendered-output audit: build every fixture and scan the HTML
const renderProbe = spawnSync(process.execPath, ['-e', `
  const { buildCommerceEmailHtml } = await import(${JSON.stringify('file://' + join(root, 'functions/api/_lib/order-email.js'))});
  const { renderRestockEmail } = await import(${JSON.stringify('file://' + join(root, 'functions/api/_lib/restock-email.js'))});
  const order = { order_number: 'CS-V', customer_first_name: 'Test', total_amount: 100, currency: 'TRY', order_items: [{ product_name: 'X', quantity: 1, unit_price: 100, line_total: 100, image: '' }] };
  const outputs = [
    buildCommerceEmailHtml({ order, type: 'refund_completed', refund: { amount: 100 }, env: {} }),
    buildCommerceEmailHtml({ order, type: 'invoice_ready', invoice: { id: 'i', invoice_number: 'F', invoice_status: 'issued', pdf_url: 'https://x.example/i.pdf' }, env: {} }),
    buildCommerceEmailHtml({ order, type: 'order_created', env: {} }),
    renderRestockEmail({ productName: 'X', productSlug: 'none', productImage: '', env: {} }).htmlContent
  ];
  const bad = [];
  for (const html of outputs) {
    if (/src="\\/(?!\\/)/.test(html)) bad.push('relative src');
    if (/src="(undefined|null|)"/.test(html)) bad.push('empty/undefined src');
    if (/localhost|pages\\.dev|file:\\/\\//.test(html)) bad.push('unsafe host');
    if (/Didot|Bodoni/.test(html)) bad.push('legacy wordmark font');
    if (!html.includes('cosmoskin-wordmark-email-v1.png')) bad.push('missing canonical wordmark');
  }
  if (bad.length) { console.error('RENDER-AUDIT-FAIL: ' + bad.join(', ')); process.exit(1); }
  console.log('render audit ok');
`], { cwd: root, encoding: 'utf8' });
if (renderProbe.status !== 0) {
  errors.push(`rendered-output audit failed:\n${((renderProbe.stdout || '') + (renderProbe.stderr || '')).trim().slice(0, 500)}`);
}

// --- 7. products.json + protected calculation files untouched
const productsDiff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((productsDiff.stdout || '').trim()) errors.push('products.json is modified — forbidden for E4');
const protectedFiles = [
  'functions/api/create-checkout.js', 'functions/api/coupons/validate.js',
  'functions/api/_lib/product-pricing.js', 'functions/api/_lib/order-pricing-snapshot.js',
  'functions/api/_lib/coupons.js', 'functions/api/_lib/inventory.js',
  'functions/api/invoices/qnb-create.js'
];
const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
for (const file of (dirty.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
  if (protectedFiles.includes(file)) errors.push(`E4 must not modify checkout/refund-calculation/stock/fiscal file: ${file}`);
}

if (errors.length) {
  console.error('COSMOSKIN E4 transactional email/invoice/refund/brand integrity validation FAILED:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('E4 transactional email/invoice/refund/brand integrity validation passed.');
