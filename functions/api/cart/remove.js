import { getOptionalCartUser, removeUserCartItem } from '../_lib/cart.js';
import { json } from '../_lib/response.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function respond(payload, init = {}) {
  return json(payload, {
    ...init,
    headers: { ...corsHeaders, ...(init.headers || {}) }
  });
}

async function parseBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  if (body === null) {
    return respond({
      ok: false,
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Geçersiz JSON gövdesi.'
      }
    }, { status: 400 });
  }

  const identifier = String(body.item_id || body.cart_item_id || body.id || body.product_id || body.productId || '').trim();

  try {
    const user = await getOptionalCartUser(context);
    const result = await removeUserCartItem(context, user, identifier);
    return respond({
      ok: true,
      success: true,
      removed: result.removed,
      reason: result.reason || null,
      data: result.cart,
      ...result.cart
    });
  } catch (error) {
    console.warn('Cart remove API failed safely:', error?.message || error);
    return respond({
      ok: true,
      success: true,
      removed: false,
      reason: 'error',
      data: {
        items: [],
        total: 0,
        source: 'error'
      }
    });
  }
}

export function onRequestGet() {
  return respond({
    ok: false,
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Bu endpoint için HTTP metodu desteklenmiyor.'
    }
  }, { status: 405 });
}
