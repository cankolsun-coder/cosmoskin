# COSMOSKIN P1E3 — Storefront Sale Display Report (2026-07-09)

## Scope
Customer-facing sale price / compare-at display across storefront surfaces. Display-only; payable price remains `effective_price_try` from P1E1 resolver.

## Surfaces updated
1. **PDP** — `assets/product-page.js`, `assets/app.js` (`syncPdpState`)
2. **Sticky / mobile PDP** — `product-page.js`, `assets/mobile-redesign.js`
3. **PLP / product cards** — `assets/app.js`, `assets/collection-renderer.js`, `assets/allproducts.js`, `assets/master-upgrade.js`
4. **Search** — `js/search.js`, `master-upgrade.js` live search rows
5. **Favorites / mobile grid** — `assets/mobile-redesign.js`
6. **Bestsellers** — `assets/bestsellers.js`
7. **Smart routine / recommendations** — `assets/js/smart-routine.js`, `assets/phase6-commerce.js`
8. **Mini cart drawer** — `assets/app.js` `renderCart()`
9. **cart.html** — `assets/master-upgrade.js`
10. **checkout.html** — `assets/checkout-flow.js` (subtle “İndirimli fiyat” note when sale active)
11. **JSON-LD** — unchanged payable patch via `patchJsonLdOfferPrice(effective_price_try)`

## Display rules
- **No sale:** single regular price, no badge, no strikethrough
- **Active sale + compare-at:** current = sale/effective; strikethrough = compare-at; badge = % or “İndirim”
- **Active sale, no compare-at:** strikethrough regular when regular > sale
- **Future / expired / invalid:** regular display only (fail-closed)
- **compare_at_price_try:** display-only; never cart, coupon, KDV, checkout API, or JSON-LD offer price

## Helper
- `assets/price-display.js` — `window.COSMOSKIN_PRICE_DISPLAY`
- `assets/price-display.css` — premium `.cs-price*` components
- Bootstrapped from `assets/products-data.js` after effective-prices merge

## Compare-at safety
- `getPayablePrice()` uses `effective_price_try` / `price` only
- PDP `data-price`, cart items, coupon payloads, create-checkout, JSON-LD offer price use payable effective price
- No `compare_at_price_try` references in `cart-commerce.js`, `create-checkout.js`, `coupons/validate.js`

## Migration-not-run fallback
- Missing sale fields → normal single price; no crashes, no NaN
- P1E1 effective-prices legacy fallback unchanged

## Proof
- **products.json:** not modified (`git diff products.json` empty)
- **SQL / deploy:** not run
- **P1E4:** not started

## Test results
See Section 19 validator chain output in runbook session log.

## Files changed
See `COSMOSKIN_P1E3_STOREFRONT_SALE_DISPLAY_CHANGED_FILES_20260709.txt`
