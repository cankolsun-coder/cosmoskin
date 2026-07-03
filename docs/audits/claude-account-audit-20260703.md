# COSMOSKIN Account Module — Read-Only Technical Audit

No files were modified. This is a full inspection of the extracted ZIP (`cosmoskin_2.zip`), covering `account/*.html`, `assets/account-dashboard.js` (1,016 lines), `assets/account-premium.css` (938 lines), all `functions/api/account/*` endpoints, and the relevant Supabase migrations (21 files).

**Architecture note:** The Account module is a single-page shell. `account/index.html` redirects to `account/profile.html`, which is a static shell (`#accountApp`) entirely rendered client-side by `assets/account-dashboard.js` based on `?tab=` query param. All 15 screens you listed (Overview → Support) are tabs inside this one JS file, not separate pages. `account/orders.html`, `order-detail.html`, `returns.html` are legacy/thin pages; the real experience is the tab system.

---

## 1. Audit Summary

| Area | Status |
|---|---|
| Overview | Functional but visually crowded; **4 competing, overlapping CSS grid definitions** for the same hero/stat layout stacked across the stylesheet |
| Orders | Read-only works. **No cancellation capability exists anywhere in the customer-facing stack** |
| Return Requests | Functional, well-built (hygiene checklist, attachments, 14-day window logic) |
| Favorites | Functional for API-synced items; **heart icon/count desyncs for items only in local cache** |
| Invoices | Functional, passive display only |
| Routines | Functional; data model is solid, visual polish is the main gap |
| Skin Profile | Functional |
| COSMOSKIN Club | **Points ledger is fed by nothing on the purchase path** — only birthday cron + manual admin adjustment ever write a ledger row |
| Coupons | Backend rules (WELCOME10/BIRTHDAY10) are correctly enforced server-side; **front-end eligibility display is a coarse approximation that doesn't match backend rules** (see §2.6) |
| Profile Information | Functional; birthday "lock" flag is **dead code — never set to true** |
| Addresses | Functional, standard CRUD |
| Payment Preferences | Static informational panel only (no stored payment methods — this is intentional, not a bug) |
| Notification Preferences | **Primary persistence table does not exist in any migration** — writes silently fall back/fail |
| Security | Functional, already honest about 2FA (no fake placeholder currently present) — layout has been patched **6 separate times** with stacked `!important` rules |
| Support Requests | Functional |

**Confirmed hard bugs (not opinions — verified in code):**
1. Broken href: `<a href="/ödeme ekranı.html">Ödeme Ekranı</a>` in Coupons tab (line 728) — real checkout is `/checkout.html`.
2. Prohibited "Koşullu" badge is live in 3 places in the Coupons tab (tab label, status pill, section header).
3. Order cancellation: zero customer-facing code path exists (UI or API).
4. `notification_preferences` table is never `CREATE TABLE`'d — only `ALTER TABLE IF EXISTS` (a no-op) appears, in **3 separate migration files**.
5. `marketing_sms_opt_in` column (used as a fallback write target) doesn't exist in any migration for `profiles`.
6. `birth_date_locked` is read but never written `true` anywhere — the "lock after first save" feature does not function.
7. Club tier spend calculation (`recalculate_customer_membership` RPC and its JS fallback) sums `total_amount` (**includes shipping**), contradicting the UI copy "kargo hariç ürün net tutarı esas alınır."
8. No code path inserts a `loyalty_points_ledger` row when an order is paid — points are only ever created by birthday cron (flat 500) or manual admin action. The "available points" shown to most users is a **client-side guess** (`Math.round(spend)`), never persisted.
9. Account header is a materially different, reduced component vs. the homepage header — missing cart icon/badge, search, and the Kategoriler/Markalar mega-menu.
10. Account tier thresholds are defined **three different ways** in three different layers (DB RPC: 6,000/15,000 + order-count OR; API fallback: 5,000/15,000; front-end JS: 5,000/15,000).

---

## 2. Root Causes

### 2.1 Account header parity
Homepage header (`index.html`) includes: hamburger toggle, account icon, favorites icon, **cart icon with live `.cart-count` badge**, and a full mega-menu (`Kategoriler` → 4 sub-columns; presumably `Markalar` too), plus site search elsewhere in the nav.
Account header (`account/profile.html`) is bespoke, hardcoded markup with only 3 static links (`Öne Çıkanlar`, `Rutinler`, `Destek`) + "Alışverişe Dön" + favorites icon. **No cart icon, no search, no category/brand navigation.**
There is no shared header partial or JS component (`site-chrome.js` only normalizes the *footer*). The header is hand-duplicated per page type, so any homepage header change never propagates to account pages.

