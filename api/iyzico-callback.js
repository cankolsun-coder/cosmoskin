import { updateRows } from './_lib/supabase.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { redirect } from './_lib/response.js';

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
    }

    return redirect(`${success ? '/payment/success.html' : '/payment/failure.html'}?order=${encodeURIComponent(conversationId || '')}`);
  } catch {
    return redirect('/payment/failure.html');
  }
}

export function onRequestGet() {
  return redirect('/payment/failure.html');
}
