/**
 * COSMOSKIN — Collection Renderer
 * Renders product cards dynamically from COSMOSKIN_PRODUCTS.
 * Reads data-category-slug attribute on .dynamic-product-grid.
 * Replaces hardcoded HTML with live data.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(value) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') {
      return window.COSMOSKIN_FORMAT_PRICE(value);
    }
    return '₺' + String(value || 0);
  }

  function buildCard(p) {
    if (typeof window.COSMOSKIN_RENDER_PRODUCT_CARD === 'function') {
      return window.COSMOSKIN_RENDER_PRODUCT_CARD(p, {
        description: p.description || '',
        filterTokens: []
          .concat(Array.isArray(p.concernSlugs) ? p.concernSlugs : [])
          .concat([p.categorySlug, p.brandSlug].filter(Boolean))
      });
    }
    return [
      '<article class="product-card" data-filter-item="' + esc([
        p.categorySlug,
        p.brandSlug
      ].concat(Array.isArray(p.concernSlugs) ? p.concernSlugs : []).filter(Boolean).join(' ')) + '">',
        '<div class="product-media-wrap">',
          '<a class="product-media" href="' + esc(p.url) + '">',
            '<img alt="' + esc(p.name) + '" src="' + esc(p.image) + '" loading="lazy" width="400" height="400"/>',
            '<span class="badge">' + esc(p.brand) + '</span>',
          '</a>',
          '<button class="favorite-btn"',
            ' aria-label="Favorilere ekle" aria-pressed="false"',
            ' data-favorite-id="' + esc(p.id) + '"',
            ' data-name="' + esc(p.name) + '"',
            ' data-brand="' + esc(p.brand) + '"',
            ' data-price="' + esc(String(p.price)) + '"',
            ' data-image="' + esc(p.image) + '"',
            ' data-url="' + esc(p.url) + '"',
            ' type="button">',
            '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s-6.716-4.27-9.193-8.12C.89 9.91 1.59 6.1 4.61 4.39c2.06-1.17 4.62-.82 6.39.87 1.77-1.69 4.33-2.04 6.39-.87 3.02 1.71 3.72 5.52 1.803 8.49C18.716 16.73 12 21 12 21z"></path></svg>',
          '</button>',
        '</div>',
        '<div class="product-body">',
          '<div class="brandline">' + esc(p.brand) + '</div>',
          '<a href="' + esc(p.url) + '">',
            '<h3>' + esc(p.name) + '</h3>',
          '</a>',
          (p.description ? '<p>' + esc(p.description) + '</p>' : ''),
          '<div class="price-row">',
            '<div>',
              '<div class="price">' + esc(formatPrice(p.price)) + '</div>',
              '<div class="price-note">KDV dahil</div>',
            '</div>',
            '<button class="btn btn-primary"',
              ' data-add-cart=""',
              ' data-id="' + esc(p.id) + '"',
              ' data-slug="' + esc(p.slug || p.id) + '"',
              ' data-name="' + esc(p.name) + '"',
              ' data-brand="' + esc(p.brand) + '"',
              ' data-price="' + esc(String(p.price)) + '"',
              ' data-image="' + esc(p.image) + '"',
              ' data-url="' + esc(p.url) + '"',
              '>Sepete Ekle</button>',
          '</div>',
        '</div>',
      '</article>'
    ].join('');
  }

  function render() {
    var grids = document.querySelectorAll('.dynamic-product-grid');
    if (!grids.length) return;

    var products = window.COSMOSKIN_PRODUCTS;
    if (!products || !products.length) return;

    grids.forEach(function (grid) {
      var filterSlug  = grid.getAttribute('data-category-slug') || '';
      var filterBrand = grid.getAttribute('data-brand-slug') || '';
      var filterConcern = grid.getAttribute('data-concern-slug') || '';

      var filtered = products.filter(function (p) {
        if (filterBrand && p.brandSlug !== filterBrand) return false;
        if (filterConcern) {
          var concerns = p.concernSlugs || [];
          if (!concerns.includes(filterConcern)) return false;
          return true;
        }
        if (filterSlug) {
          var slugs = filterSlug.split(' ');
          if (!slugs.includes(p.categorySlug)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        grid.innerHTML = '<p class="collection-empty">Bu kategori için ürün bulunamadı.</p>';
        return;
      }

      grid.innerHTML = filtered.map(buildCard).join('');

      /* Re-init favorite buttons if app.js is loaded */
      if (typeof initFavoriteButtons === 'function') {
        initFavoriteButtons();
      }
      /* Re-init add-to-cart buttons */
      if (typeof initCartButtons === 'function') {
        initCartButtons();
      }
    });
  }

  /* ── Filter chips ── */
  function initFilterChips() {
    document.querySelectorAll('[data-filter-wrap]').forEach(function (wrap) {
      var grid = wrap.nextElementSibling;
      if (!grid) return;

      wrap.addEventListener('click', function (e) {
        var chip = e.target.closest('[data-filter]');
        if (!chip) return;

        /* Update active chip */
        wrap.querySelectorAll('[data-filter]').forEach(function (c) {
          c.classList.remove('active');
        });
        chip.classList.add('active');

        var val = chip.getAttribute('data-filter');
        var cards = grid.querySelectorAll('.product-card');

        cards.forEach(function (card) {
          if (val === 'all') {
            card.style.display = '';
            return;
          }
          var tags = (card.getAttribute('data-filter-item') || '').toLowerCase();
          card.style.display = tags.includes(val.toLowerCase()) ? '' : 'none';
        });
      });
    });
  }

  /* ── Init ── */
  function init() {
    render();
    initFilterChips();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
