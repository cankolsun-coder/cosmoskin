import { insertRow, selectRows, updateRows } from './supabase.js';
import { releaseInventoryReservations, restockCancelledOrderInventory, releaseOrderItemInventory } from './inventory.js';
import { cleanString } from './account.js';
import { sendOrderStatusEmail, getCommerceEmailSubject } from './order-email.js';
import { recordEmailEvent } from './email-events.js';
import { releaseOrderCouponUsage } from './commerce-finalization.js';
import { reverseOrderPoints } from './loyalty-ledger.js';

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
// P1: paid-but-not-yet-shipped statuses eligible for immediate customer
// cancellation (payment stays captured; refund is a separate admin step —
// see executeDirectCancel). Renamed conceptually from the old
// "cancel request" set now that these cancel directly instead of queuing.
export const PAID_DIRECT_CANCEL_STATUSES = new Set(['paid', 'confirmed', 'preparing', 'packed']);

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
}

// P1: every eligible order now cancels immediately in one step — paid orders
// included. A paid order keeps payment_status='paid' after cancelling
// (money was actually captured); the refund itself is a separate,
// explicit admin action (functions/api/admin/refunds.js), which already
// calls the real iyzico refund API in one click.
export function resolveCancelMode(order = {}, shipments = [], returnRows = []) {
  if (isTerminalCancelled(order)) {
    return { mode: 'direct', alreadyCancelled: true };
  }

  assertHardBlocks(order, shipments, returnRows);

  const status = String(order.status || '').toLowerCase();
  const payment = String(order.payment_status || '').toLowerCase();

  if (['refunded', 'partially_refunded'].includes(payment)) {
    throw new OrderCancellationError('Bu sipariş durumunda iptal işlemi yapılamaz.', 409);
  }

  const directEligible =
    DIRECT_CANCEL_ORDER_STATUSES.has(status)
    || DIRECT_CANCEL_PAYMENT_STATUSES.has(payment)
    || (payment === 'paid' && PAID_DIRECT_CANCEL_STATUSES.has(status));

  if (directEligible) {
    return { mode: 'direct', alreadyCancelled: false };
  }

  throw new OrderCancellationError('Bu sipariş şu anda iptal edilemiyor.', 409);
}

