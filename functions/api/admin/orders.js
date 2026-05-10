import { selectRows, updateRows, insertRow } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { sendOrderStatusEmail } from '../_lib/order-email.js';

const ORDER_SELECT = 'id,order_number,user_id,status,payment_status,fulfillment_status,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,city,district,postal_code,address_line,cargo_note,created_at,updated_at,paid_at,fulfilled_at,delivered_at,cancelled_at';
const ITEM_SELECT = 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total';
const SHIPMENT_SELECT = 'id,order_id,status,carrier,carrier_name,tracking_number,tracking_url,shipped_at,delivered_at,created_at,updated_at';
const VALID_STATUSES = new Set(['pending_payment','paid','preparing','shipped','delivered','cancelled','payment_failed','refunded','partially_refunded']);
const VALID_FULFILLMENT = new Set(['not_started','unfulfilled','preparing','packed','shipped','delivered','cancelled','returned']);

function inFilter(values = []) { return `in.(${values.filter(Boolean).join(',')})`; }
function groupBy(arr = [], key = 'order_id') {
  return arr.reduce((map, item) => {
    const value = item?.[key];
    if (!value) return map;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(item);
    return map;
  }, new Map());
}
function buildSummary(orders = []) {
  return orders.reduce((s, order) => {
    s.total += 1;
    const statusKey = order.status || 'pending_payment';
    s[statusKey] = (s[statusKey] || 0) + 1;
    if (['paid','preparing','shipped','delivered'].includes(order.status) || order.payment_status === 'paid') s.paidRevenue += Number(order.total_amount || 0);
    return s;
  }, { total: 0, paidRevenue: 0, pending_payment: 0, paid: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0, payment_failed: 0, refunded: 0, partially_refunded: 0 });
}
function safeStatus(value, fallback = null) {
  const status = String(value || '').trim();
  return VALID_STATUSES.has(status) ? status : fallback;
}
function safeFulfillment(value, fallback = null) {
  const status = String(value || '').trim();
  return VALID_FULFILLMENT.has(status) ? status : fallback;
}

