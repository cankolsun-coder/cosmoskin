# COSMOSKIN UX3B — Storefront Polish Hotfix Report
**Date:** 2026-07-11 · **Scope:** four live UI/runtime fixes, presentation/hydration only. No pricing/coupon/checkout/stock/admin/refund/database logic touched.

## 1. Mini cart close X — root cause & fix
**Root cause:** [app.js] bound `.close-any` clicks **per node at startup** (`$$('.close-any').forEach(addEventListener)`), but the premium drawer head is injected at runtime by `enhanceCartDrawerHeader()` (since C3), replacing the original bound button with a new, unbound one → the X did nothing (Escape and overlay still worked because those bind to `document`/`#backdrop`).
**Fix:** replaced the per-node binding with a **delegated `document` click handler** (`event.target.closest('.close-any')` → `closeDrawers()/closeModals()`), so any current or future injected close button works. No duplicate listeners (the delegation replaces the loop entirely), overlay + Escape behavior untouched.

**Premium visual:** the bare text `×` became a **thin-stroke SVG icon** (1.8 stroke, round caps — house icon style) inside the existing 38px ivory circle; soft shadow, hover tint, `:active` scale, visible gold focus ring, `aria-label="Sepeti kapat"`, `type="button"`. Verified optically centered.

## 2. PDP stale price flash — root cause & fix
**Root cause:** pre-rendered PDP HTML contains the build-time price (e.g. ₺849). `product-page.js` (P1C4) patches the admin effective price only after fetching `/api/catalog/effective-prices` — so for the network round-trip the customer saw the old price as if authoritative.
**Fix — hydration state (no resolver changes):**
- **CSS skeleton** ([product-page.css], head-loaded → applies from first paint): `.pdp5-price/.pdp-price/.mobile-sticky-pdp__copy` are shimmer-skeletoned while they lack `data-price-ready="true"` (text transparent, no layout shift). A **pure-CSS failsafe animation** reveals the price after 2.8s even if JS never runs — a price can never stay hidden.
- **JS lifecycle** ([product-page.js]): `data-cs-price-hydrating` set at init; `markPdpPriceReady()` fires on the first authoritative patch (`patchPdpPriceSurfaces` → `'patched'`), on API failure (`'static-fallback'` — reveals the static catalog price, documented safe behavior; checkout remains server-authoritative), or on a **2.5s hard timeout**. The early catalog patch now only renders immediately when the catalog already carries the effective overlay (`effective_price_source !== 'static'`).
- **Add-to-cart protection:** purchase buttons (`.pdp-actions/.pdp5-actions [data-add-cart]`, `#mobileStickyAddBtn`, `[data-buy-now]`) are held with `data-price-waiting` + `disabled` until ready (re-enable respects `is-stock-disabled`); **Buy-now additionally `await`s the hydration promise** so a checkout redirect can never be built from a stale price.
- P1C4 retries (450/1600ms) and `products-updated` re-patch kept verbatim; JSON-LD still receives the payable effective price; `compare_at_price_try` remains display-only.

## 3. Account/Hesabım header mismatch — root cause & fix
**Root cause:** `account-premium.css` overrode the shared header with `!important`: logo **32px** (vs homepage **46px**), brand gap **12px** (vs 22px), header height **80px** (vs the Phase-8 homepage `74px` in style.css — the account rule out-specified it). A later non-important 40px logo rule added drift.
**Fix:** normalized the desktop overrides to the homepage values — height 74px, logo 46px (incl. `flex-basis`), gap 22px, 40px variant aligned to 46px. Mobile (≤760/768px) account-header rules left as-is: the homepage uses the separate cm-mobile header there, so there is no homepage counterpart to match. Measured after fix: **home 74/46/22 == account 74/46/22**.

## 4. PDP duplicate price under “Bu ürünle uyumlu öneriler” — root cause & fix
**Root cause (reproduced on production, then locally):** `patchPdpPriceSurfaces` first **sets** `data-product-price` on `#reviewsSection` (as *data* for the reviews widget), and its patch selector list includes `'[data-product-price]'`. On the next patch pass (P1C4's 450ms retry guarantees one), the reviews shell itself matched the selector and got **price markup injected** (`.cs-price--stack` → bare “₺849”), rendering a stray duplicate price label directly below the recommendations section.
**Fix:** the patch loop now **skips `#reviewsSection` and anything inside it** — the attribute is still written for the widget; only the wrongful markup injection is gone. Legitimate recommendation-card prices are untouched (verified: 4 cards, exactly one price each).

## 5. Runtime verification (Playwright + system Chrome, local static server; 1280/390/360)
| Check | Result |
|---|---|
| Close X closes drawer — desktop & mobile | ✔ (SVG present, aria correct) |
| Overlay click & Escape still close | ✔ both |
| Stale price during hydration window (API delayed 600ms, override ₺1.200) | **skeletoned** (computed color transparent), never readable |
| After hydration | main **₺1.200**, sticky ready, `data-price` 1200, JSON-LD 1200, buttons released |
| Purchase buttons during hydration | `data-price-waiting` + disabled ✔ |
| API failure (500) | static ₺849 revealed ≤2.5s, buttons released ✔ |
| Account header vs home | **74px/46px/22px on both** ✔ |
| Reviews-section stray price after all retry passes | **gone** (0 bare `.cs-price`), widget data attribute kept ✔ |
| Console errors | **0** |

## 6. Files changed
- `assets/app.js` — delegated `.close-any` handler
- `assets/phase6-commerce.js` — SVG close icon markup
- `assets/phase6-commerce.css` — close-button icon/hover/active/shadow styles
- `assets/product-page.js` — hydration lifecycle, reviews-shell exclusion, buy-now guard
- `assets/product-page.css` — price skeleton + CSS reveal failsafe
- `assets/account-premium.css` — header parity normalization
- `scripts/validate-ux3b-storefront-polish-hotfix.mjs` — new validator
- `tests/local-integration.test.mjs` — +5 UX3B tests
- 4 UX3B docs

## 7. Validator / test results
UX3B (new), UX3, HF1, P1C4, P1E3, P1E4, C3, C4, I2, production-launch-readiness — all pass; integration suite **232 pass / 0 fail** (227 + 5 new UX3B tests). (Exact transcript in the runbook.)

## 8. Confirmations
- No SQL, no migrations, no deploy. `git diff -- products.json` empty. `.wrangler/` untouched.
- No pricing resolver, admin price, checkout, coupon, stock or refund logic modified (validator-enforced protected list; `functions/` untouched entirely).
- No UX4 / account-system rewrite / full-PDP redesign / product-specific hacks.

## 9. Rollback
Single-commit revert; see `COSMOSKIN_UX3B_STOREFRONT_POLISH_HOTFIX_ROLLBACK_PLAN_20260711.md`.
