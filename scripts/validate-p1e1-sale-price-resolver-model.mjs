#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
const mustExist = (p) => { if (!existsSync(join(root, p))) errors.push(`Missing: ${p}`); };
const read = (p) => readFileSync(join(root, p), 'utf8');
const mustInclude = (src, p, needle) => { if (!src.includes(needle)) errors.push(`${p} missing: ${needle}`); };
const mustNotInclude = (src, p, needle) => { if (src.includes(needle)) errors.push(`${p} must not include: ${needle}`); };

const migration = 'supabase/migrations/20260709_p1e_sale_compare_at_price.sql';
const pricing = 'functions/api/_lib/product-pricing.js';

mustExist(migration);
mustExist(pricing);
mustExist('products.json');

if (errors.length) {
  console.error('P1E1 validator failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

const mig = read(migration);
const src = read(pricing);
const productsDiff = readFileSync ? null : null;

// Migration safety checks (string heuristics; must be conservative)
mustInclude(mig, migration, 'product_price_overrides');
mustInclude(mig, migration, 'sale_price_try');
mustInclude(mig, migration, 'compare_at_price_try');
mustInclude(mig, migration, 'sale_starts_at');
mustInclude(mig, migration, 'sale_ends_at');
mustInclude(mig, migration, 'product_price_audit_logs');
// Only forbid touching these tables (not mentions in comments).
for (const forbidden of [
  'alter table public.orders',
  'create table public.orders',
  'insert into public.orders',
  'update public.orders',
  'delete from public.orders',
  'alter table public.refunds',
  'create table public.refunds',
  'insert into public.refunds',
  'update public.refunds',
  'delete from public.refunds',
  'alter table public.coupons',
  'create table public.coupons',
  'insert into public.coupons',
  'update public.coupons',
  'delete from public.coupons',
  'alter table public.product_inventory',
  'create table public.product_inventory',
  'insert into public.product_inventory',
  'update public.product_inventory',
  'delete from public.product_inventory',
  'alter table public.reviews',
  'create table public.reviews',
  'insert into public.reviews',
  'update public.reviews',
  'delete from public.reviews'
]) {
  mustNotInclude(mig.toLowerCase(), migration, forbidden);
}
mustNotInclude(mig, migration, 'update public.product_price_overrides');
mustNotInclude(mig, migration, 'update public.product_price_audit_logs');

// Resolver model checks
mustInclude(src, pricing, 'EFFECTIVE_PRICE_SOURCE_SALE');
mustInclude(src, pricing, 'price_display_mode');
mustInclude(src, pricing, 'sale_active');
mustInclude(src, pricing, 'compare_at_price_try');
mustInclude(src, pricing, 'sale_price_try');
mustInclude(src, pricing, 'sale_starts_at');
mustInclude(src, pricing, 'sale_ends_at');
mustInclude(src, pricing, "extendedSelect = legacySelect + ',sale_price_try,compare_at_price_try,sale_starts_at,sale_ends_at'");
mustInclude(src, pricing, 'retry with legacy select');

// Compare-at must never become payable (simple guard: no assignment of effective to compare-at)
if (/effective_price_try\s*=\s*compare_at_price_try/.test(src)) {
  errors.push('Resolver assigns compare_at_price_try to effective_price_try (forbidden)');
}

if (errors.length) {
  console.error('COSMOSKIN P1E1 sale price resolver model validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('COSMOSKIN P1E1 sale price resolver model validation passed.');

