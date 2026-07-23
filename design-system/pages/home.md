# Home — Overrides on MASTER

**Job of this page:** state COSMOSKIN's premium Korean-skincare positioning in the first viewport, then route users into brands / skin needs / routines / bestsellers — building trust without clutter, discovery without a marketplace feel. Mobile is the primary surface.

**Inherits:** all tokens, fonts, palette, motion, a11y from `../MASTER.md`. Deviations & page-specific rules below only.

**Two DOMs (both shipped — respect both):**
- **Desktop** = `index.html` static sections (`.section.reveal`, container `1240px`).
- **Mobile** = `body.cm-mobile-active` → `mobile-redesign.js` `homePage()` builds `.cm-mobile-home`. The original desktop DOM is hidden. Edit the mobile experience through the mobile builder, not by shrinking desktop.

## Content hierarchy (order is deliberate — do not reshuffle or duplicate purpose)
Desktop `index.html` → mobile `homePage()` equivalents:
1. **Hero** — `.home-hero--premium` (#homeHeroTitle) / `.cm-hero-editorial` (#cmHomeHeroTitle)
2. **Brands** — `.brand-ribbon` (#brand-strip) / `brandStrip()` `.cm-brand-bar`
3. **Shop by Need** — `.concern-section` (#concerns) / `.cm-concern-grid` of `.cm-concern-tile` (`GOAL_ROUTES`)
4. **Bestsellers** — `.bestsellers-premium` (#bestsellers) / `.cm-product-grid--home` (#cm-mobile-bestsellers)
5. **Smart Routine** — `.smart-routine` (#smart-routine) / `.cm-routine-teaser`
6. **COSMOSKIN Edit / editorial** — `.cs-spotlight` (#spotlight) + `.cs-curation` (#brands) / "Editörün Seçtikleri" grid
7. **Trust / assurance** — `.assurance-section` (#guvence) / `trustStrip()`
8. **FAQ** — `.faq-section--premium` (#faq) / `faqSection()` `.cm-faq-item`
9. **Newsletter / Club** — `.footer-newsletter` (#csNewsletter)

One section = one commercial purpose. **Do not add a second bestsellers/brands/needs block** with the same job.

## Hero composition
- Serif proposition, wide-tracked uppercase eyebrow (mobile: `KORE CİLT BAKIMI · COSMOSKIN SEÇKİSİ`). Keep the three-line editorial title pattern (`__line`, `__line--accent` in gold, `__line--story`).
- **Exactly two CTAs, ranked:** primary → shop (`ALIŞVERİŞE BAŞLA` → `/allproducts.html`, ink fill `.cm-btn--primary`); secondary → discover (`RUTİNİNİ KEŞFET` → `/account/routines/`, `.cm-btn--ghost`). Primary is never gold-filled.
- **Hero must not push commerce below the fold.** On mobile the hero + first discovery affordance (search + a shop path) share the first viewport; brand/need/bestseller entry is reachable within one short scroll. No full-screen hero.

## Mobile-first section rhythm & density
- Moderate density — spacious but **not empty**. Home sits *between* PDP (most spacious) and checkout (tightest). Section gaps on mobile ~`32–48px`; desktop `.section` rhythm may open to `64–96px` but never leave a white-space chasm.
- Every section led by `sectionHead()` (`.cm-section-head` + `.cm-see-all` "Tümünü Gör" link) so each block has a title and an escape hatch into a fuller collection.

## Typography emphasis
- Serif for hero + section titles (editorial voice). Sans for eyebrows, CTAs, prices, nav, trust copy. No third font. Prices sans 600 with `KDV dahil` note (`.price-note`).

## Product discovery patterns
- Discovery is **curated, finite sets** (4-up bestseller/editor grids), each with a "see all" into `/allproducts.html`, `/collections/*.html`, or `/categories.html`. Never render the full catalog on home.
- Reuse the shared product card verbatim (`.product-card`/`.cs-product-card` → `.product-body` → `.brandline` → `h3` → `.price-row`; mobile `productCard()` with `.cm-add-cart`, `.cm-stock-line`). Do not fork a home-only card style.
- `GOAL_ROUTES` / `CATEGORY_ROUTES` tiles link to real concern/category pages (per CLAUDE.md: concern tiles prefer dedicated `/collections/<concern>.html`). No category routed to account/routines.

## Image behavior (LCP-critical)
- Mobile hero (`/assets/img/home/mobile-hero-cosmoskin.webp`, 941×1672) is the LCP: keep `loading="eager"`, `fetchpriority="high"`, `decoding="async"`, and **explicit width/height** (reserve space — no layout shift). Text stays HTML/CSS, never baked into the image.
- All other media `loading="lazy"` with width/height set. Product images use the shared fixed frame + `object-fit`.

## CTA hierarchy
- One primary action per section (hero shop CTA is the page's dominant action). Section "see all" links are tertiary/quiet. Add-to-cart on home cards is secondary to browsing — present, not shouted.

## Trust placement
- Trust is quiet and woven in (`trustStrip()` after the hero; `.assurance-section` deeper) — authenticity, shipping, guarantee as thin-stroke SVG + short Turkish labels. Reassure between discovery, don't interrupt with a loud banner.

## Club integration
- COSMOSKIN Club / newsletter (`.footer-newsletter`, #csNewsletter) sits at the page foot as a calm membership invitation — a single email field + one CTA, muted framing. Not a modal, not an interstitial, not repeated mid-page.

## Motion limits
- Low-to-moderate. `.reveal` = one-time gentle fade + ≤8px rise, ease-out, staggered ≤60ms. **Limit simultaneous animations** — never animate a whole grid at once on mobile; reveal per section as it enters. No carousel autoplay, no parallax, no floating/decorative motion. Respect `prefers-reduced-motion`.

## Mobile interaction rules
- Header, search, and `bottomNav('home')` are the fixed chrome — do not remove or restyle globally. Bottom-nav items ≥44px touch targets.
- No horizontal scroll at 360 / 390 / 430. Brand strip may scroll horizontally **only** as an intentional, contained `overflow-x` rail — never leak page-level horizontal scroll.
- Footer injected on mobile home (per CLAUDE.md) and docks at bottom — no mountain padding.

## Conversion priorities
1. Communicate positioning (hero) → 2. Offer an immediate shop/discover path → 3. Surface curated bestsellers → 4. Route by skin need → 5. Warm trust + Club. Keep the funnel calm; no fabricated urgency, countdowns, or fake "popüler" claims (badges like `Popüler`/`Bestseller` must reflect real bestseller data, e.g. the curated bestseller slug list).

## Accessibility
- Each section `aria-labelledby` its heading (pattern already in `index.html`/`homePage()`). Icon-only controls need `aria-label` (Turkish). Hero image alt describes the curation, in Turkish. Contrast ≥4.5:1; gold only decorative/large.

## Performance constraints
- Hero LCP protected (above). Defer non-critical section media via lazy-load. Avoid stacking blur — glass is for header/mini-cart/shells only. No console errors (home is a critical flow).

## Responsive behavior
- `max-width:768px` → mobile DOM; `min-width:769px` → desktop sections. Verify both at 360 / 390 / 430 / 768 / 1280. Desktop edits gate to `min-width:769px`; do not break desktop to fix mobile.

## Do NOT
- Introduce new colors/fonts/radii outside MASTER, or a home-only product card.
- Make the hero full-screen or push all commerce below the fold.
- Add a carousel that hides essential content, or autoplaying/decorative motion.
- Duplicate sections with the same commercial purpose (two bestsellers, two brand rails, etc.).
- Ship English-facing customer copy — all customer text is Turkish.
- Use gradients-as-decoration, floating cards, or scattered glass effects.
- Bake hero text into the image, or drop the hero's explicit width/height (causes CLS).
