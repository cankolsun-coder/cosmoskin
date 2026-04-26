import { json } from '../_lib/response.js';
import { getUserFromAccessToken } from '../_lib/supabase.js';
import {
  getCatalogProductByHandle,
  getCatalogProductByName,
  resolveCatalogProduct
} from '../_lib/catalog.js';

const REVIEW_SELECT =
  'id,product_slug,user_id,user_display_name,user_email,title,body,rating,helpful_count,approved,is_edited,created_at,updated_at';
const REVIEW_SELECT_WITH_IMAGES =
  `${REVIEW_SELECT},review_images(id,public_url,status,width,height,created_at)`;

function getSupabaseConfig(context) {
  const env = context?.env || {};
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase yapılandırması eksik.');
  }
  return { url, serviceRoleKey };
}

async function supabaseRequest(context, path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig(context);
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...options.headers
  };

  const response = await fetch(`${url}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error_description ||
      data?.error ||
      data?.hint ||
      `Supabase hata kodu: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function selectRows(context, table, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  });
  return await supabaseRequest(context, `/rest/v1/${table}?${qs.toString()}`);
}

async function insertRows(context, table, rows, prefer = 'return=representation') {
  return await supabaseRequest(context, `/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(rows)
  });
}

async function insertRow(context, table, payload) {
  const data = await insertRows(context, table, [payload], 'return=representation');
  return Array.isArray(data) ? data[0] || null : data;
}

async function updateRows(context, table, filters, payload, prefer = 'return=representation') {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, `eq.${value}`);
  });
  return await supabaseRequest(context, `/rest/v1/${table}?${qs.toString()}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(payload)
  });
}

