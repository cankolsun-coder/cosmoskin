/**
 * COSMOSKIN — Reviews API (Cloudflare Pages Functions + Supabase)
 *
 * Routes:
 *   OPTIONS  /api/reviews                         CORS preflight
 *   GET      /api/reviews?product_slug=...        Public: approved reviews
 *   POST     /api/reviews                         Public: create review → pending
 *   PATCH    /api/reviews/:id                     Public: edit own review → pending
 *   PUT      /api/reviews/:id                     Same as PATCH
 *   POST     /api/reviews/:id/images              Public: upload image for review
 *   GET      /api/reviews/admin                   Admin: list all (filter by status/search)
 *   PATCH    /api/reviews/admin/:id               Admin: change status
 *   DELETE   /api/reviews/admin/:id              Admin: delete review
 *   PATCH    /api/reviews/admin/:id/images/:imgId Admin: change image status
 *   DELETE   /api/reviews/admin/:id/images/:imgId Admin: delete image
 */

const ADMIN_TOKEN_HEADER = 'x-admin-token';
const REVIEW_TABLES      = ['product_reviews', 'reviews'];
const IMAGE_TABLES = {
  product_reviews: ['product_review_images', 'review_images'],
  reviews:         ['review_images', 'product_review_images'],
};
const INLINE_IMAGE_FIELDS = ['images', 'image_urls', 'photo_urls', 'media_urls', 'attachments'];
const STATUS_ALIASES = {
  approve:  'approved',
  approved: 'approved',
  reject:   'rejected',
  rejected: 'rejected',
  pending:  'pending',
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES      = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES_PER_REVIEW = 5;
const STORAGE_BUCKET       = 'review-images';

/* ════════════════════════════════════════════════════════════ */
/* MAIN ROUTER                                                  */
/* ════════════════════════════════════════════════════════════ */

export async function onRequest(context) {
  const { request } = context;
  const url   = new URL(request.url);
  const route = getRouteSegments(url.pathname);
  const method = request.method;

  if (method === 'OPTIONS') return reply(null, 204);

  try {
    /* ── Admin routes ── */
    if (route[0] === 'admin') {
      return await handleAdmin(context, route.slice(1), url);
    }

    /* ── GET /api/reviews ── */
    if (method === 'GET' && route.length === 0) {
      return await handlePublicGet(context, url);
    }

    /* ── POST /api/reviews — create new review ── */
    if (method === 'POST' && route.length === 0) {
      return await handleCreate(context);
    }

    /* ── POST /api/reviews/:id/images — upload image ── */
    if (method === 'POST' && route.length === 2 && route[1] === 'images') {
      return await handleImageUpload(context, route[0]);
    }

    /* ── PATCH|PUT /api/reviews/:id — edit existing review ── */
    if ((method === 'PATCH' || method === 'PUT') && route.length === 1) {
      return await handleUpdate(context, route[0]);
    }

    return reply({ ok: false, error: 'Desteklenmeyen endpoint.' }, 404);

  } catch (error) {
    if (error instanceof Response) return error;
    return reply(
      { ok: false, error: error?.message || 'Beklenmeyen bir hata oluştu.' },
      500,
      { 'Cache-Control': 'no-store' }
    );
  }
}

/* ════════════════════════════════════════════════════════════ */
/* PUBLIC: CREATE REVIEW                                        */
/* ════════════════════════════════════════════════════════════ */

async function handleCreate(context) {
  const parsed = await parseBody(context.request);

  const product_slug = clean(parsed.product_slug || parsed.product || parsed.slug, 300);
  const name         = clean(parsed.name || parsed.user_name || parsed.user_display_name, 120);
  const email        = clean(parsed.email || parsed.user_email, 300);
  const title        = clean(parsed.title, 120);
  const body         = clean(parsed.body || parsed.comment || parsed.text, 2000);
  const rating       = clampRating(parsed.rating);

  if (!product_slug) return reply({ ok: false, error: 'product_slug zorunlu.' }, 400);
  if (name.length < 2) return reply({ ok: false, error: 'İsim en az 2 karakter olmalı.' }, 400);
  if (!rating)         return reply({ ok: false, error: 'Puan 1-5 arasında olmalı.' }, 400);
  if (body.length < 10) return reply({ ok: false, error: 'Yorum en az 10 karakter olmalı.' }, 400);

  /* Detect active table */
  const table = await detectReviewTable(context);
  const now   = new Date().toISOString();

  /* Build insert payload matching either schema */
  let payload;
  if (table === 'reviews') {
    payload = {
      product_slug,
      user_display_name: name,
      user_email:        email || null,
      title:             title || null,
      body,
      rating,
      approved:          false,
      is_edited:         false,
      created_at:        now,
      updated_at:        now,
    };
  } else {
    /* product_reviews — older schema (is_approved boolean, comment field) */
    payload = {
      product_slug,
      user_name:    name,
      user_email:   email || null,
      rating,
      comment:      body,
      title:        title || null,
      is_approved:  false,
      created_at:   now,
    };
  }

  const inserted = await insertRow(context, table, payload);
  const reviewId = inserted?.id || null;

  return reply({
    ok:      true,
    id:      reviewId,
    status:  'pending',
    message: 'Yorumunuz alındı. Onaydan sonra yayınlanacak.',
  }, 201, { 'Cache-Control': 'no-store' });
}

/* ════════════════════════════════════════════════════════════ */
/* PUBLIC: UPDATE (PATCH|PUT) REVIEW                           */
/* ════════════════════════════════════════════════════════════ */

async function handleUpdate(context, reviewId) {
  if (!reviewId) return reply({ ok: false, error: 'Review ID gerekli.' }, 400);

  const parsed = await parseBody(context.request);

  /* Optional fields — only update what's provided */
  const updates = {};
  const now     = new Date().toISOString();

  if (parsed.rating   != null) updates.rating   = clampRating(parsed.rating);
  if (parsed.title    != null) updates.title     = clean(parsed.title, 120) || null;
  if (parsed.body     != null) updates.body      = clean(parsed.body || parsed.comment, 2000);
  if (parsed.comment  != null) updates.comment   = clean(parsed.comment, 2000);
  if (parsed.name     != null) updates.user_name = clean(parsed.name, 120);
  if (parsed.user_display_name != null) updates.user_display_name = clean(parsed.user_display_name, 120);

  if (!Object.keys(updates).length) {
    return reply({ ok: false, error: 'Güncellenecek alan bulunamadı.' }, 400);
  }

  if (updates.body && updates.body.length < 10) {
    return reply({ ok: false, error: 'Yorum en az 10 karakter olmalı.' }, 400);
  }

  /* Find review */
  const target = await resolveReviewRecord(context, reviewId, '');

  /* Reset status to pending (re-approval required) */
  const table = target.table;
  if (table === 'reviews') {
    updates.approved   = false;
    updates.is_edited  = true;
    updates.updated_at = now;
  } else {
    updates.is_approved = false;
    /* updated_at only if column exists */
    if ('updated_at' in target.row) updates.updated_at = now;
    /* Sync comment→body if schema uses comment */
    if (updates.body && !updates.comment) updates.comment = updates.body;
    delete updates.body;
  }

  await patchRows(context, table, { id: reviewId }, updates);

  return reply({
    ok:     true,
    id:     reviewId,
    status: 'pending',
    message: 'Yorumunuz güncellendi. Onaydan sonra tekrar yayınlanacak.',
  }, 200, { 'Cache-Control': 'no-store' });
}

/* ════════════════════════════════════════════════════════════ */
/* PUBLIC: IMAGE UPLOAD                                         */
/* ════════════════════════════════════════════════════════════ */

async function handleImageUpload(context, reviewId) {
  if (!reviewId) return reply({ ok: false, error: 'Review ID gerekli.' }, 400);

  const contentType = context.request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return reply({ ok: false, error: 'multipart/form-data bekleniyor.' }, 400);
  }

  let formData;
  try { formData = await context.request.formData(); }
  catch (e) { return reply({ ok: false, error: 'Form verisi okunamadı.' }, 400); }

  const file = formData.get('image') || formData.get('photo') || formData.get('file');
  if (!file || typeof file === 'string') {
    return reply({ ok: false, error: 'Görsel bulunamadı (alan adı: image, photo veya file).' }, 400);
  }

  /* Validate type */
  const mime = file.type || '';
  if (!ALLOWED_IMAGE_TYPES.includes(mime.toLowerCase())) {
    return reply({ ok: false, error: 'Yalnızca JPG, PNG veya WEBP görseller kabul edilir.' }, 400);
  }

  /* Validate size */
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    return reply({ ok: false, error: 'Görsel 5 MB sınırını aşıyor.' }, 400);
  }

  /* Find review & check existing image count */
  const target = await resolveReviewRecord(context, reviewId, '');
  const imageTable = (IMAGE_TABLES[target.table] || [])[0];
  if (!imageTable) {
    return reply({ ok: false, error: 'Görsel tablosu tanımlanmamış.' }, 503);
  }

  const existingImages = await safeSelect(context, imageTable, {
    select:    '*',
    review_id: `eq.${reviewId}`,
  }, true) || [];

  if (existingImages.length >= MAX_IMAGES_PER_REVIEW) {
    return reply({ ok: false, error: `Her yoruma en fazla ${MAX_IMAGES_PER_REVIEW} görsel eklenebilir.` }, 400);
  }

  /* Upload to Supabase Storage */
  const ext    = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const rndId  = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
  const storagePath = `reviews/${reviewId}/${rndId}.${ext}`;
  const now    = new Date().toISOString();

  const { url: supabaseUrl, key } = getSupabaseConfig(context);
  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`,
    {
      method:  'POST',
      headers: {
        apikey:          key,
        Authorization:   `Bearer ${key}`,
        'Content-Type':  mime,
        'Cache-Control': '3600',
        'x-upsert':      'false',
      },
      body: arrayBuffer,
    }
  );

  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(() => '');
    return reply({ ok: false, error: 'Görsel yüklenemedi: ' + (txt || uploadRes.status) }, 502);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;

  /* Insert into image table */
  const imagePayload = {
    review_id:    reviewId,
    storage_path: storagePath,
    public_url:   publicUrl,
    status:       'pending',
    created_at:   now,
  };

  const insertedImage = await insertRow(context, imageTable, imagePayload);

  /* Reset review to pending (needs re-approval after image change) */
  const statusPatch = target.table === 'reviews'
    ? { approved: false, is_edited: true, updated_at: now }
    : { is_approved: false };
  if ('updated_at' in target.row && target.table !== 'reviews') statusPatch.updated_at = now;
  await patchRows(context, target.table, { id: reviewId }, statusPatch);

  return reply({
    ok:          true,
    id:          insertedImage?.id || null,
    url:         publicUrl,
    status:      'pending',
    review_status: 'pending',
    message:     'Görsel yüklendi. Admin onayından sonra yayınlanacak.',
  }, 201, { 'Cache-Control': 'no-store' });
}

/* ════════════════════════════════════════════════════════════ */
/* PUBLIC: GET (approved reviews)                               */
/* ════════════════════════════════════════════════════════════ */

async function handlePublicGet(context, url) {
  const productRef = pickFirstString(
    url.searchParams.get('product_slug'),
    url.searchParams.get('product'),
    url.searchParams.get('slug'),
    url.searchParams.get('product_id'),
    url.searchParams.get('id')
  );

  if (!productRef) {
    return reply({ ok: true, message: 'Reviews API çalışıyor.' }, 200,
      { 'Cache-Control': 'public, max-age=60' });
  }

  const payload = await loadReviewBundle(context, {
    status:              'approved',
    productRef,
    includeRejectedImages: false,
  });

  const publicReviews = payload.filtered.map((review) => ({
    id:                 review.id,
    user_id:            review.user.id || null,
    user_display_name:  review.user.name || review.user.email || 'Anonim',
    user_email:         review.user.email || null,
    title:              review.title,
    body:               review.body,
    rating:             review.rating,
    helpful_count:      review.helpful_count || 0,
    created_at:         review.created_at,
    updated_at:         review.updated_at || null,
    product_slug:       review.product.slug || null,
    product_id:         review.product.id || null,
    product_name:       review.product.name || null,
    product_brand:      review.product.brand || null,
    product_image:      review.product.image || null,
    review_images:      (review.images || []).filter((img) => img.status === 'approved'),
  }));

  return reply({
    ok:      true,
    reviews: publicReviews,
    summary: buildRatingSummary(publicReviews),
    meta:    payload.meta,
  }, 200, { 'Cache-Control': 'public, max-age=120' });
}

/* ════════════════════════════════════════════════════════════ */
/* ADMIN ROUTES                                                 */
/* ════════════════════════════════════════════════════════════ */

async function handleAdmin(context, route, url) {
  requireAdmin(context.request, context.env);

  /* GET /api/reviews/admin */
  if (route.length === 0) {
    if (context.request.method !== 'GET') {
      return reply({ ok: false, error: 'Method not allowed.' }, 405);
    }
    const requestedStatus = normalizeRequestedStatus(url.searchParams.get('status'));
    const search          = String(url.searchParams.get('search') || '').trim();
    const payload = await loadReviewBundle(context, {
      status:              requestedStatus,
      search,
      includeRejectedImages: true,
    });
    return reply({
      ok:      true,
      reviews: payload.filtered,
      items:   payload.filtered,
      counts:  payload.counts,
      total:   payload.filtered.length,
      meta:    payload.meta,
    }, 200, { 'Cache-Control': 'no-store' });
  }

  const reviewId = route[0];
  const second   = route[1] || '';

  if (!reviewId) return reply({ ok: false, error: 'Review id gerekli.' }, 400);

  /* /api/reviews/admin/:id/images/:imgId */
  if (second === 'images') {
    return await handleAdminImageMutation(context, reviewId, route.slice(2));
  }

  /* DELETE /api/reviews/admin/:id */
  if (context.request.method === 'DELETE' && route.length === 1) {
    const deleted = await deleteProductReview(context, reviewId);
    return reply({ ok: true, review: deleted }, 200, { 'Cache-Control': 'no-store' });
  }

  /* PATCH /api/reviews/admin/:id — change status */
  if (context.request.method === 'PATCH' && route.length === 1) {
    const body   = await readJson(context.request);
    const status = normalizeRequestedStatus(body?.status);
    if (status !== 'approved' && status !== 'rejected') {
      return reply({ ok: false, error: 'status yalnızca approved veya rejected olabilir.' }, 400);
    }
    const updated = await patchProductReviewStatus(context, reviewId, status);
    return reply({ ok: true, review: updated }, 200, { 'Cache-Control': 'no-store' });
  }

  /* POST|PATCH with action in body — legacy compat */
  if ((context.request.method === 'PATCH' || context.request.method === 'POST') && route.length >= 1) {
    const body   = await readJson(context.request);
    const source = normalizeReviewTable(body?.source_table);
    const action = second || body?.action || body?.status;
    const status = normalizeRequestedStatus(action);
    if (!status) return reply({ ok: false, error: 'Geçerli bir review aksiyonu gerekli.' }, 400);
    const updated = await updateReviewStatus(context, reviewId, source, status);
    return reply({ ok: true, review: updated.review }, 200, { 'Cache-Control': 'no-store' });
  }

  return reply({ ok: false, error: 'Desteklenmeyen admin endpoint.' }, 404);
}

async function handleAdminImageMutation(context, reviewId, route) {
  const imageId = route[0];
  const action  = route[1] || '';

  if (!imageId) return reply({ ok: false, error: 'Image id gerekli.' }, 400);

  const body         = await readJson(context.request);
  const desiredStatus = normalizeRequestedStatus(action || body?.action || body?.status);

  if (context.request.method === 'DELETE') {
    await deleteReviewImage(context, reviewId, imageId, body);
    return reply({ ok: true, deleted: true, id: imageId }, 200, { 'Cache-Control': 'no-store' });
  }

  if (context.request.method !== 'PATCH' && context.request.method !== 'POST') {
    return reply({ ok: false, error: 'Method not allowed.' }, 405);
  }

  if (!desiredStatus) return reply({ ok: false, error: 'Geçerli bir görsel aksiyonu gerekli.' }, 400);

  const updated = await updateReviewImageStatus(context, reviewId, imageId, desiredStatus, body);
  return reply({ ok: true, id: imageId, status: updated.status, image: updated.image }, 200,
    { 'Cache-Control': 'no-store' });
}

/* ════════════════════════════════════════════════════════════ */
/* DATA HELPERS                                                 */
/* ════════════════════════════════════════════════════════════ */

async function detectReviewTable(context) {
  for (const table of REVIEW_TABLES) {
    const rows = await safeSelect(context, table, { select: 'id', order: 'created_at.desc', limit: '1' }, true);
    if (rows !== null) return table;
  }
  return REVIEW_TABLES[0];
}

async function loadReviewBundle(context, { status = '', search = '', productRef = '', includeRejectedImages = true } = {}) {
  const source    = await loadReviewSource(context);
  const base      = (source.rows || []).map((row) => normalizeReview(row, source.table));
  const enriched  = await enrichReviews(context, base, source.table);
  const all       = enriched.reviews;
  const counts    = countReviewStatuses(all);

  let filtered = [...all];
  if (status && status !== 'all') filtered = filtered.filter((r) => r.status === status);
  if (productRef) {
    const term = normalizeText(productRef);
    filtered = filtered.filter((r) => {
      return normalizeText(r.product.slug) === term || normalizeText(r.product.id) === term;
    });
  }
  if (search) {
    const term = normalizeText(search);
    filtered = filtered.filter((r) => buildSearchText(r).includes(term));
  }
  filtered = filtered.map((r) => includeRejectedImages ? r : filterPublicReviewImages(r));

  return {
    all, filtered, counts,
    meta: {
      review_table:    source.table,
      image_tables:    enriched.imageTables,
      total_reviews:   all.length,
      search_supported: true,
      image_support:   { inline_fields: INLINE_IMAGE_FIELDS, separate_tables: IMAGE_TABLES[source.table] || [] },
    },
  };
}

async function loadReviewSource(context) {
  for (const table of REVIEW_TABLES) {
    const rows = await safeSelect(context, table, { select: '*', order: 'created_at.desc' });
    if (rows !== null) return { table, rows: Array.isArray(rows) ? rows : [] };
  }
  throw new Error('Review tablosu bulunamadı.');
}

function normalizeReview(row, table) {
  const status      = normalizeStatus(row.status, row.is_approved, row.approved);
  const productSlug = pickFirstString(row.product_slug, row.slug);
  const productId   = pickFirstString(row.product_id, row.catalog_id, row.item_id, row.sku, productSlug);
  const title       = pickFirstString(row.title, row.review_title, row.headline, row.subject);
  const body        = pickFirstString(row.body, row.comment, row.review_body, row.content, row.text, row.message);
  const userName    = pickFirstString(row.user_display_name, row.user_name, row.name, row.author_name, row.customer_name);
  const userEmail   = pickFirstString(row.user_email, row.email, row.customer_email);
  const userId      = pickFirstString(row.user_id, row.customer_id, row.author_id);
  const orderId     = pickFirstString(row.order_id, row.purchase_order_id, row.order_uuid);
  const orderNumber = pickFirstString(row.order_number, row.purchase_order_number);
  const inlineImages = extractInlineImages(row, status);

  return {
    id:            String(row.id),
    source_table:  table,
    status,
    rating:        clampRating(row.rating || row.stars || row.score),
    title,
    body,
    created_at:    row.created_at || null,
    updated_at:    row.updated_at || null,
    helpful_count: Number(row.helpful_count || 0),
    user:   { id: userId || null, name: userName || null, email: userEmail || null },
    order:  { id: orderId || null, number: orderNumber || null,
              status: pickFirstString(row.order_status) || null, created_at: row.order_created_at || null },
    product: {
      id:    productId || null, slug: productSlug || null,
      name:  pickFirstString(row.product_name) || null,
      brand: pickFirstString(row.brand, row.product_brand) || null,
      image: pickFirstString(row.image, row.product_image, row.image_url) || null,
      url:   pickFirstString(row.product_url, row.page_url) || null,
    },
    images: inlineImages,
  };
}

async function enrichReviews(context, reviews, reviewTable) {
  if (!reviews.length) return { reviews: [], imageTables: [] };

  const reviewIds        = unique(reviews.map((r) => r.id));
  const productIds       = unique(reviews.map((r) => r.product.id).filter(Boolean));
  const explicitOrderIds = unique(reviews.map((r) => r.order.id).filter(Boolean));
  const userIds          = unique(reviews.map((r) => r.user.id).filter(Boolean));

  const [slugMapRows, explicitOrdersRows, userOrdersRows, imageResult] = await Promise.all([
    productIds.length
      ? safeSelect(context, 'product_id_to_slug', { select: '*', product_id: `in.${formatInFilter(productIds)}` })
      : Promise.resolve([]),
    explicitOrderIds.length
      ? safeSelect(context, 'orders', { select: '*', id: `in.${formatInFilter(explicitOrderIds)}` })
      : Promise.resolve([]),
    userIds.length
      ? safeSelect(context, 'orders', { select: '*', user_id: `in.${formatInFilter(userIds)}`, order: 'created_at.desc' })
      : Promise.resolve([]),
    loadReviewImages(context, reviewTable, reviewIds),
  ]);

  const slugMap = new Map();
  for (const row of slugMapRows || []) {
    const pid = pickFirstString(row.product_id);
    const ps  = pickFirstString(row.product_slug);
    if (pid && ps) slugMap.set(pid, ps);
  }

  for (const review of reviews) {
    if (!review.product.slug && review.product.id && slugMap.has(review.product.id)) {
      review.product.slug = slugMap.get(review.product.id);
    }
  }

  const allOrderRows      = uniqueById([...(explicitOrdersRows || []), ...(userOrdersRows || [])]);
  const allOrderIds       = unique(allOrderRows.map((r) => r.id).filter(Boolean));
  const productSlugs      = unique(reviews.map((r) => r.product.slug).filter(Boolean));

  const [orderItemRows, productRows] = await Promise.all([
    allOrderIds.length
      ? safeSelect(context, 'order_items', { select: '*', order_id: `in.${formatInFilter(allOrderIds)}` })
      : Promise.resolve([]),
    productSlugs.length
      ? safeSelect(context, 'products', { select: '*', slug: `in.${formatInFilter(productSlugs)}` })
      : Promise.resolve([]),
  ]);

  const ordersById = new Map();
  const userOrdersByUserId = new Map();
  for (const row of allOrderRows) {
    ordersById.set(String(row.id), row);
    const uid = pickFirstString(row.user_id);
    if (!uid) continue;
    const list = userOrdersByUserId.get(uid) || [];
    list.push(row);
    userOrdersByUserId.set(uid, list);
  }
  for (const [uid, list] of userOrdersByUserId.entries()) {
    list.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
    userOrdersByUserId.set(uid, list);
  }

  const orderItemsByOrderId = new Map();
  for (const row of orderItemRows || []) {
    const oid  = String(row.order_id);
    const list = orderItemsByOrderId.get(oid) || [];
    list.push(row);
    orderItemsByOrderId.set(oid, list);
  }

  const productsBySlug = new Map();
  for (const row of productRows || []) {
    const s = pickFirstString(row.slug);
    if (s) productsBySlug.set(s, row);
  }

  for (const review of reviews) {
    let orderRow    = review.order.id ? ordersById.get(review.order.id) || null : null;
    let matchedItem = orderRow ? matchOrderItem(orderItemsByOrderId.get(String(orderRow.id)) || [], review, slugMap) : null;

    if (!matchedItem && review.user.id) {
      for (const candidate of userOrdersByUserId.get(review.user.id) || []) {
        const item = matchOrderItem(orderItemsByOrderId.get(String(candidate.id)) || [], review, slugMap);
        if (item) { orderRow = candidate; matchedItem = item; break; }
      }
    }

    if (matchedItem) {
      review.product.slug  = review.product.slug  || pickFirstString(matchedItem.product_slug) || slugMap.get(pickFirstString(matchedItem.product_id)) || null;
      review.product.id    = review.product.id    || pickFirstString(matchedItem.product_id, matchedItem.product_slug, review.product.slug) || null;
      review.product.name  = review.product.name  || pickFirstString(matchedItem.product_name, matchedItem.name) || null;
      review.product.brand = review.product.brand || pickFirstString(matchedItem.brand, matchedItem.product_brand) || null;
      review.product.image = review.product.image || pickFirstString(matchedItem.image, matchedItem.image_url, matchedItem.product_image) || null;
    }

    const productRow = review.product.slug ? productsBySlug.get(review.product.slug) || null : null;
    if (productRow) {
      review.product.name  = review.product.name  || pickFirstString(productRow.name) || null;
      review.product.brand = review.product.brand || pickFirstString(productRow.brand) || null;
      review.product.image = review.product.image || pickFirstString(productRow.image_url, productRow.image) || null;
      review.product.url   = review.product.url   || `/products/${pickFirstString(productRow.slug, review.product.slug)}.html`;
    } else if (review.product.slug && !review.product.url) {
      review.product.url = `/products/${review.product.slug}.html`;
    }

    if (orderRow) {
      review.order.id       = review.order.id     || String(orderRow.id);
      review.order.number   = review.order.number || pickFirstString(orderRow.order_number, orderRow.id) || null;
      review.order.status   = review.order.status || pickFirstString(orderRow.status) || null;
      review.order.created_at = review.order.created_at || orderRow.created_at || null;
    }

    const tableImages = imageResult.byReviewId.get(review.id) || [];
    const merged = [...tableImages, ...(review.images || [])]
      .map((img) => ({ ...img, status: normalizeStatus(img.status, img.is_approved, img.approved) || review.status }))
      .sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));

    review.images       = dedupeImages(merged);
    review.image_summary = countImageStatuses(review.images);
  }

  return { reviews, imageTables: imageResult.tables };
}

async function loadReviewImages(context, reviewTable, reviewIds) {
  const byReviewId = new Map();
  const tables     = [];

  for (const table of IMAGE_TABLES[reviewTable] || []) {
    const rows = await safeSelect(context, table, {
      select:    '*',
      review_id: `in.${formatInFilter(reviewIds)}`,
      order:     'created_at.asc',
    }, true);
    if (rows === null) continue;

    tables.push(table);
    for (const row of rows || []) {
      const reviewId = pickFirstString(row.review_id);
      const url      = pickFirstString(row.public_url, row.image_url, row.url, row.href);
      if (!reviewId || !url) continue;
      const list = byReviewId.get(reviewId) || [];
      list.push({
        id:           String(row.id),
        url,
        status:       normalizeStatus(row.status, row.is_approved, row.approved),
        created_at:   row.created_at || null,
        width:        row.width  || null,
        height:       row.height || null,
        source:       'table',
        table,
        storage_path: pickFirstString(row.storage_path) || null,
      });
      byReviewId.set(reviewId, list);
    }
  }
  return { byReviewId, tables };
}

async function updateReviewStatus(context, reviewId, sourceHint, status) {
  const target  = await resolveReviewRecord(context, reviewId, sourceHint);
  const payload = buildReviewStatusPayload(target.row, status);
  await patchRows(context, target.table, { id: reviewId }, payload);
  const review  = normalizeReview({ ...target.row, ...payload, id: reviewId }, target.table);
  return { status, review };
}

async function patchProductReviewStatus(context, reviewId, status) {
  const target  = await resolveProductReview(context, reviewId);
  const payload = buildProductReviewStatusPayload(target.row, status);
  await patchRows(context, 'product_reviews', { id: reviewId }, payload);
  return normalizeReview({ ...target.row, ...payload, id: reviewId }, 'product_reviews');
}

async function deleteProductReview(context, reviewId) {
  const target = await resolveProductReview(context, reviewId);
  await deleteRows(context, 'product_reviews', { id: reviewId });
  return normalizeReview(target.row, 'product_reviews');
}

async function updateReviewImageStatus(context, reviewId, imageId, status, body) {
  const reviewTarget = await resolveReviewRecord(context, reviewId,
    normalizeReviewTable(body?.review_source_table || body?.source_table));

  if (body?.source === 'inline') {
    const field = pickFirstString(body.field) || parseInlineImageId(imageId)?.field;
    const index = Number.isFinite(Number(body.index)) ? Number(body.index) : parseInlineImageId(imageId)?.index;
    if (!field || typeof index !== 'number') throw new Error('Inline görsel bilgisi eksik.');
    const nextValue = mutateInlineImageValue(reviewTarget.row[field], index, status, false);
    const payload   = withUpdatedAt(reviewTarget.row, { [field]: nextValue });
    await patchRows(context, reviewTarget.table, { id: reviewId }, payload);
    return { status, image: { id: imageId, status, source: 'inline', field, index } };
  }

  const table = normalizeImageTable(body?.table, reviewTarget.table);
  if (!table) throw new Error('Görsel tablosu belirlenemedi.');
  await patchRows(context, table, { id: imageId }, withUpdatedAt({}, { status }));
  return { status, image: { id: imageId, status, table, source: 'table' } };
}

async function deleteReviewImage(context, reviewId, imageId, body) {
  const reviewTarget = await resolveReviewRecord(context, reviewId,
    normalizeReviewTable(body?.review_source_table || body?.source_table));

  if (body?.source === 'inline') {
    const field = pickFirstString(body.field) || parseInlineImageId(imageId)?.field;
    const index = Number.isFinite(Number(body.index)) ? Number(body.index) : parseInlineImageId(imageId)?.index;
    if (!field || typeof index !== 'number') throw new Error('Inline görsel bilgisi eksik.');
    const nextValue = mutateInlineImageValue(reviewTarget.row[field], index, 'rejected', true);
    const payload   = withUpdatedAt(reviewTarget.row, { [field]: nextValue });
    await patchRows(context, reviewTarget.table, { id: reviewId }, payload);
    return;
  }

  const table = normalizeImageTable(body?.table, reviewTarget.table);
  if (!table) throw new Error('Görsel tablosu belirlenemedi.');
  await deleteRows(context, table, { id: imageId });
}

async function resolveReviewRecord(context, reviewId, sourceHint) {
  const candidates = sourceHint ? [sourceHint, ...REVIEW_TABLES] : [...REVIEW_TABLES];
  for (const table of unique(candidates)) {
    const rows = await safeSelect(context, table, { select: '*', id: `eq.${reviewId}` }, true);
    if (rows && rows[0]) return { table, row: rows[0] };
  }
  throw new Error('Yorum bulunamadı.');
}

async function resolveProductReview(context, reviewId) {
  const rows = await safeSelect(context, 'product_reviews', { select: '*', id: `eq.${reviewId}` }, false);
  if (rows && rows[0]) return { table: 'product_reviews', row: rows[0] };
  throw new Error('Yorum bulunamadı.');
}

/* ════════════════════════════════════════════════════════════ */
/* BODY PARSING (JSON + multipart/form-data)                   */
/* ════════════════════════════════════════════════════════════ */

async function parseBody(request) {
  const ct = request.headers.get('content-type') || '';

  if (ct.includes('multipart/form-data')) {
    try {
      const fd  = await request.formData();
      const out = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v === 'string') out[k] = v;
        /* File entries are skipped here — handled separately in handleImageUpload */
      }
      return out;
    } catch { return {}; }
  }

  if (ct.includes('application/json')) {
    try { return await request.json(); }
    catch { return {}; }
  }

  /* Try JSON first, then form-encoded */
  try {
    const text = await request.text();
    try { return JSON.parse(text); }
    catch {
      const out = {};
      for (const [k, v] of new URLSearchParams(text)) out[k] = v;
      return out;
    }
  } catch { return {}; }
}

/* ════════════════════════════════════════════════════════════ */
/* SUPABASE HELPERS                                             */
/* ════════════════════════════════════════════════════════════ */

function getSupabaseConfig(context) {
  const url = String(context.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.');
  return { url, key };
}

async function safeSelect(context, table, params, allowMissing = true) {
  try { return await selectRows(context, table, params); }
  catch (e) {
    if (allowMissing && isMissingRelationError(e)) return null;
    throw e;
  }
}

async function selectRows(context, table, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  });
  return supabaseFetch(context, `/rest/v1/${table}?${q.toString()}`, { method: 'GET' });
}

async function insertRow(context, table, payload) {
  const { url, key } = getSupabaseConfig(context);
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      apikey:          key,
      Authorization:   `Bearer ${key}`,
      'Content-Type':  'application/json',
      Prefer:          'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const msg = data?.message || data?.error_description || data?.error || `Supabase hata: ${res.status}`;
    throw new Error(msg);
  }
  return Array.isArray(data) ? data[0] : data;
}

async function patchRows(context, table, filters, payload) {
  const q = new URLSearchParams();
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, `eq.${v}`);
  });
  await supabaseFetch(context, `/rest/v1/${table}?${q.toString()}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body:    JSON.stringify(payload),
  });
}

