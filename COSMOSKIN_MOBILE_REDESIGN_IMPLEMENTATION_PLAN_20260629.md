# COSMOSKIN Mobile Redesign Implementation Plan — 2026-06-29

## Scope

Input package: `cosmoskin 7(2).zip`.

Instruction source: `Yapıştırılan metin(66).txt`, `COSMOSKIN_MOBILE_AUDIT_REPORT_20260629(5).md`, `cosmoskin_mobile_audit_metrics(3).json`.

This implementation is strictly mobile-only. Desktop visual/layout behavior is protected.

## Audit summary

The audit identified the core mobile failure as architecture-level conflict: `assets/mobile.js`, `assets/mobile-redesign.js`, and `assets/bottom-nav.js` can all inject competing mobile UI. Checkout, account, auth, coupons, payment status pages, and legal/contact routes were not consistently handled by one controlled mobile system.

## Blocker list addressed

1. Multiple mobile renderers conflict.
2. Duplicate mobile bottom navigation risk.
3. Checkout not covered by mobile shell.
4. Account tabs not reliable on mobile.
5. Hardcoded outdated coupon behavior.
6. Missing mobile password show/hide.
7. Body scroll lock missing for mobile sheets.
8. Header not matching mobile target structure.
9. Legal/contact content replacement risk.
10. Payment success/failure/order tracking lacking mobile coverage.

## Files to change

- Add `/assets/cosmoskin-mobile-redesign-v1.css`.
- Add `/assets/cosmoskin-mobile-redesign-v1.js`.
- Gate legacy mobile scripts:
  - `/assets/mobile.js`
  - `/assets/mobile-redesign.js`
  - `/assets/bottom-nav.js`
- Normalize mobile coupon references:
  - `/assets/master-upgrade.js`
  - `/assets/phase6-commerce.js`
- Add mobile v1 CSS/JS references to public storefront HTML routes.

## Files not to touch intentionally

- No Supabase migration files.
- No database schema files.
- No admin route behavior.
- No product image assets.
- No desktop-specific layout templates beyond adding mobile-only CSS/JS references.

## Desktop protection strategy

- New visual CSS is inside `@media (max-width: 767px)` or tablet media query only.
- Existing desktop HTML remains intact.
- Desktop header/footer/cart/checkout/account structures are not removed.
- Legacy mobile scripts are gated only because they are mobile renderers; desktop behavior is not expected to depend on them.
- New script activates only after mobile viewport detection.

## Mobile architecture strategy

The new `cosmoskin-mobile-redesign-v1` layer is the single mobile controller. It injects one mobile header, one normalized bottom nav, one shared set of sheets, one body scroll lock manager, one cart sheet, one filter sheet, and mobile route classes.

## Route coverage strategy

The controller applies route classes for home, listing, PDP, cart, checkout, account, payment success/failure, order tracking, routine, content/legal/contact pages. It does not hide legal/contact content; it preserves original page content and only applies mobile layout polish.

## Checkout strategy

Checkout is not reimplemented as a separate fake flow. The existing checkout engine remains the source of truth. The mobile v1 layer adds mobile-first layout, hides bottom nav on checkout, improves safe area spacing, and preserves bank transfer behavior.

## Account strategy

The existing account dashboard remains the source of truth. Mobile v1 adds account route class, converts the desktop sidebar into mobile horizontal segmented tabs, and adds password show/hide controls.

## Coupon/auth/cart strategy

- Outdated coupon string references are removed from active assets.
- WELCOME10 remains the supported visible coupon code.
- Mobile cart sheet reads the shared `cosmoskin_cart` localStorage / cart API.
- Password show/hide is added to mobile forms.

## Legal/contact preservation strategy

No summary-only extraction is used. Original legal/contact content remains visible. Mobile CSS adds overflow protection for tables and long content.

## QA strategy

Static/source QA is mandatory. Browser rendering in this sandbox may be blocked or hang, so real staging QA on iOS Safari and Chrome mobile remains required.

## Rollback notes

Rollback is simple: remove the two v1 assets and remove their link/script references from HTML, then restore the three legacy mobile scripts from the previous zip.
