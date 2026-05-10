import { json } from '../_lib/response.js';
import { buildCheckItem, getInventoryMap, normalizeSlug } from '../_lib/inventory.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items.slice(0, 80) : [];
    if (!items.length) return json({ ok: false, error: 'items gerekli.' }, { status: 400 });
    const slugs = items.map((item) => normalizeSlug(item.product_slug || item.slug || item.id || item.product_id)).filter(Boolean);
    const invMap = await getInventoryMap(context, slugs);
    const checked = items.map((item) => buildCheckItem(item, invMap));
    return json({
      ok: true,
      can_purchase: checked.every((item) => item.can_purchase),
      items: checked
    });
  } catch (error) {
    console.error('inventory check failed:', error);
    return json({ ok: false, error: 'Stok kontrolü yapılamadı.' }, { status: 500 });
  }
}
