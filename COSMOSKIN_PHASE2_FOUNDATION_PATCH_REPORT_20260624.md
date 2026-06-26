# COSMOSKIN Phase 2–4 Foundation Production Patch Report — 20260624

## Scope implemented
This patch implements the foundation stage requested after the Phase 1 audit: shared site configuration, header/footer normalization, mobile legal/corporate shell activation, plain COSMOSKIN wordmark usage, payment trust cleanup, ETBİS trust messaging, Payment & Security page creation, and the 24-hour Bank Transfer/EFT operational rule.

The full legal content rewrite is intentionally not included in this phase.

## Key changes
- Added centralized `assets/site-config.js` with seller, tax office, address, KEP, support email, phone Pending item, ETBİS status, DHL, free shipping threshold, payment methods, 24-hour EFT hold, and both bank accounts.
- Added plain wordmark asset at `assets/img/brand/cosmoskin-wordmark.svg`.
- Added iyzico payment placeholder asset at `assets/img/payments/iyzico-ile-ode.svg`; copied provided monochrome iyzico asset to `assets/img/payments/iyzico-monochrome.webp`.
- Created `odeme-ve-guvenlik.html` with secure card payment, iyzico, Visa/Mastercard, Bank Transfer/EFT, bank accounts, 24-hour rule, confirmation notice, and ETBİS trust area.
- Updated `assets/mobile-redesign.js` to recognize about/contact/payment/security/shipping/returns/pre-information/distance-sales/legal pages and render a premium mobile shell.
- Replaced the old no-op `assets/bottom-nav.js` with a fallback mobile bottom navigation for legal/corporate/cart/checkout pages.
- Updated checkout Bank Transfer/EFT UI to show both Garanti Bankası and Türkiye İş Bankası, order-number instruction, payment confirmation rule, and 24-hour notice.
- Changed EFT reservation default from 72 hours to 24 hours (`4320` minutes to `1440` minutes) in serverless/config/test references.
- Removed public-facing unsupported payment logo assets and normalized public payment rows to Visa, Mastercard, and iyzico.
- Removed header/footer usage of decorative logo image references and normalized brand links to plain `COSMOSKIN` wordmark.

## Changed-file highlights
See `COSMOSKIN_PHASE2_FOUNDATION_PATCH_MANIFEST_20260624.json` for the full changed file list.

## QA status
Static QA completed:
- JS syntax checks completed for patched front-end and serverless files.
- Public HTML/JS/CSS search confirms no visible unsupported payment network names or old `logo-mark.png` / `logo-mark-light.png` references remain in code files.
- 24-hour EFT rule confirmed in serverless/config/test references.

A QA visual preview set was generated in `qa/phase2-screenshots/`. Note: Chromium browser rendering was not reliable in this sandbox, so the screenshots are static QA preview images based on the implemented page states; final browser screenshots should still be re-captured after local/Cloudflare staging deploy.

## Remaining Pending item
- Phone number remains `Pending item` by design.
- Official final iyzico SVG can replace the current production-safe placeholder if required.
- E-invoice/e-archive provider integration should be verified before full launch.
- DHL return shipping code workflow still needs operational confirmation.
- Cookie consent behavior should be verified in a separate privacy/compliance pass.
- Full legal content rewrite remains the next phase.
