import { insertRow, selectRows, updateRows } from './_lib/supabase.js';
import { convertInventoryReservations, releaseInventoryReservations } from './_lib/inventory.js';
import { sendOrderStatusEmail } from './_lib/order-email.js';
import { recordEmailEvent } from './_lib/email-events.js';
import { deriveCommerceSegments, mapSegmentsToLists, upsertBrevoContact } from './_lib/brevo.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { redirect } from './_lib/response.js';

async function syncBrevoAfterPayment(context, conversationId) {
  if (!context?.env?.BREVO_API_KEY || !conversationId) return;
  try {
    const orders = await selectRows(context, 'orders', {
      select: 'id,order_number,total_amount,created_at,customer_email,customer_first_name,customer_last_name,user_id,currency',
      id: `eq.${conversationId}`
    });
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order?.customer_email) return;
    const items = await selectRows(context, 'order_items', {
      select: 'product_id,product_name,brand,quantity,line_total',
      order_id: `eq.${conversationId}`
    });
    const segmentsData = deriveCommerceSegments({ order, items, preferences: {} });
    const mapped = mapSegmentsToLists(context.env, segmentsData, {});
    await upsertBrevoContact(context.env, {
      email: order.customer_email,
      listIds: mapped.listIds,
      unlinkListIds: mapped.unlinkListIds,
      attributes: {
        FIRSTNAME: order.customer_first_name || '',
        LASTNAME: order.customer_last_name || '',
        CS_LAST_ORDER_NUMBER: order.order_number || '',
        CS_LAST_ORDER_DATE: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : '',
        CS_LAST_ORDER_TOTAL: Number(order.total_amount || 0),
        CS_SEGMENTS: (segmentsData.segments || []).join(', '),
        CS_CATEGORIES: (segmentsData.categories || []).join(', '),
        CS_ROUTINE_SOURCE: 'checkout_success'
      }
    });
  } catch (error) {
    console.error('Brevo checkout sync failed:', error);
  }
}

function parseFormEncoded(body) {
  const params = new URLSearchParams(body || '');
  return Object.fromEntries(params.entries());
}

function isPaymentSuccess(retrieve = {}) {
  const paymentStatus = String(retrieve.paymentStatus || '').toUpperCase();
  if (paymentStatus) return paymentStatus === 'SUCCESS';
  const apiStatus = String(retrieve.status || '').toLowerCase();
  return apiStatus === 'success';
}

