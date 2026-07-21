import { insertRow, selectRows, updateRows } from './supabase.js';
import { releaseInventoryReservations } from './inventory.js';
import { cleanString } from './account.js';
import { sendOrderStatusEmail, getCommerceEmailSubject } from './order-email.js';
import { recordEmailEvent } from './email-events.js';

export const BLOCKED_ORDER_STATUSES = new Set([
  'shipped', 'delivered', 'cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned'
]);
export const BLOCKED_FULFILLMENT_STATUSES = new Set(['shipped', 'delivered', 'returned', 'cancelled']);
export const SHIPPED_SHIPMENT_STATUSES = new Set(['shipped', 'delivered']);
export const ACTIVE_RETURN_STATUSES = new Set([
  'requested', 'under_review', 'approved', 'return_code_shared', 'waiting_customer_ship',
  'in_transit', 'received', 'inspection', 'refund_pending'
]);
export const DIRECT_CANCEL_ORDER_STATUSES = new Set([
  'pending', 'pending_payment', 'pending_bank_transfer', 'payment_failed'
]);
export const DIRECT_CANCEL_PAYMENT_STATUSES = new Set([
  'pending', 'initiated', 'awaiting_transfer', 'failed', 'authorized'
]);
export const CANCEL_REQUEST_ORDER_STATUSES = new Set(['paid', 'confirmed', 'preparing', 'packed']);
export const PAID_PAYMENT_STATUSES = new Set(['paid', 'refunded', 'partially_refunded']);

const ALLOWED_REASONS = new Set([
  'Vazgeçtim',
  'Yanlış ürün seçtim',
  'Yanlış adres',
  'Ödeme yöntemini değiştirmek istiyorum',
  'Diğer'
]);

export function cleanCancelReason(value) {
  const reason = cleanString(value || '', 240);
  if (!reason) return null;
  if (ALLOWED_REASONS.has(reason)) return reason;
  return reason.slice(0, 240);
}

export function hasBlockingShipment(shipments = []) {
  return (shipments || []).some((row) => {
    const status = String(row?.status || '').toLowerCase();
    const tracking = String(row?.tracking_number || '').trim();
    return SHIPPED_SHIPMENT_STATUSES.has(status) || Boolean(tracking);
  });
}

export function hasActiveReturn(returnRows = []) {
  return (returnRows || []).some((row) => ACTIVE_RETURN_STATUSES.has(String(row?.status || '').toLowerCase()));
}

export function isTerminalCancelled(order = {}) {
  const status = String(order.status || '').toLowerCase();
  const fulfillment = String(order.fulfillment_status || '').toLowerCase();
  return status === 'cancelled' || (status === 'payment_failed' && fulfillment === 'cancelled');
}

