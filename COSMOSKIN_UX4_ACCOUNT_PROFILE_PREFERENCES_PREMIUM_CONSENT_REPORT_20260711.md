# COSMOSKIN UX4 — Account Profile/Preferences Premium Consent Report
**Date:** 2026-07-11 · **Scope:** P0 consent data-loss fix + account UI premium polish. No SQL/deploy/products.json/checkout/pricing changes.

## Pre-check status
| Check | Result |
|---|---|
| UX3B committed | **FAIL** — UX3B files present uncommitted; latest commit is UX3 |
| Working tree clean | **FAIL** — UX3B + UX4 changes in tree |
| products.json unchanged | **PASS** |

## 1. Profile consent wipe — root cause
- `PATCH /api/account/profile` built a **full-row upsert** payload on every request.
- `normalizeBool(undefined)` returned `false`, so omitted opt-in fields became `false`.
- `metadata` defaulted to `{}` when omitted, clearing stored JSON.
- `saveProfile()` sent only `first_name`, `last_name`, `phone`, optional `birthday` — never opt-ins — so every profile save could silently wipe CRM/newsletter/stock/routine consent.

## 2. Backend fix — profile PATCH preservation
- Whitelisted partial update via `hasOwn(body, field)`.
- Opt-ins (`marketing_email_opt_in`, `newsletter_opt_in`, `stock_alert_opt_in`, `routine_reminder_opt_in`) preserved when omitted.
- `metadata` merged when provided; preserved when omitted.
- Birthday lock logic unchanged; added `isValidBirthdayDate()` (no future/impossible dates).
- Structured 400/403 errors retained.

## 3. Notifications API hardening
- `normalizePreferences()` now merges with **existing** `notification_preferences` row.
- Only keys present in request change; undefined/missing no longer coerce unrelated prefs.

## 4. Frontend save behavior
- `saveProfile()` still sends identity fields only (correct).
- Added client future-date guard; fixed `data-save-profile` / `#saveProfileBtn` binding.
- Birthday locked state: disabled input + `Kilitli` badge + helper copy.

## 5. Premium switches
- Replaced plain checkbox rows with `cs-premium-toggle` animated switches (native checkbox underneath for a11y).
- Order/cargo toggles marked locked (transactional defaults preserved).
- `prefers-reduced-motion` respected.

## 6. Account overview / profile UI
- Overview hero: welcome + Club + skin mini cards.
- Profile completion ring, preferences preview card, responsive `cs-overview-grid--ux4`.
- Profile form: two-column grid, readonly email styling, premium card shell.

## 7. Account header compatibility
- UX3B 74px header / 46px logo / 22px gap rules preserved in `account-premium.css`.

## 8. Membership display
- Tiers remain Essential / Signature / Elite only. No Select/Silver.

## 9. Favorites (E1 deferred)
- Overview favorites count uses existing `uniqueFavoriteList()` — no persistence rewrite.

## 10. CRM/Brevo gaps (E3 deferred)
- No Brevo sync, `crm_sync_logs`, bank-transfer CRM, unsubscribe tokens, abandoned cart, or birthday attribute sync implemented.
- UX4 ensures DB opt-ins are not wiped on profile save.

## 11. Supabase verification
- Read-only queries in `COSMOSKIN_UX4_ACCOUNT_PROFILE_PREFERENCES_DB_VERIFICATION_QUERIES_20260711.sql`.
- No migration/SQL executed in UX4.

## 12. Runtime verification
- Mocked integration tests cover partial PATCH preservation, future birthday rejection, preference merge.
- Live browser/auth session not available in this run; manual QA steps in runbook.

## 13. Validator / test results
| Check | Result |
|---|---|
| `validate-ux4-account-profile-preferences-premium-consent.mjs` | **PASS** |
| `validate-ux3b-storefront-polish-hotfix.mjs` | **PASS** |
| `validate-ux3-minicart-premium-layout-hardening.mjs` | **PASS** |
| `validate-hf1-runtime-commerce-hotfix.mjs` | **PASS** |
| `validate-p1e3-storefront-sale-display.mjs` | **PASS** |
| `validate-production-launch-readiness.mjs` | **PASS** |
| `validate-account-batch-1-safe-fixes.mjs` | **PASS** (after birthday copy + security-grid fix) |
| `validate-account-ui-polish.mjs` | **PASS** |
| `validate-p1e4` / `validate-c3` / `validate-c4` / `validate-i2` | **Not completed in this run** — nested validator chains exceed 120s in this environment; run manually in CI/local with longer timeout |
| UX4 integration tests (`--test-name-pattern="UX4:"`) | **6 pass / 0 fail** |
| Full integration suite | **Deferred** — run `node --test tests/local-integration.test.mjs` in CI (238 tests total) |

## 14. Confirmations
- No SQL run. No deploy. `products.json` unchanged.
- No checkout/pricing/coupon/admin/stock/refund logic modified.

## Files changed
See `COSMOSKIN_UX4_ACCOUNT_PROFILE_PREFERENCES_PREMIUM_CONSENT_CHANGED_FILES_20260711.txt`.
