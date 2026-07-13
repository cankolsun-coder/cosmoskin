import { deleteRows, insertRow, selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, normalizeFavoritePayload, requireUser } from '../_lib/account.js';


function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function favoriteSlugs(rows = []) {
  return rows.map((row) => row.product_slug || row.product_id).filter(Boolean);
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
    const favorites = rows || [];
    return json({ ok: true, favorites, favorite_slugs: favoriteSlugs(favorites) });
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
      return json({
        ok: true,
        action: 'updated',
        changed_slug: favorite.product_slug,
        favorite: row?.[0] || null,
        favorite_slugs: favoriteSlugs(await selectRows(context, 'user_favorites', {
          select: 'product_slug',
          user_id: `eq.${auth.user.id}`
        }).catch(() => []))
      });
    }
    try {
      const row = await insertRow(context, 'user_favorites', { user_id: auth.user.id, ...favorite });
      return json({
        ok: true,
        action: 'added',
        changed_slug: favorite.product_slug,
        favorite: row,
        favorite_slugs: favoriteSlugs(await selectRows(context, 'user_favorites', {
          select: 'product_slug',
          user_id: `eq.${auth.user.id}`
        }).catch(() => []))
      });
    } catch (insertError) {
      const duplicate = await selectRows(context, 'user_favorites', {
        select: '*',
        user_id: `eq.${auth.user.id}`,
        product_slug: `eq.${favorite.product_slug}`,
        limit: '1'
      }).catch(() => []);
      if (duplicate?.[0]) {
        return json({
          ok: true,
          action: 'exists',
          changed_slug: favorite.product_slug,
          favorite: duplicate[0],
          favorite_slugs: favoriteSlugs(duplicate)
        });
      }
      throw insertError;
    }
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

    let removedSlug = slug;
    let removedCount = 0;
    if (id) {
      const rows = await selectRows(context, 'user_favorites', { select: 'id,product_slug', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' });
      if (rows?.[0]) {
        removedSlug = rows[0].product_slug || slug;
        await deleteRows(context, 'user_favorites', { id });
        removedCount = 1;
      }
    } else {
      const rows = await selectRows(context, 'user_favorites', { select: 'id,product_slug', user_id: `eq.${auth.user.id}`, product_slug: `eq.${slug}` });
      for (const row of rows || []) {
        await deleteRows(context, 'user_favorites', { id: row.id });
        removedCount += 1;
        removedSlug = row.product_slug || slug;
      }
    }

    return json({
      ok: true,
      action: removedCount ? 'removed' : 'missing',
      changed_slug: removedSlug,
      removed: removedCount > 0
    });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Favori silinemedi.' }, { status: 500 });
  }
}
