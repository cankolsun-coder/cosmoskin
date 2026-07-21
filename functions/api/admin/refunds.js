import { selectRows, insertRow, updateRows, updateRowsWhere } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { sendRefundCompletedEmailOnce } from '../_lib/lifecycle-emails.js';
import { reverseOrderPoints } from '../_lib/loyalty-ledger.js';
import { refundIyzicoPayment, extractIyzicoItemTransactions, allocateRefundAcrossTransactions } from '../_lib/iyzico.js';
import { getClientIp } from '../_lib/http.js';
import {
  isValidPricingSnapshot,
  orderItemsHaveCompleteSnapshots,
  snapshotAllocationFromOrderItem
} from '../_lib/order-pricing-snapshot.js';

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
export const ERR_PRORATION_UNSAFE = 'İade tutarı güvenli şekilde hesaplanamadı. Lütfen sipariş kalemlerini kontrol edin.';
export const ERR_AMOUNT_EXCEEDS_PAID_ITEM = 'İade tutarı müşterinin ürün için fiilen ödediği tutarı aşamaz.';

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

export function resolveOrderDiscountAmount(order = {}, couponRedemptions = []) {
  const fromOrder = roundMoney(order.discount_amount);
  if (fromOrder != null && fromOrder >= 0) {
    return { amount: fromOrder, source: 'orders.discount_amount' };
  }
  const redemption = (couponRedemptions || []).find((row) => {
    const status = String(row?.status || '');
    return status === 'used' || status === 'reserved';
  });
  const fromRedemption = roundMoney(redemption?.discount_amount);
  if (fromRedemption != null && fromRedemption >= 0) {
    return { amount: fromRedemption, source: 'coupon_redemptions.discount_amount' };
  }
  return { amount: 0, source: 'none' };
}

/**
 * Proportional discount allocation — mirrors create-checkout buildIyzicoBasketItems().
 * Last eligible line absorbs rounding remainder.
 */
export function allocateOrderDiscount(orderItems = [], discountAmount = 0, productSubtotal = null) {
  const items = (orderItems || []).filter((row) => Number(row?.line_total) > 0);
  const subtotal = roundMoney(
    productSubtotal ?? items.reduce((sum, row) => sum + Math.max(0, Number(row?.line_total) || 0), 0)
  ) ?? 0;
  const discount = roundMoney(Math.max(0, Math.min(subtotal, Number(discountAmount) || 0))) ?? 0;

  if (!items.length || subtotal <= 0 || discount <= 0) {
    return items.map((item) => {
      const lineSubtotal = roundMoney(item.line_total) ?? 0;
      return {
        orderItemId: String(item.id || ''),
        lineSubtotal,
        allocatedDiscount: 0,
        linePaidTotal: lineSubtotal,
        quantity: Math.max(1, Number(item.quantity) || 1)
      };
    });
  }

  let allocatedSum = 0;
  return items.map((item, index) => {
    const lineSubtotal = roundMoney(item.line_total) ?? 0;
    let allocatedDiscount = 0;
    if (index === items.length - 1) {
      allocatedDiscount = roundMoney(discount - allocatedSum) ?? 0;
    } else {
      allocatedDiscount = roundMoney(discount * (lineSubtotal / subtotal)) ?? 0;
      allocatedSum = roundMoney(allocatedSum + allocatedDiscount) ?? allocatedSum;
    }
    const linePaidTotal = roundMoney(Math.max(0, lineSubtotal - allocatedDiscount)) ?? 0;
    return {
      orderItemId: String(item.id || ''),
      lineSubtotal,
      allocatedDiscount,
      linePaidTotal,
      quantity: Math.max(1, Number(item.quantity) || 1)
    };
  });
}

function normalizeReturnItemsForProration(rows = []) {
  return (rows || []).map((row) => ({
    order_item_id: clean(row.order_item_id || row.id, 120) || null,
    product_slug: clean(row.product_slug || row.product_id, 180) || null,
    product_id: clean(row.product_id || row.product_slug, 180) || null,
    quantity: Math.max(0, Number(row.quantity) || 0)
  })).filter((row) => row.quantity > 0);
}

