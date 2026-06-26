#!/usr/bin/env node
/**
 * Destructive integration test for the atomic inventory RPC.
 * Requires explicit ALLOW_DESTRUCTIVE_TEST=true and a disposable test product slug.
 * The original inventory row is restored in finally.
 */
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TEST_INVENTORY_SLUG'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}
if (process.env.ALLOW_DESTRUCTIVE_TEST !== 'true') {
  throw new Error('Set ALLOW_DESTRUCTIVE_TEST=true only against a disposable sandbox database.');
}
const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const slug = process.env.TEST_INVENTORY_SLUG.trim();
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || `HTTP ${response.status}`), { status: response.status, data });
  return data;
}
const orderA = crypto.randomUUID();
const orderB = crypto.randomUUID();
let original;
try {
  original = (await request(`/rest/v1/product_inventory?select=*&product_slug=eq.${encodeURIComponent(slug)}&limit=1`))?.[0];
  if (!original) throw new Error(`Inventory row missing for ${slug}.`);
  await request(`/rest/v1/product_inventory?product_slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stock_on_hand: 1, stock_reserved: 0, allow_backorder: false, status: 'active' })
  });
  const payload = (orderId) => JSON.stringify({
    p_order_id: orderId,
    p_items: [{ product_slug: slug, quantity: 1 }],
    p_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    p_session_id: `concurrency-test-${orderId}`
  });
  const settled = await Promise.allSettled([
    request('/rest/v1/rpc/reserve_order_inventory', { method: 'POST', body: payload(orderA) }),
    request('/rest/v1/rpc/reserve_order_inventory', { method: 'POST', body: payload(orderB) })
  ]);
  const successes = settled.filter((entry) => entry.status === 'fulfilled');
  const failures = settled.filter((entry) => entry.status === 'rejected');
  const row = (await request(`/rest/v1/product_inventory?select=stock_on_hand,stock_reserved&product_slug=eq.${encodeURIComponent(slug)}&limit=1`))?.[0];
  if (successes.length !== 1 || failures.length !== 1) throw new Error(`Expected one success and one failure; got ${successes.length}/${failures.length}.`);
  if (Number(row.stock_on_hand) !== 1 || Number(row.stock_reserved) !== 1) throw new Error(`Unexpected inventory state: ${JSON.stringify(row)}`);
  console.log(JSON.stringify({ ok: true, slug, successes: 1, failures: 1, inventory: row }, null, 2));
} finally {
  for (const id of [orderA, orderB]) {
    await request('/rest/v1/rpc/release_order_inventory', { method: 'POST', body: JSON.stringify({ p_order_id: id, p_reason: 'concurrency_test_cleanup' }) }).catch(() => null);
  }
  if (original) {
    await request(`/rest/v1/product_inventory?product_slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        stock_on_hand: original.stock_on_hand,
        stock_reserved: original.stock_reserved,
        allow_backorder: original.allow_backorder,
        status: original.status,
        low_stock_threshold: original.low_stock_threshold,
        sku: original.sku
      })
    }).catch((error) => console.error('WARNING: original inventory restore failed:', error.message));
  }
}
