import { insertRow, rpc, selectRows, updateRows } from './_lib/supabase.js';
import { sendOrderStatusEmail } from './_lib/order-email.js';
import { recordEmailEvent } from './_lib/email-events.js';
import { deriveCommerceSegments, mapSegmentsToLists, upsertBrevoContact } from './_lib/brevo.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { recordCrmEvent } from './_lib/crm-events.js';
import { redirect } from './_lib/response.js';
import { ensureShipmentShell, finalizeCommerceAfterPayment } from './_lib/commerce-finalization.js';

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
    select: 'id,order_id,conversation_id,status,amount,currency,provider_token',
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

function normalizeMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function callbackMetadata(retrieve = {}) {
  return {
    provider: 'iyzico',
    payment_id: retrieve.paymentId || retrieve.paymentIdV2 || null,
    payment_status: retrieve.paymentStatus || retrieve.status || null,
    currency: retrieve.currency || null,
    fraud_status: retrieve.fraudStatus ?? null
  };
}

function assertPaymentBinding(payment, order, retrieve, token) {
  if (!payment?.order_id || !order?.id) throw Object.assign(new Error('Ödeme kaydı siparişle eşleştirilemedi.'), { code: 'PAYMENT_BINDING_MISSING' });
  if (String(payment.provider_token || '') !== String(token || '')) throw Object.assign(new Error('Ödeme token eşleşmesi geçersiz.'), { code: 'PAYMENT_TOKEN_MISMATCH' });
  const providerConversation = String(retrieve.conversationId || '').trim();
  const providerBasket = String(retrieve.basketId || '').trim();
  const expected = String(payment.order_id);
  if (providerConversation && providerConversation !== expected) throw Object.assign(new Error('Ödeme conversationId siparişle eşleşmiyor.'), { code: 'PAYMENT_ORDER_MISMATCH' });
  if (providerBasket && providerBasket !== expected) throw Object.assign(new Error('Ödeme basketId siparişle eşleşmiyor.'), { code: 'PAYMENT_BASKET_MISMATCH' });
  if (payment.conversation_id && String(payment.conversation_id) !== expected) throw Object.assign(new Error('Yerel ödeme kaydı siparişle eşleşmiyor.'), { code: 'LOCAL_PAYMENT_ORDER_MISMATCH' });
  const expectedAmount = normalizeMoney(order.total_amount ?? payment.amount);
  const providerAmount = normalizeMoney(retrieve.paidPrice ?? retrieve.price);
  if (expectedAmount !== null && providerAmount !== null && Math.abs(expectedAmount - providerAmount) > 0.01) {
    throw Object.assign(new Error('Ödeme tutarı sipariş toplamıyla eşleşmiyor.'), { code: 'PAYMENT_AMOUNT_MISMATCH' });
  }
  const expectedCurrency = String(order.currency || payment.currency || 'TRY').toUpperCase();
  const providerCurrency = String(retrieve.currency || '').toUpperCase();
  if (providerCurrency && providerCurrency !== expectedCurrency) throw Object.assign(new Error('Ödeme para birimi siparişle eşleşmiyor.'), { code: 'PAYMENT_CURRENCY_MISMATCH' });
}

