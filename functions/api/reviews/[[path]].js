// ============================================================
// COSMOSKIN — Reviews API (Cloudflare Pages Functions + D1)
// File: /functions/api/reviews/[[path]].js
// ============================================================
//
// Routes:
//   GET    /api/reviews?product=<slug>            → approved reviews for product
//   POST   /api/reviews                            → submit new review (status: pending)
//   GET    /api/reviews/admin                      → all reviews (admin only)
//   GET    /api/reviews/admin?status=pending       → filter by status
//   POST   /api/reviews/admin/:id/approve          → mark as approved
//   POST   /api/reviews/admin/:id/reject           → mark as rejected
//   DELETE /api/reviews/admin/:id                  → permanently delete
//
// Required Cloudflare bindings:
//   env.DB              → D1 database
//   env.ADMIN_TOKEN     → secret token for admin auth
// ============================================================

const ALLOWED_ORIGINS = [
  'https://www.cosmoskin.com.tr',
  'https://cosmoskin.com.tr',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8788',
];

const VALID_STATUSES = ['pending', 'approved', 'rejected'];
const MAX_BODY      = 2000;
const MAX_TITLE     = 120;
const MAX_NAME      = 80;
const MAX_EMAIL     = 200;

/* ── CORS ─────────────────────────────────────────────────── */
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow  = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type':                  'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':   allow,
    'Access-Control-Allow-Methods':  'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':  'Authorization, Content-Type, X-Admin-Token',
    'Access-Control-Max-Age':        '86400',
    'Vary':                          'Origin',
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function bad(request, msg, status = 400) {
  return json(request, { ok: false, error: msg }, status);
}

