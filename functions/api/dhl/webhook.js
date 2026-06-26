import { json } from '../_lib/response.js';

export async function onRequestPost(context) {
  const expected = String(context.env.DHL_WEBHOOK_SECRET || '');
  if (!expected) return json({ ok: false, code: 'DHL_WEBHOOK_NOT_CONFIGURED', error: 'DHL webhook secret yapılandırılmadı.' }, { status: 503 });
  const supplied = String(context.request.headers.get('x-dhl-webhook-secret') || '');
  if (supplied !== expected) return json({ ok: false, error: 'Webhook yetkisi geçersiz.' }, { status: 401 });
  return json({ ok: true, received: true, message: 'DHL webhook endpoint hazır. Provider payload mapping DHL dokümanı onayı sonrası aktifleştirilmelidir.' });
}
