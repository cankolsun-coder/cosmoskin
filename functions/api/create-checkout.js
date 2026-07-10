import { getUserFromAccessToken, insertRow, insertRows, updateRows, selectRows } from './_lib/supabase.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { catalog } from './_lib/catalog.js';
import { buildPricedCatalogIndex, getPayableUnitPriceTry } from './_lib/product-pricing.js';
import { releaseInventoryReservations, reserveInventoryForOrder, stockValidationCode, validateCartStock } from './_lib/inventory.js';
import { json } from './_lib/response.js';
import { getPrimaryBankAccount, getValidatedBankAccounts } from './_lib/bank-accounts.js';
import { legalDocumentKeyFromConsent, legalDocumentSnapshot } from './_lib/legal-documents.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from './_lib/order-email.js';
import { recordEmailEvent } from './_lib/email-events.js';
import { validateCouponEligibility } from './_lib/coupons.js';
import { PRICING_SNAPSHOT_VERSION_V2, buildOrderItemPricingSnapshots } from './_lib/order-pricing-snapshot.js';

const VAT_RATE = 0.20;
const FREE_SHIPPING_LIMIT = 2500;
const SHIPPING_FEE = 89;
const EXPRESS_SURCHARGE = 0;
const DEFAULT_EFT_RESERVATION_MINUTES = 1440;
const MAX_CART_LINES = 30;
const MAX_TOTAL_QUANTITY = 99;
const MAX_ITEM_QUANTITY = 10;
const MAX_NOTE_LENGTH = 180;
const ALLOWED_INVOICE_TYPES = new Set(['Bireysel', 'Kurumsal']);
const PAYMENT_METHODS = new Set(['card', 'bank_transfer']);

class CheckoutError extends Error {
  constructor(message, status = 400, code = 'CHECKOUT_ERROR', extras = {}) {
    super(message);
    this.name = 'CheckoutError';
    this.status = status;
    this.code = code;
    this.errorKey = extras.error || null;
    this.items = Array.isArray(extras.items) ? extras.items : null;
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function clampText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
}

function normalizeTurkishPhone(value) {
  let digits = onlyDigits(value);
  if (digits.startsWith('0090')) digits = digits.slice(4);
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{9}$/.test(digits)) return null;
  return `+90${digits}`;
}

function isValidTurkishIdentityNumber(value) {
  const digits = onlyDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  if (digits[0] === '0') return false;
  const numbers = digits.split('').map(Number);
  const oddSum = numbers[0] + numbers[2] + numbers[4] + numbers[6] + numbers[8];
  const evenSum = numbers[1] + numbers[3] + numbers[5] + numbers[7];
  const tenth = ((oddSum * 7) - evenSum) % 10;
  const eleventh = numbers.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10;
  return numbers[9] === tenth && numbers[10] === eleventh;
}

function requireName(value, fieldName) {
  const normalized = clampText(value, 60);
  if (normalized.length < 2) throw new CheckoutError(`${fieldName} alanı geçersiz.`, 400, 'INVALID_CUSTOMER');
  if (!/^[A-Za-zÇĞİÖŞÜçğıöşü\s.'-]+$/.test(normalized)) throw new CheckoutError(`${fieldName} alanı yalnızca harf içermelidir.`, 400, 'INVALID_CUSTOMER');
  return normalized;
}

function validateCustomer(rawCustomer = {}) {
  const customer = {
    first_name: requireName(rawCustomer.first_name, 'Ad'),
    last_name: requireName(rawCustomer.last_name, 'Soyad'),
    email: normalizeEmail(rawCustomer.email),
    phone: normalizeTurkishPhone(rawCustomer.phone),
    identity_number: onlyDigits(rawCustomer.identity_number).slice(0, 11),
    city: clampText(rawCustomer.city, 60),
    district: clampText(rawCustomer.district, 80),
    postal_code: onlyDigits(rawCustomer.postal_code).slice(0, 5),
    invoice_type: clampText(rawCustomer.invoice_type || 'Bireysel', 20),
    address: clampText(rawCustomer.address, 300),
    cargo_note: clampText(rawCustomer.cargo_note, MAX_NOTE_LENGTH)
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)) throw new CheckoutError('E-posta adresi geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!customer.phone) throw new CheckoutError('Telefon numarası geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.identity_number && !isValidTurkishIdentityNumber(customer.identity_number)) throw new CheckoutError('T.C. kimlik numarası geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.city.length < 2) throw new CheckoutError('İl alanı geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.district.length < 2) throw new CheckoutError('İlçe alanı geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!/^\d{5}$/.test(customer.postal_code)) throw new CheckoutError('Posta kodu geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.address.length < 10) throw new CheckoutError('Adres alanı geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!ALLOWED_INVOICE_TYPES.has(customer.invoice_type)) customer.invoice_type = 'Bireysel';

  return customer;
}

function buildCatalogIndex(pricedIndex = null) {
  if (pricedIndex instanceof Map && pricedIndex.size) return pricedIndex;
  const products = Array.isArray(catalog) ? catalog : Object.values(catalog || {});
  const index = new Map();
  products.forEach((product) => {
    if (!product) return;
    [product.id, product.slug, product.product_id, product.sku].filter(Boolean).forEach((key) => {
      index.set(String(key), product);
    });
  });
  return index;
}

function findCatalogProduct(index, rawItem) {
  const keys = [rawItem.id, rawItem.product_id, rawItem.productId, rawItem.slug, rawItem.handle, rawItem.sku]
    .filter(Boolean)
    .map(String);
  for (const key of keys) {
    const product = index.get(key);
    if (product) return product;
  }
  return null;
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, MAX_ITEM_QUANTITY);
}

async function normalizeCart(context, rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) throw new CheckoutError('Sepet boş.', 400, 'EMPTY_CART');
  if (rawCart.length > MAX_CART_LINES) throw new CheckoutError('Sepette çok fazla ürün satırı var.', 400, 'CART_TOO_LARGE');

  const slugHints = Array.from(new Set(rawCart.map((rawItem) => String(
    rawItem?.slug || rawItem?.product_slug || rawItem?.product_id || rawItem?.id || ''
  ).trim()).filter(Boolean)));
  const catalogIndex = buildCatalogIndex(await buildPricedCatalogIndex(context, slugHints));
  const merged = new Map();
  let totalQuantity = 0;

  rawCart.forEach((rawItem) => {
    const product = findCatalogProduct(catalogIndex, rawItem || {});
    if (!product) throw new CheckoutError('Sepette geçersiz veya satışta olmayan ürün var.', 400, 'INVALID_CART_ITEM');

    const productId = String(product.id || product.slug || rawItem.id || '').trim();
    const unitPrice = normalizeMoney(getPayableUnitPriceTry(product));
    if (!productId || unitPrice <= 0 || product.checkout_price_valid === false) {
      throw new CheckoutError('Ürün fiyatı doğrulanamadı.', 400, 'INVALID_CART_ITEM');
    }

    const quantity = normalizeQuantity(rawItem.qty ?? rawItem.quantity ?? 1);
    totalQuantity += quantity;
    if (totalQuantity > MAX_TOTAL_QUANTITY) throw new CheckoutError('Sepette izin verilen toplam adet sınırı aşıldı.', 400, 'CART_TOO_LARGE');

    const existing = merged.get(productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_ITEM_QUANTITY);
      existing.line_total = normalizeMoney(existing.unit_price * existing.quantity);
      return;
    }

    merged.set(productId, {
      product_id: productId,
      product_slug: product.slug || rawItem.slug || null,
      product_name: clampText(product.name || rawItem.name || 'COSMOSKIN Ürünü', 120),
      brand: clampText(product.brand || rawItem.brand || 'COSMOSKIN', 80),
      category: clampText(product.category || '', 80) || null,
      categorySlug: clampText(product.categorySlug || '', 40) || null,
      unit_price: unitPrice,
      quantity,
      image: product.image || rawItem.image || null,
      line_total: normalizeMoney(unitPrice * quantity),
      effective_price_try: unitPrice,
      base_catalog_price_try: product.base_catalog_price_try ?? null,
      regular_price_try: product.regular_price_try ?? null,
      sale_price_try: product.sale_price_try ?? null,
      price_display_mode: product.price_display_mode || null,
      effective_price_source: product.effective_price_source || null,
      sale_active: Boolean(product.sale_active)
    });
  });

  const cart = Array.from(merged.values());
  if (!cart.length) throw new CheckoutError('Sepet boş.', 400, 'EMPTY_CART');
  return cart;
}

