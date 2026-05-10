import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { resendOrderEmail } from '../../orders.js';

const SAFE_RESEND_TYPES = new Set(['shipment_created', 'shipment_updated', 'order_created', 'payment_success']);

export async function onRequestPost(context) {
  try {
    assertAdmin(context);
    const id = context.params?.id || '';
    const body = await readJsonBody(context);
    const emailType = String(body.email_type || body.type || 'shipment_created').trim();
    if (!SAFE_RESEND_TYPES.has(emailType)) return json({ ok: false, error: 'email_type geçersiz.' }, { status: 400 });
    const result = await resendOrderEmail(context, id, emailType);
    return json({ ok: true, email: result, message: result.sent ? 'E-posta tekrar gönderildi.' : 'E-posta gönderilemedi.' });
  } catch (error) {
    return adminError(error, 'E-posta tekrar gönderilemedi.');
  }
}
