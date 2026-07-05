import { selectRows, insertRow, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { recordEmailEvent } from '../_lib/email-events.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from '../_lib/order-email.js';
import { reverseOrderPoints } from '../_lib/loyalty-ledger.js';

const STATUSES = new Set(['pending', 'completed', 'failed', 'cancelled']);
export const REFUNDABLE_PAYMENT_STATUSES = new Set(['paid', 'refunded', 'partially_refunded']);
export const REFUND_RESPONSIBILITIES = new Set(['customer_preference', 'seller_fault', 'carrier_damage', 'manual_review']);

export const SELLER_FAULT_REASON_CODES = new Set([
  'wrong_item_sent', 'missing_item', 'damaged_item', 'defective_item', 'leaked_product', 'expired_product',
  'Yanlış ürün gönderildi', 'Eksik ürün gönderildi', 'Ürün hasarlı geldi'
]);

export const CUSTOMER_PREFERENCE_REASON_CODES = new Set([
  'changed_mind', 'ordered_wrong_product', 'not_suitable', 'no_longer_needed',
  'Vazgeçtim', 'Ürün beklentimi karşılamadı'
]);

export const RETURN_REASON_TO_RESPONSIBILITY = {
  'Yanlış ürün gönderildi': 'seller_fault',
  'Eksik ürün gönderildi': 'seller_fault',
  'Ürün hasarlı geldi': 'seller_fault',
  'Vazgeçtim': 'customer_preference',
  'Ürün beklentimi karşılamadı': 'customer_preference',
  'Diğer': 'manual_review'
};

export const ERR_REFERENCE_REQUIRED = 'Tamamlanan iade için işlem referansı zorunludur.';
export const ERR_AMOUNT_INVALID = 'İade tutarı geçerli bir tutar olmalıdır.';
export const ERR_AMOUNT_EXCEEDS = 'İade tutarı kalan iade edilebilir tutarı aşamaz.';
export const ERR_NOT_REFUNDABLE = 'Bu sipariş için iade tutarı oluşturulamaz; ödeme henüz alınmamış.';
export const ERR_PAYMENT_MISMATCH = 'Ödeme tutarı sipariş toplamıyla uyuşmuyor.';
export const ERR_PRODUCT_CAP_UNKNOWN = 'Ürün iade tavanı güvenli biçimde hesaplanamadı.';
export const ERR_SHIPPING_APPROVAL_REQUIRED = 'Kargo bedeli iadesi için onay ve gerekçe zorunludur.';
export const ERR_INVALID_RESPONSIBILITY = 'İade sorumluluk kategorisi geçersiz.';

function clean(v, m = 500) { return String(v || '').trim().slice(0, m); }
function bool(v) { return v === true || v === 'true' || v === '1' || v === 'on'; }

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function sumRefundAmounts(refunds = [], statuses = new Set()) {
  const allowed = statuses instanceof Set ? statuses : new Set(statuses);
  return roundMoney(
    (refunds || [])
      .filter((row) => allowed.has(String(row?.status || '')))
      .reduce((sum, row) => sum + Math.max(0, Number(row?.amount) || 0), 0)
  ) ?? 0;
}

/** Payment gate only — not used as refund cap. */
export function resolvePaidAmount(order = {}, payments = []) {
  const paymentStatus = String(order.payment_status || '');
  if (!REFUNDABLE_PAYMENT_STATUSES.has(paymentStatus)) {
    return { ok: false, error: ERR_NOT_REFUNDABLE };
  }
  const paidAmount = roundMoney(order.total_amount);
  if (paidAmount == null || paidAmount <= 0) {
    return { ok: false, error: ERR_NOT_REFUNDABLE };
  }
  const paidPayment = (payments || []).find((row) => String(row?.status || '') === 'paid');
  if (paidPayment) {
    const paymentAmount = roundMoney(paidPayment.amount);
    if (paymentAmount != null && Math.abs(paymentAmount - paidAmount) > 0.01) {
      return { ok: false, error: ERR_PAYMENT_MISMATCH };
    }
  }
  return { ok: true, paidAmount };
}

/**
 * Product-only cap (excludes shipping). Prefer total_amount - shipping_amount;
 * fall back to subtotal_amount - discount_amount; then order_items sum capped safely.
 */
export function resolveProductRefundableCap(order = {}, orderItems = []) {
  const total = roundMoney(order.total_amount);
  const shipping = roundMoney(order.shipping_amount);
  const discount = roundMoney(order.discount_amount) ?? 0;
  const subtotal = roundMoney(order.subtotal_amount);

  if (total != null && shipping != null && total >= shipping) {
    const productCap = roundMoney(total - shipping);
    if (productCap != null && productCap >= 0) {
      return { ok: true, productCap, shippingAmount: Math.max(0, shipping), source: 'total_minus_shipping' };
    }
  }

  if (subtotal != null && subtotal >= 0) {
    const productCap = roundMoney(Math.max(0, subtotal - discount));
    if (productCap != null) {
      return {
        ok: true,
        productCap,
        shippingAmount: Math.max(0, shipping ?? 0),
        source: 'subtotal_minus_discount'
      };
    }
  }

  const linesSum = roundMoney(
    (orderItems || []).reduce((sum, row) => sum + Math.max(0, Number(row?.line_total || 0)), 0)
  );
  if (linesSum != null && linesSum > 0) {
    let productCap = linesSum;
    if (total != null && shipping != null && total >= shipping) {
      productCap = roundMoney(Math.min(linesSum, Math.max(0, total - shipping))) ?? productCap;
    }
    return {
      ok: true,
      productCap,
      shippingAmount: Math.max(0, shipping ?? 0),
      source: 'order_items_capped'
    };
  }

  return { ok: false, error: ERR_PRODUCT_CAP_UNKNOWN };
}

export function resolveRefundResponsibility(body = {}, returnRequest = null) {
  const explicit = clean(body.refund_responsibility, 40);
  if (explicit && REFUND_RESPONSIBILITIES.has(explicit)) return explicit;
  const reason = clean(returnRequest?.reason || body.return_reason, 120);
  if (reason && RETURN_REASON_TO_RESPONSIBILITY[reason]) return RETURN_REASON_TO_RESPONSIBILITY[reason];
  if (SELLER_FAULT_REASON_CODES.has(reason)) return 'seller_fault';
  if (CUSTOMER_PREFERENCE_REASON_CODES.has(reason)) return 'customer_preference';
  return 'customer_preference';
}

export function resolveShippingRefundableCap(order = {}, productCtx = {}, options = {}) {
  const shippingAmount = Math.max(0, roundMoney(productCtx.shippingAmount ?? order.shipping_amount) ?? 0);
  if (shippingAmount <= 0) return 0;

  const responsibility = options.responsibility || 'customer_preference';
  if (responsibility === 'seller_fault' || responsibility === 'carrier_damage') {
    return shippingAmount;
  }
  if (bool(options.full_order_refund)) {
    return shippingAmount;
  }
  if (responsibility === 'manual_review' && bool(options.include_shipping_refund) && clean(options.shipping_refund_reason, 500)) {
    return shippingAmount;
  }
  return 0;
}

export function computeRemainingRefundable(caps = {}, refunds = []) {
  const productRefundableCap = roundMoney(caps.productRefundableCap) ?? 0;
  const shippingRefundableCap = roundMoney(caps.shippingRefundableCap) ?? 0;
  const maxRefundable = roundMoney(productRefundableCap + shippingRefundableCap) ?? 0;
  const completedTotal = sumRefundAmounts(refunds, new Set(['completed']));
  const pendingTotal = sumRefundAmounts(refunds, new Set(['pending']));
  const remaining = roundMoney(maxRefundable - completedTotal - pendingTotal);
  return {
    productRefundableCap,
    shippingRefundableCap,
    maxRefundable,
    completedTotal,
    pendingTotal,
    remaining: Math.max(0, remaining ?? 0)
  };
}

export function validateRefundAmount(amount, balance) {
  const parsed = roundMoney(amount);
  if (parsed == null || parsed <= 0) {
    return { ok: false, error: ERR_AMOUNT_INVALID };
  }
  const remaining = roundMoney(balance?.remaining);
  if (remaining == null || parsed > remaining + 0.001) {
    return { ok: false, error: ERR_AMOUNT_EXCEEDS };
  }
  return { ok: true, amount: parsed };
}

export function buildRefundCaps(order, orderItems, options = {}, returnRequest = null) {
  const explicit = clean(options.refund_responsibility, 40);
  if (explicit && !REFUND_RESPONSIBILITIES.has(explicit)) {
    return { ok: false, error: ERR_INVALID_RESPONSIBILITY };
  }
  const responsibility = resolveRefundResponsibility(options, returnRequest);
  const product = resolveProductRefundableCap(order, orderItems);
  if (!product.ok) return product;

  if (responsibility === 'manual_review' && bool(options.include_shipping_refund) && !clean(options.shipping_refund_reason, 500)) {
    return { ok: false, error: ERR_SHIPPING_APPROVAL_REQUIRED };
  }

  const shippingRefundableCap = resolveShippingRefundableCap(order, product, {
    responsibility,
    include_shipping_refund: options.include_shipping_refund,
    shipping_refund_reason: options.shipping_refund_reason,
    full_order_refund: options.full_order_refund
  });

  return {
    ok: true,
    responsibility,
    productRefundableCap: product.productCap,
    shippingAmount: product.shippingAmount,
    shippingRefundableCap,
    productCapSource: product.source,
    shippingIncluded: shippingRefundableCap > 0
  };
}

async function loadOrder(context, id) {
  return (await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, limit: '1' }).catch(() => []))?.[0] || null;
}

