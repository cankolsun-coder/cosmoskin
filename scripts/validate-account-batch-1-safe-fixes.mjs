import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const requiredFiles = [
  'COSMOSKIN_PROJECT_MEMORY.md',
  'assets/account-dashboard.js',
  'functions/api/account/profile.js',
  'functions/api/account/notifications.js',
  'functions/api/account/summary.js',
  'functions/api/_lib/coupons.js',
  'supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
}

const accountJs = read('assets/account-dashboard.js');
const profileApi = read('functions/api/account/profile.js');
const notificationsApi = read('functions/api/account/notifications.js');
const summaryJs = read('functions/api/account/summary.js');
const couponsLib = read('functions/api/_lib/coupons.js');
const migration = read('supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql');
const memory = read('COSMOSKIN_PROJECT_MEMORY.md');

const customerFacing = accountJs;
const accountWithoutCheckoutHref = customerFacing.replace(/\/checkout\.html/gi, '');
if (/\bCheckout\b/i.test(accountWithoutCheckoutHref)) failures.push('account-dashboard.js: customer-facing Checkout word remains');
if (/\/ödeme ekranı\.html/i.test(customerFacing)) failures.push('account-dashboard.js: broken /ödeme ekranı.html href remains');
if (/Koşullu|KOŞULLU/i.test(customerFacing)) failures.push('account-dashboard.js: Koşullu coupon copy remains');
if (!/\/checkout\.html/.test(customerFacing)) failures.push('account-dashboard.js: checkout.html link missing for Ödeme Ekranı');
if (!/burnsWelcomeCoupon/.test(accountJs) || !/hasSuccessfulOrder/.test(accountJs)) failures.push('WELCOME10 successful-order guard missing');
if (!/isBirthdayCouponEligible/.test(accountJs) || !/isBirthday10Eligible/.test(accountJs)) failures.push('BIRTHDAY10 birthday-date eligibility guard missing');
if (/status:\s*'locked'/.test(accountJs) && /BIRTHDAY10/.test(accountJs)) failures.push('BIRTHDAY10 must not use locked placeholder rows');
if (!/Doğum tarihi bir kez düzeltilebilir/.test(accountJs)) failures.push('Profile birthday correction copy missing');

if (!/birthday_change_count/.test(profileApi)) failures.push('profile.js: birthday_change_count logic missing');
if (!/birth_date_locked/.test(profileApi)) failures.push('profile.js: birth_date_locked enforcement missing');
if (/error\.message/.test(profileApi) && !/kaydedilemedi/.test(profileApi)) failures.push('profile.js: must not surface raw errors to customers');

if (/marketing_sms_opt_in/.test(notificationsApi)) failures.push('notifications.js: marketing_sms_opt_in fallback must be removed');
if (!/notification_preferences/.test(notificationsApi)) failures.push('notifications.js: notification_preferences upsert missing');
if (/notification_preferences_schema_pending/.test(notificationsApi)) failures.push('notifications.js: schema pending warning must not be returned');

if (!/CREATE TABLE IF NOT EXISTS public\.notification_preferences/is.test(migration)) failures.push('migration: CREATE TABLE notification_preferences missing');
if (!/birthday_change_count/.test(migration)) failures.push('migration: birthday_change_count column missing');
if (!/ENABLE ROW LEVEL SECURITY/.test(migration)) failures.push('migration: RLS missing');

if (!/isBirthdayCouponEligible/.test(couponsLib)) failures.push('coupons.js: isBirthdayCouponEligible export missing');
if (/birthday_month_only/.test(couponsLib)) failures.push('coupons.js: birthday_month_only rule must be replaced');
if (!/birthday_date_only/.test(couponsLib)) failures.push('coupons.js: birthday_date_only rule missing');

if (!/birthday_change_count/.test(summaryJs)) failures.push('summary.js: birthday_change_count exposure missing');
if (!/coupon_eligibility/.test(summaryJs)) failures.push('summary.js: coupon_eligibility block missing');
if (/marketing_sms_opt_in/.test(summaryJs)) failures.push('summary.js: marketing_sms_opt_in fallback must be removed');

if (!/Before modifying.*account-dashboard\.js/.test(memory)) failures.push('COSMOSKIN_PROJECT_MEMORY.md: required warning banner missing');

if (failures.length) {
  console.error('COSMOSKIN Batch 1 safe functional fixes validation failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log('COSMOSKIN Batch 1 safe functional fixes validation passed.');
