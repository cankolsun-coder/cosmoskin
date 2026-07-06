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
const tests = 'tests/local-integration.test.mjs';

for (const rel of [pdpReviews, reviewsApi, tests, 'scripts/validate-r1b-review-image-upload-failure.mjs']) mustExist(rel);

if (errors.length) {
  console.error('COSMOSKIN R1B review image upload failure validation failed (missing files):');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const pdpSrc = read(pdpReviews);
const apiSrc = read(reviewsApi);
const testsSrc = read(tests);

mustNotInclude(pdpSrc, pdpReviews, '/reviews/images');
mustInclude(pdpSrc, pdpReviews, '/reviews/${encodeURIComponent(reviewId)}/images');
mustInclude(pdpSrc, pdpReviews, "form.append('image'");
mustInclude(pdpSrc, pdpReviews, 'resolveReviewId');
mustInclude(pdpSrc, pdpReviews, 'data?.review?.id');
mustInclude(pdpSrc, pdpReviews, 'await refreshSession()');
mustInclude(pdpSrc, pdpReviews, 'await authHeaders()');
mustInclude(pdpSrc, pdpReviews, 'Yorumunuz kaydedildi ancak görsel yüklenemedi.');

mustNotInclude(apiSrc, reviewsApi, 'instanceof File');
mustInclude(apiSrc, reviewsApi, 'isBlobLikeUploadPart');
mustMatch(apiSrc, reviewsApi, /instanceof Blob/, 'upload accepts Blob-like multipart parts');
mustInclude(apiSrc, reviewsApi, 'detectImageType');
mustInclude(apiSrc, reviewsApi, 'function uploadError');
mustInclude(apiSrc, reviewsApi, "'unauthorized'");
mustInclude(apiSrc, reviewsApi, "'review_not_found'");
mustInclude(apiSrc, reviewsApi, "'review_ownership_mismatch'");
mustInclude(apiSrc, reviewsApi, "'missing_image'");
mustInclude(apiSrc, reviewsApi, "'invalid_image_type'");
mustInclude(apiSrc, reviewsApi, "'image_too_large'");
mustInclude(apiSrc, reviewsApi, "'storage_upload_failed'");
mustInclude(apiSrc, reviewsApi, "'image_record_failed'");
mustInclude(apiSrc, reviewsApi, '2 * 1024 * 1024');
mustMatch(apiSrc, reviewsApi, /function sanitizeReviewPayload[\s\S]*images:\s*\[\]/, 'sanitizeReviewPayload keeps client images empty');
mustInclude(apiSrc, reviewsApi, "if (parts[0] === 'images')");
mustInclude(apiSrc, reviewsApi, 'status: 410');
mustNotInclude(apiSrc, reviewsApi, 'allowed.get(String(file.type');

mustInclude(testsSrc, tests, "test('R1B: upload accepts valid JPEG when file.type is empty'");
mustInclude(testsSrc, tests, "test('R1B: upload accepts Blob-like multipart part'");
mustInclude(testsSrc, tests, "test('R1B: frontend markers support review id fallback");

const protectedFiles = [
  'functions/api/_lib/admin.js',
  'functions/api/_lib/admin-audit.js',
  'functions/api/_lib/cloudflare-access-jwt.js',
  'assets/admin-runtime.js',
  'assets/admin-runtime.css',
  'functions/api/create-checkout.js',
  'functions/api/_lib/inventory.js',
  'functions/api/_lib/coupons.js',
  'supabase/phase51_reviews_hardening.sql',
  'supabase/schema.sql'
];
const diffResult = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', ...protectedFiles], { cwd: root, encoding: 'utf8' });
if ((diffResult.stdout || '').trim()) {
  errors.push(`R1B scope violation: protected/unrelated files modified:\n${diffResult.stdout.trim()}`);
}
const migrationDiff = spawnSync('git', ['status', '--porcelain', '--', 'supabase/migrations'], { cwd: root, encoding: 'utf8' });
if ((migrationDiff.stdout || '').trim()) {
  errors.push(`R1B must not create migrations:\n${migrationDiff.stdout.trim()}`);
}

if (errors.length) {
  console.error('COSMOSKIN R1B review image upload failure validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

for (const script of [
  'scripts/validate-r1-admin-review-image-visibility.mjs',
  'scripts/validate-h2-return-attachment-preview.mjs',
  'scripts/validate-a1-admin-rbac-hardening.mjs',
  'scripts/validate-i1-inventory-checkout-blocking.mjs',
  'scripts/validate-c1-coupon-eligibility-hardening.mjs',
  'scripts/validate-d3-refund-snapshot-persistence.mjs',
  'scripts/validate-d2b-refund-discount-proration.mjs',
  'scripts/validate-d2-refund-amount-correctness.mjs',
  'scripts/validate-d1-returns-refunds-correctness.mjs'
]) {
  runValidator(script);
}

if (errors.length) {
  console.error('COSMOSKIN R1B review image upload failure validation failed (regression chain):');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('COSMOSKIN R1B review image upload failure validation passed.');
