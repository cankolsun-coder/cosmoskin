import { selectRows, updateRows, insertRow } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { sendOrderStatusEmail, sendShipmentEmail, sendCommerceTransactionalEmail, getCommerceEmailSubject } from '../_lib/order-email.js';
import { recordEmailEvent } from '../_lib/email-events.js';
import { convertInventoryReservations, releaseInventoryReservations } from '../_lib/inventory.js';
import { getValidatedBankAccounts } from '../_lib/bank-accounts.js';

const ORDER_SELECT = 'id,order_number,user_id,status,payment_status,fulfillment_status,payment_method,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,invoice_type,identity_number,billing_first_name,billing_last_name,billing_email,billing_phone,company_title,tax_office,tax_number,corporate_email,is_e_invoice_taxpayer,city,district,postal_code,address_line,billing_address_line,billing_city,billing_district,billing_postal_code,cargo_note,legal_consents,metadata,created_at,updated_at,paid_at,fulfilled_at,delivered_at,cancelled_at';
const ITEM_SELECT = 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total';
const SHIPMENT_SELECT = 'id,order_id,status,carrier,carrier_name,tracking_number,tracking_url,shipped_at,delivered_at,created_at,updated_at';
const INVOICE_SELECT = 'id,order_id,invoice_type,invoice_status,invoice_number,provider,provider_reference,pdf_url,issued_at,error_message,created_at,updated_at';
const RETURN_SELECT = 'id,order_id,customer_email,reason,status,customer_note,admin_note,refund_status,created_at,updated_at';
const REFUND_SELECT = 'id,order_id,return_request_id,amount,currency,status,provider,provider_reference,error_message,created_at,updated_at,completed_at';
const SHIPMENT_EVENT_SELECT = 'id,shipment_id,order_id,event_type,status,note,occurred_at,metadata';
const EVENT_SELECT = 'id,order_id,status,message,source,event_type,previous_status,new_status,note,created_by,created_at,metadata';
const EMAIL_SELECT = 'id,order_id,customer_email,email_type,provider,status,subject,provider_message_id,error_message,sent_at,created_at,metadata';

const VALID_ORDER_STATUSES = new Set(['pending_payment', 'pending_bank_transfer', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'payment_failed', 'refunded', 'partially_refunded']);
const VALID_PAYMENT_STATUSES = new Set(['pending', 'initiated', 'awaiting_transfer', 'paid', 'failed', 'refunded', 'partially_refunded']);
const VALID_FULFILLMENT = new Set(['not_started', 'unfulfilled', 'preparing', 'packed', 'shipped', 'delivered', 'returned', 'cancelled']);
const CARRIER_NAMES = new Set(['Yurtiçi Kargo','Aras Kargo','MNG Kargo','Sürat Kargo','Hepsijet','Kolay Gelsin','UPS','DHL eCommerce','DHL','Other']);

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
    const statusKey = order.status || 'pending';
    s[statusKey] = (s[statusKey] || 0) + 1;
    if (['paid', 'preparing', 'shipped', 'delivered'].includes(order.status) || order.payment_status === 'paid') s.paidRevenue += Number(order.total_amount || 0);
    if (order.payment_status === 'failed' || order.status === 'payment_failed') s.payment_failed += 1;
    return s;
  }, { total: 0, paidRevenue: 0, pending_payment: 0, pending_bank_transfer: 0, paid: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0, refunded: 0, partially_refunded: 0, payment_failed: 0 });
}
function safeStatus(value, fallback = null) {
  const status = String(value || '').trim();
  return VALID_ORDER_STATUSES.has(status) ? status : fallback;
}
function safePaymentStatus(value, fallback = null) {
  const status = String(value || '').trim();
  return VALID_PAYMENT_STATUSES.has(status) ? status : fallback;
}
function safeFulfillment(value, fallback = null) {
  const status = String(value || '').trim();
  return VALID_FULFILLMENT.has(status) ? status : fallback;
}
function shipmentSubject() { return 'Siparişin kargoya verildi'; }
function statusFromAction(action) {
  const map = {
    mark_payment_paid: { status: 'paid', payment_status: 'paid', fulfillment_status: 'preparing' },
    mark_preparing: { status: 'preparing', fulfillment_status: 'preparing' },
    mark_packed: { status: 'preparing', fulfillment_status: 'packed' },
    mark_shipped: { status: 'shipped', fulfillment_status: 'shipped' },
    mark_delivered: { status: 'delivered', fulfillment_status: 'delivered' },
    cancel_order: { status: 'cancelled', payment_status: 'failed', fulfillment_status: 'cancelled' },
    mark_bank_transfer_not_received: { status: 'cancelled', payment_status: 'failed', fulfillment_status: 'cancelled' }
  };
  return map[String(action || '')] || null;
}

