// COSMOSKIN B1/B2 — shared commerce finalization helpers.
//
// finalizeCommerceAfterPayment() and ensureShipmentShell() were moved here
// verbatim from functions/api/iyzico-callback.js (byte-identical function
// bodies — see COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_PLAN_20260705.md §4).
// iyzico-callback.js now imports both from this file instead of defining
// them locally; card payment behavior is unchanged by this move.
//
// confirmManualBankTransferPayment() (B1) is the manual/admin-approval
// equivalent of the payments/payment_events/coupon/invoice steps the iyzico
// callback performs for card payments, reusing finalizeCommerceAfterPayment()
// and ensureShipmentShell() rather than duplicating their logic. It is never
// called from iyzico-callback.js and never touches card-payment orders.
//
// rejectManualBankTransferPayment() (B2) is the manual/admin-rejection
// counterpart — see COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_PLAN_20260705.md.
// B2 owns bank-transfer rejection/cancellation finalization from this point
// forward; it deliberately never calls finalizeCommerceAfterPayment() or
// ensureShipmentShell() (no invoice shell, no loyalty award, no shipment
// shell for a payment that never completed), and never touches
// confirmManualBankTransferPayment(), finalizeCommerceAfterPayment(),
// ensureShipmentShell(), or iyzico-callback.js.

import { insertRow, selectRows, updateRows } from './supabase.js';
import { awardOrderPoints } from './loyalty-ledger.js';
import { convertInventoryReservations, releaseInventoryReservations } from './inventory.js';

export async function ensureShipmentShell(context, orderId) {
  if (!orderId) return;
  try {
    const existing = await selectRows(context, 'shipments', {
      select: 'id',
      order_id: `eq.${orderId}`,
      limit: '1'
    });
    if (Array.isArray(existing) && existing.length) return;
    await insertRow(context, 'shipments', {
      order_id: orderId,
      status: 'preparing'
    });
  } catch (error) {
    console.error('shipment shell insert failed:', error);
  }
}

export async function finalizeCommerceAfterPayment(context, orderId) {
  if (!orderId) return;
  const orders = await selectRows(context, 'orders', {
    select: 'id,user_id,customer_email,customer_first_name,customer_last_name,customer_phone,order_number,coupon_code,discount_amount,total_amount,invoice_type,billing_first_name,billing_last_name,billing_email,billing_phone,company_title,tax_office,tax_number,corporate_email,is_e_invoice_taxpayer,billing_address_line,billing_city,billing_district,billing_postal_code,legal_consents',
    id: `eq.${orderId}`,
    limit: '1'
  }).catch(() => []);
  const order = orders?.[0] || null;
  if (!order) return;

  if (order.coupon_code) {
    const now = new Date().toISOString();
    const existingRedemption = await selectRows(context, 'coupon_redemptions', {
      select: 'id,status', order_id: `eq.${orderId}`, code: `eq.${order.coupon_code}`, limit: '1'
    }).catch(() => []);
    if (existingRedemption?.[0]?.id) {
      await updateRows(context, 'coupon_redemptions', { id: existingRedemption[0].id }, {
        status: 'used',
        metadata: { source: 'iyzico_callback', previous_status: existingRedemption[0].status || null },
        updated_at: now
      }).catch(() => null);
    } else {
      const coupons = await selectRows(context, 'coupons', {
        select: 'id,code', code: `eq.${order.coupon_code}`, limit: '1'
      }).catch(() => []);
      await insertRow(context, 'coupon_redemptions', {
        coupon_id: coupons?.[0]?.id || null,
        order_id: orderId,
        user_id: order.user_id || null,
        customer_email: order.customer_email || null,
        code: order.coupon_code,
        discount_amount: Number(order.discount_amount || 0),
        status: 'used',
        metadata: { source: 'iyzico_callback' },
        created_at: now
      }).catch(() => null);
    }
    if (order.user_id) {
      await updateRows(context, 'customer_coupons', { user_id: order.user_id, code: order.coupon_code }, {
        status: 'used', used_at: now, order_id: orderId, updated_at: now
      }).catch(() => null);
    }
    if (order.customer_email) {
      await updateRows(context, 'customer_coupons', { customer_email: String(order.customer_email).toLowerCase(), code: order.coupon_code }, {
        status: 'used', used_at: now, order_id: orderId, updated_at: now
      }).catch(() => null);
    }
  }

  const existingInvoice = await selectRows(context, 'invoice_records', {
    select: 'id', order_id: `eq.${orderId}`, limit: '1'
  }).catch(() => []);
  if (!existingInvoice?.[0]) {
    await insertRow(context, 'invoice_records', {
      order_id: orderId,
      provider: context.env.EARCHIVE_PROVIDER || 'manual',
      invoice_status: 'pending',
      metadata: {
        order_number: order.order_number || '',
        total_amount: order.total_amount || 0,
        source: 'iyzico_callback',
        invoice_ready_data: {
          billing_type: order.invoice_type === 'Kurumsal' ? 'corporate' : 'individual',
          billing_name: order.company_title || [order.billing_first_name, order.billing_last_name].filter(Boolean).join(' '),
          billing_tax_number: order.tax_number || null,
          billing_tax_office: order.tax_office || null,
          billing_email: order.billing_email || order.corporate_email || order.customer_email,
          billing_phone: order.billing_phone || order.customer_phone || null,
          billing_address: order.billing_address_line || null,
          billing_city: order.billing_city || null,
          billing_district: order.billing_district || null,
          billing_postal_code: order.billing_postal_code || null,
          e_invoice_taxpayer: Boolean(order.is_e_invoice_taxpayer),
          legal_consents: order.legal_consents || null
        }
      }
    }).catch(() => null);
  }

  // Loyalty purchase-points earn hook — smallest possible post-success call.
  // Idempotent (safe on webhook retries/duplicate callbacks); never throws;
  // does not alter payment/order state or the caller's control flow.
  await awardOrderPoints(context, orderId);
}

