# COSMOSKIN — Full Frontend UX + Commerce + Supabase System Audit
**Date:** 2026-07-11 · **Mode:** AUDIT ONLY (no fixes, no SQL executed, no deploy, products.json untouched)
**Branch:** `claude/angry-northcutt-23ca92` (clean tree at HEAD `aed0149`)

## Method
- Static code audit of `assets/*`, `functions/api/*`, `supabase/*.sql`, all HTML surfaces.
- Live rendering audit on a local static server (Playwright + system Chrome, headless) at 360 / 390 / 1280 widths; carts seeded with 1 / 3 / 5 items via `cosmoskin_cart`. `/api/*` 404s are expected locally (Cloudflare Functions) and were excluded from findings.
- Runtime CSS probes (bounding boxes + computed styles) to pin the mini-cart collision root cause.
- No SQL executed. Verification queries prepared in `COSMOSKIN_FULL_UX_COMMERCE_SUPABASE_AUDIT_SQL_VERIFICATION_QUERIES_20260711.sql`.

---

## 1. Critical findings (P0)

### C-01 — `cartHasItems is not defined` breaks mini-cart commerce UI on every page
`assets/phase6-commerce.js` calls `cartHasItems()` at lines 110, 162, 192, 219, 262, 294 but the function is **defined nowhere in the codebase**. Commit `23f7c95` (C3 mini cart premium redesign) removed the definition (present at `3480f15`) while keeping/adding the call sites.

Effects (confirmed at runtime — `ReferenceError` on index, PLP, favorites, checkout, PDP):
- `setCartDrawerCommerceState()` throws → the drawer **coupon box (`#phase6CartCoupon`) is never un-hidden** and **recommendations never render** → the drawer shows a bare item list, which is a large part of the "looks like a plugin/extension" complaint.
- Coupon apply inside the drawer (`validateCoupon`) throws before doing anything.
- The empty-cart checkout-CTA guard and `revalidateStoredCoupon()` throw.
- The error re-fires every 1.8 s via `setInterval(mountCartExtras, 1800)`.
- Violates the "no console errors in critical flows" hard rule.

### C-02 — Profile save silently wipes CRM opt-ins (data loss)
`functions/api/account/profile.js` `onRequestPatch` builds a **full-row upsert**: any field not present in the request body is overwritten (`normalizeBool(undefined)` → `false`, `cleanText(undefined)` → `''`, `metadata` → `{}`).
The frontend `saveProfile()` (`assets/account-dashboard.js:1208`) sends **only** `first_name, last_name, phone[, birthday]`.
→ Every time a customer saves their name or phone, their `marketing_email_opt_in`, `newsletter_opt_in`, `stock_alert_opt_in`, `routine_reminder_opt_in` flags and `metadata` in `profiles` are silently reset. This corrupts consent data (KVKK-relevant) and desyncs from `notification_preferences`.

### C-03 — Mini-cart rows collide with 2+ items (the reported drawer bug, root-caused)
Runtime probe with 3 items: each `.cart-item` row renders at exactly **78 px** while its `.cart-drawer-premium__copy` content is **139–158 px** tall → content bleeds over the next row card (row 2 top = 275 px, row 1 copy bottom = 329 px). Text/price/qty visually collide, matching the user report.
Root cause: stacked conflicting `!important` layers inside `assets/phase6-commerce.css` alone:
- line 395: `#cartDrawer .cart-item{ min-height:78px; align-items:center; grid-template-columns:58px … !important }` (older phase)
- line 389: `#cartDrawer .cart-items{ max-height:31dvh !important }`
- line 643+: C3 premium item layout (`72px` thumb, `align-items:start`)
plus `assets/master-upgrade.css:242` (`align-items:center !important`), `assets/cosmoskin-final-uat-fix.css:154` (`max-height:min(42vh,392px) !important`) and base rules in `style.css:1666`. At least **five** competing rule layers style the same drawer.

