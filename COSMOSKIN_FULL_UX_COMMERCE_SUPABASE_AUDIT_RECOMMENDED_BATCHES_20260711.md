# COSMOSKIN — Recommended Implementation Batches (post-audit 2026-07-11)

Execution order: **UX3 → UX4 → E1 → DB1 → UX5 → E2 → E3 → QA1**
(UX3 and UX4 each contain a P0; DB1 verification must run before any E1/E2/E3 migration work; QA1 should land immediately after UX3 to lock the drawer behavior.)

---

## UX3 — Mini cart drawer premium redesign + multi-item layout hardening
**Scope**
- Restore/implement `cartHasItems()` (single definition, likely delegating to `COSMOSKIN_CART_API.getItems().length`) — fixes coupon box, recommendations, empty-state CTA guard (UX3-01).
- Consolidate drawer CSS into ONE layer: remove/neutralize the legacy `#cartDrawer .cart-item{min-height:78px;align-items:center}` and `31dvh` blocks (phase6-commerce.css:387–425), the `544px` width block (line 200), and master-upgrade/final-uat-fix drawer overrides; keep only the C3 premium block (UX3-02).
- Drawer head: tighter premium heading (no orphan wraps at 320–430px), reduce copy levels (UX3-03).
- Recommendations: replace 1-card arrow carousel with a single refined row (UX3-04).
- Replace `document.write` + `setInterval` with event-driven mounting; preserve scroll position on qty rerender (UX3-05).
- Add drawer stack to `order-tracking.html`, `account/index.html` (UX3-06).
- Cookie banner: compact mobile variant + z-index below open drawers (UX0-01).
**Files:** `assets/phase6-commerce.js`, `assets/phase6-commerce.css`, `assets/master-upgrade.css`, `assets/cosmoskin-final-uat-fix.css`, `assets/style.css`, `assets/app.js`, `order-tracking.html`, `account/index.html`
**DB changes:** none.
**Validators:** extend `validate-c3-minicart-parity-premium-redesign.mjs` with (a) symbol-definition check for every function called in phase6-commerce.js, (b) forbidden-rule greps (min-height:78px, 31dvh) — plus the QA1 headless smoke.
**Risk:** medium (CSS layer removal can affect other pages that reuse `.cart-item` — cart page uses `cs-cart-*` classes, checkout uses `cs-checkout-*`, so blast radius is drawer-only; verify).
**Acceptance:** zero console errors on home/PLP/PDP/cart/checkout/favorites; 1/2/3/5-item carts with long names + stock warnings show no collision at 360/390/430/768/1280; coupon apply/remove works in the drawer; cookie banner never covers the drawer CTA; Safari + reduced-motion clean.

## UX4 — Account premium redesign + persistence fixes
**Scope**
- Fix profile PATCH data-wipe: merge-only update (read-modify-write on provided keys) or full-state payload from frontend; add regression test (UX4-01).
- Birth date: verify columns (DB1), clear-value UX, lock-rule messaging (UX4-02).
- Animated premium switch component for notification/cookie preferences (UX4-03).
- Guest/error state redesign; remove broken rotated stamp; fix blank band (UX4-04).
- Card token unification pass (UX4-05).
**Files:** `functions/api/account/profile.js`, `assets/account-dashboard.js`, `assets/account-premium.css`, `account/profile.html`
**DB changes:** none expected (verification only via DB1).
**Validators:** new `validate-ux4-profile-patch-merge.mjs` (PATCH with partial body must not change opt-ins — unit-level on handler logic); existing account validators.
**Risk:** medium (touches consent persistence; server handler change needs careful review — do NOT touch admin auth files).
**Acceptance:** profile save with only name changes leaves all opt-ins/metadata intact (verified via summary reload); switches persist after refresh and across `/account/profile.html` tabs; no layout collisions 360–1280.

## E1 — Favorites real persistence + heart alignment
**Scope**
- Removal sync: delta-based add/remove against `/api/account/favorites`; retire (or rewrite-on-change) the `user_metadata.favorites` store; hydrate must honor deletions (E1-03, E1-04).
- Fix isntree PDP missing `inventory-client.js` (E1-01) + page-drift validator across `/products/*.html` script sets.
- Client stock-unknown policy: allow add with soft warning; keep server checkout guard authoritative (E1-02) — aligns with I2 invariant.
- Heart icon: consolidate 3 CSS blocks into one; optically center the glyph (new symmetric path or transform) (E1-05).
- Decide guest-favorites policy; remove dead `ensureFavoriteAuth` or wire it (E1-06).
**Files:** `assets/app.js`, `assets/style.css`, `functions/api/account/favorites.js`, `products/isntree-hyaluronic-acid-watery-sun-gel.html`
**DB changes:** none if DB1 confirms `user_favorites` (unique + RLS) is live; otherwise apply commerce-schema block as an idempotent migration.
**Validators:** new `validate-e1-favorites-sync.mjs` (delta calls, no N+1); PDP script-set drift check.
**Risk:** medium (touches add-to-cart guard — commerce invariant review required; no pricing logic touched).
**Acceptance:** remove favorite → refresh → still removed (and on second browser); toggle fires ≤2 network calls; hearts hydrate correctly on PLP/PDP/search/bestsellers/recs; isntree PDP add-to-cart works.

