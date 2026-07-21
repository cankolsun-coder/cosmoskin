import { json } from '../_lib/response.js';
import { selectRows } from '../_lib/supabase.js';
import { reconcileIyzicoPaymentByToken } from '../_lib/iyzico-reconcile.js';

const STUCK_AFTER_MINUTES = 10;

function safeEqual(left = '', right = '') {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

async function findStuckOrders(context, limit) {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000).toISOString();
  return await selectRows(context, 'orders', {
    select: 'id,order_number,created_at',
    payment_method: 'eq.iyzico',
    payment_status: 'in.(pending,initiated)',
    created_at: `lt.${cutoff}`,
    order: 'created_at.asc',
    limit: String(limit)
  }).catch(() => []);
}

async function findLatestIyzicoToken(context, orderId) {
  const rows = await selectRows(context, 'payments', {
    select: 'id,provider_token,status',
    order_id: `eq.${orderId}`,
    provider: 'eq.iyzico',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  return rows?.[0]?.provider_token || null;
}

/**
 * Safety net for orders whose iyzico checkoutform callback never arrived (or
 * arrived too late) — re-queries iyzico's own record for the payment and runs
 * it through the exact same verify-and-finalize path as the live callback.
 * Idempotent by construction: process_iyzico_payment_success/failure already
 * dedupe on (order_id, event_type) inside a Postgres advisory lock, so this
 * running concurrently with (or after) the real callback is always safe.
 */
export async function onRequestPost(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !safeEqual(expected, supplied)) {
    return json({ ok: false, error: 'Yetkilendirme başarısız.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const limit = Math.min(200, Math.max(1, Number(new URL(context.request.url).searchParams.get('limit') || 50)));
    const stuckOrders = await findStuckOrders(context, limit);
    const results = [];
    for (const order of (stuckOrders || [])) {
      const token = await findLatestIyzicoToken(context, order.id);
      if (!token) {
        results.push({ order_id: order.id, order_number: order.order_number, ok: false, reason: 'token_missing' });
        continue;
      }
      const outcome = await reconcileIyzicoPaymentByToken(context, token, { source: 'reconcile_cron' });
      results.push({ order_id: order.id, order_number: order.order_number, ...outcome });
    }
    return json({
      ok: true,
      checked: results.length,
      resolved: results.filter((r) => r.ok && r.success !== undefined).length,
      results
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('reconcile_pending_payments_failed', { code: error?.code || null, message: String(error?.message || 'unknown').slice(0, 200) });
    return json({ ok: false, error: 'Bekleyen ödemeler tekrar kontrol edilemedi.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function onRequestGet() {
  return json({ ok: false, error: 'Bu endpoint yalnızca POST isteğini kabul eder.' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
}
