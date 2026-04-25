const ADMIN_TOKEN_HEADER = 'x-admin-token';
const REVIEW_TABLES = ['product_reviews', 'reviews'];
const IMAGE_TABLES = {
  product_reviews: ['product_review_images', 'review_images'],
  reviews: ['review_images', 'product_review_images'],
};
const INLINE_IMAGE_FIELDS = ['images', 'image_urls', 'photo_urls', 'media_urls', 'attachments'];
const STATUS_ALIASES = {
  approve: 'approved',
  approved: 'approved',
  reject: 'rejected',
  rejected: 'rejected',
  pending: 'pending',
};

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const route = getRouteSegments(url.pathname);

  if (request.method === 'OPTIONS') {
    return reply(null, 204);
  }

  try {
    if (route[0] === 'admin') {
      return await handleAdmin(context, route.slice(1), url);
    }

    if (request.method === 'GET') {
      return await handlePublicGet(context, url);
    }

    return reply({ ok: false, error: 'Method not allowed.' }, 405);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return reply(
      { ok: false, error: error?.message || 'Beklenmeyen bir hata oluştu.' },
      500,
      { 'Cache-Control': 'no-store' }
    );
  }
}

async function handleAdmin(context, route, url) {
  requireAdmin(context.request, context.env);

  if (route.length === 0) {
    if (context.request.method !== 'GET') {
      return reply({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const requestedStatus = normalizeRequestedStatus(url.searchParams.get('status'));
    const search = String(url.searchParams.get('search') || '').trim();
    const payload = await loadReviewBundle(context, {
      status: requestedStatus,
      search,
      includeRejectedImages: true,
    });

    return reply(
      {
        ok: true,
        reviews: payload.filtered,
        items: payload.filtered,
        counts: payload.counts,
        total: payload.filtered.length,
        meta: payload.meta,
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  }

  const reviewId = route[0];
  const second = route[1] || '';
  const third = route[2] || '';

  if (!reviewId) {
    return reply({ ok: false, error: 'Review id gerekli.' }, 400);
  }

  if (second === 'images') {
    return await handleAdminImageMutation(context, reviewId, route.slice(2));
  }

  if (context.request.method === 'DELETE' && route.length === 1) {
    const body = await readJson(context.request);
    const source = normalizeReviewTable(body?.source_table);
    await deleteReview(context, reviewId, source);
    return reply({ ok: true, deleted: true, id: reviewId }, 200, {
      'Cache-Control': 'no-store',
    });
  }

  if (
    (context.request.method === 'PATCH' || context.request.method === 'POST') &&
    route.length >= 1
  ) {
    const body = await readJson(context.request);
    const source = normalizeReviewTable(body?.source_table);
    const action = second || body?.action || body?.status;
    const status = normalizeRequestedStatus(action);
    if (!status) {
      return reply({ ok: false, error: 'Geçerli bir review aksiyonu gerekli.' }, 400);
    }

    const updated = await updateReviewStatus(context, reviewId, source, status);
    return reply(
      {
        ok: true,
        id: reviewId,
        status: updated.status,
        review: updated.review,
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  }

  return reply({ ok: false, error: 'Desteklenmeyen admin endpoint.' }, 404);
}

async function handleAdminImageMutation(context, reviewId, route) {
  const imageId = route[0];
  const action = route[1] || '';

  if (!imageId) {
    return reply({ ok: false, error: 'Image id gerekli.' }, 400);
  }

  const body = await readJson(context.request);
  const desiredStatus = normalizeRequestedStatus(action || body?.action || body?.status);

  if (context.request.method === 'DELETE') {
    await deleteReviewImage(context, reviewId, imageId, body);
    return reply({ ok: true, deleted: true, id: imageId }, 200, {
      'Cache-Control': 'no-store',
    });
  }

  if (context.request.method !== 'PATCH' && context.request.method !== 'POST') {
    return reply({ ok: false, error: 'Method not allowed.' }, 405);
  }

  if (!desiredStatus) {
    return reply({ ok: false, error: 'Geçerli bir görsel aksiyonu gerekli.' }, 400);
  }

  const updated = await updateReviewImageStatus(context, reviewId, imageId, desiredStatus, body);
  return reply(
    {
      ok: true,
      id: imageId,
      status: updated.status,
      image: updated.image,
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

async function handlePublicGet(context, url) {
  const productRef = pickFirstString(
    url.searchParams.get('product_slug'),
    url.searchParams.get('product'),
    url.searchParams.get('slug'),
    url.searchParams.get('product_id'),
    url.searchParams.get('id')
  );

  if (!productRef) {
    return reply(
      {
        ok: true,
        message: 'Reviews API çalışıyor.',
      },
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  }

  const payload = await loadReviewBundle(context, {
    status: 'approved',
    productRef,
    includeRejectedImages: false,
  });

  const publicReviews = payload.filtered.map((review) => ({
    id: review.id,
    user_id: review.user.id || null,
    user_display_name: review.user.name || review.user.email || 'Anonim',
    user_email: review.user.email || null,
    title: review.title,
    body: review.body,
    rating: review.rating,
    helpful_count: review.helpful_count || 0,
    created_at: review.created_at,
    product_slug: review.product.slug || null,
    product_id: review.product.id || null,
    product_name: review.product.name || null,
    product_brand: review.product.brand || null,
    product_image: review.product.image || null,
    review_images: (review.images || []).filter((image) => image.status === 'approved'),
  }));

  return reply(
    {
      ok: true,
      reviews: publicReviews,
      summary: buildRatingSummary(publicReviews),
      meta: payload.meta,
    },
    200,
    { 'Cache-Control': 'public, max-age=120' }
  );
}

async function loadReviewBundle(
  context,
  { status = '', search = '', productRef = '', includeRejectedImages = true } = {}
) {
  const source = await loadReviewSource(context);
  const baseReviews = (source.rows || []).map((row) => normalizeReview(row, source.table));
  const enriched = await enrichReviews(context, baseReviews, source.table);
  const allReviews = enriched.reviews;
  const counts = countReviewStatuses(allReviews);

  let filtered = [...allReviews];

  if (status && status !== 'all') {
    filtered = filtered.filter((review) => review.status === status);
  }

  if (productRef) {
    const term = normalizeText(productRef);
    filtered = filtered.filter((review) => {
      const slug = normalizeText(review.product.slug);
      const id = normalizeText(review.product.id);
      return slug === term || id === term;
    });
  }

  if (search) {
    const term = normalizeText(search);
    filtered = filtered.filter((review) => buildSearchText(review).includes(term));
  }

  filtered = filtered.map((review) =>
    includeRejectedImages ? review : filterPublicReviewImages(review)
  );

  return {
    all: allReviews,
    filtered,
    counts,
    meta: {
      review_table: source.table,
      image_tables: enriched.imageTables,
      total_reviews: allReviews.length,
      search_supported: true,
      image_support: {
        inline_fields: INLINE_IMAGE_FIELDS,
        separate_tables: IMAGE_TABLES[source.table] || [],
      },
    },
  };
}

async function loadReviewSource(context) {
  for (const table of REVIEW_TABLES) {
    const rows = await safeSelect(context, table, {
      select: '*',
      order: 'created_at.desc',
    });
    if (rows !== null) {
      return {
        table,
        rows: Array.isArray(rows) ? rows : [],
      };
    }
  }

  throw new Error('Review tablosu bulunamadı.');
}

function normalizeReview(row, table) {
  const status = normalizeStatus(row.status, row.is_approved, row.approved);
  const productSlug = pickFirstString(row.product_slug, row.slug);
  const productId = pickFirstString(
    row.product_id,
    row.catalog_id,
    row.item_id,
    row.sku,
    productSlug
  );
  const title = pickFirstString(row.title, row.review_title, row.headline, row.subject);
  const body = pickFirstString(
    row.body,
    row.comment,
    row.review_body,
    row.content,
    row.text,
    row.message
  );
  const userName = pickFirstString(
    row.user_display_name,
    row.user_name,
    row.name,
    row.author_name,
    row.customer_name
  );
  const userEmail = pickFirstString(row.user_email, row.email, row.customer_email);
  const userId = pickFirstString(row.user_id, row.customer_id, row.author_id);
  const orderId = pickFirstString(row.order_id, row.purchase_order_id, row.order_uuid);
  const orderNumber = pickFirstString(row.order_number, row.purchase_order_number);
  const inlineImages = extractInlineImages(row, status);

  return {
    id: String(row.id),
    source_table: table,
    status,
    rating: clampRating(row.rating || row.stars || row.score),
    title,
    body,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    helpful_count: Number(row.helpful_count || 0),
    user: {
      id: userId || null,
      name: userName || null,
      email: userEmail || null,
    },
    order: {
      id: orderId || null,
      number: orderNumber || null,
      status: pickFirstString(row.order_status) || null,
      created_at: row.order_created_at || null,
    },
    product: {
      id: productId || null,
      slug: productSlug || null,
      name: pickFirstString(row.product_name) || null,
      brand: pickFirstString(row.brand, row.product_brand) || null,
      image: pickFirstString(row.image, row.product_image, row.image_url) || null,
      url: pickFirstString(row.product_url, row.page_url) || null,
    },
    images: inlineImages,
  };
}

async function enrichReviews(context, reviews, reviewTable) {
  if (!reviews.length) {
    return { reviews: [], imageTables: [] };
  }

  const reviewIds = unique(reviews.map((review) => review.id));
  const productIds = unique(reviews.map((review) => review.product.id).filter(Boolean));
  const knownProductSlugs = unique(reviews.map((review) => review.product.slug).filter(Boolean));
  const explicitOrderIds = unique(reviews.map((review) => review.order.id).filter(Boolean));
  const userIds = unique(reviews.map((review) => review.user.id).filter(Boolean));

  const [slugMapRows, explicitOrdersRows, userOrdersRows, imageResult] = await Promise.all([
    productIds.length
      ? safeSelect(context, 'product_id_to_slug', {
          select: '*',
          product_id: `in.${formatInFilter(productIds)}`,
        })
      : Promise.resolve([]),
    explicitOrderIds.length
      ? safeSelect(context, 'orders', {
          select: '*',
          id: `in.${formatInFilter(explicitOrderIds)}`,
        })
      : Promise.resolve([]),
    userIds.length
      ? safeSelect(context, 'orders', {
          select: '*',
          user_id: `in.${formatInFilter(userIds)}`,
          order: 'created_at.desc',
        })
      : Promise.resolve([]),
    loadReviewImages(context, reviewTable, reviewIds),
  ]);

  const slugMap = new Map();
  for (const row of slugMapRows || []) {
    const productId = pickFirstString(row.product_id);
    const productSlug = pickFirstString(row.product_slug);
    if (productId && productSlug) {
      slugMap.set(productId, productSlug);
    }
  }

  for (const review of reviews) {
    if (!review.product.slug && review.product.id && slugMap.has(review.product.id)) {
      review.product.slug = slugMap.get(review.product.id);
    }
  }

  const allOrderRows = uniqueById([...(explicitOrdersRows || []), ...(userOrdersRows || [])]);
  const allOrderIds = unique(allOrderRows.map((row) => row.id).filter(Boolean));
  const productSlugs = unique(reviews.map((review) => review.product.slug).filter(Boolean));

  const [orderItemRows, productRows] = await Promise.all([
    allOrderIds.length
      ? safeSelect(context, 'order_items', {
          select: '*',
          order_id: `in.${formatInFilter(allOrderIds)}`,
        })
      : Promise.resolve([]),
    productSlugs.length
      ? safeSelect(context, 'products', {
          select: '*',
          slug: `in.${formatInFilter(productSlugs)}`,
        })
      : Promise.resolve([]),
  ]);

  const ordersById = new Map();
  const userOrdersByUserId = new Map();
  for (const row of allOrderRows) {
    ordersById.set(String(row.id), row);
    const userId = pickFirstString(row.user_id);
    if (!userId) continue;
    const list = userOrdersByUserId.get(userId) || [];
    list.push(row);
    userOrdersByUserId.set(userId, list);
  }

  for (const [userId, list] of userOrdersByUserId.entries()) {
    list.sort((left, right) => parseDate(right.created_at) - parseDate(left.created_at));
    userOrdersByUserId.set(userId, list);
  }

  const orderItemsByOrderId = new Map();
  for (const row of orderItemRows || []) {
    const orderId = String(row.order_id);
    const list = orderItemsByOrderId.get(orderId) || [];
    list.push(row);
    orderItemsByOrderId.set(orderId, list);
  }

  const productsBySlug = new Map();
  for (const row of productRows || []) {
    const slug = pickFirstString(row.slug);
    if (!slug) continue;
    productsBySlug.set(slug, row);
  }

  for (const review of reviews) {
    let orderRow = review.order.id ? ordersById.get(review.order.id) || null : null;
    let matchedItem = orderRow ? matchOrderItem(orderItemsByOrderId.get(String(orderRow.id)) || [], review, slugMap) : null;

    if (!matchedItem && review.user.id) {
      const candidates = userOrdersByUserId.get(review.user.id) || [];
      for (const candidate of candidates) {
        const candidateItems = orderItemsByOrderId.get(String(candidate.id)) || [];
        const item = matchOrderItem(candidateItems, review, slugMap);
        if (item) {
          orderRow = candidate;
          matchedItem = item;
          break;
        }
      }
    }

    if (matchedItem) {
      review.product.slug =
        review.product.slug ||
        pickFirstString(matchedItem.product_slug) ||
        slugMap.get(pickFirstString(matchedItem.product_id)) ||
        null;
      review.product.id =
        review.product.id ||
        pickFirstString(matchedItem.product_id, matchedItem.product_slug, review.product.slug) ||
        null;
      review.product.name =
        review.product.name || pickFirstString(matchedItem.product_name, matchedItem.name) || null;
      review.product.brand =
        review.product.brand || pickFirstString(matchedItem.brand, matchedItem.product_brand) || null;
      review.product.image =
        review.product.image ||
        pickFirstString(matchedItem.image, matchedItem.image_url, matchedItem.product_image) ||
        null;
    }

    const productRow = review.product.slug ? productsBySlug.get(review.product.slug) || null : null;
    if (productRow) {
      review.product.name = review.product.name || pickFirstString(productRow.name) || null;
      review.product.brand = review.product.brand || pickFirstString(productRow.brand) || null;
      review.product.image =
        review.product.image || pickFirstString(productRow.image_url, productRow.image) || null;
      review.product.url =
        review.product.url ||
        `/products/${pickFirstString(productRow.slug, review.product.slug)}.html`;
    } else if (review.product.slug && !review.product.url) {
      review.product.url = `/products/${review.product.slug}.html`;
    }

    if (orderRow) {
      review.order.id = review.order.id || String(orderRow.id);
      review.order.number =
        review.order.number || pickFirstString(orderRow.order_number, orderRow.id) || null;
      review.order.status = review.order.status || pickFirstString(orderRow.status) || null;
      review.order.created_at = review.order.created_at || orderRow.created_at || null;
    }

    const tableImages = imageResult.byReviewId.get(review.id) || [];
    const mergedImages = [...tableImages, ...(review.images || [])]
      .map((image) => ({
        ...image,
        status: normalizeStatus(image.status, image.is_approved, image.approved) || review.status,
      }))
      .sort((left, right) => parseDate(left.created_at) - parseDate(right.created_at));

    review.images = dedupeImages(mergedImages);
    review.image_summary = countImageStatuses(review.images);
  }

  return {
    reviews,
    imageTables: imageResult.tables,
  };
}

async function loadReviewImages(context, reviewTable, reviewIds) {
  const byReviewId = new Map();
  const tables = [];

  for (const table of IMAGE_TABLES[reviewTable] || []) {
    const rows = await safeSelect(
      context,
      table,
      {
        select: '*',
        review_id: `in.${formatInFilter(reviewIds)}`,
        order: 'created_at.asc',
      },
      true
    );

    if (rows === null) {
      continue;
    }

    tables.push(table);
    for (const row of rows || []) {
      const reviewId = pickFirstString(row.review_id);
      const url = pickFirstString(row.public_url, row.image_url, row.url, row.href);
      if (!reviewId || !url) continue;

      const list = byReviewId.get(reviewId) || [];
      list.push({
        id: String(row.id),
        url,
        status: normalizeStatus(row.status, row.is_approved, row.approved),
        created_at: row.created_at || null,
        width: row.width || null,
        height: row.height || null,
        source: 'table',
        table,
        storage_path: pickFirstString(row.storage_path) || null,
      });
      byReviewId.set(reviewId, list);
    }
  }

  return { byReviewId, tables };
}

async function updateReviewStatus(context, reviewId, sourceHint, status) {
  const target = await resolveReviewRecord(context, reviewId, sourceHint);
  const payload = buildReviewStatusPayload(target.row, status);
  await patchRows(context, target.table, { id: reviewId }, payload);

  const review = normalizeReview({ ...target.row, ...payload, id: reviewId }, target.table);
  return { status, review };
}

async function deleteReview(context, reviewId, sourceHint) {
  const target = await resolveReviewRecord(context, reviewId, sourceHint);

  for (const table of IMAGE_TABLES[target.table] || []) {
    await deleteRows(context, table, { review_id: reviewId }, true);
  }

  await deleteRows(context, target.table, { id: reviewId });
}

async function updateReviewImageStatus(context, reviewId, imageId, status, body) {
  const reviewTarget = await resolveReviewRecord(
    context,
    reviewId,
    normalizeReviewTable(body?.review_source_table || body?.source_table)
  );

  if (body?.source === 'inline') {
    const field = pickFirstString(body.field) || parseInlineImageId(imageId)?.field;
    const index = Number.isFinite(Number(body.index))
      ? Number(body.index)
      : parseInlineImageId(imageId)?.index;
    if (!field || typeof index !== 'number') {
      throw new Error('Inline görsel bilgisi eksik.');
    }

    const rawValue = reviewTarget.row[field];
    const nextValue = mutateInlineImageValue(rawValue, index, status, false);
    const payload = withUpdatedAt(reviewTarget.row, { [field]: nextValue });
    await patchRows(context, reviewTarget.table, { id: reviewId }, payload);

    return {
      status,
      image: {
        id: imageId,
        status,
        source: 'inline',
        field,
        index,
      },
    };
  }

  const table = normalizeImageTable(body?.table, reviewTarget.table);
  if (!table) {
    throw new Error('Görsel tablosu belirlenemedi.');
  }

  await patchRows(context, table, { id: imageId }, withUpdatedAt({}, { status }));
  return {
    status,
    image: {
      id: imageId,
      status,
      table,
      source: 'table',
    },
  };
}

async function deleteReviewImage(context, reviewId, imageId, body) {
  const reviewTarget = await resolveReviewRecord(
    context,
    reviewId,
    normalizeReviewTable(body?.review_source_table || body?.source_table)
  );

  if (body?.source === 'inline') {
    const field = pickFirstString(body.field) || parseInlineImageId(imageId)?.field;
    const index = Number.isFinite(Number(body.index))
      ? Number(body.index)
      : parseInlineImageId(imageId)?.index;
    if (!field || typeof index !== 'number') {
      throw new Error('Inline görsel bilgisi eksik.');
    }

    const rawValue = reviewTarget.row[field];
    const nextValue = mutateInlineImageValue(rawValue, index, 'rejected', true);
    const payload = withUpdatedAt(reviewTarget.row, { [field]: nextValue });
    await patchRows(context, reviewTarget.table, { id: reviewId }, payload);
    return;
  }

  const table = normalizeImageTable(body?.table, reviewTarget.table);
  if (!table) {
    throw new Error('Görsel tablosu belirlenemedi.');
  }

  await deleteRows(context, table, { id: imageId });
}

async function resolveReviewRecord(context, reviewId, sourceHint) {
  const candidates = sourceHint ? [sourceHint, ...REVIEW_TABLES] : [...REVIEW_TABLES];

  for (const table of unique(candidates)) {
    const rows = await safeSelect(
      context,
      table,
      {
        select: '*',
        id: `eq.${reviewId}`,
      },
      true
    );
    if (rows && rows[0]) {
      return { table, row: rows[0] };
    }
  }

  throw new Error('Yorum bulunamadı.');
}

function extractInlineImages(row, fallbackStatus) {
  const images = [];

  for (const field of INLINE_IMAGE_FIELDS) {
    if (!(field in row) || row[field] === null || row[field] === undefined || row[field] === '') {
      continue;
    }

    const items = flattenImageCandidates(row[field]);
    items.forEach((item, index) => {
      const url = pickFirstString(item.url, item.public_url, item.image_url, item.src, item.href);
      if (!url) return;

      images.push({
        id: createInlineImageId(field, index),
        url,
        status: normalizeStatus(item.status, item.is_approved, item.approved) || fallbackStatus,
        created_at: item.created_at || row.created_at || null,
        source: 'inline',
        field,
        index,
      });
    });
  }

  return dedupeImages(images);
}

function flattenImageCandidates(value) {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenImageCandidates(item));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return flattenImageCandidates(JSON.parse(trimmed));
      } catch (_error) {
        // JSON değilse düz string olarak devam et.
      }
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((url) => ({ url }));
    }

    return [{ url: trimmed }];
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.images)) return flattenImageCandidates(value.images);
    if (Array.isArray(value.urls)) return flattenImageCandidates(value.urls);
    if (Array.isArray(value.items)) return flattenImageCandidates(value.items);
    if (Array.isArray(value.attachments)) return flattenImageCandidates(value.attachments);
    return [value];
  }

  return [];
}

function mutateInlineImageValue(rawValue, targetIndex, status, removeItem) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item, index) => mutateInlineItem(item, index, targetIndex, status, removeItem))
      .filter((item) => item !== undefined);
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        const mutated = mutateInlineImageValue(parsed, targetIndex, status, removeItem);
        return JSON.stringify(mutated);
      } catch (_error) {
        // JSON parse edilemiyorsa aşağıdaki string akışına devam et.
      }
    }

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .map((item, index) => mutateInlineItem(item, index, targetIndex, status, removeItem))
        .filter((item) => item !== undefined)
        .join(', ');
    }

    if (targetIndex === 0 && removeItem) {
      return '';
    }

    return rawValue;
  }

  if (rawValue && typeof rawValue === 'object') {
    return mutateInlineItem(rawValue, 0, targetIndex, status, removeItem);
  }

  return rawValue;
}

