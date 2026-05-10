
import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';

function count(rows, fn) { return (rows || []).filter(fn).length; }
function todayStartIso() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const [orders, inventory, alerts, emails, returns, payments, shipments, lots] = await Promise.all([
      selectRows(context, 'orders', { select: 'id,status,payment_status,fulfillment_status,total_amount,currency,created_at,delivered_at', order: 'created_at.desc', limit: '500' }).catch(() => []),
      selectRows(context, 'product_inventory', { select: 'product_slug,stock_on_hand,stock_reserved,low_stock_threshold,status', limit: '500' }).catch(() => []),
      selectRows(context, 'restock_alerts', { select: 'id,status', limit: '500' }).catch(() => []),
      selectRows(context, 'email_events', { select: 'id,status,email_type,created_at', order: 'created_at.desc', limit: '500' }).catch(() => []),
      selectRows(context, 'return_requests', { select: 'id,status,refund_status,created_at', order: 'created_at.desc', limit: '500' }).catch(() => []),
      selectRows(context, 'payment_events', { select: 'id,event_type,status,created_at', order: 'created_at.desc', limit: '500' }).catch(() => []),
      selectRows(context, 'shipments', { select: 'id,status,delivered_at,created_at', order: 'created_at.desc', limit: '500' }).catch(() => []),
      selectRows(context, 'inventory_lots', { select: 'id,status,expiry_date,product_slug', order: 'expiry_date.asc', limit: '200' }).catch(() => [])
    ]);
    const now = Date.now();
    const dayStart = todayStartIso();
    const inventorySummary = (inventory || []).reduce((acc, row) => {
      const available = Math.max(0, Number(row.stock_on_hand || 0) - Number(row.stock_reserved || 0));
      if (String(row.status || 'active') !== 'active') return acc;
      if (available <= 0) acc.out_of_stock += 1;
      else if (available <= Number(row.low_stock_threshold || 5)) acc.low_stock += 1;
      return acc;
    }, { low_stock: 0, out_of_stock: 0 });
    const paidToday = (orders || []).filter((o) => o.payment_status === 'paid' && String(o.created_at || '') >= dayStart);
    const revenueToday = paidToday.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const expiringSoon = (lots || []).filter((lot) => lot.expiry_date && new Date(lot.expiry_date).getTime() - now <= 90*24*60*60*1000 && new Date(lot.expiry_date).getTime() >= now && lot.status === 'sellable').length;
    return json({ ok: true, summary: {
      new_orders: count(orders, (o) => o.status === 'pending' || o.payment_status === 'paid'),
      preparing_orders: count(orders, (o) => o.fulfillment_status === 'preparing' || o.status === 'preparing'),
      packed_orders: count(orders, (o) => o.fulfillment_status === 'packed' || o.status === 'packed'),
      shipped_orders: count(orders, (o) => o.fulfillment_status === 'shipped' || o.status === 'shipped'),
      delivered_today: count(shipments, (s) => String(s.delivered_at || '').slice(0,10) === dayStart.slice(0,10) || s.status === 'delivered' && String(s.created_at || '').slice(0,10) === dayStart.slice(0,10)),
      low_stock_products: inventorySummary.low_stock,
      out_of_stock_products: inventorySummary.out_of_stock,
      pending_restock_alerts: count(alerts, (a) => a.status === 'waiting' || a.status === 'pending'),
      failed_emails: count(emails, (e) => e.status === 'failed'),
      return_requests: count(returns, (r) => !['closed','refunded','rejected'].includes(r.status)),
      payment_failures: count(payments, (p) => p.event_type === 'payment_failed' || p.status === 'failed'),
      expiring_lots_90d: expiringSoon,
      revenue_today: Number(revenueToday.toFixed(2))
    }});
  } catch (error) {
    return adminError(error, 'Dashboard özeti alınamadı.');
  }
}
