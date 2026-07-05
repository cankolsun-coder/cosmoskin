
import { selectRows, insertRow, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { cleanText } from '../_lib/security.js';
import { normalizeSlug } from '../_lib/inventory.js';

const STATUSES = new Set(['sellable','quarantine','damaged','expired','returned','disposed']);

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function payload(body = {}) {
  const status = cleanText(body.status || 'sellable', 40);
  if (!STATUSES.has(status)) throw Object.assign(new Error('Lot durumu geçersiz.'), { status: 400 });
  const quantity = Math.max(0, Math.floor(Number(body.quantity || 0)));
  const expiryDate = normalizeDate(body.expiry_date);
  if (status === 'sellable' && expiryDate && new Date(`${expiryDate}T23:59:59Z`).getTime() < Date.now()) {
    throw Object.assign(new Error('SKT tarihi geçmiş lot satılabilir olarak kaydedilemez.'), { status: 400 });
  }
  return {
    product_slug: normalizeSlug(body.product_slug || body.slug),
    lot_number: cleanText(body.lot_number, 120) || null,
    expiry_date: expiryDate,
    quantity,
    supplier_name: cleanText(body.supplier_name, 160) || null,
    purchase_reference: cleanText(body.purchase_reference, 160) || null,
    received_at: body.received_at ? new Date(body.received_at).toISOString() : null,
    status,
    updated_at: new Date().toISOString()
  };
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'lots:read');
    const url = new URL(context.request.url);
    const slug = normalizeSlug(url.searchParams.get('product_slug') || url.searchParams.get('slug') || '');
    const params = { select: '*', order: 'expiry_date.asc.nullslast,created_at.desc', limit: '200' };
    if (slug) params.product_slug = `eq.${slug}`;
    const lots = await selectRows(context, 'inventory_lots', params).catch(() => []);
    const inventory = slug
      ? (await selectRows(context, 'product_inventory', { select: 'product_slug,stock_on_hand,stock_reserved,status', product_slug: `eq.${slug}`, limit: '1' }).catch(() => []))?.[0]
      : null;
    const now = Date.now();
    const nearLimit = now + (90 * 24 * 60 * 60 * 1000);
    const summary = (lots || []).reduce((acc, lot) => {
      const quantity = Math.max(0, Number(lot.quantity || 0));
      const expiry = lot.expiry_date ? new Date(`${lot.expiry_date}T23:59:59Z`).getTime() : null;
      const expired = Boolean(expiry && expiry < now);
      const nearExpiry = Boolean(expiry && expiry >= now && expiry <= nearLimit);
      if (lot.status === 'sellable' && !expired) acc.usable_lot_quantity += quantity;
      if (expired) acc.expired_lot_count += 1;
      if (nearExpiry) acc.near_expiry_lot_count += 1;
      return acc;
    }, { usable_lot_quantity: 0, expired_lot_count: 0, near_expiry_lot_count: 0 });
    summary.current_sellable_stock = Math.max(0, Number(inventory?.stock_on_hand || 0) - Number(inventory?.stock_reserved || 0));
    summary.difference = summary.usable_lot_quantity - summary.current_sellable_stock;
    return json({ ok: true, lots, summary, inventory }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminError(error, 'Lot kayıtları alınamadı.');
  }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'inventory:adjust');
    const body = await readJsonBody(context);
    const row = payload(body);
    if (!row.product_slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });
    const inserted = await insertRow(context, 'inventory_lots', row);
    return json({ ok: true, lot: inserted, message: 'Lot/SKT kaydı oluşturuldu.' });
  } catch (error) {
    return adminError(error, 'Lot kaydı oluşturulamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'inventory:adjust');
    const body = await readJsonBody(context);
    if (!body.id) return json({ ok: false, error: 'id gerekli.' }, { status: 400 });
    const row = payload(body);
    delete row.product_slug;
    await updateRows(context, 'inventory_lots', { id: body.id }, row);
    return json({ ok: true, message: 'Lot/SKT kaydı güncellendi.' });
  } catch (error) {
    return adminError(error, 'Lot kaydı güncellenemedi.');
  }
}