async function loadOrderItems(context, orderId) {
  if (!orderId) return [];
  return await selectRows(context, 'order_items', {
    select: 'id,order_id,unit_price,quantity,line_total',
    order_id: `eq.${orderId}`,
    order: 'created_at.asc',
    limit: '100'
  }).catch(() => []);
}

async function loadReturnRequest(context, id) {
  if (!id) return null;
  const rows = await selectRows(context, 'return_requests', { select: '*', id: `eq.${id}`, limit: '1' }).catch(() => []);
  return rows?.[0] || null;
}

async function loadPayments(context, orderId) {
  if (!orderId) return [];
  return await selectRows(context, 'payments', {
    select: 'id,order_id,status,amount,currency',
    order_id: `eq.${orderId}`,
    order: 'created_at.desc',
    limit: '5'
  }).catch(() => []);
}

async function loadRefundsForOrder(context, orderId) {
  if (!orderId) return [];
  return await selectRows(context, 'refund_records', {
    select: '*',
    order_id: `eq.${orderId}`,
    order: 'created_at.desc',
    limit: '100'
  }).catch(() => []);
}

export async function loadRefundBalanceContext(context, order, options = {}) {
  const returnRequestId = clean(options.return_request_id, 120) || null;
  const [payments, refunds, orderItems, returnRequest] = await Promise.all([
    loadPayments(context, order.id),
    loadRefundsForOrder(context, order.id),
    loadOrderItems(context, order.id),
    returnRequestId ? loadReturnRequest(context, returnRequestId) : Promise.resolve(null)
  ]);

  const paid = resolvePaidAmount(order, payments);
  if (!paid.ok) return { ok: false, error: paid.error, payments, refunds, orderItems };

  const caps = buildRefundCaps(order, orderItems, options, returnRequest);
  if (!caps.ok) return { ok: false, error: caps.error, payments, refunds, orderItems };

  const balance = computeRemainingRefundable(caps, refunds);
  return {
    ok: true,
    payments,
    refunds,
    orderItems,
    returnRequest,
    paidAmount: paid.paidAmount,
    ...caps,
    ...balance
  };
}

