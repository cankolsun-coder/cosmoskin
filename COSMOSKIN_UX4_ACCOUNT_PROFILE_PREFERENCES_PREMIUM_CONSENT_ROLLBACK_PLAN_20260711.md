# COSMOSKIN UX4 — Rollback Plan
**Date:** 2026-07-11

## Scope
Revert UX4 account profile/preferences premium + consent preservation changes only.

## Files to revert
- `functions/api/account/profile.js`
- `functions/api/account/notifications.js`
- `assets/account-dashboard.js`
- `assets/account-premium.css`
- `scripts/validate-ux4-account-profile-preferences-premium-consent.mjs`
- `tests/local-integration.test.mjs` (UX4 test block)
- UX4 docs (*.md, *.txt, *.sql listed in changed-files manifest)

## Command
```bash
git checkout HEAD -- functions/api/account/profile.js functions/api/account/notifications.js assets/account-dashboard.js assets/account-premium.css tests/local-integration.test.mjs
rm -f scripts/validate-ux4-account-profile-preferences-premium-consent.mjs COSMOSKIN_UX4_*
```

## Post-rollback verification
Run UX3B + commerce validators and `node --test tests/local-integration.test.mjs`.

## Risk if rolled back
Profile PATCH returns to full-row upsert behavior — saving name/phone/birthday can reset marketing/newsletter/stock/routine opt-ins and clear metadata. Do not rollback unless emergency; prefer forward fix.
