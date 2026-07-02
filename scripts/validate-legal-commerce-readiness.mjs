#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

const read = (file) => readFileSync(join(root, file), 'utf8');
const has = (file) => existsSync(join(root, file));

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const full = join(root, dir, name);
    const rel = relative(root, full);
    if (statSync(full).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const requiredLegal = [
  'legal/on-bilgilendirme-formu.html',
  'legal/mesafeli-satis-sozlesmesi.html',
  'legal/iade-ve-cayma-politikasi.html',
  'legal/teslimat-ve-kargo.html',
  'legal/kvkk-aydinlatma-metni.html',
  'legal/gizlilik-ve-guvenlik-politikasi.html',
  'legal/cerez-politikasi.html',
  'legal/acik-riza-metni.html',
  'legal/ticari-elektronik-ileti-izni.html',
  'legal/uyelik-sozlesmesi.html',
  'legal/cosmoskin-club-kurallari.html',
  'legal/veri-sahibi-basvuru-formu.html'
];
for (const file of requiredLegal) {
  if (!has(file)) errors.push(`Missing critical legal page: ${file}`);
}

const checkout = has('assets/checkout-flow.js') ? read('assets/checkout-flow.js') : '';
for (const token of [
  'name="legalPreInformation"',
  'name="legalDistanceSales"',
  'name="legalPrivacy"',
  'name="marketingEmailOptIn"',
  '/legal/on-bilgilendirme-formu.html',
  '/legal/mesafeli-satis-sozlesmesi.html',
  '/legal/kvkk-aydinlatma-metni.html',
  '/legal/ticari-elektronik-ileti-izni.html',
  'preliminary_information_accepted',
  'distance_sales_accepted',
  'kvkk_acknowledged',
  'marketing_email_opt_in'
]) {
  if (!checkout.includes(token)) errors.push(`Checkout legal/consent marker missing: ${token}`);
}
if (/if \(!state\.legal\.marketing\)/.test(checkout)) errors.push('Marketing consent appears to be enforced as a required checkout condition.');
if (!checkout.includes('legal-20260702')) errors.push('Checkout legal document version is not aligned to legal-20260702.');

const appJs = has('assets/app.js') ? read('assets/app.js') : '';
const indexHtml = has('index.html') ? read('index.html') : '';
for (const token of ['prefAnalytics', 'prefFunctional', 'prefMarketing', 'analytics_storage', 'ad_storage']) {
  if (!appJs.includes(token) && !indexHtml.includes(token)) errors.push(`Cookie preference marker missing: ${token}`);
}

const redirects = has('_redirects') ? read('_redirects') : '';
for (const line of [
  '/kvkk-aydinlatma.html /legal/kvkk-aydinlatma-metni.html 301',
  '/mesafeli-satis.html /legal/mesafeli-satis-sozlesmesi.html 301',
  '/on-bilgilendirme.html /legal/on-bilgilendirme-formu.html 301',
  '/iade-degisim.html /legal/iade-ve-cayma-politikasi.html 301',
  '/teslimat-kargo.html /legal/teslimat-ve-kargo.html 301'
]) {
  if (!redirects.includes(line)) errors.push(`Missing legacy legal redirect: ${line}`);
}

const sitemap = has('sitemap.xml') ? read('sitemap.xml') : '';
for (const file of requiredLegal) {
  const loc = `https://www.cosmoskin.com.tr/${file}`;
  if (!sitemap.includes(loc)) warnings.push(`Sitemap does not list ${loc}`);
}

const bankLib = has('functions/api/_lib/bank-accounts.js') ? read('functions/api/_lib/bank-accounts.js') : '';
const bankEndpoint = has('functions/api/payment/bank-accounts.js') ? read('functions/api/payment/bank-accounts.js') : '';
const orderEmail = has('functions/api/_lib/order-email.js') ? read('functions/api/_lib/order-email.js') : '';
if (/FALLBACK_BANK_ACCOUNTS|fallbackAccounts\(/.test(bankLib + bankEndpoint + orderEmail)) errors.push('Hardcoded EFT fallback account remains in runtime bank/email code.');
if (/fallback:\s*true|güvenli COSMOSKIN yedeği/i.test(bankEndpoint + orderEmail)) errors.push('Runtime bank endpoint/email still advertises a fallback bank account.');

const scanFiles = [
  ...walk('legal'),
  'checkout.html',
  'index.html',
  'odeme-ve-guvenlik.html',
  'teslimat-kargo.html',
  'iade-degisim.html',
  'cosmoskin-club.html',
  'assets/checkout-flow.js',
  'assets/app.js',
  'assets/cosmoskin-newsletter.js',
  'functions/api/create-checkout.js',
  'functions/api/consents.js',
  'functions/api/newsletter/subscribe.js',
  'functions/api/auth/register.js'
].filter((file, i, arr) => has(file) && arr.indexOf(file) === i);

const forbidden = [
  [/\bTCKN\b/i, 'TCKN acronym should not be surfaced in public/site text.'],
  [/0531\s*217\s*32\s*00/, 'Public phone number remains.'],
  [/example\.com/i, 'example.com placeholder remains.'],
  [/\blorem\b/i, 'lorem placeholder remains.'],
  [/\bdummy\b/i, 'dummy placeholder remains.'],
  [/test firma/i, 'test firma placeholder remains.'],
  [/\bSelect\b/, 'Legacy COSMOSKIN Club tier Select remains.'],
  [/\bSilver\b/, 'Legacy COSMOSKIN Club tier Silver remains.'],
  [/tedavi eder/i, 'Medical claim “tedavi eder” remains.'],
  [/akneyi\s+(geçirir|bitirir)/i, 'Medical/acne cure claim remains.'],
  [/lekeyi\s+(yok eder|siler)/i, 'Absolute spot-removal claim remains.'],
  [/hastalığı\s+tespit eder/i, 'Diagnostic claim remains.'],
  [/klinik olarak kesin/i, 'Absolute clinical claim remains.'],
  [/garantili sonuç/i, 'Guaranteed result claim remains.'],
  [/alerji yapmaz/i, 'Absolute allergy claim remains.'],
  [/yan etkisiz/i, 'Absolute no-side-effect claim remains.']
];

for (const file of scanFiles) {
  const source = read(file);
  for (const [pattern, message] of forbidden) {
    if (pattern.test(source)) errors.push(`${message} File: ${file}`);
  }
  if (/TODO|FIXME/i.test(source)) warnings.push(`Internal TODO/FIXME marker remains in ${file}`);
}

const legalDocs = has('functions/api/_lib/legal-documents.js') ? read('functions/api/_lib/legal-documents.js') : '';
for (const key of ['kvkk-aydinlatma-metni', 'on-bilgilendirme-formu', 'mesafeli-satis-sozlesmesi', 'ticari-elektronik-ileti-izni']) {
  if (!legalDocs.includes(key)) errors.push(`Legal document snapshot registry missing: ${key}`);
}
if (!legalDocs.includes("version: 'legal-20260702'")) errors.push('Legal document snapshot registry version not updated.');

if (errors.length) {
  console.error('COSMOSKIN legal/commerce readiness validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) {
    console.error('Warnings:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log(`COSMOSKIN legal/commerce readiness validation passed: ${requiredLegal.length} legal pages, ${scanFiles.length} scoped files checked.`);
if (warnings.length) {
  console.log('Non-blocking warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
