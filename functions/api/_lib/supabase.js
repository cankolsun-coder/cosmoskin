import { fetchWithTimeout } from './http.js';

function getEnv(context) {
  const env = context?.env || context || {};
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.');
  }
  return { env, url, serviceRoleKey };
}

function timeoutMs(context) {
  const value = Number((context?.env || context || {}).SUPABASE_TIMEOUT_MS || 12000);
  return Number.isFinite(value) ? Math.max(3000, Math.min(30000, value)) : 12000;
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
  const response = await fetchWithTimeout(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`
    }
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  const data = await parseSupabaseResponse(response);
  return data || null;
}

export async function insertRow(context, table, payload) {
  const { url } = getEnv(context);
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}?select=*`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }),
    body: JSON.stringify(payload)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  const data = await parseSupabaseResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

export async function insertRows(context, table, rows) {
  const { url } = getEnv(context);
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify(rows)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  await parseSupabaseResponse(response);
  return true;
}

export async function updateRows(context, table, filters, payload) {
  const { url } = getEnv(context);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    qs.set(key, `eq.${value}`);
  }
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}?${qs.toString()}`, {
    method: 'PATCH',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify(payload)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  await parseSupabaseResponse(response);
  return true;
}

export async function selectRows(context, table, params = {}) {
  const { url } = getEnv(context);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}?${qs.toString()}`, {
    headers: adminHeaders(context)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  return await parseSupabaseResponse(response);
}


export async function deleteRows(context, table, filters) {
  const { url } = getEnv(context);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, `eq.${value}`);
  }
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}?${qs.toString()}`, {
    method: 'DELETE',
    headers: adminHeaders(context, { Prefer: 'return=minimal' })
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  await parseSupabaseResponse(response);
  return true;
}


export async function rpc(context, functionName, payload = {}) {
  const { url } = getEnv(context);
  const response = await fetchWithTimeout(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(payload)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  return await parseSupabaseResponse(response);
}

export async function deleteStorageObject(context, bucket, objectPath) {
  if (!bucket || !objectPath) return false;
  const { url } = getEnv(context);
  const response = await fetchWithTimeout(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${String(objectPath).split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: adminHeaders(context)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  await parseSupabaseResponse(response);
  return true;
}


export async function upsertRow(context, table, payload, onConflict = 'id') {
  const { url } = getEnv(context);
  const qs = new URLSearchParams({ on_conflict: onConflict, select: '*' });
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}?${qs.toString()}`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    }),
    body: JSON.stringify(payload)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  const data = await parseSupabaseResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

export async function upsertRows(context, table, rows, onConflict = 'id') {
  const { url } = getEnv(context);
  const qs = new URLSearchParams({ on_conflict: onConflict });
  const response = await fetchWithTimeout(`${url}/rest/v1/${table}?${qs.toString()}`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify(rows)
  }, timeoutMs(context), 'Veritabanı servisi zaman aşımına uğradı.');
  await parseSupabaseResponse(response);
  return true;
}


export async function createSignedStorageUrl(context, bucket, objectPath, expiresIn = 3600) {
  if (!bucket || !objectPath) return null;
  const { url } = getEnv(context);
  const encodedPath = String(objectPath).split('/').map(encodeURIComponent).join('/');
  const response = await fetchWithTimeout(`${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: 'POST',
    headers: adminHeaders(context, {
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({ expiresIn })
  }, timeoutMs(context), 'Dosya bağlantısı hazırlanırken zaman aşımı oluştu.');
  const data = await parseSupabaseResponse(response);
  const signed = data?.signedURL || data?.signedUrl || data?.signed_url || data?.url || null;
  if (!signed) return null;
  if (/^https?:\/\//i.test(signed)) return signed;
  // H2B fix: Supabase's POST /storage/v1/object/sign/... response returns
  // signedURL as a path relative to the storage service root, e.g.
  // "/object/sign/{bucket}/{path}?token=...", NOT relative to the project
  // root. Naively doing `${url}${signed}` drops the required "/storage/v1"
  // segment, producing a URL that hits the wrong route and fails with
  // "No API key found in request" instead of serving the file. See
  // https://github.com/supabase/storage (getSignedURL route) and
  // supabase-js's own storageFileApi, both of which always resolve against
  // `${storageUrl}` = `${projectUrl}/storage/v1`, never the bare project URL.
  const relativePath = signed.startsWith('/') ? signed : `/${signed}`;
  const withStoragePrefix = relativePath.startsWith('/storage/v1/') ? relativePath : `/storage/v1${relativePath}`;
  return `${url}${withStoragePrefix}`;
}