function calculateTotals(cart) {
  const subtotal = normalizeMoney(cart.reduce((sum, item) => sum + item.line_total, 0));
  const shipping = subtotal >= FREE_SHIPPING_LIMIT ? 0 : SHIPPING_FEE;
  const vat = normalizeMoney((subtotal * VAT_RATE) / (1 + VAT_RATE));
  const total = normalizeMoney(subtotal + shipping);
  return { subtotal, shipping, vat, total };
}

function responseItemsFromCart(cart = []) {
  return cart.map((item) => ({
    product_id: item.product_id || item.product_slug || null,
    product_slug: item.product_slug || item.product_id || null,
    product_name: item.product_name || 'COSMOSKIN Ürünü',
    brand: item.brand || 'COSMOSKIN',
    image: item.image || null,
    unit_price: normalizeMoney(item.unit_price),
    quantity: Number(item.quantity || 1),
    line_total: normalizeMoney(item.line_total || (Number(item.unit_price || 0) * Number(item.quantity || 1)))
  }));
}

function responseItemsFromRows(rows = []) {
  return rows.map((item) => ({
    product_id: item.product_id || item.product_slug || null,
    product_slug: item.product_slug || item.product_id || null,
    product_name: item.product_name || item.name || 'COSMOSKIN Ürünü',
    brand: item.brand || 'COSMOSKIN',
    image: item.image || item.product_image || null,
    unit_price: normalizeMoney(item.unit_price),
    quantity: Number(item.quantity || 1),
    line_total: normalizeMoney(item.line_total || (Number(item.unit_price || 0) * Number(item.quantity || 1)))
  }));
}

async function validateInventory(context, cart) {
  const result = await validateCartStock(context, cart.map((item) => ({
    product_slug: item.product_slug || item.product_id,
    product_name: item.product_name,
    quantity: item.quantity
  })));
  if (result.ok) return;
  const primaryReason = result.items?.[0]?.reason || 'out_of_stock';
  throw new CheckoutError(result.message, 409, stockValidationCode(primaryReason), {
    error: result.error || 'stock_unavailable',
    items: result.items || []
  });
}

async function applyCoupon(context, cart, subtotal, couponCode, customer = {}, user = null) {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code) return { code: null, type: null, discount: 0, freeShipping: false, label: null };
  const result = await validateCouponEligibility(context, {
    code,
    subtotal,
    user,
    customerEmail: customer.email,
    checkout: true,
    cartItems: cart
  });
  if (!result.eligible) {
    const reason = result.reason_code || result.reasonCode || 'coupon_inactive';
    const forbidden = new Set([
      'authentication_required',
      'membership_required',
      'membership_tier_not_allowed',
      'birthday_month_required',
      'smart_routine_required',
      'first_order_required'
    ]);
    const status = forbidden.has(reason) ? 403 : 400;
    throw new CheckoutError(result.customer_message || result.message || 'Kupon kullanım koşullarını şu anda karşılamıyor.', status, reason || 'INVALID_COUPON');
  }
  const coupon = result.coupon || {};
  const lineEligibility = Array.isArray(result.coupon_line_eligibility) ? result.coupon_line_eligibility : null;
  const eligibleSlugs = lineEligibility
    ? new Set(lineEligibility.filter((row) => row && row.eligible).map((row) => String(row.product_slug || '').trim()).filter(Boolean))
    : null;
  const allocationVersion = (lineEligibility && eligibleSlugs && eligibleSlugs.size > 0 && Number(result.discountAmount || 0) > 0)
    ? PRICING_SNAPSHOT_VERSION_V2
    : null;
  const label = result.discountType === 'percent'
    ? `%${Number(coupon.discount_value || 0)} indirim`
    : (result.freeShipping ? 'Ücretsiz kargo' : `₺${Number(result.discountAmount || coupon.discount_value || 0).toFixed(0)} indirim`);
  return {
    id: coupon.id || null,
    code: result.code,
    type: result.discountType,
    discount: result.discountAmount,
    freeShipping: result.freeShipping,
    minSubtotal: result.minSubtotal,
    maxDiscount: result.maxDiscount,
    label,
    eligibilityHash: `${result.code}:${Math.round(subtotal)}:${result.reason_code || result.reasonCode}`,
    eligibleSlugs,
    allocationVersion,
    customerNotice: result.customer_notice || null
  };
}

async function recordCouponUsage(context, { coupon, orderId, user, customer, discount, status = 'reserved', source = 'checkout' }) {
  if (!coupon?.code || !discount) return;
  const now = new Date().toISOString();
  await insertRow(context, 'coupon_redemptions', {
    coupon_id: coupon.id || null,
    order_id: orderId,
    user_id: user?.id || null,
    customer_email: String(customer?.email || '').trim().toLowerCase() || null,
    code: coupon.code,
    discount_amount: normalizeMoney(discount || 0),
    status,
    metadata: { source, payment_status: status === 'reserved' ? 'pending' : 'used' },
    created_at: now
  }).catch((error) => console.warn('coupon redemption log failed:', String(error?.message || error).slice(0, 180)));
  const customerCouponStatus = status === 'used' ? 'used' : 'reserved';
  if (user?.id) {
    await updateRows(context, 'customer_coupons', { user_id: user.id, code: coupon.code }, {
      status: customerCouponStatus,
      used_at: status === 'used' ? now : null,
      reserved_at: status === 'reserved' ? now : null,
      order_id: orderId,
      updated_at: now
    }).catch(() => null);
  }
  const email = String(customer?.email || '').trim().toLowerCase();
  if (email) {
    await updateRows(context, 'customer_coupons', { customer_email: email, code: coupon.code }, {
      status: customerCouponStatus,
      used_at: status === 'used' ? now : null,
      reserved_at: status === 'reserved' ? now : null,
      order_id: orderId,
      updated_at: now
    }).catch(() => null);
  }
}

function normalizeShippingMethod(value) {
  return 'standard';
}

