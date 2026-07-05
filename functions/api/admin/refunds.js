import { selectRows, insertRow, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { recordEmailEvent } from '../_lib/email-events.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from '../_lib/order-email.js';
import { reverseOrderPoints } from '../_lib/loyalty-ledger.js';

const STATUSES = new Set(['pending', 'completed', 'failed', 'cancelled']);
const ERR_REFERENCE_REQUIRED = 'Tamamlanan iade için işlem referansı zorunludur.';

function clean(v, m = 500) { return String(v || '').trim().slice(0, m); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

async function loadOrder(context, id) {
  return (await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, limit: '1' }).catch(() => []))?.[0] || null;
}

async function logRefundEmail(context, order, result) {
  await recordEmailEvent(context, {
    order_id: order.id,
    customer_email: order.customer_email,
    email_type: 'refund_completed',
    provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
    status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
    subject: getCommerceEmailSubject('refund_completed'),
    provider_message_id: result.provider_message_id || null,
    error_message: result.reason || result.error || null,
    metadata: { source: 'admin_refunds' }
  });
}

async function findCompletedRefund(context, { returnRequestId, orderId }) {
  if (returnRequestId) {
    const rows = await selectRows(context, 'refund_records', {
      select: '*',
      return_request_id: `eq.${returnRequestId}`,
      status: 'eq.completed',
      limit: '1'
    }).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  if (orderId) {
    const rows = await selectRows(context, 'refund_records', {
      select: '*',
      order_id: `eq.${orderId}`,
      status: 'eq.completed',
      limit: '5'
    }).catch(() => []);
    if (returnRequestId) {
      return rows.find((row) => row.return_request_id === returnRequestId) || null;
    }
  }
  return null;
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'refunds:update');
    const url = new URL(context.request.url);
    const params = { select: '*', order: 'created_at.desc', limit: String(Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 100)))) };
    const orderId = clean(url.searchParams.get('order_id'), 120);
    const status = clean(url.searchParams.get('status'), 40);
    if (orderId) params.order_id = `eq.${orderId}`;
    if (status && status !== 'all') params.status = `eq.${status}`;
    const refunds = await selectRows(context, 'refund_records', params).catch(() => []);
    return json({ ok: true, refunds: refunds || [] });
  } catch (error) {
    return adminError(error, 'Refund kayıtları alınamadı.');
  }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'refunds:update');
    const body = await readJsonBody(context);
    const orderId = clean(body.order_id, 120);
    if (!orderId) return json({ ok: false, error: 'order_id gerekli.' }, { status: 400 });
    const order = await loadOrder(context, orderId);
    if (!order) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });

    const status = clean(body.status || 'pending', 40);
    if (!STATUSES.has(status)) return json({ ok: false, error: 'status geçersiz.' }, { status: 400 });

    const returnRequestId = clean(body.return_request_id, 120) || null;
    const providerReference = clean(body.provider_reference, 200);

    if (status === 'completed') {
      if (!providerReference) {
        return json({ ok: false, error: ERR_REFERENCE_REQUIRED }, { status: 400 });
      }
      const existingCompleted = await findCompletedRefund(context, { returnRequestId, orderId });
      if (existingCompleted) {
        return json({
          ok: true,
          idempotent: true,
          refund: existingCompleted,
          email: null,
          message: 'Bu iade kaydı zaten tamamlanmış.'
        });
      }
    }

    const payload = {
      order_id: orderId,
      return_request_id: returnRequestId,
      amount: num(body.amount),
      currency: clean(body.currency || order.currency || 'TRY', 10),
      status,
      provider: clean(body.provider, 80) || 'manual',
      provider_reference: status === 'completed' ? providerReference : (providerReference || null),
      error_message: clean(body.error_message, 500) || null,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      metadata: {
        manual: true,
        warning: 'Gerçek Iyzico refund API çağrısı yapılmadı.',
        note: clean(body.note, 500) || null
      }
    };

    const refund = await insertRow(context, 'refund_records', payload);
    await insertRow(context, 'order_status_events', {
      order_id: orderId,
      status: 'refund_' + status,
      event_type: 'refund_' + status,
      source: 'admin',
      created_by: 'admin',
      message: 'İade ödeme kaydı oluşturuldu.',
      note: payload.metadata.note,
      metadata: { refund_id: refund?.id || null, return_request_id: payload.return_request_id }
    }).catch(() => null);

    if (payload.return_request_id) {
      await updateRows(context, 'return_requests', { id: payload.return_request_id }, {
        refund_status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'pending',
        status: status === 'completed' ? 'refunded' : undefined,
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }

    let email = null;
    if (status === 'completed') {
      await reverseOrderPoints(context, orderId, {
        reason: clean(body.note, 200) || 'admin_refund_completed',
        source: 'admin_refund',
        refundAmount: payload.amount
      });
      try {
        email = await sendCommerceTransactionalEmail(context.env, { order, type: 'refund_completed' });
        await logRefundEmail(context, order, email);
      } catch (error) {
        email = { sent: false, error: 'email_failed' };
        await logRefundEmail(context, order, email);
      }
    }

    return json({
      ok: true,
      refund,
      email,
      message: 'Refund kaydı oluşturuldu. Gerçek ödeme sağlayıcı refund işlemi çalıştırılmadı.'
    });
  } catch (error) {
    return adminError(error, 'Refund kaydı oluşturulamadı.');
  }
}
