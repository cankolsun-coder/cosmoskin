# COSMOSKIN Auth/Header/Routine Hotfix Report — 2026-06-27

## Scope
Applied the attached auth/header/routine hotfix prompt against the latest uploaded COSMOSKIN zip.

## Fixed
- Hardened homepage/profile-icon auth behavior.
  - Logged-out profile icon opens the account drawer reliably.
  - Drawer “Giriş Yap” and “Kayıt Ol” buttons open the auth modal reliably.
  - Logged-in state still redirects to `/account/profile.html` when Supabase user is available.
- Added robust modal open handling.
  - Auth modal now closes the account drawer before opening.
  - Auth modal has a higher z-index than account/cart drawers to prevent hidden/blocked modal issues.
  - Auth modal supports `?auth=login`, `?auth=register`, and legacy `?login=1` query handling.
- Fixed password visibility toggle robustness.
  - Toggle buttons are forced to `type="button"`.
  - Toggle changes input type between `password` and `text` without submitting the form.
  - Toggle label/ARIA state updates between “Göster” and “Gizle”.
- Fixed routine login CTA routing behavior.
  - Routine login actions now call the central COSMOSKIN auth open function when available.
  - Routine fallback links were updated from `/index.html?login=1` to `/index.html?auth=login&next=/account/routines/`.
  - Home smart routine save flow now opens login and preserves a return path when the user is logged out.
- Refined header search animation.
  - Search expansion/interaction transition is now slower and smoother with a premium cubic-bezier easing.
  - Reduced-motion users get near-instant transitions.
- Added a non-module UI fallback script.
  - `assets/auth-ui-hotfix.js` handles profile button, auth modal opening, routine auth events, and password toggle behavior even if the module auth script is delayed.
- Added cache-busting script/style query versions.
  - Auth script references updated to `v=20260627-auth-hotfix`.
  - Main stylesheet references updated to `v=20260627-auth-hotfix` where applicable.

## Files changed
- `assets/auth.js`
- `assets/auth-ui-hotfix.js` — new fallback UI safety layer
- `assets/style.css`
- `style.css`
- `assets/routines.js`
- `assets/js/smart-routine.js`
- HTML files that reference `assets/auth.js` or `assets/style.css` for cache-busting and fallback script injection
- Routine account fallback pages containing legacy `?login=1` links

## SQL / Supabase
- No new SQL migration was required for this hotfix.
- No Supabase service role key or provider secret was added.
- Supabase public auth config remains environment/config dependent.
- If `supabaseAnonKey` is missing at runtime, the UI no longer breaks; it shows a safe configured-state behavior and auth submit errors are mapped to user-safe Turkish messages.

## QA performed in this environment
- JavaScript syntax checks passed for:
  - `assets/auth.js`
  - `assets/auth-ui-hotfix.js`
  - `assets/app.js`
  - `assets/routines.js`
  - `assets/js/smart-routine.js`
  - `assets/site-chrome.js`
  - `assets/phase6-commerce.js`
  - `assets/commerce.js`
- Verified all HTML files that include `assets/auth.js` also include `assets/auth-ui-hotfix.js`.
- Verified no remaining legacy `/index.html?login=1` routine links.
- Verified key pages contain required auth modal/password toggle structure:
  - `index.html`
  - `routine.html`
  - `account/routines.html`
- Verified no customer-facing `Select/Silver` membership labels were reintroduced in active frontend assets.

## Deployment notes
- Deploy the updated zip to Cloudflare Pages.
- Ensure the public Supabase anon key is provided through the intended environment/config injection path before testing real login/register.
- Keep all private keys server-side only.
