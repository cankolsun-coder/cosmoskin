
import { json } from '../_lib/response.js';
import { recordCrmEvent } from '../_lib/crm-events.js';
import { assertRateLimit, publicError } from '../_lib/security.js';

export async function onRequestPost(context) {
  try {
    assertRateLimit(context, 'crm-events', 60, 10 * 60 * 1000);
    const body = await context.request.json().catch(() => ({}));
    const row = await recordCrmEvent(context, body);
    return json({ ok: true, recorded: Boolean(row) });
  } catch (error) {
    console.error('crm event failed:', { message: error?.message || 'unknown' });
    return publicError(error, 'Etkinlik kaydı şu anda oluşturulamadı.');
  }
}
