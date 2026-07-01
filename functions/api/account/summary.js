import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { requireUser, buildInFilter, groupByOrderId, resolveOrderItem } from '../_lib/account.js';

function safeMeta(meta = {}) {
  return meta && typeof meta === 'object' ? meta : {};
}

function computeTier(orders = []) {
  const paidOrders = orders.filter((order) => ['paid', 'confirmed', 'processing', 'preparing', 'shipped', 'delivered', 'completed'].includes(String(order.status || '').toLowerCase()) || ['paid', 'confirmed', 'captured'].includes(String(order.payment_status || '').toLowerCase()));
  const paidTotal = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  if (paidTotal >= 15000) return { key: 'elite', label: 'Elite Üye', progress: 100, next: null };
  if (paidTotal >= 5000) return { key: 'signature', label: 'Signature Üye', progress: Math.min(96, Math.round(((paidTotal - 5000) / 10000) * 100)), next: 'Elite Üye' };
  return { key: 'essential', label: 'Essential Üye', progress: Math.min(92, Math.round((paidTotal / 5000) * 100)), next: 'Signature Üye' };
}

function normalizeOrder(order = {}) {
  return {
    ...order,
    order_items: (order.order_items || []).map(resolveOrderItem),
    latest_shipment: Array.isArray(order.shipments) ? order.shipments[0] || null : null
  };
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const user = auth.user;
    const meta = safeMeta(user.user_metadata);

    const [ordersRaw, addresses, favorites, dbNotifications, profiles, membershipRows, pointsRows, couponRows, skinProfiles, routineResults, consentRows, preferenceRows, supportRows] = await Promise.all([
      selectRows(context, 'orders', {
        select: 'id,order_number,status,payment_status,fulfillment_status,payment_method,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,invoice_type,billing_first_name,billing_last_name,billing_email,billing_phone,company_title,tax_office,tax_number,corporate_email,is_e_invoice_taxpayer,city,district,postal_code,address_line,billing_address_line,billing_city,billing_district,billing_postal_code,cargo_note,legal_consents,created_at,updated_at,paid_at,fulfilled_at,delivered_at',
        or: `(user_id.eq.${user.id},customer_email.eq.${String(user.email || '').toLowerCase()})`,
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
      }).catch(() => []),
      selectRows(context, 'profiles', {
        select: '*',
        id: `eq.${user.id}`,
        limit: '1'
      }).catch(() => []),
      selectRows(context, 'customer_membership_status', {
        select: '*',
        user_id: `eq.${user.id}`,
        limit: '1'
      }).catch(() => []),
      selectRows(context, 'loyalty_points_ledger', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '20'
      }).catch(() => []),
      selectRows(context, 'customer_coupons', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '20'
      }).catch(() => []),
      selectRows(context, 'customer_skin_profiles', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'updated_at.desc',
        limit: '1'
      }).catch(() => []),
      selectRows(context, 'customer_routine_results', {
        select: '*',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '10'
      }).catch(() => []),
      selectRows(context, 'consent_records', {
        select: 'id,consent_type,status,version,source,created_at,updated_at',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '30'
      }).catch(() => []),
      selectRows(context, 'notification_preferences', {
        select: '*',
        user_id: `eq.${user.id}`,
        limit: '1'
      }).catch(() => []),
      selectRows(context, 'support_requests', {
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
    let invoices = [];
    let returns = [];
    if (ids.length) {
      const inFilter = buildInFilter(ids);
      [orderItems, shipments, events, invoices, returns] = await Promise.all([
        selectRows(context, 'order_items', {
          select: 'order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total',
          order_id: inFilter,
          order: 'created_at.asc'
        }).catch(() => []),
        selectRows(context, 'shipments', {
          select: 'order_id,status,carrier,carrier_name,tracking_number,tracking_url,shipped_at,delivered_at,created_at,updated_at',
          order_id: inFilter,
          order: 'created_at.desc'
        }).catch(() => []),
        selectRows(context, 'order_status_events', {
          select: 'order_id,status,message,source,created_at',
          order_id: inFilter,
          order: 'created_at.asc'
        }).catch(() => []),
        selectRows(context, 'invoice_records', {
          select: 'id,order_id,invoice_type,invoice_status,invoice_number,provider,pdf_url,issued_at,created_at',
          order_id: inFilter,
          order: 'created_at.desc'
        }).catch(() => []),
        selectRows(context, 'return_requests', {
          select: 'id,order_id,reason,status,refund_status,customer_note,admin_note,created_at,updated_at',
          order_id: inFilter,
          order: 'created_at.desc'
        }).catch(() => [])
      ]);
    }

    const groupedItems = groupByOrderId(orderItems);
    const groupedShipments = groupByOrderId(shipments);
    const groupedEvents = groupByOrderId(events);
    const groupedInvoices = groupByOrderId(invoices);
    const groupedReturns = groupByOrderId(returns);
    const orders = (ordersRaw || []).map((order) => normalizeOrder({
      ...order,
      order_items: groupedItems.get(order.id) || [],
      shipments: groupedShipments.get(order.id) || [],
      status_events: groupedEvents.get(order.id) || [],
      invoices: groupedInvoices.get(order.id) || [],
      return_requests: groupedReturns.get(order.id) || []
    }));

    const paidOrders = orders.filter((order) => ['paid', 'confirmed', 'processing', 'preparing', 'shipped', 'delivered', 'completed'].includes(String(order.status || '').toLowerCase()) || ['paid', 'confirmed', 'captured'].includes(String(order.payment_status || '').toLowerCase()));
    const totalSpent = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const activeOrders = orders.filter((order) => ['paid', 'preparing', 'shipped'].includes(order.status)).length;
    const profile = Array.isArray(profiles) ? profiles[0] || null : null;
    const membership = Array.isArray(membershipRows) ? membershipRows[0] || null : null;
    const pointLedger = Array.isArray(pointsRows) ? pointsRows : [];
    const availablePoints = pointLedger.filter((row) => String(row.status || '').toLowerCase() === 'available').reduce((sum, row) => sum + Number(row.points_delta || row.points || 0), 0);
    const pendingPoints = pointLedger.filter((row) => String(row.status || '').toLowerCase() === 'pending').reduce((sum, row) => sum + Math.max(0, Number(row.points_delta || row.points || 0)), 0);
    const reversedPoints = pointLedger.filter((row) => ['reversed', 'expired'].includes(String(row.status || '').toLowerCase())).reduce((sum, row) => sum + Math.abs(Number(row.points_delta || row.points || 0)), 0);
    const pointsBalance = Math.max(0, Number(membership?.available_points ?? availablePoints ?? 0));
    const notifications = Array.isArray(dbNotifications) ? dbNotifications : [];
    const notificationPreferences = Array.isArray(preferenceRows) ? preferenceRows[0] || null : null;
    const supportRequests = Array.isArray(supportRows) ? supportRows : [];

    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        first_name: profile?.first_name || meta.first_name || meta.given_name || meta.name?.split?.(' ')?.[0] || '',
        last_name: profile?.last_name || meta.last_name || meta.family_name || '',
        full_name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') : (meta.full_name || meta.name || [meta.first_name, meta.last_name].filter(Boolean).join(' ')),
        phone: profile?.phone || meta.phone || meta.phone_number || '',
        birthday: profile?.birthday || '',
        account_status: profile?.account_status || 'active',
        skin_type: skinProfiles?.[0]?.skin_type || meta.skin_type || '',
        skin_sensitivity: skinProfiles?.[0]?.skin_sensitivity || skinProfiles?.[0]?.sensitivity || meta.skin_sensitivity || '',
        skin_concerns: Array.isArray(skinProfiles?.[0]?.skin_concerns) ? skinProfiles[0].skin_concerns : (Array.isArray(skinProfiles?.[0]?.concerns) ? skinProfiles[0].concerns : (Array.isArray(meta.skin_concerns) ? meta.skin_concerns : [])),
        routine_goal: skinProfiles?.[0]?.routine_goal || meta.routine_goal || '',
        routine_style: skinProfiles?.[0]?.routine_style || meta.routine_style || meta.routine_intensity || '',
        skin_profile_updated_at: skinProfiles?.[0]?.updated_at || meta.skin_profile_updated_at || meta.skinProfileUpdatedAt || meta.updatedAt || '',
        communication: {
          ...(meta.comm_prefs || meta.communication || {}),
          order_updates: notificationPreferences?.order_updates !== false,
          cargo_updates: notificationPreferences?.cargo_updates !== false,
          marketing_email_opt_in: Boolean(notificationPreferences?.campaign_emails ?? profile?.marketing_email_opt_in),
          newsletter_opt_in: Boolean(notificationPreferences?.newsletter ?? profile?.newsletter_opt_in),
          stock_alert_opt_in: Boolean(notificationPreferences?.stock_notifications ?? profile?.stock_alert_opt_in),
          routine_reminder_opt_in: Boolean(notificationPreferences?.routine_reminders ?? profile?.routine_reminder_opt_in),
          sms_notifications: Boolean(notificationPreferences?.sms_notifications ?? profile?.marketing_sms_opt_in)
        },
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
        tier: membership ? {
          key: membership.level_code,
          label: membership.level_code === 'elite' ? 'Elite Üye' : membership.level_code === 'signature' ? 'Signature Üye' : 'Essential Üye',
          progress: Number(membership.progress_percent || 0),
          next: membership.next_level_code || null,
          points_balance: pointsBalance
        } : computeTier(orders),
        points_balance: pointsBalance,
        available_coupons_count: Array.isArray(couponRows) ? couponRows.filter((coupon) => coupon.status === 'available').length : 0
      },
      membership,
      points: {
        balance: pointsBalance,
        available: Math.max(0, Math.round(pointsBalance)),
        pending: Math.max(0, Math.round(pendingPoints)),
        reversed: Math.max(0, Math.round(reversedPoints)),
        ledger: pointLedger
      },
      coupons: couponRows || [],
      skin_profile: skinProfiles?.[0] || null,
      routine_results: routineResults || [],
      legal_consents: consentRows || [],
      notification_preferences: notificationPreferences || null,
      support_requests: supportRequests,
      supportSummary: { open_count: supportRequests.filter((row) => ['open', 'açık'].includes(String(row.status || '').toLowerCase())).length, total_count: supportRequests.length },
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