/* ── Validation helpers ──────────────────────────────────── */
function clean(str, max) {
  if (typeof str !== 'string') return '';
  const s = str.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function validEmail(s) {
  if (!s) return true; // email optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function validRating(r) {
  const n = Number(r);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/* ── Admin auth ──────────────────────────────────────────── */
function isAdmin(request, env) {
  const adminToken = env?.ADMIN_TOKEN;
  if (!adminToken) return false;
  const header  = request.headers.get('X-Admin-Token') || '';
  const cookie  = request.headers.get('Cookie') || '';
  const cookieMatch = cookie.match(/admin_token=([^;]+)/);
  const cookieTok   = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
  return header === adminToken || cookieTok === adminToken;
}

/* ── DB schema (run once via wrangler d1 execute) ────────── */
async function ensureSchema(env) {
  if (!env?.DB) throw new Error('DB binding not configured');
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      ip_hash TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_slug_status ON product_reviews(product_slug, status);
    CREATE INDEX IF NOT EXISTS idx_reviews_status     ON product_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_created    ON product_reviews(created_at);
  `);
}

/* ── Utility ─────────────────────────────────────────────── */
async function hashIp(ip) {
  const enc  = new TextEncoder().encode(String(ip || ''));
  const buf  = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function row(r) {
  return {
    id:           r.id,
    product_slug: r.product_slug,
    name:         r.name,
    rating:       r.rating,
    title:        r.title || '',
    body:         r.body,
    status:       r.status,
    created_at:   r.created_at,
  };
}

function adminRow(r) {
  return { ...row(r), email: r.email || '', updated_at: r.updated_at };
}

/* ── Route: GET /api/reviews?product=<slug> ──────────────── */
async function handleListPublic(request, env) {
  const url  = new URL(request.url);
  const slug = clean(url.searchParams.get('product') || '', 200);
  if (!slug) return bad(request, 'product slug required');

  const stmt = env.DB.prepare(
    'SELECT id, product_slug, name, rating, title, body, status, created_at ' +
    'FROM product_reviews WHERE product_slug = ? AND status = ? ' +
    'ORDER BY created_at DESC LIMIT 100'
  ).bind(slug, 'approved');

  const result = await stmt.all();
  const rows = result?.results || [];

  // Aggregate
  let avg = 0;
  if (rows.length) {
    const sum = rows.reduce((a, r) => a + r.rating, 0);
    avg = Math.round((sum / rows.length) * 10) / 10;
  }

  return json(request, {
    ok:           true,
    product_slug: slug,
    count:        rows.length,
    average:      avg,
    reviews:      rows.map(row),
  });
}

/* ── Route: POST /api/reviews ────────────────────────────── */
async function handleSubmit(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return bad(request, 'invalid JSON');
  }

  const product_slug = clean(payload.product_slug || payload.product || '', 200);
  const name         = clean(payload.name || '', MAX_NAME);
  const email        = clean(payload.email || '', MAX_EMAIL);
  const title        = clean(payload.title || '', MAX_TITLE);
  const body         = clean(payload.body  || payload.comment || '', MAX_BODY);
  const rating       = Number(payload.rating);

  if (!product_slug)        return bad(request, 'product_slug zorunlu');
  if (!name || name.length < 2) return bad(request, 'isim çok kısa');
  if (!validEmail(email))   return bad(request, 'geçersiz e-posta');
  if (!validRating(rating)) return bad(request, 'puan 1-5 arası olmalı');
  if (!body || body.length < 10) return bad(request, 'yorum en az 10 karakter olmalı');

  const ip       = request.headers.get('CF-Connecting-IP') || '';
  const ipHash   = await hashIp(ip);
  const ua       = clean(request.headers.get('User-Agent') || '', 300);
  const now      = Date.now();

  const stmt = env.DB.prepare(
    'INSERT INTO product_reviews (product_slug, name, email, rating, title, body, status, ip_hash, user_agent, created_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(product_slug, name, email || null, rating, title || null, body, 'pending', ipHash, ua, now, now);

  const result = await stmt.run();

  return json(request, {
    ok:      true,
    id:      result.meta?.last_row_id ?? null,
    status:  'pending',
    message: 'Yorumunuz alındı, onaydan sonra yayınlanacak.',
  }, 201);
}

/* ── Route: GET /api/reviews/admin ───────────────────────── */
async function handleAdminList(request, env) {
  if (!isAdmin(request, env)) return bad(request, 'unauthorized', 401);

  const url    = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit  = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

  let query, binds = [];
  if (status && VALID_STATUSES.includes(status)) {
    query = 'SELECT * FROM product_reviews WHERE status = ? ORDER BY created_at DESC LIMIT ?';
    binds = [status, limit];
  } else {
    query = 'SELECT * FROM product_reviews ORDER BY created_at DESC LIMIT ?';
    binds = [limit];
  }

  const result = await env.DB.prepare(query).bind(...binds).all();
  const rows = result?.results || [];

  // Status counts
  const counts = await env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM product_reviews GROUP BY status"
  ).all();
  const countMap = { pending: 0, approved: 0, rejected: 0 };
  (counts?.results || []).forEach(c => { countMap[c.status] = c.n; });

  return json(request, {
    ok:      true,
    count:   rows.length,
    counts:  countMap,
    reviews: rows.map(adminRow),
  });
}

/* ── Route: POST /api/reviews/admin/:id/approve|reject ───── */
async function handleAdminAction(request, env, id, action) {
  if (!isAdmin(request, env)) return bad(request, 'unauthorized', 401);
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId <= 0) return bad(request, 'invalid id');

  let newStatus;
  if (action === 'approve')      newStatus = 'approved';
  else if (action === 'reject')  newStatus = 'rejected';
  else if (action === 'pending') newStatus = 'pending';
  else return bad(request, 'invalid action');

  const now = Date.now();
  const stmt = env.DB.prepare(
    'UPDATE product_reviews SET status = ?, updated_at = ? WHERE id = ?'
  ).bind(newStatus, now, reviewId);

  const result = await stmt.run();
  if (!result.meta?.changes) return bad(request, 'review not found', 404);

  return json(request, { ok: true, id: reviewId, status: newStatus });
}

/* ── Route: DELETE /api/reviews/admin/:id ────────────────── */
async function handleAdminDelete(request, env, id) {
  if (!isAdmin(request, env)) return bad(request, 'unauthorized', 401);
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId <= 0) return bad(request, 'invalid id');

  const stmt = env.DB.prepare('DELETE FROM product_reviews WHERE id = ?').bind(reviewId);
  const result = await stmt.run();
  if (!result.meta?.changes) return bad(request, 'review not found', 404);

  return json(request, { ok: true, id: reviewId, deleted: true });
}

/* ── Main router ─────────────────────────────────────────── */
export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;

  // Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (!env?.DB) {
    return bad(request, 'D1 database not configured (env.DB binding missing)', 503);
  }

  // Ensure schema (cheap if already exists; CREATE TABLE IF NOT EXISTS)
  try {
    await ensureSchema(env);
  } catch (err) {
    return bad(request, 'schema init failed: ' + err.message, 500);
  }

  // path is the wildcard from [[path]].js — array of segments after /api/reviews
  const segments = params?.path || [];
  const segArr   = Array.isArray(segments) ? segments : (segments ? [segments] : []);

  // No segments: public endpoints
  if (segArr.length === 0) {
    if (method === 'GET')  return handleListPublic(request, env);
    if (method === 'POST') return handleSubmit(request, env);
    return bad(request, 'method not allowed', 405);
  }

  // Admin endpoints
  if (segArr[0] === 'admin') {
    // /api/reviews/admin
    if (segArr.length === 1) {
      if (method === 'GET') return handleAdminList(request, env);
      return bad(request, 'method not allowed', 405);
    }
    // /api/reviews/admin/:id/:action
    if (segArr.length === 3) {
      const [, id, action] = segArr;
      if (method === 'POST') return handleAdminAction(request, env, id, action);
      return bad(request, 'method not allowed', 405);
    }
    // /api/reviews/admin/:id  (DELETE)
    if (segArr.length === 2) {
      const [, id] = segArr;
      if (method === 'DELETE') return handleAdminDelete(request, env, id);
      return bad(request, 'method not allowed', 405);
    }
  }

  return bad(request, 'not found', 404);
}
