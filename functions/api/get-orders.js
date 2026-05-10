
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
    brand: product?.brand || item.brand || 'COSMOSKIN',
    image: product?.image || item.image || '',
    product_url: product?.url || (productSlug ? `/products/${productSlug}.html` : '')
  };
}
function groupByOrderId(rows = []) {
  return (rows || []).reduce((grouped, row) => {
    const list = grouped.get(row.order_id) || [];
    list.push(row);
    grouped.set(row.order_id, list);
    return grouped;
  }, new Map());
}
function publicInvoice(invoice = {}) {
  return {
    id: invoice.id,
    order_id: invoice.order_id,
    invoice_type: invoice.invoice_type,
    invoice_status: invoice.invoice_status,
    invoice_number: invoice.invoice_number || null,
    provider: invoice.provider || null,
    pdf_url: invoice.pdf_url || null,
    issued_at: invoice.issued_at || null,
    created_at: invoice.created_at || null
  };
}
function publicReturn(row = {}) {
  return {
    id: row.id,
    order_id: row.order_id,
    reason: row.reason,
    status: row.status,
    refund_status: row.refund_status,
    customer_note: row.customer_note || row.note || '',
    admin_note: row.admin_note || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
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
      select: 'id,order_number,status,payment_status,fulfillment_status,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,city,district,postal_code,address_line,billing_address_line,billing_city,billing_district,billing_postal_code,cargo_note,created_at,updated_at,paid_at,fulfilled_at,delivered_at',
      customer_email: `eq.${String(user.email || '').toLowerCase()}`,
      order: 'created_at.desc',
      limit: String(limit),
      offset: String(offset)
    });

    const ids = Array.isArray(orders) ? orders.map(order => order.id).filter(Boolean) : [];
    let items = [], shipments = [], events = [], invoices = [], returns = [];
    if (ids.length) {
      const inFilter = `in.(${ids.join(',')})`;
      [items, shipments, events, invoices, returns] = await Promise.all([
        selectRows(context, 'order_items', { select: 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total', order_id: inFilter, order: 'created_at.asc' }).catch(() => []),
        selectRows(context, 'shipments', { select: 'order_id,status,carrier,carrier_name,tracking_number,tracking_url,shipped_at,delivered_at,created_at,updated_at', order_id: inFilter, order: 'created_at.desc' }).catch(() => []),
        selectRows(context, 'order_status_events', { select: 'order_id,status,message,source,created_at,event_type,note', order_id: inFilter, order: 'created_at.asc' }).catch(() => []),
        selectRows(context, 'invoice_records', { select: 'id,order_id,invoice_type,invoice_status,invoice_number,provider,pdf_url,issued_at,created_at', order_id: inFilter, order: 'created_at.desc' }).catch(() => []),
        selectRows(context, 'return_requests', { select: 'id,order_id,reason,status,refund_status,customer_note,admin_note,created_at,updated_at', order_id: inFilter, order: 'created_at.desc' }).catch(() => [])
      ]);
    }

    const groupedItems = groupByOrderId(items);
    const groupedShipments = groupByOrderId(shipments);
    const groupedEvents = groupByOrderId(events);
    const groupedInvoices = groupByOrderId(invoices);
    const groupedReturns = groupByOrderId(returns);
    const data = (orders || []).map(order => ({
      ...order,
      order_items: (groupedItems.get(order.id) || []).map(resolveOrderItem),
      shipments: (groupedShipments.get(order.id) || []).map((s) => ({ ...s, carrier: s.carrier || s.carrier_name || '' })),
      status_events: groupedEvents.get(order.id) || [],
      invoices: (groupedInvoices.get(order.id) || []).map(publicInvoice),
      return_requests: (groupedReturns.get(order.id) || []).map(publicReturn)
    }));
    return json({ ok: true, orders: data, pagination: { limit, offset, count: data.length } });
  } catch (error) {
    console.error('get-orders failed:', error);
    return json({ ok: false, error: error.message || 'Siparişler alınamadı.' }, { status: 500 });
  }
}
