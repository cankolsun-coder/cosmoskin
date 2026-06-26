#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';

const apply = process.argv.includes('--apply');
const productFile = new URL('../products.json', import.meta.url);
const source = JSON.parse(await fs.readFile(productFile, 'utf8'));
const products = Array.isArray(source.products) ? source.products : [];
const slugs = products.map((product) => String(product.slug || '').trim().toLowerCase()).filter(Boolean);
const duplicateCatalog = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
if (duplicateCatalog.length) {
  console.error(JSON.stringify({ ok: false, error: 'duplicate_catalog_slugs', slugs: [...new Set(duplicateCatalog)] }, null, 2));
  process.exit(1);
}

const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!baseUrl || !serviceKey) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gereklidir. Değerleri dosyaya yazmayın; ortam değişkeni kullanın.');
  process.exit(2);
}
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const response = await fetch(`${baseUrl}/rest/v1/product_inventory?select=id,product_slug,sku,stock_on_hand,stock_reserved,allow_backorder,status,updated_at&order=product_slug.asc`, { headers });
const text = await response.text();
if (!response.ok) throw new Error(`Inventory read failed (${response.status}): ${text.slice(0, 300)}`);
const rows = text ? JSON.parse(text) : [];
const normalizedDbSlugs = rows.map((row) => String(row.product_slug || '').trim().toLowerCase());
const dbDuplicateSlugs = [...new Set(normalizedDbSlugs.filter((slug, index) => slug && normalizedDbSlugs.indexOf(slug) !== index))];
const bySlug = new Map();
for (const row of rows) {
  const slug = String(row.product_slug || '').trim().toLowerCase();
  if (slug && !bySlug.has(slug)) bySlug.set(slug, row);
}
const catalogSet = new Set(slugs);
const missing = products.filter((product) => !bySlug.has(String(product.slug).toLowerCase())).map((product) => ({
  product_slug: String(product.slug).toLowerCase(),
  sku: product.sku || null,
  stock_on_hand: 0,
  stock_reserved: 0,
  low_stock_threshold: 5,
  allow_backorder: false,
  status: 'active'
}));
const invalid = rows.flatMap((row) => {
  const issues = [];
  const stock = Number(row.stock_on_hand);
  const reserved = Number(row.stock_reserved);
  if (!Number.isInteger(stock) || stock < 0) issues.push('negative_or_invalid_stock');
  if (!Number.isInteger(reserved) || reserved < 0) issues.push('negative_or_invalid_reserved');
  if (!row.allow_backorder && reserved > stock) issues.push('reserved_exceeds_stock');
  const normalizedSlug = String(row.product_slug || '').trim().toLowerCase();
  if (!normalizedSlug || normalizedSlug !== String(row.product_slug || '')) issues.push('slug_not_normalized');
  if (catalogSet.has(normalizedSlug) && row.status !== 'active') issues.push('catalog_product_inactive');
  if (catalogSet.has(normalizedSlug) && row.allow_backorder === true) issues.push('backorder_not_enabled_in_catalog');
  return issues.length ? [{ product_slug: row.product_slug, issues }] : [];
});
const orphaned = rows.filter((row) => !catalogSet.has(String(row.product_slug || '').trim().toLowerCase())).map((row) => row.product_slug);
const ok = !missing.length && !invalid.length && !dbDuplicateSlugs.length;
const report = { ok, mode: apply ? 'apply' : 'dry-run', catalog: slugs.length, inventory: rows.length, missing, duplicate_inventory_slugs: dbDuplicateSlugs, invalid, orphaned };
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exitCode = 1;
if (apply && missing.length) {
  const seedResponse = await fetch(`${baseUrl}/rest/v1/product_inventory?on_conflict=product_slug`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(missing)
  });
  const seedText = await seedResponse.text();
  if (!seedResponse.ok) throw new Error(`Inventory seed failed (${seedResponse.status}): ${seedText.slice(0, 300)}`);
  console.log(JSON.stringify({ seeded: JSON.parse(seedText || '[]').map((row) => row.product_slug), note: 'Yeni kayıtlar güvenli biçimde 0 stokla oluşturuldu.' }, null, 2));
}
