# COSMOSKIN — Audit Runbook (2026-07-11)

How to reproduce every audit finding and how to run the verification steps. Nothing in this runbook mutates data.

## 0. Environment
```bash
git status --short          # must be clean (except .wrangler/ and the 5 audit docs)
git log --oneline -5        # HEAD at aed0149 during audit
```
Static server (UI-only; `/api/*` will 404 — expected):
```bash
python3 -m http.server 7710   # from repo root
```
Full stack (only if you need `/api/*` locally):
```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

## 1. Reproduce the P0s

### 1.1 `cartHasItems` ReferenceError (UX3-01)
1. Open `http://127.0.0.1:7710/index.html`, DevTools console.
2. Add any product to the cart (or seed below) and click the cart icon.
3. Observe `ReferenceError: cartHasItems is not defined` repeating (~every 1.8 s), no coupon box, no recommendations in the drawer.
Static proof: `grep -n "cartHasItems" assets/*.js` → 6 call sites, zero definitions.
History: `git log --oneline -S "function cartHasItems"` → definition removed at `23f7c95` (C3).

### 1.2 Mini-cart row collision (UX3-02)
Seed a 3-item cart in the console, then open the drawer:
```js
const P = window.COSMOSKIN_PRODUCTS;
localStorage.setItem('cosmoskin_cart', JSON.stringify(P.slice(0,3).map((p,i)=>({id:p.slug,slug:p.slug,name:p.name,brand:p.brand,price:p.price,image:p.image,url:p.url,qty:i?1:2}))));
location.reload();
```
Measure: `document.querySelectorAll('#cartItems .cart-item')[0].getBoundingClientRect().height` → **78** while `.cart-drawer-premium__copy` inside it is 139–158 px. Visual: rows overlap.
Culprit rules: `assets/phase6-commerce.css:389` (`max-height:31dvh`), `:395–401` (`min-height:78px; align-items:center`), vs `:643` (C3 premium item).

### 1.3 Profile save wipes opt-ins (UX4-01)
Code path (no live account needed):
- `assets/account-dashboard.js:1211` — payload is only `first_name/last_name/phone[/birthday]`.
- `functions/api/account/profile.js:89–105` — upsert always writes `marketing_email_opt_in: normalizeBool(body.marketing_email_opt_in)` → `false` when absent; same for the other 3 flags; `metadata: {}`.
Live check (wrangler + real session): enable a switch in `?tab=notifications`, save; then save name in `?tab=profile`; reload summary → flags in `profiles` are false (DB1 SQL §2 has a detection query).

### 1.4 Isntree PDP add-to-cart blocked (E1-01)
```bash
grep -L "inventory-client" products/*.html    # → products/isntree-hyaluronic-acid-watery-sun-gel.html
```
Open that PDP on the static server, click "Sepete Ekle" → toast "Stok bilgisi doğrulanamadı…", item never added (`app.js` `cartStockCheck` returns `ok:false` without `window.COSMOSKIN_STOCK`).

## 2. Visual audit harness (Playwright + system Chrome, no browser download)
```bash
cd <scratchpad>/  # any temp dir
npm init -y && npm install playwright-core
node audit.mjs    # script archived in the audit session; drives http://127.0.0.1:7710
```
The script seeds 1/3/5-item carts, opens the drawer, screenshots home/PLP/PDP/cart/checkout/favorites/account at 360/390/1280, dumps console errors and a per-page horizontal-overflow probe. Re-usable as the QA1 seed.

Checks it encodes:
- overflow: `document.documentElement.scrollWidth > clientWidth` at 360 px (all pass today);
- console errors excluding `/api/*` 404s (fails today: `cartHasItems`);
- drawer collision: item rect height vs `__copy` child rect height.

## 3. Supabase verification (read-only, manual)
1. Open Supabase SQL editor (production project).
2. Paste sections of `COSMOSKIN_FULL_UX_COMMERCE_SUPABASE_AUDIT_SQL_VERIFICATION_QUERIES_20260711.sql` — every statement is SELECT-only.
3. Record results per section:
   - §1 missing tables → feeds DB1 migration list (watch `user_favorites`, `notifications`, `shipments`, `reviews*`, `support_requests`).
   - §2 profiles columns → gates UX4-02; the second query detects real customers hit by the opt-in wipe.
   - §3 favorites unique+RLS+duplicates → gates E1.
   - §4 membership RPC/levels/stale-tier probe → gates E2.
   - §5–6 CRM/reviews provenance; §7 P1E override sanity; §8 index coverage.
4. Do NOT run any DDL from this audit. All fixes go through new idempotent migrations (DB1 batch) with their own verification + rollback.

## 4. Production spot-checks (browser only, no writes)
- Checkout header artifact (UX5-01): open `https://www.cosmoskin.com.tr/checkout.html` at 1280 px — look for unstyled "COSMOSKIN"/badge fragments above the announcement bar (was reproducible locally in headless Chrome).
- Cookie banner overlap (UX0-01): fresh incognito visit → add item → open drawer before answering the banner; banner sits over the drawer CTA (desktop + 390 px).
- Drawer coupon box (UX3-01): with items in the cart, open the drawer — production should show "İndirim Kodu"; it will not while C-01 is live.
- Console: any `cartHasItems` errors on home/PLP/PDP confirm C-01 in prod.

## 5. Validator baseline (all static — run before/after any fix batch)
```bash
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-ux2-product-card-image-frame-standardization.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```
Note: these did not catch UX3-01 because they never execute pages — that is the QA1 batch's mandate.

## 6. Safety notes for the fix phases
- Never touch: `admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `admin-runtime.js/css` (RBAC guardrails doc).
- Commerce invariants: server-authoritative totals, `effective_price_try` payable, `compare_at_price_try` display-only, coupons on payable price, snapshots for old orders/refunds, stock-unknown ≠ unavailable at checkout.
- Migrations: idempotent, additive, nullable; manual production apply with verification + rollback plan.