### C-04 — Add-to-cart fully broken on one pre-rendered PDP
`products/isntree-hyaluronic-acid-watery-sun-gel.html` ships the cart drawer but does **not** load `/assets/inventory-client.js` (the only one of 37 PDPs). `app.js` `cartStockCheck()` returns `{ok:false}` when `window.COSMOSKIN_STOCK` is missing → `addCartItems()` rejects every add with "Stok bilgisi doğrulanamadı" on that page. Also note: this client-side fallback treats **unknown stock as blocking**, which contradicts the I2 invariant ("stock unknown must not be treated as unavailable before API validation") on any page where the inventory script fails to load.

---

## 2. Mini cart drawer audit (Section 2)

Confirmed against 1 / 3 / 5 item carts, desktop + 390 px:

| Area | Finding |
|---|---|
| Multi-item layout | Rows collide (C-03). With 5 items, the 31dvh/42vh caps leave ~2.5 visible rows; scrolling works but collided text scrolls with it. |
| Coupon block | Never appears (C-01). Code path (validate → success/error status states, remove link) is otherwise well-built and shares `coupon-client.js` state with cart/checkout (good parity design). |
| Recommendations | Never appear (C-01). When fixed: only 1 card at a time with ‹ › arrows — feels widget-like; consider a cleaner single "complete your routine" row. |
| Title | Not italic — kicker `SEPETİN` (10 px uppercase) + serif `Seçtiğin ürünleri kontrol et` (1.65 rem Cormorant). On 390 px it wraps with an orphan word ("…kontrol / et"). Hierarchy reads editorial rather than commerce; title + subtitle + trust line + edit link is a lot of copy for a drawer. |
| Empty state | Premium and correct (serif heading, two CTAs). `cart-drawer--empty` class handling works via app.js fallback. |
| Quantity controls | Compact and readable; `Kaldır` sits inline with +/− and can crowd at 320–360 px. Disabled state styled. |
| Thumbnails | 72 px contain-fit frames OK; but at collision state thumbs overlap neighbour rows. |
| Sticky CTA | `cart-summary` sticky bottom OK; **cookie banner overlaps the drawer CTA** (z-index) on desktop and mobile until dismissed. |
| Stock messages | Local "Stok servisine şu anda ulaşılamıyor…" text renders inside rows and inflates row height (worsens C-03). |
| Mobile drawer | Bottom-sheet transform works, but content is clipped: with 3 items only ~1.2 rows visible under the oversized head block; cookie banner covers the summary. |
| Header enhancement | Injected via JS string on pages that load `phase6-commerce.js` (68 pages). `order-tracking.html` and `account/index.html` fall back to the bare legacy `Sepet` 38 px serif head — inconsistent drawer across pages. |
| Code smells | `document.write` fallback script injection (lines 2–8); `setInterval(mountCartExtras, 1800)` permanent polling; full `innerHTML` re-render of items on every qty change (scroll-jump risk). |

## 3. cart.html audit (Section 3)
- Desktop layout is close to target: aligned rows, stable price column, quantity steppers, coupon box with helper text, KDV note, summary card, recommendations section.
- **Recommendation cards show the stock pill twice** (under the title *and* replacing the CTA) when stock is unknown/out — looks unfinished.
- Coupon flow on cart page uses the same shared state — parity OK (C2/C3/C4 work held up).
- Sale/compare-at display flows through `COSMOSKIN_PRICE_DISPLAY` — consistent.
- Mobile 360/390: no horizontal overflow (measured `scrollWidth == clientWidth`); cookie banner covers the summary CTA.
- Empty state: standard premium empty card (OK).
- `master-upgrade.js` (`#csCartApp`) is a separate cart implementation from the drawer (`app.js`) — two renderers for the same cart state; they stay in sync via storage events but double the maintenance surface.

