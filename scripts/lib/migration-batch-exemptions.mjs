export const D3A_MIGRATION_FILE = '20260706_d3a_order_item_pricing_snapshot.sql';
export const P1C_MIGRATION_FILE = '20260707_p1c_admin_product_price_editing.sql';

export function migrationChangesExcludingBatchMigrations(lines = []) {
  return (lines || []).filter((line) => {
    const text = String(line).trim();
    if (!text) return false;
    if (text.includes(D3A_MIGRATION_FILE)) return false;
    if (text.includes(P1C_MIGRATION_FILE)) return false;
    return true;
  });
}
