# COSMOSKIN — Project Rules for Codex

This is the COSMOSKIN premium Korean skincare e-commerce site. Production domain: https://www.cosmoskin.com.tr

## Identity
- Premium Korean skincare curation, Turkish-language store.
- Visual standard: minimal, elegant, calm, readable, trustworthy. Reference benchmarks: Aesop, Sephora, Apple.
- Brand palette: warm ivory `#fffdf9` / `#f8f0e7`, ink `#1a1510`, accent gold `#b58a4a`. Serif: Cormorant Garamond. Sans: Plus Jakarta Sans.
- Preserve existing header, footer, typography, and color palette. Don't redesign the brand.

## What NOT to do
- **Do not fabricate product data.** No fake INCI, fake reviews, fake orders, fake brands, fake prices. If real data is unverified, use the explicit fallback (see below).
- **Do not break desktop while fixing mobile.** Mobile is `max-width: 768px`. Desktop changes must be gated to `min-width: 769px` or unscoped only if intentional.
- **Do not create demo/scratch projects.** Modify the real files in this repo.
- **Do not add emojis to UI** unless the user explicitly asks. Use SVG icons in the existing thin-stroke style.
- **Do not create new MD reports unless asked** for a final deliverable. Use commit messages and the conversation.

## Real product data
- Source of truth: `products.json` (root) + `assets/products-data.js` (window.COSMOSKIN_PRODUCTS).
- PDP files in `/products/*.html` are pre-rendered; update product data via the source files.
- If a product's ingredient list cannot be verified from an official brand/retailer source, the PDP must show the explicit Turkish fallback: "İçerik bilgisi resmi kaynakla doğrulanmamıştır. Tam INCI listesi için ürün ambalajını veya markanın resmi sayfasını esas alın." Do not invent INCI strings.

## Skin profile state
- **Canonical localStorage key:** `cosmoskin_skin_profile`
- **Schema:** `{ skinType, sensitivity, primaryGoal, secondaryGoal, routineStyle, updatedAt }`
- **API:** `window.CosmoskinSkinProfile.get() / save(partial) / subscribe(fn) / clear()` — provided by `/assets/skin-profile-store.js`.
- Legacy keys (`cosmoskin_routine_profile`, `cosmoskin_routine_active`, `cosmoskin_routine_preferences`, `cosmoskin_pending_routine_preferences`) are still written by older modules; the store reads from them on first load and migrates into the canonical key.
- Any new consumer (account widget, recommendation engine, routine builder) must read via `CosmoskinSkinProfile.get()` and subscribe via `CosmoskinSkinProfile.subscribe()`.

## Routes
- `/account/routines.html` is THE canonical Rutinler page. All legacy aliases (`/routine.html`, `/rutinler.html`, `/collections/routine.html`) are 200-rewrites to it.
- Sub-views use query strings: `?view=profile|favorites|history|dashboard`. Rendered by `assets/routines.js`.
- Category dropdown links must point to real `/collections/*.html` files. Don't route categories to routines/account pages.
- Skin-type / skin-concern dropdowns should prefer dedicated concern pages where they exist: `/collections/hydration.html`, `/collections/sensitivity.html`, `/collections/pore-sebum.html`, `/collections/barrier.html`, `/collections/acne-balance.html`, `/collections/blemish.html`, `/collections/glow.html`.

## Mobile rendering
- `assets/mobile-redesign.js` + `assets/mobile-redesign.css` build a separate mobile DOM via `body.cm-mobile-active #cm-mobile-redesign-root`. Original desktop DOM is hidden under that class.
- Editorial hero on mobile homepage uses `/assets/img/home/mobile-hero-cosmoskin.png`. Text is HTML/CSS, not baked into the image.
- Footer is injected only on home & categories mobile pages. Other mobile pages rely on the fixed bottom-nav.

## Hard rules for every change
- **No broken hrefs.** No `href=""`, `href="#"` (unless intercepted by JS that prevents default), `href="javascript:`.
- **No text/button overflow.** Test at 360 / 390 / 430 / 768 / 1280 widths.
- **No horizontal scroll on mobile.** Common cause: full-width hero, fixed-px wide elements, unbounded grids.
- **No huge white space gaps.** Footer must dock at the page bottom via flex column, not via mountain padding.
- **No console errors in critical flows.** Home, category, PDP, cart, checkout, account, routines must be clean.
- **Account → Routines save must persist after refresh and sync across `/account/profile.html`, `/account/routines.html`, `/account/routines.html?view=profile`.**

## Verification
- Static checks: balance braces in CSS, parens in JS. Grep dead links.
- **Local server for static HTML/CSS/JS only:** `python3 -m http.server 7700 --directory .`. This does NOT serve `/api/*` — those are Cloudflare Pages Functions.
- **Local server for full account/checkout flow (needs `/api/*`):** `npx wrangler pages dev . --compatibility-date=2024-06-01`. Cloudflare Functions live in `/functions/api/...` and only run under wrangler. Without wrangler, `/account/profile.html` will fail to load `/api/account/summary` and the page will show the "Bilgiler şu anda yüklenemedi" error UI — that's expected, not a bug.
- For visual changes, test on Chrome DevTools mobile presets at 360 / 390 / 430 / 768.

## Script load order on account pages
- Any page that uses Supabase auth (account/profile.html, account/routines.html, etc.) MUST load in this order:
  1. `/assets/site-config.js` (defines `window.COSMOSKIN_CONFIG.supabaseUrl/anonKey`)
  2. `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
  3. `/assets/account-dashboard.js` (or the page-specific consumer)
- The skin profile store (`/assets/skin-profile-store.js`) should load early on any page that reads or writes profile state.
- `account-dashboard.js` reads `window.COSMOSKIN_CONFIG` lazily inside `init()`, so a late-loaded site-config still works — but the canonical order above is the contract.

## Reports & deliverables
- Final reports go in `/COSMOSKIN_*_REPORT_YYYYMMDD.md` only when a delivery is requested.
- Always list: changed files, created files, deleted files, deferred items with reason.
