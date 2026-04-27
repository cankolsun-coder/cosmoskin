## Standardized Components

- Shared header/navigation shell via `assets/app.js`
- Shared mobile navigation via `assets/app.js`
- Shared footer and payment-logo ordering via `assets/app.js`
- Shared cart/account/auth/cookie shell via `assets/app.js`
- Shared product-card renderer for collections, search, and account favorites
- Shared product-card spacing, ratio, favorite button, CTA, and toast styling in `assets/style.css`
- Product page cleanup order enforcement by removing legacy FAQ/review leftovers in `assets/product-page.js`

## Files Changed

- `assets/app.js`
- `assets/collection-renderer.js`
- `assets/product-page.js`
- `assets/style.css`
- `js/search.js`
- `search.html`
- `index.html`
- `account/profile.html`
- `account/orders.html`
- `payment/success.html`
- `payment/failure.html`

## Legacy UI Removed

- Search-page custom minimal header variant
- Account profile custom header/footer variant
- Account orders custom header/footer variant
- Payment success/failure duplicated footer markup
- Homepage inline `favorites-collections-safari-fix` block
- Legacy favorites card markup/CSS on account profile
- PDP legacy FAQ block and empty tab leftovers

## Remaining Inconsistencies

- Many public HTML files still keep their original static header/footer source markup in the file, but runtime output is normalized by `assets/app.js`.
- Homepage featured cards and PDP recommendation cards still use page-authored HTML, but they now inherit the same shared card styling and state behavior.

## Test Cases Performed

- `node --check assets/app.js`
- `node --check assets/collection-renderer.js`
- `node --check assets/product-page.js`
- `node --check js/search.js`
- `rg` verification that account/search/payment pages now load the shared shell scripts
- `rg` verification that homepage inline safari favorite override block was removed
- `rg` verification that touched pages now use shared header/footer placeholders where updated
- Static verification that favorites cards render through `window.COSMOSKIN_RENDER_PRODUCT_CARD`
- Static verification that product-page cleanup removes `.pdp-faq` and legacy review placeholder hosts before review init
