import { json } from './response.js';

export class AdminAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AdminAuthError';
    this.status = 401;
  }
}

export function assertAdmin(context) {
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
