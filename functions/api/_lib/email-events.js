import { insertRow } from './supabase.js';

export const EMAIL_TYPES = new Set([
  'order_created',
  'payment_success',
  'payment_confirmed_manual',
  'payment_failed',
  'bank_transfer_pending',
  'bank_transfer_reminder',
  'bank_transfer_not_received_cancelled',
  'order_preparing',
  'order_packed',
  'shipment_created',
  'shipment_updated',
  'shipment_delivered',
  'restock_alert',
  'refund_created',
  'refund_completed',
  'return_request_received',
  'return_approved',
  'return_rejected',
  'review_request'
]);

export const EMAIL_STATUSES = new Set(['pending', 'sent', 'failed', 'skipped']);

function cleanString(value, max = 500) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

export function safeEmailType(value) {
  const type = String(value || '').trim();
  if (!type) return null;
  return EMAIL_TYPES.has(type) ? type : null;
}

export function safeEmailStatus(value, fallback = 'pending') {
  const status = String(value || '').trim();
  return EMAIL_STATUSES.has(status) ? status : fallback;
}

export async function recordEmailEvent(context, event = {}) {
  const customerEmail = cleanString(event.customer_email || event.to, 254);
  if (!customerEmail) return null;

  const requestedType = String(event.email_type || '').trim();
  const emailType = safeEmailType(requestedType);
  if (!emailType) {
    if (requestedType) {
      const metaSource = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
        ? cleanString(event.metadata.source, 80)
        : null;
      console.warn('email_events insert skipped: unsupported email_type', {
        email_type: requestedType.slice(0, 80),
        ...(metaSource ? { source: metaSource } : {})
      });
    }
    return null;
  }

  const payload = {
    order_id: event.order_id || null,
    customer_email: customerEmail.toLowerCase(),
    email_type: emailType,
    provider: cleanString(event.provider, 60),
    status: safeEmailStatus(event.status),
    subject: cleanString(event.subject, 300),
    provider_message_id: cleanString(event.provider_message_id || event.message_id, 200),
    error_message: cleanString(event.error_message || event.error, 700),
    metadata: event.metadata || null,
    sent_at: safeEmailStatus(event.status) === 'sent' ? (event.sent_at || new Date().toISOString()) : null
  };
  try {
    return await insertRow(context, 'email_events', payload);
  } catch (error) {
    console.error('email_events insert failed:', error);
    return null;
  }
}