## 4. checkout.html audit (Section 4)
- Structure is strong: 4-step progress, address/billing, bank-transfer + gated card (`CARD_PAYMENTS_ENABLED` via config), legal consents (pre-info, distance-sales, KVKK) with version links, KDV row, coupon parity, server-authoritative totals, `price_changed`/`repriced` re-render handling, stock verification gate before payment.
- **Unstyled header artifact** top-left on desktop (raw "COSMOSKIN" text + a floating "4" badge above the announcement bar) — appears to be mobile-redesign header fragments rendering before/without their CSS gate on `checkout-premium-page`. Verify on production; if reproducible it's a P1 polish item.
- `price_changed` handler at `assets/checkout-flow.js:899` sets the message with the **`success`** status class (green) — a price-change warning styled as success is misleading (the second path at line 906 uses neutral).
- Address book: logged-in addresses are fetched and applied (`/account/addresses`), invoice block copies delivery — profile data reuse works by design.
- Cookie banner overlaps the "Stok doğrulaması" card / CTA until dismissed.
- Mobile 390: single-column flow renders; no overflow measured.

## 5. Account / Hesabım audit (Section 5)
- Architecture: `account/profile.html` + `assets/account-dashboard.js` (1,352 lines) with tabbed views; data via `/api/account/summary` (orders, addresses, favorites, notifications, profiles, membership, points, coupons, skin profile, routine results, consents, preferences, support in one call).
- **Profile save wipes opt-ins (C-02).**
- Birth date: UI + API exist with one-change lock semantics (`birthday_change_count`, `birth_date_locked`). Two caveats: (a) the frontend never sends `birthday: ''` (cleared field is simply not sent) so users can't intentionally clear it — acceptable but undocumented; (b) whether `profiles.birthday`/lock columns exist in production must be verified (see SQL file) — if the column is missing, the field would "look editable but never persist", matching the user's complaint.
- Notification switches: real endpoint (`/api/account/notifications` → `notification_preferences` upsert + mirrored flags into `profiles`). Switches are plain checkboxes (`.checkline`) — not the animated premium switches the design target asks for.
- Guest/error state: correct error card, but the rotated "HESAP BİLGİSİ" stamp renders as skewed text (looks broken), and the page leaves a very large blank band between the error card and footer.
- Gender / skin type: no gender field anywhere (fine); skin type lives in `customer_skin_profiles` via skin-profile store (canonical key respected).
- Membership/points/coupons tabs are data-driven (real). Password change via Supabase auth. Session/logout handled.
- Design: overview modules are solid but dense; typography in stat cards uses `overflow-wrap:anywhere` band-aids (UX1) rather than layout fixes; card system radius/shadow varies between `cs-card`, `cs-panel`, `account-state` generations.

## 6. Favorites / wishlist audit (Section 6)
- **Persistence is real for logged-in users**: `user_favorites` table via `/api/account/favorites` (GET/POST/DELETE), plus localStorage (`cosmoskin_favorites`), plus `auth.user_metadata.favorites`. Guests: localStorage only (allowed to favorite; `ensureFavoriteAuth()` exists but is never called — intent inconsistent with the login-guard toast it contains).
- **Removal resurrection risk**: on toggle-off, only localStorage + a DB DELETE run (`skipRemote:true`), `user_metadata.favorites` is **not** rewritten. `hydrateFavoritesFromAccount()` merges `local ∪ remote`; if the API GET fails it falls back to stale `user_metadata` → a removed favorite can come back after login/refresh or on another device.
- **N+1 sync**: every favorite add POSTs the **entire** favorites list one-by-one (`saveFavoritesToAccount` loops all items) plus a `auth.updateUser` metadata write — heavy and racy.
- Duplicates: API does check-then-insert (race window), but DDL has `UNIQUE (user_id, product_slug)` — safe **if** the production table matches `supabase/commerce-schema.sql` (verify; the DELETE handler loops "all rows for slug", which implies duplicates were observed at some point).
- `product_slug` is canonical (id == slug across the pipeline). Hydration repaints hearts via storage events — cross-tab sync handled.
- Heart icon: appended into `.product-media-wrap`; the SVG path (`M12.1 20.3 4.9 13.4 …`) is slightly asymmetric inside its 24 px viewBox, so the heart sits a touch off-centre in the 44 px circle — matches the "crooked" perception. `style.css` contains **three** separate `.favorite-btn` blocks (lines 2251, 2340, 2383) from different phases with different sizes (44/46/44 px, z-index 3/10/12) — CSS drift; consolidate.
- Favorites page (`favorites.html`) renders from the same store; guest empty state is premium (cookie banner overlaps its CTA).