async function deleteRows(context, table, filters, allowMissing = false) {
  const q = new URLSearchParams();
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, `eq.${v}`);
  });
  try {
    await supabaseFetch(context, `/rest/v1/${table}?${q.toString()}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
  } catch (e) {
    if (allowMissing && isMissingRelationError(e)) return;
    throw e;
  }
}

async function supabaseFetch(context, path, options = {}) {
  const { url, key } = getSupabaseConfig(context);
  const res = await fetch(`${url}${path}`, {
    method:  options.method || 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...options.headers },
    body:    options.body,
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const msg = data?.message || data?.error_description || data?.error || data?.hint || `Supabase hata kodu: ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function isMissingRelationError(e) {
  const m = String(e?.message || '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table') ||
         m.includes('relation') || m.includes('schema cache');
}

/* ════════════════════════════════════════════════════════════ */
/* UTILITY                                                      */
/* ════════════════════════════════════════════════════════════ */

function clean(value, max) {
  if (value == null) return '';
  return String(value).replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, max || 9999);
}

function extractInlineImages(row, fallbackStatus) {
  const images = [];
  for (const field of INLINE_IMAGE_FIELDS) {
    if (!(field in row) || row[field] === null || row[field] === undefined || row[field] === '') continue;
    flattenImageCandidates(row[field]).forEach((item, index) => {
      const url = pickFirstString(item.url, item.public_url, item.image_url, item.src, item.href);
      if (!url) return;
      images.push({
        id:         createInlineImageId(field, index),
        url,
        status:     normalizeStatus(item.status, item.is_approved, item.approved) || fallbackStatus,
        created_at: item.created_at || row.created_at || null,
        source: 'inline', field, index,
      });
    });
  }
  return dedupeImages(images);
}

function flattenImageCandidates(value) {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(flattenImageCandidates);
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try { return flattenImageCandidates(JSON.parse(t)); } catch {}
    }
    if (t.includes(',')) return t.split(',').map((p) => p.trim()).filter(Boolean).map((url) => ({ url }));
    return [{ url: t }];
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.images)) return flattenImageCandidates(value.images);
    if (Array.isArray(value.urls))   return flattenImageCandidates(value.urls);
    if (Array.isArray(value.items))  return flattenImageCandidates(value.items);
    return [value];
  }
  return [];
}

