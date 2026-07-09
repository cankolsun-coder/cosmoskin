# C4 Rollback Plan

## Full rollback

```bash
git checkout HEAD -- functions/api/create-checkout.js assets/checkout-flow.js tests/local-integration.test.mjs
rm -f scripts/validate-c4-checkout-order-creation-after-coupon.mjs
rm -f COSMOSKIN_C4_CHECKOUT_ORDER_CREATION_AFTER_COUPON_*.md COSMOSKIN_C4_CHECKOUT_ORDER_CREATION_AFTER_COUPON_*.txt
```

Or: `git revert <c4-commit-sha>`

## Partial rollback

| Goal | Revert |
|------|--------|
| Backend only | `create-checkout.js` |
| Error messages only | `checkout-flow.js` `formatCheckoutApiError` |

## Verify after rollback

```bash
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node --test tests/local-integration.test.mjs
```

Note: rolling back reintroduces `order_items` spread bug and generic 500 on coupon checkout.
