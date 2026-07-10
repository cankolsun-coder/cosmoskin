export const PRICING_SNAPSHOT_VERSION = 'v1_proportional_last_line_remainder';
export const PRICING_SNAPSHOT_VERSION_V2 = 'v2_eligible_lines_proportional_last_line_remainder';

/** Payable unit_price must never equal compare-at display price. */
export function isPayableSnapshotUnitPrice(unitPrice, item = {}) {
  const payable = Number(unitPrice);
  const compareAt = Number(item.compare_at_price_try);
  if (!Number.isFinite(payable) || payable <= 0) return false;
  if (Number.isFinite(compareAt) && compareAt > 0 && compareAt === payable) return false;
  return true;
}

export function roundSnapshotMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function isEligibleLine(item = {}, eligibility) {
  if (typeof eligibility === 'function') return Boolean(eligibility(item));
  if (eligibility && typeof eligibility === 'object') {
    if (typeof item.is_coupon_eligible === 'boolean') return item.is_coupon_eligible;
    const slug = String(item.product_slug || item.product_id || item.id || '').trim();
    if (!slug) return true;
    if (eligibility instanceof Set) return eligibility.has(slug);
    if (eligibility.eligibleSlugs instanceof Set) return eligibility.eligibleSlugs.has(slug);
    if (eligibility.eligible_slugs instanceof Set) return eligibility.eligible_slugs.has(slug);
  }
  return true;
}

/**
 * Proportional allocation helper used by snapshots/basket/refunds.
 * If exclusions exist, only eligible lines participate in the denominator.
 * Excluded lines receive allocated_order_discount = 0 and paid_line_total = line_total.
 */
export function allocateOrderDiscountSnapshots(cart = [], discountAmount = 0, { eligibility = null } = {}) {
  const items = (cart || []).filter((row) => Number(row?.line_total) > 0);
  const eligibleItems = eligibility ? items.filter((row) => isEligibleLine(row, eligibility)) : items;
  const fullSubtotal = roundSnapshotMoney(items.reduce((sum, row) => sum + Math.max(0, Number(row?.line_total) || 0), 0)) ?? 0;
  const eligibleSubtotal = roundSnapshotMoney(eligibleItems.reduce((sum, row) => sum + Math.max(0, Number(row?.line_total) || 0), 0)) ?? 0;
  const discount = roundSnapshotMoney(Math.max(0, Math.min(eligibleSubtotal, Number(discountAmount) || 0))) ?? 0;

  if (!items.length || eligibleSubtotal <= 0 || discount <= 0) {
    return items.map((item) => {
      const lineSubtotal = roundSnapshotMoney(item.line_total) ?? 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const paidLineTotal = lineSubtotal;
      return {
        item,
        eligible: eligibility ? isEligibleLine(item, eligibility) : true,
        fullSubtotal,
        eligibleSubtotal,
        allocatedDiscount: 0,
        paidLineTotal,
        paidUnitPrice: roundSnapshotMoney(paidLineTotal / quantity) ?? 0
      };
    });
  }

  let allocatedSum = 0;
  const lastEligibleIndex = items.map((item, idx) => (isEligibleLine(item, eligibility) ? idx : -1)).reduce((a, b) => Math.max(a, b), -1);

  return items.map((item, index) => {
    const lineSubtotal = roundSnapshotMoney(item.line_total) ?? 0;
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const eligible = eligibility ? isEligibleLine(item, eligibility) : true;
    let allocatedDiscount = 0;

    if (eligible && eligibleSubtotal > 0) {
      if (index === lastEligibleIndex) {
        allocatedDiscount = roundSnapshotMoney(discount - allocatedSum) ?? 0;
      } else {
        allocatedDiscount = roundSnapshotMoney(discount * (lineSubtotal / eligibleSubtotal)) ?? 0;
        allocatedSum = roundSnapshotMoney(allocatedSum + allocatedDiscount) ?? allocatedSum;
      }
    }

    const paidLineTotal = roundSnapshotMoney(Math.max(0, lineSubtotal - allocatedDiscount)) ?? 0;
    const paidUnitPrice = roundSnapshotMoney(paidLineTotal / quantity) ?? 0;
    return {
      item,
      eligible,
      fullSubtotal,
      eligibleSubtotal,
      allocatedDiscount,
      paidLineTotal,
      paidUnitPrice
    };
  });
}

/**
 * Proportional order-discount allocation — same rules as checkout Iyzico basket.
 * Last eligible line absorbs rounding remainder.
 */
export function buildOrderItemPricingSnapshots(cart = [], discountAmount = 0, config = PRICING_SNAPSHOT_VERSION) {
  const opts = (config && typeof config === 'object' && !Array.isArray(config))
    ? config
    : { version: config };
  const version = String(opts.version || PRICING_SNAPSHOT_VERSION);
  const eligibility = opts.eligibility || null;
  const allocations = allocateOrderDiscountSnapshots(cart, discountAmount, { eligibility });
  return allocations.map((row) => ({
    ...(row.item || {}),
    allocated_order_discount: row.eligible ? row.allocatedDiscount : 0,
    paid_line_total: row.paidLineTotal,
    paid_unit_price: row.paidUnitPrice,
    pricing_snapshot_version: version
  }));
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