// P1 fix: releasing coupon_redemptions alone left customer_coupons (WELCOME10,
// club-points-redeemed coupons, admin-issued coupons, etc.) permanently stuck
// in 'used'/'reserved' when the order that consumed them got cancelled or
// rejected — the customer lost the coupon's value with no recovery path.
// This is the single place that undoes both. Guards on
// customer_coupons.order_id = orderId so a coupon already re-applied to a
// different order is never touched.
export async function releaseOrderCouponUsage(context, orderId, { source = 'order_cancelled' } = {}) {
  if (!orderId) return;
  const now = new Date().toISOString();
  await updateRows(context, 'coupon_redemptions', { order_id: orderId }, {
    status: 'released',
    metadata: { source },
    updated_at: now
  }).catch((error) => console.error('coupon_redemptions release failed:', { orderId, message: error?.message || String(error) }));

  const orders = await selectRows(context, 'orders', {
    select: 'coupon_code,user_id,customer_email',
    id: `eq.${orderId}`,
    limit: '1'
  }).catch(() => []);
  const order = orders?.[0];
  if (!order?.coupon_code) return;

  const patch = { status: 'available', used_at: null, reserved_at: null, order_id: null, updated_at: now };
  if (order.user_id) {
    await updateRows(context, 'customer_coupons', { user_id: order.user_id, code: order.coupon_code, order_id: orderId }, patch).catch((error) => {
      console.error('customer_coupons release failed:', { orderId, message: error?.message || String(error) });
    });
  }
  if (order.customer_email) {
    await updateRows(context, 'customer_coupons', { customer_email: String(order.customer_email).toLowerCase(), code: order.coupon_code, order_id: orderId }, patch).catch((error) => {
      console.error('customer_coupons release failed (email):', { orderId, message: error?.message || String(error) });
    });
  }
}

