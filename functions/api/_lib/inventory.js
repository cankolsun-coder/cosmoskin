import { insertRow, selectRows, updateRows, rpc } from './supabase.js';
import { catalog, products } from './catalog.js';
import { sendRestockEmail } from './restock-email.js';

const ACTIVE_STATUS = new Set(['active']);
const ADMIN_STATUS = new Set(['active', 'inactive', 'discontinued']);
const MOVEMENT_REASONS = new Set([
  'manual_adjustment', 'supplier_restock', 'order_paid', 'order_cancelled',
  'return_received', 'damage_loss', 'correction', 'stock_reserved', 'reservation_released'
]);

export function normalizeSlug(value = '') {
  return String(value || '')
    .trim()
    .replace(/^.*\/products\//, '')
    .replace(/\.html.*$/, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

export function catalogProduct(slug) {
  const normalized = normalizeSlug(slug);
  return catalog[normalized] || null;
}

export function catalogProducts() {
  return Array.isArray(products) ? products : Object.values(catalog || {});
}

export function normalizeInventoryRow(row = {}) {
  const stockOnHand = Math.max(0, Number(row.stock_on_hand ?? row.stock_qty ?? 0));
  const stockReserved = Math.max(0, Number(row.stock_reserved ?? row.reserved_qty ?? 0));
  const threshold = Math.max(0, Number(row.low_stock_threshold ?? 5));
  const available = Math.max(stockOnHand - stockReserved, 0);
  const status = ADMIN_STATUS.has(String(row.status || 'active')) ? String(row.status || 'active') : 'inactive';
  return {
    id: row.id || null,
    product_slug: normalizeSlug(row.product_slug),
    sku: row.sku || null,
    stock_on_hand: stockOnHand,
    stock_reserved: stockReserved,
    available_stock: available,
    low_stock_threshold: threshold,
    allow_backorder: Boolean(row.allow_backorder),
    status,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null
  };
}

export function toPublicInventory(row = {}) {
  const inv = normalizeInventoryRow(row);
  const sellable = ACTIVE_STATUS.has(inv.status) && (inv.allow_backorder || inv.available_stock > 0);
  return {
    product_slug: inv.product_slug,
    available_stock: inv.available_stock,
    in_stock: sellable,
    low_stock: sellable && inv.available_stock > 0 && inv.available_stock <= inv.low_stock_threshold,
    status: inv.status,
    allow_backorder: inv.allow_backorder
  };
}

export async function getInventoryRows(context, slugs = []) {
  const params = {
    select: 'id,product_slug,sku,stock_on_hand,stock_reserved,low_stock_threshold,allow_backorder,status,updated_at,created_at',
    order: 'product_slug.asc'
  };
  const normalized = slugs.map(normalizeSlug).filter(Boolean);
  if (normalized.length) params.product_slug = `in.(${normalized.join(',')})`;
  const rows = await selectRows(context, 'product_inventory', params);
  return (rows || []).map(normalizeInventoryRow);
}

export async function getInventoryMap(context, slugs = []) {
  const rows = await getInventoryRows(context, slugs);
  return new Map(rows.map((row) => [row.product_slug, row]));
}

export function buildCheckItem(raw = {}, invMap = new Map()) {
  const slug = normalizeSlug(raw.product_slug || raw.slug || raw.id || raw.product_id);
  const quantity = Math.max(1, Math.floor(Number(raw.quantity ?? raw.qty ?? 1) || 1));
  const product = catalogProduct(slug);
  const inv = invMap.get(slug);
  const available = inv ? inv.available_stock : 0;
  const active = inv ? inv.status === 'active' : false;
  const backorder = inv ? inv.allow_backorder : false;
  let can_purchase = Boolean(product && active && (backorder || available >= quantity));
  let message = 'Stokta';
  if (!product) {
    can_purchase = false;
    message = 'Ürün bulunamadı.';
  } else if (!active) {
    can_purchase = false;
    message = 'Bu ürün şu anda satışta değil.';
  } else if (!backorder && available <= 0) {
    can_purchase = false;
    message = 'Bu ürün şu anda stokta yok. Favorilerine ekleyerek tekrar geldiğinde haber alabilirsin.';
  } else if (!backorder && available < quantity) {
    can_purchase = false;
    message = `Bu ürün için şu anda yalnızca ${available} adet satın alınabilir.`;
  } else if (available > 0 && inv && available <= inv.low_stock_threshold) {
    message = 'Son ürünler.';
  }
  return { product_slug: slug, quantity, available_stock: available, can_purchase, message };
}

export function assertAdminInventoryPayload(body = {}) {
  const payload = {};
  if (body.stock_on_hand !== undefined) {
    const n = Number(body.stock_on_hand);
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('stock_on_hand geçersiz.'), { status: 400 });
    payload.stock_on_hand = Math.floor(n);
  }
  if (body.stock_reserved !== undefined) {
    const n = Number(body.stock_reserved);
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('stock_reserved geçersiz.'), { status: 400 });
    payload.stock_reserved = Math.floor(n);
  }
  if (body.low_stock_threshold !== undefined) {
    const n = Number(body.low_stock_threshold);
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('low_stock_threshold geçersiz.'), { status: 400 });
    payload.low_stock_threshold = Math.floor(n);
  }
  if (body.allow_backorder !== undefined) payload.allow_backorder = Boolean(body.allow_backorder);
  if (body.status !== undefined) {
    const status = String(body.status || '').trim();
    if (!ADMIN_STATUS.has(status)) throw Object.assign(new Error('status geçersiz.'), { status: 400 });
    payload.status = status;
  }
  if (body.sku !== undefined) payload.sku = String(body.sku || '').trim() || null;
  return payload;
}

