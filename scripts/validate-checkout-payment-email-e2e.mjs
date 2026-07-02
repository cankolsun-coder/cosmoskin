#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const has = (file) => existsSync(join(root, file));
const read = (file) => readFileSync(join(root, file), 'utf8');
function walk(dir, out = []) {
  if (!has(dir)) return out;
  for (const name of readdirSync(join(root, dir))) {
    const rel = relative(root, join(root, dir, name));
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

for (const file of ['checkout.html', 'cart.html', 'assets/checkout-flow.js', 'functions/api/create-checkout.js', 'functions/api/_lib/order-email.js', 'functions/api/payment/bank-accounts.js', 'functions/api/_lib/bank-accounts.js']) {
  if (!has(file)) errors.push(`Missing E2E critical file: ${file}`);
}

const checkout = has('assets/checkout-flow.js') ? read('assets/checkout-flow.js') : '';
const createCheckout = has('functions/api/create-checkout.js') ? read('functions/api/create-checkout.js') : '';
const orderEmail = has('functions/api/_lib/order-email.js') ? read('functions/api/_lib/order-email.js') : '';
const bankEndpoint = has('functions/api/payment/bank-accounts.js') ? read('functions/api/payment/bank-accounts.js') : '';
const bankLib = has('functions/api/_lib/bank-accounts.js') ? read('functions/api/_lib/bank-accounts.js') : '';
const accountDashboard = has('assets/account-dashboard.js') ? read('assets/account-dashboard.js') : '';

const checkoutMarkers = [
  'name="legalPreInformation"',
  'name="legalDistanceSales"',
  'name="legalPrivacy"',
  'name="marketingEmailOptIn"',
  '/legal/on-bilgilendirme-formu.html',
  '/legal/mesafeli-satis-sozlesmesi.html',
  'payment_method: state.paymentMethod',
  'idempotency_key: state.idempotencyKey',
  'shipping_amount',
  'STANDARD_SHIPPING = Number(cfg.shippingFee || 89)',
  'FREE_SHIPPING = Number(cfg.freeShippingThreshold || 2500)'
];
for (const marker of checkoutMarkers) {
  if (!checkout.includes(marker)) errors.push(`Checkout marker missing: ${marker}`);
}

const apiMarkers = [
  "const PAYMENT_METHODS = new Set(['card', 'bank_transfer'])",
  'const SHIPPING_FEE = 89',
  'const FREE_SHIPPING_LIMIT = 2500',
  'validateCheckoutConsents',
  'preliminary_information_accepted',
  'distance_sales_accepted',
  'kvkk_acknowledged',
  'normalizeCart',
  'validateInventory',
  'reserveInventoryForOrder',
  'getValidatedBankAccounts',
  'BANK_ACCOUNT_NOT_CONFIGURED',
  'BANK_ACCOUNT_UNAVAILABLE',
  'recordOrderLegalConsents',
  'checkout_idempotency_key',
  "payment_status: initialPaymentStatus"
];
for (const marker of apiMarkers) {
  if (!createCheckout.includes(marker)) errors.push(`Create checkout marker missing: ${marker}`);
}

if (/identity_number:\s*customer\.identity_number/.test(createCheckout)) {
  errors.push('Create checkout persists raw customer identity_number for every payment method; card-only persistence guard missing.');
}
if (!/identity_number:\s*paymentMethod === 'card' \? customer\.identity_number : null/.test(createCheckout)) {
  errors.push('Create checkout does not explicitly limit identity_number persistence to card payment.');
}

if (/window\.COSMOSKIN_BANK_TRANSFER|COSMOSKIN_CONFIG\.bankAccounts|checkout\.bankTransfer/.test(checkout)) {
  errors.push('Checkout still reads static bank account fallback from window config. Runtime bank account API must be the only source.');
}
if (!/Havale\/EFT (ödeme )?bilgileri (henüz|şu anda)/.test(checkout) || !checkout.includes('validTurkishIban')) {
  errors.push('Checkout bank transfer fail-closed and IBAN validation markers are missing.');
}
if (!checkout.includes('aria-label="') || !checkout.includes('data-copy-iban data-iban=')) {
  errors.push('Checkout IBAN copy button accessibility/data markers are missing.');
}
if (/ENES CAN KÖLSÜN|Maltepe Çarşı|IBAN yapılandırılıyor/.test(checkout)) {
  errors.push('Checkout UI still contains hardcoded bank/account fallback copy.');
}
if (/T\.C\. Kimlik No', state\.invoice\.identity/.test(checkout)) {
  errors.push('Checkout review appears to render identity number directly.');
}

if (/FALLBACK_BANK_ACCOUNTS|fallbackAccounts\(|fallback:\s*true|güvenli COSMOSKIN yedeği/i.test(bankLib + bankEndpoint + orderEmail)) {
  errors.push('Runtime bank endpoint/email still includes bank account fallback behavior.');
}
if (/TR84\s*0006|TR70\s*0006|TR840006|TR700006/.test(checkout + bankLib + bankEndpoint + orderEmail)) {
  errors.push('Runtime checkout/payment/email code contains hardcoded IBAN.');
}
if (!orderEmail.includes('bankAccountsBlock(bankAccounts, order)') || !orderEmail.includes('bankAccounts = []')) {
  errors.push('Order email helper is not wired to runtime bankAccounts payload for bank transfer emails.');
}
if (!orderEmail.includes('Havale/EFT banka bilgileri bu e-postaya eklenemedi')) {
  errors.push('Order email helper lacks safe no-bank-account fallback warning.');
}
if (/fake takip|tracking no yoksa|Takip No: \$\{shipment\.tracking_number\}/.test(orderEmail) && !orderEmail.includes('if (shipment.tracking_number)')) {
  errors.push('Order email may render fake or unconditional tracking number.');
}

if (!accountDashboard.includes('pending_bank_transfer') || !accountDashboard.includes('awaiting_transfer')) {
  errors.push('Account dashboard order status mapping lacks bank-transfer pending states.');
}

const emailPreviewFiles = walk('email-previews').filter((file) => file.endsWith('.html'));
for (const file of emailPreviewFiles) {
  const source = read(file);
  if (/COSMOSKIN BEAUTY/.test(source)) errors.push(`Email preview contains fixed test customer name: ${file}`);
  if (/TR84\s*0006|TR70\s*0006|TR840006|TR700006/.test(source)) errors.push(`Email preview contains hardcoded IBAN: ${file}`);
  if (/example\.com|test firma|lorem|dummy/i.test(source)) warnings.push(`Preview placeholder-like token found in ${file}`);
}

const paymentPage = has('odeme-ve-guvenlik.html') ? read('odeme-ve-guvenlik.html') : '';
if (/TR84\s*0006|TR70\s*0006|TR840006|TR700006/.test(paymentPage)) {
  errors.push('Payment/security page still publishes static IBAN; checkout should use active runtime bank account source.');
}
if (!paymentPage.includes('aktif sistem kaydından gösterilir')) {
  warnings.push('Payment/security page does not explicitly explain runtime bank account source.');
}

const scopedPublic = ['checkout.html','cart.html','order-tracking.html','odeme-ve-guvenlik.html','assets/checkout-flow.js','functions/api/create-checkout.js','functions/api/_lib/order-email.js','functions/api/payment/bank-accounts.js','functions/api/_lib/bank-accounts.js','functions/api/admin/orders.js'].filter(has);
for (const file of scopedPublic) {
  const source = read(file);
  if (/\bTCKN\b/.test(source)) errors.push(`Public/runtime file surfaces TCKN acronym: ${file}`);
  if (/0531\s*217\s*32\s*00/.test(source)) errors.push(`Public/runtime file contains phone number: ${file}`);
  if (/COSMOSKIN BEAUTY/.test(source)) errors.push(`Runtime file contains fixed customer name: ${file}`);
  if (/example\.com|test firma|lorem|dummy/i.test(source)) warnings.push(`Placeholder-like token found in ${file}`);
}

const adminOrders = has('functions/api/admin/orders.js') ? read('functions/api/admin/orders.js') : '';
for (const marker of ['mark_payment_paid', 'payment_confirmed_manual', 'mark_preparing', 'shipment_created', 'shipment_delivered', 'releaseInventoryReservations', 'convertInventoryReservations']) {
  if (!adminOrders.includes(marker)) warnings.push(`Admin order flow marker not found: ${marker}`);
}
if (!adminOrders.includes('assertAdmin')) errors.push('Admin orders endpoint is missing assertAdmin guard.');

const knownStatusMarkers = ['pending_payment', 'pending_bank_transfer', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'payment_failed', 'awaiting_transfer'];
for (const marker of knownStatusMarkers) {
  if (!(createCheckout + accountDashboard + adminOrders).includes(marker)) warnings.push(`Status marker not found in E2E scoped code: ${marker}`);
}

if (errors.length) {
  console.error('COSMOSKIN checkout/payment/email E2E validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) {
    console.error('Warnings:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log(`COSMOSKIN checkout/payment/email E2E validation passed: ${scopedPublic.length} scoped runtime files, ${emailPreviewFiles.length} email previews checked.`);
if (warnings.length) {
  console.log('Non-blocking warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
