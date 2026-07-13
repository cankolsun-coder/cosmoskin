# COSMOSKIN UX4 — Account Profile/Preferences Premium Consent Runbook
**Date:** 2026-07-11

## Pre-check note
Working tree contained uncommitted UX3B hotfix files at UX4 start. `products.json` was clean. UX3B commit was not present in `git log`; UX4 was implemented atop the dirty tree. Re-run pre-check before production merge.

## Run validators (required)
```bash
node scripts/validate-ux4-account-profile-preferences-premium-consent.mjs
node scripts/validate-ux3b-storefront-polish-hotfix.mjs
node scripts/validate-ux3-minicart-premium-layout-hardening.mjs
node scripts/validate-hf1-runtime-commerce-hotfix.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Manual QA (wrangler recommended for /api/*)
```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```
1. Login → `/account/profile.html`
2. Save only name → refresh → notification opt-ins unchanged
3. Save birthday (valid) → opt-ins unchanged
4. Locked birthday shows disabled field + helper copy
5. Notifications tab → premium toggles animate; save one switch; refresh persists
6. Overview shows membership, profile completion, preferences preview
7. Header logo 46px / height 74px vs homepage
8. Mobile 360/390: no horizontal scroll, no text collision

## Runtime limitation
Without live Supabase session, API behavior verified via mocked integration tests. Use DB verification queries post-deploy.
