import { insertRow, selectRows, upsertRow } from './supabase.js';
import { getCatalogProductByHandle, products as catalogProducts } from './catalog.js';

export const EFFECTIVE_PRICE_SOURCE_STATIC = 'static_catalog';
export const EFFECTIVE_PRICE_SOURCE_OVERRIDE = 'admin_override';
export const EFFECTIVE_PRICE_SOURCE_SALE = 'admin_sale';
export const SUPPORTED_CURRENCY = 'TRY';
export const MAX_REGULAR_PRICE_TRY = 500000;
export const CATALOG_MISSING_WARNING = 'Bu ürün için katalog fiyatı bulunamadı.';
export const CATALOG_INVALID_WARNING = 'Katalog fiyatı geçersiz görünüyor.';
export const CATALOG_MISSING_EDIT_WARNING = 'Bu ürün katalogda bulunmadığı için fiyat düzenlenemez.';
export const PRICING_PERMISSION_DENIED = 'Bu işlem için fiyat düzenleme yetkisi gerekir.';

export class ProductPriceValidationError extends Error {
  constructor(message, status = 400, code = 'INVALID_PRICE') {
    super(message);
    this.name = 'ProductPriceValidationError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeProductSlug(slug) {
  return String(slug || '')
    .trim()
    .replace(/^.*\/products\//, '')
    .replace(/\.html.*$/, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

export function getStaticCatalogProduct(slug) {
  return getCatalogProductByHandle(normalizeProductSlug(slug));
}

export function getBaseCatalogPriceTry(catalogProduct) {
  const price = Number(catalogProduct?.price);
  if (!catalogProduct || !Number.isFinite(price) || price < 0 || !Number.isInteger(price)) return null;
  return price;
}

export function validateRegularPriceInput(rawPrice, rawCurrency = SUPPORTED_CURRENCY) {
  if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
    throw new ProductPriceValidationError('Geçerli bir fiyat girin.');
  }
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || Number.isNaN(price)) {
    throw new ProductPriceValidationError('Geçerli bir fiyat girin.');
  }
  if (price <= 0) {
    throw new ProductPriceValidationError('Fiyat sıfırdan büyük olmalıdır.');
  }
  if (!Number.isInteger(price)) {
    throw new ProductPriceValidationError('Fiyat tam TL olarak kaydedilmelidir.');
  }
  if (price > MAX_REGULAR_PRICE_TRY) {
    throw new ProductPriceValidationError('Geçerli bir fiyat girin.');
  }
  const currency = String(rawCurrency || SUPPORTED_CURRENCY).trim().toUpperCase();
  if (currency !== SUPPORTED_CURRENCY) {
    throw new ProductPriceValidationError('Para birimi desteklenmiyor.');
  }
  return { regular_price_try: price, currency };
}

export function resolveEffectivePricing(catalogProduct, overrideRow = null) {
  const slug = normalizeProductSlug(catalogProduct?.slug || overrideRow?.product_slug);
  const baseCatalogPriceTry = getBaseCatalogPriceTry(catalogProduct);
  const hasCatalog = Boolean(catalogProduct && slug);

  const overrideActive = Boolean(
    overrideRow
    && overrideRow.is_active !== false
    && normalizeProductSlug(overrideRow.product_slug) === slug
  );

  let overrideValid = false;
  let overridePrice = null;
  if (overrideActive) {
    const candidate = Number(overrideRow.regular_price_try);
    overrideValid = Number.isFinite(candidate) && candidate > 0 && Number.isInteger(candidate);
    overridePrice = overrideValid ? candidate : null;
  }

  let regular_price_try = null;
  let effective_price_try = null;
  let effective_price_source = EFFECTIVE_PRICE_SOURCE_STATIC;
  let price_warning = null;
  let price_display_mode = 'regular';

  // Sale / compare-at (nullable, may not exist in DB yet)
  const saleCandidateRaw = overrideActive ? overrideRow?.sale_price_try : null;
  const compareAtCandidateRaw = overrideActive ? overrideRow?.compare_at_price_try : null;
  const sale_starts_at = overrideActive ? (overrideRow?.sale_starts_at || null) : null;
  const sale_ends_at = overrideActive ? (overrideRow?.sale_ends_at || null) : null;
  const sale_price_try = Number.isFinite(Number(saleCandidateRaw)) ? Number(saleCandidateRaw) : null;
  const compare_at_price_try = Number.isFinite(Number(compareAtCandidateRaw)) ? Number(compareAtCandidateRaw) : null;
  const saleNow = Date.now();
  const saleStartsMs = sale_starts_at ? Date.parse(String(sale_starts_at)) : null;
  const saleEndsMs = sale_ends_at ? Date.parse(String(sale_ends_at)) : null;

  if (overrideActive && overrideValid) {
    regular_price_try = overridePrice;
    effective_price_try = overridePrice;
    effective_price_source = EFFECTIVE_PRICE_SOURCE_OVERRIDE;
  } else if (baseCatalogPriceTry != null && baseCatalogPriceTry > 0) {
    regular_price_try = baseCatalogPriceTry;
    effective_price_try = baseCatalogPriceTry;
    effective_price_source = EFFECTIVE_PRICE_SOURCE_STATIC;
  } else if (!hasCatalog) {
    price_warning = CATALOG_MISSING_WARNING;
  } else if (overrideActive && !overrideValid) {
    price_warning = CATALOG_INVALID_WARNING;
  } else {
    price_warning = CATALOG_INVALID_WARNING;
  }

  // Determine sale state (fail-closed: never charge invalid sale)
  let sale_active = false;
  let sale_valid = false;
  let sale_window_state = 'none'; // none|scheduled|expired|active|invalid
  if (regular_price_try != null && Number.isFinite(sale_price_try) && Number.isInteger(sale_price_try)) {
    sale_valid = sale_price_try > 0 && sale_price_try < regular_price_try;
    if (saleStartsMs != null && !Number.isFinite(saleStartsMs)) sale_valid = false;
    if (saleEndsMs != null && !Number.isFinite(saleEndsMs)) sale_valid = false;
    if (saleStartsMs != null && saleEndsMs != null && saleEndsMs <= saleStartsMs) sale_valid = false;

    if (!sale_valid) {
      sale_window_state = 'invalid';
    } else if (saleStartsMs != null && saleNow < saleStartsMs) {
      sale_window_state = 'scheduled';
    } else if (saleEndsMs != null && saleNow > saleEndsMs) {
      sale_window_state = 'expired';
    } else {
      sale_window_state = 'active';
      sale_active = true;
    }
  }

  if (sale_active) {
    effective_price_try = sale_price_try;
    effective_price_source = EFFECTIVE_PRICE_SOURCE_SALE;
    price_display_mode = 'sale';
  } else if (sale_window_state === 'scheduled') {
    price_display_mode = 'scheduled_sale';
  } else if (sale_window_state === 'expired') {
    price_display_mode = 'expired_sale';
  } else if (sale_window_state === 'invalid') {
    // Storefront stays regular; admin surfaces can show this diagnostic if desired later.
    price_display_mode = 'regular';
  }

  const has_price_override = overrideActive && overrideValid;
  const price_override_valid = !overrideActive || overrideValid;
  const checkout_price_valid = Number.isFinite(effective_price_try) && effective_price_try > 0;

  return {
    catalog_slug: slug || null,
    base_catalog_price_try: baseCatalogPriceTry,
    regular_price_try,
    sale_price_try: sale_valid ? sale_price_try : null,
    compare_at_price_try: Number.isFinite(compare_at_price_try) && Number.isInteger(compare_at_price_try) && compare_at_price_try > 0 ? compare_at_price_try : null,
    sale_starts_at,
    sale_ends_at,
    sale_active,
    effective_price_try,
    effective_currency: SUPPORTED_CURRENCY,
    effective_price_source,
    price_display_mode,
    has_price_override,
    price_override_valid,
    checkout_price_valid,
    price_warning,
    catalog_price_valid: baseCatalogPriceTry != null && baseCatalogPriceTry > 0
  };
}

function isMissingOverrideTableError(error) {
  return /relation|does not exist|404|product_price_overrides/i.test(String(error?.message || ''));
}

export async function loadPriceOverrideRows(context, { slugs = null, activeOnly = true } = {}) {
  const legacySelect = 'id,product_slug,regular_price_try,currency,is_active,source,reason,created_by,updated_by,created_at,updated_at';
  const extendedSelect = legacySelect + ',sale_price_try,compare_at_price_try,sale_starts_at,sale_ends_at';
  const params = { select: extendedSelect };
  if (activeOnly) params.is_active = 'eq.true';
  const normalized = Array.isArray(slugs)
    ? [...new Set(slugs.map(normalizeProductSlug).filter(Boolean))]
    : [];
  if (normalized.length === 1) params.product_slug = `eq.${normalized[0]}`;
  else if (normalized.length > 1) params.product_slug = `in.(${normalized.join(',')})`;

  try {
    return await selectRows(context, 'product_price_overrides', params);
  } catch (error) {
    if (isMissingOverrideTableError(error)) return [];
    // Backward-compat: if sale columns are not migrated yet, retry with legacy select.
    if (/sale_price_try|compare_at_price_try|sale_starts_at|sale_ends_at|column .* does not exist/i.test(String(error?.message || ''))) {
      return await selectRows(context, 'product_price_overrides', { ...params, select: legacySelect });
    }
    throw error;
  }
}

export function buildPriceOverrideMap(rows = []) {
  return new Map((rows || []).map((row) => [normalizeProductSlug(row.product_slug), row]));
}

export async function loadActivePriceOverrideMap(context, slugs = null) {
  const rows = await loadPriceOverrideRows(context, { slugs, activeOnly: true });
  return buildPriceOverrideMap(rows);
}

export function applyEffectivePricingToCatalogProduct(catalogProduct, pricing) {
  if (!catalogProduct || !pricing) return catalogProduct;
  return {
    ...catalogProduct,
    price: pricing.checkout_price_valid ? pricing.effective_price_try : catalogProduct.price,
    effective_price_try: pricing.effective_price_try,
    effective_currency: pricing.effective_currency,
    effective_price_source: pricing.effective_price_source,
    base_catalog_price_try: pricing.base_catalog_price_try,
    has_price_override: pricing.has_price_override,
    price_override_valid: pricing.price_override_valid,
    checkout_price_valid: pricing.checkout_price_valid,
    price_warning: pricing.price_warning
  };
}

export async function resolveProductPricing(context, slug, overrideMap = null) {
  const normalized = normalizeProductSlug(slug);
  const catalogProduct = getStaticCatalogProduct(normalized);
  const map = overrideMap || await loadActivePriceOverrideMap(context, [normalized]);
  return resolveEffectivePricing(catalogProduct, map.get(normalized) || null);
}

export async function buildPricedCatalogIndex(context, slugs = null) {
  const overrideMap = await loadActivePriceOverrideMap(context, slugs);
  const index = new Map();
  const list = Array.isArray(catalogProducts) ? catalogProducts : [];
  for (const product of list) {
    const pricing = resolveEffectivePricing(product, overrideMap.get(product.slug) || null);
    const priced = applyEffectivePricingToCatalogProduct(product, pricing);
    [priced.id, priced.slug].concat(priced.aliases || []).filter(Boolean).forEach((key) => {
      index.set(String(key), priced);
    });
  }
  return index;
}

export function buildAdminPricingFields(catalogProduct, pricing, overrideRow = null) {
  const slug = normalizeProductSlug(catalogProduct?.slug);
  const title = String(catalogProduct?.name || '').trim();
  const can_edit_price = Boolean(catalogProduct && pricing?.catalog_price_valid);

  return {
    catalog_slug: slug || null,
    catalog_title: title || null,
    catalog_price: pricing.base_catalog_price_try,
    catalog_price_try: pricing.base_catalog_price_try,
    catalog_currency: SUPPORTED_CURRENCY,
    catalog_price_source: 'products.json',
    catalog_price_valid: pricing.catalog_price_valid,
    catalog_price_warning: !catalogProduct ? CATALOG_MISSING_WARNING : pricing.price_warning,
    effective_price_try: pricing.effective_price_try,
    effective_currency: pricing.effective_currency,
    effective_price_source: pricing.effective_price_source,
    base_catalog_price_try: pricing.base_catalog_price_try,
    has_price_override: pricing.has_price_override,
    price_override_valid: pricing.price_override_valid,
    price_warning: pricing.price_warning,
    can_edit_price,
    price_edit_blocked_reason: can_edit_price ? null : CATALOG_MISSING_EDIT_WARNING,
    price_override_reason: overrideRow?.reason || null,
    price_override_updated_at: overrideRow?.updated_at || null
  };
}

export async function upsertAdminProductPriceOverride(context, {
  slug,
  regular_price_try,
  currency = SUPPORTED_CURRENCY,
  reason = null,
  updated_by = null
}) {
  const normalized = normalizeProductSlug(slug);
  const catalogProduct = getStaticCatalogProduct(normalized);
  if (!catalogProduct) {
    throw new ProductPriceValidationError('Ürün katalogda bulunamadı.', 404, 'PRODUCT_NOT_FOUND');
  }

  const existingRows = await loadPriceOverrideRows(context, { slugs: [normalized], activeOnly: false });
  const existing = existingRows[0] || null;
  const old_regular_price_try = existing?.regular_price_try ?? getBaseCatalogPriceTry(catalogProduct);
  const old_currency = existing?.currency || SUPPORTED_CURRENCY;
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  const saved = await upsertRow(context, 'product_price_overrides', {
    product_slug: normalized,
    regular_price_try,
    currency,
    is_active: true,
    source: 'admin',
    reason: reason || null,
    created_by: existing?.created_by || updated_by || null,
    updated_by: updated_by || null,
    updated_at: now
  }, 'product_slug');

  try {
    await insertRow(context, 'product_price_audit_logs', {
      product_slug: normalized,
      old_regular_price_try: old_regular_price_try ?? null,
      new_regular_price_try: regular_price_try,
      old_currency,
      new_currency: currency,
      changed_by_admin: updated_by || null,
      changed_at: now,
      reason: reason || null,
      source: 'admin',
      request_id: requestId
    });
  } catch (error) {
    const auditError = new Error('Fiyat güncellendi ancak denetim kaydı oluşturulamadı.');
    auditError.status = 500;
    auditError.code = 'PRICE_AUDIT_FAILED';
    auditError.cause = error;
    throw auditError;
  }

  return {
    override: saved,
    pricing: resolveEffectivePricing(catalogProduct, saved),
    audit: {
      product_slug: normalized,
      old_regular_price_try: old_regular_price_try ?? null,
      new_regular_price_try: regular_price_try,
      request_id: requestId
    }
  };
}
