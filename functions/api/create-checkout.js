import { getUserFromAccessToken, insertRow, insertRows } from './_lib/supabase.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { catalog } from './_lib/catalog.js';
import { json } from './_lib/response.js';

const VAT_RATE = 0.20;
const FREE_SHIPPING_LIMIT = 2500;
const SHIPPING_FEE = 119;
const MAX_CART_LINES = 30;
const MAX_TOTAL_QUANTITY = 99;
const MAX_ITEM_QUANTITY = 10;
const MAX_NOTE_LENGTH = 180;
const ALLOWED_INVOICE_TYPES = new Set(['Bireysel', 'Kurumsal']);

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
  if (!isValidTurkishIdentityNumber(customer.identity_number)) throw new CheckoutError('T.C. kimlik numarası geçersiz.', 400, 'INVALID_CUSTOMER');
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
      product_name: clampText(product.name || rawItem.name || 'Cosmoskin Ürünü', 120),
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

function buildIyzicoBasketItems(cart, shipping) {
  const items = cart.map((item) => ({
    id: item.product_id,
    name: item.product_name,
    category1: 'Skincare',
    itemType: 'PHYSICAL',
    price: item.line_total.toFixed(2)
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

function assertPaymentEnvironment(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CheckoutError('Sipariş sistemi yapılandırması eksik.', 503, 'SERVICE_NOT_CONFIGURED');
  }
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) {
    throw new CheckoutError('Ödeme sistemi henüz aktif değil.', 503, 'PAYMENT_NOT_CONFIGURED');
  }
}

export async function onRequestPost(context) {
  try {
    assertPaymentEnvironment(context.env || {});

    const payload = await context.request.json().catch(() => {
      throw new CheckoutError('Geçersiz istek formatı.', 400, 'INVALID_JSON');
    });

    const accessToken = payload.accessToken || null;
    const customer = validateCustomer(payload.customer || {});
    const cart = normalizeCart(payload.cart || []);
    const user = accessToken ? await getUserFromAccessToken(context, accessToken) : null;
    if (accessToken && !user) throw new CheckoutError('Oturum süresi dolmuş. Lütfen tekrar giriş yap.', 401, 'INVALID_SESSION');

    const totals = calculateTotals(cart);
    const orderNumber = createOrderNumber();
    const order = await insertRow(context, 'orders', {
      user_id: user?.id || null,
      order_number: orderNumber,
      status: 'pending_payment',
      currency: 'TRY',
      subtotal_amount: totals.subtotal,
      vat_amount: totals.vat,
      shipping_amount: totals.shipping,
      total_amount: totals.total,
      customer_email: customer.email,
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone,
      invoice_type: customer.invoice_type,
      identity_number: customer.identity_number,
      city: customer.city,
      district: customer.district,
      postal_code: customer.postal_code,
      address_line: customer.address,
      cargo_note: customer.cargo_note || null
    });

    await insertRows(context, 'order_items', cart.map((item) => ({ ...item, order_id: order.id })));

    const callbackUrl = `${getPublicSiteUrl(context.env)}/api/iyzico-callback`;
    const ip = getClientIp(context.request);
    const buyerName = `${customer.first_name} ${customer.last_name}`.trim();
    const basketItems = buildIyzicoBasketItems(cart, totals.shipping);

    const iyzicoRes = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', context.env, {
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

    const paymentStatus = String(iyzicoRes?.status || '').toLowerCase();
    const paymentSucceeded = paymentStatus === 'success' && (iyzicoRes.token || iyzicoRes.paymentPageUrl || iyzicoRes.checkoutFormContent);

    await insertRow(context, 'payments', {
      order_id: order.id,
      provider: 'iyzico',
      status: paymentSucceeded ? 'initiated' : 'initialize_failed',
      amount: totals.total,
      conversation_id: order.id,
      provider_token: iyzicoRes?.token || null,
      raw_initialize_response: iyzicoRes || null
    });

    if (!paymentSucceeded) {
      throw new CheckoutError(iyzicoRes?.errorMessage || 'Ödeme başlatılamadı. Lütfen bilgileri kontrol edip tekrar dene.', 502, 'PAYMENT_INITIALIZE_FAILED');
    }

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