## DB1 — Supabase verification + missing-object migrations
**Scope**
- Run the read-only verification suite (`COSMOSKIN_FULL_UX_COMMERCE_SUPABASE_AUDIT_SQL_VERIFICATION_QUERIES_20260711.sql`) against production (manual, with explicit approval).
- For every missing object: write **idempotent, additive** migrations under `supabase/migrations/` (fold in `commerce-schema.sql` / `reviews.sql` / FINAL_LAUNCH pieces that are missing).
- Add error logging to silent `.catch(()=>null)` CRM/consent insert paths so future drift is visible.
**Files:** `supabase/migrations/*` (new), `functions/api/_lib/crm-events.js` (logging only)
**DB changes:** yes — additive only, nullable columns, `IF NOT EXISTS`, RLS policies, unique constraints; verification SQL + rollback plan per migration; production SQL is manual.
**Validators:** `validate-production-launch-readiness.mjs`; per-migration verification SQL.
**Risk:** medium-high (production DB) — mitigated by read-only-first, additive-only, manual apply.
**Acceptance:** verification suite returns zero missing objects for tables the code writes to; migrations dir is the single source of truth going forward.

## UX5 — cart.html + checkout.html premium polish
**Scope**
- Checkout unstyled header artifact (verify prod, then gate mobile-redesign fragments) (UX5-01).
- `price_changed` message tone fix (UX5-02).
- Cart recommendations double stock pill (UX5-03).
- Optional: reusable billing/invoice profile (UX5-04 — needs `user_addresses.type='billing'` usage, no schema change).
**Files:** `assets/checkout-flow.js`, `assets/master-upgrade.js`, `assets/mobile-redesign.js`, `checkout.html`
**DB changes:** none.
**Validators:** `validate-c4-checkout-order-creation-after-coupon.mjs`, `validate-p1e4-*`, `validate-i2-*` (commerce paths touched must stay green).
**Risk:** medium (checkout page; no totals/pricing logic changes allowed).
**Acceptance:** no visual artifacts at any width; repriced state reads as warning; recommendation cards show one stock state; all commerce validators green.

## E2 — Membership: verification + account/admin integration
**Scope**
- DB1-gated live verification of `customer_membership_status` + `recalculate_customer_membership` + cron schedule (E2-01).
- Admin customers view: tier + lifetime spend + qualifying orders column (E2-02).
- Confirm 12-month rolling semantics / decide on expiry display.
**Files:** `assets/admin-customers.js`, `functions/api/admin/customers.js` (read-only additions)
**DB changes:** none expected (tables exist in migrations).
**Validators:** loyalty-related integration tests in `tests/local-integration.test.mjs`.
**Risk:** low (read paths; no checkout/pricing).
**Acceptance:** test order updates spend/tier; account overview matches ledger; admin can see a customer's tier.

## E3 — CRM/Brevo consent + sync architecture
**Scope**
- Wire Brevo contact upsert into bank-transfer completion (commerce-finalization) and/or a queued `brevo-sync` consumer; log to new `crm_sync_logs` (E3-01).
- Unsubscribe tokens + endpoint + email footer links; sync Brevo unsubscribes back (E3-03).
- Decide double-opt-in policy (E3-03).
- Segment extension: first_order, vip, interested_brand, abandoned_cart; birthday attribute sync (E3-04).
- Abandoned-cart model: `cart_sessions` snapshot + event + Brevo automation trigger (E3-02).
**Files:** `functions/api/_lib/brevo.js`, `functions/api/_lib/commerce-finalization.js`, `functions/api/newsletter/subscribe.js`, new `functions/api/newsletter/unsubscribe.js`
**DB changes:** yes — new `email_unsubscribe_tokens`, `crm_sync_logs`, `cart_sessions` (DB1 process: idempotent, additive, manual apply).
**Validators:** new `validate-e3-crm-consent-sync.mjs`; KVKK copy review for all new email/consent text (use copy-legal-brand standards).
**Risk:** medium (email deliverability + compliance; zero checkout-path risk if sync is post-finalization and failure-tolerant).
**Acceptance:** bank-transfer order → contact appears in Brevo with segments; unsubscribe link works end-to-end and persists to consent_records; no order flow blocked by CRM failures.

## QA1 — Playwright smoke automation
**Scope**
- Headless smoke suite (system Chrome / playwright-core): home, PLP, PDP, favorites, cart page, checkout, account gate — assert **zero console errors**, no horizontal overflow at 360/390, drawer opens with seeded 1/3/5-item carts without row collisions (bounding-box assertion), coupon box visible with items.
- Wire into pre-deploy checklist alongside static validators (this batch exists because C3's `cartHasItems` regression was invisible to grep-based validators).
**Files:** new `tests/smoke/` + `scripts/run-smoke.mjs`
**DB changes:** none.
**Risk:** low.
**Acceptance:** suite runs locally against static server (API-dependent checks tolerate 404s) and fails on any console error or drawer-collision regression.
