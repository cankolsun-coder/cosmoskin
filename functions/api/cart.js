import { readUserCart, getOptionalCartUser } from './_lib/cart.js';
import { json } from './_lib/response.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function respond(payload, init = {}) {
  return json(payload, {
    ...init,
    headers: { ...corsHeaders, ...(init.headers || {}) }
  });
}

function emptyCart(source = 'guest') {
  return {
    id: null,
    status: 'active',
    currency: 'TRY',
    items: [],
    itemCount: 0,
    subtotal: 0,
    total: 0,
    source
  };
}

export function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet(context) {
  try {
    const user = await getOptionalCartUser(context);
    const cart = user ? await readUserCart(context, user) : emptyCart('guest');
    return respond({ ok: true, success: true, data: cart, ...cart });
  } catch (error) {
    console.warn('Cart API failed safely:', error?.message || error);
    const cart = emptyCart('error');
    return respond({ ok: true, success: true, data: cart, ...cart });
  }
}

export function onRequestPost() {
  return respond({
    ok: false,
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Bu endpoint için HTTP metodu desteklenmiyor.'
    }
  }, { status: 405 });
}
