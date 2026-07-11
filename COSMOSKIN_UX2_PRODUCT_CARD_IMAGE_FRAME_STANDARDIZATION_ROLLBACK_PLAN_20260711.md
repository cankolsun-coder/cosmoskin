# UX2 Rollback Plan — Product Card Image Frame Standardization (2026-07-11)

## When to rollback
- Product images appear too small or with excessive padding
- Grid cards clip favorite buttons or badges
- Sale price row overflows on specific breakpoints
- Mobile card layout regression

## Steps
1. Revert files listed in `COSMOSKIN_UX2_PRODUCT_CARD_IMAGE_FRAME_STANDARDIZATION_CHANGED_FILES_20260711.txt`
2. Remove `scripts/validate-ux2-product-card-image-frame-standardization.mjs`
3. Run `validate-p1e3` + `validate-c3` to confirm sale display and cart parity intact
4. Deploy reverted bundle if already shipped

## Partial rollback
- **CSS-only:** revert `product-card-frame.css` + bootstrap in `products-data.js`; keep `cs-product-card` class tags (harmless)
- **Bestseller-only:** revert `bestsellers.css` changes if homepage section is the only issue

## Data impact
None. No database, catalog, or order changes.
