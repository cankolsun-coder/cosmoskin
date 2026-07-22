import { json } from '../_lib/response.js';

// Deliberate no-op: COSMOSKIN Club points do not expire (product decision,
// 2026-07-22 — see COSMOSKIN_PROJECT_MEMORY.md "Product decisions"). The
// ledger's `expires_at` column and balance query already support expiry if
// this is ever reversed, but nothing sets `expires_at`, so this stays a
// permanent no-op rather than an unfinished task.

function assertCron(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('x-cron-secret') || new URL(context.request.url).searchParams.get('secret') || '');
  if (!expected || supplied !== expected) throw Object.assign(new Error('Cron yetkisi geçersiz.'), { status: 401 });
}

export async function onRequestPost(context) {
  try {
    assertCron(context);
    return json({ ok: true, expired: 0, message: 'COSMOSKIN Club puanları süresiz — ürün kararı gereği expiry devre dışı.' });
  } catch (error) { return json({ ok: false, error: error.message || 'Points expiry cron çalışmadı.' }, { status: error.status || 500 }); }
}
