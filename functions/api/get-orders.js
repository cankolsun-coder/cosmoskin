import { getUserFromAccessToken, selectRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
import { getCatalogProductByHandle, getCatalogProductByName } from './_lib/catalog.js';

function resolveOrderItem(item = {}) {
  const product =
    getCatalogProductByHandle(item.product_slug || item.product_id || '') ||
    getCatalogProductByName(item.product_name || '');

  const productSlug = product?.slug || item.product_slug || item.product_id || null;

  return {
    ...item,
    product_id: product?.id || item.product_id || productSlug,
    product_slug: productSlug,
    product_name: product?.name || item.product_name || 'Ürün',
    brand: product?.brand || item.brand || 'Cosmoskin',
    image: product?.image || item.image || '',
    product_url: product?.url || (productSlug ? `/products/${productSlug}.html` : '')
  };
}

function groupByOrderId(rows = []) {
  const grouped = new Map();
  for (const row of rows || []) {
    const list = grouped.get(row.order_id) || [];
    list.push(row);
    grouped.set(row.order_id, list);
  }
  return grouped;
}

export async function onRequestGet(context) {
  try {
    const authHeader = context.request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: 'Oturum gerekli.' }, { status: 401 });

    const user = await getUserFromAccessToken(context, token);
    if (!user) return json({ ok: false, error: 'Geçersiz oturum.' }, { status: 401 });

    const url = new URL(context.request.url);
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 50);
    const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    const orders = await selectRows(context, 'orders', {
      select: 'id,order_number,status,payment_status,fulfillment_status,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,city,district,postal_code,address_line,cargo_note,created_at,paid_at,fulfilled_at,delivered_at',
      user_id: `eq.${user.id}`,
      order: 'created_at.desc',
      limit: String(limit),
      offset: String(offset)
    });

    const ids = Array.isArray(orders) ? orders.map(order => order.id).filter(Boolean) : [];
    let items = [];
    let shipments = [];
    let events = [];

    if (ids.length) {
      const inFilter = `in.(${ids.join(',')})`;
      items = await selectRows(context, 'order_items', {
        select: 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total',
        order_id: inFilter,
        order: 'created_at.asc'
      });
      shipments = await selectRows(context, 'shipments', {
        select: 'order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,created_at',
        order_id: inFilter,
        order: 'created_at.desc'
      });
      events = await selectRows(context, 'order_status_events', {
        select: 'order_id,status,message,source,created_at',
        order_id: inFilter,
        order: 'created_at.asc'
      });
    }

    const groupedItems = groupByOrderId(items);
    const groupedShipments = groupByOrderId(shipments);
    const groupedEvents = groupByOrderId(events);

    const data = (orders || []).map(order => ({
      ...order,
      order_items: (groupedItems.get(order.id) || []).map(resolveOrderItem),
      shipments: groupedShipments.get(order.id) || [],
      status_events: groupedEvents.get(order.id) || []
    }));

    return json({ ok: true, orders: data, pagination: { limit, offset, count: data.length } });
  } catch (error) {
    console.error('get-orders failed:', error);
    return json({ ok: false, error: error.message || 'Siparişler alınamadı.' }, { status: 500 });
  }
}
