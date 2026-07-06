import productSource from './products-data.js';

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];
  return [value];
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function slugify(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CATEGORY_SLUGS = {
  'Temizleyiciler': 'cleanse',
  'Tonik & Essence': 'hydrate',
  'Serum & Ampul': 'treat',
  'Nemlendiriciler': 'care',
  'Güneş Koruyucular': 'protect',
  'Maskeler': 'masks'
};

function extractSlug(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const productPathMatch = raw.match(/\/products\/([^.?#/]+)\.html(?:[?#].*)?$/i);
  if (productPathMatch) return productPathMatch[1];
  return raw;
}

function normalizeProduct(product) {
  const slug = extractSlug(product?.slug || product?.id || product?.url || '');
  if (!slug) return null;

  const category = String(product.category || '').trim();
  const categorySlug = String(product.categorySlug || CATEGORY_SLUGS[category] || slugify(category)).trim();

  return {
    id: slug,
    slug,
    name: String(product.name || '').trim(),
    brand: String(product.brand || '').trim(),
    price: Number(product.price || 0),
    image: String(product.image || '').trim(),
    url: String(product.url || `/products/${slug}.html`).trim(),
    category,
    categorySlug,
    aliases: toArray(product.aliases).map((alias) => String(alias || '').trim()).filter(Boolean)
  };
}

export const products = toArray(productSource?.products)
  .map(normalizeProduct)
  .filter(Boolean);

const catalogByName = Object.create(null);

export const catalog = Object.fromEntries(products.flatMap((product) => {
  catalogByName[normalizeText(product.name)] = product;
  const handles = [product.id, product.slug].concat(product.aliases || []);
  return handles
    .filter(Boolean)
    .map((handle) => [extractSlug(handle), product]);
}));

export function getCatalogProductByHandle(handle) {
  if (!handle) return null;
  if (typeof handle === 'object') {
    return getCatalogProductByHandle(handle.slug || handle.id || handle.url || '');
  }
  const raw = extractSlug(handle);
  if (!raw) return null;
  return catalog[raw] || null;
}

export function getCatalogProductByName(name) {
  const key = normalizeText(name);
  if (!key) return null;
  return catalogByName[key] || null;
}

export function resolveCatalogProduct(reference) {
  return getCatalogProductByHandle(reference) || getCatalogProductByName(reference);
}
