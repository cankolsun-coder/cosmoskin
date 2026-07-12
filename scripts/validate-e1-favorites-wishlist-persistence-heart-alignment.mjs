#!/usr/bin/env node
// E1 — Favorites / wishlist persistence + heart icon alignment.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const files = {
  favoritesApi: 'functions/api/account/favorites.js',
  favoritesStore: 'assets/favorites-store.js',
  app: 'assets/app.js',
  accountDashboard: 'assets/account-dashboard.js',
  favoritesPage: 'favorites.html',
  style: 'assets/style.css',
  tests: 'tests/local-integration.test.mjs'
};

for (const rel of Object.values(files)) {
  if (!existsSync(join(root, rel))) errors.push(`Missing required file: ${rel}`);
}
if (errors.length) {
  console.error('E1 validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const favoritesApi = read(files.favoritesApi);
const favoritesStore = read(files.favoritesStore);
const app = read(files.app);
const accountDashboard = read(files.accountDashboard);
const favoritesPage = read(files.favoritesPage);
const style = read(files.style);
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

// API idempotent add/remove + canonical slug
mustInclude(favoritesApi, files.favoritesApi, 'favorite_slugs', 'GET structured slugs');
mustMatch(favoritesApi, files.favoritesApi, /action:\s*removedCount\s*\?\s*'removed'\s*:\s*'missing'/, 'DELETE structured action');
mustMatch(favoritesApi, files.favoritesApi, /removed:\s*removedCount\s*>\s*0/, 'DELETE idempotent removed flag');
mustInclude(favoritesApi, files.favoritesApi, 'changed_slug', 'structured changed_slug');
mustMatch(favoritesApi, files.favoritesApi, /product_slug:\s*`eq\.\$\{favorite\.product_slug\}/, 'canonical product_slug filter');
mustNotMatch(favoritesApi, files.favoritesApi, /status:\s*404[\s\S]{0,80}Favori bulunamadı/, 'DELETE should not hard-fail missing favorite');

// Store: DB authoritative, no unsafe merge, metadata migration once
mustInclude(favoritesStore, files.favoritesStore, 'COSMOSKINFavorites', 'canonical store export');
mustInclude(favoritesStore, files.favoritesStore, 'scrubMetadataFavorites', 'metadata deprecation');
mustInclude(favoritesStore, files.favoritesStore, 'mergeGuestFavoritesOnce', 'one-time guest merge');
mustNotMatch(favoritesStore, files.favoritesStore, /\.concat\(remote/, 'unsafe local ∪ remote merge');
mustNotMatch(favoritesStore, files.favoritesStore, /user_metadata\?\.favorites[\s\S]{0,120}resolvedFavorites/, 'metadata must not drive ongoing hydration');

// app.js must delegate to store, no N+1 metadata sync
mustInclude(app, files.app, 'favorites-store.js', 'store loader');
mustInclude(app, files.app, 'COSMOSKINFavorites', 'store integration');
mustNotMatch(app, files.app, /saveFavoritesToAccount/, 'N+1 metadata batch sync removed');
mustNotMatch(app, files.app, /localFavorites\.concat\(remoteFavorites\)/, 'unsafe hydrate merge removed');
mustMatch(app, files.app, /event\.stopPropagation\(\)/, 'heart click propagation guard');
mustMatch(app, files.app, /aria-pressed/, 'aria-pressed on favorite buttons');
mustMatch(app, files.app, /Favorilerden kaldır/, 'accessible remove label');
mustMatch(app, files.app, /Favorilere ekle/, 'accessible add label');

// Account dashboard: logged-in DB authoritative
mustNotMatch(accountDashboard, files.accountDashboard, /state\.summary\.favorites\)\.concat\(local/, 'account favorites must not merge local when authenticated');
mustMatch(accountDashboard, files.accountDashboard, /if \(state\.authenticated\)/, 'authenticated favorites branch');
mustMatch(accountDashboard, files.accountDashboard, /Favorilerin henüz boş/, 'premium empty copy');

// Favorites page
mustMatch(favoritesPage, files.favoritesPage, /favorites-empty-state/, 'favorites empty state class');
mustMatch(favoritesPage, files.favoritesPage, /Favorilerin henüz boş/, 'favorites empty copy');
mustInclude(favoritesPage, files.favoritesPage, 'favorites-store.js', 'store on favorites page');

// Heart CSS centering + touch guard, no duplicate canonical blocks
mustMatch(style, files.style, /\.favorite-btn-icon\s*\{[^}]*place-items:\s*center/, 'icon optical centering');
mustMatch(style, files.style, /\.favorite-btn:focus-visible/, 'focus visible state');
mustMatch(style, files.style, /min-width:\s*44px[\s\S]{0,80}min-height:\s*44px/, 'mobile touch target');
const favoriteBtnBlocks = (style.match(/^\.favorite-btn\s*\{/gm) || []).length;
if (favoriteBtnBlocks > 2) errors.push(`${files.style} has ${favoriteBtnBlocks} duplicate .favorite-btn blocks (max 2 allowed: base + media)`);

// Tests present
mustMatch(tests, files.tests, /test\('E1:/, 'E1 integration tests');

// Protected scope
const productsDiff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'products.json'], { cwd: root, encoding: 'utf8' });
if ((productsDiff.stdout || '').trim()) errors.push('products.json must not be modified by E1');

const protectedFiles = [
  'functions/api/create-checkout.js',
  'functions/api/_lib/product-pricing.js',
  'functions/api/coupons/validate.js',
  'functions/api/_lib/inventory.js',
  'functions/api/admin/products/[slug]/price.js',
  'functions/api/_lib/refund-allocation.js'
];
const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
for (const file of (dirty.stdout || '').trim().split('\n').filter(Boolean)) {
  if (protectedFiles.includes(file)) errors.push(`E1 must not modify protected file: ${file}`);
}

mustMatch(favoritesPage, files.favoritesPage, /cs-product-card/, 'UX2 frame class on favorites cards');

// Regression fast chain (UX2/C3 deep chains run in Section 16 integration tests)
for (const script of [
  'scripts/validate-p1e3-storefront-sale-display.mjs',
  'scripts/validate-ux3-minicart-premium-layout-hardening.mjs',
  'scripts/validate-ux3b-storefront-polish-hotfix.mjs'
]) {
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) {
    errors.push(`${script} failed:\n${((result.stdout || '') + (result.stderr || '')).trim().slice(0, 400)}`);
  }
}

if (errors.length) {
  console.error('COSMOSKIN E1 favorites/wishlist persistence heart alignment validation FAILED:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('COSMOSKIN E1 favorites/wishlist persistence heart alignment validation passed.');
