import { assertAdmin, adminError } from '../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../_lib/admin-audit.js';
import { selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { resendOrderEmail } from '../admin/orders.js';

// Same set admin/orders/[id]/emails.js already exposes for a single manual
// resend — order-lifecycle/shipment types resendOrderEmail knows how to
// rebuild from the order + shipment rows alone. Refund/return/invoice types
// have their own idempotent dual-claim senders (lifecycle-emails.js) that
// need a joined refund/return/invoice record; bulk-retrying those blindly
// here would risk reconstructing the wrong context, so they're left for
// their originating admin action to retry instead of guessed at.
const BULK_RETRYABLE_TYPES = new Set([
  'shipment_created', 'shipment_updated', 'shipment_delivered',
  'order_created', 'payment_success', 'payment_confirmed_manual',
  'bank_transfer_pending', 'bank_transfer_reminder', 'bank_transfer_not_received_cancelled',
  'order_preparing', 'order_packed', 'payment_failed', 'order_cancelled'
]);

const MAX_RETRY_ATTEMPTS = 5;
const MAX_ATTEMPTS_PER_RUN = 25;

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'orders:update');
    const failed = await selectRows(context, 'email_events', {
      select: '*',
      status: 'eq.failed',
      order: 'created_at.asc',
      limit: '50'
    }).catch(() => []);

    let retried = 0;
    let resent = 0;
    let deadLettered = 0;
    let skippedUnsupported = 0;

    for (const event of failed || []) {
      if (retried >= MAX_ATTEMPTS_PER_RUN) break;
      const metadata = (event.metadata && typeof event.metadata === 'object') ? event.metadata : {};
      if (metadata.retry_resolved || metadata.dead_letter) continue;
      if (!event.order_id || !BULK_RETRYABLE_TYPES.has(event.email_type)) {
        skippedUnsupported += 1;
        continue;
      }

      retried += 1;
      const attemptNumber = Number(metadata.retry_count || 0) + 1;
      let result;
      try {
        result = await resendOrderEmail(context, event.order_id, event.email_type);
      } catch (error) {
        result = { sent: false, error: error.message || 'retry_failed' };
      }

      if (result?.sent) {
        resent += 1;
        await updateRows(context, 'email_events', { id: event.id }, {
          metadata: { ...metadata, retry_resolved: true, retry_count: attemptNumber, resolved_at: new Date().toISOString() }
        }).catch(() => null);
      } else if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
        deadLettered += 1;
        await updateRows(context, 'email_events', { id: event.id }, {
          metadata: { ...metadata, retry_count: attemptNumber, dead_letter: true, dead_lettered_at: new Date().toISOString(), last_retry_error: result?.error || result?.reason || null }
        }).catch(() => null);
      } else {
        await updateRows(context, 'email_events', { id: event.id }, {
          metadata: { ...metadata, retry_count: attemptNumber, last_retry_at: new Date().toISOString(), last_retry_error: result?.error || result?.reason || null }
        }).catch(() => null);
      }
    }

    await recordAdminActivity(context, {
      action: 'email.retry_failed',
      resource_type: 'email_events',
      metadata: { retried, resent, dead_lettered: deadLettered, skipped_unsupported: skippedUnsupported }
    });
    return json({
      ok: true,
      retried,
      resent,
      dead_lettered: deadLettered,
      skipped_unsupported: skippedUnsupported,
      message: `${resent}/${retried} e-posta yeniden gönderildi.`
    });
  } catch (error) {
    return adminError(error, 'E-posta retry işlemi tamamlanamadı.');
  }
}
