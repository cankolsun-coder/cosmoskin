# COSMOSKIN Routine Route Restore Hotfix V4 — 2026-07-01

## Problem
- `/akilli-rutin.html` was opening the newer wizard route that is not the routine center normally used in the project.
- Header/menu/product CTA links were routed to `/akilli-rutin.html`.
- `assets/routine-route-bridge.js` hijacked public routine links such as `/routine.html`, `/rutinler.html`, and `/collections/routine.html` and redirected them into the account-only `/account/routines/` area. This caused the user-facing Rutinler link to feel like a different/private page.

## Fix Applied
- Restored the public routine destination to the old approved routine center: `/routine.html`.
- Replaced public links from `/akilli-rutin.html` to `/routine.html` across HTML/JS assets.
- Replaced the direct `/akilli-rutin.html` file content with the old approved routine center content so legacy/direct visits no longer open the broken wizard.
- Patched `assets/routine-route-bridge.js` so it only normalizes account-only routine aliases:
  - `/account/routines*`
  - `/account/routine-profile*`
  - `/account/routine-favorites*`
  - `/account/routine-history*`
  - `/account/routine-compare*`
- Public routine pages are no longer redirected to account-only routine pages.

## Header/Footer Protection
- Header/footer design was not redesigned.
- Only link targets related to Rutinler were corrected.
- C+S/account header fixes from the previous hotfix were preserved.

## Tests Performed
- `node --check` passed for all JS files under `assets` and `functions`.
- Static server checks returned HTTP 200 for:
  - `/routine.html`
  - `/akilli-rutin.html`
  - `/account/profile.html`
- Verified there are no remaining `/akilli-rutin.html` references in HTML/JS files.
- Zip integrity test passed.

## Deployment Note
Deploy this V4 package instead of V3. After deploy, clear Cloudflare cache or use a hard refresh because route HTML and JS assets may be cached.
