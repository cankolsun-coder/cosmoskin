# COSMOSKIN Project Memory

> **Before modifying `account-dashboard.js`, `account-premium.css`, account APIs, checkout, returns, favorites, notifications, loyalty or header-related CSS, read this file first and preserve listed working behavior.**

## Working account flows (do not break)

- **Account shell:** `account/profile.html` + `assets/account-dashboard.js` render all tabs via `?tab=`.
- **Returns:** Hygiene checklist, attachments (JPG/PNG/WEBP/MP4, 10 MB), 14-day window — `functions/api/returns.js`, return form in dashboard.
- **Addresses:** CRUD modal — `functions/api/account/addresses.js`.
- **Support requests:** Creation + return redirect hint — `functions/api/account/support-requests.js`.
- **Skin profile:** Save via `COSMOSKINSkinProfile` / `/api/account/skin-profile`; cross-page `cosmoskin:skin-profile-change`.
- **Favorites:** `assets/app.js` (global) + `uniqueFavoriteList()` in dashboard — do not refactor without explicit batch.
- **Security tab:** Honest 2FA copy (“henüz aktif değildir”) — preserve messaging.
- **Coupon backend:** `functions/api/_lib/coupons.js` + `/api/coupons/validate` — source of truth for checkout eligibility.
- **Deprecated coupons filter:** COSMOSKIN10, CLUB10, WELCOME15 hidden client-side.