function calculateTotalsWithCoupon(cart, coupon, shippingMethod = 'standard') {
  const subtotal = normalizeMoney(cart.reduce((sum, item) => sum + item.line_total, 0));
  const discount = normalizeMoney(Math.max(0, Math.min(subtotal, coupon?.discount || 0)));
  const discountedSubtotal = normalizeMoney(Math.max(0, subtotal - discount));
  let shipping = 0;
  if (discountedSubtotal > 0 && !coupon?.freeShipping) {
    const standardFee = discountedSubtotal >= FREE_SHIPPING_LIMIT ? 0 : SHIPPING_FEE;
    shipping = normalizeMoney(standardFee + (normalizeShippingMethod(shippingMethod) === 'express' ? EXPRESS_SURCHARGE : 0));
  }
  const vat = normalizeMoney((discountedSubtotal * VAT_RATE) / (1 + VAT_RATE));
  const total = normalizeMoney(Math.max(0, discountedSubtotal + shipping));
  return { subtotal, discount, shipping, vat, total };
}

function getEftReservationMinutes(env = {}) {
  const configured = Number(env.EFT_RESERVATION_MINUTES || DEFAULT_EFT_RESERVATION_MINUTES);
  if (!Number.isFinite(configured)) return DEFAULT_EFT_RESERVATION_MINUTES;
  return Math.max(30, Math.min(10080, Math.floor(configured)));
}

