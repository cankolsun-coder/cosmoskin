import { json } from '../../../_lib/response.js';
import { requireUser } from '../../../_lib/account.js';
import { selectRows } from '../../../_lib/supabase.js';
import {
  cleanCancelReason,
  executeItemCancel,
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
    const orderItemId = String(body.order_item_id || body.item_id || '').trim();
    if (!orderItemId) {
      return json({ ok: false, error: 'İptal edilecek ürün seçilmedi.' }, { status: 400 });
    }
    const reason = cleanCancelReason(body.reason || body.cancel_reason || '');

    const bundle = await loadOwnedOrderBundle(context, orderId, auth.user);
    if (!bundle) {
      return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    }
    const { order, shipments, returnRows } = bundle;

    // Order-level eligibility (not shipped, no active return, not terminal) —
    // same guard executeDirectCancel's caller uses; executeItemCancel only
    // handles the item-level branching on top of this.
    resolveCancelMode(order, shipments, returnRows);

    const orderItems = await selectRows(context, 'order_items', {
      select: 'id,order_id,product_id,product_slug,product_name,quantity,line_total,paid_line_total,cancelled_at',
      order_id: `eq.${orderId}`,
      order: 'created_at.asc'
    }).catch(() => []);

    const result = await executeItemCancel(context, order, orderItems || [], orderItemId, { reason });
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return json({ ok: false, error: error.message, code: error.code }, { status: error.status || 409 });
    }
    console.error('customer order item cancel failed:', error?.message || error);
    return json({ ok: false, error: 'Ürün iptali şu anda tamamlanamadı. Lütfen tekrar deneyin.' }, { status: 500 });
  }
}
