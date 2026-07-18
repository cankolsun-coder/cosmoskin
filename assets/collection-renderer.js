/**
 * COSMOSKIN — Collection Renderer
 * Renders product cards dynamically from COSMOSKIN_PRODUCTS.
 * Supports category, brand, concern, skin-type, and editorial collection pages.
 */
(function () {
  'use strict';

  var BESTSELLER_SLUGS = [
    'anua-heartleaf-pore-control-cleansing-oil',
    'beauty-of-joseon-relief-sun-spf50',
    'cosrx-snail-mucin-essence',
    'round-lab-birch-juice-sunscreen',
    'cosrx-advanced-snail-96-mucin-essence',
    'torriden-dive-in-hyaluronic-acid-serum',
    'skin1004-madagascar-centella-ampoule',
    'some-by-mi-aha-bha-pha-toner',
    'some-by-mi-aha-bha-miracle-toner',
    'laneige-water-sleeping-mask'
  ];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPrice(value) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') {
      return window.COSMOSKIN_FORMAT_PRICE(value);
    }
    return '₺' + String(value || 0);
  }

  function priceDisplayHtml(p, options) {
    var PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && typeof PD.renderPriceHtml === 'function') return PD.renderPriceHtml(p, options);
    return '<span class="cs-price cs-price--compact"><span class="cs-price__current">' + esc(formatPrice(p.price)) + '</span></span>';
  }

  function fold(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u');
  }

  function productText(p) {
    var parts = [
      p.name,
      p.brand,
      p.category,
      p.categorySlug,
      p.volume,
      Array.isArray(p.keywords) ? p.keywords.join(' ') : p.keywords,
      Array.isArray(p.search_terms) ? p.search_terms.join(' ') : p.search_terms,
      Array.isArray(p.aliases) ? p.aliases.join(' ') : p.aliases,
      Array.isArray(p.concernSlugs) ? p.concernSlugs.join(' ') : p.concernSlugs,
      p.description
    ];
    return fold(parts.join(' '));
  }

  function hasAny(text, words) {
    return words.some(function (word) {
      return text.indexOf(fold(word)) !== -1;
    });
  }

  function matchesConcern(p, slug) {
    var text = productText(p);
    if (!slug) return true;
    switch (slug) {
      case 'hydration':
      case 'nem':
        return hasAny(text, ['nem', 'hyaluronic', 'hyaluronik', 'hydration', 'water', 'moisture', 'aquaring', 'dokdo', 'rice toner', 'laneige']);
      case 'sensitivity':
      case 'hassasiyet':
        return hasAny(text, ['hassas', 'sensitive', 'soothing', 'yatistirici', 'centella', 'heartleaf', 'cica', 'low ph']);
      case 'pore-sebum':
      case 'gozenek':
        return hasAny(text, ['pore', 'gozenek', 'sebum', 'bha', 'aha', 'salicylic', 'salisilik', 'clay', 'pad', 'oil-free', 'cleanser']);
      case 'barrier':
      case 'bariyer':
        return hasAny(text, ['bariyer', 'barrier', 'ceramide', 'seramid', 'mucin', 'snail', 'cica', 'cream', 'lotion', 'centella']);
      case 'acne-balance':
      case 'akne':
        return hasAny(text, ['akne', 'acne', 'pimple', 'blemish', 'bha', 'aha', 'salicylic', 'salisilik', 'pore', 'gozenek', 'sebum', 'miracle']);
      case 'blemish':
      case 'leke':
        return hasAny(text, ['leke', 'dark spot', 'bright', 'glow', 'vitamin c', 'arbutin', 'niacinamide', 'niasinamid', 'rice', 'tangerine', 'isilt', 'aydin']);
      case 'glow':
      case 'isilti':
        return hasAny(text, ['glow', 'vitamin c', 'arbutin', 'rice', 'pirinc', 'bright', 'isilt', 'aydin', 'niacinamide', 'niasinamid', 'propolis', 'tangerine']);
      default:
        return hasAny(text, [slug]);
    }
  }

  function matchesSkin(p, slug) {
    var text = productText(p);
    switch (slug) {
      case 'dry':
        return matchesConcern(p, 'hydration') || matchesConcern(p, 'barrier') || hasAny(text, ['kuru', 'dry']);
      case 'oily':
        return matchesConcern(p, 'pore-sebum') || matchesConcern(p, 'acne-balance') || hasAny(text, ['yagli', 'oily', 'oil-free']);
      case 'combination':
        return matchesConcern(p, 'hydration') || matchesConcern(p, 'pore-sebum') || hasAny(text, ['karma', 'combination']);
      case 'sensitive':
        return matchesConcern(p, 'sensitivity') || matchesConcern(p, 'barrier') || hasAny(text, ['hassas', 'sensitive']);
      case 'normal':
        return hasAny(text, ['cleanser', 'temizleyici', 'toner', 'essence', 'cream', 'spf', 'sun', 'gunes', 'mask']) || p.categorySlug;
      case 'acne-prone':
        return matchesConcern(p, 'acne-balance');
      default:
        return hasAny(text, [slug]);
    }
  }

  function matchesCollection(p, slug) {
    if (!slug) return true;
    if (slug === 'bestsellers') {
      return BESTSELLER_SLUGS.indexOf(p.slug || p.id) !== -1;
    }
    return hasAny(productText(p), [slug]);
  }

  function filterTerms(p) {
    return [
      p.name,
      p.brand,
      p.category,
      p.categorySlug,
      productText(p)
    ].join(' ');
  }

  function emptyStateHtml() {
    return [
      '<div class="collection-empty">',
        '<strong>Bu kategoride henüz ürün bulunmuyor.</strong>',
        '<p>COSMOSKIN seçkisine yeni ürünler eklendikçe bu alan güncellenecek.</p>',
        '<a class="btn btn-secondary" href="/allproducts.html">Tüm ürünleri keşfet</a>',
      '</div>'
    ].join('');
  }

  function updateCount(grid, count) {
    var target = document.querySelector('[data-collection-count]');
    if (!target) return;
    target.textContent = count + ' ürün';
    target.setAttribute('aria-label', count + ' ürün listeleniyor');
  }

  function buildCard(p) {
    return [
      '<article class="product-card cs-product-card" data-filter-item="' + esc(filterTerms(p)) + '">',
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
              '<div class="price">' + priceDisplayHtml(p, { compact: true }) + '</div>',
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
      var filterGoal = grid.getAttribute('data-goal-slug') || '';
      var filterSkin = grid.getAttribute('data-skin-slug') || '';
      var filterCollection = grid.getAttribute('data-collection-slug') || '';

      var filtered = products.filter(function (p) {
        if (filterBrand && p.brandSlug !== filterBrand) return false;
        if (filterConcern && !matchesConcern(p, filterConcern)) return false;
        if (filterGoal && !matchesConcern(p, filterGoal)) return false;
        if (filterSkin && !matchesSkin(p, filterSkin)) return false;
        if (filterCollection && !matchesCollection(p, filterCollection)) return false;
        if (filterSlug) {
          var slugs = filterSlug.split(' ');
          if (!slugs.includes(p.categorySlug)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        updateCount(grid, 0);
        grid.innerHTML = emptyStateHtml();
        return;
      }

      updateCount(grid, filtered.length);
      grid.innerHTML = filtered.map(buildCard).join('');

      /* Re-init favorite buttons if app.js is loaded */
      if (typeof initFavoriteButtons === 'function') {
        initFavoriteButtons();
      }
      /* Re-init add-to-cart buttons */
      if (typeof initCartButtons === 'function') {
        initCartButtons();
      }
      if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.loadInventory === 'function') {
        window.COSMOSKIN_STOCK.loadInventory(filtered.map(function (p) { return p.slug || p.id; }).filter(Boolean), { root: grid });
      }
      document.dispatchEvent(new CustomEvent('cosmoskin:collection-rendered', {
        detail: { grid: grid, count: filtered.length }
      }));
      document.dispatchEvent(new CustomEvent('cosmoskin:products-updated', { detail: { root: grid } }));
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
  window.addEventListener('cosmoskin:products-updated', render);

})();
