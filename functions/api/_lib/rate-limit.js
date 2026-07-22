// Lightweight per-isolate in-memory rate limiter for public, unauthenticated
// POST endpoints. Cloudflare Pages Functions isolates are not shared across
// edge locations and aren't guaranteed to persist between invocations, so
// this slows down casual abuse (scripted signup floods, coupon-code
// enumeration) from a single edge location rather than providing a durable,
// globally-consistent limit. Extracted from the pattern already used in
// newsletter/subscribe.js so all rate-limited endpoints share one
// implementation instead of drifting copies.

const buckets = new Map();

export function getClientIp(context) {
  const headers = context.request.headers;
  return headers.get('CF-Connecting-IP') || headers.get('x-forwarded-for') || 'unknown-ip';
}

export function isRateLimited(key, { windowMs = 10 * 60 * 1000, max = 6 } = {}) {
  const now = Date.now();
  const existing = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  existing.count += 1;
  buckets.set(key, existing);
  return existing.count > max;
}
