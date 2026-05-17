import { getUserFromAccessToken, insertRow, insertRows, updateRows, selectRows } from './_lib/supabase.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { catalog } from './_lib/catalog.js';
import { releaseInventoryReservations, reserveInventoryForOrder } from './_lib/inventory.js';
import { json } from './_lib/response.js';

const VAT_RATE = 0.20;
const FREE_SHIPPING_LIMIT = 2500;
const SHIPPING_FEE = 119;
const MAX_CART_LINES = 30;
const MAX_TOTAL_QUANTITY = 99;
const MAX_ITEM_QUANTITY = 10;
const MAX_NOTE_LENGTH = 180;
const ALLOWED_INVOICE_TYPES = new Set(['Bireysel', 'Kurumsal']);
const PAYMENT_METHODS = new Set(['card', 'bank_transfer']);

class CheckoutError extends Error {
  constructor(message, status = 400, code = 'CHECKOUT_ERROR') {
    super(message);
    this.name = 'CheckoutError';
    this.status = status;
    this.code = code;
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

function buildCatalogIndex() {
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

function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) throw new CheckoutError('Sepet boş.', 400, 'EMPTY_CART');
  if (rawCart.length > MAX_CART_LINES) throw new CheckoutError('Sepette çok fazla ürün satırı var.', 400, 'CART_TOO_LARGE');

  const catalogIndex = buildCatalogIndex();
  const merged = new Map();
  let totalQuantity = 0;

  rawCart.forEach((rawItem) => {
    const product = findCatalogProduct(catalogIndex, rawItem || {});
    if (!product) throw new CheckoutError('Sepette geçersiz veya satışta olmayan ürün var.', 400, 'INVALID_CART_ITEM');

    const productId = String(product.id || product.slug || rawItem.id || '').trim();
    const unitPrice = normalizeMoney(product.price);
    if (!productId || unitPrice <= 0) throw new CheckoutError('Ürün fiyatı doğrulanamadı.', 400, 'INVALID_CART_ITEM');

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
      unit_price: unitPrice,
      quantity,
      image: product.image || rawItem.image || null,
      line_total: normalizeMoney(unitPrice * quantity)
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

async function validateInventory(context, cart) {
  const slugs = cart.map((item) => item.product_slug || item.product_id).filter(Boolean);
  if (!slugs.length) return;
  const rows = await selectRows(context, 'product_inventory', {
    select: 'product_slug,stock_on_hand,stock_reserved,allow_backorder,status',
    product_slug: `in.(${slugs.join(',')})`
  });
  const map = new Map((rows || []).map((row) => [row.product_slug, row]));
  for (const item of cart) {
    const inv = map.get(item.product_slug || item.product_id);
    if (!inv) {
      throw new CheckoutError(`${item.product_name} için stok kaydı bulunamadı.`, 409, 'INVENTORY_NOT_FOUND');
    }
    if (String(inv.status || 'active') !== 'active') {
      throw new CheckoutError(`${item.product_name} şu anda satışta değil.`, 409, 'PRODUCT_NOT_ACTIVE');
    }
    const available = Math.max(0, Number(inv.stock_on_hand || 0) - Number(inv.stock_reserved || 0));
    if (!inv.allow_backorder && available < Number(item.quantity || 1)) {
      throw new CheckoutError('Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.', 409, 'INSUFFICIENT_STOCK');
    }
  }
}

async function applyCoupon(context, cart, subtotal, couponCode) {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code) return { code: null, discount: 0, label: null };
  const rows = await selectRows(context, 'coupons', {
    select: '*',
    code: `eq.${code}`,
    is_active: 'eq.true',
    limit: '1'
  }).catch(() => []);
  const coupon = rows?.[0];
  if (!coupon) throw new CheckoutError('Kupon kodu geçersiz veya pasif.', 400, 'INVALID_COUPON');
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) throw new CheckoutError('Kupon henüz aktif değil.', 400, 'COUPON_NOT_STARTED');
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) throw new CheckoutError('Kupon süresi dolmuş.', 400, 'COUPON_EXPIRED');
  if (Number(coupon.min_subtotal || 0) > subtotal) throw new CheckoutError(`Bu kupon için minimum sepet tutarı ₺${Number(coupon.min_subtotal).toFixed(0)}.`, 400, 'COUPON_MIN_SUBTOTAL');
  let discount = 0;
  const couponType = coupon.discount_type || coupon.type;
  const couponValue = coupon.discount_value ?? coupon.value;
  const couponMax = coupon.max_discount_amount ?? coupon.max_discount;
  if (couponType === 'percent') discount = subtotal * (Number(couponValue || 0) / 100);
  else if (couponType === 'free_shipping') discount = 0;
  else discount = Number(couponValue || 0);
  if (couponMax) discount = Math.min(discount, Number(couponMax));
  discount = Math.max(0, Math.min(subtotal, normalizeMoney(discount)));
  return { code, discount, label: couponType === 'percent' ? `%${Number(couponValue || 0)} indirim` : (couponType === 'free_shipping' ? 'Ücretsiz kargo' : `₺${discount.toFixed(0)} indirim`) };
}

function calculateTotalsWithCoupon(cart, coupon) {
  const subtotal = normalizeMoney(cart.reduce((sum, item) => sum + item.line_total, 0));
  const discount = normalizeMoney(coupon?.discount || 0);
  const discountedSubtotal = normalizeMoney(Math.max(0, subtotal - discount));
  const shipping = discountedSubtotal >= FREE_SHIPPING_LIMIT ? 0 : SHIPPING_FEE;
  const vat = normalizeMoney((discountedSubtotal * VAT_RATE) / (1 + VAT_RATE));
  const total = normalizeMoney(discountedSubtotal + shipping);
  return { subtotal, discount, shipping, vat, total };
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

function buildIyzicoBasketItems(cart, shipping, discount = 0) {
  const subtotal = normalizeMoney(cart.reduce((sum, item) => sum + item.line_total, 0));
  let allocatedDiscount = 0;
  const items = cart.map((item, index) => {
    let itemDiscount = 0;
    if (discount > 0 && subtotal > 0) {
      itemDiscount = index === cart.length - 1
        ? normalizeMoney(discount - allocatedDiscount)
        : normalizeMoney(discount * (item.line_total / subtotal));
      allocatedDiscount = normalizeMoney(allocatedDiscount + itemDiscount);
    }
    const price = normalizeMoney(Math.max(0.01, item.line_total - itemDiscount));
    return {
      id: item.product_id,
      name: item.product_name,
      category1: 'Skincare',
      itemType: 'PHYSICAL',
      price: price.toFixed(2)
    };
  });

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


async function recordOrderLegalConsents(context, { orderId, consents, request }) {
  if (!orderId) return;
  const acceptedAt = new Date().toISOString();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);
  const rows = [
    ['kvkk_acknowledged', consents.kvkk_acknowledged, 'KVKK Aydınlatma Metni'],
    ['preliminary_information_accepted', consents.preliminary_information_accepted, 'Ön Bilgilendirme Formu'],
    ['distance_sales_accepted', consents.distance_sales_accepted, 'Mesafeli Satış Sözleşmesi']
  ].map(([consent_type, accepted, document_title]) => ({
    order_id: orderId,
    consent_type,
    accepted: Boolean(accepted),
    accepted_at: acceptedAt,
    ip_address: ip,
    user_agent: userAgent,
    document_version: 'checkout-20260517',
    metadata: { document_title, source: 'checkout.html' }
  }));
  await insertRows(context, 'order_legal_consents', rows).catch((error) => console.error('order legal consent record failed:', { message: error.message }));
}

function normalizeInvoicePayload(invoicePayload = {}, customer = {}) {
  const isCorporate = String(invoicePayload.type || '').toLowerCase() === 'corporate' || customer.invoice_type === 'Kurumsal';
  const sameAsDelivery = invoicePayload.sameAsDelivery !== false;
  const billingName = clampText(invoicePayload.name || `${customer.first_name || ''} ${customer.last_name || ''}`, 120);
  const nameParts = billingName.split(/\s+/).filter(Boolean);
  const billingFirstName = isCorporate ? null : (nameParts.shift() || customer.first_name || null);
  const billingLastName = isCorporate ? null : (nameParts.join(' ') || customer.last_name || null);
  return {
    invoice_type: isCorporate ? 'Kurumsal' : 'Bireysel',
    billing_first_name: billingFirstName,
    billing_last_name: billingLastName,
    billing_email: normalizeEmail(isCorporate ? invoicePayload.corporateEmail : (invoicePayload.email || customer.email)),
    billing_phone: normalizeTurkishPhone(invoicePayload.phone || customer.phone) || customer.phone,
    company_title: isCorporate ? clampText(invoicePayload.company || invoicePayload.companyTitle, 180) : null,
    tax_office: isCorporate ? clampText(invoicePayload.taxOffice, 120) : null,
    tax_number: isCorporate ? onlyDigits(invoicePayload.taxNumber).slice(0, 20) : null,
    corporate_email: isCorporate ? normalizeEmail(invoicePayload.corporateEmail || invoicePayload.email) : null,
    is_e_invoice_taxpayer: Boolean(invoicePayload.eInvoice || invoicePayload.is_e_invoice_taxpayer),
    billing_address_line: clampText(invoicePayload.address || (sameAsDelivery ? customer.address : ''), 300) || null,
    billing_city: clampText(invoicePayload.city || (sameAsDelivery ? customer.city : ''), 60) || null,
    billing_district: clampText(invoicePayload.district || (sameAsDelivery ? customer.district : ''), 80) || null,
    billing_postal_code: onlyDigits(invoicePayload.postalCode || invoicePayload.postal_code || (sameAsDelivery ? customer.postal_code : '')).slice(0, 5) || null
  };
}

function assertOrderEnvironment(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CheckoutError('Sipariş sistemi yapılandırması eksik.', 503, 'SERVICE_NOT_CONFIGURED');
  }
}

function assertCardPaymentEnvironment(env) {
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) {
    throw new CheckoutError('Ödeme sistemi henüz aktif değil.', 503, 'PAYMENT_NOT_CONFIGURED');
  }
}

