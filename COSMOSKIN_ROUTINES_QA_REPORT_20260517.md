# COSMOSKIN Routines QA Fix Report — 2026-05-17

## Scope
- Audited and fixed the account routines system, including `/account/routines/`, routine tabs, compare, favorites, history, skin profile sync, account dashboard profile mirroring, routine recommendations, inventory integration, and header search dropdown positioning.
- Preserved the existing COSMOSKIN global header, navigation, logo area, announcement bar, footer, and homepage design.

## Files Changed
- `_redirects`
- `assets/routines.js`
- `assets/routines.css`
- `assets/skin-profile-store.js`
- `assets/account-dashboard.js`
- `assets/routine-route-bridge.js`
- `assets/master-upgrade.css`
- `functions/api/account/summary.js`

## Files Created
- None.

## Bugs Found
- Logged-in routines could still fall back to the public welcome state after auth timing changes.
- Routine pages relied on local/static state too heavily and did not consistently hydrate account summary, favorites, profile, or stock state.
- Routine product favorite buttons only changed UI state in some contexts.
- Routine recommendation cards showed misleading stock/compatibility copy not tied to inventory.
- Skin profile sync could allow empty remote account metadata to erase a non-empty local profile.
- Account dashboard skin profile and routines profile were reading different effective sources.
- Routine compare score UI had fragile score-circle defaults and unclear score labeling.
- Routine history actions could fall back to generic data instead of applying the selected saved routine.
- “Rutinini İyileştir” spacing was cramped and CTAs were not mapped to the right collections.
- Header search results were not anchored to open leftwards from the right-side search area.
- Legacy extensionless account routine paths were missing rewrite coverage.

## Bugs Fixed
- Logged-in `/account/routines/` now renders the account routine shell directly and defaults to `Akıllı Rutinim`.
- Added Supabase auth-state listening and immediate rerender after login/session changes.
- Added account summary hydration for routines, including favorites and profile metadata.
- Favorites now call `/api/account/favorites` with authenticated session tokens when available, with optimistic UI and rollback on failure.
- Routine and account dashboard product cards now expose inventory attributes and neutral stock text until `/api/inventory` resolves.
- Add-to-cart validates inventory through `window.COSMOSKIN_STOCK.validateAdd()` when available.
- Skin profile store now safely merges profiles by completeness and timestamp, and ignores empty remote profile updates.
- Account dashboard saves now preserve profile fields, routine style, and profile timestamps during unrelated account/profile updates.
- Account summary API now returns `skin_profile_updated_at`.
- Routine recommendations now require a saved skin profile and use real catalog products with cautious copy.
- Routine compare now labels values as “Rutin uyum skoru”, clamps scores, and uses calculated heuristic criteria.
- Routine history now shows real saved history or a polished empty state, and applies the selected routine by id.
- “Rutinini İyileştir” spacing was cleaned up and CTAs now route to valid collection pages.
- Header search dropdown is right-anchored, expands leftwards, and is viewport-clamped.
- Added rewrites for extensionless account routine routes.

## Data Flow Changes
- Canonical skin profile remains `cosmoskin_skin_profile` through `window.CosmoskinSkinProfile`.
- Legacy routine keys are still read for compatibility:
  - `cosmoskin_routine_profile`
  - `cosmoskin_routine_active`
  - `cosmoskin_routine_preferences`
  - `cosmoskin_pending_routine_preferences`
- Routines hydrate account state from `/api/account/summary` when a Supabase session token exists.
- Favorites hydrate from account summary/API first, with local favorites as fallback.
- Inventory is resolved through `assets/inventory-client.js` and `/api/inventory?product_slugs=...`.
- Product data comes from `window.COSMOSKIN_PRODUCTS` / `products.json`.

## API Calls Used
- `GET /api/account/summary`
- `POST /api/account/favorites`
- `DELETE /api/account/favorites?product_slug=...`
- `GET /api/inventory?product_slugs=...`
- `POST /api/inventory/check` through the existing inventory client validation path.

## Routes Tested
- `/account/routines/`
- `/account/routines/?tab=recommendations`
- `/account/routine-compare/`
- `/account/routine-favorites/`
- `/account/routine-history/`
- `/account/routine-profile/`
- `/account/profile.html`
- `/collections/hydration.html`
- `/collections/barrier.html`
- `/collections/pore-sebum.html`
- `/collections/glow.html`
- `/collections/blemish.html`
- `/collections/sensitivity.html`

## Verification
- `node --check assets/routines.js`
- `node --check assets/account-dashboard.js`
- `node --check assets/skin-profile-store.js`
- `node --check assets/routine-route-bridge.js`
- CSS brace balance checked for `assets/routines.css` and `assets/master-upgrade.css`.
- Dead-link grep passed on touched routine/account/search surfaces: no `href="#"`, empty href, or `javascript:` links.
- Misleading routine copy grep passed for removed fake stock/percentage phrases.
- Product catalog image path check passed: 35 products, 0 missing product images.
- VM DOM harness rendered and checked:
  - logged-in dashboard
  - no-profile dashboard empty state
  - profile edit screen
  - routine compare screen
  - favorites empty state
  - history empty state
  - recommendations tab
  - logged-out compare redirect
  - empty remote profile merge protection

## Remaining Limitations
- Full authenticated Supabase/API behavior requires the deployed site or `npx wrangler pages dev . --compatibility-date=2024-06-01`; the static Python server does not execute `/api/*` functions.
- No real customer credentials were available, so login/register was validated by code flow and Supabase auth-state integration rather than with a live user account.
- Local loopback `curl` to the Python static server was blocked in this sandbox despite the server starting; route availability was verified by file existence and the VM render harness.

## Confirmation Checklist
- Logged-in `/account/routines/` no longer renders welcome/login CTAs.
- `Akıllı Rutinim` opens by default after login/session detection.
- `Cilt Profilim` saves locally first, mirrors through account metadata, and is protected from empty remote overwrite.
- Account dashboard reads the same canonical skin profile as routines.
- Recommended products use real product catalog data.
- Recommended product stock state uses the existing inventory client/API path.
- Favorite buttons call the real favorites API when authenticated and persist locally as fallback.
- Routine compare score UI is fixed and responsive-safe.
- Misleading fake percentages/claims were removed or clarified as heuristic “Rutin uyum skoru”.
- “Rutinini İyileştir” spacing was fixed.
- Improve CTA links route to valid collection pages.
- Header search opens leftwards from the right-side search form.
- No broken routine tab/button handlers remain in the modified routines code.
- Mobile CSS stacks routine shell/sidebar/cards and compare score blocks without horizontal fixed-width overflow.
