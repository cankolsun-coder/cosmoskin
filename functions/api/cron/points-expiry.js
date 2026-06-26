import { json } from '../_lib/response.js';

function assertCron(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('x-cron-secret') || new URL(context.request.url).searchParams.get('secret') || '');
  if (!expected || supplied !== expected) throw Object.assign(new Error('Cron yetkisi geçersiz.'), { status: 401 });
}

export async function onRequestPost(context) {
  try {
    assertCron(context);
    return json({ ok: true, expired: 0, message: 'Puan expiry ters kayıt modeli için hazır. Süresi dolan kayıtların muhasebe kuralı production onayı sonrası aktive edilmelidir.' });
  } catch (error) { return json({ ok: false, error: error.message || 'Points expiry cron çalışmadı.' }, { status: error.status || 500 }); }
}
