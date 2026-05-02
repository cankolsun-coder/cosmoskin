import { getCatalogProductByHandle, getCatalogProductByName } from '../_lib/catalog.js';
import { getUserFromAccessToken } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';

export function cleanString(value, max = 240) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanNullable(value, max = 240) {
  const text = cleanString(value, max);
  return text || null;
}

export async function requireUser(context) {
  const authHeader = context.request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { response: json({ ok: false, error: 'Oturum gerekli.' }, { status: 401 }) };
  const user = await getUserFromAccessToken(context, token);
  if (!user?.id) return { response: json({ ok: false, error: 'Geçersiz oturum.' }, { status: 401 }) };
  return { user, token };
}

export function buildInFilter(ids = []) {
  return `in.(${ids.map((id) => String(id).replace(/,/g, '')).join(',')})`;
}

export function groupByOrderId(rows = []) {
  const grouped = new Map();
  for (const row of rows || []) {
    const list = grouped.get(row.order_id) || [];
    list.push(row);
    grouped.set(row.order_id, list);
  }
  return grouped;
}

export function resolveOrderItem(item = {}) {
  const product =
    getCatalogProductByHandle(item.product_slug || item.product_id || '') ||
    getCatalogProductByName(item.product_name || '');
  const productSlug = product?.slug || item.product_slug || item.product_id || null;
  return {
    ...item,
    product_id: product?.id || item.product_id || productSlug,
    product_slug: productSlug,
    product_name: product?.name || item.product_name || 'Ürün',
    brand: product?.brand || item.brand || 'COSMOSKIN',
    image: product?.image || item.image || '',
    product_url: product?.url || (productSlug ? `/products/${productSlug}.html` : '')
  };
}

export function normalizeFavoritePayload(input = {}) {
  const product = getCatalogProductByHandle(input.product_slug || input.product_id || input.id || input.slug || input.url || '') || getCatalogProductByName(input.product_name || input.name || '');
  const slug = product?.slug || cleanString(input.product_slug || input.product_id || input.id || input.slug || '', 160);
  if (!slug) return null;
  return {
    product_id: product?.id || slug,
    product_slug: slug,
    product_name: product?.name || cleanString(input.product_name || input.name || 'Ürün', 240),
    brand: product?.brand || cleanString(input.brand || 'COSMOSKIN', 120),
    image: product?.image || cleanString(input.image || '', 500),
    price: Number(product?.price || input.price || 0) || 0,
    metadata: {
      url: product?.url || cleanString(input.url || `/products/${slug}.html`, 500),
      source: cleanString(input.source || 'account', 80)
    }
  };
}
