# C4 Runbook — Checkout Order Creation After Coupon

## Validate

```bash
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node --test tests/local-integration.test.mjs
```

## Manual QA (wrangler dev)

1. Log in as new first-order customer.
2. Add 2× COSRX Snail Essence.
3. Apply WELCOME10 — expect ₺150 discount, total ₺2,377.
4. Choose **Havale / EFT**, complete legal consents.
5. Click **Siparişi Oluştur**.
6. Expect success screen with order number + bank details (not generic 500).

## Negative cases

- Invalid coupon at submit → specific coupon message (not generic 500).
- Stock insufficient → item-level stock message.
- Missing bank config → payment method error.

## Do not

- Deploy from this runbook unless explicitly approved.
- Run SQL or create migrations for C4.
