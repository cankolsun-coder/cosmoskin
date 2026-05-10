import { json } from '../../_lib/response.js';
import { assertAdmin, adminError } from '../../_lib/admin.js';
import { selectRows } from '../../_lib/supabase.js';

function groupBy(arr = [], key = 'order_id') {
  return arr.reduce((map, item) => { const value = item?.[key]; if (!value) return map; (map[value] = map[value] || []).push(item); return map; }, {});
}

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const id = context.params?.id || '';
    const orders = await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, limit: '1' });
    const order = orders?.[0];
    if (!order) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    const [items, shipments, events, payments] = await Promise.all([
      selectRows(context, 'order_items', { select: '*', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => []),
      selectRows(context, 'shipments', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc' }).catch(() => []),
      selectRows(context, 'order_status_events', { select: '*', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => []),
      selectRows(context, 'payments', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc' }).catch(() => [])
    ]);
    return json({ ok: true, order: { ...order, order_items: items || [], items: items || [], shipments: shipments || [], status_events: events || [], payments: payments || [] } });
  } catch (error) {
    return adminError(error, 'Sipariş detayı alınamadı.');
  }
}
