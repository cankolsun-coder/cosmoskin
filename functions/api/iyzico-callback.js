import { redirect } from './_lib/response.js';
import { reconcileIyzicoPaymentByToken } from './_lib/iyzico-reconcile.js';

function parseFormEncoded(body) {
  const params = new URLSearchParams(body || '');
  return Object.fromEntries(params.entries());
}

export async function onRequestPost(context) {
  const contentType = String(context.request.headers.get('content-type') || '').toLowerCase();
  const rawBody = await context.request.text();
  let data = {};
  try {
    data = contentType.includes('application/json') ? JSON.parse(rawBody || '{}') : parseFormEncoded(rawBody);
  } catch {
    return redirect('/payment/failure.html');
  }
  const token = String(data.token || '').trim().slice(0, 500);

  const result = await reconcileIyzicoPaymentByToken(context, token, { source: 'callback' });
  const page = result.success ? '/payment/success.html' : '/payment/failure.html';
  const params = new URLSearchParams();
  if (result.orderId) params.set('order', result.orderId);
  if (result.reviewRequired) params.set('review', '1');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return redirect(`${page}${suffix}`);
}

export function onRequestGet() {
  return redirect('/payment/failure.html');
}
