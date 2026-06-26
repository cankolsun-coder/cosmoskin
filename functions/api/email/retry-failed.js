import { assertAdmin, adminError } from '../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../_lib/admin-audit.js';
import { selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'orders:read');
    const failed = await selectRows(context, 'email_events', {
      select: '*',
      status: 'eq.failed',
      order: 'created_at.asc',
      limit: '25'
    }).catch(() => []);
    let queued = 0;
    for (const event of failed || []) {
      await updateRows(context, 'email_events', { id: event.id }, {
        status: 'retry_queued',
        metadata: { ...(event.metadata || {}), retry_queued_at: new Date().toISOString(), note: 'Manual retry queue marker; provider-specific resend is gated until templates are verified.' }
      }).catch(() => null);
      queued += 1;
    }
    await recordAdminActivity(context, { action: 'email.retry_failed_queued', resource_type: 'email_events', metadata: { queued } });
    return json({ ok: true, queued, message: 'Failed e-postalar retry kuyruğu için işaretlendi. Provider-specific tekrar gönderim production template onayı sonrası aktif edilmelidir.' });
  } catch (error) {
    return adminError(error, 'E-posta retry işlemi tamamlanamadı.');
  }
}
