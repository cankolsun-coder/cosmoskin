import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { requireUser, buildInFilter, groupByOrderId, resolveOrderItem } from '../_lib/account.js';

function safeMeta(meta = {}) {
  return meta && typeof meta === 'object' ? meta : {};
}

function computeTier(orders = []) {
  const paidOrders = orders.filter((order) => ['paid', 'preparing', 'shipped', 'delivered'].includes(order.status));
  const paidTotal = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  if (paidTotal >= 15000 || paidOrders.length >= 8) return { key: 'signature', label: 'Signature Üye', progress: 100, next: null };
  if (paidTotal >= 6000 || paidOrders.length >= 3) return { key: 'select', label: 'Select Üye', progress: Math.min(96, Math.round((paidTotal / 15000) * 100)), next: 'Signature Üye' };
  return { key: 'essential', label: 'Essential Üye', progress: Math.min(92, Math.round((paidTotal / 6000) * 100)), next: 'Select Üye' };
}

function normalizeOrder(order = {}) {
  return {
    ...order,
    order_items: (order.order_items || []).map(resolveOrderItem),
    latest_shipment: Array.isArray(order.shipments) ? order.shipments[0] || null : null
  };
}

function makeSyntheticNotifications({ orders = [], favorites = [] }) {
  const out = [];
  const latest = orders[0];
  if (latest) {
    out.push({
      id: `order-${latest.id}`,
      type: 'order',
      title: 'Sipariş durumu güncellendi',
      body: `${latest.order_number || 'Siparişiniz'} şu an ${latest.status || 'işleniyor'} durumunda.`,
      is_read: false,
      created_at: latest.updated_at || latest.created_at
    });
  }
  if (favorites.length) {
    out.push({
      id: 'favorites-reminder',
      type: 'favorite',
      title: 'Favorilerini sepete taşıyabilirsin',
      body: `${favorites.length} ürün favorilerinde kayıtlı. Stok ve fiyat kontrolü için favorilerini gözden geçir.`,
      is_read: false,
      created_at: new Date().toISOString()
    });
  }
  return out;
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const user = auth.user;
    const meta = safeMeta(user.user_metadata);

    const [ordersRaw, addresses, favorites, dbNotifications] = await Promise.all([
      selectRows(context, 'orders', {
        select: 'id,order_number,status,payment_status,fulfillment_status,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,city,district,postal_code,address_line,cargo_note,created_at,updated_at,paid_at,fulfilled_at,delivered_at',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '12'
      }).catch(() => []),
      selectRows(context, 'user_addresses', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'is_default.desc,updated_at.desc'
      }).catch(() => []),
      selectRows(context, 'user_favorites', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc'
      }).catch(() => []),
      selectRows(context, 'notifications', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '20'
      }).catch(() => [])
    ]);

    const ids = Array.isArray(ordersRaw) ? ordersRaw.map(order => order.id).filter(Boolean) : [];
    let orderItems = [];
    let shipments = [];
    let events = [];
    if (ids.length) {
      const inFilter = buildInFilter(ids);
      [orderItems, shipments, events] = await Promise.all([
        selectRows(context, 'order_items', {
          select: 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total',
          order_id: inFilter,
          order: 'created_at.asc'
        }).catch(() => []),
        selectRows(context, 'shipments', {
          select: 'order_id,status,carrier,tracking_number,tracking_url,shipped_at,delivered_at,created_at,updated_at',
          order_id: inFilter,
          order: 'created_at.desc'
        }).catch(() => []),
        selectRows(context, 'order_status_events', {
          select: 'order_id,status,message,source,created_at',
          order_id: inFilter,
          order: 'created_at.asc'
        }).catch(() => [])
      ]);
    }

    const groupedItems = groupByOrderId(orderItems);
    const groupedShipments = groupByOrderId(shipments);
    const groupedEvents = groupByOrderId(events);
    const orders = (ordersRaw || []).map((order) => normalizeOrder({
      ...order,
      order_items: groupedItems.get(order.id) || [],
      shipments: groupedShipments.get(order.id) || [],
      status_events: groupedEvents.get(order.id) || []
    }));

    const paidOrders = orders.filter((order) => ['paid', 'preparing', 'shipped', 'delivered'].includes(order.status));
    const totalSpent = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const activeOrders = orders.filter((order) => ['paid', 'preparing', 'shipped'].includes(order.status)).length;
    const notifications = (dbNotifications && dbNotifications.length)
      ? dbNotifications
      : makeSyntheticNotifications({ orders, favorites });

    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        first_name: meta.first_name || meta.given_name || meta.name?.split?.(' ')?.[0] || '',
        last_name: meta.last_name || meta.family_name || '',
        full_name: meta.full_name || meta.name || [meta.first_name, meta.last_name].filter(Boolean).join(' '),
        phone: meta.phone || meta.phone_number || '',
        skin_type: meta.skin_type || '',
        skin_concerns: Array.isArray(meta.skin_concerns) ? meta.skin_concerns : [],
        routine_goal: meta.routine_goal || '',
        communication: meta.comm_prefs || meta.communication || {},
        routine_reminders: meta.routine_reminders || {}
      },
      stats: {
        order_count: orders.length,
        paid_order_count: paidOrders.length,
        active_order_count: activeOrders,
        total_spent: Math.round(totalSpent * 100) / 100,
        favorites_count: favorites.length,
        addresses_count: addresses.length,
        unread_notifications: notifications.filter((n) => !n.is_read).length,
        tier: computeTier(orders)
      },
      orders,
      addresses,
      favorites,
      notifications
    });
  } catch (error) {
    console.error('account summary failed:', error);
    return json({ ok: false, error: error.message || 'Hesap özeti alınamadı.' }, { status: 500 });
  }
}