function mutateInlineImageValue(rawValue, targetIndex, status, removeItem) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item, i) => mutateInlineItem(item, i, targetIndex, status, removeItem))
      .filter((v) => v !== undefined);
  }
  if (typeof rawValue === 'string') {
    const t = rawValue.trim();
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try {
        const parsed  = JSON.parse(t);
        const mutated = mutateInlineImageValue(parsed, targetIndex, status, removeItem);
        return JSON.stringify(mutated);
      } catch {}
    }
    if (t.includes(',')) {
      return t.split(',').map((p) => p.trim())
        .map((item, i) => mutateInlineItem(item, i, targetIndex, status, removeItem))
        .filter((v) => v !== undefined).join(', ');
    }
    if (targetIndex === 0 && removeItem) return '';
    return rawValue;
  }
  if (rawValue && typeof rawValue === 'object') return mutateInlineItem(rawValue, 0, targetIndex, status, removeItem);
  return rawValue;
}

function mutateInlineItem(item, index, targetIndex, status, removeItem) {
  if (index !== targetIndex) return item;
  if (removeItem) return undefined;
  if (status === 'rejected') {
    if (typeof item === 'string') return undefined;
    if (item && typeof item === 'object' && !Array.isArray(item)) return { ...item, status: 'rejected' };
    return undefined;
  }
  if (item && typeof item === 'object' && !Array.isArray(item)) return { ...item, status };
  return item;
}

