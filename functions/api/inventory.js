import { json } from './_lib/response.js';
import { getInventoryRows, toPublicInventory, normalizeSlug } from './_lib/inventory.js';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const raw = url.searchParams.get('product_slugs') || url.searchParams.get('slugs') || '';
    const slugs = Array.from(new Set(raw.split(',').map(normalizeSlug).filter(Boolean))).slice(0, 100);
    const rows = await getInventoryRows(context, slugs);
    const inventory = rows.map(toPublicInventory);
    const found = new Set(inventory.map((row) => normalizeSlug(row.product_slug)));
    const missing = slugs.filter((slug) => !found.has(slug));
    return json({
      ok: true,
      service: 'available',
      requested: slugs.length,
      inventory,
      missing
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('public inventory read failed:', { message: String(error?.message || 'unknown').slice(0, 180) });
    return json({
      ok: false,
      service: 'unavailable',
      code: 'INVENTORY_SERVICE_UNAVAILABLE',
      error: 'Stok servisine şu anda ulaşılamıyor. Ürün stokta yok olarak işaretlenmedi; lütfen kısa süre sonra tekrar deneyin.'
    }, { status: 503, headers: NO_STORE });
  }
}
