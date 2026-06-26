import { assertAdmin, adminError } from '../../_lib/admin.js';
import { selectRows } from '../../_lib/supabase.js';
import { products } from '../../_lib/catalog.js';
import { json } from '../../_lib/response.js';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

function duplicates(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    const rows = await selectRows(context, 'product_inventory', {
      select: 'id,product_slug,sku,stock_on_hand,stock_reserved,allow_backorder,status,updated_at',
      order: 'product_slug.asc'
    });
    const catalogSlugs = products.map((product) => product.slug);
    const inventorySlugs = (rows || []).map((row) => String(row.product_slug || '').trim().toLowerCase());
    const catalogSet = new Set(catalogSlugs);
    const inventorySet = new Set(inventorySlugs);
    const missing = catalogSlugs.filter((slug) => !inventorySet.has(slug));
    const orphaned = inventorySlugs.filter((slug) => !catalogSet.has(slug));
    const invalid = (rows || []).flatMap((row) => {
      const issues = [];
      const stock = Number(row.stock_on_hand);
      const reserved = Number(row.stock_reserved);
      if (!Number.isInteger(stock) || stock < 0) issues.push('negative_or_invalid_stock');
      if (!Number.isInteger(reserved) || reserved < 0) issues.push('negative_or_invalid_reserved');
      if (!row.allow_backorder && reserved > stock) issues.push('reserved_exceeds_stock');
      if (catalogSet.has(row.product_slug) && row.status !== 'active') issues.push('catalog_product_inactive');
      return issues.length ? [{ product_slug: row.product_slug, issues }] : [];
    });
    const warnings = (rows || []).filter((row) => row.allow_backorder).map((row) => ({
      product_slug: row.product_slug,
      issue: 'backorder_enabled_requires_business_confirmation'
    }));
    const duplicateCatalogSlugs = duplicates(catalogSlugs);
    const duplicateInventorySlugs = duplicates(inventorySlugs);
    const healthy = !missing.length && !duplicateCatalogSlugs.length && !duplicateInventorySlugs.length && !invalid.length;
    return json({
      ok: true,
      healthy,
      summary: {
        catalog_products: catalogSlugs.length,
        inventory_records: rows?.length || 0,
        missing_records: missing.length,
        orphaned_records: orphaned.length,
        invalid_records: invalid.length,
        warnings: warnings.length
      },
      issues: { missing, orphaned, duplicateCatalogSlugs, duplicateInventorySlugs, invalid, warnings },
      checked_at: new Date().toISOString()
    }, { status: healthy ? 200 : 409, headers: NO_STORE });
  } catch (error) {
    return adminError(error, 'Stok sağlık kontrolü tamamlanamadı.');
  }
}
