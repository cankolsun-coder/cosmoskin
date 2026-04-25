const BREVO_CONTACT_BASE = 'https://api.brevo.com/v3/contacts';

function getHeaders(env) {
  if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY eksik.');
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    'api-key': env.BREVO_API_KEY
  };
}

async function brevoFetch(env, path = '', init = {}) {
  const response = await fetch(`${BREVO_CONTACT_BASE}${path}`, {
    ...init,
    headers: {
      ...getHeaders(env),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!response.ok) {
    const message = data?.message || data?.code || data?.error || `Brevo hata kodu: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export function deriveCommerceSegments({ order = {}, items = [], preferences = {}, skinType = '', concerns = [] } = {}) {
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
  if (skinType) segments.add(`skin_${skinType}`);
  (concerns || []).filter(Boolean).forEach((concern) => segments.add(`concern_${String(concern).toLowerCase()}`));
  categories.forEach((category) => segments.add(`category_${category}`));
  return { segments: [...segments], categories };
}

function collectManagedListIds(env) {
  const ids = [
    env.BREVO_LIST_CUSTOMERS_ID,
    env.BREVO_LIST_ROUTINE_ID,
    env.BREVO_LIST_REORDER_ID,
    env.BREVO_LIST_HIGH_VALUE_ID,
    env.BREVO_LIST_CLEANSE_ID,
    env.BREVO_LIST_HYDRATE_ID,
    env.BREVO_LIST_CARE_ID,
    env.BREVO_LIST_TREAT_ID,
    env.BREVO_LIST_PROTECT_ID
  ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(ids)];
}

export function mapSegmentsToLists(env, { segments = [], categories = [] } = {}, preferences = {}) {
  const selected = new Set();
  if (env.BREVO_LIST_CUSTOMERS_ID) selected.add(Number(env.BREVO_LIST_CUSTOMERS_ID));
  if ((preferences.routineEmails || preferences.restockEmails || preferences.lowStockAlerts) && env.BREVO_LIST_ROUTINE_ID) {
    selected.add(Number(env.BREVO_LIST_ROUTINE_ID));
  }
  if ((preferences.restockEmails || preferences.lowStockAlerts) && env.BREVO_LIST_REORDER_ID) {
    selected.add(Number(env.BREVO_LIST_REORDER_ID));
  }
  if (segments.includes('high_value') && env.BREVO_LIST_HIGH_VALUE_ID) {
    selected.add(Number(env.BREVO_LIST_HIGH_VALUE_ID));
  }
  const categoryMap = {
    cleanse: env.BREVO_LIST_CLEANSE_ID,
    hydrate: env.BREVO_LIST_HYDRATE_ID,
    care: env.BREVO_LIST_CARE_ID,
    treat: env.BREVO_LIST_TREAT_ID,
    protect: env.BREVO_LIST_PROTECT_ID
  };
  categories.forEach((category) => {
    const id = Number(categoryMap[category]);
    if (Number.isFinite(id) && id > 0) selected.add(id);
  });
  return {
    listIds: [...selected],
    unlinkListIds: collectManagedListIds(env).filter((id) => !selected.has(id))
  };
}

function cleanAttributes(attributes = {}) {
  const out = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export async function upsertBrevoContact(env, contact = {}) {
  const email = String(contact.email || '').trim().toLowerCase();
  if (!email) throw new Error('Brevo kişi senkronizasyonu için e-posta gerekli.');
  const payload = {
    email,
    updateEnabled: true,
    attributes: cleanAttributes(contact.attributes || {}),
    emailBlacklisted: false,
    smsBlacklisted: !contact.smsOptIn,
    listIds: contact.listIds || []
  };
  await brevoFetch(env, '', { method: 'POST', body: JSON.stringify(payload) });
  if (Array.isArray(contact.unlinkListIds) && contact.unlinkListIds.length) {
    await brevoFetch(env, `/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: JSON.stringify({ unlinkListIds: contact.unlinkListIds })
    });
  }
  return { ok: true, email };
}
