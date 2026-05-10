import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';
import { catalogProducts, getInventoryRows, normalizeInventoryRow } from '../_lib/inventory.js';
import { selectRows } from '../_lib/supabase.js';

function textIncludes(product, q) {
  if (!q) return true;
  const haystack = [product.name, product.brand, product.slug, product.sku, product.category].join(' ').toLocaleLowerCase('tr-TR');
  return haystack.includes(q.toLocaleLowerCase('tr-TR'));
}

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const url = new URL(context.request.url);
    const q = (url.searchParams.get('search') || '').trim();
    const filter = (url.searchParams.get('filter') || url.searchParams.get('status') || 'all').trim();
    const inventory = await getInventoryRows(context).catch(() => []);
    const map = new Map(inventory.map((row) => [row.product_slug, row]));
    const products = catalogProducts().map((product) => {
      const row = map.get(product.slug) || normalizeInventoryRow({ product_slug: product.slug, stock_on_hand: 0, stock_reserved: 0, status: 'active' });
      const flags = {
        in_stock: row.status === 'active' && (row.allow_backorder || row.available_stock > 0),
        low_stock: row.status === 'active' && row.available_stock > 0 && row.available_stock <= row.low_stock_threshold,
        out_of_stock: row.status === 'active' && !row.allow_backorder && row.available_stock <= 0
      };
      return { ...product, sku: row.sku || product.slug.toUpperCase().replace(/-/g, '_'), inventory: row, flags };
    }).filter((product) => textIncludes(product, q));

    const filtered = products.filter((product) => {
      if (filter === 'all' || !filter) return true;
      if (filter === 'in_stock') return product.flags.in_stock;
      if (filter === 'low_stock') return product.flags.low_stock;
      if (filter === 'out_of_stock') return product.flags.out_of_stock;
      if (filter === 'inactive') return product.inventory.status !== 'active';
      return product.inventory.status === filter;
    });

    const restockWaiting = await selectRows(context, 'restock_alerts', { select: 'id', status: 'eq.waiting', limit: '500' }).catch(() => []);
    const summary = {
      total: products.length,
      in_stock: products.filter((p) => p.flags.in_stock).length,
      low_stock: products.filter((p) => p.flags.low_stock).length,
      out_of_stock: products.filter((p) => p.flags.out_of_stock).length,
      inactive: products.filter((p) => p.inventory.status !== 'active').length,
      pending_restock_alerts: restockWaiting?.length || 0
    };

    return json({ ok: true, summary, products: filtered });
  } catch (error) {
    return adminError(error, 'Stok listesi alınamadı.');
  }
}