function resolveItemProratedRefundableCapFromSnapshots(order = {}, orderItems = [], normalizedReturnItems = []) {
  const items = (orderItems || []).filter((row) => Number(row?.line_total) > 0);
  if (!items.length || !orderItemsHaveCompleteSnapshots(items)) {
    return null;
  }

  const productPaidSubtotal = roundMoney(
    items.reduce((sum, row) => sum + Math.max(0, Number(row?.paid_line_total) || 0), 0)
  ) ?? 0;
  const orderProductPaid = roundMoney(
    Math.max(0, (roundMoney(order.subtotal_amount) ?? 0) - (roundMoney(order.discount_amount) ?? 0))
  );
  if (orderProductPaid != null && productPaidSubtotal > orderProductPaid + 0.01) {
    return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };
  }

  const byId = new Map();
  const bySlug = new Map();
  for (const item of items) {
    if (!isValidPricingSnapshot(item)) {
      return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };
    }
    const alloc = snapshotAllocationFromOrderItem(item);
    byId.set(String(item.id || ''), alloc);
    const slugKey = String(item.product_slug || item.product_id || '');
    if (slugKey) bySlug.set(slugKey, alloc);
  }

  let originalSubtotal = 0;
  let allocatedDiscount = 0;
  let itemCap = 0;
  let pricingSnapshotVersion = null;

  for (const ret of normalizedReturnItems) {
    const alloc = (ret.order_item_id && byId.get(String(ret.order_item_id)))
      || (ret.product_slug && bySlug.get(String(ret.product_slug)))
      || (ret.product_id && bySlug.get(String(ret.product_id)));
    if (!alloc) return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };

    const purchasedQty = Math.max(1, Number(alloc.quantity) || 1);
    const returnedQty = Number(ret.quantity);
    if (!Number.isFinite(returnedQty) || returnedQty <= 0 || returnedQty > purchasedQty) {
      return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };
    }

    const unitSubtotal = roundMoney(alloc.lineSubtotal / purchasedQty) ?? 0;
    const unitDiscount = roundMoney(alloc.allocatedDiscount / purchasedQty) ?? 0;
    const unitPaid = roundMoney(alloc.paidUnitPrice ?? (alloc.linePaidTotal / purchasedQty)) ?? 0;
    const lineRefund = roundMoney(unitPaid * returnedQty) ?? 0;

    originalSubtotal = roundMoney(originalSubtotal + unitSubtotal * returnedQty) ?? originalSubtotal;
    allocatedDiscount = roundMoney(allocatedDiscount + unitDiscount * returnedQty) ?? allocatedDiscount;
    itemCap = roundMoney(itemCap + lineRefund) ?? itemCap;
    pricingSnapshotVersion = alloc.pricingSnapshotVersion || pricingSnapshotVersion;
  }

  itemCap = roundMoney(Math.max(0, itemCap)) ?? 0;
  return {
    ok: true,
    active: true,
    itemCap,
    fallback: false,
    snapshotBacked: true,
    discountSource: 'order_items.pricing_snapshot',
    pricingSnapshotVersion,
    breakdown: {
      originalSubtotal: roundMoney(originalSubtotal) ?? 0,
      allocatedDiscount: roundMoney(allocatedDiscount) ?? 0,
      paidItemValue: itemCap
    }
  };
}