function assertOperationalTransition(before = {}, next = {}) {
  const nextStatus = next.status || before.status || '';
  const nextPayment = next.payment_status || before.payment_status || '';
  const nextFulfillment = next.fulfillment_status || before.fulfillment_status || '';
  const publishAsFulfilled = ['shipped', 'delivered'].includes(String(nextStatus)) || ['shipped', 'delivered'].includes(String(nextFulfillment));
  if (String(before.status) === 'cancelled' && publishAsFulfilled) {
    const err = new Error('İptal edilmiş sipariş kargoya verildi veya teslim edildi durumuna alınamaz.');
    err.status = 409;
    throw err;
  }
  if ((String(before.payment_status) === 'failed' || String(before.status) === 'payment_failed') && publishAsFulfilled) {
    const err = new Error('Ödemesi başarısız sipariş kargoya verildi veya teslim edildi durumuna alınamaz.');
    err.status = 409;
    throw err;
  }
  if (String(before.payment_method) === 'bank_transfer' && nextPayment === 'failed' && !['cancelled', 'payment_failed'].includes(nextStatus)) {
    const err = new Error('Havale/EFT siparişi başarısız işaretlenecekse sipariş durumu da kontrollü iptal/ödeme başarısız akışına alınmalıdır.');
    err.status = 409;
    throw err;
  }
}
function buildTrackingUrl(carrier, number, manual) {
  const cleanManual = String(manual || '').trim();
  if (cleanManual) return cleanManual;
  const n = encodeURIComponent(String(number || '').trim());
  if (!n) return null;
  if (carrier === 'Yurtiçi Kargo') return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`;
  if (carrier === 'Aras Kargo') return `https://www.araskargo.com.tr/tracking?code=${n}`;
  if (carrier === 'UPS') return `https://www.ups.com/track?tracknum=${n}`;
  if (carrier === 'DHL') return `https://www.dhl.com/tr-tr/home/tracking.html?tracking-id=${n}`;
  return null;
}

async function recordShipmentEvent(context, shipment, event = {}) {
  if (!shipment?.id && !shipment?.order_id) return null;
  return await insertRow(context, 'shipment_events', {
    shipment_id: shipment.id || null,
    order_id: shipment.order_id || event.order_id || null,
    event_type: event.event_type || 'shipment_updated',
    status: event.status || shipment.status || null,
    note: event.note || null,
    metadata: event.metadata || null
  }).catch(() => null);
}


