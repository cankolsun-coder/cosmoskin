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
        effective_price_try: priced.effective_price_try,
        effective_currency: priced.effective_currency,
        effective_price_source: priced.effective_price_source,
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
