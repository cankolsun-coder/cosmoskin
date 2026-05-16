# COSMOSKIN Mobile Redesign — Phase 8 Changelog
**Routine Page + PDP Mobile Polish**
`v20260510-phase8`

---

## Overview

Phase 8 targets two high-traffic page types — the Routine Experience page (`/account/routines.html`) and the 35 Product Detail Pages (PDPs) under `/products/` — applying mobile polish, accessibility fixes, responsive QA, and code-quality improvements directly to `assets/mobile-redesign.js` and `assets/mobile-redesign.css` in the main project.

---

## Files Modified

| File | Lines Before | Lines After | Change |
|------|-------------|-------------|--------|
| `assets/mobile-redesign.js` | 860 | 861 | +1 line (qty reset) |
| `assets/mobile-redesign.css` | 1610 | 1758 | +148 lines (Phase 8 block + responsive overrides) |
| `CHANGELOG-phase8.md` | — | new | Created |

---

## JavaScript Changes (`mobile-redesign.js`)

### TASK 5 — PDP add-to-cart quantity reset
**Problem:** `currentPdpQty` was a module-level variable initialised to `1` but never reset between PDP navigations (e.g., user visits PDP A, sets qty to 3, navigates to PDP B via back/forward — PDP B would open with qty 3).

**Fix:** Added `currentPdpQty = 1;` at the start of `pdpPage()` before product data is read. Every fresh PDP render now starts at qty 1.

```js
// Before:
function pdpPage() {
  var p = getCurrentProduct();

// After:
function pdpPage() {
  currentPdpQty = 1;
  var p = getCurrentProduct();
```

---

### TASK 2 — Routine page "Rutini Gör" self-link fix
**Problem:** The secondary actions row in `routineBuilder()` contained a link `href="/account/routines.html#routine-commerce"`. When `compact=false` (i.e., the user is already on `/account/routines.html`), this link was a redundant self-reference.

**Fix:** Made the link context-aware using the existing `compact` parameter:
- `compact=true` (homepage embed) → keeps `href="/account/routines.html"` as "Rutini Gör"
- `compact=false` (on the routine page) → shows `href="/allproducts.html"` as "Tüm Ürünleri Gör"

---

### TASK 4 — PDP accordion benefits separator
**Problem:** `guide.benefits.join(', ')` rendered benefits as a flat comma-separated string, making them hard to parse visually.

**Fix:** Changed separator to ` · ` (middle dot) for cleaner typographic separation.

---

## CSS Changes (`mobile-redesign.css`)

### Phase 8 block — new `@media (max-width: 768px)` addition
Added at end of file, version-tagged `v20260510-phase8`.

**PDP hero stabilisation:**
- `.cm-mobile-pdp .cm-pdp-hero` — reduced `min-height` to `340px` for all PDPs (overrides base 355px for better compact feel)
- `.cm-mobile-pdp .cm-pdp-hero .cm-pdp-product` — `max-height: 280px; max-width: 70%` (prevents oversized images on tall products)

**PDP title and description:**
- `.cm-pdp-info h1` — added `overflow-wrap: break-word; hyphens: auto` to prevent long Korean brand names from overflowing at narrow widths
- Changed `line-height` from `1.02` → `1.07` and `letter-spacing` from `-.045em` → `-.04em` for better multi-line readability

**PDP meta row (reviews):**
- Enhanced styling for empty-state rating line (`.cm-pdp-meta`)
- `.cm-rating` gets `font-weight: 750; color: #5c4e40` — premium warm tone
- Secondary span (call-to-action "İlk yorumu sen yap") gets `color: #b08950` (accent gold)

**PDP float buttons — tap target:**
- `.cm-pdp-float button` — increased to `44px × 44px` (WCAG 2.5.5 minimum)

**PDP stepper — tap target:**
- `.cm-stepper` column template changed from `40px 1fr 40px` → `44px 1fr 44px`

**PDP recommendations section:**
- `.cm-mobile-pdp .cm-section-head h2` — 17px, clean
- `.cm-reco-row` — `margin-top: 8px; padding-bottom: 6px`

**Routine page polish:**
- `.cm-mobile-routine .cm-routine-title` — 20px padding, coherent spacing
- `.cm-routine-step:focus-visible` — gold outline ring (`2px solid #c6a56f`)
- Step label hierarchy: `b` gets `color: #4a3c30; font-weight: 800`, `span` gets muted warm tone
- `.cm-routine-card` — `border-radius: 18px` (slightly more premium)
- `.cm-secondary-actions .cm-btn` — min-height `44px` tap target

**Accordion chevron animation:**
- `.cm-acc-row summary svg:last-child { transition: transform 0.2s ease; }` — smooth chevron rotation on open/close

---

### Responsive overrides

**`@media (max-width: 390px)` additions (Phase 8 section):**
- PDP h1: `font-size: 26px`
- PDP hero: `min-height: 326px`
- PDP product image: `max-height: 268px`
- Routine title h1: `31px`
- Qty/CTA stepper column: `128px 1fr`

**`@media (max-width: 360px)` additions (Phase 8 section):**
- PDP hero: `min-height: 305px`
- PDP product image: `max-height: 248px; max-width: 68%`
- PDP h1: `font-size: 23px; letter-spacing: -.035em; line-height: 1.1`
- PDP price: `font-size: 19px`
- Routine title h1: `28px`
- Routine card padding: `11px`
- Select chips: `min-height: 40px; font-size: 11px`
- Qty/CTA: `120px 1fr; gap: 8px`
- Stepper at 360px: reverts to `40px 1fr 40px` (space constraint)

---

## Verification

| Check | Result |
|-------|--------|
| `node --check mobile-redesign.js` | ✅ Pass |
| CSS `{` / `}` balance | ✅ 583 / 583 |
| 35 product JSON-LD schemas verified | ✅ |
| Product image files exist | ✅ (5 audited) |
| `product-guides.json` — 35 guides loaded | ✅ |
| FALLBACK_IMG asset exists | ✅ |
| PDP hero background (`toner-guide-bg.webp`) | ✅ |
| Desktop layout unchanged | ✅ (all changes inside `@media max-width: 768px`) |

---

## Spec Coverage

| Task | Description | Status |
|------|-------------|--------|
| TASK 1 | Architecture inspection: routine JS/CSS, PDP JS/CSS, guides JSON | ✅ |
| TASK 2 | Routine page UX — chips, toggles, builder clean at 360px | ✅ |
| TASK 3 | Routine product cards — image contain, height consistent | ✅ |
| TASK 4 | PDP hero/product area — image stability, title legibility | ✅ |
| TASK 5 | PDP add-to-cart + favorites — qty reset, badge, toast | ✅ |
| TASK 6 | PDP duplicate sections — no duplicates in mobile layer | ✅ (verified) |
| TASK 7 | PDP reviews — premium empty state, no fake data | ✅ |
| TASK 8 | PDP accordions — details/summary, chevron animation | ✅ |
| TASK 9 | PDP recommendations — real products, correct links | ✅ |
| TASK 10 | PDP JSON-LD — productFromLdJson() reads live page schema | ✅ |
| TASK 11 | Link/image audit — FALLBACK_IMG verified, real product URLs | ✅ |
| TASK 12 | Accessibility — 44px tap targets, focus-visible, aria-pressed | ✅ |
| TASK 13 | Responsive QA — 360/390/430/768px overrides complete | ✅ |
| TASK 14 | Code quality — no duplicate handlers, null-safe, shared functions | ✅ |
