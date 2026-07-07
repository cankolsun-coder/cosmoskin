#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

const migration = 'supabase/migrations/20260707_r1g_review_moderation_updated_at_fix.sql';
const reviewsApi = 'functions/api/reviews/[[path]].js';
const adminUi = 'admin/reviews/index.html';
const tests = 'tests/local-integration.test.mjs';
const phase51 = 'supabase/phase51_reviews_hardening.sql';
const schema = 'supabase/schema.sql';
const r1fValidator = 'scripts/validate-r1f-review-image-level-approval.mjs';
const r1eValidator = 'scripts/validate-r1e-review-image-moderation-alignment.mjs';
const r1dValidator = 'scripts/validate-r1d-review-image-live-schema-alignment.mjs';

for (const rel of [migration, reviewsApi, adminUi, tests, r1fValidator, r1eValidator, r1dValidator]) mustExist(rel);
if (errors.length) {
  console.error('COSMOSKIN R1G review moderation updated_at schema validation failed (missing files):');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const migrationSrc = read(migration);
const apiSrc = read(reviewsApi);
const adminSrc = read(adminUi);
const testsSrc = read(tests);
const phase51Src = has(phase51) ? read(phase51) : '';
const schemaSrc = has(schema) ? read(schema) : '';
const r1fSrc = read(r1fValidator);
const r1eSrc = read(r1eValidator);
const r1dSrc = read(r1dValidator);

mustInclude(migrationSrc, migration, 'ADD COLUMN IF NOT EXISTS updated_at');
mustInclude(migrationSrc, migration, 'ALTER TABLE public.reviews');
mustInclude(migrationSrc, migration, 'ALTER TABLE public.review_images');
mustInclude(migrationSrc, migration, 'sync_review_approved_from_status');
mustInclude(migrationSrc, migration, 'NEW.updated_at := NOW()');

mustNotInclude(migrationSrc, migration, 'DROP TABLE');
mustNotInclude(migrationSrc, migration, 'DROP POLICY');
mustNotInclude(migrationSrc, migration, 'DISABLE ROW LEVEL SECURITY');
mustNotInclude(migrationSrc, migration, 'storage.objects');
mustNotInclude(migrationSrc, migration, 'coupons');
mustNotInclude(migrationSrc, migration, 'orders');
mustNotInclude(migrationSrc, migration, 'inventory');

if (phase51Src && /NEW\.updated_at/.test(phase51Src) && !/ADD COLUMN IF NOT EXISTS updated_at[\s\S]*review_images/.test(migrationSrc)) {
  errors.push('phase51 trigger references updated_at; migration must add review_images.updated_at');
}
if (schemaSrc && /trg_reviews_updated_at/.test(schemaSrc) && !/ALTER TABLE public\.reviews[\s\S]*updated_at/.test(migrationSrc)) {
  errors.push('schema reviews updated_at trigger requires reviews.updated_at column in migration');
}

if (/handleAdminReviewUpdate[\s\S]*?\n\s*await updateRows\(context, 'reviews'[\s\S]*?\{[\s\S]*?updated_at:/.test(apiSrc)) {
  errors.push('handleAdminReviewUpdate must not manually PATCH reviews.updated_at; DB trigger should manage it');
}
const patchReviewImageFn = extractFunctionBody(apiSrc, 'patchReviewImageRows');
if (patchReviewImageFn && /updated_at\s*:/.test(patchReviewImageFn)) {
  errors.push('patchReviewImageRows must not manually PATCH review_images.updated_at');
}

mustInclude(adminSrc, adminUi, 'Görseli onayla');
mustInclude(adminSrc, adminUi, 'Yorumu ve görselleri onayla');
mustInclude(adminSrc, adminUi, 'data-image-id="');

mustInclude(testsSrc, tests, "test('R1G:");
mustInclude(testsSrc, tests, 'review moderation updated_at migration is idempotent');
mustInclude(testsSrc, tests, 'public API shows approved images and hides pending/rejected');
mustInclude(testsSrc, tests, 'main review approval also approves attached pending images');
mustInclude(testsSrc, tests, 'image-level approve works when parent review is already approved');

mustInclude(r1fSrc, r1fValidator, 'patchReviewImageRows');
mustInclude(r1eSrc, r1eValidator, 'approvePendingReviewImages');
mustInclude(r1dSrc, r1dValidator, 'buildReviewImageInsertPayload');
mustInclude(apiSrc, reviewsApi, "variants.push({ status: nextStatus })");
mustInclude(apiSrc, reviewsApi, "status: 'eq.pending'");
if (!/filter\(\(image\) => !options\.publicOnly \|\| \(image\.status \|\| 'pending'\) === 'approved'\)/.test(apiSrc)) {
  errors.push('public API must continue showing only approved review_images');
}

const migrationFiles = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'));
const r1gOnly = migrationFiles.filter((name) => /r1g_review_moderation_updated_at_fix/.test(name));
if (r1gOnly.length !== 1) {
  errors.push('expected exactly one R1G migration file');
}

if (errors.length) {
  console.error('COSMOSKIN R1G review moderation updated_at schema validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN R1G review moderation updated_at schema validation passed.');
