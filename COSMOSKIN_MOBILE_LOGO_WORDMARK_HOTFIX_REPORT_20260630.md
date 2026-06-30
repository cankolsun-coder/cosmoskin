# COSMOSKIN Mobile Logo Wordmark Hotfix — 2026-06-30

## Scope

User reported that the COSMOSKIN mobile header wordmark was using the wrong sans-serif/bold font and should match the provided serif, wide-tracked reference logo.

## Files changed

- `assets/cosmoskin-mobile-redesign-v1.css`

## Change summary

- Updated `.cs-mobile-v1-logo` from `Plus Jakarta Sans` bold to `Cormorant Garamond` regular with wide letter spacing.
- Added a mobile-only wordmark correction block that also covers known mobile logo/wordmark classes if they appear on any mobile surface:
  - `.cs-mobile-v1-logo`
  - `.cs-mobile-v1-logo span`
  - `.cm-wordmark`
  - `.cm-footer-logo`
  - `.m-header__wordmark`
  - `.brand .brand-word`
  - `.footer .brand-word`
- Added a small-screen adjustment for screens under 375px to prevent the wordmark from overflowing.

## Desktop protection

Desktop was not changed. The visual correction is mobile-scoped through `@media (max-width: 767px)` and `@media (max-width: 374px)`.

## QA

- `assets/cosmoskin-mobile-redesign-v1.js` syntax check passed.
- CSS brace balance check passed.
- No Supabase migration required.

## Manual staging check

After deploy, check these pages on mobile:

- Home
- All Products
- Product detail
- Cart
- Checkout
- Account
- Contact/legal pages

Expected: every mobile header/footer wordmark should use the serif, spaced COSMOSKIN reference style.
