import { json } from '../_lib/response.js';
import { buildCheckItem, getInventoryMap, normalizeSlug, releaseExpiredReservationsBestEffort } from '../_lib/inventory.js';
import { assertRateLimit } from '../_lib/security.js';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

export async function onRequestPost(context) {
  try {
    assertRateLimit(context, 'inventory-check', 120, 10 * 60 * 1000);
    const contentType = String(context.request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return json({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'İstek içerik türü application/json olmalıdır.' }, { status: 415, headers: NO_STORE });
    }
    const body = await context.request.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items.slice(0, 80) : [];
    if (!items.length) return json({ ok: false, code: 'ITEMS_REQUIRED', error: 'Stok kontrolü için ürün gerekli.' }, { status: 400, headers: NO_STORE });

    const normalized = items.map((item) => ({
      ...item,
      product_slug: normalizeSlug(item.product_slug || item.slug || item.id || item.product_id),
      quantity: Number.parseInt(item.quantity ?? item.qty ?? 1, 10)
    }));
    if (normalized.some((item) => !item.product_slug || !Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
      return json({ ok: false, code: 'INVALID_INVENTORY_ITEM', error: 'Stok kontrolü ürün veya adet bilgisi geçersiz.' }, { status: 400, headers: NO_STORE });
    }

    const slugs = Array.from(new Set(normalized.map((item) => item.product_slug)));
    await releaseExpiredReservationsBestEffort(context);
    const invMap = await getInventoryMap(context, slugs);
    const checked = normalized.map((item) => buildCheckItem(item, invMap));
    return json({
      ok: true,
      service: 'available',
      can_purchase: checked.every((item) => item.can_purchase),
      items: checked
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('inventory check failed:', { message: String(error?.message || 'unknown').slice(0, 180) });
    return json({
      ok: false,
      service: 'unavailable',
      code: 'INVENTORY_SERVICE_UNAVAILABLE',
      error: 'Stok doğrulama servisine şu anda ulaşılamıyor. Sipariş güvenlik nedeniyle devam ettirilmedi.'
    }, { status: 503, headers: NO_STORE });
  }
}
