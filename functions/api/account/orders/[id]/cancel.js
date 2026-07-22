import { json } from '../../../_lib/response.js';
import { requireUser } from '../../../_lib/account.js';
import {
  cleanCancelReason,
  executeDirectCancel,
  loadOwnedOrderBundle,
  OrderCancellationError,
  resolveCancelMode
} from '../../../_lib/order-cancellation.js';

async function readJsonBody(context) {
  try {
    return await context.request.json();
  } catch (_) {
    return {};
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;

    const orderId = String(context.params?.id || '').trim();
    if (!orderId) {
      return json({ ok: false, error: 'Sipariş kimliği gerekli.' }, { status: 400 });
    }

    const body = await readJsonBody(context);
    const reason = cleanCancelReason(body.reason || body.cancel_reason || '');

    const bundle = await loadOwnedOrderBundle(context, orderId, auth.user);
    if (!bundle) {
      return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    const fresh = await loadOwnedOrderBundle(context, orderId, auth.user);
    if (!fresh) {
      return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    const { order, shipments, returnRows } = fresh;
    const resolved = resolveCancelMode(order, shipments, returnRows);

    if (resolved.alreadyCancelled) {
      const result = await executeDirectCancel(context, order, { reason });
      return json({ ok: true, ...result });
    }

    if (resolved.mode === 'direct') {
      const result = await executeDirectCancel(context, order, { reason });
      return json({ ok: true, ...result });
    }

    return json({ ok: false, error: 'Bu sipariş şu anda iptal edilemiyor.' }, { status: 409 });
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return json({ ok: false, error: error.message, code: error.code }, { status: error.status || 409 });
    }
    console.error('customer order cancel failed:', error?.message || error);
    return json({ ok: false, error: 'Sipariş iptali şu anda tamamlanamadı. Lütfen tekrar deneyin.' }, { status: 500 });
  }
}