export function normalizeMovementReason(reason = '') {
  const normalized = String(reason || '').trim() || 'manual_adjustment';
  return MOVEMENT_REASONS.has(normalized) ? normalized : 'manual_adjustment';
}

async function ensureInventoryRow(context, slug) {
  const normalized = normalizeSlug(slug);
  if (!catalogProduct(normalized)) throw Object.assign(new Error('Ürün katalogda bulunamadı.'), { status: 404 });
  const existing = await getInventoryRows(context, [normalized]).catch(() => []);
  if (existing?.[0]) return existing[0];
  const row = await insertRow(context, 'product_inventory', {
    product_slug: normalized,
    sku: normalized.toUpperCase().replace(/-/g, '_'),
    stock_on_hand: 0,
    stock_reserved: 0,
    low_stock_threshold: 5,
    allow_backorder: false,
    status: 'active'
  });
  return normalizeInventoryRow(row);
}

export async function setInventory(context, slug, payload, meta = {}) {
  const current = await ensureInventoryRow(context, slug);
  const beforeAvailable = current.available_stock;
  const nextPayload = { ...payload, updated_at: new Date().toISOString() };
  await updateRows(context, 'product_inventory', { product_slug: current.product_slug }, nextPayload);
  const updated = (await getInventoryRows(context, [current.product_slug]))[0];
  if (payload.stock_on_hand !== undefined && Number(payload.stock_on_hand) !== current.stock_on_hand) {
    await insertRow(context, 'inventory_movements', {
      product_slug: current.product_slug,
      change: Number(payload.stock_on_hand) - current.stock_on_hand,
      previous_stock_on_hand: current.stock_on_hand,
      new_stock_on_hand: Number(payload.stock_on_hand),
      reason: normalizeMovementReason(meta.reason || 'manual_adjustment'),
      note: meta.note || null,
      related_order_id: meta.related_order_id || null,
      created_by: meta.created_by || 'admin'
    }).catch(() => null);
  }
  if (beforeAvailable <= 0 && updated.available_stock > 0) await notifyRestockAlerts(context, updated.product_slug).catch(() => null);
  return updated;
}

export async function adjustInventory(context, body = {}) {
  const slug = normalizeSlug(body.product_slug || body.slug);
  const change = Math.trunc(Number(body.change));
  if (!slug) throw Object.assign(new Error('product_slug gerekli.'), { status: 400 });
  if (!Number.isFinite(change) || change === 0) throw Object.assign(new Error('change sıfır olamaz.'), { status: 400 });
  const current = await ensureInventoryRow(context, slug);
  const nextStock = current.stock_on_hand + change;
  if (nextStock < 0) throw Object.assign(new Error('Stok negatif olamaz.'), { status: 400 });
  return await setInventory(context, slug, { stock_on_hand: nextStock }, {
    reason: normalizeMovementReason(body.reason || (change > 0 ? 'supplier_restock' : 'manual_adjustment')),
    note: body.note || null,
    related_order_id: body.related_order_id || null,
    created_by: body.created_by || 'admin'
  });
}

