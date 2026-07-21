import { insertRow, selectRows, updateRowsWhere } from './supabase.js';

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
  'order_cancelled',
  'shipment_created',
  'shipment_updated',
  'shipment_delivered',
  'restock_alert',
  'refund_created',
  'refund_pending',
  'refund_completed',
  'refund_failed',
  'return_request_received',
  'return_approved',
  'return_rejected',
  'review_request',
  // E4: requires the additive email_events CHECK-constraint migration
  // (20260714161845_e4_email_event_types.sql) before events log in production;
  // sends themselves never depend on the event insert succeeding.
  'invoice_ready'
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

export function isUniqueViolationError(error) {
  return /duplicate key|23505/i.test(String(error?.message || ''));
}

/**
 * E4 — durable claim: inserts a 'pending' email_events row carrying the
 * idempotency key BEFORE any send. With the partial unique index from
 * migration 20260714161845_e4_email_event_types.sql, at most one 'pending' or
 * 'sent' row can exist per key, so exactly one concurrent caller acquires the
 * claim; the losers get { claimed: false, reason: 'duplicate' }. Claim-store
 * outages return reason 'unavailable' — callers must NOT send in that case
 * unless another durable claim layer already guarantees exclusivity.
 */
export async function claimEmailEvent(context, { emailType, idempotencyKey, orderId = null, customerEmail, subject = null, metadata = {} } = {}) {
  const type = safeEmailType(emailType);
  const key = String(idempotencyKey || '').trim();
  const email = cleanString(customerEmail, 254);
  if (!type || !key || !email) return { claimed: false, reason: 'invalid' };
  const claimMetadata = { ...(metadata && typeof metadata === 'object' ? metadata : {}), idempotency_key: key, claimed_at: new Date().toISOString() };
  try {
    const event = await insertRow(context, 'email_events', {
      order_id: orderId || null,
      customer_email: email.toLowerCase(),
      email_type: type,
      status: 'pending',
      subject: cleanString(subject, 300),
      metadata: claimMetadata
    });
    return { claimed: true, event };
  } catch (error) {
    if (isUniqueViolationError(error)) return { claimed: false, reason: 'duplicate' };
    console.error('email_events claim insert failed:', { message: error?.message || 'unknown' });
    return { claimed: false, reason: 'unavailable' };
  }
}

/**
 * E4 — looks up the live claim (pending) or completed send (sent) for a key.
 * Distinguishes "nothing found" from "lookup unavailable" so callers never
 * treat an outage as a green light.
 */
export async function findEmailEventClaim(context, { emailType, idempotencyKey } = {}) {
  const type = safeEmailType(emailType);
  const key = String(idempotencyKey || '').trim();
  if (!type || !key) return { ok: false, event: null };
  try {
    const rows = await selectRows(context, 'email_events', {
      select: 'id,status,created_at,metadata',
      email_type: `eq.${type}`,
      status: 'in.(pending,sent)',
      'metadata->>idempotency_key': `eq.${key}`,
      order: 'created_at.desc',
      limit: '5'
    });
    const sent = (rows || []).find((row) => row.status === 'sent');
    return { ok: true, event: sent || rows?.[0] || null };
  } catch (error) {
    console.error('email_events claim lookup failed:', { message: error?.message || 'unknown' });
    return { ok: false, event: null };
  }
}

/**
 * E4 — settles a pending claim to sent/failed/skipped. Compare-and-set on
 * status='pending' so a claim that was reclaimed by another caller can never
 * be overwritten. Returns true only when exactly one row transitioned.
 */
export async function settleEmailEventClaim(context, { eventId, status, provider = null, providerMessageId = null, errorMessage = null, metadata = null } = {}) {
  const id = String(eventId || '').trim();
  if (!id) return false;
  const nextStatus = safeEmailStatus(status, 'failed');
  try {
    const rows = await updateRowsWhere(context, 'email_events', {
      id: `eq.${id}`,
      status: 'eq.pending'
    }, {
      status: nextStatus,
      provider: cleanString(provider, 60),
      provider_message_id: cleanString(providerMessageId, 200),
      error_message: cleanString(errorMessage, 700),
      sent_at: nextStatus === 'sent' ? new Date().toISOString() : null,
      ...(metadata && typeof metadata === 'object' ? { metadata } : {})
    });
    return rows.length === 1;
  } catch (error) {
    console.error('email_events claim settle failed:', { message: error?.message || 'unknown' });
    return false;
  }
}

/**
 * E4 — takes over a stale pending claim (claimant crashed between claim and
 * settle). Compare-and-set on status='pending' AND created_at older than the
 * cutoff, so a fresh in-flight claim can never be stolen. Renews created_at
 * to restart the staleness window for the new claimant.
 */
export async function reclaimStaleEmailEventClaim(context, { eventId, staleBeforeIso, metadata = null } = {}) {
  const id = String(eventId || '').trim();
  if (!id || !staleBeforeIso) return false;
  try {
    const rows = await updateRowsWhere(context, 'email_events', {
      id: `eq.${id}`,
      status: 'eq.pending',
      created_at: `lt.${staleBeforeIso}`
    }, {
      created_at: new Date().toISOString(),
      ...(metadata && typeof metadata === 'object' ? { metadata } : {})
    });
    return rows.length === 1;
  } catch (error) {
    console.error('email_events stale claim takeover failed:', { message: error?.message || 'unknown' });
    return false;
  }
}

/**
 * E4 — idempotency lookup. Returns true when a 'sent' event with the given
 * idempotency key already exists (metadata.idempotency_key). Fails open
 * (false) on lookup errors so a logging outage can't block customer emails —
 * therefore it is only a best-effort SECONDARY check: refund and invoice
 * dispatch both carry a durable primary layer (refund_records/invoice_records
 * metadata claim/stamp) and refunds additionally claim via claimEmailEvent.
 */
export async function hasSentEmailEvent(context, { emailType, idempotencyKey }) {
  const type = safeEmailType(emailType);
  const key = String(idempotencyKey || '').trim();
  if (!type || !key) return false;
  try {
    const rows = await selectRows(context, 'email_events', {
      select: 'id',
      email_type: `eq.${type}`,
      status: 'eq.sent',
      'metadata->>idempotency_key': `eq.${key}`,
      limit: '1'
    });
    return Boolean(rows?.[0]?.id);
  } catch (error) {
    console.error('email_events idempotency lookup failed:', { message: error?.message || 'unknown' });
    return false;
  }
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
