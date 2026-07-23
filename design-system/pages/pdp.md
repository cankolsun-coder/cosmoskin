# PDP (Product Detail) — Overrides on MASTER

**Job of this page:** make one product feel considered and trustworthy, then convert calmly. This is the **most editorial** commerce page — lean into serif, imagery, and whitespace — while keeping "Add to cart" always within reach.

**Inherits:** all tokens, fonts, palette, motion, a11y from `../MASTER.md`. Deviations below only.

## Deviations from MASTER

### Density — most spacious of the commerce pages
- Push the generous end of the rhythm (section gaps `64–96px` desktop). Give the product image room; whitespace signals premium.
- Layout: `pdp-columns` — media left, buy-box right on desktop; stacked on mobile with the **buy box / price / add-to-cart pinned or quickly reachable** (sticky add-to-cart bar on mobile scroll is encouraged, using `--glass-strong` shell + `--shadow-lift`).

### Type — editorial is the point here
- Product name: **serif (Cormorant Garamond)**, `clamp(24px, 2.8vw, 34px)` (matches shipped `.pdp-detail-card__head h3`), tight `-.01em`.
- Brand / eyebrow above the name: wide-tracked uppercase sans (`.18em`), muted — the COSMOSKIN signature label.
- Body / ingredient copy / specs: sans, `1.6–1.75` line-height, measure ≤ 70ch.
- Price: sans 600, high contrast. Sale = current bold + compare-at struck muted; discount framed quietly (no loud red slash).

### Components (match shipped classes)
- **Media:** consistent aspect-ratio frame, `object-fit`, `--radius`. Gallery thumbnails share the same frame. Alt text in Turkish, descriptive.
- **Buy box:** name → short editorial description → price → variant/quantity → **primary "Sepete ekle"** (ink fill, ≥44px, wide-tracked). One primary action. Add-to-cart may use the sparing `--ease-spring` tick on success; nothing else bounces.
- **`pdp-detail-grid` / `pdp-spec-grid`:** calm two-column key/value; muted labels, ink values, hairline (`--line`) separators.
- **`pdp-accordion`:** İçerik (INCI), Kullanım, Kargo & İade. Collapsed by default, one-at-a-time optional. Chevron is thin-stroke SVG; rotate ≤200ms ease-out.
- **INCI / ingredients:** if unverified, show the exact Turkish fallback from CLAUDE.md verbatim. **Never fabricate INCI, reviews, or claims.**
- **`pdp-detail-note`:** quiet reassurance (authenticity, shelf-life) — muted, not shouted.
- **Recommendations / routine cross-sell:** curated feel, MASTER product-card contract, generous spacing; not an aggressive grid.

### Motion
- Gentle image fade-in and one-time scroll reveals (≤8px rise, ≤60ms stagger). Gallery swaps cross-fade ≤240ms. No parallax, no zoom-on-hover that shifts layout (hover may brighten/soft-shadow only).

### Conversion rules
- Trust signals (guarantee, authentic-Korean-import, shipping ETA) sit near the CTA, quietly.
- Real stock/low-stock only — never fabricated countdowns or "X people viewing."
- Reviews only if real; otherwise omit the module entirely rather than fake it.
- Skin-profile-aware suitability hints allowed **only** via `COSMOSKINSkinProfile.get()` (canonical store) — never invented "for your skin" claims.

## Do NOT
- Introduce new colors/fonts/radii outside MASTER.
- Make "Sepete ekle" gold-filled.
- Fabricate INCI, ratings, review counts, or brand copy.
- Let editorial spacing push the add-to-cart out of reach on mobile.
