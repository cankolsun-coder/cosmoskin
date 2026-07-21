// E4 — Idempotent lifecycle email dispatch (refund_completed, invoice_ready).
// This module owns "send exactly once" semantics; it never computes refund
// amounts or invoice values — it renders what the D2/D2B/D3 refund pipeline
// and invoice_records already persisted.
import { selectRows, updateRows, updateRowsWhere } from './supabase.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from './order-email.js';
import {
  recordEmailEvent,
  hasSentEmailEvent,
  claimEmailEvent,
  findEmailEventClaim,
  settleEmailEventClaim,
  reclaimStaleEmailEventClaim
} from './email-events.js';
import { toAbsoluteEmailUrl } from './email-brand.js';

function cleanEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

// E4 stale-claim retry policy: a 'pending_claimed' refund-email claim (either
// claim store) older than this is considered abandoned — the claimant crashed
// between claim and settle — and may be taken over by the next completion or
// retry trigger. Fresh pending claims are never stolen.
const REFUND_CLAIM_STALE_MS = 15 * 60 * 1000;

function newClaimToken() {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function refundEmailIdempotencyKey({ refundId = '', returnRequestId = '', orderId = '', customerEmail = '' } = {}) {
  // Claim-key convergence: a return-linked refund is ALWAYS keyed by its
  // return request id, no matter which admin endpoint fires first — so
  // refunds.js and returns.js derive the same key even when the refund row is
  // not yet visible to the returns path. Standalone refunds (no return) key
  // by their refund id so each legitimate partial refund emails once.
  const scope = returnRequestId ? `return:${returnRequestId}` : (refundId ? `refund:${refundId}` : `order:${orderId}`);
  return `refund_completed:${scope}:${cleanEmail(customerEmail)}`;
}

/**
 * Sends the refund_completed email exactly once per refund (or per return
 * request when the trigger has no refund record), with a DURABLE claim
 * acquired before any send:
 *
 *   Layer A (primary): compare-and-set claim on the persisted
 *   refund_records.metadata.email — state machine
 *   (none|failed) → pending_claimed → sent | failed. The conditional update
 *   must claim exactly one row; a claim-store outage refuses to send
 *   (retryable) instead of risking a duplicate customer email.
 *
 *   Layer B (cross-path arbiter + audit): a 'pending' email_events claim row
 *   inserted before send, made atomic across concurrent callers by the
 *   unique idempotency-key index in 20260714161845_e4_email_event_types.sql.
 *   This arbitrates the record-less returns path.
 *
 * Duplicate triggers return { skipped: true, reason: 'skipped_duplicate' }.
 * A send failure settles both layers to a retryable 'failed' state and never
 * propagates: the refund transaction is already committed and is never rolled
 * back by email problems.
 */
export async function sendRefundCompletedEmailOnce(context, { order = {}, refund = null, returnRequestId = '', source = 'admin_refunds' } = {}) {
  const customerEmail = cleanEmail(order.customer_email);
  if (!customerEmail) return { sent: false, skipped: true, reason: 'customer_email_missing' };

  // When the trigger has no refund record (returns endpoint), reuse the
  // completed refund persisted by the refunds flow so the email shows the
  // real paid-snapshot amounts.
  let resolvedRefund = refund;
  if (!resolvedRefund && returnRequestId) {
    const rows = await selectRows(context, 'refund_records', {
      select: '*',
      return_request_id: `eq.${returnRequestId}`,
      status: 'eq.completed',
      order: 'created_at.desc',
      limit: '1'
    }).catch(() => []);
    resolvedRefund = rows?.[0] || null;
  }

  const linkedReturnId = returnRequestId || resolvedRefund?.return_request_id || '';
  const idempotencyKey = refundEmailIdempotencyKey({
    refundId: resolvedRefund?.id || '',
    returnRequestId: linkedReturnId,
    orderId: order.id || '',
    customerEmail
  });
  const subject = getCommerceEmailSubject('refund_completed');
  const claimToken = newClaimToken();
  const staleCutoffIso = new Date(Date.now() - REFUND_CLAIM_STALE_MS).toISOString();

  const auditEvent = (status, extra = {}) => recordEmailEvent(context, {
    order_id: order.id,
    customer_email: customerEmail,
    email_type: 'refund_completed',
    status,
    subject,
    metadata: {
      source,
      idempotency_key: idempotencyKey,
      refund_id: resolvedRefund?.id || null,
      return_request_id: linkedReturnId || null,
      ...extra
    }
  });
  const skipDuplicate = async (layer) => {
    await auditEvent('skipped', { reason: 'skipped_duplicate', duplicate_layer: layer });
    return { sent: false, skipped: true, reason: 'skipped_duplicate', idempotency_key: idempotencyKey };
  };
  const claimUnavailable = async (detail) => {
    await auditEvent('failed', { pending_retry: true, error: 'refund_email_claim_unavailable', claim_error: detail || null });
    return { sent: false, error: 'refund_email_claim_unavailable', pending_retry: true, idempotency_key: idempotencyKey };
  };
  const refundMetadataBase = resolvedRefund?.metadata && typeof resolvedRefund.metadata === 'object' ? resolvedRefund.metadata : {};
  const writeRefundStamp = async (stamp) => {
    if (!resolvedRefund?.id) return;
    // Finalization is conditioned on OUR claim token, so a caller whose stale
    // claim was taken over can never overwrite the new claimant's state.
    await updateRowsWhere(context, 'refund_records', {
      id: `eq.${resolvedRefund.id}`,
      'metadata->email->>claim_token': `eq.${claimToken}`
    }, {
      metadata: { ...refundMetadataBase, email: { idempotency_key: idempotencyKey, claim_token: claimToken, ...stamp } }
    }).catch((error) => {
      console.error('refund email stamp write failed:', { message: error?.message || 'unknown' });
    });
  };

  // Fast path: the durable sent-stamp on the refund record itself.
  const priorStamp = resolvedRefund?.metadata?.email;
  if (priorStamp?.state === 'sent' && priorStamp?.idempotency_key === idempotencyKey) {
    return await skipDuplicate('refund_metadata_stamp');
  }

  // --- Layer A: durable CAS claim on the persisted refund record -----------
  let refundClaimHeld = false;
  if (resolvedRefund?.id) {
    const claimStamp = { state: 'pending_claimed', idempotency_key: idempotencyKey, claim_token: claimToken, claimed_at: new Date().toISOString(), source };
    try {
      const claimed = await updateRowsWhere(context, 'refund_records', {
        id: `eq.${resolvedRefund.id}`,
        or: '(metadata->email->>state.is.null,metadata->email->>state.eq.failed)'
      }, { metadata: { ...refundMetadataBase, email: claimStamp } });
      if (claimed.length === 1) {
        refundClaimHeld = true;
      } else {
        // Claim not free: already sent, or another caller's pending claim.
        const currentRows = await selectRows(context, 'refund_records', { select: 'id,metadata', id: `eq.${resolvedRefund.id}`, limit: '1' });
        const currentStamp = currentRows?.[0]?.metadata?.email || null;
        if (currentStamp?.state === 'pending_claimed') {
          // Stale-claim retry policy: only abandoned claims may be taken over.
          const reclaimed = await updateRowsWhere(context, 'refund_records', {
            id: `eq.${resolvedRefund.id}`,
            'metadata->email->>state': 'eq.pending_claimed',
            'metadata->email->>claimed_at': `lt.${staleCutoffIso}`
          }, { metadata: { ...(currentRows[0].metadata || {}), email: { ...claimStamp, reclaimed_from: currentStamp.claim_token || null } } });
          if (reclaimed.length === 1) refundClaimHeld = true;
          else return await skipDuplicate('refund_metadata_claim_in_flight');
        } else {
          // 'sent' (or a state that raced away between CAS and re-read):
          // another caller owns the outcome — never send a second email.
          return await skipDuplicate('refund_metadata_claim');
        }
      }
    } catch (error) {
      return await claimUnavailable(error?.message || 'unknown');
    }
  }

  // --- Layer B: email_events pending-claim ledger ---------------------------
  let claimEventId = null;
  let claimEventMetadata = { source, idempotency_key: idempotencyKey, claim_token: claimToken, refund_id: resolvedRefund?.id || null, return_request_id: linkedReturnId || null };
  const claim = await claimEmailEvent(context, {
    emailType: 'refund_completed',
    idempotencyKey,
    orderId: order.id || null,
    customerEmail,
    subject,
    metadata: claimEventMetadata
  });
  if (claim.claimed) {
    claimEventId = claim.event?.id || null;
    claimEventMetadata = claim.event?.metadata || claimEventMetadata;
  } else if (claim.reason === 'duplicate') {
    const existing = await findEmailEventClaim(context, { emailType: 'refund_completed', idempotencyKey });
    if (!existing.ok) {
      // The unique index proved a live claim/send exists but we cannot see
      // it — never send blind. Layer A (if held) goes stale and stays
      // retryable per the documented policy.
      return await claimUnavailable('claim_conflict_lookup_failed');
    }
    if (existing.event?.status === 'sent') {
      // Send already completed (e.g. an earlier caller sent but crashed
      // before stamping the refund record) — repair the stamp, then skip.
      if (refundClaimHeld) {
        await writeRefundStamp({ state: 'sent', repaired_from_event: existing.event.id, sent_at: existing.event.metadata?.claimed_at || new Date().toISOString() });
      }
      return await skipDuplicate('email_events_claim');
    }
    if (existing.event?.status === 'pending' && existing.event.created_at && String(existing.event.created_at) < staleCutoffIso) {
      const takeover = await reclaimStaleEmailEventClaim(context, {
        eventId: existing.event.id,
        staleBeforeIso: staleCutoffIso,
        metadata: { ...(existing.event.metadata || {}), ...claimEventMetadata, reclaimed_at: new Date().toISOString() }
      });
      if (takeover) {
        claimEventId = existing.event.id;
        claimEventMetadata = { ...(existing.event.metadata || {}), ...claimEventMetadata };
      } else {
        return await skipDuplicate('email_events_claim_in_flight');
      }
    } else if (!claimEventId) {
      // A fresh pending claim is in flight on another caller (possibly one
      // without visibility of the refund record) — it owns the send.
      return await skipDuplicate('email_events_claim_in_flight');
    }
  } else if (claim.reason === 'unavailable' && !refundClaimHeld) {
    // No durable claim of any kind could be acquired — refuse to send.
    console.error('refund email claim ledger unavailable and no refund-record claim held:', { idempotencyKey });
    return { sent: false, error: 'refund_email_claim_unavailable', pending_retry: true, idempotency_key: idempotencyKey };
  }
  // (claim 'unavailable' with Layer A held: safe to proceed — the events
  // ledger being down means no record-less caller can hold a claim either,
  // and Layer A serializes every record-backed caller.)

  // --- Send (claim held) -----------------------------------------------------
  let result;
  try {
    result = await sendCommerceTransactionalEmail(context.env, {
      order,
      type: 'refund_completed',
      refund: resolvedRefund || undefined
    });
  } catch (error) {
    result = { sent: false, error: error?.message || 'email_failed' };
  }

  // --- Settle both layers ----------------------------------------------------
  const settledStatus = result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed');
  const provider = result.provider || (context.env?.BREVO_API_KEY ? 'brevo' : null);
  if (claimEventId) {
    const settled = await settleEmailEventClaim(context, {
      eventId: claimEventId,
      status: settledStatus,
      provider,
      providerMessageId: result.provider_message_id || null,
      errorMessage: result.reason || result.error || null,
      metadata: { ...claimEventMetadata, ...(result.sent ? {} : (result.skipped ? { skip_reason: result.reason || null } : { pending_retry: true })) }
    });
    if (!settled) console.error('refund email claim settle matched no pending row:', { idempotencyKey });
  } else {
    await auditEvent(settledStatus, result.sent ? {} : (result.skipped ? { skip_reason: result.reason || null } : { pending_retry: true }));
  }
  if (refundClaimHeld) {
    await writeRefundStamp(result.sent
      ? { state: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.provider_message_id || null }
      : { state: 'failed', failed_at: new Date().toISOString(), pending_retry: true, error: result.reason || result.error || null });
  }
  return { ...result, ...(result.sent || result.skipped ? {} : { pending_retry: true }), idempotency_key: idempotencyKey };
}

// ---------------------------------------------------------------------------
// Refund lifecycle emails (pending / failed) — P1
// ---------------------------------------------------------------------------

export function refundLifecycleEmailIdempotencyKey(emailType, { refundId = '', returnRequestId = '', orderId = '', customerEmail = '' } = {}) {
  const scope = returnRequestId ? `return:${returnRequestId}` : (refundId ? `refund:${refundId}` : `order:${orderId}`);
  return `${emailType}:${scope}:${cleanEmail(customerEmail)}`;
}

/**
 * Sends refund_pending or refund_failed exactly once per (refund/return,
 * email type), using only the email_events claim ledger (same primitives as
 * maybeSendInvoiceReadyEmail below). Deliberately lighter than
 * sendRefundCompletedEmailOnce's dual-layer CAS: a missed or duplicate
 * "we're processing"/"we hit an issue" notice is not the financial-
 * correctness risk that double-confirming a completed refund would be, so
 * this never touches refund_records.metadata (and can't collide with the
 * completed-email stamp there).
 */
export async function sendRefundLifecycleEmailOnce(context, { order = {}, refund = null, returnRequestId = '', emailType, source = 'admin_refunds' } = {}) {
  const customerEmail = cleanEmail(order.customer_email);
  if (!customerEmail) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  const linkedReturnId = returnRequestId || refund?.return_request_id || '';
  const idempotencyKey = refundLifecycleEmailIdempotencyKey(emailType, {
    refundId: refund?.id || '',
    returnRequestId: linkedReturnId,
    orderId: order.id || '',
    customerEmail
  });
  const subject = getCommerceEmailSubject(emailType);

  const claim = await claimEmailEvent(context, {
    emailType,
    idempotencyKey,
    orderId: order.id || null,
    customerEmail,
    subject,
    metadata: { source, refund_id: refund?.id || null, return_request_id: linkedReturnId || null }
  });
  if (!claim.claimed) {
    if (claim.reason === 'duplicate') return { sent: false, skipped: true, reason: 'skipped_duplicate', idempotency_key: idempotencyKey };
    return { sent: false, error: 'refund_email_claim_unavailable', pending_retry: true, idempotency_key: idempotencyKey };
  }

  let result;
  try {
    result = await sendCommerceTransactionalEmail(context.env, { order, type: emailType, refund: refund || undefined });
  } catch (error) {
    result = { sent: false, error: error?.message || 'email_failed' };
  }

  const settledStatus = result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed');
  const settled = await settleEmailEventClaim(context, {
    eventId: claim.event?.id,
    status: settledStatus,
    provider: result.provider || (context.env?.BREVO_API_KEY ? 'brevo' : null),
    providerMessageId: result.provider_message_id || null,
    errorMessage: result.reason || result.error || null,
    metadata: { source, refund_id: refund?.id || null, return_request_id: linkedReturnId || null }
  });
  if (!settled) console.error('refund lifecycle email claim settle matched no pending row:', { idempotencyKey, emailType });
  return { ...result, idempotency_key: idempotencyKey };
}

// ---------------------------------------------------------------------------
// Invoice-ready email
// ---------------------------------------------------------------------------

const INVOICE_READY_STATUSES = new Set(['issued', 'ready']);

/**
 * Naming-drift adapter: normalizes an invoice row (invoice_records today;
 * tolerant of `invoices`-era field names) without renaming DB columns.
 */
export function normalizeInvoiceForEmail(invoice = {}) {
  return {
    id: invoice.id || null,
    order_id: invoice.order_id || null,
    invoice_number: invoice.invoice_number || invoice.number || '',
    invoice_status: String(invoice.invoice_status || invoice.status || '').toLowerCase(),
    pdf_url: String(invoice.pdf_url || invoice.file_url || invoice.invoice_pdf_url || '').trim(),
    issued_at: invoice.issued_at || invoice.issuedAt || null,
    metadata: invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {}
  };
}

export function invoiceEmailVersionKey(invoice = {}) {
  const normalized = normalizeInvoiceForEmail(invoice);
  // A re-issued PDF or changed invoice number is a new "version" and may
  // legitimately e-mail again; the same version never does.
  const raw = `${normalized.invoice_number}|${normalized.pdf_url}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return `v${Math.abs(hash).toString(36)}`;
}

export function invoiceEmailIdempotencyKey(invoice = {}, customerEmail = '') {
  const normalized = normalizeInvoiceForEmail(invoice);
  return `invoice_ready:${normalized.id}:${invoiceEmailVersionKey(invoice)}:${cleanEmail(customerEmail)}`;
}

export function isInvoiceEmailEligible(invoice = {}) {
  const normalized = normalizeInvoiceForEmail(invoice);
  if (!normalized.id) return { ok: false, reason: 'invoice_missing' };
  if (!INVOICE_READY_STATUSES.has(normalized.invoice_status)) return { ok: false, reason: 'invoice_not_ready' };
  if (!normalized.pdf_url || !/^https:\/\//i.test(toAbsoluteEmailUrl(normalized.pdf_url))) {
    return { ok: false, reason: 'invoice_pdf_missing' };
  }
  return { ok: true };
}

/**
 * Sends the invoice_ready email exactly once per invoice version.
 * Primary dedup: invoice_records.metadata.email (survives even if the
 * email_events insert is unavailable pre-migration). Secondary dedup:
 * email_events idempotency key. Never sends for an invoice without a ready
 * status + HTTPS PDF URL.
 */
export async function maybeSendInvoiceReadyEmail(context, { order = {}, invoice = {}, source = 'admin_invoices' } = {}) {
  const normalized = normalizeInvoiceForEmail(invoice);
  const eligibility = isInvoiceEmailEligible(invoice);
  if (!eligibility.ok) return { sent: false, skipped: true, reason: eligibility.reason };

  const customerEmail = cleanEmail(order.customer_email);
  if (!customerEmail) return { sent: false, skipped: true, reason: 'customer_email_missing' };

  const versionKey = invoiceEmailVersionKey(invoice);
  const idempotencyKey = invoiceEmailIdempotencyKey(invoice, customerEmail);

  const priorStamp = normalized.metadata?.email;
  if (priorStamp && priorStamp.version_key === versionKey && priorStamp.to === customerEmail && priorStamp.sent_at) {
    return { sent: false, skipped: true, reason: 'skipped_duplicate', idempotency_key: idempotencyKey };
  }
  if (await hasSentEmailEvent(context, { emailType: 'invoice_ready', idempotencyKey })) {
    return { sent: false, skipped: true, reason: 'skipped_duplicate', idempotency_key: idempotencyKey };
  }

  let result;
  try {
    result = await sendCommerceTransactionalEmail(context.env, {
      order,
      type: 'invoice_ready',
      invoice: normalized
    });
  } catch (error) {
    result = { sent: false, error: error?.message || 'email_failed' };
  }

  await recordEmailEvent(context, {
    order_id: order.id || normalized.order_id,
    customer_email: customerEmail,
    email_type: 'invoice_ready',
    provider: result.provider || (context.env?.BREVO_API_KEY ? 'brevo' : null),
    status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
    subject: getCommerceEmailSubject('invoice_ready'),
    provider_message_id: result.provider_message_id || null,
    error_message: result.reason || result.error || null,
    metadata: {
      source,
      idempotency_key: idempotencyKey,
      invoice_id: normalized.id,
      invoice_version: versionKey,
      ...(result.sent ? {} : (result.skipped ? {} : { pending_retry: true }))
    }
  });

  if (result.sent) {
    // Merge-write the stamp so the same invoice version can never re-send even
    // if the events table is unavailable. metadata is read-modify-write.
    const nextMetadata = { ...(normalized.metadata || {}), email: { to: customerEmail, version_key: versionKey, sent_at: new Date().toISOString(), provider_message_id: result.provider_message_id || null } };
    await updateRows(context, 'invoice_records', { id: normalized.id }, { metadata: nextMetadata, updated_at: new Date().toISOString() }).catch((error) => {
      console.error('invoice email stamp write failed:', { message: error?.message || 'unknown' });
    });
  }
  return { ...result, idempotency_key: idempotencyKey };
}
