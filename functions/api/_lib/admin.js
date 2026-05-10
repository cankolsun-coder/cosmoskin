import { json } from './response.js';

const adminAuthBuckets = new Map();
function rateKey(context) {
  const h = context?.request?.headers || new Headers();
  return h.get('CF-Connecting-IP') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
}
function assertAdminAttemptLimit(context) {
  const key = rateKey(context);
  const now = Date.now();
  const current = adminAuthBuckets.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (current.resetAt <= now) { adminAuthBuckets.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 }); return; }
  current.count += 1; adminAuthBuckets.set(key, current);
  if (current.count > 40) throw new AdminAuthError('Too many attempts');
}

export class AdminAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AdminAuthError';
    this.status = 401;
  }
}

export function assertAdmin(context) {
  assertAdminAttemptLimit(context);
  const expected = context?.env?.ADMIN_TOKEN || '';
  const supplied = context?.request?.headers?.get('x-admin-token') || '';
  if (!expected || supplied !== expected) throw new AdminAuthError();
  return true;
}

export async function readJsonBody(context) {
  try {
    return await context.request.json();
  } catch {
    throw Object.assign(new Error('Geçersiz JSON formatı.'), { status: 400 });
  }
}

export function adminError(error, fallback = 'İşlem tamamlanamadı.') {
  const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
  const message = status === 401 ? 'Unauthorized' : (error?.message || fallback);
  return json({ ok: false, error: message }, { status });
}