## Account APIs (customer-facing)

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/account/summary` | GET | Full dashboard payload |
| `/api/account/profile` | GET, PATCH | Profile + birthday correction rules |
| `/api/account/notifications` | GET, PATCH | In-app notifications + **notification_preferences** |
| `/api/account/orders` | GET | Read-only order list |
| `/api/account/favorites` | GET, POST, DELETE | Favorites sync |
| `/api/account/addresses` | GET, POST, PATCH, DELETE | Address CRUD |
| `/api/account/skin-profile` | GET, POST | Skin profile |
| `/api/account/support-requests` | GET, POST | Support |
| `/api/coupons/validate` | POST | Checkout coupon validation |

## Supabase table dependencies

| Table | Used by | Notes |
|---|---|---|
| `profiles` | profile, summary | Includes `birthday`, `birthday_change_count`, `birthday_last_changed_at`, `birth_date_locked` |
| `notification_preferences` | notifications, summary | **Batch 1 source of truth** for comms toggles |
| `orders`, `order_items`, `shipments` | summary, orders | Read-only customer side |
| `customer_coupons` | summary, coupons | WELCOME10 / BIRTHDAY10 display |
| `user_favorites`, `user_addresses` | summary | |
| `loyalty_points_ledger` | summary, club tab | **No purchase writer yet** — display may derive from spend |
| `return_requests` + attachments | returns flow | |

Migration reference: `supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql`

## Fragile areas

- **Overview / Security CSS:** Multiple stacked `!important` rules in `account-premium.css` — do not patch casually.
- **Account header:** Not shared with homepage — cart/search/mega-menu missing by design until header batch.
- **Loyalty points:** Client fallback when ledger empty; redemption uses real ledger sum.
- **Club tier spend RPC:** May still sum `total_amount` (shipping included) — known gap, not Batch 1.
- **Favorites UUID vs slug:** Two merge paths can desync heart state on Favorites tab.
- **Duplicate profile CREATE migrations:** Schema depends on migration order; only add idempotent `ADD COLUMN IF NOT EXISTS`.

## Admin RBAC (A1, 2026-07-04)

- **Deny-by-default.** `hasAdminPermission()` (`functions/api/_lib/admin-audit.js`) no longer allows a request through when no matching `admin_users` row is found — the prior `if (!admin) return true` allow-all bypass is removed. A request with no matching, active `admin_users` row is denied for every permission check.
- **`admin_users` is the source of permission truth.** Identity is resolved only from the server-trusted `Cf-Access-Authenticated-User-Email` request header (never a client-supplied `is_admin`/`role`/`role_code`/`permissions` field — none exist anywhere in this codebase), looked up against `admin_users`. `is_active === false` or `status === 'disabled'` both deny. Owner rows (`role_code='owner'` or `permissions` containing `'*'`) pass every permission check, exactly as before the hardening.
- **`functions/api/admin/users.js` (admin_users mutation) now requires `admin.users.manage` or owner `['*']`.** Previously this endpoint was gated only by `assertAdmin()` (the shared `ADMIN_TOKEN`/signed-session check), meaning any token holder could mint or elevate an `admin_users` row (including to `role: 'owner'`) with no RBAC check at all. `onRequestPost`/`onRequestPatch` now call `requireAdminPermission(context, 'admin.users.manage')` before writing. No new `admin_permissions` row was seeded for this — the owner shortcut already covers it.
- **Cloudflare Access dependency — must be verified before production deploy.** `hasAdminPermission()`'s only identity source is the `Cf-Access-Authenticated-User-Email` header. This header cannot be spoofed by an external client (Cloudflare's edge strips client-supplied headers of this name), but it is only ever *populated* if Cloudflare Access is actually configured and enforcing on the admin routes in production. `wrangler.toml` does not set `REQUIRE_CLOUDFLARE_ACCESS` (only `.env.example` recommends it) — this cannot be confirmed from the repository. **Do not deploy to production until Cloudflare Access is confirmed (in the Cloudflare dashboard) to inject `Cf-Access-Authenticated-User-Email` for admin routes for both `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr`** — otherwise permission-gated endpoints will 403 for everyone, including the owner. See `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_RUNBOOK_20260704.md`, `COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_RUNBOOK_20260705.md`, `COSMOSKIN_A1_2B_ADMIN_MUTATION_COVERAGE_RUNBOOK_20260705.md`, and `COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_RUNBOOK_20260705.md` (widest blast radius yet — covers refunds, invoices, and bank accounts).

### A1.2a — admin GET/read endpoint permission coverage (2026-07-05)

- **22 of 31 `functions/api/admin/**` files now call `requireAdminPermission()`** (9 from A1.1 + 13 new GET/read-only handlers from A1.2a). The remaining files (mutation and finance/refund/bank-account routes, plus the two deliberate escape-hatch diagnostics below) were still `assertAdmin()`-only at this point — see A1.2b below for the mutation follow-up and `COSMOSKIN_A1_2_ADMIN_ENDPOINT_COVERAGE_PLAN_20260705.md` for the full inventory and batch plan.
- **Naming convention: reuse existing seeded colon-notation `admin_permissions` strings, never a parallel dot-notation scheme.** A1.2a introduced only `resource:read`-style strings (`orders:read`, `returns:read`, `customers:read`, `products:read`, `inventory:read`, `lots:read`, `suppliers:read`, `compliance:read`, `coupons:read`, `shipments:read`, `email_logs:read`), matching the pre-existing seed in `supabase/migrations/20260626_production_launch_readiness.sql` (`admin_permissions`/`admin_roles`). `admin.users.manage` (A1.1) remains the one deliberate dot-notation exception, since "manage other admins" has no concept in the 6-role seed matrix by design (owner-only).
- **A1.2a is read-only in scope.** No mutation handler (PATCH/POST) gained a permission check in this batch, even in files that also got a GET gate (e.g. `orders.js`, `returns.js`, `products.js`, `lots.js`, `suppliers.js`, `compliance.js`, `coupons/index.js` all still had ungated mutation handlers at the time). Finance-adjacent files (`refunds.js`, `invoices.js`, `bank-accounts.js`) were not touched at all.

### A1.2b — admin mutation endpoint permission coverage (2026-07-05)

- **16 mutation (POST/PATCH) handlers across 12 files now call `requireAdminPermission()`**, on top of A1.2a's 13 GET/read handlers and A1.1's 9 pre-existing call sites. Permission strings (all reused/extended colon-notation, none dot-notation): `orders:update` (`orders.js` PATCH, `orders/[id]/status.js` PATCH, `orders/[id]/emails.js` POST), `shipments:create` (`orders/[id]/shipments.js` POST — matches the sibling `dhl-shipment.js` route's existing permission), `returns:update` (`returns.js` PATCH), `inventory:adjust` (`products.js` PATCH/POST, `inventory/adjust.js` POST, `inventory/[slug].js` PATCH, `lots.js` POST/PATCH), `suppliers:manage` (new, `suppliers.js` POST/PATCH), `products:update` (`compliance.js` PATCH, reused from the pre-existing `content_editor` seed), `coupons:manage` (new, `coupons/index.js` POST/PATCH).
- **Read and write permissions are intentionally distinct strings on the same file** (e.g. `orders.js` GET requires `orders:read`, PATCH requires `orders:update`; `returns.js` GET requires `returns:read`, PATCH requires `returns:update`) — holding one never implies the other. Verified by both the validator (`scripts/validate-a1-admin-endpoint-coverage.mjs`, cross-contamination check) and integration tests (`tests/local-integration.test.mjs`, "read does not imply write" / "mutation does not unlock GET" cases).
- **High-caution files (`orders.js` PATCH, `orders/[id]/status.js` PATCH)** — the RBAC change is a pure one-line addition; all status-transition guards, inventory reservation/release calls, loyalty ledger hooks (`awardOrderPoints`/`promoteOrderPoints`/`reverseOrderPoints`), and shipment/email side effects are byte-identical to before. Enforced by a business-logic-marker regression check in the validator, not just a generic diff.
- **Two admin routes remain a deliberate, permanent escape hatch: `admin/dashboard.js` and `admin/inventory/health.js`.** Both stay `assertAdmin()`-only forever by design — if the Cloudflare Access → `admin_users` resolution ever fails in production, these two no-PII, read-only, zero-mutation routes are the only parts of the admin panel guaranteed to keep working, giving the owner a diagnostic signal instead of a 100%-locked-out panel. Do not gate them without a documented decision to remove this escape hatch. `admin/session.js` (issues the admin session itself) is never gated, by design — circular otherwise.

### A1.2c — admin finance / refund / bank-account endpoint permission coverage (2026-07-05)

- **All 31 of 31 `functions/api/admin/**` route files with permission-gateable handlers now call `requireAdminPermission()`**, except the two deliberate escape hatches (`dashboard.js`, `inventory/health.js`) and the never-gated `session.js`. A1.2c closes the last gap: `refunds.js` (GET/POST), `invoices.js` (GET/POST/PATCH), `bank-accounts.js` (GET/POST/PATCH).
- **`refunds.js` has no separate seeded read permission — GET and POST both reuse `refunds:update`.** The A1.2 plan's endpoint table (`COSMOSKIN_A1_2_ADMIN_ENDPOINT_COVERAGE_PLAN_20260705.md` §2, rows 14-15) explicitly recommends the same string for both, since `admin_permissions` only ever seeded `refunds:update` (to `operations`), never `refunds:read`.
- **`invoices.js` reuses the pre-existing seeded pair `invoices:read` (GET) / `invoices:update` (POST, PATCH)** — both already seeded to `accountant`, and `invoices:update` also to `operations`. No new permission string, no migration needed.
- **`bank-accounts.js` deliberately uses one `bank_accounts:manage` string across all of GET/POST/PATCH — not a read/write split.** This is an intentional exception to the read-vs-write pattern used everywhere else in A1.2a/A1.2b, per the plan's explicit rationale (§2 row 17): IBAN/payment-routing data is "fraud-sensitive even to read", so there is deliberately no low-bar `bank_accounts:read` string. `bank_accounts:manage` is a brand-new string, not yet seeded to any non-owner role in `admin_permissions` — **only the owner (`permissions: ['*']`) can currently pass this gate; a future, separately-approved `admin_permissions` seed migration is required before any non-owner role (e.g. `accountant` or `operations`) can read or write bank accounts.** Same caveat applies to `refunds:update` and `invoices:*` for any role not already in the existing seed.
- **Zero business-logic drift.** Refund creation/completion rules, `provider_reference` handling, the loyalty-points reversal hook (`reverseOrderPoints`) on refund completion, invoice generation/update fields (`invoice_number`, `pdf_url`, `order_status_events`), and bank-account IBAN validation (`normalizeBankAccount`/`validateBankAccount`/`toDbPayload`) are all byte-identical to before this batch — verified by the validator's byte-diff check and a dedicated business-logic-marker regression test, exactly like A1.2b's high-caution files.
- **Cloudflare Access dependency is now at its widest blast radius.** A1.2c gates every remaining mutable admin surface, including money-adjacent flows (refund records, invoice records, bank-account routing). If Cloudflare Access → `admin_users` resolution fails in production, refund/invoice/bank-account admin actions — not just reads — will 403 for everyone except the two escape-hatch routes. See `COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_RUNBOOK_20260705.md` before any production deploy.

## Do not touch casually

- `functions/api/admin/**` — reference for future customer cancel; admin-only.
- `iyzico-callback.js` / payment webhooks — high blast radius.
- `assets/mobile-redesign.js` — separate mobile DOM.
- Old migration files — never rewrite; add new migrations on top.
- Checkout / bank transfer / return attachment persistence — working production paths.

## Batch 1 behavior to preserve

- **WELCOME10:** Shown only without successful paid order; manual entry at checkout only.
- **BIRTHDAY10:** Shown only on **actual birthday date** (not whole month); once per calendar year; manual checkout entry.
- **Birthday:** First save free; one correction; then `birth_date_locked`; server enforces.
- **Notifications:** All 7 toggles persist via `notification_preferences`; no `profiles.marketing_sms_opt_in`.
- **Customer copy:** “Ödeme Ekranı” / “ödeme ekranında” — never “Checkout”. No “Koşullu” in coupons UI.

## Validation commands

```bash
node --check assets/account-dashboard.js
node --check functions/api/account/profile.js
node --check functions/api/account/notifications.js
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-runtime-hotfix.mjs
node scripts/validate-account-experience-final-polish.mjs
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

Full account API persistence locally: `npx wrangler pages dev . --compatibility-date=2024-06-01`

Static UI only: `python3 -m http.server 7700 --directory .`
