import { json } from '../../_lib/response.js';
import { assertAdmin, adminError } from '../../_lib/admin.js';
import { selectRows } from '../../_lib/supabase.js';

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const id = context.params?.id || '';
    const orders = await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, limit: '1' });
    const order = orders?.[0];
    if (!order) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    const [items, shipments, events, payments, emails] = await Promise.all([
      selectRows(context, 'order_items', { select: '*', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => []),
      selectRows(context, 'shipments', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc' }).catch(() => []),
      selectRows(context, 'order_status_events', { select: '*', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => []),
      selectRows(context, 'payments', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc' }).catch(() => []),
      selectRows(context, 'email_events', { select: '*', order_id: `eq.${id}`, order: 'created_at.desc' }).catch(() => [])
    ]);
    return json({ ok: true, order: { ...order, order_items: items || [], items: items || [], shipments: (shipments || []).map((s) => ({ ...s, carrier: s.carrier || s.carrier_name || '' })), status_events: events || [], payments: payments || [], email_events: emails || [] } });
  } catch (error) {
    return adminError(error, 'Sipariş detayı alınamadı.');
  }
}
