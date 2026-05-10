import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const rows = await selectRows(context, 'orders', {
      select: 'customer_email,customer_first_name,customer_last_name,total_amount,payment_status,created_at',
      order: 'created_at.desc',
      limit: '1000'
    }).catch(() => []);
    const map = new Map();
    for (const order of rows || []) {
      const email = String(order.customer_email || '').toLowerCase();
      if (!email) continue;
      const existing = map.get(email) || { email, first_name: order.customer_first_name || '', last_name: order.customer_last_name || '', order_count: 0, paid_order_count: 0, total_paid_amount: 0, last_order_at: null };
      existing.order_count += 1;
      if (order.payment_status === 'paid') {
        existing.paid_order_count += 1;
        existing.total_paid_amount += Number(order.total_amount || 0);
      }
      if (!existing.last_order_at || String(order.created_at || '') > existing.last_order_at) existing.last_order_at = order.created_at || null;
      map.set(email, existing);
    }
    return json({ ok: true, customers: Array.from(map.values()).sort((a,b) => String(b.last_order_at || '').localeCompare(String(a.last_order_at || ''))).slice(0, 300) });
  } catch (error) {
    return adminError(error, 'Müşteri özeti alınamadı.');
  }
}
