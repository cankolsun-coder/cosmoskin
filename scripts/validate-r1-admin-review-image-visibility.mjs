#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const has = (rel) => existsSync(join(root, rel));

function mustExist(rel) {
  if (!has(rel)) errors.push(`Missing required file: ${rel}`);
}
function mustInclude(src, rel, marker) {
  if (!src.includes(marker)) errors.push(`${rel} missing required marker: ${marker}`);
}
function mustMatch(src, rel, regex, label) {
  if (!regex.test(src)) errors.push(`${rel} missing required pattern: ${label || regex}`);
}
function mustNotInclude(src, rel, marker) {
  if (src.includes(marker)) errors.push(`${rel} must not include forbidden marker: ${marker}`);
}
function runValidator(script) {
  if (!has(script)) {
    errors.push(`Missing regression validator: ${script}`);
    return;
  }
  const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${script} failed:\n${result.stdout || ''}${result.stderr || ''}`.trim());
  }
}

const pdpReviews = 'js/reviews.js';
const reviewsApi = 'functions/api/reviews/[[path]].js';
const adminReviews = 'admin/reviews/index.html';
const tests = 'tests/local-integration.test.mjs';

for (const rel of [pdpReviews, reviewsApi, adminReviews, tests]) mustExist(rel);

if (errors.length) {
  console.error('COSMOSKIN R1 admin review image visibility validation failed (missing files):');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const pdpSrc = read(pdpReviews);
const apiSrc = read(reviewsApi);
const adminSrc = read(adminReviews);
const testsSrc = read(tests);

// Production PDP path must use the working multipart endpoint and never the retired registration endpoint.
mustNotInclude(pdpSrc, pdpReviews, '/reviews/images');
mustInclude(pdpSrc, pdpReviews, '/reviews/${encodeURIComponent(reviewId)}/images');
mustInclude(pdpSrc, pdpReviews, 'new FormData()');
mustInclude(pdpSrc, pdpReviews, 'form.append(\'image\'');
mustInclude(pdpSrc, pdpReviews, 'Yorumunuz kaydedildi ancak görsel yüklenemedi.');
mustInclude(pdpSrc, pdpReviews, 'Görsel yüklenemedi. Lütfen tekrar deneyin.');
mustInclude(pdpSrc, pdpReviews, 'Görsel boyutu çok büyük.');
mustInclude(pdpSrc, pdpReviews, 'Desteklenmeyen görsel formatı.');
mustNotInclude(pdpSrc, pdpReviews, 'sb.storage.from');

// API must keep the retired JSON image endpoint disabled and avoid trusting raw image paths on create/update.
mustInclude(apiSrc, reviewsApi, "if (parts[0] === 'images')");
mustInclude(apiSrc, reviewsApi, 'status: 410');
mustMatch(apiSrc, reviewsApi, /function sanitizeReviewPayload[\s\S]*images:\s*\[\]/, 'sanitizeReviewPayload keeps client images empty');
mustInclude(apiSrc, reviewsApi, 'uploadReviewPhoto(context, parts[0])');
mustInclude(apiSrc, reviewsApi, 'review_ownership_mismatch');
mustInclude(apiSrc, reviewsApi, 'detectImageType');
mustInclude(apiSrc, reviewsApi, 'isBlobLikeUploadPart');
mustInclude(apiSrc, reviewsApi, "select: REVIEW_SELECT_WITH_IMAGES");
mustInclude(apiSrc, reviewsApi, 'storage_path,public_url');
mustInclude(apiSrc, reviewsApi, 'signed_url');
mustInclude(apiSrc, reviewsApi, 'thumbnail_url');
mustInclude(apiSrc, reviewsApi, 'filename');
mustInclude(apiSrc, reviewsApi, 'mime_type');
mustInclude(apiSrc, reviewsApi, 'size_bytes');
mustInclude(apiSrc, reviewsApi, 'publicReviewImageUrl');
mustInclude(apiSrc, reviewsApi, 'Görsel boyutu çok büyük.');
mustInclude(apiSrc, reviewsApi, 'Desteklenmeyen görsel formatı.');
mustInclude(apiSrc, reviewsApi, 'Görsel yüklenemedi. Lütfen tekrar deneyin.');

// Admin UI must render thumbnails with fallback and not expose raw storage paths as the primary image src.
mustInclude(adminSrc, adminReviews, 'renderImageCard');
mustInclude(adminSrc, adminReviews, 'imagePreviewUrl');
mustInclude(adminSrc, adminReviews, 'image.signed_url || image.thumbnail_url || image.public_url || image.url');
mustInclude(adminSrc, adminReviews, 'Görsel yüklenemedi');
mustInclude(adminSrc, adminReviews, 'openLightbox(previewUrl');
mustNotInclude(adminSrc, adminReviews, 'image.storage_path');

// Storage bucket/policy configuration must remain unchanged by R1.
for (const sqlFile of ['supabase/phase51_reviews_hardening.sql', 'supabase/schema.sql']) {
  if (!has(sqlFile)) continue;
  const sql = read(sqlFile);
  if (sqlFile.endsWith('phase51_reviews_hardening.sql')) {
    mustInclude(sql, sqlFile, "VALUES ('review-images', 'review-images', TRUE, 2097152");
    mustInclude(sql, sqlFile, "bucket_id = 'review-images'");
  }
  mustNotInclude(sql, sqlFile, "bucket_id = 'review-images' AND TRUE");
  mustNotInclude(sql, sqlFile, "bucket_id = 'review-images' OR TRUE");
}

// Regression tests added.
mustInclude(testsSrc, tests, "test('R1: PDP review image path uses multipart per-review upload");
mustInclude(testsSrc, tests, "test('R1: uploadReviewPhoto attaches image only to owner review");
mustInclude(testsSrc, tests, "test('R1: admin reviews API returns normalized image objects");

// Scope guard: R1 must not edit protected or unrelated domains.
const protectedFiles = [
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'assets/admin-runtime.js',
  'assets/admin-runtime.css',
  'functions/api/create-checkout.js',
  'functions/api/_lib/inventory.js',
  'functions/api/_lib/coupons.js',
  'functions/api/admin/coupons/index.js',
  'functions/api/_lib/order-pricing-snapshot.js',
  'functions/api/admin/refunds.js',
  'functions/api/_lib/bank-accounts.js',
  'functions/api/_lib/order-email.js'
];
const diffResult = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', ...protectedFiles], { cwd: root, encoding: 'utf8' });
if ((diffResult.stdout || '').trim()) {
  errors.push(`R1 scope violation: protected/unrelated files modified:\n${diffResult.stdout.trim()}`);
}
const migrationDiff = spawnSync('git', ['status', '--porcelain', '--', 'supabase/migrations', 'supabase/*.sql'], { cwd: root, encoding: 'utf8' });
if ((migrationDiff.stdout || '').trim()) {
  errors.push(`R1 must not create/modify SQL or migrations:\n${migrationDiff.stdout.trim()}`);
}

if (errors.length) {
  console.error('COSMOSKIN R1 admin review image visibility validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

for (const script of [
  'scripts/validate-h2-return-attachment-preview.mjs',
  'scripts/validate-h1-return-attachment-storage-rls.mjs',
  'scripts/validate-h0-live-payment-rpc-hotfix.mjs',
  'scripts/validate-a1-admin-rbac-hardening.mjs',
  'scripts/validate-i1-inventory-checkout-blocking.mjs',
  'scripts/validate-c1-coupon-eligibility-hardening.mjs',
  'scripts/validate-c1b-coupon-exclusions-metadata.mjs',
  'scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs',
  'scripts/validate-d3-refund-snapshot-persistence.mjs',
  'scripts/validate-d2b-refund-discount-proration.mjs',
  'scripts/validate-d2-refund-amount-correctness.mjs',
  'scripts/validate-d1-returns-refunds-correctness.mjs'
]) {
  runValidator(script);
}

if (errors.length) {
  console.error('COSMOSKIN R1 admin review image visibility validation failed (regression chain):');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN R1 admin review image visibility validation passed.');