export function evaluateCancelEligibility(order = {}, shipments = [], returnRows = []) {
  try {
    const resolved = resolveCancelMode(order, shipments, returnRows);
    if (resolved.alreadyCancelled) {
      return { canDirectCancel: false, canRequestCancel: false, alreadyCancelled: true, cancelRequested: false };
    }
    if (resolved.mode === 'direct') {
      return { canDirectCancel: true, canRequestCancel: false, alreadyCancelled: false, cancelRequested: false };
    }
    return { canDirectCancel: false, canRequestCancel: false, alreadyCancelled: false, cancelRequested: false };
  } catch (_) {
    return {
      canDirectCancel: false,
      canRequestCancel: false,
      alreadyCancelled: isTerminalCancelled(order),
      cancelRequested: false
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
  const wasPaid = String(order.payment_status || '').toLowerCase() === 'paid';

  if (wasPaid) {
    // Stock was already converted (permanently deducted) at payment time —
    // add it back. Payment itself is left alone; it genuinely succeeded and
    // the money is still with COSMOSKIN, so this is a refund-owed order now,
    // not a failed payment.
    await restockCancelledOrderInventory(context, order.id, 'customer_cancelled_after_payment');
    await reverseOrderPoints(context, order.id, {
      reason: reason || 'customer_cancelled_paid_order',
      source: 'customer',
      ratio: 1
    });
  } else {
    await releaseInventoryReservations(context, order.id, 'customer_cancelled');
    await failOpenPayments(context, order.id);
  }
  await releaseOrderCouponUsage(context, order.id, { source: 'customer_cancelled' });

  await updateRows(context, 'orders', { id: order.id }, {
    status: 'cancelled',
    payment_status: wasPaid ? 'paid' : 'failed',
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
    message: wasPaid
      ? 'Müşteri ödenmiş siparişi iptal etti; refund admin onayı bekliyor.'
      : 'Müşteri siparişi iptal etti.',
    note: reason || null,
    metadata: { cancelled_by: 'customer', cancel_reason: reason || null, was_paid: wasPaid, refund_pending: wasPaid }
  });

  await sendOrderCancelledEmailSafely(context, { ...order, status: 'cancelled', cancel_reason: reason || order.cancel_reason || null }, reason);

  return {
    ok: true,
    mode: 'direct',
    alreadyCancelled: false,
    message: wasPaid
      ? 'Siparişiniz iptal edildi. Ödemeniz alınmıştı; iade süreci ekibimiz tarafından kısa süre içinde başlatılacak.'
      : 'Siparişiniz iptal edildi.'
  };
}

// P1: cancel a single line item within a multi-item order instead of the
// whole order. Callers MUST already have validated order-level eligibility
// via resolveCancelMode()/assertHardBlocks() (same contract as
// executeDirectCancel's caller in account/orders/[id]/cancel.js) — this
// function only handles the item-level branching on top of that.
// Mirrors the KDV-dahil totals math in functions/api/create-checkout.js
// (VAT_RATE 0.20, FREE_SHIPPING_LIMIT 2500, vat = discountedSubtotal·0.2/1.2).
// Karar A: the free shipping earned at checkout is preserved — cancelling items
// never adds a shipping fee, so shipping_amount is carried over unchanged.
// Karar B: the coupon is not voided — the discount that was allocated to the
// cancelled line is dropped (via paid_line_total snapshots) and the remaining
// lines keep their share.
const CANCEL_VAT_RATE = 0.20;
function roundMoney(value) { return Math.round((Number(value) || 0) * 100) / 100; }
export function recomputeActiveOrderTotals(activeItems, order = {}) {
  const items = Array.isArray(activeItems) ? activeItems : [];
  const subtotal = roundMoney(items.reduce((sum, it) => sum + Math.max(0, Number(it.line_total) || 0), 0));
  const hasSnapshots = items.length > 0 && items.every((it) => {
    const paid = Number(it.paid_line_total);
    return Number.isFinite(paid) && paid >= 0;
  });
  let discount;
  let discountedSubtotal;
  if (hasSnapshots) {
    discountedSubtotal = roundMoney(items.reduce((sum, it) => sum + Math.max(0, Number(it.paid_line_total) || 0), 0));
    discount = roundMoney(Math.max(0, subtotal - discountedSubtotal));
  } else {
    // No per-line snapshots: scale the original order discount proportionally.
    const origSubtotal = roundMoney(Number(order.subtotal_amount) || 0) || subtotal;
    const origDiscount = roundMoney(Number(order.discount_amount) || 0);
    discount = origSubtotal > 0 ? roundMoney(Math.min(subtotal, origDiscount * (subtotal / origSubtotal))) : 0;
    discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  }
  const shipping = roundMoney(Number(order.shipping_amount) || 0); // Karar A
  const vat = roundMoney((discountedSubtotal * CANCEL_VAT_RATE) / (1 + CANCEL_VAT_RATE));
  const total = roundMoney(Math.max(0, discountedSubtotal + shipping));
  return { subtotal_amount: subtotal, discount_amount: discount, shipping_amount: shipping, vat_amount: vat, total_amount: total };
}

export async function executeItemCancel(context, order, orderItems, targetItemId, { reason = null } = {}) {
  const items = Array.isArray(orderItems) ? orderItems : [];
  const target = items.find((item) => String(item.id) === String(targetItemId));
  if (!target) {
    throw new OrderCancellationError('Sipariş kalemi bulunamadı.', 404, 'ORDER_ITEM_NOT_FOUND');
  }
  if (target.cancelled_at) {
    return { ok: true, alreadyCancelled: true, wholeOrderCancelled: false, message: 'Bu ürün zaten iptal edilmiş.' };
  }

  const activeItems = items.filter((item) => !item.cancelled_at);
  if (activeItems.length <= 1) {
    // Cancelling the only remaining active line is just a whole-order cancel.
    const result = await executeDirectCancel(context, order, { reason });
    return { ...result, wholeOrderCancelled: true };
  }

  const now = new Date().toISOString();
  const wasPaid = String(order.payment_status || '').toLowerCase() === 'paid';

  await releaseOrderItemInventory(
    context,
    order.id,
    target.product_slug,
    wasPaid ? 'customer_cancelled_item_after_payment' : 'customer_cancelled_item'
  );

  if (wasPaid) {
    const itemValue = Number(target.paid_line_total ?? target.line_total ?? 0);
    await reverseOrderPoints(context, order.id, {
      reason: reason || 'customer_cancelled_item',
      source: 'customer',
      refundAmount: itemValue
    });
  }

  await updateRows(context, 'order_items', { id: target.id }, {
    cancelled_at: now,
    cancel_reason: reason || null
  });

  // Unpaid orders (bank transfer / awaiting payment): the customer still owes
  // money, so recompute the amount due from the remaining active lines. Paid
  // orders keep total_amount as captured — the cancelled line becomes a pending
  // refund handled by admin/refunds.js instead.
  let recomputedTotals = null;
  if (!wasPaid && !order.paid_at) {
    const remainingActive = activeItems.filter((item) => String(item.id) !== String(target.id));
    if (remainingActive.length) {
      recomputedTotals = recomputeActiveOrderTotals(remainingActive, order);
      await updateRows(context, 'orders', { id: order.id }, {
        subtotal_amount: recomputedTotals.subtotal_amount,
        vat_amount: recomputedTotals.vat_amount,
        shipping_amount: recomputedTotals.shipping_amount,
        discount_amount: recomputedTotals.discount_amount,
        total_amount: recomputedTotals.total_amount,
        updated_at: now
      });
    }
  }

  await recordCustomerEvent(context, order.id, {
    status: order.status || 'updated',
    event_type: 'cancel_order_item',
    previous_status: order.status || null,
    new_status: order.status || null,
    message: `Müşteri tek bir ürünü iptal etti: ${target.product_name || target.product_slug || target.id}.`,
    note: reason || null,
    metadata: {
      order_item_id: target.id,
      product_slug: target.product_slug || null,
      product_name: target.product_name || null,
      quantity: target.quantity || null,
      was_paid: wasPaid,
      refund_pending: wasPaid,
      refundable_amount: wasPaid ? Number(target.paid_line_total ?? target.line_total ?? 0) : 0,
      previous_order_total: recomputedTotals ? Number(order.total_amount || 0) : null,
      new_order_total: recomputedTotals ? recomputedTotals.total_amount : null
    }
  });

  return {
    ok: true,
    alreadyCancelled: false,
    wholeOrderCancelled: false,
    orderTotal: recomputedTotals ? recomputedTotals.total_amount : null,
    message: wasPaid
      ? 'Ürün siparişinizden iptal edildi. Ödenen tutar için iade süreci ekibimiz tarafından kısa süre içinde başlatılacak.'
      : 'Ürün siparişinizden iptal edildi.'
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
