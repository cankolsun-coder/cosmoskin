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
  console.error('COSMOSKIN R1F review image-level approval validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const apiSrc = read(reviewsApi);
const adminSrc = read(adminUi);
const testsSrc = read(tests);

mustInclude(apiSrc, reviewsApi, 'patchReviewImageRows');
mustInclude(apiSrc, reviewsApi, 'buildReviewImageModerationPatchVariants');
mustInclude(apiSrc, reviewsApi, 'isOptionalReviewImageModerationColumnError');
mustInclude(apiSrc, reviewsApi, 'logReviewImageModerationFailure');
mustInclude(apiSrc, reviewsApi, "code: 'image_update_failed'");
mustInclude(apiSrc, reviewsApi, "variants.push({ status: nextStatus })");

const patchFn = extractFunctionBody(apiSrc, 'patchReviewImageRows');
if (!patchFn) {
  errors.push('patchReviewImageRows function body not found');
} else if (!/review_images/.test(patchFn)) {
  errors.push('patchReviewImageRows must update review_images');
}
if (/handleAdminImageUpdate[\s\S]*updateRows\(context, 'reviews'/.test(apiSrc)) {
  errors.push('handleAdminImageUpdate must not patch reviews table');
}

const moderationPayloadFn = extractFunctionBody(apiSrc, 'buildReviewImageModerationPayload');
if (moderationPayloadFn && /x-admin-email/.test(moderationPayloadFn)) {
  errors.push('buildReviewImageModerationPayload must not write x-admin-email into review_images.moderated_by');
}

mustInclude(adminSrc, adminUi, 'data-image-action="approve"');
mustInclude(adminSrc, adminUi, 'data-image-id="');
mustInclude(adminSrc, adminUi, '/images/\' + encodeURIComponent(imageId)');
mustInclude(adminSrc, adminUi, 'status: nextStatus');
mustNotInclude(adminSrc, adminUi, 'review_source_table: review.source_table');

mustInclude(testsSrc, tests, "test('R1F:");
mustInclude(testsSrc, tests, 'image-level approve retries with status-only patch on live schema');
mustInclude(testsSrc, tests, 'image-level approve works when parent review is already approved');
mustInclude(testsSrc, tests, 'public API shows approved images and hides pending/rejected');

if (!/publicOnly \|\| \(image\.status \|\| 'pending'\) === 'approved'/.test(apiSrc)) {
  errors.push('public review mapping must hide non-approved review images');
}

for (const script of [
  'scripts/validate-r1e-review-image-moderation-alignment.mjs',
  'scripts/validate-r1d-review-image-live-schema-alignment.mjs',
  'scripts/validate-r1c-review-image-record-failed.mjs',
  'scripts/validate-r1b-review-image-upload-failure.mjs',
  'scripts/validate-r1-admin-review-image-visibility.mjs'
]) {
  runValidator(script);
}

if (errors.length) {
  console.error('COSMOSKIN R1F review image-level approval validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN R1F review image-level approval validation passed.');
