import { products as catalogProducts } from '../_lib/catalog.js';
import { json } from '../_lib/response.js';
import {
  applyEffectivePricingToCatalogProduct,
  loadActivePriceOverrideMap,
  resolveEffectivePricing
} from '../_lib/product-pricing.js';

export async function onRequestGet(context) {
  try {
    const overrideMap = await loadActivePriceOverrideMap(context);
    const prices = {};
    const list = Array.isArray(catalogProducts) ? catalogProducts : [];
    for (const product of list) {
      const pricing = resolveEffectivePricing(product, overrideMap.get(product.slug) || null);
      const priced = applyEffectivePricingToCatalogProduct(product, pricing);
      prices[product.slug] = {
        regular_price_try: priced.regular_price_try ?? null,
        sale_price_try: priced.sale_price_try ?? null,
        compare_at_price_try: priced.compare_at_price_try ?? null,
        sale_active: Boolean(priced.sale_active),
        sale_starts_at: priced.sale_starts_at || null,
        sale_ends_at: priced.sale_ends_at || null,
        effective_price_try: priced.effective_price_try,
        effective_currency: priced.effective_currency,
        effective_price_source: priced.effective_price_source,
        price_display_mode: priced.price_display_mode || 'regular',
        base_catalog_price_try: priced.base_catalog_price_try,
        has_price_override: priced.has_price_override,
        price_override_valid: priced.price_override_valid !== false,
        price_warning: priced.price_warning || null
      };
    }
    return json({
      ok: true,
      source: 'trusted-server-catalog+overrides',
      endpoint: '/api/catalog/effective-prices',
      updated_at: new Date().toISOString(),
      prices
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    return json({ ok: false, error: 'Etkin ürün fiyatları yüklenemedi.' }, { status: 500 });
  }
}
