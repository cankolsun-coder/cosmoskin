// ============================================================
// COSMOSKIN — Yorum Sistemi API
// Cloudflare Functions: /functions/api/reviews.js
// Endpoint tabanı: /api/reviews
// ============================================================

const ALLOWED_ORIGINS = [
  'https://www.cosmoskin.com.tr',
  'https://cosmoskin.com.tr',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const SUPABASE_URL = () => globalThis.SUPABASE_URL;
const SUPABASE_ANON = () => globalThis.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = () => globalThis.SUPABASE_SERVICE_ROLE_KEY;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://www.cosmoskin.com.tr';
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function fail(request, message, status = 400) {
  return json(request, { error: message }, status);
}

function esc(value = '') {
  return String(value).replace(/,/g, '%2C');
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^̀-ͯ]/g, (m) => m)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function getUser(request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON(),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return await readJson(res);
}

function isAdmin(user) {
  return user?.app_metadata?.role === 'admin' || user?.user_metadata?.role === 'admin';
}

async function rest(path, { method = 'GET', body, useService = false, prefer } = {}) {
  const key = useService ? SUPABASE_SERVICE() : SUPABASE_ANON();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (prefer) headers['Prefer'] = prefer;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function getProfileDisplayName(userId) {
  const candidates = [
    `profiles?id=eq.${esc(userId)}&select=first_name,last_name,full_name,name&limit=1`,
    `user_profiles?id=eq.${esc(userId)}&select=first_name,last_name,full_name,name&limit=1`,
  ];

  for (const path of candidates) {
    const { ok, data } = await rest(path, { useService: true });
    if (ok && Array.isArray(data) && data[0]) {
      const row = data[0];
      const full = row.full_name || row.name || [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
      if (full) {
        const parts = full.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return `${parts[0]} ${parts[1].charAt(0)}.`;
        return parts[0];
      }
    }
  }
  return 'Doğrulanmış Müşteri';
}

async function verifyPurchase(userId, productId) {
  const candidateQueries = [
    `orders?user_id=eq.${esc(userId)}&status=in.(confirmed,paid,completed,delivered)&select=id,order_items,items,product_ids`,
    `orders?customer_id=eq.${esc(userId)}&status=in.(confirmed,paid,completed,delivered)&select=id,order_items,items,product_ids`,
  ];

  for (const path of candidateQueries) {
    const { ok, data } = await rest(path, { useService: true });
    if (!ok || !Array.isArray(data)) continue;

    const found = data.find((order) => {
      const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
      const items = Array.isArray(order.items) ? order.items : [];
      const productIds = Array.isArray(order.product_ids) ? order.product_ids : [];

      if (productIds.includes(productId)) return true;

      const pool = [...orderItems, ...items];
      return pool.some((item) => {
        const pid = item?.product_id || item?.id || '';
        const pname = item?.product_name || item?.name || '';
        return pid === productId || slugify(pname) === productId;
      });
    });

    if (found) return found.id || 'confirmed-order';
  }

  return null;
}

async function handleGetReviews(request, url) {
  const productId = url.searchParams.get('product_id');
  if (!productId) return fail(request, 'product_id gerekli');

  const reviewPath = [
    `product_reviews?product_id=eq.${esc(productId)}`,
    `status=eq.approved`,
    `order=created_at.desc`,
    `select=id,product_id,user_id,title,body,rating,is_edited,helpful_count,created_at,updated_at`,
  ].join('&');

  const imagePath = [
    `review_images?status=eq.approved`,
    `select=id,review_id,public_url,width,height,status,sort_order`,
    `order=sort_order.asc,created_at.asc`,
  ].join('&');

  const summaryPath = `product_review_summary?product_id=eq.${esc(productId)}&select=*`;

  const [{ ok: reviewsOk, data: reviewRows }, { ok: imagesOk, data: imageRows }, { data: summaryRows }] =
    await Promise.all([
      rest(reviewPath, { useService: true }),
      rest(imagePath, { useService: true }),
      rest(summaryPath, { useService: true }),
    ]);

  if (!reviewsOk) return fail(request, 'Yorumlar alınamadı', 500);

  const nameCache = new Map();
  async function displayName(userId) {
    if (!nameCache.has(userId)) nameCache.set(userId, await getProfileDisplayName(userId));
    return nameCache.get(userId);
  }

  const reviews = await Promise.all((reviewRows || []).map(async (row) => ({
    ...row,
    user_display_name: await displayName(row.user_id),
    review_images: (imageRows || []).filter((img) => img.review_id === row.id),
  })));

  return json(request, {
    reviews,
    summary: Array.isArray(summaryRows) ? summaryRows[0] || null : null,
  });
}

async function handlePostReview(request) {
  const user = await getUser(request);
  if (!user) return fail(request, 'Oturum açmanız gerekiyor', 401);

  const payload = await request.json().catch(() => null);
  if (!payload) return fail(request, 'Geçersiz istek gövdesi');

  const productId = String(payload.product_id || '').trim();
  const title = String(payload.title || '').trim();
  const body = String(payload.review_body || '').trim();
  const rating = Number(payload.rating || 0);

  if (!productId || !title || !body || !rating) return fail(request, 'Tüm alanları doldurun');
  if (title.length < 3 || title.length > 100) return fail(request, 'Başlık 3 ile 100 karakter arasında olmalı');
  if (body.length < 10 || body.length > 2000) return fail(request, 'Yorum 10 ile 2000 karakter arasında olmalı');
  if (rating < 1 || rating > 5) return fail(request, 'Puan 1 ile 5 arasında olmalı');

  const orderId = await verifyPurchase(user.id, productId);
  if (!orderId) return fail(request, 'Bu ürünü satın almış olmanız gerekiyor', 403);

  const existing = await rest(
    `product_reviews?user_id=eq.${esc(user.id)}&product_id=eq.${esc(productId)}&select=id&limit=1`,
    { useService: true }
  );
  if (Array.isArray(existing.data) && existing.data.length) {
    return fail(request, 'Bu ürün için zaten yorum bıraktınız. Düzenleme yapabilirsiniz.', 409);
  }

  const inserted = await rest('product_reviews', {
    method: 'POST',
    useService: true,
    prefer: 'return=representation',
    body: {
      product_id: productId,
      user_id: user.id,
      order_id: orderId,
      title: title.slice(0, 100),
      body: body.slice(0, 2000),
      rating,
      status: 'pending',
    },
  });

  if (!inserted.ok) return fail(request, 'Yorum kaydedilemedi', 500);

  return json(request, {
    success: true,
    review_id: inserted.data?.[0]?.id || null,
    message: 'Yorumunuz alındı. İnceleme sonrası yayınlanacaktır.',
  }, 201);
}

async function handleUpdateReview(request, reviewId) {
  const user = await getUser(request);
  if (!user) return fail(request, 'Oturum açmanız gerekiyor', 401);

  const payload = await request.json().catch(() => null);
  if (!payload) return fail(request, 'Geçersiz istek gövdesi');

  const current = await rest(
    `product_reviews?id=eq.${esc(reviewId)}&user_id=eq.${esc(user.id)}&select=id,edit_count`,
    { useService: true }
  );
  if (!Array.isArray(current.data) || !current.data.length) return fail(request, 'Yorum bulunamadı veya yetkiniz yok', 403);

  const patch = {
    status: 'pending',
    is_edited: true,
    edit_count: Number(current.data[0].edit_count || 0) + 1,
  };

  if (payload.title) patch.title = String(payload.title).trim().slice(0, 100);
  if (payload.review_body) patch.body = String(payload.review_body).trim().slice(0, 2000);
  if (payload.rating) patch.rating = Number(payload.rating);

  const updated = await rest(`product_reviews?id=eq.${esc(reviewId)}`, {
    method: 'PATCH',
    useService: true,
    prefer: 'return=representation',
    body: patch,
  });

  if (!updated.ok) return fail(request, 'Güncelleme başarısız', 500);
  return json(request, { success: true, message: 'Yorumunuz güncellendi. Tekrar incelenecektir.' });
}

async function handleUploadImage(request) {
  const user = await getUser(request);
  if (!user) return fail(request, 'Oturum açmanız gerekiyor', 401);

  const payload = await request.json().catch(() => null);
  if (!payload?.review_id || !Array.isArray(payload.images) || !payload.images.length) {
    return fail(request, 'Geçerli görsel bilgisi gönderin');
  }

  const reviewCheck = await rest(
    `product_reviews?id=eq.${esc(payload.review_id)}&user_id=eq.${esc(user.id)}&select=id`,
    { useService: true }
  );
  if (!Array.isArray(reviewCheck.data) || !reviewCheck.data.length) {
    return fail(request, 'Yorum bulunamadı veya yetkiniz yok', 403);
  }

  const rows = payload.images.slice(0, 5).map((img, index) => ({
    review_id: payload.review_id,
    user_id: user.id,
    storage_path: img.storagePath || img.storage_path || '',
    public_url: img.publicUrl || img.public_url || '',
    original_name: img.originalName || img.original_name || null,
    file_size_kb: img.fileSizeKb || img.file_size_kb || null,
    width: img.width || null,
    height: img.height || null,
    mime_type: img.mimeType || img.mime_type || 'image/webp',
    status: 'pending',
    sort_order: index,
  })).filter((row) => row.storage_path && row.public_url);

  if (!rows.length) return fail(request, 'Kaydedilecek geçerli görsel bulunamadı');

  const inserted = await rest('review_images', {
    method: 'POST',
    useService: true,
    prefer: 'return=representation',
    body: rows,
  });

  if (!inserted.ok) return fail(request, 'Görseller kaydedilemedi', 500);
  return json(request, { success: true, images: inserted.data || [] }, 201);
}

async function handleHelpful(request) {
  const user = await getUser(request);
  if (!user) return fail(request, 'Oturum açmanız gerekiyor', 401);

  const payload = await request.json().catch(() => null);
  const reviewId = String(payload?.review_id || '').trim();
  const action = String(payload?.action || 'add').trim();
  if (!reviewId) return fail(request, 'review_id gerekli');

  if (action === 'remove') {
    await rest(`review_helpful?review_id=eq.${esc(reviewId)}&user_id=eq.${esc(user.id)}`, {
      method: 'DELETE',
      useService: true,
    });
    return json(request, { success: true });
  }

  const inserted = await rest('review_helpful', {
    method: 'POST',
    useService: true,
    prefer: 'return=minimal',
    body: { review_id: reviewId, user_id: user.id },
  });

  if (!inserted.ok && inserted.status !== 409) return fail(request, 'İşlem başarısız', 500);
  return json(request, { success: true });
}

async function handleAdminList(request, url) {
  const user = await getUser(request);
  if (!user || !isAdmin(user)) return fail(request, 'Yetkisiz erişim', 403);

  const status = String(url.searchParams.get('status') || 'pending');
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') || 20)));
  const offset = (page - 1) * limit;

  const isImages = url.pathname.includes('/admin/images');

  if (isImages) {
    const result = await rest(
      `review_images?status=eq.${esc(status)}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*`,
      { useService: true }
    );
    if (!result.ok) return fail(request, 'Görseller alınamadı', 500);
    return json(request, { images: result.data || [], page, limit });
  }

  const result = await rest(
    `product_reviews?status=eq.${esc(status)}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*,review_images(*)`,
    { useService: true }
  );
  if (!result.ok) return fail(request, 'Yorumlar alınamadı', 500);
  return json(request, { reviews: result.data || [], page, limit });
}

async function handleModerateReview(request, reviewId) {
  const user = await getUser(request);
  if (!user || !isAdmin(user)) return fail(request, 'Yetkisiz erişim', 403);

  const payload = await request.json().catch(() => null);
  const action = String(payload?.action || '').trim();
  const note = payload?.note ? String(payload.note).trim().slice(0, 500) : null;
  if (!['approved', 'rejected'].includes(action)) return fail(request, 'Geçersiz işlem');

  const updated = await rest(`product_reviews?id=eq.${esc(reviewId)}`, {
    method: 'PATCH',
    useService: true,
    prefer: 'return=representation',
    body: {
      status: action,
      moderation_note: note,
      moderated_by: user.id,
      moderated_at: new Date().toISOString(),
    },
  });

  if (!updated.ok) return fail(request, 'İşlem başarısız', 500);
  return json(request, {
    success: true,
    message: action === 'approved' ? 'Yorum yayınlandı.' : 'Yorum reddedildi.',
  });
}

async function handleModerateImage(request, imageId) {
  const user = await getUser(request);
  if (!user || !isAdmin(user)) return fail(request, 'Yetkisiz erişim', 403);

  const payload = await request.json().catch(() => null);
  const action = String(payload?.action || '').trim();
  const note = payload?.note ? String(payload.note).trim().slice(0, 500) : null;
  if (!['approved', 'rejected'].includes(action)) return fail(request, 'Geçersiz işlem');

  const updated = await rest(`review_images?id=eq.${esc(imageId)}`, {
    method: 'PATCH',
    useService: true,
    prefer: 'return=representation',
    body: {
      status: action,
      moderation_note: note,
      moderated_by: user.id,
      moderated_at: new Date().toISOString(),
    },
  });

  if (!updated.ok) return fail(request, 'İşlem başarısız', 500);
  return json(request, { success: true, message: action === 'approved' ? 'Görsel onaylandı.' : 'Görsel reddedildi.' });
}

export async function onRequest(context) {
  const { request, env } = context;

  globalThis.SUPABASE_URL = env.SUPABASE_URL;
  globalThis.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  globalThis.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL() || !SUPABASE_ANON() || !SUPABASE_SERVICE()) {
    return fail(request, 'Sunucu değişkenleri eksik', 500);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const url = new URL(request.url);
  const relative = url.pathname.replace(/^\/api\/reviews/, '');
  const parts = relative.split('/').filter(Boolean);
  const method = request.method.toUpperCase();

  if (method === 'GET' && parts.length === 0) return handleGetReviews(request, url);
  if (method === 'POST' && parts.length === 0) return handlePostReview(request);
  if (method === 'PATCH' && parts.length === 1) return handleUpdateReview(request, parts[0]);
  if (method === 'POST' && parts[0] === 'images') return handleUploadImage(request);
  if (method === 'POST' && parts[0] === 'helpful') return handleHelpful(request);
  if (method === 'GET' && parts[0] === 'admin') return handleAdminList(request, url);
  if (method === 'PATCH' && parts[0] === 'admin' && parts[2] === 'moderate') return handleModerateReview(request, parts[1]);
  if (method === 'PATCH' && parts[0] === 'admin' && parts[1] === 'images' && parts[3] === 'moderate') return handleModerateImage(request, parts[2]);

  return fail(request, 'Geçersiz istek', 404);
}
