import { json } from '../_lib/response.js';
import { rpc } from '../_lib/supabase.js';

function safeEqual(left = '', right = '') {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

export async function onRequestPost(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !safeEqual(expected, supplied)) {
    return json({ ok: false, error: 'Yetkilendirme başarısız.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const limit = Math.min(500, Math.max(1, Number(new URL(context.request.url).searchParams.get('limit') || 100)));
    const result = await rpc(context, 'release_expired_inventory_reservations', { p_limit: limit });
    return json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('expired_inventory_release_failed', { code: error?.code || null });
    return json({ ok: false, error: 'Süresi dolan rezervasyonlar serbest bırakılamadı.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function onRequestGet() {
  return json({ ok: false, error: 'Bu endpoint yalnızca POST isteğini kabul eder.' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
}
