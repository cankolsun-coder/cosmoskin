# COSMOSKIN I1 — Inventory Checkout Blocking Runbook

**Date:** 2026-07-06

---

## Pre-deploy verification

```bash
node --check functions/api/create-checkout.js
node --check assets/account-dashboard.js
node --check assets/master-upgrade.js
node --check assets/checkout-flow.js
node --check assets/inventory-client.js
node scripts/validate-i1-inventory-checkout-blocking.mjs
node --test tests/local-integration.test.mjs
```

---

## Manual smoke (wrangler dev recommended)

1. Set a product `stock_on_hand = 0` in admin inventory.
2. Favorite the product — favorite should remain; button shows **Stokta yok**.
3. Confirm **Sepete Ekle** does not add to cart.
4. If item already in cart, cart shows warning; desktop checkout disabled.
5. Navigate to `/checkout.html` — blocking state; cannot submit.
6. Attempt checkout API — `409` with `stock_unavailable` and `items[]`.

---

## Production monitoring

- Watch for `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `PRODUCT_NOT_ACTIVE` in create-checkout logs.
- No change to reservation cron schedule.

---

## Support copy (Turkish)

- Bu ürün şu anda stokta yok.
- Sepetinizde stokta olmayan ürünler var.
- Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.
- Bu miktar için yeterli stok bulunmuyor.
