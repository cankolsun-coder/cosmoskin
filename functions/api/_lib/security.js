
import { json } from './response.js';

const buckets = new Map();

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

export function cleanText(value = '', max = 500) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeSlug(value = '') {
  return String(value || '').trim().replace(/^.*\/products\//, '').replace(/\.html.*$/, '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

export function publicError(error, fallback = 'İşlem şu anda tamamlanamadı.') {
  const status = Number(error?.status || 500);
  return json({ ok: false, error: status >= 500 ? fallback : (error?.message || fallback) }, { status });
}

export function clientKey(context, scope = 'general') {
  const headers = context?.request?.headers || new Headers();
  const ip = headers.get('CF-Connecting-IP') || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
  return `${scope}:${ip}`;
}

export function assertRateLimit(context, scope = 'general', limit = 20, windowMs = 10 * 60 * 1000) {
  const key = clientKey(context, scope);
  const now = Date.now();
  const current = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  buckets.set(key, current);
  if (current.count > limit) {
    throw Object.assign(new Error('Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.'), { status: 429 });
  }
  return true;
}

export function safeMetadata(value = {}, maxKeys = 20) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.entries(value).slice(0, maxKeys).forEach(([key, val]) => {
    const k = cleanText(key, 80);
    if (!k) return;
    if (val === null || typeof val === 'number' || typeof val === 'boolean') out[k] = val;
    else if (typeof val === 'string') out[k] = cleanText(val, 500);
  });
  return out;
}
