import { json } from './_lib/response.js';
import { getInventoryRows, toPublicInventory, normalizeSlug } from './_lib/inventory.js';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const raw = url.searchParams.get('product_slugs') || url.searchParams.get('slugs') || '';
    const slugs = raw.split(',').map(normalizeSlug).filter(Boolean).slice(0, 100);
    const rows = await getInventoryRows(context, slugs);
    return json({ ok: true, inventory: rows.map(toPublicInventory) });
  } catch (error) {
    console.error('public inventory failed:', error);
    return json({ ok: false, error: 'Stok bilgisi şu anda alınamadı.' }, { status: 500 });
  }
}
