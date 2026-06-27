import { json } from './response.js';

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const adminAuthBuckets = new Map();
const encoder = new TextEncoder();

function requestIp(context) {
  const headers = context?.request?.headers || new Headers();
  return headers.get('CF-Connecting-IP')
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown-ip';
}

function cleanupBucket(key, now = Date.now()) {
  const current = adminAuthBuckets.get(key);
  if (current && current.resetAt <= now) adminAuthBuckets.delete(key);
  return adminAuthBuckets.get(key) || null;
}

function assertNotThrottled(context) {
  const key = requestIp(context);
  const current = cleanupBucket(key);
  if (current?.count >= MAX_FAILURES) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - Date.now()) / 1000));
    throw new AdminAuthError('Çok fazla başarısız giriş denemesi.', 429, retryAfter);
  }
}

function recordFailure(context) {
  const key = requestIp(context);
  const now = Date.now();
  const current = cleanupBucket(key, now) || { count: 0, resetAt: now + FAILURE_WINDOW_MS };
  current.count += 1;
  adminAuthBuckets.set(key, current);
}

function clearFailures(context) {
  adminAuthBuckets.delete(requestIp(context));
}

function timingSafeEqual(left = '', right = '') {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }
  return mismatch === 0;
}

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function sessionSecret(context) {
  return String(context?.env?.ADMIN_SESSION_SECRET || '');
}

function assertSessionSecret(context) {
  if (!sessionSecret(context)) {
    throw new AdminAuthError('Admin session secret yapılandırılmamış.', 500);
  }
}

function sessionTtlSeconds(context) {
  const configured = Number(context?.env?.ADMIN_SESSION_TTL_SECONDS || 1800);
  return Math.min(8 * 60 * 60, Math.max(5 * 60, Number.isFinite(configured) ? configured : 1800));
}

function assertCloudflareAccess(context) {
  if (String(context?.env?.REQUIRE_CLOUDFLARE_ACCESS || '').toLowerCase() !== 'true') return;
  const headers = context.request.headers;
  const assertion = headers.get('Cf-Access-Jwt-Assertion');
  const email = headers.get('Cf-Access-Authenticated-User-Email');
  if (!assertion || !email) {
    throw new AdminAuthError('Admin erişimi doğrulanamadı.');
  }
}

async function verifySignedSession(context, token) {
  assertSessionSecret(context);
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const [, expRaw, nonce, signature] = parts;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new AdminAuthError('Admin oturumunun süresi doldu.');
  }
  const secret = sessionSecret(context);
  if (!secret || nonce.length < 16 || signature.length < 32) return false;
  const expected = await hmac(secret, `v1.${expiresAt}.${nonce}`);
  return timingSafeEqual(signature, expected);
}

export class AdminAuthError extends Error {
  constructor(message = 'Admin yetkilendirmesi başarısız.', status = 401, retryAfter = null) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function issueAdminSession(context) {
  assertCloudflareAccess(context);
  assertSessionSecret(context);
  assertNotThrottled(context);
  const expected = String(context?.env?.ADMIN_TOKEN || '');
  const supplied = String(context?.request?.headers?.get('x-admin-token') || '');
  if (!expected || !timingSafeEqual(supplied, expected)) {
    recordFailure(context);
    throw new AdminAuthError();
  }
  clearFailures(context);
  const expiresAt = Math.floor(Date.now() / 1000) + sessionTtlSeconds(context);
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const base = `v1.${expiresAt}.${nonce}`;
  const signature = await hmac(sessionSecret(context), base);
  return { token: `${base}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export async function assertAdmin(context) {
  assertCloudflareAccess(context);
  assertNotThrottled(context);
  const supplied = String(context?.request?.headers?.get('x-admin-token') || '');
  let valid = false;
  try {
    if (supplied.startsWith('v1.')) {
      valid = await verifySignedSession(context, supplied);
    } else if (String(context?.env?.ADMIN_ALLOW_LEGACY_TOKEN || 'false').toLowerCase() !== 'false') {
      valid = Boolean(context?.env?.ADMIN_TOKEN)
        && timingSafeEqual(supplied, String(context.env.ADMIN_TOKEN));
    }
  } catch (error) {
    recordFailure(context);
    throw error;
  }
  if (!valid) {
    recordFailure(context);
    throw new AdminAuthError();
  }
  clearFailures(context);
  return true;
}

export async function readJsonBody(context) {
  const contentType = context.request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('İstek gövdesi JSON formatında olmalıdır.'), { status: 415 });
  }
  try {
    return await context.request.json();
  } catch {
    throw Object.assign(new Error('Geçersiz JSON formatı.'), { status: 400 });
  }
}

export function adminError(error, fallback = 'İşlem tamamlanamadı.') {
  const status = Number(error?.status) || 500;
  const headers = { 'Cache-Control': 'no-store' };
  if (error?.retryAfter) headers['Retry-After'] = String(error.retryAfter);
  const message = status === 401
    ? 'Admin oturumu geçersiz veya süresi dolmuş.'
    : status === 429
      ? 'Çok fazla başarısız deneme yapıldı. Lütfen daha sonra tekrar deneyin.'
      : (status >= 500 && error?.name === 'AdminAuthError' ? (error?.message || fallback) : (status >= 500 ? fallback : (error?.message || fallback)));
  return json({ ok: false, error: message }, { status, headers });
}
