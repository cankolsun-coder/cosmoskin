#!/usr/bin/env node
// UX4 — Account profile/preferences premium redesign + consent data-loss guard.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const files = {
  profileApi: 'functions/api/account/profile.js',
  notificationsApi: 'functions/api/account/notifications.js',
  dashboard: 'assets/account-dashboard.js',
  accountCss: 'assets/account-premium.css',
  tests: 'tests/local-integration.test.mjs'
};
for (const rel of Object.values(files)) {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
}
if (errors.length) {
  console.error('UX4 validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const profileApi = read(files.profileApi);
const notificationsApi = read(files.notificationsApi);
const dashboard = read(files.dashboard);
const accountCss = read(files.accountCss);
const tests = read(files.tests);

function mustInclude(src, rel, needle, why = '') {
  if (!src.includes(needle)) errors.push(`${rel} missing required marker: ${needle}${why ? ` (${why})` : ''}`);
}
function mustMatch(src, rel, regex, why = '') {
  if (!regex.test(src)) errors.push(`${rel} missing required pattern ${regex}${why ? ` (${why})` : ''}`);
}
function mustNotMatch(src, rel, regex, why = '') {
  const m = src.match(regex);
  if (m) errors.push(`${rel} forbidden pattern ${regex} → "${String(m[0]).slice(0, 90)}"${why ? ` (${why})` : ''}`);
}

// --- 1. Profile PATCH must preserve omitted opt-ins and metadata
mustInclude(profileApi, files.profileApi, 'function hasOwn(', 'partial update guard');
mustInclude(profileApi, files.profileApi, 'OPT_IN_FIELDS', 'opt-in whitelist');
mustMatch(profileApi, files.profileApi, /if \(hasOwn\(body, field\)\)/, 'opt-ins only change when explicitly provided');
mustMatch(profileApi, files.profileApi, /payload\[field\] = Boolean\(existing\[field\]\)/, 'preserve existing opt-ins');
mustMatch(profileApi, files.profileApi, /mergeMetadata\(existing\?\.metadata, body\.metadata\)/, 'metadata merge when provided');
mustMatch(profileApi, files.profileApi, /payload\.metadata = existing\.metadata/, 'metadata preserved when omitted');
mustNotMatch(profileApi, files.profileApi, /normalizeBool\(body\.marketing_email_opt_in\)/, 'old full-row bool coercion must be gone');
mustNotMatch(profileApi, files.profileApi, /metadata: body\.metadata && typeof body\.metadata === 'object' \? body\.metadata : \{\}/, 'metadata must not reset to {} when omitted');
mustInclude(profileApi, files.profileApi, 'isValidBirthdayDate', 'birthday validation');

// --- 2. Frontend saveProfile sends partial profile fields only
mustMatch(dashboard, files.dashboard, /apiFetch\('\/account\/profile', \{ method:'PATCH', body:payload \}\)/, 'profile save path');
mustNotMatch(dashboard, files.dashboard, /saveProfile[\s\S]{0,500}marketing_email_opt_in/, 'saveProfile must not send marketing opt-in');
mustNotMatch(dashboard, files.dashboard, /saveProfile[\s\S]{0,500}newsletter_opt_in/, 'saveProfile must not send newsletter opt-in');
mustMatch(dashboard, files.dashboard, /first_name:[\s\S]{0,120}last_name:[\s\S]{0,120}phone:/, 'saveProfile sends identity fields only');
mustMatch(dashboard, files.dashboard, /birthdayValue > todayIsoDate\(\)/, 'client future birthday guard');

// --- 3. Premium toggle UI (not plain checkbox labels)
mustInclude(dashboard, files.dashboard, 'function premiumToggleHtml', 'premium toggle renderer');
mustInclude(dashboard, files.dashboard, 'cs-premium-toggle', 'premium toggle class');
mustInclude(dashboard, files.dashboard, 'cs-premium-toggle__track', 'animated track');
mustInclude(dashboard, files.dashboard, 'cs-toggle-grid--premium', 'premium toggle grid');
mustMatch(accountCss, files.accountCss, /\.cs-premium-toggle\.is-on \.cs-premium-toggle__thumb\{[^}]*transform:translateX/, 'toggle animation');
mustMatch(accountCss, files.accountCss, /prefers-reduced-motion:reduce/, 'reduced motion safety');

// --- 4. Notifications partial merge
mustInclude(notificationsApi, files.notificationsApi, 'function hasOwn(', 'preference partial merge');
mustMatch(notificationsApi, files.notificationsApi, /normalizePreferences\(body, profileRows\?\.\[0\] \|\| \{\}, existingPrefs\)/, 'merge with existing prefs');

// --- 5. Account header UX3B parity preserved
mustMatch(accountCss, files.accountCss, /\.account-page \.header\.account-header\{[\s\S]{0,400}height:74px/, 'account header 74px parity');
mustMatch(accountCss, files.accountCss, /account-header \.brand \.brand-logo\{[^}]*width:46px[^}]*height:46px/, 'logo 46px parity');
mustNotMatch(accountCss, files.accountCss, /\.account-page \.header\.account-header\{[\s\S]{0,400}height:80px/, '80px header regression');

// --- 6. Membership tier names safety
mustNotMatch(dashboard, files.dashboard, /\bSelect\b/, 'forbidden tier name Select');
mustNotMatch(dashboard, files.dashboard, /\bSilver\b/, 'forbidden tier name Silver');
mustInclude(dashboard, files.dashboard, "name:'Essential'", 'Essential tier');
mustInclude(dashboard, files.dashboard, "name:'Signature'", 'Signature tier');
mustInclude(dashboard, files.dashboard, "name:'Elite'", 'Elite tier');

// --- 7. Responsive grid / overflow guards
mustInclude(accountCss, files.accountCss, 'cs-overview-grid--ux4', 'overview responsive grid');
mustMatch(accountCss, files.accountCss, /cs-overview-module[\s\S]{0,80}min-width:0/, 'overview module min-width guard');
mustMatch(accountCss, files.accountCss, /cs-profile-completion[\s\S]{0,200}min-width:0/, 'profile completion clamp');
mustMatch(accountCss, files.accountCss, /cs-premium-toggle[\s\S]{0,120}min-width:0/, 'toggle min-width guard');

// --- 8. Birthday locked/validation UI
mustInclude(dashboard, files.dashboard, 'cs-field--birthday', 'birthday field wrapper');
mustInclude(dashboard, files.dashboard, 'profileBirthdayHelp', 'birthday helper copy');
mustInclude(dashboard, files.dashboard, 'cs-field-lock', 'locked state badge');

// --- 9. UX4 tests present
mustMatch(tests, files.tests, /UX4:/, 'UX4 integration tests');

// --- 10. products.json + protected commerce/admin files untouched
const productsDiff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((productsDiff.stdout || '').trim()) errors.push('products.json is modified — forbidden for UX4');
const protectedFiles = [
  'functions/api/create-checkout.js', 'functions/api/coupons/validate.js',
  'functions/api/_lib/product-pricing.js', 'functions/api/_lib/order-pricing-snapshot.js',
  'functions/api/_lib/coupons.js', 'functions/api/_lib/inventory.js',
  'functions/api/admin/refunds.js', 'assets/checkout-flow.js', 'assets/coupon-client.js',
  'assets/cart-commerce.js', 'assets/inventory-client.js', 'assets/price-display.js',
  'functions/api/_lib/admin.js', 'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js', 'assets/admin-runtime.js',
  'functions/api/admin/products.js'
];
const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
for (const file of (dirty.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
  if (protectedFiles.includes(file)) errors.push(`UX4 must not modify commerce/admin-critical file: ${file}`);
}

// --- 11. Regression validators (fast chain; P1E4/C3/C4/I2/production-launch run separately in Section 18)
for (const script of [
  'scripts/validate-ux3b-storefront-polish-hotfix.mjs',
  'scripts/validate-ux3-minicart-premium-layout-hardening.mjs',
  'scripts/validate-hf1-runtime-commerce-hotfix.mjs',
  'scripts/validate-p1e3-storefront-sale-display.mjs'
]) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) {
    errors.push(`${script} failed:\n${((result.stdout || '') + (result.stderr || '')).trim().slice(0, 400)}`);
  }
}

if (errors.length) {
  console.error('COSMOSKIN UX4 account profile/preferences premium consent validation FAILED:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('UX4 account profile/preferences premium consent validation passed.');
