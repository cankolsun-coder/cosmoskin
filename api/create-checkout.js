import { getUserFromAccessToken, insertRow, insertRows } from './_lib/supabase.js';
import { iyzicoRequest } from './_lib/iyzico.js';
import { catalog } from './_lib/catalog.js';
import { json } from './_lib/response.js';

const VAT = 0.20;
const FREE_SHIPPING = 2500;
const SHIPPING_FEE = 119;

function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart) || !rawCart.length) return [];
  return rawCart.map(item => {
    const product = catalog[item.id];
    if (!product) throw new Error(`Geçersiz ürün: ${item.id}`);
    const quantity = Math.max(1, Number(item.qty || 1));
    return {
      product_id: product.id,
      product_name: product.name,
      brand: product.brand,
      unit_price: product.price,
      quantity,
      image: product.image,
      line_total: product.price * quantity
    };
  });
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json().catch(() => ({}));
    if (!context.env.IYZICO_API_KEY || !context.env.IYZICO_SECRET_KEY) {
      return json({ ok: false, error: 'Ödeme sistemi henüz aktif değil.' }, { status: 503 });
    }
    const accessToken = payload.accessToken || null;
    const customer = payload.customer || {};
    const cart = normalizeCart(payload.cart || []);
    if (!cart.length) return json({ ok: false, error: 'Sepet boş.' }, { status: 400 });

    const required = ['first_name', 'last_name', 'email', 'phone', 'identity_number', 'city', 'district', 'postal_code', 'address'];
    for (const key of required) {
      if (!String(customer[key] || '').trim()) return json({ ok: false, error: `Eksik alan: ${key}` }, { status: 400 });
    }

    const user = accessToken ? await getUserFromAccessToken(context, accessToken) : null;
    if (accessToken && !user) return json({ ok: false, error: 'Geçersiz oturum.' }, { status: 401 });

    const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
    const shipping = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
    const vat = Math.round((subtotal * VAT) / (1 + VAT));
    const total = subtotal + shipping;

    const orderNumber = `CS-${Date.now()}`;
    const order = await insertRow(context, 'orders', {
      user_id: user?.id || null,
      order_number: orderNumber,
      status: 'pending_payment',
      currency: 'TRY',
      subtotal_amount: subtotal,
      vat_amount: vat,
      shipping_amount: shipping,
      total_amount: total,
      customer_email: customer.email,
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone,
      invoice_type: customer.invoice_type || 'Bireysel',
      identity_number: customer.identity_number,
      city: customer.city,
      district: customer.district,
      postal_code: customer.postal_code,
      address_line: customer.address,
      cargo_note: customer.cargo_note || null
    });

    await insertRows(context, 'order_items', cart.map(item => ({ ...item, order_id: order.id })));

    const callbackUrl = `${context.env.PUBLIC_SITE_URL || 'https://www.cosmoskin.com.tr'}/api/iyzico-callback`;
    const ip = context.request.headers.get('cf-connecting-ip') || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const iyzicoRes = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', context.env, {
      locale: 'tr',
      conversationId: order.id,
      price: subtotal.toFixed(2),
      paidPrice: total.toFixed(2),
      currency: 'TRY',
      basketId: order.id,
      paymentGroup: 'PRODUCT',
      callbackUrl,
      enabledInstallments: [1, 2, 3],
      buyer: {
        id: user?.id || `guest-${Date.now()}`,
        name: customer.first_name,
        surname: customer.last_name,
        gsmNumber: customer.phone,
        email: customer.email,
        identityNumber: customer.identity_number,
        lastLoginDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
        registrationDate: new Date((user?.created_at) || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
        registrationAddress: customer.address,
        ip,
        city: customer.city,
        country: 'Turkey',
        zipCode: customer.postal_code
      },
      shippingAddress: {
        contactName: `${customer.first_name} ${customer.last_name}`.trim(),
        city: customer.city,
        country: 'Turkey',
        address: customer.address,
        zipCode: customer.postal_code
      },
      billingAddress: {
        contactName: `${customer.first_name} ${customer.last_name}`.trim(),
        city: customer.city,
        country: 'Turkey',
        address: customer.address,
        zipCode: customer.postal_code
      },
      basketItems: cart.map(item => ({
        id: item.product_id,
        name: item.product_name,
        category1: 'Skincare',
        itemType: 'PHYSICAL',
        price: item.line_total.toFixed(2)
      }))
    });

    await insertRow(context, 'payments', {
      order_id: order.id,
      provider: 'iyzico',
      status: 'initiated',
      amount: total,
      conversation_id: order.id,
      provider_token: iyzicoRes.token || null,
      raw_initialize_response: iyzicoRes
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
    return json({ ok: false, error: error.message || 'Checkout başlatılamadı.' }, { status: 500 });
  }
}
