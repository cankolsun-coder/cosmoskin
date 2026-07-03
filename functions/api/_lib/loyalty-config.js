// COSMOSKIN Batch 4 — canonical loyalty tier configuration.
// Single source of truth for tier names/thresholds on the JS side, mirroring
// public.membership_levels and the Signature/Elite thresholds used by
// recalculate_customer_membership() in supabase/migrations/20260704_batch4_loyalty_ledger.sql.
//
// Only Essential / Signature / Elite exist — no other legacy/misspelled tier names.
// Basis is always product-net spend (ex-shipping) — never total_amount.

export const LOYALTY_TIERS = Object.freeze({
  essential: Object.freeze({ code: 'essential', label: 'Essential Üye', spendThreshold: 0, orderThreshold: 0 }),
  signature: Object.freeze({ code: 'signature', label: 'Signature Üye', spendThreshold: 6000, orderThreshold: 3 }),
  elite: Object.freeze({ code: 'elite', label: 'Elite Üye', spendThreshold: 15000, orderThreshold: 8 })
});

export const TIER_ORDER = Object.freeze(['essential', 'signature', 'elite']);

export function normalizeTierCode(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('elite')) return 'elite';
  if (raw.includes('signature')) return 'signature';
  return 'essential';
}

export function tierLabel(code) {
  return LOYALTY_TIERS[normalizeTierCode(code)].label;
}

/**
 * Compute the canonical tier from product-net spend (ex-shipping) and eligible
 * completed order count, using the same OR-threshold rule as the SQL RPC:
 * Signature: spend >= 6,000 OR orders >= 3. Elite: spend >= 15,000 OR orders >= 8.
 */
export function computeTierFromSpend(spend, orderCount) {
  const s = Math.max(0, Number(spend) || 0);
  const c = Math.max(0, Number(orderCount) || 0);
  const elite = LOYALTY_TIERS.elite;
  const signature = LOYALTY_TIERS.signature;

  if (s >= elite.spendThreshold || c >= elite.orderThreshold) {
    return { code: 'elite', label: elite.label, progress: 100, nextCode: null, nextLabel: null, thresholdSpend: null };
  }

  if (s >= signature.spendThreshold || c >= signature.orderThreshold) {
    const span = Math.max(1, elite.spendThreshold - signature.spendThreshold);
    const progress = Math.min(96, Math.max(0, Math.round(((s - signature.spendThreshold) / span) * 100)));
    return { code: 'signature', label: signature.label, progress, nextCode: 'elite', nextLabel: elite.label, thresholdSpend: elite.spendThreshold };
  }

  const progress = Math.min(92, Math.max(0, Math.round((s / Math.max(1, signature.spendThreshold)) * 100)));
  return { code: 'essential', label: LOYALTY_TIERS.essential.label, progress, nextCode: 'signature', nextLabel: signature.label, thresholdSpend: signature.spendThreshold };
}

// 1 TL product-net = 1 point earned. Redemption rate (100 P = 1 TL) is a
// separate customer-facing conversion defined in functions/api/loyalty/redeem.js.
export const POINTS_PER_TL = 1;
