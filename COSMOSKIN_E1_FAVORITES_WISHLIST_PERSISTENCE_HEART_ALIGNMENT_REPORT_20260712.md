# COSMOSKIN E1 — Favorites / Wishlist Persistence + Heart Alignment

Date: 2026-07-12  
Scope: E1 only (no deploy, no SQL applied, no migrations created)

## Architecture (before)

- Logged-in favorites persisted in `user_favorites` via `/api/account/favorites`.
- Guests used `localStorage` key `cosmoskin_favorites`.
- `assets/app.js` also mirrored favorites into `auth.user_metadata.favorites`.
- Hydration merged `local ∪ remote ∪ metadata`, causing resurrection after removal.
- `saveFavoritesToAccount()` POSTed every favorite item on each persist (N+1).
- Heart icon CSS had duplicate `.favorite-btn` blocks and asymmetric SVG path.

## Root cause — resurrection

1. Remove path deleted DB row but did not clear stale `user_metadata.favorites`.
2. `hydrateFavoritesFromAccount()` unioned localStorage with remote/metadata.
3. Account dashboard `uniqueFavoriteList()` concatenated DB favorites with local favorites.

Removed slugs could reappear after refresh/login/cross-device sync.

## Fix summary

### Persistence model

| User state | Source of truth |
|------------|-----------------|
| Guest | `localStorage` (`cosmoskin_favorites`) |
| Logged-in | Supabase `user_favorites` via GET |
| `user_metadata.favorites` | Migration-only; cleared after one-time import |

### New module: `assets/favorites-store.js`

Exports `window.COSMOSKINFavorites` with:
- `load()`, `get()`, `isFavorite()`, `add()`, `remove()`, `toggle()`, `subscribe()`
- DB-authoritative hydration for logged-in users
- One-time guest merge + metadata import on login
- Metadata scrub on remove
- Optimistic UI with rollback on API failure
- Pending slug guard against double-click races

### API (`functions/api/account/favorites.js`)

- GET returns `{ ok, favorites, favorite_slugs }`
- POST idempotent duplicate handling (`added|updated|exists`)
- DELETE idempotent (`removed|missing`, always `ok: true` for known cases)
- Structured `changed_slug` + `action` fields

### Frontend integration

- `assets/app.js` delegates to `COSMOSKINFavorites`; removed N+1 metadata sync
- `assets/account-dashboard.js` uses DB-only favorites when authenticated
- `favorites.html` uses store + premium empty state + UX2 card class

### Heart icon polish

- Symmetric centered SVG path (Feather-style heart)
- Consolidated `.favorite-btn` / `.favorite-btn-icon` CSS in `assets/style.css`
- `place-items: center` optical alignment
- 44px mobile touch target
- Accessible labels: “Favorilere ekle” / “Favorilerden kaldır”
- `aria-pressed` on all favorite toggles

## Runtime verification

Live auth session not available in this pass. Verified via:
- Static guards in E1 validator
- API integration tests with mocked Supabase fetch
- Frontend source guards for propagation, labels, empty state

Manual browser checklist (post-deploy):
1. Guest add/remove on PLP → refresh preserves state
2. Heart click does not navigate card
3. Logged-in add → refresh → still present
4. Logged-in remove → refresh → does not resurrect
5. Favorites page empty/filled states
6. Mobile 360/390 alignment

## DB verification

See `COSMOSKIN_E1_FAVORITES_WISHLIST_DB_VERIFICATION_QUERIES_20260712.sql`.

If table/policies missing in production → DB1 dependency (apply commerce-schema block).

## Validator / test results

Run after implementation:
- `node scripts/validate-e1-favorites-wishlist-persistence-heart-alignment.mjs`
- Regression chain per Section 16
- `node --test tests/local-integration.test.mjs`

## Proof constraints

- `products.json` unchanged
- No SQL executed
- No deploy
- No migrations created
- Checkout/pricing/coupon/admin/stock/refund logic untouched

## Rollback

See `COSMOSKIN_E1_FAVORITES_WISHLIST_PERSISTENCE_HEART_ALIGNMENT_ROLLBACK_PLAN_20260712.md`.
