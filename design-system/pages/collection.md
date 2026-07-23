# Collection / Catalog — Overrides on MASTER

**Job of this page:** let users scan, filter, and compare products efficiently while keeping COSMOSKIN's premium calm. Product-first, not decoration-first. Category/brand/skin-need context must be instantly legible; SEO supported without burying products.

**Inherits:** all tokens, fonts, palette, motion, a11y from `../MASTER.md`. Deviations & page-specific rules below only.

**Two collection surfaces (both shipped — respect both):**
- **Static per-collection pages** `/collections/*.html` — rendered by `collection-renderer.js` into `.dynamic-product-grid[data-*-slug]`. Lightweight **filter chips only** (`.filter-row[data-filter-wrap]` + `.filter-chip`), client-side show/hide, **no URL writes**.
- **Master catalog** `/allproducts.html` — `allproducts.js`: full sort sheet + multi-facet filters + load-more + URL sync. Mobile filter/sort sheets (`data-cm-open-filter` / `data-cm-open-sort`).
Apply the density/card/stock rules to both; the filter-architecture and SEO-URL rules mainly govern `/allproducts.html`.

## Density — denser than PDP, calmer than a mass marketplace
- Grid is the hero. Product grids: **2-up mobile / 3–4-up desktop** (`.product-grid`, `.dynamic-product-grid`, mobile `.cm-product-grid`). Tighter gutters than PDP (≥16px mobile, 24–28px desktop) but never crammed. Equal card heights across the row.

## Heading & category introduction
- Concise intro only: `.page-hero > .container.narrow` → `p.kicker` (context label, e.g. `Marka` / `Cilt İhtiyacı`) + `h1` + one-line `<p>` subtitle. **Serif h1 is allowed here** (selective editorial touch); everything else sans.
- Keep the intro to a heading + one sentence **above** the grid. Longer SEO prose goes to the bottom (see SEO placement) so products aren't pushed down.

## Breadcrumb behavior
- `BreadcrumbList` structured data is present across collection pages — preserve it. If a visible breadcrumb is shown, keep it a single quiet sans line (muted, `.kicker`-scale) above the h1: `Ana Sayfa › <Kategori>`. Breadcrumb is navigation/SEO, never a decorative element.

## Product count & sorting hierarchy
- Product count via `[data-collection-count]` → `"N ürün"` (already wired, with `aria-label` "N ürün listeleniyor"). Show it near the grid top; keep it muted/secondary.
- Sort (`/allproducts.html`): `data-cm-open-sort` toggle → `sortLabel` / `sortSheet` / `sortList`. Default `featured` (uses `sortScore`: best-seller 1000 › editor-pick 500 › new 250). Sort control is compact and subordinate to the grid — a labeled button/sheet, not a loud bar.

## Filter architecture
- Facets in `allproducts.js`: `category, brand, concern, texture, ingredient, feature, price(min/max), q`. `getSelectedCount()` surfaces active-filter count — keep that affordance so users can see/clear state.
- Filters **must not dominate the grid.** Desktop: a restrained left rail or a filter button opening a panel — the product grid keeps the majority of width. Never a filter column wider than the products.
- Static `/collections/*.html`: keep the simple `.filter-chip` row (`data-filter="all"` = `Tümü` default active). Chips are quick client-side narrowing, not a full facet system — don't bolt URL params onto them.

## Mobile filter interaction
- Filters/sort open as **bottom sheets** (`data-cm-open-filter` / `data-cm-open-sort`, `.cm-filter-category/brand/concern/skin/stock`) over the grid — glass shell (`--glass-strong` + `--shadow-lift`), dismissible, ≥44px targets. Apply/clear actions explicit. Grid stays visible/scrollable behind; sheet never permanently occupies the viewport.

## Product card consistency
- **Identical card contract to home/PDP** — do not fork. `.product-card` → `.product-media-wrap` (`.product-media` fixed frame + `object-fit`, `.badge` = brand, `.favorite-btn` with `aria-pressed`) → `.product-body` (`.brandline`, `h3`, optional `<p>` desc / `.meta-note`, `.price-row`). Mobile `productCard()` → `.cm-add-cart`, `.cm-stock-line`.
- Add-to-cart `.btn.btn-primary[data-add-cart]` "SEPETE EKLE" — ink fill, never gold. One primary action per card.

## Badges & stock states
- `.badge` carries the **brand**, not a discount claim. Stock via `COSMOSKIN_STOCK.loadInventory()` → `.cm-stock-badge` / `.cm-stock-line`. Stock text must reflect real inventory — low-stock only when true. No fake "son X adet" / "tükeniyor" urgency.

## Price presentation
- Via `COSMOSKIN_PRICE_DISPLAY.renderPriceHtml` → `.cs-price` / `.cs-price__current`, with `.price-note` "KDV dahil". Sale = current bold + compare-at struck muted; discount stated quietly (no loud red). **Never fabricate a compare-at/discount** — only render sale UI when a real override exists.

## Pagination / load-more
- `/allproducts.html` uses **load-more** (`LoadMore`) — preserve; it keeps context and scroll position over numbered pages. Reserve space / avoid layout jump as items append. Button is secondary style, ≥44px, disabled+busy state while loading.

## SEO content placement
- Long category prose / FAQ sits at the **bottom** (`section.section.faq-section > .container.narrow > p.kicker "Sipariş Öncesi"`), after the grid — never a wall of text above products.
- Preserve the shipped **self-referencing, param-less `<link rel="canonical">`** and `robots: index, follow` on both `/allproducts.html` and `/collections/*.html`.

## Internal linking
- Grid tiles link to real PDPs (`/products/*.html`); "see all" / related links point to real `/collections/*.html`, `/brands.html`, `/categories.html`. No `href=""`/`#`/`javascript:`. Cross-link related concerns/brands quietly at the bottom, not as decoration.

## Empty states
- Static pages: `.collection-empty` — honest Turkish message + a route out (`Tüm ürünleri keşfet` → `/allproducts.html`). Catalog mobile: `.cm-empty-state`. Never show fake/placeholder products to fill a grid.

## Accessibility
- Filter/sort sheets: focus-trapped while open, `Esc` closes, focus returns to the trigger; toggles expose state (`aria-expanded`/`aria-pressed`). Count has `aria-label` (already wired). Cards keyboard-reachable, visible focus. Icon buttons `aria-label` in Turkish. Contrast ≥4.5:1.

## Performance
- Product images `loading="lazy"` + width/height (cards already set 400–420²) to prevent CLS as the grid/append renders. Filtering is client-side show/hide — keep it cheap; avoid re-rendering the whole grid on every keystroke. No console errors (collection is a critical flow).

## Responsive behavior
- Mobile grid must stay readable at **360 / 390 / 430** (2-up, no overflow, no clipped prices/titles). `max-width:768px` mobile sheets; `min-width:769px` desktop rail. Verify 360 / 390 / 430 / 768 / 1280. No page-level horizontal scroll.

## Do NOT
- Introduce new colors/fonts/radii outside MASTER, or a collection-only card variant.
- Let filters/sort dominate or out-width the product grid.
- Show fabricated discounts, compare-at prices, ratings, or scarcity/urgency.
- Push products far below the fold with a large intro/SEO text block.
- Generate uncontrolled indexable URL permutations: keep filter/sort in `history.replaceState` (never `pushState`), and keep the param-less canonical so faceted URLs collapse to the clean page.
- Ship English-facing customer copy — all customer text is Turkish.
