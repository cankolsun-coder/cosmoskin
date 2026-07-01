# COSMOSKIN FINAL LAUNCH IMPLEMENTATION PLAN — 2026-07-01

## Scope lock
- Header/footer visual design is protected and will not be redesigned.
- Main changes are limited to account content behavior, authenticated APIs, coupon validation, routine persistence, support requests, notification preferences, Supabase SQL, and QA/reporting.

## Phase 1 — Session and fake-data removal
- Remove account dashboard demo summary fallback.
- Remove synthetic account session when Supabase config is missing.
- Replace fake skin/coupon/security states with empty/honest states.
- Ensure account API errors surface as retry/login/config states instead of fake data.

## Phase 2 — Account persistence fixes
- Require `/api/account/profile` success for profile save.
- Require `/api/account/skin-profile` success for skin profile save.
- Implement notification preference persistence through `/api/account/notifications`.
- Add account support request endpoint and UI form.
- Make account favorites use `/api/account/favorites` with rollback.

## Phase 3 — Routine backend-first flow
- Add `/api/account/routines` and `/api/account/routine-results`.
- Update `/account/routines/` module to stop treating local stored users as logged-in.
- POST skin profile and routine result to account APIs for authenticated users.
- Keep localStorage only as guest/local cache.

## Phase 4 — Coupon source of truth
- Add shared coupon eligibility helper.
- Enforce deprecated coupon denylist.
- Enforce WELCOME10/BIRTHDAY10 min subtotal, max discount, one-use/reservation/account-age logic.
- Use shared helper in `/api/coupons/validate` and `/api/create-checkout`.
- Mark bank-transfer coupon as `reserved`; mark card checkout as reserved at initialization.

## Phase 5 — Supabase final SQL
- Create idempotent final SQL for missing tables/columns/policies.
- Add verify SQL for launch checks.

## Phase 6 — QA/report/package
- Run JS syntax checks on modified files.
- Run static grep checks for critical fake/deprecated patterns.
- Create QA report and changed files report.
- Zip updated project without `__MACOSX`.

## Expected deliverables
- Updated project zip.
- Audit report.
- Implementation plan.
- QA report.
- Changed files report.
- Supabase fix SQL.
- Supabase verify SQL.
- Deployment instructions and manual staging QA checklist inside QA report.
