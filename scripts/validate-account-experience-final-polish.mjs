import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mustExist = [
  'account/profile.html',
  'assets/account-dashboard.js',
  'assets/account-premium.css',
  'functions/api/account/summary.js',
  'functions/api/account/profile.js',
  'functions/api/account/notifications.js',
  'functions/api/contact.js',
  'supabase/migrations/20260703_account_experience_final_polish.sql'
];
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
for (const file of mustExist) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
}
const accountJs = read('assets/account-dashboard.js');
const css = read('assets/account-premium.css');
const profileHtml = read('account/profile.html');
const summaryJs = read('functions/api/account/summary.js');
const profileApi = read('functions/api/account/profile.js');
const notificationsApi = read('functions/api/account/notifications.js');
const contactApi = read('functions/api/contact.js');

const customerFacing = [
  ['account/profile.html', profileHtml],
  ['assets/account-dashboard.js', accountJs]
];
for (const [file, text] of customerFacing) {
  const withoutCheckoutHref = text.replace(/\/checkout\.html/gi, '');
  if (/\bCheckout\b/i.test(withoutCheckoutHref)) failures.push(`${file}: customer-facing Checkout copy remains`);
  if (/\b(Essantial|Silver)\b|Select Üye/.test(text)) failures.push(`${file}: old/incorrect Club tier copy remains`);
  if (/İade\s*\/\s*Değişim|değişim/i.test(text)) failures.push(`${file}: customer-facing değişim copy remains`);
  if (/\/ödeme ekranı\.html/i.test(text)) failures.push(`${file}: broken ödeme ekranı.html href remains`);
  if (/Koşullu|KOŞULLU/i.test(text)) failures.push(`${file}: Koşullu coupon copy remains`);
}
if (!/\/checkout\.html/.test(accountJs)) failures.push('Coupons tab must link to /checkout.html for Ödeme Ekranı.');
if (!/ödeme ekranında manuel|Ödeme ekranında manuel/.test(accountJs)) failures.push('Coupon copy does not use Ödeme ekranında manuel wording.');
if (!/hasSuccessfulOrder/.test(accountJs) || !/WELCOME10/.test(accountJs) || !/burnsWelcomeCoupon/.test(accountJs)) failures.push('WELCOME10 eligibility guard missing.');
if (!/isBirthday10Eligible/.test(accountJs) || !/isBirthdayCouponEligible/.test(accountJs)) failures.push('BIRTHDAY10 birthday-date eligibility guard missing.');
if (!/product_spend_total/.test(summaryJs) || !/shipping_amount/.test(summaryJs) || !/orderProductNetAmount/.test(summaryJs)) failures.push('Loyalty shipping exclusion logic missing in account summary.');
if (!/finiteNumber/.test(accountJs) || !/reversed/.test(accountJs)) failures.push('NaN-safe Club point rendering guard missing.');
if (!/birthday/.test(profileApi) || !/birth_date_locked/.test(profileApi) || !/birthday_change_count/.test(profileApi) || !/birthday/.test(accountJs)) failures.push('Birth date profile flow missing.');
if (/marketing_sms_opt_in/.test(notificationsApi)) failures.push('notifications API must not write marketing_sms_opt_in fallback.');
if (!/campaign_emails/.test(notificationsApi) || !/newsletter/.test(notificationsApi) || !/notificationSaveStatus/.test(accountJs)) failures.push('Notification/Journal persistence and UI state missing.');
if (!/String\(values\.company \|\| ''\)\.trim\(\)/.test(contactApi)) failures.push('Contact partnership form is not undefined-safe.');
if (!/cs-loyalty-summary--essential/.test(css) || !/cs-loyalty-summary--signature/.test(css) || !/cs-loyalty-summary--elite/.test(css)) failures.push('Club tier hero theme CSS missing.');
if (/cs-loyalty-watermark"><img src="\/assets\/logo-mark/.test(accountJs)) failures.push('Decorative CS logo remains in Club mini card.');
if (!/cs-overview-main-card--minimal/.test(accountJs) || !/cs-overview-modules/.test(accountJs) || !/BATCH2_CANONICAL_OVERVIEW/.test(css)) failures.push('Final overview minimal layout guard missing.');
if (!/focus-visible/.test(css) || !/outline:0/.test(css)) failures.push('Premium focus/blue outline guard missing.');
if (!/header\.account-header/.test(css) || !/letter-spacing:\.42em/.test(css) || !/BATCH2_ACCOUNT_HEADER_PARITY/.test(css)) failures.push('Account header parity guard missing.');
if (!/cs-security-grid/.test(css) || !/writing-mode:horizontal-tb/.test(css)) failures.push('Security/orders overflow guard missing.');
if (!/data-remove-favorite-slug/.test(accountJs) || !/uniqueFavoriteList/.test(accountJs)) failures.push('Favorites slug/UUID guard missing.');
if (failures.length) {
  console.error('COSMOSKIN account experience final polish validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log('COSMOSKIN account experience final polish validation passed.');