async function findPaymentByToken(context, token) {
  if (!token) return null;
  const rows = await selectRows(context, 'payments', {
    select: 'id,order_id,conversation_id,status',
    provider_token: `eq.${token}`,
    limit: '1'
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function recordStatusEvent(context, orderId, status, message, metadata = {}) {
  if (!orderId) return;
  try {
    await insertRow(context, 'order_status_events', {
      order_id: orderId,
      status,
      event_type: status,
      previous_status: metadata.previous_status || null,
      new_status: metadata.new_status || status || null,
      source: 'payment',
      created_by: 'payment_callback',
      message,
      note: message,
      metadata
    });
  } catch (error) {
    console.error('order_status_events insert failed:', error);
  }
}

async function ensureShipmentShell(context, orderId) {
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

async function finalizeCommerceAfterPayment(context, orderId) {
  if (!orderId) return;
  try {
    const orders = await selectRows(context, 'orders', {
      select: 'id,user_id,customer_email,order_number,coupon_code,discount_amount,total_amount',
      id: `eq.${orderId}`,
      limit: '1'
    });
    const order = orders?.[0] || null;
    const conversion = await convertInventoryReservations(context, orderId).catch((error) => {
      console.error('inventory reservation conversion failed:', error);
      return { converted: 0, deducted: 0 };
    });

    if (!conversion.converted) {
      const items = await selectRows(context, 'order_items', {
        select: 'product_slug,product_id,quantity',
        order_id: `eq.${orderId}`
      }).catch(() => []);
      for (const item of items || []) {
        const slug = item.product_slug || item.product_id;
        if (!slug) continue;
        const invRows = await selectRows(context, 'product_inventory', {
          select: 'product_slug,stock_on_hand,stock_reserved',
          product_slug: `eq.${slug}`,
          limit: '1'
        }).catch(() => []);
        const inv = invRows?.[0];
        if (!inv) continue;
        const qty = Math.max(1, Number(item.quantity || 1));
        const previous = Number(inv.stock_on_hand || 0);
        const nextStock = Math.max(0, previous - qty);
        await updateRows(context, 'product_inventory', { product_slug: slug }, {
          stock_on_hand: nextStock,
          stock_reserved: Math.max(0, Number(inv.stock_reserved || 0) - qty),
          updated_at: new Date().toISOString()
        }).catch(() => null);
        await insertRow(context, 'inventory_movements', {
          product_slug: slug,
          change: -qty,
          previous_stock_on_hand: previous,
          new_stock_on_hand: nextStock,
          reason: 'order_paid',
          related_order_id: orderId,
          created_by: 'payment_callback',
          note: 'Legacy fallback: aktif rezervasyon bulunamadığı için doğrudan stok düşüldü.'
        }).catch(() => null);
      }
    }

    if (order?.coupon_code) {
      const coupons = await selectRows(context, 'coupons', {
        select: 'id,code',
        code: `eq.${order.coupon_code}`,
        limit: '1'
      }).catch(() => []);
      await insertRow(context, 'coupon_redemptions', {
        coupon_id: coupons?.[0]?.id || null,
        order_id: orderId,
        user_id: order.user_id || null,
        customer_email: order.customer_email || null,
        code: order.coupon_code,
        discount_amount: Number(order.discount_amount || 0)
      }).catch(() => null);
    }

    await insertRow(context, 'invoice_records', {
      order_id: orderId,
      provider: context.env.EARCHIVE_PROVIDER || 'manual',
      status: 'pending',
      provider_payload: { order_number: order?.order_number || '', total_amount: order?.total_amount || 0 }
    }).catch(() => null);
  } catch (error) {
    console.error('commerce finalization failed:', error);
  }
}


async function paymentAlreadyProcessed(context, orderId, providerPaymentId, token) {
  const params = {
    select: 'id,processed_at,status',
    provider: 'eq.iyzico',
    event_type: 'eq.payment_success',
    status: 'eq.processed',
    limit: '1'
  };
  if (providerPaymentId) params.provider_payment_id = `eq.${providerPaymentId}`;
  else if (token) params.raw_reference = `eq.${token}`;
  else if (orderId) params.order_id = `eq.${orderId}`;
  const rows = await selectRows(context, 'payment_events', params).catch(() => []);
  return Boolean(rows?.[0]?.processed_at || rows?.[0]?.id);
}

async function recordPaymentEvent(context, { orderId, providerPaymentId, token, eventType, status, metadata = {}, processed = false }) {
  return await insertRow(context, 'payment_events', {
    order_id: orderId || null,
    provider: 'iyzico',
    provider_payment_id: providerPaymentId || null,
    event_type: eventType,
    status,
    raw_reference: token || null,
    processed_at: processed ? new Date().toISOString() : null,
    metadata
  }).catch((error) => {
    console.error('payment_events insert failed:', error);
    return null;
  });
}

async function sendPaymentSuccessEmailSafely(context, orderId) {
  const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${orderId}`, limit: '1' }).catch(() => []))?.[0] || null;
  if (!order?.customer_email) return;
  const items = await selectRows(context, 'order_items', { select: '*', order_id: `eq.${orderId}`, order: 'created_at.asc' }).catch(() => []);
  const subject = `Siparişiniz onaylandı | ${order.order_number || 'COSMOSKIN'}`;
  try {
    const result = await sendOrderStatusEmail(context.env, { order, status: 'confirmed', items });
    await recordEmailEvent(context, {
      order_id: orderId,
      customer_email: order.customer_email,
      email_type: 'payment_success',
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject,
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { source: 'iyzico_callback' }
    });
  } catch (error) {
    await recordEmailEvent(context, {
      order_id: orderId,
      customer_email: order.customer_email,
      email_type: 'payment_success',
      provider: context.env.BREVO_API_KEY ? 'brevo' : null,
      status: 'failed',
      subject,
      error_message: error.message || 'payment_success_email_failed',
      metadata: { source: 'iyzico_callback' }
    });
  }
}

async function sendPaymentFailedEmailSafely(context, orderId) {
  const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${orderId}`, limit: '1' }).catch(() => []))?.[0] || null;
  if (!order?.customer_email) return;
  const items = await selectRows(context, 'order_items', { select: '*', order_id: `eq.${orderId}`, order: 'created_at.asc' }).catch(() => []);
  const subject = `Ödeme işlemi tamamlanamadı | ${order.order_number || 'COSMOSKIN'}`;
  try {
    const result = await sendOrderStatusEmail(context.env, { order, status: 'payment_failed', items });
    await recordEmailEvent(context, {
      order_id: orderId,
      customer_email: order.customer_email,
      email_type: 'payment_failed',
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject,
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { source: 'iyzico_callback' }
    });
  } catch (error) {
    await recordEmailEvent(context, {
      order_id: orderId,
      customer_email: order.customer_email,
      email_type: 'payment_failed',
      provider: context.env.BREVO_API_KEY ? 'brevo' : null,
      status: 'failed',
      subject,
      error_message: error.message || 'payment_failed_email_failed',
      metadata: { source: 'iyzico_callback' }
    });
  }
}

export async function onRequestPost(context) {
  let conversationId = '';
  try {
    if (!context.env.IYZICO_API_KEY || !context.env.IYZICO_SECRET_KEY) {
      return redirect('/payment/failure.html');
    }
    const contentType = context.request.headers.get('content-type') || '';
    const rawBody = await context.request.text();
    const data = contentType.includes('application/json') ? JSON.parse(rawBody || '{}') : parseFormEncoded(rawBody);
    const token = data.token;
    if (!token) return redirect('/payment/failure.html');

    const paymentRow = await findPaymentByToken(context, token).catch(() => null);

    const retrieve = await iyzicoRequest('/payment/iyzipos/checkoutform/auth/ecom/detail', context.env, {
      locale: 'tr',
      token
    });

    conversationId = retrieve.conversationId || data.conversationId || paymentRow?.conversation_id || paymentRow?.order_id || '';
    const success = isPaymentSuccess(retrieve);
    const providerPaymentId = retrieve.paymentId || retrieve.paymentIdV2 || null;
    const alreadyProcessed = success ? await paymentAlreadyProcessed(context, conversationId, providerPaymentId, token) : false;

    await updateRows(context, 'payments', { provider_token: token }, {
      status: success ? 'paid' : 'failed',
      provider_payment_id: providerPaymentId,
      raw_callback_response: retrieve || null
    });

    if (conversationId) {
      await updateRows(context, 'orders', { id: conversationId }, {
        status: success ? 'confirmed' : 'cancelled',
        payment_status: success ? 'paid' : 'failed',
        fulfillment_status: success ? 'preparing' : 'failed',
        paid_at: success ? new Date().toISOString() : null,
        metadata: {
          payment_provider: 'iyzico',
          payment_id: providerPaymentId,
          callback_status: retrieve.paymentStatus || retrieve.status || null
        }
      });

      await recordStatusEvent(
        context,
        conversationId,
        success ? 'paid' : 'payment_failed',
        success ? 'Ödeme iyzico tarafından onaylandı.' : 'Ödeme iyzico tarafından başarısız döndü.',
        { provider: 'iyzico', token, paymentId: providerPaymentId, status: retrieve.paymentStatus || retrieve.status || null }
      );

      if (success) {
        if (!alreadyProcessed) {
          await recordPaymentEvent(context, { orderId: conversationId, providerPaymentId, token, eventType: 'payment_success', status: 'processed', metadata: { status: retrieve.paymentStatus || retrieve.status || null }, processed: true });
          await ensureShipmentShell(context, conversationId);
          await finalizeCommerceAfterPayment(context, conversationId);
          await syncBrevoAfterPayment(context, conversationId);
          await sendPaymentSuccessEmailSafely(context, conversationId);
        } else {
          await recordStatusEvent(context, conversationId, 'payment_duplicate_ignored', 'Aynı ödeme callback tekrar geldi; stok ikinci kez düşülmedi.', { provider: 'iyzico', token, paymentId: providerPaymentId });
        }
      } else {
        await recordPaymentEvent(context, { orderId: conversationId, providerPaymentId, token, eventType: 'payment_failed', status: 'processed', metadata: { status: retrieve.paymentStatus || retrieve.status || null }, processed: true });
        await releaseInventoryReservations(context, conversationId, 'payment_failed').catch(() => null);
        await sendPaymentFailedEmailSafely(context, conversationId);
      }
    }

    return redirect(`${success ? '/payment/success.html' : '/payment/failure.html'}?order=${encodeURIComponent(conversationId || '')}`);
  } catch (error) {
    console.error('iyzico callback failed:', error);
    if (conversationId) {
      await recordStatusEvent(context, conversationId, 'payment_callback_error', 'Ödeme callback işlenirken hata oluştu.', { error: error?.message || 'Unknown error' });
    }
    return redirect(`/payment/failure.html${conversationId ? `?order=${encodeURIComponent(conversationId)}` : ''}`);
  }
}

export function onRequestGet() {
  return redirect('/payment/failure.html');
}
