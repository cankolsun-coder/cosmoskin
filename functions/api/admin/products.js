import { selectRows, updateRows, insertRow } from '../_lib/supabase.js';
import { catalog } from '../_lib/catalog.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';

function normalizeStatus(status) {
  if (['active', 'inactive', 'discontinued'].includes(status)) return status;
  if (['draft', 'archived'].includes(status)) return 'inactive';
  return 'active';
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
    assertAdmin(context);
    const inventory = await selectRows(context, 'product_inventory', { select: '*', order: 'product_slug.asc' }).catch(() => []);
    const map = new Map((inventory || []).map((i) => [i.product_slug, i]));
    const products = (Array.isArray(catalog) ? catalog : Object.values(catalog || {})).map((p) => {
      const inv = map.get(p.slug) || null;
      return {
        ...p,
        inventory: inv ? {
          ...inv,
          stock_qty: inv.stock_on_hand,
          reserved_qty: inv.stock_reserved,
          status: inv.status
        } : null
      };
    });
    return json({ ok: true, products });
  } catch (error) {
    return adminError(error, 'Ürün listesi alınamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    assertAdmin(context);
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
    assertAdmin(context);
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