### 2.2 Favorites card/image/heart/count bugs
Two independent favorites systems exist:
- `assets/app.js` — global, site-wide, syncs `localStorage['cosmoskin_favorites']` with `/api/account/favorites`, dedupes by `item.id`.
- `assets/account-dashboard.js` (`uniqueFavoriteList()`) — a **second, separate** merge implementation scoped to the account page, dedupes by `product_slug`, and only treats a favorite as "active" if it resolves to a valid **UUID** `favorite_id`.

Local-only entries (added before the account page's own API sync completes, or written by `app.js` on another tab/page) carry no confirmed UUID, so `productCard()` renders them with the **unfilled "add" heart** even though they're already in the Favorites tab. Clicking that heart re-POSTs (`data-add-favorite`) instead of removing, which looks broken/duplicative on the exact screen meant for removal. Root cause: two competing sources of truth with different identity keys, never reconciled into one favorites store.

### 2.3 Order cancellation missing before shipment
- `functions/api/account/orders.js` and `functions/api/account/orders/[id].js`: **GET only**, no PATCH/DELETE.
- `assets/account-dashboard.js` `orderCard()`: only renders "Sipariş Detayı", "Destek Al", tracking link, "Tekrar Satın Al" — no cancel button anywhere.
- Cancellation logic (with the correct guard — "paid orders can't be cancelled directly, use controlled return flow") **exists only in `functions/api/admin/orders.js` / `admin/orders/[id]/status.js`**, gated to admin auth.

This isn't a bug in the strict sense — it's a genuinely unbuilt feature. The admin-side logic (inventory release, status guard) is a good template to mirror for a customer-facing pre-shipment cancel action.

### 2.4 Notification preferences persistence
`functions/api/account/notifications.js` upserts to `notification_preferences` (primary) and falls back to writing flags onto `profiles`. Cross-checked against all 21 migrations:
- **No `CREATE TABLE public.notification_preferences` exists anywhere.** Three files (`20260702_customer_returns_account_pdp_polish.sql`, `20260703_account_experience_final_polish.sql`, `20260703_account_runtime_hotfixes.sql`) each contain `ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS ...` — every one is a silent no-op against a table that was never created.
- The fallback write to `profiles` uses `marketing_sms_opt_in`, which also doesn't exist in any `profiles` migration (only `marketing_email_opt_in`, `newsletter_opt_in`, `stock_alert_opt_in`, `routine_reminder_opt_in` were ever added).
- The front-end already has defensive copy for this ("Tercihleriniz kaydedildi; bazı ek alanlar Supabase migration sonrası tam kalıcı olur") — confirming the team already knew this was incomplete.
- **Net effect:** order/cargo/campaign/stock/routine toggles partially persist via `profiles`; SMS and the full preference row never do.

### 2.5 Birthday save/update/lock logic
`functions/api/account/profile.js`: `birth_date_locked` is read (`existing?.birth_date_locked`) but the PATCH handler only ever **carries forward** the existing value (`birth_date_locked: birthdayLocked`) — nothing in the codebase ever sets it to `true`. The column (added redundantly in 3 separate migrations, default `false`) will realistically stay `false` forever, so the "locked after first save" UX promise in `renderProfile()` (readonly input, explanatory copy) never actually engages.

### 2.6 Coupons WELCOME10 / BIRTHDAY10 logic
Backend (`functions/api/_lib/coupons.js`, `functions/api/coupons/validate.js`) is correctly built: WELCOME10 checks `first_order_only` + reservation state; BIRTHDAY10 checks birthday-month match, once-per-calendar-year, and requires login.
Front-end display (`getCoupons()` in `account-dashboard.js`) only replicates **two** of these checks:
- WELCOME10: `!hasSuccessfulOrder()` ✅ reasonable approximation.
- BIRTHDAY10: only checks `!hasBirthday` — **it never checks whether the current month matches the birthday month**, nor "already used this year." A customer with a birthday in March will see BIRTHDAY10 marked "Kullanılabilir" (copyable) in July, copy the code, and have it rejected at checkout with `BIRTHDAY_NOT_ELIGIBLE`. This is a real, verifiable trust-damaging mismatch between what the account screen promises and what checkout enforces.

### 2.7 Club points excluding shipping
- UI copy states plainly: "Puan hesabında kargo hariç ürün net tutarı esas alınır."
- `recalculate_customer_membership` (SQL function, `20260626_production_launch_readiness.sql`): `select coalesce(sum(total_amount), 0) ... from orders` — **`total_amount` includes shipping** (the orders table separately tracks `subtotal_amount`, `shipping_amount`, `discount_amount`, `total_amount`).
- `functions/api/account/membership.js` `computeFallback()`: same mistake, sums `total_amount`.
Both paths should sum `subtotal_amount` (or `subtotal_amount - discount_amount`), not `total_amount`.

### 2.8 Club point history / Supabase loyalty model
Grepped every insert into `loyalty_points_ledger` across the whole API surface. Only three writers exist:
1. `admin/loyalty/adjust-points.js` — manual admin action.
2. `cron/birthday-benefits.js` — flat 500 pts, once a year.
3. `loyalty/redeem.js` — **negative** delta (spending points).

**There is no writer for "customer paid an order → earn points."** The number shown as "Kullanılabilir Puan" on Overview is, for any customer without a birthday bonus or admin adjustment, produced by a client-side fallback in `loyalty()` (`account-dashboard.js` line ~223): `if (!available && spend > 0 && !ledger.length) available = Math.round(spend)`. This is a **display-only illusion** — it is not stored, not deducted on redemption correctly (redemption checks the real ledger sum, which would be 0, so a customer who sees "2,450 P available" from the fallback cannot actually redeem it). This is the single highest-impact backend gap found.

### 2.9 Security screen broken layout / 2FA
- The 2FA card is **already honest** in the current code: "Bu özellik henüz aktif değildir; çalışır gibi görünen bir anahtar gösterilmez." No fake QR code, no fake toggle. This item appears to have already been fixed in a prior session — flag as "verify, don't redo."
- The actual live issue is CSS: `.cs-security-grid` / `.cs-security-list` are redefined **6 separate times** across `account-premium.css` (lines 115, 369–372, 407, 584–586, 847–849, 898–901), each adding more `!important` overrides, including forced fixes like `writing-mode:horizontal-tb!important; text-orientation:mixed!important` — strong evidence that at some point security-list text was rendering sideways/overflowing, and each subsequent patch fought the previous one instead of removing it. This is a maintenance-risk pattern, not just a visual one: the next edit to this component is likely to reintroduce the original bug because the broken base rule is still in the file.

### 2.10 Overview screen crowding
`.cs-overview-hero-grid` is defined **4 times** with different column ratios (lines 307, 399, 500, 886, plus a responsive override at 937), each `!important`-guarded, layered under class-name variants (`--final`, `--final-minimal`) that suggest at least two full redesign passes were stacked rather than replacing the original. `.cs-stat-grid--six` similarly redefined 4×. The visible crowding is a direct symptom of cascade warfare — the actually-rendered layout depends on selector specificity order rather than a single deliberate design.

### 2.11 Routines screen premium polish
Data model (`normalizeRoutineRecord`, `routineStepsHtml`) is solid and matches your skill-file's "Cilt Profilim data must save/persist/sync" requirement. Visual gap is mostly CSS refinement (card rhythm, thumbnail sizing) — lower risk than Overview/Security, no structural rework needed.

### 2.12 Turkish copy compliance
- "Checkout" and "Değişim": **not found** anywhere in the account module — clean.
- "Koşullu" badge: **found live** in `renderCoupons()` — used as a tab-filter label, a status-pill value, and a section header ("KOŞULLU AVANTAJLAR"). This directly violates the customer-facing copy constraint and needs a replacement term (e.g., "Şartlı Kazanım" vs. simply hiding the locked group behind an info tooltip — a copy decision for you, not mine to invent).
- Bonus find, same file: the hardcoded broken `href="/ödeme ekranı.html"` (should be `/checkout.html`).

---

## 3. Files to Change

**Frontend (shared across nearly every fix):**
- `assets/account-dashboard.js` — favorites merge/identity logic, coupon eligibility display parity, order cancel UI, "Koşullu" copy, broken checkout href, birthday-lock UI already correct (backend fix needed instead)
- `assets/account-premium.css` — consolidate the 4× overview-grid and 6× security-grid/list rule sets into single canonical blocks; remove dead `!important` layers
- `account/profile.html` — header markup only (bring to parity with homepage header structure)
- Possibly extract a shared header partial (new file, e.g. `assets/partials/site-header.js` or equivalent) so homepage and account never drift again — architectural decision for the next phase, not this audit

**Backend:**
- `functions/api/account/notifications.js` — remove/replace the broken `marketing_sms_opt_in` fallback field name once schema is fixed
- `functions/api/account/profile.js` — set `birth_date_locked: true` on first successful birthday save
- `functions/api/account/membership.js` — `computeFallback()` spend calculation (use `subtotal_amount`)
- `functions/api/account/orders.js` / new `functions/api/account/orders/[id]/cancel.js` — new customer cancel endpoint (pre-shipment only), mirroring the guard logic already in `functions/api/admin/orders/[id]/status.js`
- A points-earning writer needs to be added at order-payment-confirmation time (likely inside the Iyzico callback / admin order-paid transition, or a dedicated cron/trigger) — **new code path, not a fix to existing code**

**Not part of the account module but referenced by it (verify before touching):**
- `functions/api/_lib/coupons.js` — source of truth for eligibility rules; front-end should call `/api/coupons/validate` (already exists) for display-time accuracy rather than re-implementing rules client-side

---

## 4. Supabase Changes Needed

1. **`notification_preferences` table** — needs an actual `CREATE TABLE IF NOT EXISTS` (not another `ALTER TABLE IF EXISTS`), with `user_id` PK/unique + the 7 boolean columns + `updated_at`, RLS enabled, owner-only policy. This is the most urgent migration — three prior attempts silently did nothing.
2. **`profiles.marketing_sms_opt_in`** — add column, or better, retire this fallback path entirely once table #1 exists and route all preference writes through it.
3. **`recalculate_customer_membership` RPC** — modify to sum `subtotal_amount` (or `subtotal_amount - discount_amount`) instead of `total_amount`. Also reconcile the elite/signature thresholds (6,000/15,000 + order-count OR-condition in SQL vs. flat 5,000/15,000 everywhere else) into one canonical rule.
4. **Loyalty point earning on order payment** — new trigger or explicit write in the payment-confirmation code path that inserts a positive `loyalty_points_ledger` row (points based on subtotal ex-shipping) when an order transitions to paid. Without this, "Kullanılabilir Puan" will remain fictional for the vast majority of customers.
5. **`birth_date_locked`** — no schema change needed (column already exists, added 3× redundantly); this is purely an application-code fix.
6. **Migration hygiene** — `profiles` table has `create table if not exists` in **5 separate files** (`20260626`, `20260628`, `20260629`×3) with **different column sets**. This is a latent integrity risk (schema depends on execution order) even though it hasn't visibly broken anything yet, because `if not exists` means only the first-run version ever takes effect. Recommend a consolidation/verification migration that asserts the full expected `profiles` schema via idempotent `ADD COLUMN IF NOT EXISTS` statements only, and flags the older duplicate `CREATE TABLE` migrations as historical/no-op in comments so nobody trusts them as the schema reference again.

---

## 5. Risk Assessment

**High risk — touch with a migration + rollback plan, test on staging first:**
- Loyalty points earning trigger (financial-adjacent; wrong logic could over/under-credit real customers)
- `recalculate_customer_membership` spend basis change (will shift customers between tiers retroactively — decide whether to recompute historical `customer_membership_history` or only apply forward)
- Any `notification_preferences` table creation (must not collide if the table partially exists in production but wasn't visible in this ZIP)

**Medium risk:**
- Order cancellation endpoint (must exactly mirror the admin guard: block cancel once `payment_status` is paid/refunded/partially_refunded, release inventory reservations, write status event) — a sloppy version could let customers cancel already-shipped orders
- CSS consolidation of overview/security grids — visually low-risk but touches heavily `!important`-laden rules used elsewhere on the page; must diff rendered output at 1440/1220/980/720px before and after

**Low risk:**
- Broken `/ödeme ekranı.html` href fix
- "Koşullu" copy replacement
- Birthday lock flag fix (isolated, single field)
- Favorites identity/heart-state fix (contained to `uniqueFavoriteList()`/`productCard()`)

**Do not touch without separate explicit approval:**
- `functions/api/admin/**` (cancellation, refunds, inventory) — these are correct and are the reference implementation the customer-facing cancel feature should mirror, not duplicate divergently
- Iyzico callback/payment webhook (`iyzico-callback.js`) — high blast radius if a points-earning insert is added carelessly here; needs its own focused review before code changes
- Any of the 5 duplicate `profiles` migration files — do not delete/rewrite history, only add a new corrective migration on top

---

## 6. Existing Working Flows to Preserve

- Return request flow (hygiene checklist, attachment upload with type/size guards, 14-day eligibility window) — fully functional, well-built, no changes needed
- Address CRUD (`addresses.js`, modal form) — solid
- Support request creation + return-flow redirect hint — solid
- Coupon **backend** eligibility rules (`_lib/coupons.js`, `coupons/validate.js`) — correct; only the front-end display needs to catch up to it, not the other way around
- Skin profile save/sync and its cross-page broadcast (`cosmoskin:skin-profile-change` event, `skin-profile-store.js`) — matches your skill file's persistence requirement, don't touch the sync mechanism
- Security screen's honest "2FA not active yet" messaging — already correct, preserve the copy exactly, only fix surrounding CSS
- `deprecatedCoupons` filtering (COSMOSKIN10/CLUB10/WELCOME15 hidden client-side) — correct, keep

---

## 7. Phased Implementation Plan

**Phase 1 — Zero-risk copy/link fixes (no CSS, no migration)**
- Fix `/ödeme ekranı.html` → `/checkout.html`
- Replace "Koşullu" badge/label/section-header copy in Coupons tab
- Fix `birth_date_locked` to actually set `true` on first save

**Phase 2 — Favorites identity reconciliation**
- Unify favorite identity resolution between `app.js` and `account-dashboard.js` (single dedup key, consistent UUID handling) so the heart state and count are always correct on the Favorites tab

**Phase 3 — Coupon display parity**
- Extend front-end `getCoupons()` BIRTHDAY10 check to include birthday-month match and once-per-year usage, sourced from the same rule set as `_lib/coupons.js` (ideally by calling the existing `/api/coupons/validate` for display truth rather than re-deriving rules client-side)

**Phase 4 — Notification preferences persistence (migration-first)**
- Ship the corrective `notification_preferences` `CREATE TABLE` migration
- Fix/retire the `marketing_sms_opt_in` fallback field mismatch
- Verify both the primary and fallback write paths against the real schema

**Phase 5 — Club/loyalty model correction (migration + backend)**
- Fix `subtotal_amount` vs `total_amount` in both the RPC and the JS fallback
- Reconcile tier thresholds to one canonical definition across SQL/API/frontend
- Design and ship the points-earning write path on order payment confirmation (staging-tested, with a plan for whether to backfill existing paid orders)

**Phase 6 — Order cancellation (new customer-facing capability)**
- New `PATCH /api/account/orders/[id]` (or dedicated `/cancel` endpoint) mirroring the admin guard logic (block if paid/refunded, release inventory, log status event)
- UI: conditional "Siparişi İptal Et" button in `orderCard()`, shown only pre-shipment

**Phase 7 — Visual consolidation (Overview + Security CSS)**
- Audit and collapse the 4× overview-grid and 6× security-grid/list rule blocks into single canonical definitions in `account-premium.css`, removing dead `!important` layers
- Re-test at all four existing breakpoints (1220/980/720 + base) before/after

**Phase 8 — Header parity**
- Bring account header to structural parity with homepage header (cart badge, search, category/brand mega-menu), ideally by extracting a shared header component so this can't drift again

**Phase 9 — Routines visual polish**
- Lowest-risk, purely cosmetic pass once the structural phases above are stable

---

## 8. Test Plan

**Per-phase regression checklist:**
- Desktop (1440px) and mobile (390px) visual QA on every touched tab, per your skill file's standing rules (no overflow, no console errors, no broken images)
- Cross-tab consistency: Favorites badge count in sidebar nav = Favorites tab grid count = header favorites icon state
- Coupons: verify a BIRTHDAY10 holder outside their birthday month sees it as locked in the account UI, and that the same code is rejected identically at `/checkout.html`
- Notifications: save toggle → hard refresh → confirm every one of the 7 preferences (including SMS) persists, not just the ones currently backed by `profiles`
- Club: place a test order with non-zero shipping, confirm paid points/spend excludes shipping in both the Overview stat card and Club tab detail
- Order cancellation: verify cancel button disappears once shipment status flips to shipped/delivered, and that a paid+shipped order cannot be cancelled via direct API call even if the button is bypassed
- Birthday lock: save a birthday once, refresh, confirm field is now readonly and a second PATCH attempt with a different date is rejected/ignored server-side (not just hidden client-side)
- Security tab: check at 1440/1220/980/720/390 that list rows never wrap vertically or overflow (the historical bug the 6 CSS patches were fighting)
- Header parity: cart badge count updates correctly when navigating from account pages back to shop pages and vice versa

---

This audit is complete and no files were changed. Let me know which phase you'd like to start with — I'd suggest Phase 1 (copy/link fixes) and Phase 4 (notification persistence migration) as the highest-value, lowest-risk starting points, since Phase 4 is currently silently failing in a way that's invisible without this level of migration cross-referencing.