// ---------------------------------------------------------------------------
// B1 — manual bank-transfer payment confirmation.
//
// Idempotency gate is payment_events(order_id, provider='bank_transfer',
// event_type='bank_transfer_payment_confirmed', status='processed'), checked
// first and before any write. A previously-confirmed order returns
// {ok:true, idempotent:true} immediately with zero further side effects —
// no payments write, no inventory call, no coupon/invoice/loyalty call.
//
// Never reachable for a card order (payment_method !== 'bank_transfer'
// throws) so it can never write a payment_events row over the iyzico-owned
// audit trail for a card order.
// ---------------------------------------------------------------------------
export async function confirmManualBankTransferPayment(context, orderId, { approvedByEmail = null, approvedByAdminId = null, note = null } = {}) {
  if (!orderId) return { ok: false, idempotent: false, reason: 'order_id_missing' };

  const orders = await selectRows(context, 'orders', {
    select: 'id,payment_method,payment_status,status,fulfillment_status,order_number',
    id: `eq.${orderId}`,
    limit: '1'
  }).catch(() => []);
  const order = orders?.[0] || null;
  if (!order) return { ok: false, idempotent: false, reason: 'order_not_found' };
  if (order.payment_method !== 'bank_transfer') {
    throw Object.assign(new Error('confirmManualBankTransferPayment yalnızca Havale/EFT (bank_transfer) siparişleri için kullanılabilir.'), { status: 400, code: 'NOT_BANK_TRANSFER_ORDER' });
  }

  const existingEvents = await selectRows(context, 'payment_events', {
    select: 'id',
    order_id: `eq.${orderId}`,
    provider: 'eq.bank_transfer',
    event_type: 'eq.bank_transfer_payment_confirmed',
    status: 'eq.processed',
    limit: '1'
  }).catch(() => []);
  if (existingEvents?.[0]?.id) {
    return { ok: true, idempotent: true, reason: 'already_confirmed' };
  }

  const now = new Date().toISOString();

  const payments = await selectRows(context, 'payments', {
    select: 'id,status',
    order_id: `eq.${orderId}`,
    provider: 'eq.bank_transfer',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const payment = payments?.[0] || null;
  if (payment?.id && payment.status !== 'paid') {
    await updateRows(context, 'payments', { id: payment.id }, {
      status: 'paid',
      raw_callback_response: {
        source: 'admin_manual_bank_transfer',
        approved_by_email: approvedByEmail || null,
        approved_by_admin_id: approvedByAdminId || null,
        confirmed_at: now
      },
      updated_at: now
    }).catch((error) => console.error('bank transfer payments update failed:', { orderId, message: error?.message || String(error) }));
  }

  // Defensive fallback only — in the primary admin/orders.js call site,
  // orders.payment_status is already 'paid' by the time this helper runs
  // (the generic status-mutation block updates it first), so this is a
  // no-op there. Kept so this helper is also safe to call standalone.
  if (order.payment_status !== 'paid') {
    const fulfillmentUpdate = ['not_started', 'unfulfilled'].includes(String(order.fulfillment_status || '')) ? { fulfillment_status: 'preparing' } : {};
    await updateRows(context, 'orders', { id: orderId }, {
      payment_status: 'paid',
      status: ['cancelled', 'payment_failed', 'refunded', 'partially_refunded'].includes(String(order.status || '')) ? order.status : 'paid',
      ...fulfillmentUpdate,
      paid_at: now,
      updated_at: now
    }).catch((error) => console.error('bank transfer orders fallback update failed:', { orderId, message: error?.message || String(error) }));
  }

  // Same idempotent RPC the card path uses; safe to call even though the
  // primary caller (admin/orders.js) may already have called it once in the
  // same request — convert_order_inventory no-ops once no 'reserved' rows
  // remain for the order.
  const conversion = await convertInventoryReservations(context, orderId).catch((error) => {
    console.error('bank transfer manual inventory conversion failed:', { orderId, message: error?.message || String(error) });
    return { converted: 0, deducted: 0, error: true };
  });

  // Shared with the card path — coupon finalization (idempotent via
  // existingRedemption check) + invoice shell (idempotent via existingInvoice
  // check) + loyalty award (idempotent via unique transaction_reference).
  await finalizeCommerceAfterPayment(context, orderId);
  await ensureShipmentShell(context, orderId);

  await insertRow(context, 'payment_events', {
    order_id: orderId,
    provider: 'bank_transfer',
    provider_payment_id: null,
    event_type: 'bank_transfer_payment_confirmed',
    status: 'processed',
    raw_reference: null,
    processed_at: now,
    metadata: {
      source: 'admin_manual_bank_transfer',
      approved_by_email: approvedByEmail || null,
      approved_by_admin_id: approvedByAdminId || null,
      order_number: order.order_number || null,
      note: note || null,
      inventory_conversion: conversion
    }
  }).catch((error) => console.error('bank transfer payment_events insert failed:', { orderId, message: error?.message || String(error) }));

  return { ok: true, idempotent: false, conversion };
}

// ---------------------------------------------------------------------------
// B2 — manual bank-transfer payment rejection/cancellation.
//
// Idempotency gate is payment_events(order_id, provider='bank_transfer',
// event_type='bank_transfer_payment_rejected', status='processed'), checked
// first and before any write (mirrors confirmManualBankTransferPayment()).
// A previously-rejected order returns {ok:true, idempotent:true} immediately
// with zero further side effects — no payments write, no inventory release
// call, no coupon-release call, no payment_events insert.
//
// Already-paid protection (checked before the idempotency gate, since an
// already-paid order can never have a matching prior rejection event to be
// idempotent against): if the order's payment_status is already 'paid', or
// its status shows it already progressed past payment (paid/preparing/
// packed/shipped/delivered/refunded/partially_refunded), this returns
// {ok:false, blocked:true} and performs ZERO writes — never marks a paid
// order's payments row failed, never releases already-converted inventory,
// never releases an already-used coupon, never touches loyalty. This is a
// defense-in-depth check *inside* the helper — the calling routes already
// have their own outer 409 guard for this same condition; this inner guard
// does not replace it.
//
// Never reachable for a card order (payment_method !== 'bank_transfer'
// throws), and deliberately never calls finalizeCommerceAfterPayment() or
// ensureShipmentShell() — no invoice shell, no loyalty award, no shipment
// shell for a payment that never completed.
// ---------------------------------------------------------------------------
const ALREADY_SETTLED_ORDER_STATUSES = new Set(['paid', 'preparing', 'packed', 'shipped', 'delivered', 'refunded', 'partially_refunded']);

export async function rejectManualBankTransferPayment(context, orderId, { rejectedByEmail = null, rejectedByAdminId = null, reason = null } = {}) {
  if (!orderId) return { ok: false, idempotent: false, blocked: false, reason: 'order_id_missing' };

  const orders = await selectRows(context, 'orders', {
    select: 'id,payment_method,payment_status,status,fulfillment_status,order_number,coupon_code',
    id: `eq.${orderId}`,
    limit: '1'
  }).catch(() => []);
  const order = orders?.[0] || null;
  if (!order) return { ok: false, idempotent: false, blocked: false, reason: 'order_not_found' };
  if (order.payment_method !== 'bank_transfer') {
    throw Object.assign(new Error('rejectManualBankTransferPayment yalnızca Havale/EFT (bank_transfer) siparişleri için kullanılabilir.'), { status: 400, code: 'NOT_BANK_TRANSFER_ORDER' });
  }

  if (order.payment_status === 'paid' || ALREADY_SETTLED_ORDER_STATUSES.has(String(order.status || ''))) {
    return { ok: false, idempotent: false, blocked: true, reason: 'already_paid_or_settled' };
  }

  const existingEvents = await selectRows(context, 'payment_events', {
    select: 'id',
    order_id: `eq.${orderId}`,
    provider: 'eq.bank_transfer',
    event_type: 'eq.bank_transfer_payment_rejected',
    status: 'eq.processed',
    limit: '1'
  }).catch(() => []);
  if (existingEvents?.[0]?.id) {
    return { ok: true, idempotent: true, blocked: false, reason: 'already_rejected' };
  }

  const now = new Date().toISOString();

  const payments = await selectRows(context, 'payments', {
    select: 'id,status',
    order_id: `eq.${orderId}`,
    provider: 'eq.bank_transfer',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const payment = payments?.[0] || null;
  if (payment?.id && !['failed', 'cancelled'].includes(String(payment.status || ''))) {
    await updateRows(context, 'payments', { id: payment.id }, {
      status: 'failed',
      raw_callback_response: {
        source: 'admin_manual_bank_transfer_rejection',
        rejected_by_email: rejectedByEmail || null,
        rejected_by_admin_id: rejectedByAdminId || null,
        reason: reason || null,
        confirmed_at: now
      },
      updated_at: now
    }).catch((error) => console.error('bank transfer rejection payments update failed:', { orderId, message: error?.message || String(error) }));
  }

  // Defensive fallback only — in the primary admin/orders.js call site,
  // orders.payment_status/status/fulfillment_status are already set to
  // their target values by the generic status-mutation block before this
  // helper runs, so this is a no-op there. Kept so this helper is also safe
  // to call standalone. Preserves the exact status literals the existing
  // rejection path already uses (payment_status:'failed' — 'cancelled' is
  // not in orders_payment_status_final_chk's allowed list).
  if (order.payment_status !== 'failed') {
    await updateRows(context, 'orders', { id: orderId }, {
      payment_status: 'failed',
      status: order.status === 'cancelled' ? order.status : 'cancelled',
      fulfillment_status: 'cancelled',
      updated_at: now
    }).catch((error) => console.error('bank transfer rejection orders fallback update failed:', { orderId, message: error?.message || String(error) }));
  }

  // Same idempotent RPC the existing rejection path already calls; safe to
  // call even though the primary caller (admin/orders.js) may already have
  // called it once in the same request — release_order_inventory no-ops
  // once no 'reserved' rows remain for the order.
  const inventoryRelease = await releaseInventoryReservations(context, orderId, 'admin_bank_transfer_rejected').catch((error) => {
    console.error('bank transfer manual inventory release failed:', { orderId, message: error?.message || String(error) });
    return { released: 0, error: true };
  });

  // Coupon release — same target state (status:'released') the existing
  // rejection path already writes, relocated here with an idempotency
  // pre-check (only write if a matching row isn't already 'released'). Also
  // releases the underlying customer_coupons row (see releaseOrderCouponUsage)
  // so a WELCOME10/club-points coupon isn't stuck 'used' on a rejected order.
  let couponRelease = { released: 0 };
  if (order.coupon_code) {
    const existingRedemptions = await selectRows(context, 'coupon_redemptions', {
      select: 'id,status',
      order_id: `eq.${orderId}`,
      limit: '10'
    }).catch(() => []);
    const pendingRelease = (existingRedemptions || []).filter((r) => String(r.status || '') !== 'released');
    if (pendingRelease.length) {
      await releaseOrderCouponUsage(context, orderId, { source: 'admin_bank_transfer_rejection' });
      couponRelease = { released: pendingRelease.length };
    }
  }

  // Deliberately no finalizeCommerceAfterPayment()/ensureShipmentShell()
  // call here — a rejected order must never gain a 'used' coupon, an
  // invoice shell, a loyalty award, or a shipment shell.

  await insertRow(context, 'payment_events', {
    order_id: orderId,
    provider: 'bank_transfer',
    provider_payment_id: null,
    event_type: 'bank_transfer_payment_rejected',
    status: 'processed',
    raw_reference: null,
    processed_at: now,
    metadata: {
      source: 'admin_manual_bank_transfer_rejection',
      rejected_by_email: rejectedByEmail || null,
      rejected_by_admin_id: rejectedByAdminId || null,
      order_number: order.order_number || null,
      reason: reason || null,
      inventory_release: inventoryRelease,
      coupon_release: couponRelease
    }
  }).catch((error) => console.error('bank transfer rejection payment_events insert failed:', { orderId, message: error?.message || String(error) }));

  return { ok: true, idempotent: false, blocked: false, inventoryRelease, couponRelease };
}
