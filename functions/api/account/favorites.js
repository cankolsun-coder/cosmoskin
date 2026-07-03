import { deleteRows, insertRow, selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, normalizeFavoritePayload, requireUser } from '../_lib/account.js';


function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const rows = await selectRows(context, 'user_favorites', {
      select: '*',
      user_id: `eq.${auth.user.id}`,
      order: 'created_at.desc'
    });
    return json({ ok: true, favorites: rows || [] });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Favoriler alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const favorite = normalizeFavoritePayload(body);
    if (!favorite) return json({ ok: false, error: 'Geçerli ürün bilgisi gerekli.' }, { status: 400 });
    const existing = await selectRows(context, 'user_favorites', {
      select: 'id',
      user_id: `eq.${auth.user.id}`,
      product_slug: `eq.${favorite.product_slug}`,
      limit: '1'
    }).catch(() => []);
    if (existing?.[0]?.id) {
      await updateRows(context, 'user_favorites', { id: existing[0].id }, favorite);
      const row = await selectRows(context, 'user_favorites', { select: '*', id: `eq.${existing[0].id}`, limit: '1' });
      return json({ ok: true, favorite: row?.[0] || null });
    }
    const row = await insertRow(context, 'user_favorites', { user_id: auth.user.id, ...favorite });
    return json({ ok: true, favorite: row });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Favori kaydedilemedi.' }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const url = new URL(context.request.url);
    const body = await context.request.json().catch(() => ({}));
    let id = cleanString(url.searchParams.get('id') || body.id || body.favorite_id || '', 80);
    let slug = cleanString(url.searchParams.get('product_slug') || body.product_slug || body.slug || body.product_id || '', 160);
    if (id && !isUuid(id)) {
      slug = slug || id;
      id = '';
    }
    if (!id && !slug) return json({ ok: false, error: 'Favori id veya ürün slug zorunlu.' }, { status: 400 });
    if (id) {
      const rows = await selectRows(context, 'user_favorites', { select: 'id', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' });
      if (!rows?.[0]) return json({ ok: false, error: 'Favori bulunamadı.' }, { status: 404 });
      await deleteRows(context, 'user_favorites', { id });
    } else {
      const rows = await selectRows(context, 'user_favorites', { select: 'id', user_id: `eq.${auth.user.id}`, product_slug: `eq.${slug}` });
      for (const row of rows || []) await deleteRows(context, 'user_favorites', { id: row.id });
    }
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Favori silinemedi.' }, { status: 500 });
  }
}