async function hydrateOrders(context, orders = []) {
  const ids = orders.map((order) => order.id).filter(Boolean);
  if (!ids.length) return [];
  const [items, shipments, events, payments] = await Promise.all([
    selectRows(context, 'order_items', { select: ITEM_SELECT, order_id: inFilter(ids), order: 'created_at.asc' }).catch(() => []),
    selectRows(context, 'shipments', { select: SHIPMENT_SELECT, order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'order_status_events', { select: 'order_id,status,message,source,created_at', order_id: inFilter(ids), order: 'created_at.asc' }).catch(() => []),
    selectRows(context, 'payments', { select: 'order_id,provider,status,amount,currency,created_at,updated_at', order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => [])
  ]);
  const itemMap = groupBy(items);
  const shipmentMap = groupBy((shipments || []).map((s) => ({ ...s, carrier: s.carrier || s.carrier_name || '' })));
  const eventMap = groupBy(events);
  const paymentMap = groupBy(payments);
  return orders.map((order) => ({
    ...order,
    order_items: itemMap.get(order.id) || [],
    items: itemMap.get(order.id) || [],
    shipments: shipmentMap.get(order.id) || [],
    status_events: eventMap.get(order.id) || [],
    payments: paymentMap.get(order.id) || [],
    item_count: (itemMap.get(order.id) || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0)
  }));
}

async function loadOrder(context, id) {
  const rows = await selectRows(context, 'orders', { select: ORDER_SELECT, id: `eq.${id}`, limit: '1' });
  const order = rows?.[0];
  if (!order) return null;
  return (await hydrateOrders(context, [order]))[0] || null;
}

async function recordEvent(context, orderId, status, message, source = 'admin') {
  await insertRow(context, 'order_status_events', { order_id: orderId, status, source, message }).catch(() => null);
}

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const url = new URL(context.request.url);
    const status = url.searchParams.get('status');
    const email = url.searchParams.get('email');
    const orderNumber = url.searchParams.get('order_number');
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 100)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const params = { select: ORDER_SELECT, order: 'created_at.desc', limit: String(limit), offset: String(offset) };
    if (status && status !== 'all') params.status = `eq.${status}`;
    if (email) params.customer_email = `ilike.*${email.replace(/[%*]/g, '')}*`;
    if (orderNumber) params.order_number = `ilike.*${orderNumber.replace(/[%*]/g, '')}*`;
    const ordersRaw = await selectRows(context, 'orders', params).catch(() => []);
    const orders = await hydrateOrders(context, ordersRaw || []);
    const summaryRows = await selectRows(context, 'orders', { select: 'id,status,fulfillment_status,payment_status,total_amount', order: 'created_at.desc', limit: '500' }).catch(() => []);
    return json({ ok: true, orders, summary: buildSummary(summaryRows || []), pagination: { limit, offset, hasMore: (ordersRaw || []).length === limit } });
  } catch (error) {
    return adminError(error, 'Siparişler alınamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    assertAdmin(context);
    const body = await readJsonBody(context);
    const id = body.id || body.order_id;
    if (!id) return json({ ok: false, error: 'id gerekli.' }, { status: 400 });
    const payload = {};
    const status = safeStatus(body.status);
    const fulfillment = safeFulfillment(body.fulfillment_status);
    if (status) payload.status = status;
    if (body.payment_status) payload.payment_status = String(body.payment_status).trim();
    if (fulfillment) payload.fulfillment_status = fulfillment;
    if (status === 'shipped' || fulfillment === 'shipped') payload.fulfilled_at = body.shipped_at || new Date().toISOString();
    if (status === 'delivered' || fulfillment === 'delivered') payload.delivered_at = body.delivered_at || new Date().toISOString();
    if (status === 'cancelled') payload.cancelled_at = new Date().toISOString();
    if (Object.keys(payload).length) {
      payload.updated_at = new Date().toISOString();
      await updateRows(context, 'orders', { id }, payload);
      await recordEvent(context, id, status || fulfillment || 'updated', body.message || 'Admin panelinden durum güncellendi.');
    }

    let shipmentWarning = null;
    if (body.carrier || body.carrier_name || body.tracking_number || body.tracking_url) {
      const shipmentPayload = {
        carrier: body.carrier || body.carrier_name || null,
        carrier_name: body.carrier_name || body.carrier || null,
        tracking_number: body.tracking_number || null,
        tracking_url: body.tracking_url || null,
        status: body.shipment_status || 'shipped',
        shipped_at: body.shipped_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const existing = await selectRows(context, 'shipments', { select: 'id', order_id: `eq.${id}`, limit: '1' }).catch(() => []);
      if (existing?.[0]?.id) await updateRows(context, 'shipments', { id: existing[0].id }, shipmentPayload);
      else await insertRow(context, 'shipments', { order_id: id, ...shipmentPayload });
      await updateRows(context, 'orders', { id }, { status: 'shipped', fulfillment_status: 'shipped', fulfilled_at: shipmentPayload.shipped_at, updated_at: new Date().toISOString() }).catch(() => null);
      await recordEvent(context, id, 'shipped', 'Kargo bilgisi admin panelinden girildi.');
      if (body.notify_customer) {
        const order = await loadOrder(context, id);
        try {
          await sendOrderStatusEmail(context.env, { order, status: 'shipped', shipment: shipmentPayload, items: order?.order_items || [] });
        } catch (error) {
          shipmentWarning = 'Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.';
        }
      }
    }

    const order = await loadOrder(context, id);
    return json({ ok: true, order, message: 'Sipariş güncellendi.', warning: shipmentWarning });
  } catch (error) {
    return adminError(error, 'Sipariş güncellenemedi.');
  }
}