function createOrderNumber() {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CS-${Date.now()}-${random}`;
}

function iyzicoDate(value) {
  return new Date(value || Date.now()).toISOString().slice(0, 19).replace('T', ' ');
}

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '127.0.0.1';
}

function getUserAgent(request) {
  return clampText(request.headers.get('user-agent') || '', 240) || null;
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    code: error?.code || null
  };
}

function buildPricingSnapshotMetadata(item = {}) {
  const snapshot = {
    allocated_order_discount: normalizeMoney(item.allocated_order_discount),
    paid_line_total: normalizeMoney(item.paid_line_total),
    paid_unit_price: normalizeMoney(item.paid_unit_price),
    pricing_snapshot_version: item.pricing_snapshot_version || null,
    unit_price: normalizeMoney(item.unit_price),
    line_total: normalizeMoney(item.line_total),
    quantity: Math.max(1, Number(item.quantity || 1))
  };
  if (item.effective_price_try != null) snapshot.effective_price_try = normalizeMoney(item.effective_price_try);
  if (item.base_catalog_price_try != null) snapshot.base_catalog_price_try = Number(item.base_catalog_price_try);
  if (item.regular_price_try != null) snapshot.regular_price_try = Number(item.regular_price_try);
  if (item.sale_price_try != null) snapshot.sale_price_try = Number(item.sale_price_try);
  if (item.price_display_mode) snapshot.price_display_mode = String(item.price_display_mode);
  if (item.effective_price_source) snapshot.effective_price_source = String(item.effective_price_source);
  if (item.sale_active != null) snapshot.sale_active = Boolean(item.sale_active);
  return snapshot;
}

function serializeOrderItemInsertRow(orderId, item, options = {}) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const row = {
    order_id: orderId,
    product_id: String(item.product_id || item.product_slug || '').trim(),
    product_slug: item.product_slug || item.product_id || null,
    product_name: clampText(item.product_name || 'COSMOSKIN Ürünü', 120),
    brand: item.brand || null,
    sku: item.sku || null,
    image: item.image || null,
    unit_price: normalizeMoney(item.unit_price),
    quantity,
    line_total: normalizeMoney(item.line_total || (Number(item.unit_price || 0) * quantity))
  };
  if (options.includeSnapshots !== false) {
    if (item.allocated_order_discount != null) row.allocated_order_discount = normalizeMoney(item.allocated_order_discount);
    if (item.paid_line_total != null) row.paid_line_total = normalizeMoney(item.paid_line_total);
    if (item.paid_unit_price != null) row.paid_unit_price = normalizeMoney(item.paid_unit_price);
    if (item.pricing_snapshot_version) row.pricing_snapshot_version = String(item.pricing_snapshot_version);
  }
  if (options.metadataSnapshot) {
    row.metadata = {
      pricing_snapshot: buildPricingSnapshotMetadata(item)
    };
  }
  return row;
}

function isMissingOrderItemsSnapshotColumnError(error) {
  const msg = String(error?.message || '');
  return /allocated_order_discount|paid_line_total|paid_unit_price|pricing_snapshot_version/i.test(msg)
    && /(schema cache|does not exist|could not find)/i.test(msg);
}

async function persistOrderItems(context, orderId, cartWithSnapshots) {
  const rowsWithSnapshots = cartWithSnapshots.map((item) => serializeOrderItemInsertRow(orderId, item, { includeSnapshots: true }));
  try {
    await insertRows(context, 'order_items', rowsWithSnapshots);
    return;
  } catch (error) {
    if (!isMissingOrderItemsSnapshotColumnError(error)) throw error;
    const legacyRows = cartWithSnapshots.map((item) => serializeOrderItemInsertRow(orderId, item, {
      includeSnapshots: false,
      metadataSnapshot: true
    }));
    await insertRows(context, 'order_items', legacyRows);
  }
}

function mapPersistenceError(error) {
  const msg = String(error?.message || '');
  if (/checkout_idempotency_key/i.test(msg) && /(schema cache|does not exist|could not find)/i.test(msg)) {
    return new CheckoutError('Sipariş kaydı yapılandırması eksik. Lütfen destek ile iletişime geçin.', 503, 'CHECKOUT_SCHEMA_MISMATCH');
  }
  if (/order_items/i.test(msg) || /category/i.test(msg) || isMissingOrderItemsSnapshotColumnError(error)) {
    return new CheckoutError('Sipariş kalemleri kaydedilemedi. Lütfen tekrar deneyin.', 500, 'ORDER_ITEMS_PERSISTENCE_FAILED');
  }
  return null;
}

function buildIyzicoBasketItems(cart, shipping, discount = 0, coupon = null) {
  const config = coupon?.eligibleSlugs
    ? { version: coupon.allocationVersion || PRICING_SNAPSHOT_VERSION_V2, eligibility: coupon.eligibleSlugs }
    : undefined;
  const snapshots = buildOrderItemPricingSnapshots(cart, discount, config);
  const items = snapshots.map((item) => ({
    id: item.product_id,
    name: item.product_name,
    category1: 'Skincare',
    itemType: 'PHYSICAL',
    price: normalizeMoney(Math.max(0.01, item.paid_line_total)).toFixed(2)
  }));

  if (shipping > 0) {
    items.push({
      id: 'shipping',
      name: 'Kargo Ücreti',
      category1: 'Shipping',
      itemType: 'PHYSICAL',
      price: shipping.toFixed(2)
    });
  }

  return items;
}

function getPublicSiteUrl(env) {
  return String(env.PUBLIC_SITE_URL || 'https://www.cosmoskin.com.tr').replace(/\/$/, '');
}


function checkboxAccepted(value) {
  return value === true || value === 'true' || value === 'on' || value === '1' || value === 'accepted';
}

function validateCheckoutConsents(rawCustomer = {}) {
  const kvkk = checkboxAccepted(rawCustomer.kvkk_acknowledged) || checkboxAccepted(rawCustomer.kvkk_terms);
  const preliminary = checkboxAccepted(rawCustomer.preliminary_information_accepted) || checkboxAccepted(rawCustomer.sales_terms);
  const distance = checkboxAccepted(rawCustomer.distance_sales_accepted) || checkboxAccepted(rawCustomer.sales_terms);
  if (!kvkk) throw new CheckoutError('KVKK aydınlatma metni bilgilendirmesini onaylamalısın.', 400, 'CONSENT_REQUIRED');
  if (!preliminary) throw new CheckoutError('Ön bilgilendirme formunu onaylamalısın.', 400, 'CONSENT_REQUIRED');
  if (!distance) throw new CheckoutError('Mesafeli satış sözleşmesini onaylamalısın.', 400, 'CONSENT_REQUIRED');
  return {
    kvkk_acknowledged: kvkk,
    preliminary_information_accepted: preliminary,
    distance_sales_accepted: distance,
    marketing_email_opt_in: checkboxAccepted(rawCustomer.marketing_email_opt_in) || checkboxAccepted(rawCustomer.marketing_optin),
    newsletter_opt_in: checkboxAccepted(rawCustomer.newsletter_opt_in)
  };
}

async function recordCheckoutConsents(context, { user, email, consents, orderId }) {
  const rows = [
    ['kvkk_acknowledged', consents.kvkk_acknowledged, 'acknowledged'],
    ['preliminary_information_accepted', consents.preliminary_information_accepted, 'accepted'],
    ['distance_sales_accepted', consents.distance_sales_accepted, 'accepted'],
    ['marketing_email_opt_in', consents.marketing_email_opt_in, consents.marketing_email_opt_in ? 'accepted' : 'declined'],
    ['newsletter_opt_in', consents.newsletter_opt_in, consents.newsletter_opt_in ? 'accepted' : 'declined']
  ].map(([consent_type, accepted, status]) => ({
    user_id: user?.id || null,
    email,
    consent_type,
    status,
    source: 'checkout',
    metadata: { order_id: orderId || null, page: 'checkout.html' }
  }));
  await insertRows(context, 'consent_records', rows).catch((error) => console.error('checkout consent record failed:', { message: error.message }));
}


async function recordOrderLegalConsents(context, { orderId, user, email, consents, request }) {
  if (!orderId) return;
  const acceptedAt = new Date().toISOString();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);
  const consentSpecs = [
    ['kvkk_acknowledged', consents.kvkk_acknowledged],
    ['preliminary_information_accepted', consents.preliminary_information_accepted],
    ['distance_sales_accepted', consents.distance_sales_accepted]
  ];
  const rows = [];
  const snapshots = [];
  for (const [consent_type, accepted] of consentSpecs) {
    const key = legalDocumentKeyFromConsent(consent_type);
    const doc = await legalDocumentSnapshot(key);
    const base = {
      order_id: orderId,
      user_id: user?.id || null,
      email: email || null,
      document_key: doc.key,
      document_title: doc.title,
      document_version: doc.version,
      document_hash: doc.hash,
      document_url: doc.url,
      accepted_at: acceptedAt,
      ip_address: ip,
      user_agent: userAgent,
      source: 'checkout',
      metadata: { source_page: 'checkout.html' }
    };
    rows.push({ ...base, consent_type, accepted: Boolean(accepted) });
    snapshots.push(base);
  }
  await insertRows(context, 'order_legal_consents', rows).catch((error) => console.error('order legal consent record failed:', { message: error.message }));
  await insertRows(context, 'order_legal_snapshots', snapshots).catch((error) => console.error('order legal snapshot record failed:', { message: error.message }));
}

function requireBillingText(value, fieldName, minLength = 2, maxLength = 180) {
  const normalized = clampText(value, maxLength);
  if (normalized.length < minLength) throw new CheckoutError(`${fieldName} alanı geçersiz.`, 400, 'INVALID_INVOICE');
  return normalized;
}

function requireBillingEmail(value, fieldName = 'Fatura e-posta') {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new CheckoutError(`${fieldName} alanı geçersiz.`, 400, 'INVALID_INVOICE');
  return email;
}

function normalizeInvoicePayload(invoicePayload = {}, customer = {}) {
  const rawType = String(invoicePayload.type || invoicePayload.billing_type || '').toLowerCase();
  const isCorporate = rawType === 'corporate' || rawType === 'kurumsal' || customer.invoice_type === 'Kurumsal';
  const sameAsDelivery = invoicePayload.sameAsDelivery !== false && invoicePayload.same_as_delivery !== false;
  const billingAddress = requireBillingText(invoicePayload.address || invoicePayload.billing_address || (sameAsDelivery ? customer.address : ''), 'Fatura adresi', 10, 300);
  const billingCity = requireBillingText(invoicePayload.city || invoicePayload.billing_city || (sameAsDelivery ? customer.city : ''), 'Fatura ili', 2, 60);
  const billingDistrict = requireBillingText(invoicePayload.district || invoicePayload.billing_district || (sameAsDelivery ? customer.district : ''), 'Fatura ilçesi', 2, 80);
  const billingPostalCode = onlyDigits(invoicePayload.postalCode || invoicePayload.postal_code || invoicePayload.billing_postal_code || (sameAsDelivery ? customer.postal_code : '')).slice(0, 5);
  if (!/^\d{5}$/.test(billingPostalCode)) throw new CheckoutError('Fatura posta kodu geçersiz.', 400, 'INVALID_INVOICE');

  if (isCorporate) {
    const companyTitle = requireBillingText(invoicePayload.company || invoicePayload.companyTitle || invoicePayload.company_title, 'Firma ünvanı', 2, 180);
    const taxOffice = requireBillingText(invoicePayload.taxOffice || invoicePayload.tax_office, 'Vergi dairesi', 2, 120);
    const taxNumber = onlyDigits(invoicePayload.taxNumber || invoicePayload.tax_number).slice(0, 20);
    if (!/^\d{10,11}$/.test(taxNumber)) throw new CheckoutError('Vergi numarası 10 veya 11 haneli olmalıdır.', 400, 'INVALID_INVOICE');
    const corporateEmail = requireBillingEmail(invoicePayload.corporateEmail || invoicePayload.corporate_email || invoicePayload.email || customer.email, 'Kurumsal fatura e-posta');
    return {
      invoice_type: 'Kurumsal',
      billing_first_name: null,
      billing_last_name: null,
      billing_email: corporateEmail,
      billing_phone: normalizeTurkishPhone(invoicePayload.phone || invoicePayload.billing_phone || customer.phone) || customer.phone,
      company_title: companyTitle,
      tax_office: taxOffice,
      tax_number: taxNumber,
      corporate_email: corporateEmail,
      is_e_invoice_taxpayer: Boolean(invoicePayload.eInvoice || invoicePayload.is_e_invoice_taxpayer),
      billing_address_line: billingAddress,
      billing_city: billingCity,
      billing_district: billingDistrict,
      billing_postal_code: billingPostalCode
    };
  }

  const billingName = requireBillingText(invoicePayload.name || invoicePayload.billing_name || `${customer.first_name || ''} ${customer.last_name || ''}`, 'Fatura adı soyadı', 2, 120);
  const nameParts = billingName.split(/\s+/).filter(Boolean);
  const billingFirstName = requireBillingText(nameParts.shift() || customer.first_name, 'Fatura adı', 2, 60);
  const billingLastName = requireBillingText(nameParts.join(' ') || customer.last_name, 'Fatura soyadı', 2, 80);
  return {
    invoice_type: 'Bireysel',
    billing_first_name: billingFirstName,
    billing_last_name: billingLastName,
    billing_email: requireBillingEmail(invoicePayload.email || invoicePayload.billing_email || customer.email),
    billing_phone: normalizeTurkishPhone(invoicePayload.phone || invoicePayload.billing_phone || customer.phone) || customer.phone,
    company_title: null,
    tax_office: null,
    tax_number: null,
    corporate_email: null,
    is_e_invoice_taxpayer: false,
    billing_address_line: billingAddress,
    billing_city: billingCity,
    billing_district: billingDistrict,
    billing_postal_code: billingPostalCode
  };
}


function requireCardIdentityNumber(paymentMethod, customer, invoiceDetails) {
  if (paymentMethod !== 'card') return;
  if (invoiceDetails?.invoice_type !== 'Bireysel') return;
  if (!customer.identity_number || !isValidTurkishIdentityNumber(customer.identity_number)) {
    throw new CheckoutError('Kartlı ödeme ile bireysel fatura için geçerli T.C. kimlik numarası zorunludur.', 400, 'IDENTITY_NUMBER_REQUIRED');
  }
}

function assertOrderEnvironment(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CheckoutError('Sipariş sistemi yapılandırması eksik.', 503, 'SERVICE_NOT_CONFIGURED');
  }
}

function assertCardPaymentEnvironment(env) {
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) {
    throw new CheckoutError('Kredi kartı ödeme altyapısı şu anda yapılandırılıyor. Lütfen Havale/EFT seçeneğini kullanın.', 503, 'PAYMENT_NOT_CONFIGURED');
  }
}

function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) {
    throw new CheckoutError('Checkout işlem anahtarı geçersiz. Sayfayı yenileyip tekrar deneyin.', 400, 'INVALID_IDEMPOTENCY_KEY');
  }
  return key;
}

function orderTotalsFromRow(order = {}) {
  return {
    subtotal: normalizeMoney(order.subtotal_amount),
    discount: normalizeMoney(order.discount_amount),
    shipping: normalizeMoney(order.shipping_amount),
    vat: normalizeMoney(order.vat_amount),
    total: normalizeMoney(order.total_amount)
  };
}

function extractClientSubtotalHint(payload = {}) {
  const totals = payload.totals && typeof payload.totals === 'object' ? payload.totals : null;
  const candidates = [
    totals?.subtotal,
    payload.client_subtotal,
    payload.clientSubtotal,
    payload.expected_subtotal,
    payload.expectedSubtotal
  ];
  for (const candidate of candidates) {
    const value = normalizeMoney(candidate);
    if (value > 0) return value;
  }
  return null;
}

function buildPriceChangedNotice(payload = {}, serverSubtotal = 0) {
  const clientSubtotal = extractClientSubtotalHint(payload);
  const server = normalizeMoney(serverSubtotal);
  if (clientSubtotal == null || clientSubtotal <= 0 || Math.abs(clientSubtotal - server) < 0.01) return null;
  return {
    price_changed: true,
    repriced: true,
    client_subtotal: clientSubtotal,
    server_subtotal: server,
    message: 'Sepetindeki fiyatlar güncellendi. Lütfen toplamı kontrol edip tekrar dene.'
  };
}

async function existingCheckoutResponse(context, idempotencyKey, customerEmail, expectedMethod) {
  const rows = await selectRows(context, 'orders', {
    select: 'id,order_number,status,payment_status,payment_method,customer_email,subtotal_amount,discount_amount,shipping_amount,vat_amount,total_amount,metadata,created_at',
    checkout_idempotency_key: `eq.${idempotencyKey}`,
    limit: '1'
  }).catch((error) => {
    if (/checkout_idempotency_key|column .* does not exist|schema cache/i.test(String(error?.message || ''))) {
      throw new CheckoutError('Checkout idempotency migration henüz uygulanmamış. Sipariş oluşturulmadı.', 503, 'CHECKOUT_IDEMPOTENCY_MIGRATION_MISSING');
    }
    throw error;
  });
  const order = rows?.[0];
  if (!order) return null;
  if (normalizeEmail(order.customer_email) !== normalizeEmail(customerEmail) || order.payment_method !== expectedMethod) {
    throw new CheckoutError('Bu işlem anahtarı başka bir checkout denemesinde kullanılmış.', 409, 'IDEMPOTENCY_CONFLICT');
  }

  const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  if (expectedMethod === 'bank_transfer') {
    const itemRows = await selectRows(context, 'order_items', {
      select: 'product_id,product_slug,product_name,brand,image,unit_price,quantity,line_total',
      order_id: `eq.${order.id}`,
      order: 'created_at.asc'
    }).catch(() => []);
    const bankAccounts = await getValidatedBankAccounts(context, 5).catch(() => []);
    return {
      ok: true,
      idempotent: true,
      orderId: order.id,
      orderNumber: order.order_number,
      paymentMethod: 'bank_transfer',
      orderStatus: order.status,
      paymentStatus: order.payment_status,
      paymentDeadline: metadata.payment_deadline || null,
      bankAccount: metadata.bank_account || bankAccounts[0] || null,
      bankAccounts,
      customerEmail: order.customer_email,
      items: responseItemsFromRows(itemRows),
      totals: orderTotalsFromRow(order),
      message: 'Siparişiniz daha önce oluşturuldu. Aynı sipariş bilgileri gösteriliyor.'
    };
  }

  if (['cancelled', 'payment_failed'].includes(order.status) || ['failed'].includes(order.payment_status)) {
    throw new CheckoutError('Önceki ödeme başlatma denemesi kapanmış. Lütfen tekrar deneyin.', 409, 'CHECKOUT_ATTEMPT_CLOSED');
  }
  const payments = await selectRows(context, 'payments', {
    select: 'status,provider_token,raw_initialize_response,created_at',
    order_id: `eq.${order.id}`,
    provider: 'eq.iyzico',
    order: 'created_at.desc',
    limit: '1'
  }).catch(() => []);
  const payment = payments?.[0];
  const raw = payment?.raw_initialize_response && typeof payment.raw_initialize_response === 'object'
    ? payment.raw_initialize_response
    : {};
  if (payment?.status === 'initiated' && (raw.token || raw.paymentPageUrl || raw.checkoutFormContent || payment.provider_token)) {
    return {
      ok: true,
      idempotent: true,
      orderId: order.id,
      orderNumber: order.order_number,
      token: raw.token || payment.provider_token || null,
      paymentPageUrl: raw.paymentPageUrl || null,
      checkoutFormContent: raw.checkoutFormContent || null
    };
  }
  throw new CheckoutError('Ödeme isteğiniz işleniyor. Yeni bir sipariş oluşturmadan kısa süre sonra tekrar kontrol edin.', 409, 'CHECKOUT_IN_PROGRESS');
}

export async function onRequestPost(context) {
  let reservedOrderId = null;
  let persistedOrder = null;
  try {
    assertOrderEnvironment(context.env || {});

    const contentType = String(context.request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) throw new CheckoutError('İstek içerik türü application/json olmalıdır.', 415, 'UNSUPPORTED_MEDIA_TYPE');
    const payload = await context.request.json().catch(() => {
      throw new CheckoutError('Geçersiz istek formatı.', 400, 'INVALID_JSON');
    });

    const paymentMethod = PAYMENT_METHODS.has(String(payload.payment_method || payload.paymentMethod || 'card'))
      ? String(payload.payment_method || payload.paymentMethod || 'card')
      : 'card';
    if (paymentMethod === 'card') assertCardPaymentEnvironment(context.env || {});

    let bankAccount = null;
    let bankAccounts = [];
    if (paymentMethod === 'bank_transfer') {
      try {
        bankAccounts = await getValidatedBankAccounts(context, 5);
        bankAccount = bankAccounts[0] || await getPrimaryBankAccount(context);
      } catch (error) {
        console.error('checkout bank account validation failed:', { message: String(error?.message || 'unknown').slice(0, 180) });
        throw new CheckoutError('Havale/EFT bilgileri şu anda doğrulanamıyor. Sipariş oluşturulmadı.', 503, 'BANK_ACCOUNT_UNAVAILABLE');
      }
      if (!bankAccount) {
        throw new CheckoutError('Havale/EFT ödeme bilgileri henüz yapılandırılmadı. Sipariş oluşturulmadı.', 503, 'BANK_ACCOUNT_NOT_CONFIGURED');
      }
    }

    const accessToken = payload.accessToken || null;
    const rawCustomer = payload.customer || {};
    const consents = validateCheckoutConsents(rawCustomer);
    const customer = validateCustomer(rawCustomer);
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotency_key || payload.idempotencyKey || context.request.headers.get('idempotency-key'));
    const existing = await existingCheckoutResponse(context, idempotencyKey, customer.email, paymentMethod);
    if (existing) return json(existing, { headers: { 'Cache-Control': 'no-store, max-age=0' } });

    const cart = await normalizeCart(context, payload.cart || []);
    const user = accessToken ? await getUserFromAccessToken(context, accessToken) : null;
    if (accessToken && !user) throw new CheckoutError('Oturum süresi dolmuş. Lütfen tekrar giriş yap.', 401, 'INVALID_SESSION');

    await validateInventory(context, cart);
    const baseTotals = calculateTotals(cart);
    const coupon = await applyCoupon(context, cart, baseTotals.subtotal, payload.coupon_code || payload.couponCode, customer, user);
    const shippingMethod = normalizeShippingMethod(payload.shipping?.method || payload.shipping_method);
    const totals = calculateTotalsWithCoupon(cart, coupon, shippingMethod);
    const eftReservationMinutes = paymentMethod === 'bank_transfer' ? getEftReservationMinutes(context.env || {}) : 15;
    const paymentDeadline = paymentMethod === 'bank_transfer' ? new Date(Date.now() + eftReservationMinutes * 60 * 1000).toISOString() : null;
    const orderNumber = createOrderNumber();
    const orderId = crypto.randomUUID();
    const invoicePayload = payload.invoice && typeof payload.invoice === 'object' ? payload.invoice : {};
    const deliveryPayload = payload.delivery && typeof payload.delivery === 'object' ? payload.delivery : {};
    const shippingPayload = payload.shipping && typeof payload.shipping === 'object' ? payload.shipping : {};
    const orderStatus = paymentMethod === 'bank_transfer' ? 'pending_bank_transfer' : 'pending_payment';
    const initialPaymentStatus = paymentMethod === 'bank_transfer' ? 'awaiting_transfer' : 'pending';
    const fulfillmentStatus = 'not_started';
    const invoiceDetails = normalizeInvoicePayload(invoicePayload, customer);
    requireCardIdentityNumber(paymentMethod, customer, invoiceDetails);
    const legalConsents = {
      kvkk: consents.kvkk_acknowledged,
      pre_information: consents.preliminary_information_accepted,
      distance_sales: consents.distance_sales_accepted,
      accepted_at: payload.legal_approved_at || new Date().toISOString(),
      ip_address: getClientIp(context.request),
      user_agent: getUserAgent(context.request)
    };

    let reservations = [];
    try {
      reservations = await reserveInventoryForOrder(context, orderId, cart, {
        minutes: eftReservationMinutes,
        session_id: payload.session_id || payload.sessionId || null,
        created_by: 'checkout'
      });
      reservedOrderId = orderId;
    } catch (reservationError) {
      throw new CheckoutError(
        reservationError.message || 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.',
        reservationError.status || 409,
        reservationError.code || 'INSUFFICIENT_STOCK',
        { error: 'stock_unavailable', items: cart.map((item) => ({ product_id: item.product_id, slug: item.product_slug, name: item.product_name, requested_quantity: item.quantity, available_quantity: null, reason: 'reservation_failed' })) }
      );
    }

    const orderPayload = {
      id: orderId,
      checkout_idempotency_key: idempotencyKey,
      user_id: user?.id || null,
      order_number: orderNumber,
      status: orderStatus,
      payment_status: initialPaymentStatus,
      fulfillment_status: fulfillmentStatus,
      payment_method: paymentMethod,
      currency: 'TRY',
      subtotal_amount: totals.subtotal,
      discount_amount: totals.discount || 0,
      vat_amount: totals.vat,
      shipping_amount: totals.shipping,
      total_amount: totals.total,
      coupon_code: coupon.code || null,
      customer_email: customer.email,
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone,
      invoice_type: invoiceDetails.invoice_type,
      identity_number: paymentMethod === 'card' ? customer.identity_number : null,
      city: customer.city,
      district: customer.district,
      postal_code: customer.postal_code,
      address_line: customer.address,
      billing_first_name: invoiceDetails.billing_first_name,
      billing_last_name: invoiceDetails.billing_last_name,
      billing_email: invoiceDetails.billing_email,
      billing_phone: invoiceDetails.billing_phone,
      company_title: invoiceDetails.company_title,
      tax_office: invoiceDetails.tax_office,
      tax_number: invoiceDetails.tax_number,
      corporate_email: invoiceDetails.corporate_email,
      is_e_invoice_taxpayer: invoiceDetails.is_e_invoice_taxpayer,
      billing_address_line: invoiceDetails.billing_address_line,
      billing_city: invoiceDetails.billing_city,
      billing_district: invoiceDetails.billing_district,
      billing_postal_code: invoiceDetails.billing_postal_code,
      legal_consents: legalConsents,
      cargo_note: customer.cargo_note || null,
      ip_address: getClientIp(context.request),
      user_agent: getUserAgent(context.request),
      metadata: {
        source: 'checkout',
        idempotency_key: idempotencyKey,
        payment_method: paymentMethod,
        cart_line_count: cart.length,
        coupon: coupon.code || null,
        coupon_label: coupon.label || null,
        coupon_type: coupon.type || null,
        free_shipping: Boolean(coupon.freeShipping),
        delivery: deliveryPayload,
        invoice: invoicePayload,
        invoice_details: invoiceDetails,
        shipping: { ...shippingPayload, method: shippingMethod },
        bank_account: bankAccount ? { id: bankAccount.id, bankName: bankAccount.bankName, accountName: bankAccount.accountName, iban: bankAccount.iban, branch: bankAccount.branch, currency: bankAccount.currency } : null,
        payment_deadline: paymentDeadline,
        reservation_minutes: eftReservationMinutes,
        legal_approved_at: payload.legal_approved_at || new Date().toISOString(),
        consents: {
          marketing_email_opt_in: consents.marketing_email_opt_in,
          newsletter_opt_in: consents.newsletter_opt_in,
          pre_information_version: payload.legal?.pre_information_version || 'legal-20260702',
          distance_sales_version: payload.legal?.distance_sales_version || 'legal-20260702',
          privacy_notice_version: payload.legal?.privacy_notice_version || 'legal-20260702',
          accepted_terms_at: payload.legal?.accepted_terms_at || payload.legal_approved_at || new Date().toISOString(),
          accepted_privacy_at: payload.legal?.accepted_privacy_at || payload.legal_approved_at || new Date().toISOString(),
          marketing_consent_at: consents.marketing_email_opt_in ? (payload.legal?.marketing_consent_at || new Date().toISOString()) : null
        }
      }
    };

    try {
      persistedOrder = await insertRow(context, 'orders', orderPayload);
      const snapshotConfig = coupon?.eligibleSlugs
        ? { version: coupon.allocationVersion || PRICING_SNAPSHOT_VERSION_V2, eligibility: coupon.eligibleSlugs }
        : undefined;
      const cartWithSnapshots = buildOrderItemPricingSnapshots(cart, totals.discount || 0, snapshotConfig);
      await persistOrderItems(context, orderId, cartWithSnapshots);
      await insertRow(context, 'order_status_events', {
        order_id: orderId,
        status: orderStatus,
        event_type: 'order_created',
        previous_status: null,
        new_status: orderStatus,
        source: 'system',
        created_by: 'system',
        message: paymentMethod === 'bank_transfer' ? 'Sipariş oluşturuldu, Havale/EFT ödemesi bekleniyor.' : 'Sipariş oluşturuldu, ödeme bekleniyor.',
        note: paymentMethod === 'bank_transfer' ? 'Havale/EFT ödemesi bekleniyor.' : 'Sipariş oluşturuldu, ödeme bekleniyor.',
        metadata: { order_number: orderNumber, payment_method: paymentMethod }
      });
      await insertRow(context, 'order_status_events', {
        order_id: orderId,
        status: 'stock_reserved',
        event_type: 'stock_reserved',
        source: 'inventory',
        created_by: 'system',
        message: paymentMethod === 'bank_transfer' ? 'Havale/EFT siparişi için stok rezervasyonu oluşturuldu.' : 'Checkout için 15 dakikalık stok rezervasyonu oluşturuldu.',
        note: paymentMethod === 'bank_transfer' ? 'Havale/EFT ödeme onayı bekleniyor.' : 'Checkout için 15 dakikalık stok rezervasyonu oluşturuldu.',
        metadata: { reservation_count: reservations.length, payment_method: paymentMethod }
      });
      await recordCheckoutConsents(context, { user, email: customer.email, consents, orderId });
      await recordOrderLegalConsents(context, { orderId, user, email: customer.email, consents, request: context.request });
      await recordCouponUsage(context, { coupon, orderId, user, customer, discount: totals.discount || 0, status: 'reserved', source: paymentMethod === 'bank_transfer' ? 'checkout_bank_transfer' : 'checkout_card' });
    } catch (persistenceError) {
      await releaseInventoryReservations(context, orderId, 'order_persistence_failed').catch(() => null);
      if (persistedOrder) {
        await updateRows(context, 'orders', { id: orderId }, {
          status: 'cancelled', payment_status: 'failed', fulfillment_status: 'cancelled', updated_at: new Date().toISOString()
        }).catch(() => null);
      }
      if (/checkout_idempotency_key|duplicate key|unique constraint/i.test(String(persistenceError?.message || ''))) {
        const raced = await existingCheckoutResponse(context, idempotencyKey, customer.email, paymentMethod).catch(() => null);
        if (raced) return json(raced, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      }
      const mappedPersistence = mapPersistenceError(persistenceError);
      if (mappedPersistence instanceof CheckoutError) throw mappedPersistence;
      throw persistenceError;
    }

    if (paymentMethod === 'bank_transfer') {
      await insertRow(context, 'payments', {
        order_id: orderId,
        provider: 'bank_transfer',
        status: 'awaiting_transfer',
        amount: totals.total,
        currency: 'TRY',
        conversation_id: orderId,
        raw_initialize_response: {
          payment_method: 'bank_transfer',
          payment_status: 'awaiting_transfer',
          payment_deadline: paymentDeadline,
          bank_account_id: bankAccount.id || null,
          message: 'Havale/EFT ödemesi bekleniyor.'
        }
      });
      await insertRow(context, 'order_status_events', {
        order_id: orderId,
        status: 'awaiting_transfer',
        event_type: 'payment_awaiting_transfer',
        previous_status: 'pending_bank_transfer',
        new_status: 'pending_bank_transfer',
        source: 'checkout',
        created_by: 'checkout',
        message: 'Havale/EFT ödeme onayı bekleniyor.',
        note: 'Müşteri açıklama alanına sipariş numarasını yazmalıdır.',
        metadata: { order_number: orderNumber, payment_method: 'bank_transfer', payment_deadline: paymentDeadline }
      }).catch(() => null);
      try {
        const emailOrder = { ...orderPayload, order_items: cart };
        const emailResult = await sendCommerceTransactionalEmail(context.env || {}, { order: emailOrder, type: 'bank_transfer_pending', bankAccounts });
        await recordEmailEvent(context, {
          order_id: orderId,
          customer_email: customer.email,
          email_type: 'bank_transfer_pending',
          provider: emailResult.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
          status: emailResult.sent ? 'sent' : (emailResult.skipped ? 'skipped' : 'failed'),
          subject: getCommerceEmailSubject('bank_transfer_pending'),
          provider_message_id: emailResult.provider_message_id || null,
          error_message: emailResult.reason || emailResult.error || null,
          metadata: { source: 'checkout' }
        });
      } catch (emailError) {
        await recordEmailEvent(context, {
          order_id: orderId,
          customer_email: customer.email,
          email_type: 'bank_transfer_pending',
          provider: context.env.BREVO_API_KEY ? 'brevo' : null,
          status: 'failed',
          subject: getCommerceEmailSubject('bank_transfer_pending'),
          error_message: String(emailError?.message || 'email_failed').slice(0, 700),
          metadata: { source: 'checkout' }
        }).catch(() => null);
      }
      return json({
        ok: true,
        orderId,
        orderNumber,
        paymentMethod: 'bank_transfer',
        orderStatus: 'pending_bank_transfer',
        paymentStatus: 'awaiting_transfer',
        paymentDeadline,
        bankAccount,
        bankAccounts,
        customerEmail: customer.email,
        items: responseItemsFromCart(cart),
        totals,
        ...(buildPriceChangedNotice(payload, totals.subtotal) || {}),
        message: 'Siparişiniz oluşturuldu. Havale/EFT ödemeniz bekleniyor.'
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    const callbackUrl = `${getPublicSiteUrl(context.env)}/api/iyzico-callback`;
    const ip = getClientIp(context.request);
    const buyerName = `${customer.first_name} ${customer.last_name}`.trim();
    const basketItems = buildIyzicoBasketItems(cart, totals.shipping, totals.discount || 0, coupon);

    let iyzicoRes = null;
    try {
      iyzicoRes = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', context.env, {
        locale: 'tr',
        conversationId: orderId,
        price: totals.total.toFixed(2),
        paidPrice: totals.total.toFixed(2),
        currency: 'TRY',
        basketId: orderId,
        paymentGroup: 'PRODUCT',
        callbackUrl,
        enabledInstallments: [1, 2, 3],
        buyer: {
          id: user?.id || `guest-${orderId}`,
          name: customer.first_name,
          surname: customer.last_name,
          gsmNumber: customer.phone,
          email: customer.email,
          identityNumber: customer.identity_number,
          lastLoginDate: iyzicoDate(),
          registrationDate: iyzicoDate(user?.created_at),
          registrationAddress: customer.address,
          ip,
          city: customer.city,
          country: 'Turkey',
          zipCode: customer.postal_code
        },
        shippingAddress: { contactName: buyerName, city: customer.city, country: 'Turkey', address: customer.address, zipCode: customer.postal_code },
        billingAddress: {
          contactName: invoiceDetails.company_title || [invoiceDetails.billing_first_name, invoiceDetails.billing_last_name].filter(Boolean).join(' ') || buyerName,
          city: invoiceDetails.billing_city,
          country: 'Turkey',
          address: invoiceDetails.billing_address_line,
          zipCode: invoiceDetails.billing_postal_code
        },
        basketItems
      });
    } catch (paymentError) {
      await insertRow(context, 'payments', {
        order_id: orderId,
        provider: 'iyzico',
        status: 'initialize_failed',
        amount: totals.total,
        currency: 'TRY',
        conversation_id: orderId,
        raw_initialize_response: { error: serializeError(paymentError) }
      }).catch(() => null);
      await releaseInventoryReservations(context, orderId, 'payment_initialize_failed').catch(() => null);
      await updateRows(context, 'coupon_redemptions', { order_id: orderId }, { status: 'released', metadata: { source: 'payment_initialize_failed' } }).catch(() => null);
      await updateRows(context, 'orders', { id: orderId }, {
        status: 'cancelled', payment_status: 'failed', fulfillment_status: 'cancelled',
        metadata: { ...orderPayload.metadata, payment_initialize_error: serializeError(paymentError) }
      }).catch(() => null);
      await insertRow(context, 'order_status_events', {
        order_id: orderId,
        status: 'payment_failed',
        event_type: 'payment_failed',
        previous_status: 'pending_payment',
        new_status: 'cancelled',
        source: 'payment',
        created_by: 'payment_initialize',
        message: 'iyzico ödeme formu başlatılamadı.',
        note: 'iyzico ödeme formu başlatılamadı.',
        metadata: { error: serializeError(paymentError) }
      }).catch(() => null);
      throw new CheckoutError(paymentError.message || 'Ödeme başlatılamadı. Lütfen bilgileri kontrol edip tekrar deneyin.', 502, 'PAYMENT_INITIALIZE_FAILED');
    }

    const iyzicoStatus = String(iyzicoRes?.status || '').toLowerCase();
    const paymentSucceeded = iyzicoStatus === 'success' && (iyzicoRes.token || iyzicoRes.paymentPageUrl || iyzicoRes.checkoutFormContent);
    await insertRow(context, 'payments', {
      order_id: orderId,
      provider: 'iyzico',
      status: paymentSucceeded ? 'initiated' : 'initialize_failed',
      amount: totals.total,
      currency: 'TRY',
      conversation_id: orderId,
      provider_token: iyzicoRes?.token || null,
      raw_initialize_response: iyzicoRes || null
    });

    if (!paymentSucceeded) {
      await updateRows(context, 'orders', { id: orderId }, { status: 'cancelled', payment_status: 'failed', fulfillment_status: 'cancelled' });
      await releaseInventoryReservations(context, orderId, 'payment_initialize_failed').catch(() => null);
      await updateRows(context, 'coupon_redemptions', { order_id: orderId }, { status: 'released', metadata: { source: 'payment_initialize_failed' } }).catch(() => null);
      await insertRow(context, 'order_status_events', {
        order_id: orderId,
        status: 'payment_failed',
        event_type: 'payment_failed',
        previous_status: 'pending_payment',
        new_status: 'cancelled',
        source: 'payment',
        created_by: 'payment_initialize',
        message: 'iyzico ödeme formu olumlu yanıt dönmedi.',
        note: 'iyzico ödeme formu olumlu yanıt dönmedi.',
        metadata: { iyzico_status: iyzicoRes?.status || null, error_message: iyzicoRes?.errorMessage || null }
      });
      throw new CheckoutError(iyzicoRes?.errorMessage || 'Ödeme başlatılamadı. Lütfen bilgileri kontrol edip tekrar deneyin.', 502, 'PAYMENT_INITIALIZE_FAILED');
    }

    await updateRows(context, 'orders', { id: orderId }, { payment_status: 'initiated' });
    await insertRow(context, 'order_status_events', {
      order_id: orderId,
      status: 'payment_authorized',
      event_type: 'payment_authorized',
      previous_status: 'pending_payment',
      new_status: 'pending_payment',
      source: 'payment',
      created_by: 'checkout',
      message: 'iyzico güvenli ödeme formu başlatıldı ve ödeme yetkilendirme sürecine alındı.',
      note: 'iyzico güvenli ödeme formu başlatıldı ve ödeme yetkilendirme sürecine alındı.',
      metadata: { provider: 'iyzico', token_present: Boolean(iyzicoRes.token) }
    });

    return json({
      ok: true,
      orderId,
      orderNumber,
      token: iyzicoRes.token,
      paymentPageUrl: iyzicoRes.paymentPageUrl || null,
      checkoutFormContent: iyzicoRes.checkoutFormContent || null,
      ...(buildPriceChangedNotice(payload, totals.subtotal) || {})
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    if (reservedOrderId && !persistedOrder) {
      await releaseInventoryReservations(context, reservedOrderId, 'checkout_failed_before_order_persisted').catch(() => null);
    }
    if (error instanceof CheckoutError) {
      const payload = {
        ok: false,
        code: error.code,
        message: error.message
      };
      if (error.errorKey) {
        payload.error = error.errorKey;
        if (error.items) payload.items = error.items;
      } else {
        payload.error = error.message;
      }
      return json(payload, { status: error.status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    const mappedPersistence = mapPersistenceError(error);
    if (mappedPersistence instanceof CheckoutError) {
      return json({
        ok: false,
        code: mappedPersistence.code,
        message: mappedPersistence.message,
        error: mappedPersistence.message
      }, { status: mappedPersistence.status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    console.error('Checkout create error:', { message: String(error?.message || 'unknown').slice(0, 220), code: error?.code || null });
    return json({ ok: false, code: 'CHECKOUT_INTERNAL_ERROR', error: 'Checkout başlatılamadı. Lütfen kısa süre sonra tekrar deneyin.' }, { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}


// Exported for deterministic local verification. Production requests continue to use onRequestPost.
export {
  calculateTotalsWithCoupon,
  getEftReservationMinutes,
  serializeOrderItemInsertRow,
  persistOrderItems,
  buildPriceChangedNotice,
  extractClientSubtotalHint,
  normalizeCart
};
