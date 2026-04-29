import { getCatalogProductByHandle } from './catalog.js';
import { deleteRows, getUserFromAccessToken, selectRows } from './supabase.js';

const EMPTY_CART = {
  id: null,
  status: 'active',
  currency: 'TRY',
  items: [],
  itemCount: 0,
  subtotal: 0,
  total: 0,
  source: 'empty'
};

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

export async function getOptionalCartUser(context) {
  const token = bearerToken(context.request);
  if (!token) return null;
  try {
    return await getUserFromAccessToken(context, token);
  } catch (error) {
    console.warn('Cart user lookup skipped:', error?.message || error);
    return null;
  }
}

function emptyCart(source = 'empty') {
  return { ...EMPTY_CART, source };
}

async function safeSelect(context, table, params, fallback = []) {
  try {
    const rows = await selectRows(context, table, params);
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    console.warn(`Cart ${table} lookup skipped:`, error?.message || error);
    return fallback;
  }
}

async function loadProductMap(context, productIds) {
  const ids = Array.from(new Set((productIds || []).filter(Boolean)));
  if (!ids.length) return new Map();

  let rows = await safeSelect(context, 'products', {
    select: 'id,slug,name,image_url,product_url,price',
    id: `in.(${ids.join(',')})`
  });

  return new Map(rows.map((product) => [product.id, product]));
}

function normalizeCartItem(item, product) {
  const catalogProduct = getCatalogProductByHandle(product?.slug || product?.product_url || '');
  const quantity = Math.max(1, Number(item.quantity || 1));
  const unitPrice = Number(item.unit_price_snapshot ?? product?.price ?? catalogProduct?.price ?? 0);
  const name = product?.name || catalogProduct?.name || 'Ürün';
  const image = product?.image_url || catalogProduct?.image || '';
  const slug = product?.slug || catalogProduct?.slug || '';
  const url = product?.product_url || catalogProduct?.url || (slug ? `/products/${slug}.html` : '#');

  return {
    id: item.id,
    cart_item_id: item.id,
    product_id: item.product_id,
    productId: item.product_id,
    slug,
    name,
    product_name: name,
    brand: catalogProduct?.brand || 'COSMOSKIN',
    image,
    image_url: image,
    url,
    quantity,
    qty: quantity,
    unit_price: unitPrice,
    unitPrice,
    price: unitPrice,
    line_total: unitPrice * quantity,
    lineTotal: unitPrice * quantity
  };
}

export async function readUserCart(context, user) {
  if (!user?.id) return emptyCart('guest');

  const carts = await safeSelect(context, 'carts', {
    select: 'id,user_id,status,currency,created_at,updated_at',
    user_id: `eq.${user.id}`,
    status: 'eq.active',
    order: 'updated_at.desc',
    limit: '1'
  });
  const cart = carts[0];
  if (!cart?.id) return emptyCart('not_found');

  const rows = await safeSelect(context, 'cart_items', {
    select: 'id,cart_id,product_id,quantity,unit_price_snapshot,created_at,updated_at',
    cart_id: `eq.${cart.id}`,
    order: 'created_at.asc'
  });
  const productMap = await loadProductMap(context, rows.map((item) => item.product_id));
  const items = rows.map((item) => normalizeCartItem(item, productMap.get(item.product_id)));
  const total = items.reduce((sum, item) => sum + item.line_total, 0);

  return {
    id: cart.id,
    status: cart.status || 'active',
    currency: cart.currency || 'TRY',
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: total,
    total,
    source: 'supabase'
  };
}

export async function removeUserCartItem(context, user, identifier) {
  if (!user?.id) return { removed: false, reason: 'guest', cart: emptyCart('guest') };
  if (!identifier) return { removed: false, reason: 'missing_identifier', cart: await readUserCart(context, user) };

  const cart = await readUserCart(context, user);
  if (!cart.id) return { removed: false, reason: 'cart_not_found', cart };

  let match = cart.items.find((item) => item.cart_item_id === identifier || item.id === identifier || item.product_id === identifier || item.slug === identifier);
  if (!match) {
    const products = await safeSelect(context, 'products', {
      select: 'id,slug',
      slug: `eq.${identifier}`,
      limit: '1'
    });
    const productId = products[0]?.id;
    if (productId) match = cart.items.find((item) => item.product_id === productId);
  }
  if (!match?.cart_item_id) return { removed: false, reason: 'item_not_found', cart };

  try {
    await deleteRows(context, 'cart_items', { id: match.cart_item_id });
  } catch (error) {
    console.warn('Cart item delete skipped:', error?.message || error);
    return { removed: false, reason: 'delete_failed', cart };
  }

  return { removed: true, item_id: match.cart_item_id, cart: await readUserCart(context, user) };
}
