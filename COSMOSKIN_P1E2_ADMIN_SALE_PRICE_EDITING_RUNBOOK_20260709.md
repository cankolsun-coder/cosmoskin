## COSMOSKIN — P1E2 Runbook (2026-07-09)

```bash
node scripts/validate-p1e2-admin-sale-price-editing.mjs
node scripts/validate-p1e1-sale-price-resolver-model.mjs
node scripts/validate-p1d-admin-price-audit-history.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

Manual QA (after migration applied in prod):
1. Admin → Ürünler → set normal + sale + compare-at + window
2. Verify status badge updates (İndirim aktif / planlandı)
3. Clear sale fields → verify “İndirim kaldırıldı” in history
4. Storefront should still show single payable price (no crossed-out UI until P1E3)

Do not run SQL from Cursor.
