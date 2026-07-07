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

function extractFunctionBody(src, name) {
  const re = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = re.exec(src);
  if (!match) return '';
  const openBrace = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = openBrace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(openBrace, i + 1);
    }
  }
  return '';
}

const reviewsApi = 'functions/api/reviews/[[path]].js';
const adminUi = 'admin/reviews/index.html';
const tests = 'tests/local-integration.test.mjs';

for (const rel of [reviewsApi, adminUi, tests]) mustExist(rel);
if (errors.length) {
  console.error('COSMOSKIN R1E review image moderation alignment validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const apiSrc = read(reviewsApi);
const adminSrc = read(adminUi);
const testsSrc = read(tests);

mustInclude(apiSrc, reviewsApi, 'approvePendingReviewImages');
mustInclude(apiSrc, reviewsApi, 'buildReviewImageModerationPayload');
mustInclude(apiSrc, reviewsApi, "if (nextStatus === 'approved')");
mustInclude(apiSrc, reviewsApi, "status: 'eq.pending'");
mustInclude(apiSrc, reviewsApi, 'resolveModeratorUuid');
mustInclude(apiSrc, reviewsApi, "code: 'image_updated'");
mustInclude(apiSrc, reviewsApi, "code: 'image_not_found'");

const moderationPayloadFn = extractFunctionBody(apiSrc, 'buildReviewImageModerationPayload');
if (!moderationPayloadFn) {
  errors.push('buildReviewImageModerationPayload function body not found');
} else {
  if (/x-admin-email/.test(moderationPayloadFn)) {
    errors.push('buildReviewImageModerationPayload must not write x-admin-email into review_images.moderated_by');
  }
  if (!/resolveModeratorUuid/.test(moderationPayloadFn)) {
    errors.push('buildReviewImageModerationPayload must resolve moderated_by via resolveModeratorUuid');
  }
}
if (!/handleAdminImageUpdate[\s\S]*buildReviewImageModerationPayload/.test(apiSrc)) {
  errors.push('handleAdminImageUpdate must use buildReviewImageModerationPayload');
}

mustInclude(adminSrc, adminUi, 'Yorumu ve görselleri onayla');
mustInclude(adminSrc, adminUi, 'Görseli onayla');
mustInclude(adminSrc, adminUi, 'Görseli reddet');
mustInclude(adminSrc, adminUi, 'Görsel beklemede');
mustInclude(adminSrc, adminUi, 'Görsel onaylandı');
mustInclude(adminSrc, adminUi, 'Görsel reddedildi');

mustNotInclude(adminSrc, adminUi, "data-image-action=\"approve\" data-review-id=' + esc(review.id) + '\" data-image-id=' + esc(image.id) + '\"' + disabled + '>Onayla</button>");
mustNotInclude(adminSrc, adminUi, '>Onayla</button>');

mustInclude(testsSrc, tests, "test('R1E:");
mustInclude(testsSrc, tests, 'main review approval also approves attached pending images');

for (const script of [
  'scripts/validate-r1d-review-image-live-schema-alignment.mjs',
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
  console.error('COSMOSKIN R1E review image moderation alignment validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN R1E review image moderation alignment validation passed.');
