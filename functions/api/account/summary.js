import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { requireUser, buildInFilter, groupByOrderId, resolveOrderItem } from '../_lib/account.js';
import { isBirthdayCouponEligible } from '../_lib/coupons.js';
import { getLoyaltyBalance } from '../_lib/loyalty-ledger.js';
import { computeTierFromSpend, tierLabel } from '../_lib/loyalty-config.js';
import { signReturnAttachments } from '../_lib/return-attachments.js';

function safeMeta(meta = {}) {
  return meta && typeof meta === 'object' ? meta : {};
}

function isSuccessfulOrder(order = {}) {
  const status = String(order.status || '').toLowerCase();
  const payment = String(order.payment_status || '').toLowerCase();
  return ['paid', 'confirmed', 'processing', 'preparing', 'shipped', 'delivered', 'completed'].includes(status) || ['paid', 'confirmed', 'captured'].includes(payment) || Boolean(order.paid_at);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function orderProductNetAmount(order = {}) {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const itemsTotal = items.reduce((sum, item) => {
    const line = finiteNumber(item.line_total, NaN);
    if (Number.isFinite(line) && line > 0) return sum + line;
    return sum + (finiteNumber(item.unit_price || item.price, 0) * Math.max(1, finiteNumber(item.quantity, 1)));
  }, 0);
  if (itemsTotal > 0) return itemsTotal;
  // Fallback to subtotal_amount ONLY — never total_amount, which includes
  // shipping. Matches public.cosmoskin_order_points_basis() in
  // supabase/migrations/20260704_batch4_loyalty_ledger.sql exactly, so the
  // account API and the SQL ledger never disagree about product-net spend.
  const subtotal = finiteNumber(order.subtotal_amount, NaN);
  return Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
}

function computeTier(orders = []) {
  const paidOrders = orders.filter(isSuccessfulOrder);
  const paidTotal = paidOrders.reduce((sum, order) => sum + orderProductNetAmount(order), 0);
  const tier = computeTierFromSpend(paidTotal, paidOrders.length);
  return {
    key: tier.code,
    label: tier.label,
    progress: tier.progress,
    next: tier.nextLabel,
    spend: Math.round(paidTotal * 100) / 100
  };
}

function groupBy(rows = [], key) {
  return (rows || []).reduce((map, row) => {
    const list = map.get(row[key]) || [];
    list.push(row);
    map.set(row[key], list);
    return map;
  }, new Map());
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
        select: 'id,order_number,status,payment_status,fulfillment_status,payment_method,currency,subtotal_amount,vat_amount,shipping_amount,discount_amount,total_amount,customer_email,customer_first_name,customer_last_name,customer_phone,invoice_type,billing_first_name,billing_last_name,billing_email,billing_phone,company_title,tax_office,tax_number,corporate_email,is_e_invoice_taxpayer,city,district,postal_code,address_line,billing_address_line,billing_city,billing_district,billing_postal_code,cargo_note,legal_consents,cancel_reason,cancel_requested_at,cancelled_by,cancel_request_reason,cancellation_status,created_at,updated_at,paid_at,fulfilled_at,delivered_at,cancelled_at',
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
        order: 'is_active.desc,updated_at.desc,created_at.desc',
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
    let returnItems = [];
    let returnAttachments = [];
    let returnEvents = [];
    if (ids.length) {
      const inFilter = buildInFilter(ids);
      [orderItems, shipments, events, invoices, returns] = await Promise.all([
        selectRows(context, 'order_items', {
          select: 'id,order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total,cancelled_at',
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
          select: 'id,order_id,return_number,reason,status,refund_status,customer_note,admin_note,requested_items,requested_attachments,attachment_count,created_at,updated_at,requested_at,return_window_ends_at',
          order_id: inFilter,
          order: 'created_at.desc'
        }).catch(() => [])
      ]);
    }

    const groupedItems = groupByOrderId(orderItems);
    const groupedShipments = groupByOrderId(shipments);
    const groupedEvents = groupByOrderId(events);
    const groupedInvoices = groupByOrderId(invoices);
    const returnIds = (returns || []).map((row) => row.id).filter(Boolean);
    if (returnIds.length) {
      const returnInFilter = buildInFilter(returnIds);
      [returnItems, returnAttachments, returnEvents] = await Promise.all([
        selectRows(context, 'return_request_items', {
          select: '*',
          return_request_id: returnInFilter,
          order: 'created_at.asc'
        }).catch(() => []),
        selectRows(context, 'return_request_attachments', {
          select: '*',
          return_request_id: returnInFilter,
          order: 'created_at.asc'
        }).catch(() => []),
        selectRows(context, 'return_status_events', {
          select: '*',
          return_request_id: returnInFilter,
          order: 'created_at.asc'
        }).catch(() => [])
      ]);
    }
    const groupedReturnItems = groupBy(returnItems, 'return_request_id');
    const groupedReturnAttachments = groupBy(returnAttachments, 'return_request_id');
    const groupedReturnEvents = groupBy(returnEvents, 'return_request_id');
    // H2: every row passed to signReturnAttachments() below comes from
    // `returnAttachments`, which was fetched with
    // `return_request_id: returnInFilter` where returnInFilter is built only
    // from `returnIds` — the ids of `returns`, which were themselves fetched
    // with `order_id: inFilter` scoped to this authenticated user's own
    // orders (see `ordersRaw`/`requireUser` above). Ownership is therefore
    // already guaranteed by this query chain before signing ever happens; no
    // client-supplied attachment id/path is accepted anywhere in this file.
    returns = await Promise.all((returns || []).map(async (row) => {
      const rawAttachments = groupedReturnAttachments.get(row.id) || (Array.isArray(row.requested_attachments) ? row.requested_attachments : []);
      return {
        ...row,
        items: groupedReturnItems.get(row.id) || (Array.isArray(row.requested_items) ? row.requested_items : []),
        attachments: await signReturnAttachments(context, rawAttachments),
        status_events: groupedReturnEvents.get(row.id) || []
      };
    }));
    const groupedReturns = groupByOrderId(returns);
    const orders = (ordersRaw || []).map((order) => normalizeOrder({
      ...order,
      order_items: groupedItems.get(order.id) || [],
      shipments: groupedShipments.get(order.id) || [],
      status_events: groupedEvents.get(order.id) || [],
      invoices: groupedInvoices.get(order.id) || [],
      return_requests: groupedReturns.get(order.id) || []
    }));

    const paidOrders = orders.filter(isSuccessfulOrder);
    const totalSpent = paidOrders.reduce((sum, order) => sum + orderProductNetAmount(order), 0);
    const activeOrders = orders.filter((order) => ['paid', 'confirmed', 'processing', 'preparing', 'packed', 'shipped'].includes(String(order.status || '').toLowerCase())).length;
    const profile = Array.isArray(profiles) ? profiles[0] || null : null;
    const membership = Array.isArray(membershipRows) ? membershipRows[0] || null : null;
    const pointLedger = Array.isArray(pointsRows) ? pointsRows : [];
    // Balances MUST come from the ledger via the shared RPC (status-aware,
    // not limited by the `limit: 20` display select above) — never guessed
    // from spend/totals. No points are ever fabricated for display.
    const ledgerBalance = await getLoyaltyBalance(context, user.id);
    const availablePoints = ledgerBalance.available_points;
    const pendingPoints = ledgerBalance.pending_points;
    const reversedPoints = ledgerBalance.reversed_points;
    const pointsBalance = Math.max(0, availablePoints);
    const hasLedgerHistory = pointLedger.length > 0;
    const paidOrdersWithoutLedgerHistory = paidOrders.length > 0 && !hasLedgerHistory;
    const membershipTier = membership
      ? computeTierFromSpend(membership.loyalty_spend_ex_shipping ?? membership.rolling_spend_12m, membership.completed_orders_12m)
      : null;
    const notifications = Array.isArray(dbNotifications) ? dbNotifications : [];
    const notificationPreferences = Array.isArray(preferenceRows) ? preferenceRows[0] || null : null;
    const supportRequests = Array.isArray(supportRows) ? supportRows : [];
    const profileBirthday = profile?.birthday ? String(profile.birthday).slice(0, 10) : '';
    const birthdayUsedThisYear = (couponRows || []).some((row) => {
      const code = String(row.code || row.coupon_code || '').toUpperCase();
      if (code !== 'BIRTHDAY10') return false;
      const status = String(row.status || '').toLowerCase();
      if (!['used', 'redeemed', 'consumed'].includes(status)) return false;
      const usedAt = row.used_at || row.redeemed_at || row.updated_at || row.created_at;
      return usedAt ? new Date(usedAt).getFullYear() === new Date().getFullYear() : false;
    });
    const birthday10Eligible = Boolean(profileBirthday)
      && isBirthdayCouponEligible(profileBirthday, new Date(), 0)
      && !birthdayUsedThisYear;

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
        birthday_change_count: Number(profile?.birthday_change_count || 0),
        birthday_last_changed_at: profile?.birthday_last_changed_at || null,
        birth_date_locked: Boolean(profile?.birth_date_locked),
        account_status: 'active',
        skin_type: skinProfiles?.[0]?.skin_type || meta.skin_type || '',
        skin_sensitivity: skinProfiles?.[0]?.skin_sensitivity || skinProfiles?.[0]?.sensitivity || meta.skin_sensitivity || '',
        skin_concerns: Array.isArray(skinProfiles?.[0]?.skin_concerns) ? skinProfiles[0].skin_concerns : (Array.isArray(skinProfiles?.[0]?.concerns) ? skinProfiles[0].concerns : (Array.isArray(meta.skin_concerns) ? meta.skin_concerns : [])),
        primary_goal: skinProfiles?.[0]?.primary_goal || skinProfiles?.[0]?.routine_goal || meta.primary_goal || meta.routine_goal || '',
        secondary_goals: Array.isArray(skinProfiles?.[0]?.secondary_goals) ? skinProfiles[0].secondary_goals : [],
        routine_goal: skinProfiles?.[0]?.routine_goal || skinProfiles?.[0]?.primary_goal || meta.routine_goal || '',
        routine_style: skinProfiles?.[0]?.routine_style || meta.routine_style || meta.routine_intensity || '',
        budget_band: skinProfiles?.[0]?.budget_band || meta.budget_band || '',
        avoid_ingredients: Array.isArray(skinProfiles?.[0]?.avoid_ingredients) ? skinProfiles[0].avoid_ingredients : [],
        preferred_texture: skinProfiles?.[0]?.preferred_texture || meta.preferred_texture || '',
        spf_habit: skinProfiles?.[0]?.spf_habit || meta.spf_habit || '',
        skin_profile_updated_at: skinProfiles?.[0]?.updated_at || meta.skin_profile_updated_at || meta.skinProfileUpdatedAt || meta.updatedAt || '',
        communication: {
          order_updates: notificationPreferences?.order_updates !== false,
          cargo_updates: notificationPreferences?.cargo_updates !== false,
          campaign_emails: Boolean(notificationPreferences?.campaign_emails),
          marketing_email_opt_in: Boolean(notificationPreferences?.campaign_emails ?? profile?.marketing_email_opt_in),
          newsletter: Boolean(notificationPreferences?.newsletter),
          newsletter_opt_in: Boolean(notificationPreferences?.newsletter ?? profile?.newsletter_opt_in),
          stock_notifications: Boolean(notificationPreferences?.stock_notifications),
          stock_alert_opt_in: Boolean(notificationPreferences?.stock_notifications ?? profile?.stock_alert_opt_in),
          routine_reminders: Boolean(notificationPreferences?.routine_reminders),
          routine_reminder_opt_in: Boolean(notificationPreferences?.routine_reminders ?? profile?.routine_reminder_opt_in),
          sms_notifications: Boolean(notificationPreferences?.sms_notifications)
        },
        routine_reminders: meta.routine_reminders || {}
      },
      stats: {
        order_count: orders.length,
        paid_order_count: paidOrders.length,
        active_order_count: activeOrders,
        total_spent: Math.round(totalSpent * 100) / 100,
        product_spend_total: Math.round(totalSpent * 100) / 100,
        favorites_count: favorites.length,
        addresses_count: addresses.length,
        unread_notifications: notifications.filter((n) => !n.is_read).length,
        tier: membership ? {
          key: membership.level_code || membershipTier.code,
          label: tierLabel(membership.level_code || membershipTier.code),
          progress: membershipTier.progress,
          next: membership.next_level_code || membershipTier.nextCode || null,
          points_balance: pointsBalance
        } : computeTier(orders),
        points_balance: pointsBalance,
        available_coupons_count: Array.isArray(couponRows) ? couponRows.filter((coupon) => coupon.status === 'available').length : 0
      },
      membership: membership ? { ...membership, loyalty_spend_ex_shipping: Math.round(totalSpent * 100) / 100 } : null,
      points: {
        balance: pointsBalance,
        available: Math.max(0, Math.round(availablePoints)),
        pending: Math.max(0, Math.round(pendingPoints)),
        reversed: Math.max(0, Math.round(reversedPoints)),
        ledger: pointLedger,
        has_ledger_history: hasLedgerHistory,
        maintenance_note_required: paidOrdersWithoutLedgerHistory
      },
      coupons: couponRows || [],
      skin_profile: skinProfiles?.[0] || null,
      routine_results: routineResults || [],
      legal_consents: consentRows || [],
      notification_preferences: notificationPreferences ? {
        order_updates: notificationPreferences.order_updates !== false,
        cargo_updates: notificationPreferences.cargo_updates !== false,
        campaign_emails: Boolean(notificationPreferences.campaign_emails),
        sms_notifications: Boolean(notificationPreferences.sms_notifications),
        stock_notifications: Boolean(notificationPreferences.stock_notifications),
        routine_reminders: Boolean(notificationPreferences.routine_reminders),
        newsletter: Boolean(notificationPreferences.newsletter)
      } : null,
      coupon_eligibility: {
        welcome10_eligible: paidOrders.length === 0,
        birthday10_eligible: birthday10Eligible
      },
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