function buildReviewStatusPayload(row, status) {
  const p = {};
  if ('status'      in row || row.status      !== undefined) p.status      = status;
  if ('is_approved' in row || row.is_approved !== undefined) p.is_approved = status === 'approved';
  if ('approved'    in row || row.approved    !== undefined) p.approved    = status === 'approved';
  return withUpdatedAt(row, p);
}

function buildProductReviewStatusPayload(row, status) {
  const p = { status };
  if ('is_approved' in row || row.is_approved !== undefined) p.is_approved = status === 'approved';
  if ('approved'    in row || row.approved    !== undefined) p.approved    = status === 'approved';
  return withUpdatedAt(row, p);
}

function withUpdatedAt(row, payload) {
  if (!row || row.updated_at === undefined) return payload;
  if (typeof row.updated_at === 'number') return { ...payload, updated_at: Date.now() };
  return { ...payload, updated_at: new Date().toISOString() };
}

function normalizeRequestedStatus(value) {
  if (!value) return '';
  return STATUS_ALIASES[String(value).trim().toLowerCase()] || '';
}

function normalizeStatus(status, isApproved, approved) {
  const v = String(status || '').trim().toLowerCase();
  if (v === 'approved' || v === 'pending' || v === 'rejected') return v;
  if (typeof isApproved === 'boolean') return isApproved ? 'approved' : 'pending';
  if (typeof approved   === 'boolean') return approved   ? 'approved' : 'pending';
  return 'pending';
}

