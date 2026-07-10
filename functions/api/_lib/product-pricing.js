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
export const P1E_MIGRATION_REQUIRED_CODE = 'P1E_MIGRATION_REQUIRED';
export const P1E_MIGRATION_REQUIRED_MESSAGE = 'İndirim alanları için P1E veritabanı geçişi uygulanmalıdır.';

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

export function normalizeNullableAdminField(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  return raw;
}

export function normalizeNullableAdminIntegerPrice(raw, invalidMessage = 'Geçerli bir fiyat girin.') {
  const normalized = normalizeNullableAdminField(raw);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;
  const price = Number(normalized);
  if (!Number.isFinite(price) || Number.isNaN(price)) {
    throw new ProductPriceValidationError(invalidMessage);
  }
  if (price <= 0) {
    throw new ProductPriceValidationError(invalidMessage);
  }
  if (!Number.isInteger(price)) {
    throw new ProductPriceValidationError('Fiyat tam TL olarak kaydedilmelidir.');
  }
  if (price > MAX_REGULAR_PRICE_TRY) {
    throw new ProductPriceValidationError(invalidMessage);
  }
  return price;
}

export function normalizeNullableAdminTimestamp(raw) {
  const normalized = normalizeNullableAdminField(raw);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;
  const ms = Date.parse(String(normalized));
  if (!Number.isFinite(ms)) {
    throw new ProductPriceValidationError('İndirim tarihi aralığı geçerli değil.', 400, 'INVALID_SALE_WINDOW');
  }
  return new Date(ms).toISOString();
}

export function isMissingSaleColumnError(error) {
  const msg = String(error?.message || '');
  return /sale_price_try|compare_at_price_try|sale_starts_at|sale_ends_at|column .* does not exist|schema cache/i.test(msg);
}

export function isMissingSaleAuditColumnError(error) {
  const msg = String(error?.message || '');
  return /old_sale_price_try|new_sale_price_try|old_compare_at_price_try|new_compare_at_price_try|old_sale_starts_at|new_sale_starts_at|old_sale_ends_at|new_sale_ends_at|column .* does not exist|schema cache/i.test(msg);
}

export function validateAdminPriceUpdateInput(body = {}) {
  const validated = validateRegularPriceInput(
    body.regular_price_try ?? body.catalog_price_try ?? body.price,
    body.currency
  );

  const sale_price_try = normalizeNullableAdminIntegerPrice(
    body.sale_price_try,
    'Geçerli bir indirimli fiyat girin.'
  );
  const compare_at_price_try = normalizeNullableAdminIntegerPrice(
    body.compare_at_price_try,
    'Geçerli bir karşılaştırma fiyatı girin.'
  );
  const sale_starts_at = normalizeNullableAdminTimestamp(body.sale_starts_at);
  const sale_ends_at = normalizeNullableAdminTimestamp(body.sale_ends_at);

  const has_sale_field_submission = ['sale_price_try', 'compare_at_price_try', 'sale_starts_at', 'sale_ends_at']
    .some((key) => body[key] !== undefined);

  if (sale_price_try != null && sale_price_try >= validated.regular_price_try) {
    throw new ProductPriceValidationError('İndirimli fiyat normal fiyattan düşük olmalıdır.', 400, 'INVALID_SALE_PRICE');
  }

  const payableReference = sale_price_try != null ? sale_price_try : validated.regular_price_try;
  if (compare_at_price_try != null) {
    if (sale_price_try != null && compare_at_price_try <= sale_price_try) {
      throw new ProductPriceValidationError('Karşılaştırma fiyatı indirimli fiyattan yüksek olmalıdır.', 400, 'INVALID_COMPARE_AT_PRICE');
    }
    if (compare_at_price_try <= payableReference) {
      throw new ProductPriceValidationError('Karşılaştırma fiyatı indirimli fiyattan yüksek olmalıdır.', 400, 'INVALID_COMPARE_AT_PRICE');
    }
  }

  const startsMs = sale_starts_at != null ? Date.parse(String(sale_starts_at)) : null;
  const endsMs = sale_ends_at != null ? Date.parse(String(sale_ends_at)) : null;
  if (startsMs != null && endsMs != null && endsMs <= startsMs) {
    throw new ProductPriceValidationError('İndirim tarihi aralığı geçerli değil.', 400, 'INVALID_SALE_WINDOW');
  }

  return {
    ...validated,
    sale_price_try,
    compare_at_price_try,
    sale_starts_at,
    sale_ends_at,
    has_sale_field_submission
  };
}