export class OrderCancellationError extends Error {
  constructor(message, status = 409, code = 'ORDER_CANCEL_BLOCKED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assertHardBlocks(order = {}, shipments = [], returnRows = []) {
  const status = String(order.status || '').toLowerCase();
  const fulfillment = String(order.fulfillment_status || '').toLowerCase();
  const payment = String(order.payment_status || '').toLowerCase();

  if (BLOCKED_ORDER_STATUSES.has(status)) {
    throw new OrderCancellationError('Bu sipariş durumunda iptal işlemi yapılamaz.', 409);
  }
  if (BLOCKED_FULFILLMENT_STATUSES.has(fulfillment)) {
    throw new OrderCancellationError('Kargoya verilmiş veya tamamlanmış siparişler iptal edilemez.', 409);
  }
  if (hasBlockingShipment(shipments)) {
    throw new OrderCancellationError('Kargo bilgisi oluşmuş siparişler iptal edilemez.', 409);
  }
  if (hasActiveReturn(returnRows)) {
    throw new OrderCancellationError('Aktif iade talebi bulunan siparişler için iptal işlemi yapılamaz.', 409);
  }
  if (payment === 'paid' && order.cancel_requested_at) {
    throw new OrderCancellationError('Bu sipariş için iptal talebiniz zaten alınmış.', 409);
  }
}

export function resolveCancelMode(order = {}, shipments = [], returnRows = []) {
  if (isTerminalCancelled(order)) {
    return { mode: 'direct', alreadyCancelled: true };
  }

  assertHardBlocks(order, shipments, returnRows);

  const status = String(order.status || '').toLowerCase();
  const payment = String(order.payment_status || '').toLowerCase();

  if (payment === 'paid') {
    if (CANCEL_REQUEST_ORDER_STATUSES.has(status) && !order.cancel_requested_at) {
      return { mode: 'request', alreadyCancelled: false };
    }
    throw new OrderCancellationError('Ödemesi alınmış bu sipariş doğrudan iptal edilemez. İptal talebi için uygun değilse destek ekibiyle iletişime geçin.', 409);
  }

  if (['refunded', 'partially_refunded'].includes(payment)) {
    throw new OrderCancellationError('Bu sipariş durumunda iptal işlemi yapılamaz.', 409);
  }

  const directEligible =
    DIRECT_CANCEL_ORDER_STATUSES.has(status)
    || DIRECT_CANCEL_PAYMENT_STATUSES.has(payment);

  if (directEligible) {
    return { mode: 'direct', alreadyCancelled: false };
  }

  throw new OrderCancellationError('Bu sipariş şu anda iptal edilemiyor.', 409);
}

export function evaluateCancelEligibility(order = {}, shipments = [], returnRows = []) {
  try {
    const resolved = resolveCancelMode(order, shipments, returnRows);
    if (resolved.alreadyCancelled) {
      return { canDirectCancel: false, canRequestCancel: false, alreadyCancelled: true, cancelRequested: Boolean(order.cancel_requested_at) };
    }
    if (resolved.mode === 'direct') {
      return { canDirectCancel: true, canRequestCancel: false, alreadyCancelled: false, cancelRequested: false };
    }
    if (resolved.mode === 'request') {
      return { canDirectCancel: false, canRequestCancel: true, alreadyCancelled: false, cancelRequested: false };
    }
    return { canDirectCancel: false, canRequestCancel: false, alreadyCancelled: false, cancelRequested: Boolean(order.cancel_requested_at) };
  } catch (_) {
    return {
      canDirectCancel: false,
      canRequestCancel: false,
      alreadyCancelled: isTerminalCancelled(order),
      cancelRequested: Boolean(order.cancel_requested_at)
    };
  }
}

async function recordCustomerEvent(context, orderId, payload = {}) {
  await insertRow(context, 'order_status_events', {
    order_id: orderId,
    status: payload.status || 'updated',
    event_type: payload.event_type || 'status_updated',
    previous_status: payload.previous_status || null,
    new_status: payload.new_status || null,
    source: 'customer',
    created_by: 'customer',
    message: payload.message || '',
    note: payload.note || null,
    metadata: payload.metadata || {}
  }).catch(() => null);
}

async function releaseCouponRedemptions(context, orderId) {
  await updateRows(context, 'coupon_redemptions', { order_id: orderId }, {
    status: 'released',
    metadata: { source: 'customer_cancelled' },
    updated_at: new Date().toISOString()
  }).catch(() => null);
}

async function sendOrderCancelledEmailSafely(context, order, note = '') {
  const customerEmail = String(order?.customer_email || '').trim().toLowerCase();
  if (!customerEmail) return;
  const subject = getCommerceEmailSubject('order_cancelled');
  try {
    const result = await sendOrderStatusEmail(context.env, { order, status: 'cancelled', emailType: 'order_cancelled' });
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: customerEmail,
      email_type: 'order_cancelled',
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject,
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { source: 'customer_cancellation', note: note || null }
    });
  } catch (error) {
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: customerEmail,
      email_type: 'order_cancelled',
      provider: context.env.BREVO_API_KEY ? 'brevo' : null,
      status: 'failed',
      subject,
      error_message: String(error?.message || 'order_cancelled_email_failed').slice(0, 500),
      metadata: { source: 'customer_cancellation' }
    }).catch(() => null);
  }
}

