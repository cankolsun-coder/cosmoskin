function getEnv(context) {
  const env = context?.env || context || {};
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.');
  }
  return { env, url, serviceRoleKey };
}

function adminHeaders(context, extra = {}) {
  const { serviceRoleKey } = getEnv(context);
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

async function parseSupabaseResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || data?.hint || `Supabase hata kodu: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export async function getUserFromAccessToken(context, accessToken) {
  if (!accessToken) return null;
  const { url, serviceRoleKey } = getEnv(context);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await parseSupabaseResponse(response);
  return data || null;
}

export async function insertRow(context, table, payload) {
  const { url } = getEnv(context);
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }),
    body: JSON.stringify(payload)
  });
  const data = await parseSupabaseResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

export async function insertRows(context, table, rows) {
  const { url } = getEnv(context);
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify(rows)
  });
  await parseSupabaseResponse(response);
  return true;
}

export async function updateRows(context, table, filters, payload) {
  const { url } = getEnv(context);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    qs.set(key, `eq.${value}`);
  }
  const response = await fetch(`${url}/rest/v1/${table}?${qs.toString()}`, {
    method: 'PATCH',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify(payload)
  });
  await parseSupabaseResponse(response);
  return true;
}

export async function selectRows(context, table, params = {}) {
  const { url } = getEnv(context);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const response = await fetch(`${url}/rest/v1/${table}?${qs.toString()}`, {
    headers: adminHeaders(context)
  });
  return await parseSupabaseResponse(response);
}
