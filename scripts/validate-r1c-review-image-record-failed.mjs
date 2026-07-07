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
const reviewsSql = 'supabase/reviews.sql';
const schemaSql = 'supabase/schema.sql';
const phaseSql = 'supabase/phase51_reviews_hardening.sql';
const tests = 'tests/local-integration.test.mjs';

for (const rel of [reviewsApi, reviewsSql, schemaSql, phaseSql, tests]) mustExist(rel);
if (errors.length) {
  console.error('COSMOSKIN R1C review image record failed validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const apiSrc = read(reviewsApi);
const sql = `${read(reviewsSql)}\n${read(schemaSql)}\n${read(phaseSql)}`;
const testsSrc = read(tests);

// Extract review_images columns from CREATE TABLE block.
const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+review_images\s*\(([\s\S]*?)\);\s*/i);
if (!createMatch) {
  errors.push('Could not locate CREATE TABLE review_images(...) in SQL sources.');
} else {
  const body = createMatch[1];
  const cols = new Set();
  body.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('--')) return;
    const m = trimmed.match(/^([a-z_][a-z0-9_]*)\s+/i);
    if (m) cols.add(m[1]);
  });
  // Phase51 adds moderation columns and storage_path (if missing).
  ['moderation_note', 'moderated_at', 'moderated_by', 'storage_path'].forEach((c) => cols.add(c));

  const builderMatch = apiSrc.match(/function buildReviewImageInsertPayload\([\s\S]*?\)\s*\{\s*const payload\s*=\s*\{([\s\S]*?)\}\s*;/);
  if (!builderMatch) {
    errors.push('Could not locate buildReviewImageInsertPayload() payload object.');
  } else {
    const payloadText = builderMatch[1];
    const keys = new Set();
    payloadText.split('\n').forEach((line) => {
      const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i);
      if (m) keys.add(m[1]);
    });
    for (const key of keys) {
      if (!cols.has(key)) errors.push(`buildReviewImageInsertPayload uses unknown review_images column: ${key}`);
    }
  }
}

// Must attempt cleanup on DB insert failure.
mustInclude(apiSrc, reviewsApi, "deleteStorageObject(context, 'review-images'");
mustInclude(apiSrc, reviewsApi, 'review_image_record_failed');
mustInclude(apiSrc, reviewsApi, 'review_image_cleanup_failed');
mustInclude(apiSrc, reviewsApi, 'image_record_failed');

// Must preserve R1B behavior.
mustInclude(apiSrc, reviewsApi, 'detectImageType');
mustInclude(apiSrc, reviewsApi, 'isBlobLikeUploadPart');
mustInclude(apiSrc, reviewsApi, '2 * 1024 * 1024');
mustInclude(apiSrc, reviewsApi, "status: 410");

// Tests must exist.
mustInclude(testsSrc, tests, "test('R1C: missing review_images.storage_path column retries insert without it'");
mustInclude(testsSrc, tests, "test('R1C: DB insert failure returns image_record_failed and attempts storage cleanup'");

// Regression chain.
for (const script of [
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
  console.error('COSMOSKIN R1C review image record failed validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN R1C review image record failed validation passed.');

