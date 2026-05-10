import { json } from './_lib/response.js';
import { assertRateLimit } from './_lib/security.js';
import { selectRows } from './_lib/supabase.js';

function normalizeEmail(value = '') { return String(value || '').trim().toLowerCase(); }
function cleanOrderNumber(value = '') { return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80); }
function publicOrder(order = {}, items = [], shipments = [], invoices = []) {
  return {
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    currency: order.currency || 'TRY',
    total_amount: order.total_amount,
    created_at: order.created_at,
    paid_at: order.paid_at,
    fulfilled_at: order.fulfilled_at,
    delivered_at: order.delivered_at,
    items: (items || []).map((item) => ({
      product_slug: item.product_slug || item.product_id || null,
      product_name: item.product_name || 'Ürün',
      brand: item.brand || '',
      quantity: item.quantity || 1,
      image: item.image || null
    })),
    shipment: (shipments || [])[0] ? {
      status: shipments[0].status || null,
      carrier: shipments[0].carrier || shipments[0].carrier_name || null,
      carrier_name: shipments[0].carrier_name || shipments[0].carrier || null,
      tracking_number: shipments[0].tracking_number || null,
      tracking_url: shipments[0].tracking_url || null,
      shipped_at: shipments[0].shipped_at || null,
      delivered_at: shipments[0].delivered_at || null
    } : null,
    invoice: (invoices || []).find((invoice) => invoice.pdf_url) ? {
      invoice_status: (invoices || []).find((invoice) => invoice.pdf_url).invoice_status,
      invoice_number: (invoices || []).find((invoice) => invoice.pdf_url).invoice_number || null,
      pdf_url: (invoices || []).find((invoice) => invoice.pdf_url).pdf_url
    } : null
  };
}

async function handleTracking(context, input = {}) {
  assertRateLimit(context, 'order-tracking', 12, 10 * 60 * 1000);
  const orderNumber = cleanOrderNumber(input.order_number || input.orderNumber);
  const email = normalizeEmail(input.email);
  if (!orderNumber || !email) return json({ ok: false, error: 'Sipariş numarası ve e-posta gerekli.' }, { status: 400 });
  const rows = await selectRows(context, 'orders', {
    select: 'id,order_number,status,payment_status,fulfillment_status,currency,total_amount,customer_email,created_at,paid_at,fulfilled_at,delivered_at',
    order_number: `eq.${orderNumber}`,
    customer_email: `eq.${email}`,
    limit: '1'
  }).catch(() => []);
  const order = rows?.[0] || null;
  if (!order) return json({ ok: false, error: 'Bu bilgilerle eşleşen bir sipariş bulunamadı.' }, { status: 404 });
  const [items, shipments, invoices] = await Promise.all([
    selectRows(context, 'order_items', { select: 'product_slug,product_id,product_name,brand,quantity,image', order_id: `eq.${order.id}`, order: 'created_at.asc' }).catch(() => []),
    selectRows(context, 'shipments', { select: 'status,carrier,carrier_name,tracking_number,tracking_url,shipped_at,delivered_at,updated_at,created_at', order_id: `eq.${order.id}`, order: 'created_at.desc', limit: '1' }).catch(() => []),
    selectRows(context, 'invoice_records', { select: 'invoice_status,invoice_number,pdf_url', order_id: `eq.${order.id}`, order: 'created_at.desc' }).catch(() => [])
  ]);
  return json({ ok: true, order: publicOrder(order, items, shipments, invoices) });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    return await handleTracking(context, { order_number: url.searchParams.get('order_number'), email: url.searchParams.get('email') });
  } catch (error) {
    console.error('guest order tracking failed:', error);
    return json({ ok: false, error: 'Sipariş takibi şu anda alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    return await handleTracking(context, body);
  } catch (error) {
    console.error('guest order tracking failed:', error);
    return json({ ok: false, error: 'Sipariş takibi şu anda alınamadı.' }, { status: 500 });
  }
}