export function buildAdminPriceStatusLabel(pricing) {
  if (!pricing) return 'Katalog';
  if (pricing.price_display_mode === 'sale' || pricing.sale_active) return 'İndirim aktif';
  if (pricing.price_display_mode === 'scheduled_sale') return 'İndirim planlandı';
  if (pricing.price_display_mode === 'expired_sale') return 'İndirim süresi doldu';
  if (pricing.effective_price_source === EFFECTIVE_PRICE_SOURCE_OVERRIDE || pricing.has_price_override) return 'Admin fiyat';
  return 'Katalog';
}

export function buildPriceHistoryEventMeta(row = {}) {
  const changed_fields = [];
  const labels = [];
  const addChange = (field, label, removedLabel = null) => {
    const oldVal = row[`old_${field}`] ?? null;
    const newVal = row[`new_${field}`] ?? null;
    if (oldVal === newVal) return;
    changed_fields.push(field);
    if (removedLabel && newVal == null && oldVal != null) labels.push(removedLabel);
    else labels.push(label);
  };

  addChange('regular_price_try', 'Normal fiyat güncellendi');
  addChange('sale_price_try', 'İndirimli fiyat güncellendi', 'İndirim kaldırıldı');
  addChange('compare_at_price_try', 'Karşılaştırma fiyatı güncellendi');
  if (
    row.old_sale_starts_at !== row.new_sale_starts_at
    || row.old_sale_ends_at !== row.new_sale_ends_at
  ) {
    changed_fields.push('sale_window');
    labels.push('İndirim dönemi güncellendi');
  }

  return {
    changed_fields,
    event_label: labels.length ? labels.join(' · ') : 'Fiyat güncellendi'
  };
}

