# COSMOSKIN Foundation & QA Clean-up Report — 2026-07-02

## Scope
This pass intentionally avoided any large UI redesign, new icon system, checkout redesign, product-grid redesign, or smart-routine experience redesign. The goal was to stabilize the current foundation for the next account/routine work package.

## Changed files

1. `functions/api/coupons/validate.js`
   - Added the missing named export `calculateCouponPreview` so the local integration suite no longer fails during module import.
   - Added `freeShipping` camelCase alongside existing `free_shipping` for backwards-compatible coupon API consumers/tests.
   - Returned `404` for invalid/inactive coupon lookup outcomes to distinguish nonexistent coupon codes from validation failures.

2. `functions/api/create-checkout.js`
   - No production code change in this file during this pass.

3. `tests/local-integration.test.mjs`
   - Updated the stale shipping assertion from `119 TL` to `89 TL`, matching the active checkout code and visible site FAQ copy.
   - Test was not deleted or bypassed.

4. `functions/api/account/routine-results.js`
   - Standardized routine result inserts to use the existing `email` column defined in `supabase/migrations/20260626_production_launch_readiness.sql`.
   - Removed the `customer_email` insert key from this API to avoid Supabase schema-cache/unknown-column failures.

5. `functions/api/_lib/bank-accounts.js`
   - Stopped silently returning hardcoded fallback bank accounts when the `payment_bank_accounts` table is reachable but empty/invalid.
   - Checkout now fails closed with `BANK_ACCOUNT_NOT_CONFIGURED` before inventory reservation/order creation if DB bank accounts are not configured.
   - Existing DB-error fallback behavior remains isolated to cases where the table cannot be read; this should be reviewed in the legal/payment hardening pass.

6. `.env.example`
   - Restored a non-secret environment template required by local QA.
   - Includes placeholders for Supabase, iyzico, Brevo, Turnstile, admin session, and EFT reservation configuration.

7. `_redirects`
   - Removed the incorrect `/routine.html -> /account/routines/` redirect.
   - Routed deprecated public aliases to the public routine center:
     - `/rutinler -> /routine.html`
     - `/rutinler.html -> /routine.html`
     - `/akilli-rutin -> /routine.html`
     - `/akilli-rutin.html -> /routine.html`
     - `/collections/routine* -> /routine.html`
   - Kept account routine aliases under `/account/routines/`.

8. `routine.html`
   - Corrected canonical URL to `https://www.cosmoskin.com.tr/routine.html`.

9. `rutinler.html`
   - Corrected canonical URL to `https://www.cosmoskin.com.tr/routine.html`.
   - `_redirects` now treats this as a deprecated public alias.

10. `account/profile.html`
   - Aligned static notification preference field names with the API/JS schema:
     - `order_updates`
     - `cargo_updates`
     - `campaign_emails`
     - `sms_notifications`
     - `stock_notifications`
     - `routine_reminders`
     - `newsletter`
   - This is a small compatibility fix only; no account redesign was performed.

11. `assets/account-dashboard.js`
   - Made notification preference saving robust to both legacy camelCase names and current snake_case names.
   - Added support for `sms_notifications` in the saved payload.
   - Wired `#markAllNotificationsBtn` to `PATCH /account/notifications` with `{ mark_all_read: true }`.

## Verified checks

Commands run:

```bash
node --check functions/api/coupons/validate.js
node --check functions/api/_lib/bank-accounts.js
node --check functions/api/account/routine-results.js
node --check assets/account-dashboard.js
node --test tests/local-integration.test.mjs
```

Result:

```text
1..20
# tests 20
# pass 20
# fail 0
```

## Important notes

- The integration test logs `atomic inventory RPC unavailable` during the negative RPC test. This is expected for that test case and did not fail the suite.
- No new premium SVG icons were added in this pass. That should be a separate controlled package.
- No major account screen redesign was done in this pass. Only field/button compatibility fixes were applied.
- No smart-routine UI redesign was done in this pass.

## Remaining risks / next phase

1. `payment/bank-accounts.js` still has a catch-block fallback that can expose hardcoded bank accounts if DB read fails. This should be reviewed in the payment/legal hardening phase.
2. Mobile/public routine links should be audited next. Some public mobile components still link to `/account/routines/` where the CTA language is more like “Rutini Başlat”.
3. `account/profile.html` still contains a large static DOM plus JS-rendered dashboard architecture. The next phase should simplify the account render model to prevent overlapping/duplicate UI.
4. Smart Routine save flow still needs a dedicated pass to sync homepage/routine/PDP/account state through one Supabase-backed routine profile model.
5. SVG icon quality remains untouched and should be handled as an isolated premium icon-system package with strict acceptance checks.
