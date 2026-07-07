import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { getAdminRecord, requireAdminPermission } from '../../../_lib/admin-audit.js';
import { json } from '../../../_lib/response.js';
import {
  PRICING_PERMISSION_DENIED,
  ProductPriceValidationError,
  applyEffectivePricingToCatalogProduct,
  buildAdminPricingFields,
  getStaticCatalogProduct,
  loadPriceOverrideRows,
  normalizeProductSlug,
  upsertAdminProductPriceOverride,
  validateRegularPriceInput
} from '../../../_lib/product-pricing.js';

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'products:pricing:update');
    const slug = normalizeProductSlug(context.params?.slug || '');
    if (!slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });

    const catalogProduct = getStaticCatalogProduct(slug);
    if (!catalogProduct) {
      return json({ ok: false, error: 'Ürün katalogda bulunamadı.' }, { status: 404 });
    }

    const body = await readJsonBody(context);
    const validated = validateRegularPriceInput(
      body.regular_price_try ?? body.catalog_price_try ?? body.price,
      body.currency
    );
    const reason = String(body.reason || body.note || '').trim() || null;
    const admin = await getAdminRecord(context);

    const result = await upsertAdminProductPriceOverride(context, {
      slug,
      regular_price_try: validated.regular_price_try,
      currency: validated.currency,
      reason,
      updated_by: admin?.email || null
    });

    const pricedProduct = applyEffectivePricingToCatalogProduct(catalogProduct, result.pricing);
    const fields = buildAdminPricingFields(catalogProduct, result.pricing, result.override);

    return json({
      ok: true,
      product_slug: slug,
      pricing: fields,
      product: pricedProduct,
      audit: result.audit
    });
  } catch (error) {
    if (error instanceof ProductPriceValidationError) {
      return json({ ok: false, error: error.message, code: error.code }, { status: error.status || 400 });
    }
    if (error?.status === 403) {
      return json({ ok: false, error: PRICING_PERMISSION_DENIED }, { status: 403 });
    }
    return adminError(error, 'Ürün fiyatı güncellenemedi.');
  }
}