async function hydrateOrders(context, orders = []) {
  const ids = orders.map((order) => order.id).filter(Boolean);
  if (!ids.length) return [];
  const [items, shipments, events, payments, emails, invoices, returns, refunds, shipmentEvents] = await Promise.all([
    selectRows(context, 'order_items', { select: ITEM_SELECT, order_id: inFilter(ids), order: 'created_at.asc' }).catch(() => []),
    selectRows(context, 'shipments', { select: SHIPMENT_SELECT, order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'order_status_events', { select: EVENT_SELECT, order_id: inFilter(ids), order: 'created_at.asc' }).catch(() => []),
    selectRows(context, 'payments', { select: 'order_id,provider,status,amount,currency,provider_payment_id,provider_token,created_at,updated_at', order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'email_events', { select: EMAIL_SELECT, order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'invoice_records', { select: INVOICE_SELECT, order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'return_requests', { select: RETURN_SELECT, order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'refund_records', { select: REFUND_SELECT, order_id: inFilter(ids), order: 'created_at.desc' }).catch(() => []),
    selectRows(context, 'shipment_events', { select: SHIPMENT_EVENT_SELECT, order_id: inFilter(ids), order: 'occurred_at.desc' }).catch(() => [])
  ]);
  const itemMap = groupBy(items);
  const shipmentMap = groupBy((shipments || []).map((s) => ({ ...s, carrier: s.carrier || s.carrier_name || '' })));
  const eventMap = groupBy(events);
  const paymentMap = groupBy(payments);
  const emailMap = groupBy(emails);
  const invoiceMap = groupBy(invoices);
  const returnMap = groupBy(returns);
  const refundMap = groupBy(refunds);
  const shipmentEventMap = groupBy(shipmentEvents);
  return orders.map((order) => ({
    ...order,
    order_items: itemMap.get(order.id) || [],
    items: itemMap.get(order.id) || [],
    shipments: shipmentMap.get(order.id) || [],
    status_events: eventMap.get(order.id) || [],
    payments: paymentMap.get(order.id) || [],
    email_events: emailMap.get(order.id) || [],
    invoices: invoiceMap.get(order.id) || [],
    return_requests: returnMap.get(order.id) || [],
    refunds: refundMap.get(order.id) || [],
    shipment_events: shipmentEventMap.get(order.id) || [],
    item_count: (itemMap.get(order.id) || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0)
  }));
}

async function loadOrder(context, id) {
  const rows = await selectRows(context, 'orders', { select: ORDER_SELECT, id: `eq.${id}`, limit: '1' });
  const order = rows?.[0];
  if (!order) return null;
  return (await hydrateOrders(context, [order]))[0] || null;
}

async function recordEvent(context, orderId, event = {}) {
  await insertRow(context, 'order_status_events', {
    order_id: orderId,
    status: event.status || event.new_status || event.event_type || 'updated',
    source: event.source || 'admin',
    message: event.message || event.note || 'Admin panelinden durum güncellendi.',
    event_type: event.event_type || event.status || 'status_updated',
    previous_status: event.previous_status || null,
    new_status: event.new_status || event.status || null,
    note: event.note || event.message || null,
    created_by: event.created_by || 'admin',
    metadata: event.metadata || null
  }).catch(() => null);
}

async function sendAndLogShipmentEmail(context, order, shipment, emailType = 'shipment_created') {
  const subject = emailType === 'shipment_updated' ? 'Kargo bilgileriniz güncellendi' : (emailType === 'shipment_delivered' ? 'Siparişiniz teslim edildi' : shipmentSubject());
  if (!order?.customer_email) {
    await recordEmailEvent(context, { order_id: order?.id || shipment?.order_id || null, customer_email: 'missing@cosmoskin.local', email_type: emailType, status: 'skipped', subject, error_message: 'customer_email_missing', metadata: { internal: true } });
    return { sent: false, skipped: true, reason: 'customer_email_missing' };
  }
  try {
    const result = await sendShipmentEmail(context.env, { order, shipment, emailType, type: emailType });
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject,
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { shipment_id: shipment.id || null }
    });
    return result;
  } catch (error) {
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: context.env.BREVO_API_KEY ? 'brevo' : null,
      status: 'failed',
      subject,
      error_message: error.message || 'shipment_email_failed',
      metadata: { shipment_id: shipment.id || null }
    });
    return { sent: false, error: 'shipment_email_failed' };
  }
}

async function sendAndLogStatusEmail(context, order, status, emailType) {
  if (!order?.customer_email) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  const subjectMap = {
    order_created: `Siparişiniz alındı | ${order.order_number || 'COSMOSKIN'}`,
    payment_success: `Siparişiniz onaylandı | ${order.order_number || 'COSMOSKIN'}`,
    payment_confirmed_manual: `Ödemeniz onaylandı | ${order.order_number || 'COSMOSKIN'}`,
    order_preparing: `Siparişiniz hazırlanıyor | ${order.order_number || 'COSMOSKIN'}`,
    order_packed: `Siparişiniz paketlendi | ${order.order_number || 'COSMOSKIN'}`,
    payment_failed: `Ödeme işlemi tamamlanamadı | ${order.order_number || 'COSMOSKIN'}`
  };
  try {
    const result = await sendOrderStatusEmail(context.env, { order, status, items: order.order_items || [], emailType });
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject: subjectMap[emailType] || 'Sipariş durumunuz güncellendi',
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { resend: true }
    });
    return result;
  } catch (error) {
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: context.env.BREVO_API_KEY ? 'brevo' : null,
      status: 'failed',
      subject: subjectMap[emailType] || 'Sipariş durumunuz güncellendi',
      error_message: error.message || 'email_failed',
      metadata: { resend: true }
    });
    return { sent: false, error: 'email_failed' };
  }
}