## 7. Membership / loyalty audit (Section 7)
**Real, not visual.** Single source of truth `functions/api/_lib/loyalty-config.js`: Essential (0) / Signature (6.000 TL or 3 orders) / Elite (15.000 TL or 8 orders) — no "Select"/"Silver" anywhere (frontend mirrors the same names/thresholds).
- Storage: `customer_membership_status` (+ `customer_membership_history`, `membership_levels`, `loyalty_points_ledger`, `loyalty_redemptions`, `birthday_benefits`).
- Recalc: SQL RPC `recalculate_customer_membership` (migrations `20260626` + `20260704_batch4`), triggered on order finalization via `awardOrderPoints`, on demand (`/api/loyalty/recalculate-user`, account/membership fallback) and via cron (`functions/api/cron/recalculate-memberships.js`). Old paid orders contribute (spend is summed ex-shipping).
- Account overview shows computed tier + progress + points; survives refresh (server-derived).
- Gaps: admin has no dedicated tier view surface (data available via customers endpoint but UI not confirmed); `tier_expires_at`-style decay is not modelled (12-month rolling fields exist — verify semantics); no `membership_events` table (history table covers most needs).

## 8. CRM / Brevo audit (Section 8)
Present and real:
- `crm_events` table + `recordCrmEvent()` with allowed event set (`product_viewed, added_to_cart, removed_from_cart, checkout_started, purchase_completed, favorite_added, restock_alert_created, newsletter_subscribed, return_requested`); frontend fires via `assets/cosmoskin-phase3.js` → `/api/crm/events`.
- Newsletter: `/api/newsletter/subscribe` → `newsletter_subscribers` + `consent_records` + Brevo SMTP welcome; consent endpoint `/api/consents` with typed consent set; registration collects membership + marketing consents.
- Transactional email: `order-email.js` covers order confirmation, bank-transfer pending/reminder/cancel, paid, shipping; logged to `email_events`.
- Brevo contacts: `upsertBrevoContact` + `deriveCommerceSegments` (customer, high_value, bundle_buyer, routine_optin, reorder_optin, skin_*, concern_*, category_*) + list mapping via env IDs.

Gaps:
- **Contact sync only happens in `iyzico-callback`** — bank-transfer orders (currently the primary path) never sync the customer to Brevo. `/api/brevo-sync` exists but has **no caller**.
- **No abandoned-cart model at all** (no event, no cron, no `cart_sessions`).
- **No unsubscribe token/endpoint** (`email_unsubscribe_tokens` absent); Journal unsubscribe only via logged-in account prefs; Brevo native unsubscribes are not synced back.
- Double opt-in not implemented (`confirmed_at` set immediately on subscribe).
- Birthday/profile → Brevo attribute sync absent; requested segment tags `first_order`, `vip`, `interested_brand`, `abandoned_cart` not produced.
- `crm_sync_logs` absent (Brevo failures only in function logs).

## 9. Supabase database audit (Section 9)
Code references 50+ tables; DDL coverage:
- In `supabase/migrations/` (canonical): orders/payments/shipment_events/inventory, coupons + redemptions, profiles, user_addresses, consent_records, crm_events, newsletter_subscribers, notification_preferences, customer_membership_*, loyalty_*, product_price_overrides/audit_logs, order_legal_*, returns/refunds/invoices, admin_*.
- **Outside migrations** (provenance risk — apply-state must be verified in production): `user_favorites` + `notifications` (`supabase/commerce-schema.sql`), `shipments` (`supabase/commerce-schema.sql`/`schema.sql`), `reviews`/`review_images`/`review_helpful` (`supabase/reviews.sql`), `support_requests` (`COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`).
- **Referenced by design docs but existing nowhere**: `crm_sync_logs`, `email_unsubscribe_tokens`, `cart_sessions`, `membership_events` — all optional; needed only for E3/QA scope.
- Columns to verify (see SQL file): `profiles.birthday`, `birthday_change_count`, `birthday_last_changed_at`, `birth_date_locked`, the 4 opt-in booleans, `product_price_overrides.sale_price_try` / `compare_at_price_try`, `user_favorites` unique constraint + RLS.
- RLS: hardening migration exists (`20260616_rls_security_hardening.sql`); favorites/notifications policies exist in commerce-schema — verify applied.
- All server access uses the service-role key through `_lib/supabase.js` (RLS bypassed server-side; RLS still required for any client-side reads).