async function failOpenPayments(context, orderId) {
  const rows = await selectRows(context, 'payments', {
    select: 'id,status',
    order_id: `eq.${orderId}`
  }).catch(() => []);
  for (const row of rows || []) {
    const status = String(row.status || '').toLowerCase();
    if (['paid', 'refunded', 'partially_refunded'].includes(status)) continue;
    await updateRows(context, 'payments', { id: row.id }, {
      status: 'failed',
      updated_at: new Date().toISOString()
    }).catch(() => null);
  }
}

export async function executeDirectCancel(context, order, { reason = null } = {}) {
  if (isTerminalCancelled(order)) {
    return {
      ok: true,
      mode: 'direct',
      alreadyCancelled: true,
      message: 'Sipariş zaten iptal edilmiş.'
    };
  }

  const now = new Date().toISOString();
  await releaseInventoryReservations(context, order.id, 'customer_cancelled');
  await releaseCouponRedemptions(context, order.id);
  await failOpenPayments(context, order.id);

  await updateRows(context, 'orders', { id: order.id }, {
    status: 'cancelled',
    payment_status: 'failed',
    fulfillment_status: 'cancelled',
    cancelled_at: order.cancelled_at || now,
    cancelled_by: 'customer',
    cancel_reason: reason || order.cancel_reason || null,
    cancellation_status: 'cancelled',
    updated_at: now
  });

  await recordCustomerEvent(context, order.id, {
    status: 'cancelled',
    event_type: 'cancel_order',
    previous_status: order.status || null,
    new_status: 'cancelled',
    message: 'Müşteri siparişi iptal etti.',
    note: reason || null,
    metadata: { cancelled_by: 'customer', cancel_reason: reason || null }
  });

  await sendOrderCancelledEmailSafely(context, { ...order, status: 'cancelled', cancel_reason: reason || order.cancel_reason || null }, reason);

  return {
    ok: true,
    mode: 'direct',
    alreadyCancelled: false,
    message: 'Siparişiniz iptal edildi.'
  };
}

export async function executeCancelRequest(context, order, { reason = null } = {}) {
  if (order.cancel_requested_at) {
    return {
      ok: true,
      mode: 'request',
      alreadyRequested: true,
      message: 'İptal talebiniz zaten alınmış.'
    };
  }

  const now = new Date().toISOString();
  await updateRows(context, 'orders', { id: order.id }, {
    cancel_requested_at: now,
    cancel_request_reason: reason || null,
    cancellation_status: 'request_pending',
    updated_at: now
  });

  await recordCustomerEvent(context, order.id, {
    status: 'refund_pending',
    event_type: 'customer_cancel_requested',
    previous_status: order.status || null,
    new_status: order.status || null,
    message: 'Müşteri kargoya verilmeden önce iptal talebi oluşturdu.',
    note: reason || null,
    metadata: { cancel_request_reason: reason || null, cancellation_status: 'request_pending' }
  });

  return {
    ok: true,
    mode: 'request',
    alreadyRequested: false,
    message: 'İptal talebiniz alındı. Siparişiniz henüz kargoya verilmediği için talebiniz ekibimiz tarafından incelenecek. Ödeme alındıysa ücret iadesi kontrol sonrası başlatılır.'
  };
}

export async function loadOwnedOrderBundle(context, orderId, user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const order = (await selectRows(context, 'orders', {
    select: '*',
    id: `eq.${orderId}`,
    limit: '1'
  }).catch(() => []))?.[0];

  if (!order) return null;

  const owned =
    String(order.user_id || '') === String(user.id)
    || (email && String(order.customer_email || '').trim().toLowerCase() === email);

  if (!owned) return null;

  const [shipments, returnRows] = await Promise.all([
    selectRows(context, 'shipments', {
      select: 'id,order_id,status,tracking_number,tracking_url,shipped_at,delivered_at',
      order_id: `eq.${orderId}`,
      order: 'created_at.desc'
    }).catch(() => []),
    selectRows(context, 'return_requests', {
      select: 'id,order_id,status',
      order_id: `eq.${orderId}`,
      order: 'created_at.desc'
    }).catch(() => [])
  ]);

  return { order, shipments: shipments || [], returnRows: returnRows || [] };
}
