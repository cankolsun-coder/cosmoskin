import { getUserFromAccessToken, selectRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
import { getCatalogProductByHandle, getCatalogProductByName } from './_lib/catalog.js';

function resolveOrderItem(item = {}) {
  const product =
    getCatalogProductByHandle(item.product_slug || item.product_id || '') ||
    getCatalogProductByName(item.product_name || '');

  const productSlug = product?.slug || item.product_slug || item.product_id || null;

  return {
    ...item,
    product_id: product?.id || item.product_id || productSlug,
    product_slug: productSlug,
    product_name: product?.name || item.product_name || 'Ürün',
    brand: product?.brand || item.brand || 'Cosmoskin',
    image: product?.image || item.image || '',
    product_url: product?.url || (productSlug ? `/products/${productSlug}.html` : '')
  };
}

export async function onRequestGet(context) {
  try {
    const authHeader = context.request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: 'Oturum gerekli.' }, { status: 401 });

    const user = await getUserFromAccessToken(context, token);
    if (!user) return json({ ok: false, error: 'Geçersiz oturum.' }, { status: 401 });

    const orders = await selectRows(context, 'orders', {
      select: 'id,order_number,status,total_amount,created_at',
      user_id: `eq.${user.id}`,
      order: 'created_at.desc'
    });

    const ids = Array.isArray(orders) ? orders.map(order => order.id).filter(Boolean) : [];
    let items = [];
    if (ids.length) {
      items = await selectRows(context, 'order_items', {
        select: 'order_id,product_id,product_slug,product_name,brand,image,quantity,line_total',
        order_id: `in.(${ids.join(',')})`
      });
    }

    const grouped = new Map();
    for (const item of items || []) {
      const list = grouped.get(item.order_id) || [];
      list.push(item);
      grouped.set(item.order_id, list);
    }

    const data = (orders || []).map(order => ({
      ...order,
      order_items: (grouped.get(order.id) || []).map(resolveOrderItem)
    }));

    return json({ ok: true, orders: data });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Siparişler alınamadı.' }, { status: 500 });
  }
}