async function sendAndLogCommerceEmail(context, order, emailType, note = '') {
  if (!order?.customer_email) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  try {
    const result = await sendCommerceTransactionalEmail(context.env, { order, type: emailType, note, bankAccounts: ['bank_transfer_pending','bank_transfer_reminder','bank_transfer_not_received_cancelled'].includes(emailType) ? await getValidatedBankAccounts(context, 5).catch(() => []) : [] });
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject: getCommerceEmailSubject(emailType),
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { source: 'admin_orders' }
    });
    return result;
  } catch (error) {
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: context.env.BREVO_API_KEY ? 'brevo' : null,
      status: 'failed',
      subject: getCommerceEmailSubject(emailType),
      error_message: error.message || 'email_failed',
      metadata: { source: 'admin_orders' }
    });
    return { sent: false, error: 'email_failed' };
  }
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
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
    await assertAdmin(context);
    const body = await readJsonBody(context);
    const id = body.id || body.order_id;
    if (!id) return json({ ok: false, error: 'id gerekli.' }, { status: 400 });

    const before = await loadOrder(context, id);
    if (!before) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });

    const actionPayload = statusFromAction(body.action);
    const payload = {};
    const status = safeStatus(body.status || actionPayload?.status);
    const paymentStatus = safePaymentStatus(body.payment_status || actionPayload?.payment_status);
    const fulfillment = safeFulfillment(body.fulfillment_status || actionPayload?.fulfillment_status);
    if (status) payload.status = status;
    if (paymentStatus) payload.payment_status = paymentStatus;
    if (fulfillment) payload.fulfillment_status = fulfillment;
    if (paymentStatus === 'paid') payload.paid_at = body.paid_at || before.paid_at || new Date().toISOString();
    if (status === 'shipped' || fulfillment === 'shipped') payload.fulfilled_at = body.shipped_at || before.fulfilled_at || new Date().toISOString();
    if (status === 'delivered' || fulfillment === 'delivered') payload.delivered_at = body.delivered_at || before.delivered_at || new Date().toISOString();
    if (status === 'cancelled') payload.cancelled_at = before.cancelled_at || new Date().toISOString();

    if (Object.keys(payload).length) {
      if (status === 'cancelled' && ['paid', 'refunded', 'partially_refunded'].includes(String(before.payment_status || ''))) {
        return json({ ok: false, error: 'Ödemesi alınmış sipariş doğrudan iptal edilemez. Önce kontrollü iade sürecini başlatın.' }, { status: 409 });
      }
      assertOperationalTransition(before, payload);
      // Inventory is finalized before publishing the new order state. Atomic RPCs are idempotent.
      if (status === 'cancelled') {
        await releaseInventoryReservations(context, id, 'admin_cancelled');
      } else if (paymentStatus === 'paid') {
        await convertInventoryReservations(context, id);
      }
      payload.updated_at = new Date().toISOString();
      await updateRows(context, 'orders', { id }, payload);
      await recordEvent(context, id, {
        status: status || fulfillment || paymentStatus || 'updated',
        event_type: body.action || 'status_updated',
        previous_status: before.status || null,
        new_status: status || before.status || null,
        message: body.message || 'Admin panelinden durum güncellendi.',
        note: body.message || 'Admin panelinden durum güncellendi.',
        created_by: 'admin',
        metadata: { payment_status: paymentStatus || null, fulfillment_status: fulfillment || null }
      });
      if (body.action === 'mark_bank_transfer_not_received') {
        await releaseInventoryReservations(context, id, 'bank_transfer_payment_not_received').catch(() => null);
        await updateRows(context, 'coupon_redemptions', { order_id: id }, { status: 'released', metadata: { source: 'admin_bank_transfer_not_received' } }).catch(() => null);
        const latestOrderForCancel = await loadOrder(context, id);
        await sendAndLogCommerceEmail(context, latestOrderForCancel, 'bank_transfer_not_received_cancelled', body.message || 'Havale/EFT ödemesi alınamadı.');
      }
      if (body.action === 'mark_preparing' || body.status === 'preparing' || body.fulfillment_status === 'preparing') {
        const latestOrderForPreparing = await loadOrder(context, id);
        await sendAndLogStatusEmail(context, latestOrderForPreparing, 'preparing', 'order_preparing');
      }
      if (body.action === 'mark_payment_paid' || paymentStatus === 'paid') {
        const latestOrderForPayment = await loadOrder(context, id);
        await sendAndLogStatusEmail(context, latestOrderForPayment, 'paid', 'payment_confirmed_manual');
      }
    }

    let shipment = null;
    let shipmentEmail = null;
    let shipmentMessage = null;
    if (body.carrier || body.carrier_name || body.tracking_number || body.tracking_url) {
      const shipmentPayload = {
        carrier: body.carrier || body.carrier_name || null,
        carrier_name: body.carrier_name || body.carrier || null,
        tracking_number: body.tracking_number || null,
        tracking_url: buildTrackingUrl(body.carrier_name || body.carrier || '', body.tracking_number || '', body.tracking_url || ''),
        status: body.shipment_status || 'shipped',
        shipped_at: body.shipped_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const existing = await selectRows(context, 'shipments', { select: 'id', order_id: `eq.${id}`, limit: '1' }).catch(() => []);
      const emailType = existing?.[0]?.id ? 'shipment_updated' : 'shipment_created';
      if (existing?.[0]?.id) {
        await updateRows(context, 'shipments', { id: existing[0].id }, shipmentPayload);
        shipment = { id: existing[0].id, order_id: id, ...shipmentPayload };
      } else {
        shipment = await insertRow(context, 'shipments', { order_id: id, ...shipmentPayload });
      }
      await updateRows(context, 'orders', { id }, { status: 'shipped', fulfillment_status: 'shipped', fulfilled_at: shipmentPayload.shipped_at, updated_at: new Date().toISOString() }).catch(() => null);
      await recordEvent(context, id, {
        status: 'shipped',
        event_type: emailType,
        previous_status: before.status || null,
        new_status: 'shipped',
        message: 'Kargo bilgisi kaydedildi.',
        note: 'Kargo bilgisi kaydedildi.',
        created_by: 'admin',
        metadata: { shipment_id: shipment?.id || null, carrier: shipmentPayload.carrier_name, tracking_number: shipmentPayload.tracking_number }
      });
      await recordShipmentEvent(context, shipment, { event_type: emailType, status: shipmentPayload.status, note: body.message || 'Kargo bilgisi kaydedildi.', metadata: { carrier: shipmentPayload.carrier_name, tracking_number: shipmentPayload.tracking_number } });
      const shouldNotify = body.suppress_customer_email === true ? false : body.notify_customer !== false;
      if (shouldNotify) {
        const latestOrder = await loadOrder(context, id);
        shipmentEmail = await sendAndLogShipmentEmail(context, latestOrder, shipment, emailType);
        shipmentMessage = shipmentEmail.sent ? 'Kargo bilgisi kaydedildi ve müşteriye e-posta gönderildi.' : (shipmentEmail.skipped ? 'Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.' : 'Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.');
      } else {
        shipmentEmail = { sent: false, skipped: true, reason: 'admin_suppressed' };
        await recordEmailEvent(context, {
          order_id: id,
          customer_email: before.customer_email || 'missing@cosmoskin.local',
          email_type: emailType,
          provider: null,
          status: 'skipped',
          subject: shipmentSubject(),
          error_message: 'admin_suppressed',
          metadata: { shipment_id: shipment?.id || null }
        });
        shipmentMessage = 'Kargo bilgisi kaydedildi.';
      }
    }

    let deliveredEmail = null;
    if ((body.action === 'mark_delivered' || status === 'delivered' || fulfillment === 'delivered') && !shipment) {
      const latestShipments = await selectRows(context, 'shipments', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc', limit: '1' }).catch(() => []);
      const latestShipment = latestShipments?.[0] || null;
      if (latestShipment?.id) {
        const deliveredAt = body.delivered_at || new Date().toISOString();
        await updateRows(context, 'shipments', { id: latestShipment.id }, { status: 'delivered', delivered_at: deliveredAt, updated_at: deliveredAt }).catch(() => null);
        await recordShipmentEvent(context, { ...latestShipment, status: 'delivered', delivered_at: deliveredAt }, { event_type: 'shipment_delivered', status: 'delivered', note: body.message || 'Kargo teslim edildi olarak işaretlendi.' });
      }
      const latestOrder = await loadOrder(context, id);
      deliveredEmail = await sendAndLogCommerceEmail(context, latestOrder, 'shipment_delivered', '');
    }

    const order = await loadOrder(context, id);
    return json({ ok: true, order, message: shipmentMessage || (deliveredEmail ? (deliveredEmail.sent ? 'Sipariş teslim edildi ve müşteriye e-posta gönderildi.' : 'Sipariş teslim edildi ancak e-posta gönderilemedi.') : 'Sipariş güncellendi.'), email: shipmentEmail || deliveredEmail, notification: shipmentEmail || deliveredEmail });
  } catch (error) {
    return adminError(error, 'Sipariş güncellenemedi.');
  }
}