export function resolveItemProratedRefundableCap(order = {}, orderItems = [], returnItems = [], couponRedemptions = []) {
  const normalizedReturnItems = normalizeReturnItemsForProration(returnItems);
  if (!normalizedReturnItems.length) {
    return { ok: true, active: false, itemCap: null, fallback: false };
  }

  const items = (orderItems || []).filter((row) => Number(row?.line_total) > 0);
  if (!items.length) {
    return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };
  }

  const snapshotResult = resolveItemProratedRefundableCapFromSnapshots(order, items, normalizedReturnItems);
  if (snapshotResult) {
    return snapshotResult;
  }

  const linesSum = roundMoney(items.reduce((sum, row) => sum + Math.max(0, Number(row?.line_total) || 0), 0)) ?? 0;
  const orderSubtotal = roundMoney(order.subtotal_amount);
  const productSubtotal = orderSubtotal != null && orderSubtotal > 0 ? orderSubtotal : linesSum;

  if (linesSum > 0 && orderSubtotal != null && Math.abs(linesSum - orderSubtotal) > 0.01) {
    return { ok: true, active: false, itemCap: null, fallback: true, reason: 'subtotal_mismatch' };
  }

  const discount = resolveOrderDiscountAmount(order, couponRedemptions);
  const allocations = allocateOrderDiscount(items, discount.amount, productSubtotal);
  const byId = new Map(allocations.map((row) => [row.orderItemId, row]));
  const bySlug = new Map(
    items.map((item) => [String(item.product_slug || item.product_id || ''), byId.get(String(item.id || ''))]).filter(([key]) => key)
  );

  let originalSubtotal = 0;
  let allocatedDiscount = 0;
  let itemCap = 0;

  for (const ret of normalizedReturnItems) {
    const alloc = (ret.order_item_id && byId.get(String(ret.order_item_id)))
      || (ret.product_slug && bySlug.get(String(ret.product_slug)))
      || (ret.product_id && bySlug.get(String(ret.product_id)));
    if (!alloc) return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };

    const purchasedQty = Math.max(1, Number(alloc.quantity) || 1);
    const returnedQty = Number(ret.quantity);
    if (!Number.isFinite(returnedQty) || returnedQty <= 0 || returnedQty > purchasedQty) {
      return { ok: false, active: false, error: ERR_PRORATION_UNSAFE };
    }

    const unitSubtotal = roundMoney(alloc.lineSubtotal / purchasedQty) ?? 0;
    const unitDiscount = roundMoney(alloc.allocatedDiscount / purchasedQty) ?? 0;
    const unitPaid = roundMoney(alloc.linePaidTotal / purchasedQty) ?? 0;
    const lineRefund = roundMoney(unitPaid * returnedQty) ?? 0;

    originalSubtotal = roundMoney(originalSubtotal + unitSubtotal * returnedQty) ?? originalSubtotal;
    allocatedDiscount = roundMoney(allocatedDiscount + unitDiscount * returnedQty) ?? allocatedDiscount;
    itemCap = roundMoney(itemCap + lineRefund) ?? itemCap;
  }

  itemCap = roundMoney(Math.max(0, itemCap)) ?? 0;
  return {
    ok: true,
    active: true,
    itemCap,
    fallback: false,
    discountSource: discount.source,
    breakdown: {
      originalSubtotal: roundMoney(originalSubtotal) ?? 0,
      allocatedDiscount: roundMoney(allocatedDiscount) ?? 0,
      paidItemValue: itemCap
    }
  };
}

export function resolveEffectiveRemainingRefundable(balance = {}) {
  const remaining = roundMoney(balance.remaining) ?? 0;
  if (!balance.itemProrationActive || balance.itemProratedProductCap == null) {
    return remaining;
  }
  const productCap = roundMoney(balance.productRefundableCap) ?? 0;
  const shippingCap = roundMoney(balance.shippingRefundableCap) ?? 0;
  const clampedItemCap = roundMoney(Math.min(balance.itemProratedProductCap, productCap)) ?? 0;
  const itemMaxWithShipping = roundMoney(clampedItemCap + shippingCap) ?? clampedItemCap;
  return Math.max(0, Math.min(remaining, itemMaxWithShipping));
}

export function validateRefundAmount(amount, balance) {
  const parsed = roundMoney(amount);
  if (parsed == null || parsed <= 0) {
    return { ok: false, error: ERR_AMOUNT_INVALID };
  }
  const effectiveRemaining = roundMoney(balance?.effectiveRemaining ?? balance?.remaining);
  if (effectiveRemaining == null || parsed > effectiveRemaining + 0.001) {
    if (
      balance?.itemProrationActive
      && balance?.itemProratedProductCap != null
      && parsed <= (roundMoney(balance?.remaining) ?? 0) + 0.001
    ) {
      return { ok: false, error: ERR_AMOUNT_EXCEEDS_PAID_ITEM };
    }
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
    select: 'id,order_id,product_id,product_slug,unit_price,quantity,line_total,allocated_order_discount,paid_line_total,paid_unit_price,pricing_snapshot_version',
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
    select: 'id,order_id,status,amount,currency,provider,provider_payment_id,raw_callback_response',
    order_id: `eq.${orderId}`,
    order: 'created_at.desc',
    limit: '5'
  }).catch(() => []);
}

