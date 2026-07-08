# COSMOSKIN P1C4 Live PDP Effective Price Runtime Fix — Rollback Plan

Date: 2026-07-07

## Scope

Rollback only the PDP runtime effective price patcher introduced in P1C4.

Checkout/coupon/order integrity remains safe via P1C2 server-side effective pricing regardless of this rollback.

## Rollback steps

Revert the P1C4 commit, or restore these files to pre-P1C4 state:

- `assets/product-page.js`
- `scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs`
- `tests/local-integration.test.mjs`
- `COSMOSKIN_P1C4_LIVE_PDP_EFFECTIVE_PRICE_RUNTIME_*` docs

## Post-rollback behavior

- PDP may again show stale static prices (e.g. `₺899`) after an admin override (e.g. `1099`).
- PDP button `data-price` may remain stale until another layer updates it.
- Checkout remains authoritative and will still charge the effective price (server-trusted).

## Verification after rollback

```bash
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-effective-price-display-parity.mjs
node --test tests/local-integration.test.mjs
```

