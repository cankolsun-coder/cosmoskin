import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CANONICAL_CATALOG_PATH = 'products.json';
export const BROWSER_CATALOG_PATH = 'assets/products-data.js';
export const SERVER_CATALOG_PATH = 'functions/api/_lib/products-data.js';
export const SERVER_CATALOG_MODULE_PATH = 'functions/api/_lib/catalog.js';

const EXPECTED_CURRENCY = 'TRY';

export function readRepoFile(root, rel) {
  return readFileSync(join(root, rel), 'utf8');
}

export function loadCanonicalCatalog(root = process.cwd()) {
  const source = JSON.parse(readRepoFile(root, CANONICAL_CATALOG_PATH));
  return normalizeCatalogDocument(source, CANONICAL_CATALOG_PATH);
}

export function extractBrowserFallbackCatalog(root = process.cwd()) {
  const src = readRepoFile(root, BROWSER_CATALOG_PATH);
  const match = src.match(/FALLBACK_SOURCE\s*=\s*JSON\.parse\(String\.raw`([\s\S]*?)`\)/);
  if (!match) {
    throw new Error(`${BROWSER_CATALOG_PATH} missing FALLBACK_SOURCE embedded JSON`);
  }
  const source = JSON.parse(match[1]);
  return normalizeCatalogDocument(source, `${BROWSER_CATALOG_PATH}#fallback`);
}

export async function loadServerCatalog(root = process.cwd()) {
  const moduleUrl = new URL(`../../${SERVER_CATALOG_PATH}`, import.meta.url);
  const mod = await import(moduleUrl.href);
  const source = mod.default || mod.productSource;
  return normalizeCatalogDocument(source, SERVER_CATALOG_PATH);
}

export function normalizeCatalogPrice(rawPrice, label) {
  if (rawPrice === undefined) {
    return { ok: false, code: 'missing', normalized: null, message: `${label}: price is missing` };
  }
  if (rawPrice === null) {
    return { ok: false, code: 'null', normalized: null, message: `${label}: price is null` };
  }
  if (typeof rawPrice === 'string' && rawPrice.trim() === '') {
    return { ok: false, code: 'non_numeric', normalized: null, message: `${label}: price is empty string` };
  }
  const number = Number(rawPrice);
  if (!Number.isFinite(number)) {
    return { ok: false, code: 'nan', normalized: null, message: `${label}: price is NaN (${String(rawPrice)})` };
  }
  if (number < 0) {
    return { ok: false, code: 'negative', normalized: null, message: `${label}: price is negative (${number})` };
  }
  if (!Number.isInteger(number)) {
    return { ok: false, code: 'non_integer', normalized: number, message: `${label}: price is non-integer (${number})` };
  }
  return { ok: true, code: 'ok', normalized: number, message: '' };
}

export function normalizeCatalogDocument(source, label) {
  const products = Array.isArray(source?.products) ? source.products : [];
  const bySlug = new Map();
  const errors = [];

  for (const product of products) {
    const slug = String(product?.slug || '').trim();
    if (!slug) {
      errors.push(`${label}: product entry missing slug`);
      continue;
    }
    if (bySlug.has(slug)) {
      errors.push(`${label}: duplicate slug ${slug}`);
      continue;
    }

    const priceCheck = normalizeCatalogPrice(product?.price, `${label}:${slug}`);
    if (!priceCheck.ok) errors.push(priceCheck.message);

    const id = String(product?.id || slug).trim();
    if (id !== slug) {
      errors.push(`${label}:${slug}: product id mismatch (${id} !== ${slug})`);
    }

    const currency = product?.currency == null ? EXPECTED_CURRENCY : String(product.currency).trim().toUpperCase();
    if (currency !== EXPECTED_CURRENCY) {
      errors.push(`${label}:${slug}: unexpected currency ${currency} (expected ${EXPECTED_CURRENCY})`);
    }

    bySlug.set(slug, {
      slug,
      id,
      price: priceCheck.normalized,
      currency,
      name: String(product?.name || '').trim()
    });
  }

  return {
    label,
    version: String(source?.version || ''),
    updated: String(source?.updated || ''),
    bySlug,
    slugs: new Set(bySlug.keys()),
    errors
  };
}

export function compareCatalogDocuments(canonical, other, otherName) {
  const errors = [...(other.errors || [])];
  const canonicalSlugs = canonical.slugs;
  const otherSlugs = other.slugs;

  for (const slug of canonicalSlugs) {
    if (!otherSlugs.has(slug)) {
      errors.push(`${otherName}: missing product slug ${slug}`);
    }
  }
  for (const slug of otherSlugs) {
    if (!canonicalSlugs.has(slug)) {
      errors.push(`${otherName}: extra product slug ${slug}`);
    }
  }

  for (const slug of canonicalSlugs) {
    const left = canonical.bySlug.get(slug);
    const right = other.bySlug.get(slug);
    if (!left || !right) continue;
    if (left.price !== right.price) {
      errors.push(`${otherName}:${slug}: price drift (${right.price} !== canonical ${left.price})`);
    }
    if (left.id !== right.id) {
      errors.push(`${otherName}:${slug}: id drift (${right.id} !== canonical ${left.id})`);
    }
    if (left.currency !== right.currency) {
      errors.push(`${otherName}:${slug}: currency drift (${right.currency} !== canonical ${left.currency})`);
    }
  }

  return errors;
}

export function buildServerCatalogPriceIndex(catalogModule) {
  const products = Array.isArray(catalogModule.catalog)
    ? catalogModule.catalog
    : Object.values(catalogModule.catalog || {});
  const bySlug = new Map();
  for (const product of products) {
    const slug = String(product?.slug || product?.id || '').trim();
    if (!slug) continue;
    const priceCheck = normalizeCatalogPrice(product?.price, `catalog.js:${slug}`);
    bySlug.set(slug, {
      slug,
      id: String(product?.id || slug).trim(),
      price: priceCheck.normalized,
      priceOk: priceCheck.ok,
      priceError: priceCheck.ok ? '' : priceCheck.message
    });
  }
  return bySlug;
}
