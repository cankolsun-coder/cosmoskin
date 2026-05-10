import { insertRow } from './supabase.js';

export const EMAIL_TYPES = new Set([
  'order_created',
  'payment_success',
  'payment_failed',
  'shipment_created',
  'shipment_updated',
  'shipment_delivered',
  'restock_alert',
  'refund_created',
  'return_request_received',
  'review_request'
]);

export const EMAIL_STATUSES = new Set(['pending', 'sent', 'failed', 'skipped']);

function cleanString(value, max = 500) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

export function safeEmailType(value, fallback = 'order_created') {
  const type = String(value || '').trim();
  return EMAIL_TYPES.has(type) ? type : fallback;
}

export function safeEmailStatus(value, fallback = 'pending') {
  const status = String(value || '').trim();
  return EMAIL_STATUSES.has(status) ? status : fallback;
}

export async function recordEmailEvent(context, event = {}) {
  const customerEmail = cleanString(event.customer_email || event.to, 254);
  if (!customerEmail) return null;
  const payload = {
    order_id: event.order_id || null,
    customer_email: customerEmail.toLowerCase(),
    email_type: safeEmailType(event.email_type),
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
