import { createClient } from '@supabase/supabase-js';

function getSupabase(context) {
  const env = context?.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase yapılandırması eksik.');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getUserFromAccessToken(context, accessToken) {
  if (!accessToken) return null;
  const supabase = getSupabase(context);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) return null;
  return data?.user || null;
}

function applyFilter(query, key, value) {
  const raw = String(value || '');
  if (raw.startsWith('eq.')) return query.eq(key, raw.slice(3));
  if (raw.startsWith('in.(') && raw.endsWith(')')) return query.in(key, raw.slice(4, -1).split(',').map((item) => item.replace(/^"|"$/g, '')).filter(Boolean));
  if (raw.startsWith('gt.')) return query.gt(key, raw.slice(3));
  if (raw.startsWith('lt.')) return query.lt(key, raw.slice(3));
  return query.eq(key, raw);
}

async function selectRows(context, table, params = {}) {
  const supabase = getSupabase(context);
  let query = supabase.from(table).select(params.select || '*');
  for (const [key, value] of Object.entries(params)) {
    if (['select', 'order', 'limit'].includes(key) || value === undefined || value === null || value === '') continue;
    query = applyFilter(query, key, value);
  }
  if (params.order) {
    String(params.order).split(',').forEach((part) => {
      const [column, direction] = part.trim().split('.');
      if (column) query = query.order(column, { ascending: direction !== 'desc' });
    });
  }
  if (params.limit) query = query.limit(Number(params.limit));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function insertRow(context, table, payload) {
  const supabase = getSupabase(context);
  const { data, error } = await supabase.from(table).insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

async function insertRows(context, table, rows) {
  if (!Array.isArray(rows) || !rows.length) return true;
  const supabase = getSupabase(context);
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(error.message);
  return true;
}

async function updateRows(context, table, filters, payload) {
  const supabase = getSupabase(context);
  let query = supabase.from(table).update(payload);
  for (const [key, value] of Object.entries(filters || {})) query = query.eq(key, value);
  const { error } = await query;
  if (error) throw new Error(error.message);
  return true;
}

const BREVO_CONTACT_BASE = 'https://api.brevo.com/v3/contacts';
function brevoHeaders(env) {
  if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY eksik.');
  return { 'content-type': 'application/json', accept: 'application/json', 'api-key': env.BREVO_API_KEY };
}
async function brevoFetch(env, target = '', init = {}) {
  const response = await fetch(BREVO_CONTACT_BASE + target, { ...init, headers: { ...brevoHeaders(env), ...(init.headers || {}) } });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!response.ok) throw new Error(data?.message || data?.code || data?.error || ('Brevo hata kodu: ' + response.status));
  return data;
}
function deriveCommerceSegments({ order = {}, items = [], preferences = {}, skinType = '', concerns = [] } = {}) {
  const categories = [...new Set((items || []).map((item) => String(item.product_id || item.category || '').toLowerCase()).map((value) => {
    if (value.includes('clean') || value === 'cleanse') return 'cleanse';
    if (value.includes('protect') || value.includes('sun') || value.includes('spf')) return 'protect';
    if (value.includes('treat') || value.includes('vit') || value.includes('glow')) return 'treat';
    if (value.includes('care') || value.includes('cream') || value.includes('moist')) return 'care';
    if (value.includes('hydrate') || value.includes('serum') || value.includes('essence')) return 'hydrate';
    return '';
  }).filter(Boolean))];
  const segments = new Set(['customer']);
  if ((order.total_amount || 0) >= 2500) segments.add('high_value');
  if ((items || []).length >= 3) segments.add('bundle_buyer');
  if (preferences.routineEmails) segments.add('routine_optin');
  if (preferences.restockEmails || preferences.lowStockAlerts) segments.add('reorder_optin');
  if (skinType) segments.add('skin_' + skinType);
  (concerns || []).filter(Boolean).forEach((concern) => segments.add('concern_' + String(concern).toLowerCase()));
  categories.forEach((category) => segments.add('category_' + category));
  return { segments: Array.from(segments), categories };
}
function managedListIds(env) {
  return [env.BREVO_LIST_CUSTOMERS_ID, env.BREVO_LIST_ROUTINE_ID, env.BREVO_LIST_REORDER_ID, env.BREVO_LIST_HIGH_VALUE_ID, env.BREVO_LIST_CLEANSE_ID, env.BREVO_LIST_HYDRATE_ID, env.BREVO_LIST_CARE_ID, env.BREVO_LIST_TREAT_ID, env.BREVO_LIST_PROTECT_ID].map(Number).filter((value) => Number.isFinite(value) && value > 0);
}
function mapSegmentsToLists(env, { segments = [], categories = [] } = {}, preferences = {}) {
  const selected = new Set();
  if (env.BREVO_LIST_CUSTOMERS_ID) selected.add(Number(env.BREVO_LIST_CUSTOMERS_ID));
  if ((preferences.routineEmails || preferences.restockEmails || preferences.lowStockAlerts) && env.BREVO_LIST_ROUTINE_ID) selected.add(Number(env.BREVO_LIST_ROUTINE_ID));
  if ((preferences.restockEmails || preferences.lowStockAlerts) && env.BREVO_LIST_REORDER_ID) selected.add(Number(env.BREVO_LIST_REORDER_ID));
  if (segments.includes('high_value') && env.BREVO_LIST_HIGH_VALUE_ID) selected.add(Number(env.BREVO_LIST_HIGH_VALUE_ID));
  const categoryMap = { cleanse: env.BREVO_LIST_CLEANSE_ID, hydrate: env.BREVO_LIST_HYDRATE_ID, care: env.BREVO_LIST_CARE_ID, treat: env.BREVO_LIST_TREAT_ID, protect: env.BREVO_LIST_PROTECT_ID };
  categories.forEach((category) => { const id = Number(categoryMap[category]); if (Number.isFinite(id) && id > 0) selected.add(id); });
  return { listIds: Array.from(selected), unlinkListIds: managedListIds(env).filter((id) => !selected.has(id)) };
}
function cleanAttributes(attributes = {}) {
  const out = {};
  for (const [key, value] of Object.entries(attributes)) if (value !== undefined && value !== null && value !== '') out[key] = value;
  return out;
}
async function upsertBrevoContact(env, contact = {}) {
  const email = String(contact.email || '').trim().toLowerCase();
  if (!email) throw new Error('Brevo kişi senkronizasyonu için e-posta gerekli.');
  await brevoFetch(env, '', { method: 'POST', body: JSON.stringify({ email, updateEnabled: true, attributes: cleanAttributes(contact.attributes || {}), emailBlacklisted: false, smsBlacklisted: !contact.smsOptIn, listIds: contact.listIds || [] }) });
  if (Array.isArray(contact.unlinkListIds) && contact.unlinkListIds.length) await brevoFetch(env, '/' + encodeURIComponent(email), { method: 'PUT', body: JSON.stringify({ unlinkListIds: contact.unlinkListIds }) });
  return { ok: true, email };
}


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
