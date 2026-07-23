# COSMOSKIN — MASTER Design System

> **Source of Truth.** This document codifies the *existing* COSMOSKIN identity. It does **not** redesign it.
> Every token below is extracted from shipped production code (`style.css`, `assets/cosmoskin-mobile-redesign-v1.css`) — not invented.
> When building any page, read this file first. Page-specific deviations live in `design-system/pages/<page>.md` and override this file only for that page.

- **Product:** Premium Korean skincare e-commerce, Turkish-language store.
- **Production:** https://www.cosmoskin.com.tr
- **Benchmarks:** Aesop · Sephora · Apple.
- **Design temperament:** low visual variance · subtle motion · spacious density · editorial luxury · mobile-first · conversion-focused.

Generated with the `ui-ux-pro-max` skill; substance reconciled against the live codebase (see [§12 Reconciliation](#12-reconciliation--what-the-generic-generator-got-wrong)).

---

## 1. Design Principles (the non-negotiables)

1. **Preserve the identity.** Header, footer, typography, and palette are fixed. Do not redesign the brand.
2. **Low visual variance.** One type family pair, one accent, one radius family, one shadow family. Repetition builds trust. A new page should look like it was always there.
3. **Spacious density.** Generous whitespace, calm rhythm, room to breathe. Never crowd. Whitespace *is* the luxury signal.
4. **Subtle motion.** Motion confirms, it never performs. 150–320ms, ease-out. Nothing bounces, nothing spins, nothing autoplays loudly.
5. **Trust before delight.** Readability, contrast, and clarity beat novelty. Calm > clever.
6. **Mobile-first commerce.** The mobile DOM is a first-class citizen (`body.cm-mobile-active`), not a shrunk desktop.
7. **No fabricated content.** No fake INCI, reviews, prices, brands. Use the documented Turkish fallback (see CLAUDE.md).
8. **SVG icons only, thin-stroke.** No emojis in UI.

---

## 2. Color

Warm-ivory / soft-sand base, matte-ink text, single muted-gold accent. Light theme only — there is no dark mode, and none should be added without an explicit brief.

### Core tokens (from `style.css :root`)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f6f0e9` | Page background — warm ivory |
| `--bg-2` | `#eee5d9` | Secondary background band — soft sand |
| `--surface` | `#faf7f3` | Raised surface / panels |
| `--card` | `#fffefb` | Cards, product tiles (near-white warm) |
| `--text` | `#16120e` | Primary matte ink |
| `--muted` | `#6a6059` | Secondary / helper text |
| `--line` | `rgba(22,18,14,.08)` | Hairline dividers |
| `--line-strong` | `rgba(22,18,14,.14)` | Emphasized dividers, input borders |
| `--beige` | `#e6ddd4` | Fill / chip background |
| `--beige-deep` | `#ddd0c1` | Deeper fill / hover |

### Accent — muted gold (use sparingly)

| Token | Value | Role |
|---|---|---|
| `--gold` | `#b08a5e` | Accent: active states, thin rules, emphasis |
| `--gold-light` | `#e4d3bc` | Soft gold wash |
| `--gold-subtle` | `rgba(176,138,94,.12)` | Gold tint background |

> **Gold discipline:** gold is a seasoning, not a sauce. Use it for a single accent per view — an active tab underline, a hairline, a small mark. Primary CTAs are ink-on-ivory, **not** gold-filled. Never gold on gold.

### Ticker / dark band (the only "dark" surface)

| Token | Value |
|---|---|
| `--ticker-bg` | `#0d0b09` |
| `--ticker-text` | `rgba(255,255,255,.78)` |
| `--ticker-accent` | `#c9a97a` |

### Glass / lift (mobile & overlays)

| Token | Value |
|---|---|
| `--page-shell` | `rgba(255,253,250,.68)` |
| `--glass-strong` | `rgba(255,255,255,.74)` |
| `--glass-line` | `rgba(22,18,14,.06)` |

### Semantic status (commerce)
Derive from context; keep muted and warm-compatible. Use ink for neutral, `--gold` for "active/selected," a restrained green/amber/red only for order-state semantics (success / pending / error) — never saturated. Color is never the *only* signal (pair with icon + text) per accessibility rule.

**Contrast:** `--text` on `--bg`/`--card` clears 4.5:1 comfortably. `--muted` (`#6a6059`) on `--bg` is the floor for body/help text — do not lighten muted text further. Gold text on ivory fails contrast for body copy → use gold for **decoration and large display only**, never small body text.

---

## 3. Typography

Two families, already loaded site-wide. Do not introduce a third.

- **Serif (display / editorial):** `--serif` → `'Cormorant Garamond', 'Georgia', serif`
  Weights loaded: 300 / 400 / 600 (+ italics 300/400). Used for hero headlines, section titles, product names, editorial voice.
- **Sans (UI / body / commerce):** `--sans` → `'Plus Jakarta Sans', system-ui, sans-serif`
  Weights loaded: 400 / 500 / 600 / 700. Used for body, buttons, labels, prices, forms, nav.

Google Fonts (already in `<head>`, do not change):
```
Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400
Plus+Jakarta+Sans:wght@400;500;600;700
```

### Type scale (fluid, from shipped `clamp()` values)

| Role | Family | Size (`clamp`) | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Display / Hero | Serif | `clamp(52px, 6.4vw, 92px)` | 300–400 | `-.01em` | Home & PDP heroes |
| Page title | Serif | `clamp(40px, 4.5vw, 58px)` | 400 | `-.01em` | Collection / section H1 |
| Section heading | Serif | `clamp(36px, 4vw, 54px)` | 400 | `-.01em` | |
| Subsection | Serif | `clamp(24px, 2.8vw, 34px)` | 400–600 | `0` | Card heads, PDP detail |
| Eyebrow / overline | Sans | `12–14px` | 500–600 | `.18em–.32em` UPPERCASE | The signature COSMOSKIN label style |
| Body large | Sans | `clamp(17px, 1.35vw, 19px)` | 400 | `0` | Lead paragraphs |
| Body | Sans | `16px` (min on mobile) | 400 | `0` | Line-height 1.6–1.75 |
| Small / meta | Sans | `13–14px` | 400–500 | `.01em` | Captions, help |
| Button label | Sans | `13–15px` | 600 | `.08em–.14em` often UPPERCASE | |
| Brand wordmark | Serif/Sans | `clamp(16px, 4.8vw, 20px)` | 500 | `.24em` | Logotype tracking |

### Tracking rules (letter-spacing is core to the brand)
- **Serif display:** slightly tight, `-.01em`.
- **Uppercase eyebrows / labels / buttons:** wide, `.08em`–`.32em`. This wide-tracked uppercase sans over tight serif is the COSMOSKIN signature — keep it.
- **Body:** default `0`.

### Line-height & measure
- Body `1.6–1.75`. Display `1.05–1.15`. Measure capped at **65–75ch** for reading columns.

---

## 4. Spacing & Layout

- **Container:** `--container: 1240px`. Keep one max-width; don't mix.
- **Spacing scale (8-based, spacious):** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128`px. Section vertical rhythm skews large (64–128px on desktop) — this is the "spacious density" mandate. Compress proportionally on mobile, never to the point of crowding.
- **Grid:** 12-col desktop; product grids 2-up mobile / 3–4-up desktop. Gutters ≥ 16px mobile, 24–32px desktop.
- **Footer docks at page bottom** via flex column — no "mountain padding" gaps (hard rule).
- **Mobile breakpoint:** `max-width: 768px`. Desktop-only changes gate to `min-width: 769px`. Test at **360 / 390 / 430 / 768 / 1280**.
- **No horizontal scroll on mobile.** Watch full-width heroes, fixed-px widths, unbounded grids.

---

## 5. Shape, Elevation & Effects

### Radius (from `:root`)
| Token | Value | Use |
|---|---|---|
| `--radius` | `26px` | Cards, hero panels, large surfaces |
| `--radius-sm` | `16px` | Buttons, inputs, chips, media |
| `--radius-xs` | `10px` | Small tags, tight controls |

Pill radius (`999px`) only for chips/toggles. One radius family — don't invent new corner sizes.

### Shadow (soft, warm, low-contrast — from `:root`)
| Token | Value | Use |
|---|---|---|
| `--shadow-card` | `0 2px 12px rgba(18,13,8,.05)` | Resting cards |
| `--shadow-soft` | `0 8px 28px rgba(18,13,8,.06)` | Hover lift, popovers |
| `--shadow` | `0 20px 72px rgba(18,13,8,.09)` | Modals, mini-cart |
| `--shadow-premium` | `0 28px 96px rgba(18,13,8,.12)` | Hero / feature emphasis |
| `--shadow-lift` | `0 22px 58px rgba(18,13,8,.08)` | Mobile floating shells |

Shadows are warm-tinted (brown-black `rgba(18,13,8,…)`), never neutral grey, never harsh. Prefer hairline borders (`--line`) + a soft shadow over heavy elevation.

### Effects discipline
- Backdrop blur reserved for the fixed header, mini-cart, and mobile shells (glass tokens). Don't scatter blur.
- **No** iridescence, chromatic aberration, "liquid glass," or morphing. (Explicitly rejected — see §12.)

---

## 6. Motion

Subtle, confirming, fast.

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(.2, .8, .2, 1)` — the default for everything |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` — sparing, small overshoot only (e.g. add-to-cart tick) |

- **Micro-interactions:** 150–220ms. **Transitions / reveals:** 240–320ms. Nothing over ~400ms.
- Animate `transform` / `opacity` only (never `width`/`height`/`top`).
- **Hover:** color / opacity / shadow shifts — **no scale transforms that shift layout**.
- Scroll reveals: gentle fade + ≤8px rise, staggered ≤60ms. Once, not on every scroll.
- **Respect `prefers-reduced-motion: reduce`** — drop transforms, keep instant state changes.

---

## 7. Core Components (behavioral contract)

Match existing implementations; do not restyle globally.

- **Buttons**
  - *Primary:* ink fill (`--text`) on ivory, or ivory/outline depending on context; sans 600, wide tracking, `--radius-sm`. **Not gold-filled.** Min height 44px (touch target). Disable + show progress during async (`loading-buttons`).
  - *Secondary:* hairline outline (`--line-strong`) on transparent/`--surface`.
  - *Text/link:* underline on hover, gold hairline accent allowed.
- **Product card:** `--card` surface, consistent image frame (fixed aspect-ratio + `object-fit`), serif product name, sans price row. Sale price = current bold + compare-at struck muted. Equal card heights in a grid. (See `cosmoskin-product-card-audit` skill for the detailed contract.)
- **Inputs / forms:** `--surface`/`--card` fill, `--line-strong` border, `--radius-sm`, 16px text (prevents iOS zoom). Always a real `<label for>`. Error message adjacent to the field, not just color.
- **Header:** fixed, glass. Do not remove or restructure. Editorial nav; category dropdowns point to real `/collections/*.html`.
- **Mini-cart:** slide-over, `--shadow`, glass shell. Includes recommendations.
- **Footer:** injected on home & category mobile pages; other mobile pages use the fixed bottom-nav.
- **Ticker / announcement bar:** the dark band (`--ticker-*`).
- **Badges/chips:** `--beige`/`--gold-subtle` fill, uppercase micro-label.

---

## 8. Accessibility (CRITICAL — gate every change)

- Contrast ≥ 4.5:1 body / 3:1 large. `--muted` is the lightest permissible text.
- Visible focus rings on all interactive elements (keyboard nav order = visual order).
- Icon-only buttons need `aria-label`. Meaningful images need alt text; Turkish copy.
- Touch targets ≥ 44×44px.
- Color never the sole signal (pair with icon/text) — matters for order states & sale flags.
- Forms: `<label for>`, inline errors, no placeholder-as-label.
- No console errors in critical flows (home, category, PDP, cart, checkout, account, routines).

---

## 9. Content & Voice

- Turkish-language, premium, calm, precise. Benchmarks: Aesop's editorial restraint.
- See skills: `cosmoskin-copy-legal-brand` (copy), and CLAUDE.md for the INCI fallback string.
- Numerals/prices: Turkish formatting. Never fabricate data.

---

## 10. Conversion UX (calm, not pushy)

- One clear primary action per view; secondary actions visually subordinate.
- Trust signals (guarantee, shipping, authenticity) shown quietly near CTAs, not shouted.
- Checkout: linear stepper, progress obvious, no surprise costs late. Persist cart/skin-profile.
- Scarcity/urgency only if **true** (real stock counts) — never fabricated countdowns.
- Recommendations (mini-cart, PDP) feel curated, not aggressive.

---

## 11. Verification (before shipping any page)

- [ ] Uses only the two brand fonts and palette tokens above — no new fonts/colors.
- [ ] Visual variance low — reads as part of the existing site.
- [ ] Spacious rhythm preserved; footer docks; no white-space chasm.
- [ ] No emojis as icons (thin-stroke SVG only).
- [ ] `cursor-pointer` + smooth 150–300ms hover on all interactives; no layout-shifting hover.
- [ ] Contrast ≥ 4.5:1; `--muted` floor respected; gold not used for small body text.
- [ ] Visible focus states; touch targets ≥ 44px.
- [ ] `prefers-reduced-motion` respected; motion ≤ ~400ms, ease-out.
- [ ] Responsive & no horizontal scroll at 360 / 390 / 430 / 768 / 1280.
- [ ] No broken hrefs (`""`, `#` w/o JS, `javascript:`); no console errors in critical flows.
- [ ] Skin-profile / cart state persists across refresh where relevant.

---

## 12. Reconciliation — what the generic generator got wrong

The `ui-ux-pro-max --design-system` generator, unaware of the brand, proposed generic "luxury e-comm" defaults. These were **overridden** to preserve the COSMOSKIN identity:

| Generator suggested | COSMOSKIN uses (kept) | Why |
|---|---|---|
| Playfair Display + Inter | **Cormorant Garamond + Plus Jakarta Sans** | Existing brand fonts, already loaded. Do not introduce Playfair/Inter. |
| "Liquid Glass" style (morphing, iridescent, chromatic aberration) | **Editorial luxury, low-variance, matte** | Liquid glass is high-motion, poor a11y/perf — opposite of calm/trustworthy. |
| CTA gold `#CA8A04` (saturated) | **`--gold #b08a5e` (muted), used as accent not CTA fill** | Warm muted gold; primary CTA is ink-on-ivory. |
| Background `#FAFAF9` (cool near-white) | **`--bg #f6f0e9` warm ivory / `#eee5d9` soft sand** | Warmth is core to the brand. |
| Text `#0C0A09` (neutral black) | **`--text #16120e` warm matte ink** | Warm-black, matches ivory ground. |
| 400–600ms fluid animations | **150–320ms, ease-out, subtle** | Subtle-motion mandate. |

**What was adopted from the generator:** the *Minimal Single Column / spacious-whitespace* structural pattern, the pre-delivery a11y checklist, and the anti-patterns to avoid ("vibrant & block-based," "playful colors") — all consistent with the existing identity.

---

## 13. How to use this system

### Page overrides (check before building a page)
| Page | File | Deviation from MASTER in one line |
|---|---|---|
| Home | `design-system/pages/home.md` | Moderate density; dual DOM (desktop `index.html` / mobile `homePage()`); hero must not push commerce below fold; one purpose per section; LCP-protected hero |
| Collection / Catalog | `design-system/pages/collection.md` | Densest surface (2-up mobile / 3–4-up desktop); sans-led controls, selective serif h1; filters never out-width grid; SEO prose at bottom; controlled faceted URLs |
| PDP | `design-system/pages/pdp.md` | Most editorial/spacious; serif-led; sticky mobile add-to-cart; INCI fallback enforced |
| Checkout | `design-system/pages/checkout.md` | Tightest density; sans-led utility; motion only on step changes; all costs before CTA |

New page override? Add a row here and create `design-system/pages/<page>.md`. See `design-system/pages/README.md` for the override rules and skeleton.

### Rules
1. Building a page? Check `design-system/pages/<page>.md` first. If it exists, its rules override this file for that page. Otherwise use this MASTER exclusively.
2. Never hardcode hex values that duplicate a token — reference the CSS custom property.
3. Never modify production files as part of "adopting" this doc — this is a reference/governance artifact. Changes to `style.css` etc. require their own task and the relevant COSMOSKIN skill (`cosmoskin-premium-ui-audit`, `cosmoskin-product-card-audit`).
4. When in doubt, choose the calmer, lower-variance option.

*Last generated: 2026-07-23 · Do not redesign the identity.*