export function normalizePriceHistoryItem(row = {}) {
  const meta = buildPriceHistoryEventMeta(row);
  return {
    ...row,
    ...meta
  };
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
  const msg = String(error?.message || '');
  // Avoid false positives on "column ... does not exist" (schema drift during rollout).
  if (/column .* does not exist/i.test(msg)) return false;
  return /relation .*product_price_overrides|product_price_overrides.*relation|product_price_overrides.*does not exist|404/i.test(msg);
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
    const msg = String(error?.message || '');
    const status = Number(error?.status || error?.statusCode || 0);
    if (
      /sale_price_try|compare_at_price_try|sale_starts_at|sale_ends_at/i.test(msg)
      || /column .* does not exist/i.test(msg)
      || /schema cache/i.test(msg)
      || status === 400
    ) {
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
    regular_price_try: pricing.regular_price_try ?? pricing.base_catalog_price_try,
    sale_price_try: pricing.sale_price_try ?? null,
    compare_at_price_try: pricing.compare_at_price_try ?? null,
    sale_active: Boolean(pricing.sale_active),
    sale_starts_at: pricing.sale_starts_at || null,
    sale_ends_at: pricing.sale_ends_at || null,
    price_display_mode: pricing.price_display_mode || 'regular',
    price_status_label: buildAdminPriceStatusLabel(pricing),
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
  updated_by = null,
  sale_price_try = undefined,
  compare_at_price_try = undefined,
  sale_starts_at = undefined,
  sale_ends_at = undefined
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
  const old_sale_price_try = existing?.sale_price_try ?? null;
  const old_compare_at_price_try = existing?.compare_at_price_try ?? null;
  const old_sale_starts_at = existing?.sale_starts_at ?? null;
  const old_sale_ends_at = existing?.sale_ends_at ?? null;
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  const next_sale_price_try = sale_price_try !== undefined ? sale_price_try : (existing?.sale_price_try ?? null);
  const next_compare_at_price_try = compare_at_price_try !== undefined ? compare_at_price_try : (existing?.compare_at_price_try ?? null);
  const next_sale_starts_at = sale_starts_at !== undefined ? sale_starts_at : (existing?.sale_starts_at ?? null);
  const next_sale_ends_at = sale_ends_at !== undefined ? sale_ends_at : (existing?.sale_ends_at ?? null);
  const has_sale_field_submission = [sale_price_try, compare_at_price_try, sale_starts_at, sale_ends_at]
    .some((value) => value !== undefined);

  const basePayload = {
    product_slug: normalized,
    regular_price_try,
    currency,
    is_active: true,
    source: 'admin',
    reason: reason || null,
    created_by: existing?.created_by || updated_by || null,
    updated_by: updated_by || null,
    updated_at: now
  };

  const payloadWithSale = {
    ...basePayload,
    sale_price_try: next_sale_price_try,
    compare_at_price_try: next_compare_at_price_try,
    sale_starts_at: next_sale_starts_at,
    sale_ends_at: next_sale_ends_at
  };

  let saved;
  try {
    saved = await upsertRow(
      context,
      'product_price_overrides',
      has_sale_field_submission ? payloadWithSale : basePayload,
      'product_slug'
    );
  } catch (error) {
    if (has_sale_field_submission && isMissingSaleColumnError(error)) {
      throw new ProductPriceValidationError(P1E_MIGRATION_REQUIRED_MESSAGE, 409, P1E_MIGRATION_REQUIRED_CODE);
    }
    if (!has_sale_field_submission && isMissingSaleColumnError(error)) {
      saved = await upsertRow(context, 'product_price_overrides', basePayload, 'product_slug');
    } else {
      throw error;
    }
  }

  const saleAuditChanged = (
    old_sale_price_try !== next_sale_price_try
    || old_compare_at_price_try !== next_compare_at_price_try
    || old_sale_starts_at !== next_sale_starts_at
    || old_sale_ends_at !== next_sale_ends_at
  );

  const auditBase = {
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
  };

  const auditExtended = {
    ...auditBase,
    old_sale_price_try,
    new_sale_price_try: next_sale_price_try,
    old_compare_at_price_try,
    new_compare_at_price_try: next_compare_at_price_try,
    old_sale_starts_at,
    new_sale_starts_at: next_sale_starts_at,
    old_sale_ends_at,
    new_sale_ends_at: next_sale_ends_at
  };

  try {
    await insertRow(context, 'product_price_audit_logs', auditExtended);
  } catch (error) {
    if ((has_sale_field_submission || saleAuditChanged) && isMissingSaleAuditColumnError(error)) {
      throw new ProductPriceValidationError(P1E_MIGRATION_REQUIRED_MESSAGE, 409, P1E_MIGRATION_REQUIRED_CODE);
    }
    try {
      await insertRow(context, 'product_price_audit_logs', auditBase);
    } catch (legacyError) {
      const auditError = new Error('Fiyat güncellendi ancak denetim kaydı oluşturulamadı.');
      auditError.status = 500;
      auditError.code = 'PRICE_AUDIT_FAILED';
      auditError.cause = legacyError;
      throw auditError;
    }
    if (saleAuditChanged) {
      throw new ProductPriceValidationError(P1E_MIGRATION_REQUIRED_MESSAGE, 409, P1E_MIGRATION_REQUIRED_CODE);
    }
  }

  return {
    override: saved,
    pricing: resolveEffectivePricing(catalogProduct, saved),
    audit: {
      product_slug: normalized,
      old_regular_price_try: old_regular_price_try ?? null,
      new_regular_price_try: regular_price_try,
      old_sale_price_try,
      new_sale_price_try: next_sale_price_try,
      old_compare_at_price_try,
      new_compare_at_price_try: next_compare_at_price_try,
      old_sale_starts_at,
      new_sale_starts_at: next_sale_starts_at,
      old_sale_ends_at,
      new_sale_ends_at: next_sale_ends_at,
      request_id: requestId
    }
  };
}
