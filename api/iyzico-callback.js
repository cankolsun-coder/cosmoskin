import { selectRows, updateRows } from './_lib/supabase.js';
import { deriveCommerceSegments, mapSegmentsToLists, upsertBrevoContact } from './_lib/brevo.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { redirect } from './_lib/response.js';


async function syncBrevoAfterPayment(context, conversationId) {
  if (!context?.env?.BREVO_API_KEY || !conversationId) return;
  try {
    const orders = await selectRows(context, 'orders', {
      select: 'id,order_number,total_amount,created_at,customer_email,customer_first_name,customer_last_name,user_id',
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

export async function onRequestPost(context) {
  try {
    if (!context.env.IYZICO_API_KEY || !context.env.IYZICO_SECRET_KEY) {
      return redirect('/payment/failure.html');
    }
    const contentType = context.request.headers.get('content-type') || '';
    const rawBody = await context.request.text();
    const data = contentType.includes('application/json') ? JSON.parse(rawBody || '{}') : parseFormEncoded(rawBody);
    const token = data.token;
    if (!token) return redirect('/payment/failure.html');

    const retrieve = await iyzicoRequest('/payment/iyzipos/checkoutform/auth/ecom/detail', context.env, {
      locale: 'tr',
      token
    });

    const conversationId = retrieve.conversationId || data.conversationId;
    const statusText = String(retrieve.paymentStatus || retrieve.status || '').toUpperCase();
    const success = statusText === 'SUCCESS';

    await updateRows(context, 'payments', { provider_token: token }, {
      status: success ? 'paid' : 'failed',
      provider_payment_id: retrieve.paymentId || null,
      raw_callback_response: retrieve
    });

    if (conversationId) {
      await updateRows(context, 'orders', { id: conversationId }, {
        status: success ? 'paid' : 'payment_failed',
        paid_at: success ? new Date().toISOString() : null
      });
      if (success) await syncBrevoAfterPayment(context, conversationId);
    }

    return redirect(`${success ? '/payment/success.html' : '/payment/failure.html'}?order=${encodeURIComponent(conversationId || '')}`);
  } catch {
    return redirect('/payment/failure.html');
  }
}

export function onRequestGet() {
  return redirect('/payment/failure.html');
}
