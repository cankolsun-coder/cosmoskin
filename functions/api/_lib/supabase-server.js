import { ApiError } from './api-response.js';

function getEnv(context) {
  const env = context?.env || {};
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_PUBLIC_KEY || serviceRoleKey;
  if (!url || !serviceRoleKey) {
    throw new ApiError('SERVICE_NOT_CONFIGURED', 'Supabase sunucu yapılandırması eksik.', 503);
  }
  return { url, serviceRoleKey, anonKey };
}

function authTokenFromRequest(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new ApiError('UNAUTHORIZED', 'Oturum gerekli.', 401);
  return token;
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
    throw new ApiError('SUPABASE_ERROR', message, response.status >= 500 ? 502 : response.status, data);
  }
  return data;
}

function encodeParams(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  return qs.toString();
}

function createRestClient({ url, apikey, authorization }) {
  const baseHeaders = {
    apikey,
    Authorization: `Bearer ${authorization}`
  };

  async function request(path, options = {}) {
    const headers = new Headers(baseHeaders);
    for (const [key, value] of Object.entries(options.headers || {})) headers.set(key, value);
    const response = await fetch(`${url}${path}`, { ...options, headers });
    return parseSupabaseResponse(response);
  }

  return {
    async select(table, params = {}) {
      const qs = encodeParams(params);
      return request(`/rest/v1/${table}${qs ? `?${qs}` : ''}`);
    },
    async maybeSingle(table, params = {}) {
      const rows = await this.select(table, { ...params, limit: params.limit || 1 });
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },
    async count(table, params = {}) {
      const qs = encodeParams({ ...params, select: params.select || 'id' });
      const headers = new Headers(baseHeaders);
      headers.set('Prefer', 'count=exact');
      const response = await fetch(`${url}/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
        method: 'HEAD',
        headers
      });
      if (!response.ok) await parseSupabaseResponse(response);
      const range = response.headers.get('content-range') || '';
      const match = range.match(/\/(\d+)$/);
      return match ? Number(match[1]) : 0;
    },
    async insert(table, payload, { returning = true } = {}) {
      const qs = returning ? '?select=*' : '';
      const data = await request(`/rest/v1/${table}${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: returning ? 'return=representation' : 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      return Array.isArray(data) ? data[0] || null : data;
    },
    async insertMany(table, rows, { returning = false } = {}) {
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const qs = returning ? '?select=*' : '';
      const data = await request(`/rest/v1/${table}${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: returning ? 'return=representation' : 'return=minimal'
        },
        body: JSON.stringify(rows)
      });
      return Array.isArray(data) ? data : [];
    },
    async insertIgnore(table, payload, conflictColumns, { returning = true } = {}) {
      const qs = encodeParams({
        on_conflict: Array.isArray(conflictColumns) ? conflictColumns.join(',') : conflictColumns,
        select: returning ? '*' : undefined
      });
      const data = await request(`/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: `resolution=ignore-duplicates,${returning ? 'return=representation' : 'return=minimal'}`
        },
        body: JSON.stringify(payload)
      });
      return Array.isArray(data) ? data[0] || null : data;
    },
    async upsert(table, payload, conflictColumns, { returning = true } = {}) {
      const qs = encodeParams({
        on_conflict: Array.isArray(conflictColumns) ? conflictColumns.join(',') : conflictColumns,
        select: returning ? '*' : undefined
      });
      const data = await request(`/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: `resolution=merge-duplicates,${returning ? 'return=representation' : 'return=minimal'}`
        },
        body: JSON.stringify(payload)
      });
      return Array.isArray(data) ? data[0] || null : data;
    },
    async update(table, filters = {}, payload, { returning = true } = {}) {
      const qs = encodeParams({ ...filters, select: returning ? '*' : undefined });
      const data = await request(`/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: returning ? 'return=representation' : 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      return Array.isArray(data) ? data : [];
    },
    async delete(table, filters = {}, { returning = false } = {}) {
      const qs = encodeParams({ ...filters, select: returning ? '*' : undefined });
      const data = await request(`/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
        method: 'DELETE',
        headers: { Prefer: returning ? 'return=representation' : 'return=minimal' }
      });
      return Array.isArray(data) ? data : [];
    },
    async rpc(name, payload = {}) {
      return request(`/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };
}

export async function requireAccount(context) {
  const env = getEnv(context);
  const accessToken = authTokenFromRequest(context.request);
  const userResponse = await fetch(`${env.url}/auth/v1/user`, {
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const user = await parseSupabaseResponse(userResponse);
  if (!user?.id) throw new ApiError('UNAUTHORIZED', 'Geçersiz oturum.', 401);

  return {
    env,
    accessToken,
    user,
    userDb: createRestClient({ url: env.url, apikey: env.anonKey, authorization: accessToken }),
    adminDb: createRestClient({ url: env.url, apikey: env.serviceRoleKey, authorization: env.serviceRoleKey })
  };
}

export function inFilter(values = []) {
  const list = Array.from(new Set(values.filter(Boolean).map(String)));
  if (!list.length) return 'in.()';
  return `in.(${list.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(',')})`;
}

export function eq(value) {
  return `eq.${value}`;
}
