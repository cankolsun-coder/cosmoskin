export const PRICING_SNAPSHOT_VERSION = 'v1_proportional_last_line_remainder';

export function roundSnapshotMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Proportional order-discount allocation — same rules as checkout Iyzico basket.
 * Last eligible line absorbs rounding remainder.
 */
export function buildOrderItemPricingSnapshots(cart = [], discountAmount = 0, version = PRICING_SNAPSHOT_VERSION) {
  const items = (cart || []).filter((row) => Number(row?.line_total) > 0);
  const subtotal = roundSnapshotMoney(
    items.reduce((sum, row) => sum + Math.max(0, Number(row?.line_total) || 0), 0)
  ) ?? 0;
  const discount = roundSnapshotMoney(Math.max(0, Math.min(subtotal, Number(discountAmount) || 0))) ?? 0;

  if (!items.length || subtotal <= 0 || discount <= 0) {
    return items.map((item) => {
      const lineSubtotal = roundSnapshotMoney(item.line_total) ?? 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const paidLineTotal = lineSubtotal;
      return {
        ...item,
        allocated_order_discount: 0,
        paid_line_total: paidLineTotal,
        paid_unit_price: roundSnapshotMoney(paidLineTotal / quantity) ?? 0,
        pricing_snapshot_version: version
      };
    });
  }

  let allocatedSum = 0;
  return items.map((item, index) => {
    const lineSubtotal = roundSnapshotMoney(item.line_total) ?? 0;
    const quantity = Math.max(1, Number(item.quantity) || 1);
    let allocatedDiscount = 0;
    if (index === items.length - 1) {
      allocatedDiscount = roundSnapshotMoney(discount - allocatedSum) ?? 0;
    } else {
      allocatedDiscount = roundSnapshotMoney(discount * (lineSubtotal / subtotal)) ?? 0;
      allocatedSum = roundSnapshotMoney(allocatedSum + allocatedDiscount) ?? allocatedSum;
    }
    const paidLineTotal = roundSnapshotMoney(Math.max(0, lineSubtotal - allocatedDiscount)) ?? 0;
    const paidUnitPrice = roundSnapshotMoney(paidLineTotal / quantity) ?? 0;
    return {
      ...item,
      allocated_order_discount: allocatedDiscount,
      paid_line_total: paidLineTotal,
      paid_unit_price: paidUnitPrice,
      pricing_snapshot_version: version
    };
  });
}

export function isValidPricingSnapshot(row = {}) {
  if (!row?.pricing_snapshot_version) return false;
  const lineTotal = roundSnapshotMoney(row.line_total);
  const paidLine = roundSnapshotMoney(row.paid_line_total);
  const alloc = roundSnapshotMoney(row.allocated_order_discount);
  const paidUnit = roundSnapshotMoney(row.paid_unit_price);
  const quantity = Number(row.quantity);
  if (lineTotal == null || paidLine == null || alloc == null || paidUnit == null) return false;
  if (alloc < 0) return false;
  if (paidLine > lineTotal + 0.001) return false;
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  if (paidUnit <= 0) return false;
  if (Math.abs(paidLine - (lineTotal - alloc)) > 0.02) return false;
  return true;
}

export function orderItemsHaveCompleteSnapshots(orderItems = []) {
  const items = (orderItems || []).filter((row) => Number(row?.line_total) > 0);
  if (!items.length) return false;
  return items.every(isValidPricingSnapshot);
}

export function snapshotAllocationFromOrderItem(row = {}) {
  const quantity = Math.max(1, Number(row.quantity) || 1);
  const lineSubtotal = roundSnapshotMoney(row.line_total) ?? 0;
  const allocatedDiscount = roundSnapshotMoney(row.allocated_order_discount) ?? 0;
  const linePaidTotal = roundSnapshotMoney(row.paid_line_total) ?? 0;
  const paidUnitPrice = roundSnapshotMoney(row.paid_unit_price) ?? roundSnapshotMoney(linePaidTotal / quantity) ?? 0;
  return {
    orderItemId: String(row.id || ''),
    lineSubtotal,
    allocatedDiscount,
    linePaidTotal,
    paidUnitPrice,
    quantity,
    pricingSnapshotVersion: String(row.pricing_snapshot_version || '')
  };
}
