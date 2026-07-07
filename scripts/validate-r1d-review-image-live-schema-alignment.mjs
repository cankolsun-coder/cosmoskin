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

const reviewsApi = 'functions/api/reviews/[[path]].js';
const tests = 'tests/local-integration.test.mjs';
const LIVE_COLUMNS = new Set([
  'id',
  'review_id',
  'user_id',
  'storage_path',
  'public_url',
  'original_name',
  'file_size_kb',
  'width',
  'height',
  'mime_type',
  'status',
  'moderation_note',
  'moderated_by',
  'moderated_at',
  'sort_order',
  'created_at'
]);

for (const rel of [reviewsApi, tests]) mustExist(rel);
if (errors.length) {
  console.error('COSMOSKIN R1D review image live schema alignment validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const apiSrc = read(reviewsApi);
const testsSrc = read(tests);

const builderMatch = apiSrc.match(/function buildReviewImageInsertPayload\([\s\S]*?\)\s*\{[\s\S]*?const payload\s*=\s*\{([\s\S]*?)\};/);
if (!builderMatch) {
  errors.push('Could not locate buildReviewImageInsertPayload() payload object.');
} else {
  const payloadText = builderMatch[1];
  const keys = new Set();
  payloadText.split('\n').forEach((line) => {
    const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i);
    if (m) keys.add(m[1]);
  });

  for (const required of ['review_id', 'user_id', 'storage_path', 'public_url', 'status', 'sort_order']) {
    if (!keys.has(required)) errors.push(`buildReviewImageInsertPayload missing required live column: ${required}`);
  }
  for (const forbidden of ['filename', 'size_bytes', 'metadata', 'customer_id']) {
    if (keys.has(forbidden)) errors.push(`buildReviewImageInsertPayload must not insert forbidden column: ${forbidden}`);
  }
  for (const key of keys) {
    if (!LIVE_COLUMNS.has(key)) errors.push(`buildReviewImageInsertPayload uses unsupported live column: ${key}`);
  }
  if (!keys.has('original_name')) errors.push('buildReviewImageInsertPayload must map filename to original_name');
  if (!keys.has('file_size_kb')) errors.push('buildReviewImageInsertPayload must map file size to file_size_kb');
  if (keys.has('size_bytes')) errors.push('buildReviewImageInsertPayload must not insert size_bytes');
  if (keys.has('filename')) errors.push('buildReviewImageInsertPayload must not insert filename');
}

mustInclude(apiSrc, reviewsApi, 'resolveNextReviewImageSortOrder');
mustInclude(apiSrc, reviewsApi, "status: 'pending'");
mustInclude(apiSrc, reviewsApi, 'user_id: userId');
mustInclude(apiSrc, reviewsApi, "deleteStorageObject(context, 'review-images'");
mustInclude(apiSrc, reviewsApi, 'review_image_record_failed');
mustInclude(apiSrc, reviewsApi, 'userId: required.user.id');
mustInclude(apiSrc, reviewsApi, 'detectImageType');
mustInclude(apiSrc, reviewsApi, 'isBlobLikeUploadPart');
mustInclude(apiSrc, reviewsApi, '2 * 1024 * 1024');
mustInclude(apiSrc, reviewsApi, "status: 410");

mustInclude(testsSrc, tests, "test('R1D:");
mustInclude(testsSrc, tests, 'user_id');
mustInclude(testsSrc, tests, 'sort_order');
mustInclude(testsSrc, tests, 'original_name');
mustInclude(testsSrc, tests, 'file_size_kb');

for (const script of [
  'scripts/validate-r1c-review-image-record-failed.mjs',
  'scripts/validate-r1b-review-image-upload-failure.mjs',
  'scripts/validate-r1-admin-review-image-visibility.mjs',
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
  console.error('COSMOSKIN R1D review image live schema alignment validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN R1D review image live schema alignment validation passed.');
