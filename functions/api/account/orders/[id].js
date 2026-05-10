import { selectRows } from '../../_lib/supabase.js';
import { json } from '../../_lib/response.js';
import { requireUser, resolveOrderItem } from '../../_lib/account.js';

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const id = context.params?.id || '';
    const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' }).catch(() => []))?.[0];
    if (!order) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    const [items, shipments, events] = await Promise.all([
      selectRows(context, 'order_items', { select: '*', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => []),
      selectRows(context, 'shipments', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc' }).catch(() => []),
      selectRows(context, 'order_status_events', { select: 'status,message,source,created_at', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => [])
    ]);
    return json({ ok: true, order: { ...order, order_items: (items || []).map(resolveOrderItem), shipments: (shipments || []).map((s) => ({ ...s, carrier: s.carrier || s.carrier_name || '' })), status_events: events || [] } });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Sipariş detayı alınamadı.' }, { status: 500 });
  }
}
