# C3 Runbook — Mini Cart Parity + Premium Drawer

## Preconditions

- C2 committed (`coupon-client.js`, cart/checkout coupon parity).
- Local static: `python3 -m http.server 7700 --directory .`
- Full API flow: `npx wrangler pages dev . --compatibility-date=2024-06-01`

## Validation

```bash
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node --test tests/local-integration.test.mjs
```

## Manual QA

### Coupon parity (logged-in customer, first order eligible)

1. Add 2× COSRX Snail Essence (or any ≥₺1,000 subtotal fixture).
2. Apply `WELCOME10` on **cart.html** — expect success, ₺150 discount.
3. Open **mini cart drawer** — same code, same discount, no “hesabınız için uygun değil”.
4. Proceed to **checkout.html** — coupon hydrated, same ₺150, total ₺2,377 (with ₺89 shipping).

### Guest

- WELCOME10 rejected consistently on all three surfaces with auth-required messaging.

### Totals

Verify on drawer, cart page, checkout for same cart:

- Ürün toplamı / Ara toplam
- Kupon indirimi
- Kargo
- Dahil olan KDV
- Ödenecek toplam
- Free-shipping progress

### Stock (I2)

- In-stock item: checkout CTA enabled in drawer.
- Confirmed OOS: item warning + blocked checkout on cart page.

### UI

- Premium header “Sepetin”, subtitle, circular close.
- Long product names clamp to 2 lines.
- Empty cart: premium empty state.
- Recommendations: hidden when no candidates (cart.html + drawer).
- “Sepeti Düzenle” link in drawer footer.

## Deploy note

Do not deploy from this runbook unless explicitly approved. No deploy was performed for C3.