async function deleteRows(context, table, filters) {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, `eq.${value}`);
  });
  await supabaseRequest(context, `/rest/v1/${table}?${qs.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR');
}

function getPathParts(requestUrl) {
  const pathname = new URL(requestUrl).pathname.replace(/^\/api\/reviews\/?/, '');
  return pathname ? pathname.split('/').filter(Boolean) : [];
}

function methodNotAllowed(methods) {
  return json(
    { ok: false, code: 'method_not_allowed', error: 'İstek yöntemi desteklenmiyor.' },
    { status: 405, headers: { Allow: methods.join(', ') } }
  );
}

function validationError(message, code = 'validation_error', status = 400) {
  return json({ ok: false, code, error: message }, { status });
}

function resolveProduct(reference) {
  if (!reference) return null;
  if (typeof reference === 'object') {
    return (
      resolveCatalogProduct(reference.product_slug || reference.product_id || reference.product || '') ||
      getCatalogProductByName(reference.product_name || '')
    );
  }
  return resolveCatalogProduct(reference);
}

function mapImage(image) {
  return {
    id: image.id,
    url: image.public_url,
    public_url: image.public_url,
    status: image.status || 'pending',
    width: image.width || null,
    height: image.height || null,
    created_at: image.created_at || null,
    source: 'review_images',
    table: 'review_images',
    field: 'public_url',
    index: 0
  };
}

function reviewStatus(review) {
  return review?.approved ? 'approved' : 'pending';
}

function mapReview(review, options = {}) {
  const product =
    options.product ||
    getCatalogProductByHandle(review?.product_slug || '') ||
    getCatalogProductByName(review?.product_name || '') ||
    null;
  const productSlug = product?.slug || review?.product_slug || '';
  const productUrl = product?.url || (productSlug ? `/products/${productSlug}.html` : '');
  const rawImages = Array.isArray(review?.review_images) ? review.review_images : [];
  const images = rawImages
    .filter((image) => !options.publicOnly || image.status === 'approved')
    .map(mapImage);

  return {
    id: review.id,
    title: review.title || '',
    body: review.body || '',
    rating: Number(review.rating || 0),
    helpful_count: Number(review.helpful_count || 0),
    approved: !!review.approved,
    status: options.status || reviewStatus(review),
    is_edited: !!review.is_edited,
    created_at: review.created_at || null,
    updated_at: review.updated_at || null,
    product_slug: productSlug,
    user_id: review.user_id || '',
    user_display_name: review.user_display_name || 'Dogrulanmis Musteri',
    user_email: options.hideEmail ? '' : (review.user_email || ''),
    product: {
      id: product?.id || productSlug,
      slug: productSlug,
      name: product?.name || '',
      brand: product?.brand || '',
      image: product?.image || '',
      url: productUrl
    },
    user: {
      id: review.user_id || '',
      name: review.user_display_name || 'Dogrulanmis Musteri',
      email: options.hideEmail ? '' : (review.user_email || '')
    },
    order: {
      id: '',
      number: '',
      status: '',
      created_at: ''
    },
    source_table: 'reviews',
    review_images: images,
    images
  };
}

function buildSummary(reviews = []) {
  const approved = (reviews || []).filter((review) => review.approved);
  const count = approved.length;
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  approved.forEach((review) => {
    const rating = Number(review.rating || 0);
    if (stars[rating] != null) stars[rating] += 1;
  });

  const avg = count
    ? Math.round((approved.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count) * 10) / 10
    : 0;

  return {
    avg_rating: avg,
    approved_count: count,
    total_count: count,
    five_star: stars[5],
    four_star: stars[4],
    three_star: stars[3],
    two_star: stars[2],
    one_star: stars[1]
  };
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Gecersiz istek govdesi.');
  }
}

async function getUserFromRequest(context) {
  const authHeader = context.request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { token: '', user: null };
  try {
    const user = await getUserFromAccessToken(context, token);
    return { token, user: user || null };
  } catch {
    return { token, user: null };
  }
}

async function requireUser(context) {
  const { user } = await getUserFromRequest(context);
  if (!user) {
    return { ok: false, response: json({ ok: false, error: 'Oturum gerekli.' }, { status: 401 }) };
  }
  return { ok: true, user };
}

function requireAdmin(context) {
  const expected = String(context.env.ADMIN_TOKEN || '');
  if (!expected) {
    return json({ ok: false, error: 'Admin token tanimli degil.' }, { status: 503 });
  }
  const received = String(context.request.headers.get('X-Admin-Token') || '').trim();
  if (!received || received !== expected) {
    return json({ ok: false, error: 'Token gecersiz veya eksik.' }, { status: 401 });
  }
  return null;
}

function buildDisplayName(user) {
  const firstName = String(user?.user_metadata?.first_name || '').trim();
  const lastName = String(user?.user_metadata?.last_name || '').trim();
  return [firstName, lastName].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Kullanici';
}

function sanitizeReviewPayload(payload = {}) {
  const title = String(payload.title || '').trim();
  const body = String(payload.review_body || payload.body || '').trim();
  const rating = Number(payload.rating || 0);
  const product =
    resolveProduct(payload.product_slug || payload.product_id || payload.product || '') ||
    resolveProduct(payload);

  return { title, body, rating, product, images: sanitizeImages(payload.images) };
}

function validateReviewPayload(payload = {}) {
  if (!payload.product?.slug) return 'Gecerli bir urun bulunamadi.';
  if (!payload.title || payload.title.length < 3 || payload.title.length > 100) {
    return 'Baslik 3 ile 100 karakter arasinda olmali.';
  }
  if (!payload.body || payload.body.length < 10 || payload.body.length > 2000) {
    return 'Yorum 10 ile 2000 karakter arasinda olmali.';
  }
  if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) {
    return 'Puan 1 ile 5 arasinda olmali.';
  }
  return '';
}

function sanitizeImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .map((image) => ({
      storage_path: String(image?.storagePath || image?.storage_path || '').trim(),
      public_url: String(image?.publicUrl || image?.public_url || '').trim(),
      width: image?.width ? Number(image.width) : null,
      height: image?.height ? Number(image.height) : null
    }))
    .filter((image) => image.storage_path && image.public_url);
}

async function insertReviewImages(context, reviewId, images = []) {
  const rows = sanitizeImages(images).map((image) => ({
    review_id: reviewId,
    storage_path: image.storage_path,
    public_url: image.public_url,
    status: 'pending',
    width: Number.isFinite(image.width) ? image.width : null,
    height: Number.isFinite(image.height) ? image.height : null
  }));

  if (!rows.length) return [];
  const inserted = await insertRows(context, 'review_images', rows, 'return=representation');
  return Array.isArray(inserted) ? inserted : [];
}

async function getReviewById(context, reviewId) {
  const rows = await selectRows(context, 'reviews', {
    select: REVIEW_SELECT_WITH_IMAGES,
    id: `eq.${reviewId}`,
    limit: '1'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function hasPurchasedProduct(context, userId, product) {
  const orders = await selectRows(context, 'orders', {
    select: 'id',
    user_id: `eq.${userId}`,
    status: 'in.(paid,confirmed)',
    limit: '200'
  });

  const orderIds = (orders || []).map((order) => order.id).filter(Boolean);
  if (!orderIds.length) return false;

  const items = await selectRows(context, 'order_items', {
    select: 'product_id,product_slug,product_name',
    order_id: `in.(${orderIds.join(',')})`
  });

  const targetName = normalizeText(product.name);

  return (items || []).some((item) => {
    const resolved =
      getCatalogProductByHandle(item.product_slug || item.product_id || '') ||
      getCatalogProductByName(item.product_name || '');
    const resolvedSlug = resolved?.slug || item.product_slug || item.product_id || '';
    return resolvedSlug === product.slug || normalizeText(item.product_name) === targetName;
  });
}

async function handlePublicList(context) {
  const { user } = await getUserFromRequest(context);
  const url = new URL(context.request.url);
  const product =
    resolveProduct(url.searchParams.get('product_slug') || url.searchParams.get('product_id') || url.searchParams.get('product') || '') ||
    resolveProduct({ product_name: url.searchParams.get('product_name') || '' });

  if (!product?.slug) {
    return validationError('Gecerli bir urun secin.', 'invalid_product');
  }

  const rows = await selectRows(context, 'reviews', {
    select: REVIEW_SELECT_WITH_IMAGES,
    product_slug: `eq.${product.slug}`,
    approved: 'eq.true',
    order: 'created_at.desc'
  });

  const approvedReviews = (rows || []).map((review) => mapReview(review, {
    product,
    publicOnly: true,
    hideEmail: true
  }));
  let userReview = null;
  let helpfulIds = [];

  if (user?.id) {
    const ownRows = await selectRows(context, 'reviews', {
      select: REVIEW_SELECT_WITH_IMAGES,
      product_slug: `eq.${product.slug}`,
      user_id: `eq.${user.id}`,
      limit: '1'
    });
    if (Array.isArray(ownRows) && ownRows[0]) {
      userReview = mapReview(ownRows[0], { product });
    }

    const reviewIds = approvedReviews.map((review) => review.id).filter(Boolean);
    if (reviewIds.length) {
      const helpfulRows = await selectRows(context, 'review_helpful', {
        select: 'review_id',
        user_id: `eq.${user.id}`,
        review_id: `in.(${reviewIds.join(',')})`
      });
      helpfulIds = (helpfulRows || []).map((row) => row.review_id).filter(Boolean);
    }
  }

  return json({
    ok: true,
    product_slug: product.slug,
    summary: buildSummary(rows || []),
    reviews: approvedReviews,
    user_review: userReview,
    helpful_ids: helpfulIds
  });
}

async function handleCreateReview(context) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  let payload;
  try {
    payload = sanitizeReviewPayload(await parseJsonBody(context.request));
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const validationMessage = validateReviewPayload(payload);
  if (validationMessage) return validationError(validationMessage);

  const purchased = await hasPurchasedProduct(context, required.user.id, payload.product);
  if (!purchased) {
    return json(
      { ok: false, code: 'purchase_required', error: 'Yalnizca satin alinan urunler icin yorum yazilabilir.' },
      { status: 403 }
    );
  }

  const existing = await selectRows(context, 'reviews', {
    select: 'id',
    product_slug: `eq.${payload.product.slug}`,
    user_id: `eq.${required.user.id}`,
    limit: '1'
  });

  if (Array.isArray(existing) && existing[0]?.id) {
    return json(
      { ok: false, code: 'duplicate_review', error: 'Bu urun icin zaten bir yorum yazdiniz.' },
      { status: 409 }
    );
  }

  const row = await insertRow(context, 'reviews', {
    product_slug: payload.product.slug,
    user_id: required.user.id,
    user_display_name: buildDisplayName(required.user),
    user_email: required.user.email || '',
    title: payload.title,
    body: payload.body,
    rating: payload.rating,
    approved: false,
    is_edited: false
  });

  const createdImages = await insertReviewImages(context, row.id, payload.images);
  const mappedReview = mapReview({ ...row, review_images: createdImages }, { product: payload.product });

  return json({
    ok: true,
    review_id: row.id,
    review: mappedReview
  });
}

async function handleUpdateReview(context, reviewId) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  const existing = await getReviewById(context, reviewId);
  if (!existing || existing.user_id !== required.user.id) {
    return json({ ok: false, error: 'Yorum bulunamadi.' }, { status: 404 });
  }

  let payload;
  try {
    payload = sanitizeReviewPayload(await parseJsonBody(context.request));
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  payload.product = payload.product || resolveProduct(existing.product_slug);
  const validationMessage = validateReviewPayload(payload);
  if (validationMessage) return validationError(validationMessage);

  await updateRows(context, 'reviews', { id: reviewId, user_id: required.user.id }, {
    title: payload.title,
    body: payload.body,
    rating: payload.rating,
    approved: false,
    is_edited: true
  }, 'return=minimal');

  const newImages = await insertReviewImages(context, reviewId, payload.images);
  const refreshed = await getReviewById(context, reviewId);
  return json({
    ok: true,
    review_id: reviewId,
    review: mapReview(
      {
        ...refreshed,
        review_images: Array.isArray(refreshed?.review_images)
          ? refreshed.review_images
          : [...(Array.isArray(existing.review_images) ? existing.review_images : []), ...newImages]
      },
      { product: payload.product || resolveProduct(existing.product_slug) }
    )
  });
}

async function handleCreateImages(context) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const reviewId = String(payload.review_id || '').trim();
  if (!reviewId) return validationError('Yorum kimligi gerekli.', 'missing_review_id');

  const review = await getReviewById(context, reviewId);
  if (!review || review.user_id !== required.user.id) {
    return json({ ok: false, error: 'Yorum bulunamadi.' }, { status: 404 });
  }

  const inserted = await insertReviewImages(context, reviewId, payload.images);
  return json({
    ok: true,
    review_id: reviewId,
    images: inserted.map(mapImage)
  });
}

async function handleHelpful(context) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const reviewId = String(payload.review_id || '').trim();
  const action = String(payload.action || 'add').trim().toLowerCase();
  if (!reviewId) return validationError('Yorum kimligi gerekli.', 'missing_review_id');

  if (action === 'remove') {
    await deleteRows(context, 'review_helpful', {
      review_id: reviewId,
      user_id: required.user.id
    });
    return json({ ok: true, action: 'remove' });
  }

  try {
    await insertRow(context, 'review_helpful', {
      review_id: reviewId,
      user_id: required.user.id
    });
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (!message.includes('duplicate') && !message.includes('unique')) throw error;
  }

  return json({ ok: true, action: 'add' });
}

async function handleAdminList(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const rows = await selectRows(context, 'reviews', {
    select: REVIEW_SELECT_WITH_IMAGES,
    order: 'created_at.desc'
  });

  return json({
    ok: true,
    reviews: (rows || []).map((review) => mapReview(review))
  });
}

async function handleAdminReviewUpdate(context, reviewId) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const nextStatus = String(payload.status || '').trim().toLowerCase();
  if (!['approved', 'pending', 'rejected'].includes(nextStatus)) {
    return validationError('Gecersiz moderasyon durumu.', 'invalid_status');
  }

  const existing = await getReviewById(context, reviewId);
  if (!existing) {
    return json({ ok: false, error: 'Yorum bulunamadi.' }, { status: 404 });
  }

  if (nextStatus === 'rejected') {
    await deleteRows(context, 'reviews', { id: reviewId });
    return json({
      ok: true,
      deleted: true,
      review: mapReview(existing, { status: 'rejected' })
    });
  }

  await updateRows(context, 'reviews', { id: reviewId }, {
    approved: nextStatus === 'approved'
  }, 'return=minimal');

  const refreshed = await getReviewById(context, reviewId);
  return json({
    ok: true,
    review: mapReview(refreshed)
  });
}

async function handleAdminReviewDelete(context, reviewId) {
  const authError = requireAdmin(context);
  if (authError) return authError;
  await deleteRows(context, 'reviews', { id: reviewId });
  return json({ ok: true, deleted: true });
}

async function handleAdminImageUpdate(context, reviewId, imageId) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const nextStatus = String(payload.status || '').trim().toLowerCase();
  if (!['approved', 'pending', 'rejected'].includes(nextStatus)) {
    return validationError('Gecersiz gorsel durumu.', 'invalid_status');
  }

  await updateRows(context, 'review_images', { id: imageId, review_id: reviewId }, {
    status: nextStatus
  }, 'return=minimal');

  const rows = await selectRows(context, 'review_images', {
    select: 'id,public_url,status,width,height,created_at',
    id: `eq.${imageId}`,
    review_id: `eq.${reviewId}`,
    limit: '1'
  });

  return json({
    ok: true,
    image: rows?.[0] ? mapImage(rows[0]) : null
  });
}

async function handleAdminImageDelete(context, reviewId, imageId) {
  const authError = requireAdmin(context);
  if (authError) return authError;
  await deleteRows(context, 'review_images', { id: imageId, review_id: reviewId });
  return json({ ok: true, deleted: true });
}

export async function onRequest(context) {
  try {
    const parts = getPathParts(context.request.url);
    const method = context.request.method.toUpperCase();

    if (!parts.length) {
      if (method === 'GET') return await handlePublicList(context);
      if (method === 'POST') return await handleCreateReview(context);
      return methodNotAllowed(['GET', 'POST']);
    }

    if (parts[0] === 'images') {
      if (method === 'POST') return await handleCreateImages(context);
      return methodNotAllowed(['POST']);
    }

    if (parts[0] === 'helpful') {
      if (method === 'POST') return await handleHelpful(context);
      return methodNotAllowed(['POST']);
    }

    if (parts[0] === 'admin') {
      if (parts.length === 1) {
        if (method === 'GET') return await handleAdminList(context);
        return methodNotAllowed(['GET']);
      }

      if (parts.length === 2) {
        if (method === 'PATCH') return await handleAdminReviewUpdate(context, parts[1]);
        if (method === 'DELETE') return await handleAdminReviewDelete(context, parts[1]);
        return methodNotAllowed(['PATCH', 'DELETE']);
      }

      if (parts.length === 4 && parts[2] === 'images') {
        if (method === 'PATCH') return await handleAdminImageUpdate(context, parts[1], parts[3]);
        if (method === 'DELETE') return await handleAdminImageDelete(context, parts[1], parts[3]);
        return methodNotAllowed(['PATCH', 'DELETE']);
      }

      return json({ ok: false, error: 'Gecersiz admin endpointi.' }, { status: 404 });
    }

    if (parts.length === 1) {
      if (method === 'PATCH') return await handleUpdateReview(context, parts[0]);
      return methodNotAllowed(['PATCH']);
    }

    return json({ ok: false, error: 'Gecersiz review endpointi.' }, { status: 404 });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Review islemi basarisiz.' }, { status: 500 });
  }
}
