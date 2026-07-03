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
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

Full account API persistence locally: `npx wrangler pages dev . --compatibility-date=2024-06-01`

Static UI only: `python3 -m http.server 7700 --directory .`
