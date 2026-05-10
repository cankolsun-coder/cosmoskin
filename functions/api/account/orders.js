import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { requireUser, buildInFilter, groupByOrderId, resolveOrderItem } from '../_lib/account.js';

function normalizeShipment(row = {}) {
  return { ...row, carrier: row.carrier || row.carrier_name || '' };
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const ordersRaw = await selectRows(context, 'orders', {
      select: 'id,order_number,status,payment_status,fulfillment_status,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,created_at,updated_at,paid_at,fulfilled_at,delivered_at',
      user_id: `eq.${auth.user.id}`,
      order: 'created_at.desc',
      limit: '50'
    }).catch(() => []);
    const ids = (ordersRaw || []).map((order) => order.id).filter(Boolean);
    let items = [];
    let shipments = [];
    if (ids.length) {
      const inFilter = buildInFilter(ids);
      [items, shipments] = await Promise.all([
        selectRows(context, 'order_items', { select: 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total', order_id: inFilter, order: 'created_at.asc' }).catch(() => []),
        selectRows(context, 'shipments', { select: 'order_id,status,carrier,carrier_name,tracking_number,tracking_url,shipped_at,delivered_at,created_at,updated_at', order_id: inFilter, order: 'created_at.desc' }).catch(() => [])
      ]);
    }
    const itemMap = groupByOrderId(items);
    const shipmentMap = groupByOrderId((shipments || []).map(normalizeShipment));
    const orders = (ordersRaw || []).map((order) => ({
      ...order,
      order_items: (itemMap.get(order.id) || []).map(resolveOrderItem),
      shipments: shipmentMap.get(order.id) || []
    }));
    return json({ ok: true, orders });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Siparişler alınamadı.' }, { status: 500 });
  }
}