export async function resendOrderEmail(context, orderId, emailType) {
  const order = await loadOrder(context, orderId);
  if (!order) throw Object.assign(new Error('Sipariş bulunamadı.'), { status: 404 });
  if (emailType === 'shipment_created' || emailType === 'shipment_updated') {
    const shipment = order.shipments?.[0];
    if (!shipment) throw Object.assign(new Error('Kargo bilgisi bulunamadı.'), { status: 400 });
    return await sendAndLogShipmentEmail(context, order, shipment, 'shipment_created');
  }
  if (emailType === 'shipment_delivered') return await sendAndLogCommerceEmail(context, order, 'shipment_delivered');
  if (emailType === 'payment_success') return await sendAndLogStatusEmail(context, order, 'paid', 'payment_success');
  if (emailType === 'payment_confirmed_manual') return await sendAndLogStatusEmail(context, order, 'paid', 'payment_confirmed_manual');
  if (emailType === 'bank_transfer_pending') return await sendAndLogCommerceEmail(context, order, 'bank_transfer_pending');
  if (emailType === 'bank_transfer_reminder') return await sendAndLogCommerceEmail(context, order, 'bank_transfer_reminder');
  if (emailType === 'bank_transfer_not_received_cancelled') return await sendAndLogCommerceEmail(context, order, 'bank_transfer_not_received_cancelled');
  if (emailType === 'order_preparing') return await sendAndLogStatusEmail(context, order, 'preparing', 'order_preparing');
  if (emailType === 'order_packed') return await sendAndLogStatusEmail(context, order, 'packed', 'order_packed');
  if (emailType === 'payment_failed') return await sendAndLogStatusEmail(context, order, 'payment_failed', 'payment_failed');
  if (emailType === 'order_created') return await sendAndLogStatusEmail(context, order, 'pending', 'order_created');
  throw Object.assign(new Error('email_type desteklenmiyor.'), { status: 400 });
}