export async function notifyRestockAlerts(context, slug) {
  const normalized = normalizeSlug(slug);
  const product = catalogProduct(normalized);
  const alerts = await selectRows(context, 'restock_alerts', {
    select: '*',
    product_slug: `eq.${normalized}`,
    status: 'eq.waiting',
    order: 'created_at.asc',
    limit: '100'
  }).catch(() => []);
  if (!alerts?.length) return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
  const productUrl = `${String(context.env.PUBLIC_SITE_URL || 'https://www.cosmoskin.com.tr').replace(/\/$/, '')}/products/${normalized}.html`;
  const summary = { attempted: alerts.length, sent: 0, skipped: 0, errors: 0 };
  for (const alert of alerts) {
    try {
      const result = await sendRestockEmail(context.env || {}, {
        to: alert.email,
        productName: product?.name || normalized,
        productImage: product?.image || '',
        productSlug: normalized,
        productUrl
      });
      if (result.sent) {
        summary.sent += 1;
        await updateRows(context, 'restock_alerts', { id: alert.id }, {
          status: 'notified',
          notified_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          last_error: null
        });
      } else {
        summary.skipped += 1;
        await updateRows(context, 'restock_alerts', { id: alert.id }, {
          last_attempt_at: new Date().toISOString(),
          last_error: result.reason || 'email_skipped'
        }).catch(() => null);
      }
    } catch (error) {
      summary.errors += 1;
      await updateRows(context, 'restock_alerts', { id: alert.id }, {
        last_attempt_at: new Date().toISOString(),
        last_error: String(error?.message || 'email_error').slice(0, 500)
      }).catch(() => null);
    }
  }
  return summary;
}


function reservationExpiry(minutes = 15) {
  return new Date(Date.now() + Math.max(1, Number(minutes || 15)) * 60 * 1000).toISOString();
}

function isMissingAtomicInventoryRpc(error) {
  return /reserve_order_inventory|release_order_inventory|convert_order_inventory|schema cache|function .* does not exist|Could not find/i.test(String(error?.message || ''));
}

function atomicInventoryError(error, operation) {
  if (isMissingAtomicInventoryRpc(error)) {
    console.error('atomic inventory RPC unavailable:', { operation, migration: '20260616_inventory_reservation_hardening.sql' });
    return Object.assign(new Error('Stok güvenlik servisi hazır değil. Sipariş oluşturulmadı; lütfen destek ekibine bilgi verin.'), {
      status: 503,
      code: 'INVENTORY_ATOMIC_RPC_MISSING'
    });
  }
  const message = String(error?.message || 'Stok işlemi tamamlanamadı.');
  const insufficient = /yeterli stok|stokta yok|satışta değil|stok kaydı bulunamadı/i.test(message);
  return Object.assign(new Error(insufficient ? message : 'Stok işlemi güvenli şekilde tamamlanamadı. Lütfen tekrar deneyin.'), {
    status: insufficient ? 409 : (error?.status || 503),
    code: insufficient ? 'INSUFFICIENT_STOCK' : (error?.code || 'INVENTORY_OPERATION_FAILED')
  });
}

export async function reserveInventoryForOrder(context, orderId, cart = [], options = {}) {
  if (!orderId) throw Object.assign(new Error('order_id gerekli.'), { status: 400, code: 'ORDER_ID_REQUIRED' });
  const normalizedItems = (cart || []).map((item) => ({
    product_slug: normalizeSlug(item.product_slug || item.slug || item.product_id || item.id),
    quantity: Math.max(1, Math.floor(Number(item.quantity ?? item.qty ?? 1) || 1)),
    product_name: item.product_name || item.name || item.product_slug || item.id || 'Ürün'
  })).filter((item) => item.product_slug && item.quantity > 0);
  if (!normalizedItems.length) throw Object.assign(new Error('Rezervasyon için ürün bulunamadı.'), { status: 400, code: 'EMPTY_RESERVATION' });

  try {
    const result = await rpc(context, 'reserve_order_inventory', {
      p_order_id: orderId,
      p_items: normalizedItems.map(({ product_slug, quantity }) => ({ product_slug, quantity })),
      p_expires_at: options.expires_at || reservationExpiry(options.minutes || 15),
      p_session_id: options.session_id || null
    });
    if (!result || result.ok === false) throw new Error('Atomic stok rezervasyonu sonuç döndürmedi.');
    return Array.isArray(result.reservations) ? result.reservations : [];
  } catch (error) {
    throw atomicInventoryError(error, 'reserve');
  }
}

export async function releaseInventoryReservations(context, orderId, reason = 'payment_failed') {
  if (!orderId) return { released: 0, idempotent: true };
  try {
    const result = await rpc(context, 'release_order_inventory', {
      p_order_id: orderId,
      p_reason: String(reason || 'payment_failed').slice(0, 120)
    });
    return result || { released: 0, idempotent: true };
  } catch (error) {
    throw atomicInventoryError(error, 'release');
  }
}

export async function convertInventoryReservations(context, orderId) {
  if (!orderId) return { converted: 0, deducted: 0, idempotent: true };
  try {
    const result = await rpc(context, 'convert_order_inventory', { p_order_id: orderId });
    return result || { converted: 0, deducted: 0, idempotent: true };
  } catch (error) {
    throw atomicInventoryError(error, 'convert');
  }
}

