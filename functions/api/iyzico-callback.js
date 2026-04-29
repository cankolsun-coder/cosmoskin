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

function getBaseUrl(env) { return String(env.IYZICO_BASE_URL || 'https://api.iyzipay.com').replace(/\/$/, ''); }
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function iyzicoHeaders(path, env, bodyString = '') {
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) throw new Error('IYZICO_API_KEY veya IYZICO_SECRET_KEY eksik.');
  const randomKey = String(Date.now()) + String(Math.floor(Math.random() * 1000000));
  const signature = await sha256Hex(randomKey + path + bodyString + env.IYZICO_SECRET_KEY);
  const authorization = btoa('apiKey:' + env.IYZICO_API_KEY + '&randomKey:' + randomKey + '&signature:' + signature);
  return { Authorization: 'IYZWSv2 ' + authorization, 'x-iyzi-rnd': randomKey, 'Content-Type': 'application/json' };
}
async function iyzicoRequest(path, env, payload) {
  const bodyString = payload ? JSON.stringify(payload) : '';
  const response = await fetch(getBaseUrl(env) + path, { method: 'POST', headers: await iyzicoHeaders(path, env, bodyString), body: bodyString });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data.errorMessage || data.errorCode || ('iyzico hata kodu: ' + response.status));
  return data;
}

function redirect(url, status = 302) { return new Response(null, { status, headers: { Location: url } }); }



async function syncBrevoAfterPayment(context, conversationId) {
  if (!context?.env?.BREVO_API_KEY || !conversationId) return;
  try {
    const orders = await selectRows(context, 'orders', {
      select: 'id,order_number,total_amount,created_at,customer_email,customer_first_name,customer_last_name,user_id',
      id: `eq.${conversationId}`
    });
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order?.customer_email) return;
    const items = await selectRows(context, 'order_items', {
      select: 'product_id,product_name,brand,quantity,line_total',
      order_id: `eq.${conversationId}`
    });
    const segmentsData = deriveCommerceSegments({ order, items, preferences: {} });
    const mapped = mapSegmentsToLists(context.env, segmentsData, {});
    await upsertBrevoContact(context.env, {
      email: order.customer_email,
      listIds: mapped.listIds,
      unlinkListIds: mapped.unlinkListIds,
      attributes: {
        FIRSTNAME: order.customer_first_name || '',
        LASTNAME: order.customer_last_name || '',
        CS_LAST_ORDER_NUMBER: order.order_number || '',
        CS_LAST_ORDER_DATE: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : '',
        CS_LAST_ORDER_TOTAL: Number(order.total_amount || 0),
        CS_SEGMENTS: (segmentsData.segments || []).join(', '),
        CS_CATEGORIES: (segmentsData.categories || []).join(', '),
        CS_ROUTINE_SOURCE: 'checkout_success'
      }
    });
  } catch (error) {
    console.error('Brevo checkout sync failed:', error);
  }
}

function parseFormEncoded(body) {
  const params = new URLSearchParams(body || '');
  return Object.fromEntries(params.entries());
}

export async function onRequestPost(context) {
  try {
    if (!context.env.IYZICO_API_KEY || !context.env.IYZICO_SECRET_KEY) {
      return redirect('/payment/failure.html');
    }
    const contentType = context.request.headers.get('content-type') || '';
    const rawBody = await context.request.text();
    const data = contentType.includes('application/json') ? JSON.parse(rawBody || '{}') : parseFormEncoded(rawBody);
    const token = data.token;
    if (!token) return redirect('/payment/failure.html');

    const retrieve = await iyzicoRequest('/payment/iyzipos/checkoutform/auth/ecom/detail', context.env, {
      locale: 'tr',
      token
    });

    const conversationId = retrieve.conversationId || data.conversationId;
    const statusText = String(retrieve.paymentStatus || retrieve.status || '').toUpperCase();
    const success = statusText === 'SUCCESS';

    await updateRows(context, 'payments', { provider_token: token }, {
      status: success ? 'paid' : 'failed',
      provider_payment_id: retrieve.paymentId || null,
      raw_callback_response: retrieve
    });

    if (conversationId) {
      await updateRows(context, 'orders', { id: conversationId }, {
        status: success ? 'paid' : 'payment_failed',
        paid_at: success ? new Date().toISOString() : null
      });
      if (success) await syncBrevoAfterPayment(context, conversationId);
    }

    return redirect(`${success ? '/payment/success.html' : '/payment/failure.html'}?order=${encodeURIComponent(conversationId || '')}`);
  } catch {
    return redirect('/payment/failure.html');
  }
}

export function onRequestGet() {
  return redirect('/payment/failure.html');
}