export async function onRequestPost(context) {
  try {
    assertOrderEnvironment(context.env || {});

    const payload = await context.request.json().catch(() => {
      throw new CheckoutError('Geçersiz istek formatı.', 400, 'INVALID_JSON');
    });

    const paymentMethod = PAYMENT_METHODS.has(String(payload.payment_method || payload.paymentMethod || 'card'))
      ? String(payload.payment_method || payload.paymentMethod || 'card')
      : 'card';
    if (paymentMethod === 'card') assertCardPaymentEnvironment(context.env || {});

    const accessToken = payload.accessToken || null;
    const rawCustomer = payload.customer || {};
    const consents = validateCheckoutConsents(rawCustomer);
    const customer = validateCustomer(rawCustomer);
    const cart = normalizeCart(payload.cart || []);
    const user = accessToken ? await getUserFromAccessToken(context, accessToken) : null;
    if (accessToken && !user) throw new CheckoutError('Oturum süresi dolmuş. Lütfen tekrar giriş yap.', 401, 'INVALID_SESSION');

    await validateInventory(context, cart);
    const baseTotals = calculateTotals(cart);
    const coupon = await applyCoupon(context, cart, baseTotals.subtotal, payload.coupon_code || payload.couponCode);
    const totals = calculateTotalsWithCoupon(cart, coupon);
    const orderNumber = createOrderNumber();
    const invoicePayload = payload.invoice && typeof payload.invoice === 'object' ? payload.invoice : {};
    const deliveryPayload = payload.delivery && typeof payload.delivery === 'object' ? payload.delivery : {};
    const shippingPayload = payload.shipping && typeof payload.shipping === 'object' ? payload.shipping : {};
    const orderStatus = paymentMethod === 'bank_transfer' ? 'pending_bank_transfer' : 'pending_payment';
    const initialPaymentStatus = paymentMethod === 'bank_transfer' ? 'awaiting_transfer' : 'pending';
    const fulfillmentStatus = 'not_started';
    const invoiceDetails = normalizeInvoicePayload(invoicePayload, customer);
    const legalConsents = {
      kvkk: consents.kvkk_acknowledged,
      pre_information: consents.preliminary_information_accepted,
      distance_sales: consents.distance_sales_accepted,
      accepted_at: payload.legal_approved_at || new Date().toISOString(),
      ip_address: getClientIp(context.request),
      user_agent: getUserAgent(context.request)
    };
    const order = await insertRow(context, 'orders', {
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
      identity_number: customer.identity_number,
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
        payment_method: paymentMethod,
        cart_line_count: cart.length,
        coupon: coupon.code || null,
        coupon_label: coupon.label || null,
        delivery: deliveryPayload,
        invoice: invoicePayload,
        invoice_details: invoiceDetails,
        shipping: shippingPayload,
        legal_approved_at: payload.legal_approved_at || new Date().toISOString(),
        consents: { marketing_email_opt_in: consents.marketing_email_opt_in, newsletter_opt_in: consents.newsletter_opt_in }
      }
    });

    await recordCheckoutConsents(context, { user, email: customer.email, consents, orderId: order.id });
    await recordOrderLegalConsents(context, { orderId: order.id, consents, request: context.request });

    await insertRows(context, 'order_items', cart.map((item) => ({ ...item, order_id: order.id })));
    await insertRow(context, 'order_status_events', {
      order_id: order.id,
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

    let reservations = [];
    try {
      reservations = await reserveInventoryForOrder(context, order.id, cart, {
        minutes: paymentMethod === 'bank_transfer' ? 4320 : 15,
        session_id: payload.session_id || payload.sessionId || null,
        created_by: 'checkout'
      });
      await insertRow(context, 'order_status_events', {
        order_id: order.id,
        status: 'stock_reserved',
        event_type: 'stock_reserved',
        source: 'inventory',
        created_by: 'system',
        message: paymentMethod === 'bank_transfer' ? 'Havale/EFT siparişi için stok rezervasyonu oluşturuldu.' : 'Checkout için 15 dakikalık stok rezervasyonu oluşturuldu.',
        note: paymentMethod === 'bank_transfer' ? 'Havale/EFT ödeme onayı bekleniyor.' : 'Checkout için 15 dakikalık stok rezervasyonu oluşturuldu.',
        metadata: { reservation_count: reservations.length, payment_method: paymentMethod }
      }).catch(() => null);
    } catch (reservationError) {
      await updateRows(context, 'orders', { id: order.id }, {
        status: 'cancelled',
        payment_status: 'failed',
        fulfillment_status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: { source: 'checkout', cart_line_count: cart.length, reservation_error: serializeError(reservationError) }
      }).catch(() => null);
      await insertRow(context, 'order_status_events', {
        order_id: order.id,
        status: 'stock_reservation_failed',
        event_type: 'stock_reservation_failed',
        source: 'inventory',
        created_by: 'system',
        message: reservationError.message || 'Stok rezervasyonu oluşturulamadı.',
        note: reservationError.message || 'Stok rezervasyonu oluşturulamadı.',
        metadata: { error: serializeError(reservationError) }
      }).catch(() => null);
      throw new CheckoutError(reservationError.message || 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.', reservationError.status || 409, reservationError.code || 'INSUFFICIENT_STOCK');
    }

    if (paymentMethod === 'bank_transfer') {
      await insertRow(context, 'payments', {
        order_id: order.id,
        provider: 'bank_transfer',
        status: 'awaiting_transfer',
        amount: totals.total,
        currency: 'TRY',
        conversation_id: order.id,
        raw_initialize_response: {
          payment_method: 'bank_transfer',
          payment_status: 'awaiting_transfer',
          message: 'Havale/EFT ödemesi bekleniyor.'
        }
      }).catch((error) => console.error('bank transfer payment row failed:', { message: error.message }));
      await insertRow(context, 'order_status_events', {
        order_id: order.id,
        status: 'awaiting_transfer',
        event_type: 'payment_awaiting_transfer',
        previous_status: 'pending_bank_transfer',
        new_status: 'pending_bank_transfer',
        source: 'checkout',
        created_by: 'checkout',
        message: 'Havale/EFT ödeme onayı bekleniyor.',
        note: 'Müşteri açıklama alanına sipariş numarasını yazmalıdır.',
        metadata: { order_number: orderNumber, payment_method: 'bank_transfer' }
      }).catch(() => null);
      return json({
        ok: true,
        orderId: order.id,
        orderNumber: order.order_number,
        paymentMethod: 'bank_transfer',
        orderStatus: 'pending_bank_transfer',
        paymentStatus: 'awaiting_transfer',
        message: 'Siparişiniz oluşturuldu. Havale/EFT ödemeniz bekleniyor.'
      });
    }

    const callbackUrl = `${getPublicSiteUrl(context.env)}/api/iyzico-callback`;
    const ip = getClientIp(context.request);
    const buyerName = `${customer.first_name} ${customer.last_name}`.trim();
    const basketItems = buildIyzicoBasketItems(cart, totals.shipping, totals.discount || 0);

    let iyzicoRes = null;
    try {
      iyzicoRes = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', context.env, {
        locale: 'tr',
        conversationId: order.id,
        price: totals.total.toFixed(2),
        paidPrice: totals.total.toFixed(2),
        currency: 'TRY',
        basketId: order.id,
        paymentGroup: 'PRODUCT',
        callbackUrl,
        enabledInstallments: [1, 2, 3],
        buyer: {
          id: user?.id || `guest-${order.id}`,
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
        shippingAddress: {
          contactName: buyerName,
          city: customer.city,
          country: 'Turkey',
          address: customer.address,
          zipCode: customer.postal_code
        },
        billingAddress: {
          contactName: buyerName,
          city: customer.city,
          country: 'Turkey',
          address: customer.address,
          zipCode: customer.postal_code
        },
        basketItems
      });
    } catch (paymentError) {
      await insertRow(context, 'payments', {
        order_id: order.id,
        provider: 'iyzico',
        status: 'initialize_failed',
        amount: totals.total,
        currency: 'TRY',
        conversation_id: order.id,
        raw_initialize_response: { error: serializeError(paymentError) }
      });
      await releaseInventoryReservations(context, order.id, 'payment_initialize_failed').catch(() => null);
      await updateRows(context, 'orders', { id: order.id }, {
        status: 'cancelled',
        payment_status: 'failed',
        metadata: { source: 'checkout', cart_line_count: cart.length, payment_initialize_error: serializeError(paymentError) }
      });
      await insertRow(context, 'order_status_events', {
        order_id: order.id,
        status: 'payment_failed',
        event_type: 'payment_failed',
        previous_status: 'pending_payment',
        new_status: 'cancelled',
        source: 'payment',
        created_by: 'payment_initialize',
        message: 'iyzico ödeme formu başlatılamadı.',
        note: 'iyzico ödeme formu başlatılamadı.',
        metadata: { error: serializeError(paymentError) }
      });
      throw new CheckoutError(paymentError.message || 'Ödeme başlatılamadı. Lütfen bilgileri kontrol edip tekrar dene.', 502, 'PAYMENT_INITIALIZE_FAILED');
    }

    const iyzicoStatus = String(iyzicoRes?.status || '').toLowerCase();
    const paymentSucceeded = iyzicoStatus === 'success' && (iyzicoRes.token || iyzicoRes.paymentPageUrl || iyzicoRes.checkoutFormContent);

    await insertRow(context, 'payments', {
      order_id: order.id,
      provider: 'iyzico',
      status: paymentSucceeded ? 'initiated' : 'initialize_failed',
      amount: totals.total,
      currency: 'TRY',
      conversation_id: order.id,
      provider_token: iyzicoRes?.token || null,
      raw_initialize_response: iyzicoRes || null
    });

    if (!paymentSucceeded) {
      await updateRows(context, 'orders', { id: order.id }, {
        status: 'cancelled',
        payment_status: 'failed',
        fulfillment_status: 'cancelled'
      });
      await releaseInventoryReservations(context, order.id, 'payment_initialize_failed').catch(() => null);
      await insertRow(context, 'order_status_events', {
        order_id: order.id,
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
      throw new CheckoutError(iyzicoRes?.errorMessage || 'Ödeme başlatılamadı. Lütfen bilgileri kontrol edip tekrar dene.', 502, 'PAYMENT_INITIALIZE_FAILED');
    }

    await updateRows(context, 'orders', { id: order.id }, {
      payment_status: 'initiated'
    });
    await insertRow(context, 'order_status_events', {
      order_id: order.id,
      status: 'payment_authorized',
      event_type: 'payment_authorized',
      previous_status: 'pending_payment',
      new_status: 'pending_payment',
      source: 'payment',
      created_by: 'checkout',
      message: 'iyzico güvenli ödeme formu başlatıldı ve ödeme yetkilendirme sürecine alındı.',
      note: 'iyzico güvenli ödeme formu başlatıldı ve ödeme yetkilendirme sürecine alındı.',
      metadata: { provider: 'iyzico', token: iyzicoRes.token || null }
    });

    return json({
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      token: iyzicoRes.token,
      paymentPageUrl: iyzicoRes.paymentPageUrl || null,
      checkoutFormContent: iyzicoRes.checkoutFormContent || null
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    }

    console.error('Checkout create error:', error);
    return json({ ok: false, code: 'CHECKOUT_INTERNAL_ERROR', error: 'Checkout başlatılamadı. Lütfen kısa süre sonra tekrar dene.' }, { status: 500 });
  }
}
