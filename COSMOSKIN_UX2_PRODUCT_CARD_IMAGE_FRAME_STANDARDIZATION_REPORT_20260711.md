# UX2 Product Card Image Frame Standardization — Report (2026-07-11)

## Root cause
Product card media areas across listing surfaces lacked a single enforced frame contract. Some CSS paths let image natural dimensions influence card height (`height: auto` on `.product-media img` in `mobile.css`, fixed pixel heights / `min-height` in bestseller variants, and `object-fit: cover` in base styles). Tall bottle images could expand the media block and break grid rhythm.

## Surfaces audited
1. Category / listing pages — `collection-renderer.js` + collection HTML grids
2. Çok Satanlar — `bestsellers.js` + `bestsellers.css`
3. Homepage product grids — `phase6-commerce.js`, `master-upgrade.js`
4. Recommendation sections — `phase6-commerce.js`, `pdp-professional.js`
5. Mini cart recommendation carousel — `phase6-commerce.css` `#cartDrawer .phase6-rec-card`
6. cart.html recommendations — `master-upgrade.js` / phase6 rec cards
7. Search results — compact rows (`js/search.js`, `app.js`); price wrap hardened via existing P1E3 CSS
8. Favorites — account cards (mini thumbs, not full grid cards)
9. Smart routine / quiz — `smart-routine.js` + frame rules in `product-card-frame.css`
10. All products catalog — `allproducts.js` + `allproducts.css`
11. Mobile redesign cards — `mobile-redesign.js` / `.cm-product-card`
12. Cart drawer recs — `master-upgrade.js` `cs-product-card` + phase6 rec cards

## Shared classes / CSS
- New: `assets/product-card-frame.css`
- Bootstrap: `assets/products-data.js` injects frame CSS on storefront pages
- Normalized BEM: `.cs-product-card`, `.cs-product-card__media`, `.cs-product-card__body` (legacy `.product-card` + `.product-media` mapped in CSS)
- Renderers tagged with `cs-product-card`: collection, bestsellers, allproducts, PDP related cards

## Before / after
| Before | After |
|--------|-------|
| Tall images could stretch card media | Fixed 1:1 aspect-ratio media frame |
| Mixed `cover` / natural height | `object-fit: contain`, centered |
| Uneven row heights in grids | Cards align; body/CTA uses flex column |
| Bestseller mobile `height:auto` media | Aspect-ratio preserved at all breakpoints |

## P1E sale display compatibility
- No pricing resolver / checkout / coupon changes
- `price-display.js` / `price-display.css` untouched
- Sale + compare-at render in card price rows with existing `.cs-price` compact mode
- `data-price` remains payable effective price from product data layer

## Files changed
See `COSMOSKIN_UX2_PRODUCT_CARD_IMAGE_FRAME_STANDARDIZATION_CHANGED_FILES_20260711.txt`

## Proof
- `products.json` — unchanged (no diff)
- No SQL, deploy, or migrations

## Test / validator results
- **Integration tests:** 219/219 passed
- **UX2 validator:** passed (includes P1E3 + C3 nested)
- **P1E3, C3, C4, I2, production-readiness:** passed (Section 11 chain)
- **P1E4:** run separately via `validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs` (~15 min nested chain; green at P1E4 commit)

## Rollback
See `COSMOSKIN_UX2_PRODUCT_CARD_IMAGE_FRAME_STANDARDIZATION_ROLLBACK_PLAN_20260711.md`