async function sendPaymentSuccessEmailSafely(context, orderId) {
  const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${orderId}`, limit: '1' }).catch(() => []))?.[0] || null;
  if (!order?.customer_email) return;
  const items = await selectRows(context, 'order_items', { select: '*', order_id: `eq.${orderId}`, order: 'created_at.asc' }).catch(() => []);
  const subject = `Siparişiniz onaylandı | ${order.order_number || 'COSMOSKIN'}`;
  try {
    const result = await sendOrderStatusEmail(context.env, { order, status: 'paid', items });
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
  let orderId = '';
  let paymentWasSuccessful = false;
  try {
    if (!context.env.IYZICO_API_KEY || !context.env.IYZICO_SECRET_KEY) {
      return redirect('/payment/failure.html');
    }
    const contentType = String(context.request.headers.get('content-type') || '').toLowerCase();
    const rawBody = await context.request.text();
    let data = {};
    try {
      data = contentType.includes('application/json') ? JSON.parse(rawBody || '{}') : parseFormEncoded(rawBody);
    } catch {
      return redirect('/payment/failure.html');
    }
    const token = String(data.token || '').trim().slice(0, 500);
    if (!token) return redirect('/payment/failure.html');

    const paymentRow = await findPaymentByToken(context, token).catch(() => null);
    if (!paymentRow?.order_id) return redirect('/payment/failure.html');
    orderId = String(paymentRow.order_id);

    const retrieve = await iyzicoRequest('/payment/iyzipos/checkoutform/auth/ecom/detail', context.env, {
      locale: 'tr',
      token
    });
    const order = (await selectRows(context, 'orders', {
      select: 'id,order_number,status,payment_status,fulfillment_status,currency,total_amount,metadata,customer_email,paid_at',
      id: `eq.${orderId}`,
      limit: '1'
    }).catch(() => []))?.[0] || null;
    assertPaymentBinding(paymentRow, order, retrieve, token);

    const success = isPaymentSuccess(retrieve);
    paymentWasSuccessful = success;
    const providerPaymentId = retrieve.paymentId || retrieve.paymentIdV2 || null;
    const metadata = callbackMetadata(retrieve);
    const mergedMetadata = { ...(order?.metadata && typeof order.metadata === 'object' ? order.metadata : {}), ...metadata };

    if (success) {
      let processing = null;
      let inventoryProcessingError = null;
      try {
        processing = await rpc(context, 'process_iyzico_payment_success', {
          p_order_id: orderId,
          p_provider_payment_id: providerPaymentId,
          p_token: token,
          p_metadata: metadata
        });
      } catch (error) {
        inventoryProcessingError = String(error?.message || 'inventory_processing_failed').slice(0, 300);
        console.error('iyzico paid inventory processing failed:', { orderId, code: error?.code || null, message: inventoryProcessingError });
      }

      await updateRows(context, 'payments', { id: paymentRow.id }, {
        status: 'paid',
        provider_payment_id: providerPaymentId,
        raw_callback_response: retrieve || null,
        updated_at: new Date().toISOString()
      });
      const paymentVerifiedButProcessingFailed = Boolean(inventoryProcessingError);
      await updateRows(context, 'orders', { id: orderId }, {
        status: 'paid',
        payment_status: 'paid',
        fulfillment_status: paymentVerifiedButProcessingFailed ? 'review_required' : 'preparing',
        paid_at: order?.paid_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: paymentVerifiedButProcessingFailed
          ? { ...mergedMetadata, inventory_reconciliation_required: true, order_processing_review_required: true, inventory_processing_error: inventoryProcessingError }
          : { ...mergedMetadata, inventory_reconciliation_required: false, order_processing_review_required: false }
      });

      if (paymentVerifiedButProcessingFailed) {
        await recordStatusEvent(context, orderId, 'order_processing_review_required', 'Ödeme iyzico tarafından onaylandı ancak sipariş/stok işlemleri otomatik tamamlanamadı. Normal başarı e-postası gönderilmedi; manuel operasyon kontrolü gerekli.', { ...metadata, error: inventoryProcessingError, new_status: 'paid' });
        await finalizeCommerceAfterPayment(context, orderId);
        return redirect(`/payment/success.html?order=${encodeURIComponent(orderId)}&review=1`);
      } else if (processing?.claimed === false) {
        await recordStatusEvent(context, orderId, 'payment_duplicate_ignored', 'Aynı ödeme callback tekrar geldi; stok ikinci kez düşülmedi.', { ...metadata, new_status: 'paid' });
      } else {
        await recordStatusEvent(context, orderId, 'paid', 'Ödeme iyzico tarafından onaylandı ve stok rezervasyonu dönüştürüldü.', { ...metadata, new_status: 'paid' });
      }

      await ensureShipmentShell(context, orderId);
      await finalizeCommerceAfterPayment(context, orderId);
      const confirmationEmailEligible = processing?.claimed !== false;
      if (confirmationEmailEligible) {
        await syncBrevoAfterPayment(context, orderId);
        await sendPaymentSuccessEmailSafely(context, orderId);
        await recordCrmEvent(context, { event_type: 'purchase_completed', order_id: orderId, metadata: { source: 'iyzico_callback', payment_id: providerPaymentId || null } });
      }
      return redirect(`/payment/success.html?order=${encodeURIComponent(orderId)}`);
    }

    const failureProcessing = await rpc(context, 'process_iyzico_payment_failure', {
      p_order_id: orderId,
      p_provider_payment_id: providerPaymentId,
      p_token: token,
      p_metadata: metadata
    });
    await updateRows(context, 'payments', { id: paymentRow.id }, {
      status: 'failed',
      provider_payment_id: providerPaymentId,
      raw_callback_response: retrieve || null,
      updated_at: new Date().toISOString()
    });
    await updateRows(context, 'orders', { id: orderId }, {
      status: 'payment_failed',
      payment_status: 'failed',
      fulfillment_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { ...mergedMetadata, payment_failure_processed: true }
    });
    if (failureProcessing?.claimed !== false) {
      await recordStatusEvent(context, orderId, 'payment_failed', 'Ödeme iyzico tarafından başarısız döndü ve stok rezervasyonu serbest bırakıldı.', { ...metadata, new_status: 'payment_failed' });
      await sendPaymentFailedEmailSafely(context, orderId);
    }
    return redirect(`/payment/failure.html?order=${encodeURIComponent(orderId)}`);
  } catch (error) {
    console.error('iyzico callback failed:', { orderId: orderId || null, code: error?.code || null, message: String(error?.message || 'unknown').slice(0, 300) });
    if (orderId) {
      await recordStatusEvent(context, orderId, paymentWasSuccessful ? 'inventory_reconciliation_required' : 'payment_callback_error', paymentWasSuccessful ? 'Ödeme onaylandı ancak callback tam olarak işlenemedi; manuel kontrol gerekli.' : 'Ödeme callback doğrulanamadı veya işlenemedi.', { error_code: error?.code || null, error: String(error?.message || 'unknown').slice(0, 300) });
    }
    return redirect(`${paymentWasSuccessful ? '/payment/success.html' : '/payment/failure.html'}${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`);
  }
}

export function onRequestGet() {
  return redirect('/payment/failure.html');
}