function mutateInlineItem(item, index, targetIndex, status, removeItem) {
  if (index !== targetIndex) {
    return item;
  }

  if (removeItem) {
    return undefined;
  }

  if (status === 'rejected') {
    if (typeof item === 'string') return undefined;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return { ...item, status: 'rejected' };
    }
    return undefined;
  }

  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return { ...item, status };
  }

  return item;
}

function normalizeRequestedStatus(value) {
  if (!value) return '';
  return STATUS_ALIASES[String(value).trim().toLowerCase()] || '';
}

function normalizeStatus(status, isApproved, approved) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'approved' || value === 'pending' || value === 'rejected') {
    return value;
  }
  if (typeof isApproved === 'boolean') {
    return isApproved ? 'approved' : 'pending';
  }
  if (typeof approved === 'boolean') {
    return approved ? 'approved' : 'pending';
  }
  return 'pending';
}

function clampRating(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, Math.round(parsed)));
}

function countReviewStatuses(reviews) {
  const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const review of reviews) {
    counts.total += 1;
    if (counts[review.status] !== undefined) {
      counts[review.status] += 1;
    }
  }
  return counts;
}

function countImageStatuses(images) {
  const summary = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const image of images || []) {
    summary.total += 1;
    if (summary[image.status] !== undefined) {
      summary[image.status] += 1;
    }
  }
  return summary;
}

