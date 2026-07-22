import { json } from '../_lib/response.js';
import { selectRows } from '../_lib/supabase.js';
import { resendOrderEmail } from '../admin/orders.js';

// Mirrors create-checkout.js's EFT window (kept as a local copy rather than
// importing a private helper from that commerce-critical file).
const DEFAULT_EFT_RESERVATION_MINUTES = 1440;

function safeEqual(left = '', right = '') {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

function getEftReservationMinutes(env = {}) {
  const configured = Number(env.EFT_RESERVATION_MINUTES || DEFAULT_EFT_RESERVATION_MINUTES);
  if (!Number.isFinite(configured)) return DEFAULT_EFT_RESERVATION_MINUTES;
  return Math.max(30, Math.min(10080, Math.floor(configured)));
}

function inFilter(values = []) { return `in.(${values.filter(Boolean).join(',')})`; }

/**
 * bank_transfer_reminder previously had a template and a manual admin
 * resend option but no automatic trigger at all. Fires once per order,
 * partway through its own EFT reservation window: past the halfway point
 * (so the customer gets a nudge before the deadline) but before the full
 * window elapses (past that, release-expired-inventory/reconcile already
 * own cancelling the order — a "still waiting" email at that point would
 * be misleading).
 */
export async function onRequestPost(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !safeEqual(expected, supplied)) {
    return json({ ok: false, error: 'Yetkilendirme başarısız.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const limit = Math.min(200, Math.max(1, Number(new URL(context.request.url).searchParams.get('limit') || 100)));
    const windowMinutes = getEftReservationMinutes(context.env);
    const now = Date.now();
    const halfwayCutoff = new Date(now - (windowMinutes / 2) * 60 * 1000).toISOString();
    const deadlineCutoff = new Date(now - windowMinutes * 60 * 1000).toISOString();

    const candidates = await selectRows(context, 'orders', {
      select: 'id,order_number,created_at',
      payment_method: 'eq.bank_transfer',
      payment_status: 'eq.awaiting_transfer',
      created_at: `lt.${halfwayCutoff}`,
      order: 'created_at.asc',
      limit: String(limit)
    }).catch(() => []);

    const eligible = (candidates || []).filter((order) => order.created_at > deadlineCutoff);
    if (!eligible.length) {
      return json({ ok: true, checked: 0, reminded: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const alreadyReminded = await selectRows(context, 'email_events', {
      select: 'order_id',
      order_id: inFilter(eligible.map((order) => order.id)),
      email_type: 'eq.bank_transfer_reminder',
      status: 'eq.sent'
    }).catch(() => []);
    const remindedIds = new Set((alreadyReminded || []).map((row) => row.order_id));

    let reminded = 0;
    const results = [];
    for (const order of eligible) {
      if (remindedIds.has(order.id)) {
        results.push({ order_id: order.id, order_number: order.order_number, skipped: true, reason: 'already_reminded' });
        continue;
      }
      try {
        const result = await resendOrderEmail(context, order.id, 'bank_transfer_reminder');
        if (result?.sent) reminded += 1;
        results.push({ order_id: order.id, order_number: order.order_number, sent: Boolean(result?.sent) });
      } catch (error) {
        results.push({ order_id: order.id, order_number: order.order_number, sent: false, error: error.message || 'send_failed' });
      }
    }

    return json({ ok: true, checked: eligible.length, reminded, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('bank_transfer_reminder_cron_failed', { message: error?.message || 'unknown' });
    return json({ ok: false, error: 'Havale/EFT hatırlatmaları gönderilemedi.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function onRequestGet() {
  return json({ ok: false, error: 'Bu endpoint yalnızca POST isteğini kabul eder.' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
}
