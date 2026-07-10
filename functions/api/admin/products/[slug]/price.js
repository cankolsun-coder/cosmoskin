import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { getAdminRecord, requireAdminPermission } from '../../../_lib/admin-audit.js';
import { json } from '../../../_lib/response.js';
import {
  PRICING_PERMISSION_DENIED,
  P1E_MIGRATION_REQUIRED_CODE,
  ProductPriceValidationError,
  applyEffectivePricingToCatalogProduct,
  buildAdminPricingFields,
  getStaticCatalogProduct,
  normalizeProductSlug,
  upsertAdminProductPriceOverride,
  validateAdminPriceUpdateInput
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
    const validated = validateAdminPriceUpdateInput(body);
    const reason = String(body.reason || body.note || '').trim() || null;
    const admin = await getAdminRecord(context);

    const result = await upsertAdminProductPriceOverride(context, {
      slug,
      regular_price_try: validated.regular_price_try,
      currency: validated.currency,
      reason,
      updated_by: admin?.email || null,
      sale_price_try: validated.sale_price_try,
      compare_at_price_try: validated.compare_at_price_try,
      sale_starts_at: validated.sale_starts_at,
      sale_ends_at: validated.sale_ends_at
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
    if (error?.code === P1E_MIGRATION_REQUIRED_CODE) {
      return json({ ok: false, error: error.message, code: error.code }, { status: error.status || 409 });
    }
    if (error?.code === 'PRICE_AUDIT_FAILED') {
      return json({ ok: false, error: error.message || 'Fiyat denetim kaydı oluşturulamadı.', code: error.code }, { status: error.status || 500 });
    }
    return adminError(error, 'Ürün fiyatı güncellenemedi.');
  }
}