function buildRatingSummary(reviews) {
  const ratings = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  let sum = 0;

  for (const review of reviews || []) {
    const rating = clampRating(review.rating);
    if (!rating) continue;
    ratings[rating] += 1;
    total += 1;
    sum += rating;
  }

  return {
    approved_count: total,
    avg_rating: total ? Number((sum / total).toFixed(1)) : 0,
    five_star: ratings[5],
    four_star: ratings[4],
    three_star: ratings[3],
    two_star: ratings[2],
    one_star: ratings[1],
  };
}

function filterPublicReviewImages(review) {
  return {
    ...review,
    images: (review.images || []).filter((image) => image.status === 'approved'),
  };
}

function buildSearchText(review) {
  return normalizeText(
    [
      review.product.name,
      review.product.slug,
      review.product.id,
      review.product.brand,
      review.user.id,
      review.user.name,
      review.user.email,
      review.order.id,
      review.order.number,
      review.title,
      review.body,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function matchOrderItem(items, review, slugMap) {
  if (!items.length) return null;

  const reviewSlug = normalizeText(review.product.slug);
  const reviewId = normalizeText(review.product.id);
  const reviewName = normalizeText(review.product.name);

  for (const item of items) {
    const itemSlug = normalizeText(pickFirstString(item.product_slug) || slugMap.get(pickFirstString(item.product_id)));
    const itemId = normalizeText(pickFirstString(item.product_id, item.product_slug));
    const itemName = normalizeText(pickFirstString(item.product_name, item.name));

    if (reviewSlug && itemSlug && reviewSlug === itemSlug) return item;
    if (reviewId && itemId && reviewId === itemId) return item;
    if (reviewName && itemName && reviewName === itemName) return item;
  }

  return items[0] || null;
}

function dedupeImages(images) {
  const seen = new Set();
  const result = [];
  for (const image of images || []) {
    const key = `${image.source || 'unknown'}:${image.table || image.field || ''}:${image.id || image.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(image);
  }
  return result;
}

function buildReviewStatusPayload(row, status) {
  const payload = {};

  if ('status' in row || row.status !== undefined) {
    payload.status = status;
  }

  if ('is_approved' in row || row.is_approved !== undefined) {
    payload.is_approved = status === 'approved';
  }

  if ('approved' in row || row.approved !== undefined) {
    payload.approved = status === 'approved';
  }

  return withUpdatedAt(row, payload);
}

function withUpdatedAt(row, payload) {
  if (!row || row.updated_at === undefined) {
    return payload;
  }

  if (typeof row.updated_at === 'number') {
    return { ...payload, updated_at: Date.now() };
  }

  return { ...payload, updated_at: new Date().toISOString() };
}

function createInlineImageId(field, index) {
  return `inline--${field}--${index}`;
}

function parseInlineImageId(value) {
  const match = String(value || '').match(/^inline--([a-z_]+)--(\d+)$/i);
  if (!match) return null;
  return { field: match[1], index: Number(match[2]) };
}

function normalizeReviewTable(value) {
  return REVIEW_TABLES.includes(value) ? value : '';
}

function normalizeImageTable(value, reviewTable) {
  const candidates = IMAGE_TABLES[reviewTable] || [];
  return candidates.includes(value) ? value : candidates[0] || '';
}

function getRouteSegments(pathname) {
  const marker = '/api/reviews';
  const markerIndex = pathname.indexOf(marker);
  const suffix = markerIndex === -1 ? pathname : pathname.slice(markerIndex + marker.length);
  return suffix.split('/').map(decodeURIComponent).filter(Boolean);
}

function requireAdmin(request, env) {
  const provided = request.headers.get(ADMIN_TOKEN_HEADER);
  const expected = env.ADMIN_TOKEN;
  if (!provided || !expected || provided !== expected) {
    throw new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}

function reply(payload, status = 200, extraHeaders = {}) {
  const headers = {
    ...corsHeaders(),
    ...extraHeaders,
  };

  if (payload === null) {
    return new Response(null, { status, headers });
  }

  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(payload), { status, headers });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  };
}

async function readJson(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {};
  }

  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}

function getSupabaseConfig(context) {
  const url = String(context.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.');
  }
  return { url, key };
}

async function safeSelect(context, table, params, allowMissing = true) {
  try {
    return await selectRows(context, table, params);
  } catch (error) {
    if (allowMissing && isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

async function selectRows(context, table, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  return await supabaseFetch(context, `/rest/v1/${table}?${query.toString()}`, {
    method: 'GET',
  });
}

async function patchRows(context, table, filters, payload) {
  const query = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, `eq.${value}`);
    }
  });

  await supabaseFetch(context, `/rest/v1/${table}?${query.toString()}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
}

async function deleteRows(context, table, filters, allowMissing = false) {
  const query = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, `eq.${value}`);
    }
  });

  try {
    await supabaseFetch(context, `/rest/v1/${table}?${query.toString()}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    });
  } catch (error) {
    if (allowMissing && isMissingRelationError(error)) {
      return;
    }
    throw error;
  }
}

async function supabaseFetch(context, path, options = {}) {
  const { url, key } = getSupabaseConfig(context);
  const response = await fetch(`${url}${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...options.headers,
    },
    body: options.body,
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
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

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('relation') ||
    message.includes('schema cache')
  );
}

function formatInFilter(values) {
  return `(${values.map((value) => formatFilterValue(value)).join(',')})`;
}

function formatFilterValue(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseDate(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickFirstString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = pickFirstString(row?.id);
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return [...map.values()];
}