function clampRating(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0;
}

function countReviewStatuses(reviews) {
  const c = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const r of reviews) { c.total += 1; if (c[r.status] !== undefined) c[r.status] += 1; }
  return c;
}

function countImageStatuses(images) {
  const c = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const img of images || []) { c.total += 1; if (c[img.status] !== undefined) c[img.status] += 1; }
  return c;
}

function buildRatingSummary(reviews) {
  const ratings = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0, sum = 0;
  for (const r of reviews || []) {
    const n = clampRating(r.rating);
    if (!n) continue;
    ratings[n] += 1; total += 1; sum += n;
  }
  return {
    approved_count: total,
    avg_rating:     total ? Number((sum / total).toFixed(1)) : 0,
    five_star:  ratings[5], four_star: ratings[4], three_star: ratings[3],
    two_star:   ratings[2], one_star:  ratings[1],
  };
}

function filterPublicReviewImages(review) {
  return { ...review, images: (review.images || []).filter((img) => img.status === 'approved') };
}

function buildSearchText(review) {
  return normalizeText([
    review.product.name, review.product.slug, review.product.id, review.product.brand,
    review.user.id, review.user.name, review.user.email,
    review.order.id, review.order.number, review.title, review.body,
  ].filter(Boolean).join(' '));
}

function matchOrderItem(items, review, slugMap) {
  if (!items.length) return null;
  const rSlug = normalizeText(review.product.slug);
  const rId   = normalizeText(review.product.id);
  const rName = normalizeText(review.product.name);
  for (const item of items) {
    const iSlug = normalizeText(pickFirstString(item.product_slug) || slugMap.get(pickFirstString(item.product_id)));
    const iId   = normalizeText(pickFirstString(item.product_id, item.product_slug));
    const iName = normalizeText(pickFirstString(item.product_name, item.name));
    if (rSlug && iSlug && rSlug === iSlug) return item;
    if (rId   && iId   && rId   === iId)   return item;
    if (rName && iName && rName === iName) return item;
  }
  return items[0] || null;
}