async function logRefundEmail(context, order, result) {
  await recordEmailEvent(context, {
    order_id: order.id,
    customer_email: order.customer_email,
    email_type: 'refund_completed',
    provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
    status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
    subject: getCommerceEmailSubject('refund_completed'),
    provider_message_id: result.provider_message_id || null,
    error_message: result.reason || result.error || null,
    metadata: { source: 'admin_refunds' }
  });
}

async function findCompletedRefund(context, { returnRequestId, orderId }) {
  if (returnRequestId) {
    const rows = await selectRows(context, 'refund_records', {
      select: '*',
      return_request_id: `eq.${returnRequestId}`,
      status: 'eq.completed',
      limit: '1'
    }).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  if (orderId) {
    const rows = await selectRows(context, 'refund_records', {
      select: '*',
      order_id: `eq.${orderId}`,
      status: 'eq.completed',
      limit: '5'
    }).catch(() => []);
    if (returnRequestId) {
      return rows.find((row) => row.return_request_id === returnRequestId) || null;
    }
  }
  return null;
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'refunds:update');
    const url = new URL(context.request.url);
    const params = { select: '*', order: 'created_at.desc', limit: String(Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 100)))) };
    const orderId = clean(url.searchParams.get('order_id'), 120);
    const status = clean(url.searchParams.get('status'), 40);
    if (orderId) params.order_id = `eq.${orderId}`;
    if (status && status !== 'all') params.status = `eq.${status}`;
    const refunds = await selectRows(context, 'refund_records', params).catch(() => []);
    return json({ ok: true, refunds: refunds || [] });
  } catch (error) {
    return adminError(error, 'Refund kayıtları alınamadı.');
  }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'refunds:update');
    const body = await readJsonBody(context);
    const orderId = clean(body.order_id, 120);
    if (!orderId) return json({ ok: false, error: 'order_id gerekli.' }, { status: 400 });
    const order = await loadOrder(context, orderId);
    if (!order) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });

    const status = clean(body.status || 'pending', 40);
    if (!STATUSES.has(status)) return json({ ok: false, error: 'status geçersiz.' }, { status: 400 });

    const returnRequestId = clean(body.return_request_id, 120) || null;
    const providerReference = clean(body.provider_reference, 200);

    if (status === 'completed') {
      if (!providerReference) {
        return json({ ok: false, error: ERR_REFERENCE_REQUIRED }, { status: 400 });
      }
      const existingCompleted = await findCompletedRefund(context, { returnRequestId, orderId });
      if (existingCompleted) {
        return json({
          ok: true,
          idempotent: true,
          refund: existingCompleted,
          email: null,
          message: 'Bu iade kaydı zaten tamamlanmış.'
        });
      }
    }

    const balanceCtx = await loadRefundBalanceContext(context, order, {
      return_request_id: returnRequestId,
      refund_responsibility: body.refund_responsibility,
      include_shipping_refund: body.include_shipping_refund,
      shipping_refund_reason: body.shipping_refund_reason,
      full_order_refund: body.full_order_refund,
      return_reason: body.return_reason
    });
    if (!balanceCtx.ok) {
      return json({ ok: false, error: balanceCtx.error }, { status: 400 });
    }

    const amountCheck = validateRefundAmount(body.amount, balanceCtx);
    if (!amountCheck.ok) {
      return json({ ok: false, error: amountCheck.error }, { status: 400 });
    }

    const payload = {
      order_id: orderId,
      return_request_id: returnRequestId,
      amount: amountCheck.amount,
      currency: clean(body.currency || order.currency || 'TRY', 10),
      status,
      provider: clean(body.provider, 80) || 'manual',
      provider_reference: status === 'completed' ? providerReference : (providerReference || null),
      error_message: clean(body.error_message, 500) || null,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      metadata: {
        manual: true,
        warning: 'Gerçek Iyzico refund API çağrısı yapılmadı.',
        note: clean(body.note, 500) || null,
        remaining_refundable_before: balanceCtx.remaining,
        refund_responsibility: balanceCtx.responsibility,
        product_refundable_cap: balanceCtx.productRefundableCap,
        shipping_refundable_cap: balanceCtx.shippingRefundableCap,
        shipping_amount: balanceCtx.shippingAmount,
        shipping_included: balanceCtx.shippingIncluded,
        include_shipping_refund: bool(body.include_shipping_refund),
        shipping_refund_reason: clean(body.shipping_refund_reason, 500) || null,
        full_order_refund: bool(body.full_order_refund),
        product_cap_source: balanceCtx.productCapSource
      }
    };

    const refund = await insertRow(context, 'refund_records', payload);
    await insertRow(context, 'order_status_events', {
      order_id: orderId,
      status: 'refund_' + status,
      event_type: 'refund_' + status,
      source: 'admin',
      created_by: 'admin',
      message: 'İade ödeme kaydı oluşturuldu.',
      note: payload.metadata.note,
      metadata: {
        refund_id: refund?.id || null,
        return_request_id: payload.return_request_id,
        amount: payload.amount,
        refund_responsibility: balanceCtx.responsibility,
        shipping_included: balanceCtx.shippingIncluded
      }
    }).catch(() => null);

    if (payload.return_request_id) {
      await updateRows(context, 'return_requests', { id: payload.return_request_id }, {
        refund_status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'pending',
        status: status === 'completed' ? 'refunded' : undefined,
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }

    let email = null;
    if (status === 'completed') {
      await reverseOrderPoints(context, orderId, {
        reason: clean(body.note, 200) || 'admin_refund_completed',
        source: 'admin_refund',
        refundAmount: payload.amount
      });
      try {
        email = await sendCommerceTransactionalEmail(context.env, { order, type: 'refund_completed' });
        await logRefundEmail(context, order, email);
      } catch (error) {
        email = { sent: false, error: 'email_failed' };
        await logRefundEmail(context, order, email);
      }
    }

    return json({
      ok: true,
      refund,
      email,
      balance: {
        paid_amount: balanceCtx.paidAmount,
        product_refundable_cap: balanceCtx.productRefundableCap,
        shipping_refundable_cap: balanceCtx.shippingRefundableCap,
        shipping_amount: balanceCtx.shippingAmount,
        shipping_included: balanceCtx.shippingIncluded,
        max_refundable: balanceCtx.maxRefundable,
        completed_total: balanceCtx.completedTotal,
        pending_total: balanceCtx.pendingTotal,
        remaining_refundable: roundMoney(balanceCtx.remaining - payload.amount),
        refund_responsibility: balanceCtx.responsibility
      },
      message: 'Refund kaydı oluşturuldu. Gerçek ödeme sağlayıcı refund işlemi çalıştırılmadı.'
    });
  } catch (error) {
    return adminError(error, 'Refund kaydı oluşturulamadı.');
  }
}
