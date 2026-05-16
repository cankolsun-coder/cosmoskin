# COSMOSKIN Rutinler Route Fix — 2026-05-16C

## Problem
The previous implementation relied on `/collections/routine` clean URL routing and redirects. On the live domain this caused route instability / redirect-cache issues, so clicking the top navigation `Rutinler` did not reliably open the routine welcome page.

## Fix
- The top navigation `Rutinler` link now points to the real physical page: `/account/routines.html`.
- The homepage hero `RUTİNİ GÖR` link now points to `/account/routines.html`.
- The homepage Smart Routine `Rutini Gör` JavaScript flow now points to `/account/routines.html`.
- `/account/routines.html` is now the stable smart route:
  - logged out user => welcome / karşılama screen
  - logged in user => Akıllı Rutinim dashboard
- Routine subpages are now physical account pages again:
  - `/account/routine-profile.html`
  - `/account/routine-favorites.html`
  - `/account/routine-history.html`
- Routine sidebar still behaves like an in-page app: clicks are intercepted by JS and rendered without a hard visual page jump.

## Redirects
All routine redirects were converted to internal `200` rewrites only. No browser-facing `301` redirect remains for routine routes.

Aliases kept safely:
- `/collections/routine` => `/account/routines.html` as internal 200 rewrite
- `/collections/routine.html` => `/account/routines.html` as internal 200 rewrite
- `/routine.html` => `/account/routines.html` as internal 200 rewrite
- `/rutinler` => `/account/routines.html` as internal 200 rewrite
- `/rutinler.html` => `/account/routines.html` as internal 200 rewrite

## Files changed
- `index.html`
- `_redirects`
- `assets/routines.js`
- `assets/routine-route-bridge.js`
- routine/account HTML route pages

## QA checklist
- Top nav Rutinler link target checked: `/account/routines.html`
- Hero RUTİNİ GÖR link target checked: `/account/routines.html`
- Smart routine JS redirect checked: `/account/routines.html`
- Routine redirect loop removed from `_redirects`
- Routine account pages no longer redirect to broken clean URL
- JS syntax check passed for:
  - `assets/routines.js`
  - `assets/routine-route-bridge.js`
  - `assets/js/smart-routine.js`
