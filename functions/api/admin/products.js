import { selectRows, updateRows, insertRow } from '../_lib/supabase.js';
import { products as catalogProducts } from '../_lib/catalog.js';
import productSource from '../_lib/products-data.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';
import { hasAdminPermission, requireAdminPermission } from '../_lib/admin-audit.js';
import {
  buildAdminPricingFields,
  loadActivePriceOverrideMap,
  resolveEffectivePricing
} from '../_lib/product-pricing.js';

const CATALOG_PRICE_SOURCE = 'products.json';

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

function buildAdminCatalogProductRow(catalogProduct, inv, overrideRow) {
  const pricing = resolveEffectivePricing(catalogProduct, overrideRow || null);
  const fields = buildAdminPricingFields(catalogProduct, pricing, overrideRow || null);
  return {
    ...catalogProduct,
    ...fields,
    catalog_price_source: CATALOG_PRICE_SOURCE,
    catalog_updated_label: String(productSource?.updated || '').trim() || null,
    inventory: formatInventoryRow(inv)
  };
}

function buildAdminOrphanInventoryRow(inv) {
  const slug = String(inv?.product_slug || '').trim();
  const pricing = resolveEffectivePricing(null, null);
  const fields = buildAdminPricingFields(null, pricing, null);
  return {
    id: slug,
    slug,
    name: slug,
    brand: '',
    price: null,
    ...fields,
    catalog_slug: slug || null,
    catalog_title: null,
    can_edit_price: false,
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
    const [inventory, overrideMap, canEditPrice] = await Promise.all([
      selectRows(context, 'product_inventory', { select: '*', order: 'product_slug.asc' }).catch(() => []),
      loadActivePriceOverrideMap(context),
      hasAdminPermission(context, 'products:pricing:update')
    ]);
    const invMap = new Map((inventory || []).map((i) => [i.product_slug, i]));
    const catalogList = Array.isArray(catalogProducts) ? catalogProducts : [];
    const catalogSlugs = new Set(catalogList.map((p) => p.slug).filter(Boolean));

    const products = catalogList.map((p) => buildAdminCatalogProductRow(
      p,
      invMap.get(p.slug) || null,
      overrideMap.get(p.slug) || null
    ));
    for (const inv of inventory || []) {
      const slug = String(inv?.product_slug || '').trim();
      if (slug && !catalogSlugs.has(slug)) {
        products.push(buildAdminOrphanInventoryRow(inv));
      }
    }
    products.sort((a, b) => String(a.slug || '').localeCompare(String(b.slug || ''), 'tr'));

    return json({
      ok: true,
      products,
      permissions: {
        can_edit_price: canEditPrice
      }
    });
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
    if (
      body.price !== undefined
      || body.catalog_price !== undefined
      || body.catalog_price_try !== undefined
      || body.regular_price_try !== undefined
    ) {
      return json({ ok: false, error: 'Fiyat güncellemesi bu uçtan yapılamaz.' }, { status: 400 });
    }
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
    if (
      body.price !== undefined
      || body.catalog_price !== undefined
      || body.catalog_price_try !== undefined
      || body.regular_price_try !== undefined
    ) {
      return json({ ok: false, error: 'Fiyat güncellemesi bu uçtan yapılamaz.' }, { status: 400 });
    }
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
