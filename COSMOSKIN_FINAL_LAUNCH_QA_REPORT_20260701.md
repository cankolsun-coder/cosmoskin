# COSMOSKIN FINAL LAUNCH QA REPORT — 2026-07-01

## Scope
Applied the master prompt against `cosmoskin(61).zip` with the header/footer protection rule preserved. This report covers source-level implementation, static checks, local static server smoke test, blocked checks, remaining risks, deployment instructions, and manual staging QA.

## What was broken
- Account dashboard rendered fake/demo data when `/api/account/summary` failed.
- Account init could create a synthetic local session if Supabase public config was missing.
- Account UI generated fallback skin profile values and fallback WELCOME10 coupon state.
- Profile save and notification save could show success without durable backend persistence.
- Security section showed unsupported positive checklist items instead of honest status.
- `/api/account/coupons` created virtual WELCOME10 rather than backend-governed eligibility.
- Coupon validation did not centrally enforce deprecated codes, first-order WELCOME10, BIRTHDAY10 abuse controls, tier coupons, min subtotal caps, or reservation state.
- Checkout recorded bank-transfer coupon usage as `used` too early.
- Smart Routine treated a local stored user as logged in and saved mainly to local/Supabase metadata.
- Missing account endpoints: `/api/account/routine-results`, `/api/account/routines`, `/api/account/support-requests`.
- Notification preferences lacked a durable `notification_preferences` backend contract.
- Support requests were not account-persisted.
- Deprecated/demo account files remained in the production tree.

## What was fixed
- Removed fake/demo account summary fallback and synthetic session path.
- Missing Supabase public config now surfaces an honest account config error instead of a fake dashboard.
- Account profile, skin profile, notifications, favorites, addresses, support, and routine actions require backend success before success messaging.
- Added account support request UI and API.
- Added backend-first routine result endpoints and changed Smart Routine save to POST skin profile + routine result for authenticated users.
- LocalStorage remains only guest/cache behavior for routine and favorites, not authenticated persistence.
- Added shared coupon eligibility service in `functions/api/_lib/coupons.js`.
- `/api/coupons/validate`, `/api/account/coupons`, and `/api/create-checkout` now use centralized coupon rules.
- Deprecated coupons `COSMOSKIN10`, `CLUB10`, and `WELCOME15` are rejected/cleared where relevant.
- WELCOME10 is backend-governed, manual-apply only, first-successful-order only, 1.000 TL minimum, 150 TL cap, one-use/reservation protected.
- BIRTHDAY10 is backend-governed, manual-apply only, 1.500 TL minimum, 150 TL cap, birthday month only, one use per year, account-age/paid-order protected.
- SIGNATURE75 / ELITE100 now use Essential / Signature / Elite tier eligibility only.
- Checkout coupon redemptions are reserved at order creation and finalized as used after card payment success; failed card initialization releases reservations.
- Bank transfer orders keep coupon status reserved while awaiting transfer.
- Loyalty fallback thresholds aligned to Essential / Signature / Elite: 0–4.999 TL, 5.000–14.999 TL, 15.000 TL+.
- Skin profile API no longer creates default fake “Karma Cilt / Nem desteği” profile values when fields are absent.
- Birth date can be set once from profile; later changes are blocked and logged via `birth_date_change_log` when SQL is applied.
- Deleted production-adjacent demo/backup files: `account/preview-test.html`, `assets/account-dashboard.backup-20260628.js`.

## Header / Footer protection confirmation
- Was header visually changed? **No.**
- Was footer visually changed? **No.**
- Header/footer template, logo, navigation, spacing, typography, colors, column architecture, newsletter design, search/account/favorites/cart icon structure were not redesigned.
- Header/footer code files were not intentionally changed.
- `account/profile.html` was only text-sanitized from a fake account placeholder; no header/footer visual structure was redesigned.
- Moving announcement bar was not visually changed.
- Pages with missing/different header/footer were not modified in this pass; no header/footer inconsistency requiring a visual patch was detected during implementation-level work.

