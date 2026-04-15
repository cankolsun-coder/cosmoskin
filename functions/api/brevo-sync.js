import { getUserFromAccessToken, selectRows } from '../../api/_lib/supabase.js';
import { deriveCommerceSegments, mapSegmentsToLists, upsertBrevoContact } from '../../api/_lib/brevo.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' }
  });
}

function normalizePreferences(meta = {}) {
  return {
    routineEmails: meta.routine_reminders?.routineEmails !== false,
    restockEmails: !!meta.routine_reminders?.restockEmails,
    lowStockAlerts: !!meta.routine_reminders?.lowStockAlerts,
    sms: !!meta.comm_prefs?.sms
  };
}

function getSkinMeta(meta = {}) {
  return {
    skinType: String(meta.skin_type || '').trim(),
    concerns: Array.isArray(meta.skin_concerns) ? meta.skin_concerns.map((x) => String(x || '').trim()).filter(Boolean) : []
  };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const authHeader = context.request.headers.get('authorization') || '';
    const accessToken = String(body.accessToken || authHeader.replace(/^Bearer\s+/i, '') || '').trim();
    if (!accessToken) return json({ ok: false, error: 'Oturum gerekli.' }, 401);

    const user = await getUserFromAccessToken(context, accessToken);
    if (!user?.id || !user?.email) return json({ ok: false, error: 'Geçersiz oturum.' }, 401);

    const orders = await selectRows(context, 'orders', {
      select: 'id,order_number,total_amount,created_at,status',
      user_id: `eq.${user.id}`,
      status: 'eq.paid',
      order: 'created_at.desc'
    });
    const latestOrder = Array.isArray(orders) && orders.length ? orders[0] : null;
    if (!latestOrder) {
      return json({ ok: false, error: 'Senkronizasyon için ödenmiş sipariş bulunamadı.' }, 400);
    }

    const items = await selectRows(context, 'order_items', {
      select: 'product_id,product_name,brand,quantity,line_total',
      order_id: `eq.${latestOrder.id}`
    });

    const preferences = normalizePreferences(user.user_metadata || {});
    const { skinType, concerns } = getSkinMeta(user.user_metadata || {});
    const { segments, categories } = deriveCommerceSegments({ order: latestOrder, items, preferences, skinType, concerns });
    const { listIds, unlinkListIds } = mapSegmentsToLists(context.env, { segments, categories }, preferences);

    await upsertBrevoContact(context.env, {
      email: user.email,
      smsOptIn: preferences.sms,
      listIds,
      unlinkListIds,
      attributes: {
        FIRSTNAME: user.user_metadata?.first_name || user.user_metadata?.name || '',
        LASTNAME: user.user_metadata?.last_name || '',
        CS_LAST_ORDER_NUMBER: latestOrder.order_number || '',
        CS_LAST_ORDER_DATE: latestOrder.created_at ? new Date(latestOrder.created_at).toISOString().slice(0, 10) : '',
        CS_LAST_ORDER_TOTAL: Number(latestOrder.total_amount || 0),
        CS_TOTAL_ORDERS: Array.isArray(orders) ? orders.length : 1,
        CS_SKIN_TYPE: skinType || '',
        CS_SKIN_CONCERNS: concerns.join(', '),
        CS_SEGMENTS: segments.join(', '),
        CS_CATEGORIES: categories.join(', '),
        CS_ROUTINE_OPTIN: preferences.routineEmails ? 'yes' : 'no',
        CS_REORDER_OPTIN: (preferences.restockEmails || preferences.lowStockAlerts) ? 'yes' : 'no'
      }
    });

    return json({ ok: true, segments, categories, listIds });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Brevo senkronizasyonu başarısız.' }, 500);
  }
}