async function findRecentPendingRefund(context, { orderId, returnRequestId, windowMs = 5 * 60 * 1000 }) {
  const rows = await selectRows(context, 'refund_records', {
    select: '*',
    order_id: `eq.${orderId}`,
    status: 'eq.pending',
    order: 'created_at.desc',
    limit: '5'
  }).catch(() => []);
  const cutoff = Date.now() - windowMs;
  return (rows || []).find((row) => {
    if (returnRequestId && row.return_request_id !== returnRequestId) return false;
    const created = new Date(row.created_at || 0).getTime();
    return Number.isFinite(created) && created >= cutoff;
  }) || null;
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

async function loadReturnRequestItems(context, returnRequestId) {
  if (!returnRequestId) return [];
  return await selectRows(context, 'return_request_items', {
    select: 'id,return_request_id,order_item_id,product_id,product_slug,quantity,unit_price_snapshot,refundable_amount',
    return_request_id: `eq.${returnRequestId}`,
    order: 'created_at.asc',
    limit: '100'
  }).catch(() => []);
}

async function loadCouponRedemptions(context, orderId) {
  if (!orderId) return [];
  return await selectRows(context, 'coupon_redemptions', {
    select: 'id,order_id,code,discount_amount,status',
    order_id: `eq.${orderId}`,
    order: 'created_at.desc',
    limit: '5'
  }).catch(() => []);
}

export async function loadRefundBalanceContext(context, order, options = {}) {
  const returnRequestId = clean(options.return_request_id, 120) || null;
  const [payments, refunds, orderItems, returnRequest, couponRedemptions] = await Promise.all([
    loadPayments(context, order.id),
    loadRefundsForOrder(context, order.id),
    loadOrderItems(context, order.id),
    returnRequestId ? loadReturnRequest(context, returnRequestId) : Promise.resolve(null),
    loadCouponRedemptions(context, order.id)
  ]);

  const paid = resolvePaidAmount(order, payments);
  if (!paid.ok) return { ok: false, error: paid.error, payments, refunds, orderItems };

  const caps = buildRefundCaps(order, orderItems, options, returnRequest);
  if (!caps.ok) return { ok: false, error: caps.error, payments, refunds, orderItems };

  const balance = computeRemainingRefundable(caps, refunds);

  let returnItems = [];
  if (returnRequestId) {
    returnItems = await loadReturnRequestItems(context, returnRequestId);
    if (!returnItems.length && Array.isArray(returnRequest?.requested_items)) {
      returnItems = returnRequest.requested_items;
    }
  }

  const proration = resolveItemProratedRefundableCap(order, orderItems, returnItems, couponRedemptions);
  if (!proration.ok) {
    return { ok: false, error: proration.error, payments, refunds, orderItems, returnRequest, couponRedemptions };
  }

  const ctx = {
    ok: true,
    payments,
    refunds,
    orderItems,
    returnRequest,
    returnItems,
    couponRedemptions,
    paidAmount: paid.paidAmount,
    ...caps,
    ...balance,
    itemProrationActive: Boolean(proration.active),
    itemProrationFallback: Boolean(proration.fallback),
    itemProratedProductCap: proration.itemCap,
    itemProrationBreakdown: proration.breakdown || null,
    snapshotBacked: Boolean(proration.snapshotBacked),
    pricingSnapshotVersion: proration.pricingSnapshotVersion || null,
    discountSource: proration.discountSource || resolveOrderDiscountAmount(order, couponRedemptions).source
  };
  ctx.effectiveRemaining = resolveEffectiveRemainingRefundable(ctx);
  return ctx;
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
    const explicitProvider = clean(body.provider, 80) || null;
    const isIyzicoOrder = order.payment_method === 'iyzico';
    // Real money movement only happens when the admin marks a refund "completed"
    // on an iyzico-paid order — every other status/provider combination stays
    // manual bookkeeping (bank transfer has no refund API to call).
    const attemptRealRefund = status === 'completed' && (explicitProvider ? explicitProvider === 'iyzico' : isIyzicoOrder);

    if (status === 'completed' && !attemptRealRefund && !providerReference) {
      return json({ ok: false, error: ERR_REFERENCE_REQUIRED }, { status: 400 });
    }

    if (status === 'completed') {
      const existingCompleted = await findCompletedRefund(context, { returnRequestId, orderId });
      if (existingCompleted) {
        // E4: repeated completion callback — the dispatcher's durable claim
        // dedups (returns skipped_duplicate when the email already went out)
        // and retries a previously failed send; it can never send twice.
        const repeatEmail = await sendRefundCompletedEmailOnce(context, {
          order,
          refund: existingCompleted,
          returnRequestId: existingCompleted.return_request_id || returnRequestId || '',
          source: 'admin_refunds_repeat'
        }).catch((error) => ({ sent: false, error: error?.message || 'email_failed' }));
        return json({
          ok: true,
          idempotent: true,
          refund: existingCompleted,
          email: repeatEmail,
          message: 'Bu iade kaydı zaten tamamlanmış.'
        });
      }
    }

    if (attemptRealRefund) {
      const inFlight = await findRecentPendingRefund(context, { orderId, returnRequestId });
      if (inFlight) {
        return json({
          ok: true,
          idempotent: true,
          refund: inFlight,
          message: 'Bu iade işlemi zaten sürüyor. Lütfen kısa süre sonra admin panelinden sonucu kontrol edin.'
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
      provider: explicitProvider || (isIyzicoOrder ? 'iyzico' : 'manual'),
      provider_reference: status === 'completed' ? providerReference : (providerReference || null),
      error_message: clean(body.error_message, 500) || null,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      metadata: {
        manual: !attemptRealRefund,
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
        product_cap_source: balanceCtx.productCapSource,
        item_proration_active: balanceCtx.itemProrationActive,
        item_proration_fallback: balanceCtx.itemProrationFallback,
        item_prorated_product_cap: balanceCtx.itemProratedProductCap,
        item_proration_breakdown: balanceCtx.itemProrationBreakdown,
        discount_source: balanceCtx.discountSource,
        snapshot_backed: balanceCtx.snapshotBacked,
        pricing_snapshot_version: balanceCtx.pricingSnapshotVersion,
        effective_remaining_before: balanceCtx.effectiveRemaining
      }
    };

    let refund;
    if (attemptRealRefund) {
      refund = await insertRow(context, 'refund_records', {
        ...payload,
        status: 'pending',
        provider_reference: null,
        completed_at: null
      });
      try {
        const iyzicoPayment = (balanceCtx.payments || []).find((p) => p.provider === 'iyzico' && p.status === 'paid')
          || (balanceCtx.payments || []).find((p) => p.provider === 'iyzico');
        if (!iyzicoPayment) throw new Error('iyzico ödeme kaydı bulunamadı.');
        const itemTransactions = extractIyzicoItemTransactions(iyzicoPayment.raw_callback_response);
        if (!itemTransactions.length) {
          throw new Error('iyzico işlem detayları bulunamadı (itemTransactions eksik). Otomatik refund yapılamadı, lütfen manuel işleyin.');
        }
        const { allocations, remainder } = allocateRefundAcrossTransactions(itemTransactions, payload.amount);
        if (!allocations.length || remainder > 0.01) {
          throw new Error('İade tutarı iyzico işlem tutarlarıyla tam eşleşmiyor. Otomatik refund yapılamadı, lütfen manuel işleyin.');
        }
        const ip = getClientIp(context.request);
        const providerResponses = [];
        for (const allocation of allocations) {
          const response = await refundIyzicoPayment(context.env || {}, {
            paymentTransactionId: allocation.paymentTransactionId,
            price: allocation.amount,
            ip,
            currency: payload.currency,
            conversationId: orderId,
            description: clean(body.note, 200) || null
          });
          providerResponses.push({ paymentTransactionId: allocation.paymentTransactionId, amount: allocation.amount, response });
        }
        const derivedReference = providerResponses.map((r) => r.paymentTransactionId).join(',');
        const [updated] = await updateRowsWhere(context, 'refund_records', { id: `eq.${refund.id}` }, {
          status: 'completed',
          provider_reference: derivedReference || null,
          completed_at: new Date().toISOString(),
          metadata: { ...payload.metadata, provider_response: providerResponses }
        });
        refund = updated || { ...refund, status: 'completed', provider_reference: derivedReference || null };
      } catch (refundError) {
        const message = String(refundError?.message || 'iyzico refund çağrısı başarısız oldu.').slice(0, 500);
        const [updated] = await updateRowsWhere(context, 'refund_records', { id: `eq.${refund.id}` }, {
          status: 'failed',
          error_message: message,
          metadata: { ...payload.metadata, provider_error: message }
        }).catch(() => []);
        refund = updated || { ...refund, status: 'failed', error_message: message };
        await insertRow(context, 'order_status_events', {
          order_id: orderId,
          status: 'refund_failed',
          event_type: 'refund_failed',
          source: 'admin',
          created_by: 'admin',
          message: 'iyzico refund çağrısı başarısız oldu.',
          note: message,
          metadata: { refund_id: refund?.id || null, return_request_id: payload.return_request_id, amount: payload.amount }
        }).catch(() => null);
        return json({ ok: false, error: message, refund, code: 'IYZICO_REFUND_FAILED' }, { status: 502 });
      }
    } else {
      refund = await insertRow(context, 'refund_records', payload);
    }

    await insertRow(context, 'order_status_events', {
      order_id: orderId,
      status: 'refund_' + refund.status,
      event_type: 'refund_' + refund.status,
      source: 'admin',
      created_by: 'admin',
      message: attemptRealRefund ? 'İade iyzico üzerinden tamamlandı.' : 'İade ödeme kaydı oluşturuldu.',
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
        refund_status: refund.status === 'completed' ? 'completed' : refund.status === 'failed' ? 'failed' : 'pending',
        status: refund.status === 'completed' ? 'refunded' : undefined,
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }

    let email = null;
    if (refund.status === 'completed') {
      await reverseOrderPoints(context, orderId, {
        reason: clean(body.note, 200) || 'admin_refund_completed',
        source: 'admin_refund',
        refundAmount: payload.amount
      });
      // E4: idempotent dispatch — exactly one customer email per refund even
      // when the returns endpoint also fires for the same refund; a send
      // failure is logged for retry and never rolls back the refund above.
      email = await sendRefundCompletedEmailOnce(context, {
        order,
        refund,
        returnRequestId: payload.return_request_id || '',
        source: 'admin_refunds'
      }).catch((error) => ({ sent: false, error: error?.message || 'email_failed' }));
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
        remaining_refundable: roundMoney((balanceCtx.effectiveRemaining ?? balanceCtx.remaining) - payload.amount),
        refund_responsibility: balanceCtx.responsibility,
        item_prorated_product_cap: balanceCtx.itemProratedProductCap,
        item_proration_active: balanceCtx.itemProrationActive,
        item_proration_fallback: balanceCtx.itemProrationFallback,
        snapshot_backed: balanceCtx.snapshotBacked,
        pricing_snapshot_version: balanceCtx.pricingSnapshotVersion,
        discount_source: balanceCtx.discountSource,
        effective_remaining_before: balanceCtx.effectiveRemaining
      },
      message: attemptRealRefund
        ? 'İade iyzico üzerinden başarıyla tamamlandı.'
        : (refund.status === 'completed' ? 'Refund kaydı tamamlandı olarak işaretlendi.' : 'Refund kaydı oluşturuldu.')
    });
  } catch (error) {
    return adminError(error, 'Refund kaydı oluşturulamadı.');
  }
}
