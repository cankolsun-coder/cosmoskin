# COSMOSKIN E1 Rollback Plan

## Fast rollback (frontend only)

1. Revert these files to pre-E1 commit:
   - `assets/favorites-store.js` (delete)
   - `assets/app.js`
   - `assets/account-dashboard.js`
   - `assets/style.css`
   - `favorites.html`
   - `functions/api/account/favorites.js`
   - `scripts/validate-e1-favorites-wishlist-persistence-heart-alignment.mjs`
   - `tests/local-integration.test.mjs`
2. Clear CDN/browser cache for `app.js` and `favorites-store.js`.
3. Re-run UX4 + UX3 regression validators.

## Partial rollback options

| Symptom | Rollback target |
|---------|-----------------|
| Hearts misaligned only | `assets/style.css` heart block |
| Logged-in sync broken | `assets/favorites-store.js` + `functions/api/account/favorites.js` |
| Account tab wrong list | `assets/account-dashboard.js` `uniqueFavoriteList()` |
| Favorites page only | `favorites.html` inline script |

## Data safety

- No destructive SQL was run in E1.
- DB favorites rows are unchanged by rollback.
- Guest `localStorage` keys remain `cosmoskin_favorites`.

## Post-rollback verification

```bash
node scripts/validate-ux4-account-profile-preferences-premium-consent.mjs
node scripts/validate-ux3b-storefront-polish-hotfix.mjs
node --test tests/local-integration.test.mjs
```

## Known regression risk if fully reverted

Removing E1 restores the pre-fix resurrection bug (local ∪ metadata merge).
