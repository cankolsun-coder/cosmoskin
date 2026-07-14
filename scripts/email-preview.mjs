#!/usr/bin/env node
// E4 — Transactional email preview/test tool (safe by default).
//
//   node scripts/email-preview.mjs                 # render all previews to ./email-previews/
//   node scripts/email-preview.mjs --list          # list preview names
//   node scripts/email-preview.mjs --only refund_partial
//   node scripts/email-preview.mjs --send-to you@example.com --only invoice_ready
//
// Sending is OFF by default. --send-to requires BOTH:
//   1. BREVO_API_KEY in the environment, and
//   2. the recipient to be present in E4_TEST_EMAIL_ALLOWLIST (comma-separated).
// Production customer addresses can never be selected accidentally: there is
// no order/customer lookup here — only the fixtures below.
// This tool NEVER touches the database and NEVER calls any fiscal provider
// (no fiscal-integration imports — enforced by the E4 validator).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'email-previews');

const { buildCommerceEmailHtml, buildCommerceText } = await import(join(root, 'functions/api/_lib/order-email.js'));
const { renderRestockEmail } = await import(join(root, 'functions/api/_lib/restock-email.js'));

const env = {}; // canonical production origin defaults apply; no secrets needed to render

// ---------------------------------------------------------------------------
// Fixtures (Section 11): regular product, sale/compare-at product, long name,
// missing-image fallback, multi-item order, Turkish characters.
// ---------------------------------------------------------------------------
const FIXTURE_ITEMS = [
  { product_slug: 'anua-heartleaf-77-soothing-toner', product_name: 'Heartleaf 77% Soothing Toner', brand: 'Anua', quantity: 2, unit_price: 849, line_total: 1698, image: '/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp' },
  { product_slug: 'beauty-of-joseon-relief-sun-spf50', product_name: 'Relief Sun: Rice + Probiotics SPF 50+ PA++++ Güneş Koruyucu — Çok Uzun Ürün Adı Sarma Testi', brand: 'Beauty of Joseon', quantity: 1, unit_price: 899, line_total: 899, image: '/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp' },
  { product_slug: 'missing-image-fixture', product_name: 'Görseli Eksik Ürün (Fallback Testi)', brand: 'COSMOSKIN', quantity: 1, unit_price: 500, line_total: 500, image: '' }
];

const FIXTURE_ORDER = {
  id: '00000000-0000-4000-8000-00000000e401',
  order_number: 'CS-TEST-E4-001',
  customer_first_name: 'Şükran',
  customer_last_name: 'Çağlayan',
  customer_email: 'test-fixture@cosmoskin.invalid',
  currency: 'TRY',
  subtotal_amount: 3097,
  shipping_amount: 0,
  vat_amount: 516.17,
  total_amount: 3097,
  payment_provider: 'bank_transfer',
  order_items: FIXTURE_ITEMS
};

const TEST_INVOICE = {
  id: '00000000-0000-4000-8000-00000000e402',
  order_id: FIXTURE_ORDER.id,
  invoice_number: 'TEST-2026-0001',
  invoice_status: 'issued',
  // Test artifact only — visibly watermarked, non-fiscal (see the E4 invoice
  // test runbook). Never a QNB/e-invoice production document.
  pdf_url: 'https://www.cosmoskin.com.tr/email-previews/TEST-INVOICE-MALI-DEGERI-YOKTUR.pdf',
  issued_at: '2026-07-14T09:00:00Z',
  metadata: { test: true, note: 'TEST BELGESİDİR — MALİ DEĞERİ YOKTUR' }
};

const SALE_PRICING_FIXTURE = {
  effective_price_try: 679,
  effective_currency: 'TRY',
  compare_at_price_try: 849,
  sale_active: true,
  price: 679
};

const PREVIEWS = {
  order_confirmation: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'order_created', env }),
  bank_transfer_pending: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'bank_transfer_pending', env, bankAccounts: [{ bankName: 'Test Bankası A.Ş.', accountName: 'COSMOSKIN Test', iban: 'TR00 0000 0000 0000 0000 0000 00' }] }),
  shipment: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'shipment_created', env, shipment: { carrier_name: 'DHL', tracking_number: 'TEST123456', tracking_url: 'https://www.dhl.com/tr-tr/home/tracking.html?tracking-id=TEST123456' } }),
  delivery: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'shipment_delivered', env }),
  refund_full: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'refund_completed', env, refund: { id: 'refund-full-fixture', amount: 3097, currency: 'TRY', provider: 'bank_transfer', provider_reference: 'TEST-REF-FULL-1' } }),
  refund_partial: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'refund_completed', env, refund: { id: 'refund-partial-fixture', amount: 899, currency: 'TRY', provider: 'iyzico', provider_reference: 'TEST-REF-PART-1' } }),
  invoice_ready: () => buildCommerceEmailHtml({ order: FIXTURE_ORDER, type: 'invoice_ready', env, invoice: TEST_INVOICE }),
  back_in_stock: () => renderRestockEmail({ productName: 'Heartleaf 77% Soothing Toner', productSlug: 'anua-heartleaf-77-soothing-toner', productImage: '/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp', pricing: SALE_PRICING_FIXTURE, env }).htmlContent,
  back_in_stock_no_image: () => renderRestockEmail({ productName: 'Görseli Eksik Ürün (Fallback Testi)', productSlug: 'missing-image-fixture', productImage: '', pricing: null, env }).htmlContent
};

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] || true);
};

if (args.includes('--list')) {
  console.log(Object.keys(PREVIEWS).join('\n'));
  process.exit(0);
}

const only = flag('--only');
const names = only ? [only] : Object.keys(PREVIEWS);
mkdirSync(outDir, { recursive: true });
const written = [];
for (const name of names) {
  if (!PREVIEWS[name]) {
    console.error(`Unknown preview: ${name}. Use --list.`);
    process.exit(1);
  }
  const html = PREVIEWS[name]();
  const file = join(outDir, `${name}.html`);
  writeFileSync(file, html);
  written.push(file);
  console.log(`rendered ${name} -> email-previews/${name}.html`);
}

// ---------------------------------------------------------------------------
// Optional explicit test send — allowlist-gated, single recipient, no lookup.
// ---------------------------------------------------------------------------
const sendTo = flag('--send-to');
if (sendTo && sendTo !== true) {
  const allowlist = String(process.env.E4_TEST_EMAIL_ALLOWLIST || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const recipient = String(sendTo).trim().toLowerCase();
  if (!process.env.BREVO_API_KEY) {
    console.error('Refusing to send: BREVO_API_KEY is not set.');
    process.exit(1);
  }
  if (!allowlist.includes(recipient)) {
    console.error(`Refusing to send: ${recipient} is not in E4_TEST_EMAIL_ALLOWLIST.`);
    process.exit(1);
  }
  if (names.length !== 1) {
    console.error('Refusing to send: pass exactly one preview with --only when using --send-to.');
    process.exit(1);
  }
  const html = PREVIEWS[names[0]]();
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.ORDER_FROM_EMAIL || 'no-reply@cosmoskin.com.tr', name: 'COSMOSKIN TEST' },
      to: [{ email: recipient }],
      subject: `[TEST] COSMOSKIN e-posta önizlemesi — ${names[0]}`,
      htmlContent: html
    })
  });
  console.log(`test send to ${recipient}: HTTP ${response.status}`);
  if (!response.ok) process.exit(1);
}
