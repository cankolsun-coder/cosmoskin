import { selectRows, updateRows, insertRow } from '../_lib/supabase.js';
import { products as catalogProducts } from '../_lib/catalog.js';
import productSource from '../_lib/products-data.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';

const CATALOG_PRICE_SOURCE = 'products.json';
const CATALOG_CURRENCY = 'TRY';
const CATALOG_PRICE_MISSING_WARNING = 'Bu ürün için katalog fiyatı bulunamadı.';
const CATALOG_PRICE_INVALID_WARNING = 'Katalog fiyatı geçersiz görünüyor.';

function normalizeStatus(status) {
  if (['active', 'inactive', 'discontinued'].includes(status)) return status;
  if (['draft', 'archived'].includes(status)) return 'inactive';
  return 'active';
}

function formatInventoryRow(inv) {
  if (!inv) return null;
  return {
    ...inv,
    stock_qty: inv.stock_on_hand,
    reserved_qty: inv.stock_reserved,
    status: inv.status
  };
}

function readOnlyCatalogPriceFields(catalogProduct) {
  const slug = String(catalogProduct?.slug || '').trim();
  const title = String(catalogProduct?.name || '').trim();
  const priceNumber = Number(catalogProduct?.price);
  const priceValid = Boolean(slug)
    && Number.isFinite(priceNumber)
    && priceNumber >= 0
    && Number.isInteger(priceNumber);

  let catalog_price_warning = null;
  if (!slug) {
    catalog_price_warning = CATALOG_PRICE_MISSING_WARNING;
  } else if (!priceValid) {
    catalog_price_warning = CATALOG_PRICE_INVALID_WARNING;
  }

  return {
    catalog_slug: slug || null,
    catalog_title: title || null,
    catalog_price: priceValid ? priceNumber : null,
    catalog_price_try: priceValid ? priceNumber : null,
    catalog_currency: CATALOG_CURRENCY,
    catalog_price_source: CATALOG_PRICE_SOURCE,
    catalog_updated_label: String(productSource?.updated || '').trim() || null,
    catalog_price_valid: priceValid,
    catalog_price_warning
  };
}

function buildAdminCatalogProductRow(catalogProduct, inv) {
  return {
    ...catalogProduct,
    ...readOnlyCatalogPriceFields(catalogProduct),
    inventory: formatInventoryRow(inv)
  };
}

function buildAdminOrphanInventoryRow(inv) {
  const slug = String(inv?.product_slug || '').trim();
  return {
    id: slug,
    slug,
    name: slug,
    brand: '',
    price: null,
    ...readOnlyCatalogPriceFields(null),
    catalog_slug: slug || null,
    catalog_title: null,
    catalog_price_warning: CATALOG_PRICE_MISSING_WARNING,
    inventory: formatInventoryRow(inv)
  };
}

function applyInventoryStatusPayload(payload, status) {
  if (status === undefined) return;
  const normalized = String(status || '').trim();
  if (normalized === 'out_of_stock') {
    payload.status = 'active';
    payload.stock_on_hand = 0;
    payload.allow_backorder = false;
    return;
  }
  if (normalized === 'preorder') {
    payload.status = 'active';
    payload.allow_backorder = true;
    return;
  }
  payload.status = normalizeStatus(normalized);
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'products:read');
    const inventory = await selectRows(context, 'product_inventory', { select: '*', order: 'product_slug.asc' }).catch(() => []);
    const invMap = new Map((inventory || []).map((i) => [i.product_slug, i]));
    const catalogList = Array.isArray(catalogProducts) ? catalogProducts : [];
    const catalogSlugs = new Set(catalogList.map((p) => p.slug).filter(Boolean));

    const products = catalogList.map((p) => buildAdminCatalogProductRow(p, invMap.get(p.slug) || null));
    for (const inv of inventory || []) {
      const slug = String(inv?.product_slug || '').trim();
      if (slug && !catalogSlugs.has(slug)) {
        products.push(buildAdminOrphanInventoryRow(inv));
      }
    }
    products.sort((a, b) => String(a.slug || '').localeCompare(String(b.slug || ''), 'tr'));

    return json({ ok: true, products });
  } catch (error) {
    return adminError(error, 'Ürün listesi alınamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'inventory:adjust');
    const body = await context.request.json();
    if (!body.product_slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });
    const payload = {};
    if (body.stock_qty !== undefined || body.stock_on_hand !== undefined) payload.stock_on_hand = Number(body.stock_on_hand ?? body.stock_qty ?? 0);
    if (body.reserved_qty !== undefined || body.stock_reserved !== undefined) payload.stock_reserved = Number(body.stock_reserved ?? body.reserved_qty ?? 0);
    if (body.low_stock_threshold !== undefined) payload.low_stock_threshold = Number(body.low_stock_threshold || 5);
    applyInventoryStatusPayload(payload, body.status);
    if (body.sku !== undefined) payload.sku = String(body.sku || '').trim() || null;
    payload.updated_at = new Date().toISOString();
    await updateRows(context, 'product_inventory', { product_slug: body.product_slug }, payload);
    return json({ ok: true });
  } catch (error) {
    return adminError(error, 'Ürün/stok güncellenemedi.');
  }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'inventory:adjust');
    const body = await context.request.json();
    if (!body.product_slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });
    const row = await insertRow(context, 'product_inventory', {
      product_slug: body.product_slug,
      sku: body.sku || body.product_slug.toUpperCase().replace(/-/g, '_'),
      stock_on_hand: body.status === 'out_of_stock' ? 0 : Number(body.stock_on_hand ?? body.stock_qty ?? 0),
      stock_reserved: Number(body.stock_reserved ?? body.reserved_qty ?? 0),
      low_stock_threshold: Number(body.low_stock_threshold || 5),
      allow_backorder: body.status === 'preorder' ? true : Boolean(body.allow_backorder),
      status: body.status === 'out_of_stock' || body.status === 'preorder' ? 'active' : normalizeStatus(body.status || 'active')
    });
    return json({ ok: true, inventory: row });
  } catch (error) {
    return adminError(error, 'Ürün/stok oluşturulamadı.');
  }
}
