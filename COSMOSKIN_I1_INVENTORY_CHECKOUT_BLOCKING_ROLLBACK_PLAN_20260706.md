# COSMOSKIN I1 — Rollback Plan

**Date:** 2026-07-06

---

## When to rollback

- Checkout false positives blocking valid carts
- Favorites/cart UI regression blocking all purchases
- Structured stock errors breaking checkout clients

---

## Steps

1. Revert I1 implementation commit(s) (code-only; no DB rollback needed).
2. Redeploy previous Cloudflare Pages build.
3. Verify:
   ```bash
   node scripts/validate-h0-live-payment-rpc-hotfix.mjs
   node --test tests/local-integration.test.mjs
   ```
4. Smoke: in-stock PDP add-to-cart + successful checkout for valid cart.

---

## No migration rollback

I1 did not create or modify `supabase/migrations/*` or run SQL.

---

## Partial rollback (not recommended)

If only frontend is problematic, revert `assets/*` files while keeping server `validateCartStock` — checkout remains fail-closed server-side.