## Supabase/API changes
- New shared coupon helper: `functions/api/_lib/coupons.js`.
- New endpoints: `/api/account/routine-results`, `/api/account/routines`, `/api/account/support-requests`.
- Updated endpoints: `/api/account/summary`, `/api/account/profile`, `/api/account/notifications`, `/api/account/coupons`, `/api/account/membership`, `/api/account/skin-profile`, `/api/coupons/validate`, `/api/create-checkout`, `/api/iyzico-callback`.
- SQL deliverables added:
  - `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`
  - `COSMOSKIN_FINAL_LAUNCH_VERIFY_20260701.sql`

## Coupon rules
- WELCOME10: 10%, min 1.000 TL, max 150 TL, first successful order only, one use per customer, not auto-applied, not combinable with points, reservation-aware.
- BIRTHDAY10: 10%, min 1.500 TL, max 150 TL, once per calendar year, birthday month only, account age/paid-order guard, not auto-applied, not combinable with points.
- ROUTINE5: 5%, min 1.500 TL, max 100 TL.
- SIGNATURE75: fixed 75 TL, min 1.500 TL, Signature/Elite only.
- ELITE100: fixed 100 TL, min 2.000 TL, Elite only.

## Coupon anti-abuse logic
- Uses user_id, customer_email, successful order history, coupon redemption history, reserved redemption rows, coupon_reservations where present, membership status, account creation date, profile birthday data.
- Does not expose risk internals to UI; user-facing message stays generic where appropriate.
- Deprecated codes are denied from backend and cleaned from client storage paths.

## Deprecated coupon cleanup
- Backend denylist: `COSMOSKIN10`, `CLUB10`, `WELCOME15`.
- SQL deactivates those coupon records.
- Account UI filters them out.
- Mobile/cart storage cleanup removes them.

## Loyalty/points rules
- Fallback membership thresholds now use Essential / Signature / Elite only.
- Points display separates backend `available`, `pending`, and `reversed` where ledger statuses exist.
- No 1 point = 1 TL copy was added.
- Remaining dependency: exact return-window release/reversal still depends on Supabase jobs/functions outside this patch; SQL/report documents this as a backend process risk.

## Smart Routine behavior
- Public route remains `/akilli-rutin.html`.
- Saved Routine Center route remains `/account/routines/`.
- Logged-in save calls `/api/account/skin-profile` and `/api/account/routine-results`.
- Guest flow remains local/cache only and is not treated as authenticated.
- Routine Center reads backend summary results first and can sync latest saved routine.

## Account page behavior
- `/api/account/summary` failure is shown as honest error state.
- Missing Supabase public config is shown as honest config/auth error.
- No fake user/session is created.
- Security section shows account status, password form, session info, disabled 2FA as “Yakında”, and support/data request CTA.
- Notification preferences persist via `/api/account/notifications`.
- Support requests persist via `/api/account/support-requests`.

## Checkout regression results
- Source-level regression: checkout still validates price/stock/coupon/payment method server-side.
- Card config missing behavior was preserved: card checkout requires iyzico env; bank transfer does not call iyzico.
- Coupon is revalidated server-side in `/api/create-checkout`.
- Card initialize failure now releases coupon redemption reservation.
- Idempotency key flow was preserved.

## Bank transfer regression results
- Bank transfer still requires validated bank account configuration.
- Bank transfer creates order with `pending_bank_transfer` and `awaiting_transfer` statuses.
- Bank transfer coupon usage is now `reserved` rather than immediately `used`.
- Bank transfer email/event code path preserved.

## Mobile/desktop QA results
- Mobile direct WELCOME10 local coupon shortcut was removed from `assets/mobile-redesign.js`.
- Mobile legacy coupon storage now clears `WELCOME15` as deprecated.
- Account CSS additions are scoped to account content classes and do not touch header/footer.
- Static visual viewport/browser review was not fully automated in this environment; manual staging checklist below must be executed.

