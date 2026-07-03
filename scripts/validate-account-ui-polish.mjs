import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

function stripMediaQueries(source) {
  return String(source || '').replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, '');
}

const accountJs = read('assets/account-dashboard.js');
const css = read('assets/account-premium.css');
const profileHtml = read('account/profile.html');

const TICKER_MARKERS = [
  'Türkiye Geneli Hızlı Gönderim',
  'Orijinal K-Beauty Seçkisi',
  'Güvenli Ödeme',
  '2.500 TL Üzeri Ücretsiz Kargo'
];

if (!/BATCH2_ACCOUNT_HEADER_PARITY/.test(css)) failures.push('Account header parity guardrail (BATCH2_ACCOUNT_HEADER_PARITY) is missing.');
if (!/header\.account-header/.test(css) || !/letter-spacing:\.42em/.test(css)) failures.push('Account header parity typography guard is missing.');
if (!profileHtml.includes('class="header account-header"')) failures.push('account/profile.html must use header.account-header.');
if (!profileHtml.includes('nav-shell')) failures.push('account/profile.html header must include nav-shell for homepage rhythm.');

for (const marker of TICKER_MARKERS) {
  if (!profileHtml.includes(marker)) failures.push(`Account ticker was modified unexpectedly: missing "${marker}".`);
}
if (!/<div class="announcement"><div class="marquee">/.test(profileHtml)) failures.push('Account ticker/marquee structure was modified unexpectedly.');

const customerFacing = accountJs.replace(/\/checkout\.html/gi, '');
if (/\bCheckout\b/i.test(customerFacing)) failures.push('Customer-facing account UI contains "Checkout".');
if (/Koşullu|KOŞULLU/i.test(accountJs)) failures.push('Account coupon UI contains "Koşullu".');
if (!/stock\.label !== 'Stok kontrolü'/.test(accountJs) || !/hideStock/.test(accountJs)) {
  failures.push('Favorites UI guard for "Stok kontrolü" is missing in productCard().');
}
if (/renderFavorites[\s\S]{0,800}Stok kontrolü/.test(accountJs)) failures.push('"Stok kontrolü" appears in favorites render path.');

if (!/BATCH2_CANONICAL_OVERVIEW/.test(css)) failures.push('Canonical overview layout marker (BATCH2_CANONICAL_OVERVIEW) is missing.');
if (!/BATCH2_CANONICAL_SECURITY/.test(css)) failures.push('Canonical security layout marker (BATCH2_CANONICAL_SECURITY) is missing.');
if (!/BATCH2_BLUE_OUTLINE_GUARDRAIL/.test(css)) failures.push('Blue default outline guardrail (BATCH2_BLUE_OUTLINE_GUARDRAIL) is missing.');
if (!/:focus-visible/.test(css) || !/outline:0/.test(css)) failures.push('Premium focus-visible outline guard is missing.');

if (/cs-overview-hero-grid--final/.test(css) || /cs-overview-hero-grid--final/.test(accountJs)) {
  failures.push('Overview still uses deprecated cs-overview-hero-grid--final layout.');
}

const beforeOverview = stripMediaQueries(css.split('BATCH2_CANONICAL_OVERVIEW')[0] || '');
const afterOverview = css.split('BATCH2_CANONICAL_OVERVIEW')[1] || '';
if (/\.account-page \.cs-stat-grid--six\s*\{[\s\S]*?repeat\(6/.test(beforeOverview)) {
  failures.push('Conflicting overview stat grid definitions exist before BATCH2_CANONICAL_OVERVIEW.');
}
const overviewStatBase = (afterOverview.match(/\.account-page \.cs-stat-grid--six\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/g) || []);
if (overviewStatBase.length !== 1) {
  failures.push(`Overview must have exactly one six-column .cs-stat-grid--six base rule in Batch 2 block (found ${overviewStatBase.length}).`);
}

const beforeSecurity = stripMediaQueries(css.split('BATCH2_CANONICAL_SECURITY')[0] || '');
const afterSecurity = css.split('BATCH2_CANONICAL_SECURITY')[1] || '';
if (/\.account-page \.cs-security-grid\s*\{/.test(beforeSecurity)) {
  failures.push('Conflicting .cs-security-grid base rules exist before BATCH2_CANONICAL_SECURITY.');
}
const securityGridBase = (afterSecurity.match(/\.account-page \.cs-security-grid\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/g) || []);
if (securityGridBase.length !== 1) {
  failures.push(`Security screen must have exactly one canonical .cs-security-grid base rule in Batch 2 block (found ${securityGridBase.length}).`);
}

if (!/writing-mode:horizontal-tb/.test(css)) failures.push('Account cards missing horizontal text guard (writing-mode:horizontal-tb).');
if (/writing-mode:\s*vertical-rl|writing-mode:\s*vertical-lr|word-break:\s*break-all/.test(css)) {
  failures.push('CSS still contains obvious vertical text wrapping risk for account cards.');
}

if (!/cs-overview-modules/.test(accountJs) || !/cs-overview-main-card--minimal/.test(accountJs)) {
  failures.push('Overview render must use minimal cs-overview-modules layout.');
}
if (/İKİ ADIMLI DOĞRULAMA/.test(accountJs)) failures.push('Non-working 2FA placeholder must not appear in security UI.');
if (!/cs-coupon-code/.test(accountJs)) failures.push('Coupon codes must use cs-coupon-code sans class.');

if (failures.length) {
  console.error('COSMOSKIN account UI polish validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log('COSMOSKIN account UI polish validation passed.');
