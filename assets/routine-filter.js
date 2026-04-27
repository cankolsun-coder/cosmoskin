/**
 * COSMOSKIN — Rutinler page filter
 *
 * Vanilla JS. No framework, no dependencies. Hooks into:
 *   - .routine-filter-bar  (the chip nav)
 *   - .routine-chip[data-filter="..."]   (the buttons)
 *   - .routine-card[data-routine="..."]  (the cards)
 *
 * Behavior:
 *   - Click a chip → set its `is-active` + aria-selected; remove from siblings.
 *   - Hide every card whose data-routine doesn't match the chosen filter.
 *   - "all" shows everything.
 *   - URL hash (#nem, #bariyer, #isilti, #gunduz, #aksam) sets the initial
 *     filter on first load so we can deep-link from elsewhere on the site.
 *   - Empty state appears when 0 cards match (defensive — currently never
 *     triggers since each filter has exactly one card, but keeps the
 *     component robust if cards are added later).
 */
(function () {
  const HASH_TO_FILTER = {
    '#nem': 'hydration',
    '#bariyer': 'barrier',
    '#isilti': 'glow',
    '#gunduz': 'day',
    '#aksam': 'night',
  };

  function init() {
    const bar = document.querySelector('.routine-filter-bar');
    if (!bar) return;
    const chips = Array.from(bar.querySelectorAll('.routine-chip'));
    const cards = Array.from(document.querySelectorAll('.routine-card[data-routine]'));
    if (!chips.length || !cards.length) return;

    const grid = document.querySelector('[data-routine-grid] .container');

    function apply(filter) {
      cards.forEach((card) => {
        const matches = filter === 'all' || card.dataset.routine === filter;
        card.toggleAttribute('hidden', !matches);
      });
      chips.forEach((c) => {
        const isActive = c.dataset.filter === filter;
        c.classList.toggle('is-active', isActive);
        c.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      // Update grid attribute so CSS can know the active filter (e.g. for
      // a single-card layout tweak).
      if (grid) grid.parentElement.setAttribute('data-active-filter', filter);
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const filter = chip.dataset.filter;
        apply(filter);
        // Update hash for deep-linking, without scrolling.
        const hashKey = Object.keys(HASH_TO_FILTER).find((k) => HASH_TO_FILTER[k] === filter);
        if (filter === 'all') {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        } else if (hashKey) {
          history.replaceState(null, '', hashKey);
        }
      });
    });

    // Initial state: prefer URL hash, fall back to "all".
    const initial = HASH_TO_FILTER[window.location.hash] || 'all';
    apply(initial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