## 10. Frontend/DB mismatch matrix (Section 10) — summary
| Field | UI | Save path | Table/column | Failure mode | Batch |
|---|---|---|---|---|---|
| Birth date | profile tab (`type=date`) | PATCH `/account/profile` | `profiles.birthday` (+lock cols) | column existence unverified; UI can't clear value | UX4/DB1 |
| Phone | profile tab | PATCH `/account/profile` | `profiles.phone` | OK (but wipes opt-ins — C-02) | UX4 |
| Marketing/newsletter/stock/routine opt-ins | notifications tab switches | PATCH `/account/notifications` | `notification_preferences` + mirrored `profiles.*` | **wiped by profile save (C-02)** | UX4 |
| Addresses | addresses tab + checkout | `/account/addresses` CRUD | `user_addresses` | OK | — |
| Invoice info | checkout | order payload | `orders` invoice fields | not persisted to reusable "billing profiles" (re-entered each time unless same as delivery) | UX5 |
| Skin type / goals | skin-profile tab, routine wizard | `/account/skin-profile` | `customer_skin_profiles` | OK (canonical store respected) | — |
| Favorites | hearts everywhere | `/account/favorites` | `user_favorites` | resurrection + N+1 (§6); table provenance | E1/DB1 |
| Membership tier | overview/club | server-computed | `customer_membership_status` | verify RPC/table live | E2/DB1 |
| Recently viewed | PDP "Son gezilenler" | localStorage only | — | by design; no CRM use | E3 (optional) |
| Newsletter (guest footer) | all pages | `/api/newsletter/subscribe` | `newsletter_subscribers` | no unsubscribe/no double opt-in | E3 |
| Cookie consent | banner/modal | localStorage + `/api/consents` | `consent_records` | OK | — |

## 11. Design quality audit (Section 11)
- **Mini cart** is the biggest premium gap (C-01/C-03 + copy-heavy head + single-card recs).
- **Cookie banner** is the second: overlaps drawer/cart/checkout/favorites CTAs (z-index) and consumes most of a 390 px viewport — decide once, style once, keep it under drawers.
- CSS layering debt: 5+ generations of `!important` styles fight over the same components (`phase6-commerce.css` internal conflicts; 3× `.favorite-btn` blocks; `master-upgrade.css` vs premium drawer). This is the systemic cause of "cramped/colliding" symptoms.
- Switches are unstyled checkboxes; empty/loading states exist in most surfaces (good), account error state has a broken-looking rotated stamp and a large blank band.
- Serif/italic usage: no stray italics found in commerce UI (only intentional `home-hero em`); drawer/cart headings are serif Cormorant per brand.
- PDP, PLP, checkout desktop and home read genuinely premium; typography scale is consistent; product-card frames post-UX2 are stable (contain-fit, aspect-ratio).
- No horizontal overflow measured at 360 px on home/cart/checkout/PLP/favorites.

## 12. Recommended batches
See `COSMOSKIN_FULL_UX_COMMERCE_SUPABASE_AUDIT_RECOMMENDED_BATCHES_20260711.md`. Order: **UX3 → UX4 → E1 → DB1 → UX5 → E2 → E3 → QA1** (UX3/UX4 carry P0s; DB1 verification gates E1/E2/E3 migrations).

## 13. Explicit confirmations
- No code fixes applied. No SQL executed (verification queries are prepared, not run). No deploy. `products.json` untouched. `.wrangler/` untouched. Working tree left clean except the 5 new audit deliverables.