## Tests performed
- `node --check` passed for all modified JavaScript files:
  - `assets/account-dashboard.js`
  - `assets/checkout-flow.js`
  - `assets/mobile-redesign.js`
  - `assets/cosmoskin-mobile-redesign-v1.js`
  - `assets/phase6-commerce.js`
  - `assets/routines.js`
  - all modified/new API function files.
- CSS brace/paren balance passed for `assets/account-premium.css`.
- Runtime HTML/JS grep checks passed for (historical markdown reports were excluded from this runtime check):
  - `href=""`
  - `href="#"`
  - `href="javascript:`
  - `demoSummary`
  - `COSMOSKIN Üyesi`
  - fake saved card/coupon/order critical strings.
- Deprecated coupon references remain only in denylist/storage cleanup/comment contexts.
- Static server smoke test passed: `python3 -m http.server` served `/account/profile.html` with HTTP 200.

## Tests blocked / not fully executed
- Full authenticated Supabase end-to-end testing could not be completed because this sandbox does not contain live Supabase env values or a real authenticated customer session.
- Full iyzico payment flow could not be executed without production/staging iyzico credentials.
- Wrangler Pages Dev boot was attempted, but the local process did not complete within the sandbox timeout window; therefore API runtime behavior must be verified on staging with Cloudflare env vars.
- Browser viewport screenshots and interactive form submissions must be performed on staging after SQL migration.

## Remaining risks
- Existing database schema may differ from assumptions; run the verify SQL after applying fix SQL.
- If `coupons.code` does not have a unique constraint, the SQL `on conflict (code)` may require an existing unique index. Add a unique constraint on `coupons(code)` if Supabase reports a conflict-target error.
- Return-window points lifecycle likely needs a scheduled job or admin process to move pending points to available after 14 days.
- Coupon reservation expiry/release for unpaid bank transfers requires either admin cancellation flow or scheduled expiry job if not already present.
- Full mobile UI must be manually checked at target viewports on staging.

## Deployment instructions
1. Back up Supabase database.
2. Apply `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql` in Supabase SQL editor.
3. Run `COSMOSKIN_FINAL_LAUNCH_VERIFY_20260701.sql` and confirm tables, policies, coupon caps, and deprecated coupon inactive states.
4. Deploy the updated project zip to Cloudflare Pages staging.
5. Confirm env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, public Supabase URL/anon key config, bank account env/table data, iyzico env for card staging, Brevo env if transactional email is needed.
6. Test as guest, new logged-in user, existing user with orders, and bank-transfer checkout user.
7. Promote to production only after the manual staging QA checklist passes.

## Manual staging QA checklist
- Account logged out: redirects/login state; no fake dashboard.
- Missing/invalid session: clean auth error.
- New verified user: WELCOME10 appears only if backend coupon active and no successful order/redemption/reservation exists.
- WELCOME10 manual copy/apply: cart validates, checkout revalidates, order reserves it.
- Successful card payment: reserved coupon becomes used.
- Failed card initialize: coupon reservation released.
- Bank transfer: order created, coupon reserved, bank instructions visible.
- BIRTHDAY10: missing birthday locked card, birthday outside month locked, eligible birthday month works, repeated birthday edit blocked.
- Deprecated codes: COSMOSKIN10 / CLUB10 / WELCOME15 rejected and cleared.
- Profile save persists after refresh.
- Notification save persists after refresh.
- Support request submit appears in account after refresh.
- Routine save as logged-in user appears after refresh and on another browser/session.
- Guest routine completion does not claim backend save.
- Favorites add/remove persist after refresh.
- Address add/edit/delete/default and checkout autofill work.
- 360/375/390/414/430/768/1280/1440/1536 viewport checks: no horizontal scroll, no duplicate nav/header, no CTA overlap.