function dedupeImages(images) {
  const seen = new Set();
  return (images || []).filter((img) => {
    const k = `${img.source || 'u'}:${img.table || img.field || ''}:${img.id || img.url}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function normalizeReviewTable(value) { return REVIEW_TABLES.includes(value) ? value : ''; }
function normalizeImageTable(value, reviewTable) {
  const candidates = IMAGE_TABLES[reviewTable] || [];
  return candidates.includes(value) ? value : candidates[0] || '';
}

function createInlineImageId(field, index) { return `inline--${field}--${index}`; }
function parseInlineImageId(value) {
  const m = String(value || '').match(/^inline--([a-z_]+)--(\d+)$/i);
  return m ? { field: m[1], index: Number(m[2]) } : null;
}

function getRouteSegments(pathname) {
  const marker = '/api/reviews';
  const idx    = pathname.indexOf(marker);
  const suffix = idx === -1 ? pathname : pathname.slice(idx + marker.length);
  return suffix.split('/').map(decodeURIComponent).filter(Boolean);
}

function requireAdmin(request, env) {
  const provided = request.headers.get(ADMIN_TOKEN_HEADER);
  const expected = env.ADMIN_TOKEN;
  if (!provided || !expected || provided !== expected) {
    throw new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status:  401,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

function reply(payload, status = 200, extraHeaders = {}) {
  const headers = { ...corsHeaders(), ...extraHeaders };
  if (payload === null) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(payload), { status, headers });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, x-admin-token',
    'Access-Control-Max-Age':       '86400',
  };
}

async function readJson(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return {};
  try { return await request.json(); } catch { return {}; }
}

function formatInFilter(values) {
  return `(${values.map(formatFilterValue).join(',')})`;
}
function formatFilterValue(v) {
  if (typeof v === 'number')  return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseDate(value) {
  if (typeof value === 'number') return value;
  const p = Date.parse(String(value || ''));
  return Number.isFinite(p) ? p : 0;
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function pickFirstString(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const t = String(v).trim();
    if (t) return t;
  }
  return '';
}

function unique(values)   { return [...new Set(values)]; }
function uniqueById(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const id = pickFirstString(row?.id);
    if (!id || m.has(id)) continue;
    m.set(id, row);
  }
  return [...m.values()];
}
