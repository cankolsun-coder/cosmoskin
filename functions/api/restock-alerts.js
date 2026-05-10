import { insertRow, selectRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
import { catalogProduct, getInventoryRows, normalizeEmail, normalizeSlug, validEmail } from './_lib/inventory.js';

function getAccessToken(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const product_slug = normalizeSlug(body.product_slug || body.slug || body.product_id);
    const email = normalizeEmail(body.email);
    if (!product_slug || !catalogProduct(product_slug)) return json({ ok: false, error: 'Ürün bulunamadı.' }, { status: 404 });
    if (!validEmail(email)) return json({ ok: false, error: 'Geçerli bir e-posta adresi gir.' }, { status: 400 });

    const inv = (await getInventoryRows(context, [product_slug]).catch(() => []))[0];
    if (inv && inv.status === 'active' && (inv.allow_backorder || inv.available_stock > 0)) {
      return json({ ok: true, already_in_stock: true, message: 'Ürün şu anda stokta.' });
    }

    const existing = await selectRows(context, 'restock_alerts', {
      select: 'id,status,created_at',
      product_slug: `eq.${product_slug}`,
      email: `eq.${email}`,
      status: 'eq.waiting',
      limit: '1'
    }).catch(() => []);
    if (existing?.[0]) {
      return json({ ok: true, already_registered: true, message: 'Bu ürün için stok bildirimi zaten oluşturulmuş.' });
    }

    const accessToken = getAccessToken(context.request);
    let userId = null;
    if (accessToken) {
      try {
        const { getUserFromAccessToken } = await import('./_lib/supabase.js');
        const user = await getUserFromAccessToken(context, accessToken);
        userId = user?.id || null;
      } catch {}
    }

    const alert = await insertRow(context, 'restock_alerts', { product_slug, email, user_id: userId, status: 'waiting' });
    return json({ ok: true, alert_id: alert?.id || null, message: 'Ürün tekrar stokta olduğunda sana haber vereceğiz.' });
  } catch (error) {
    console.error('restock alert failed:', error);
    return json({ ok: false, error: 'Şu anda bildirimi oluşturamadık. Lütfen biraz sonra tekrar dene.' }, { status: 500 });
  }
}
