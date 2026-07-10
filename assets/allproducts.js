(function () {
  'use strict';

  var root = document.querySelector('.cs-allproducts');
  if (!root) return;

  var els = {
    grid: document.getElementById('csApProductGrid'),
    empty: document.getElementById('csApEmpty'),
    emptyClear: document.getElementById('csApEmptyClear'),
    search: document.getElementById('csApSearch'),
    brandSearch: document.getElementById('csApBrandSearch'),
    resultCount: document.getElementById('csApResultCount'),
    mobileResultCount: document.getElementById('csApMobileResultCount'),
    totalProducts: document.getElementById('csApTotalProducts'),
    totalBrands: document.getElementById('csApTotalBrands'),
    sort: document.getElementById('csApSort'),
    perPage: document.getElementById('csApPerPage'),
    loadMore: document.getElementById('csApLoadMore'),
    activeFilters: document.getElementById('csApActiveFilters'),
    clear: document.getElementById('csApClearFilters'),
    filterToggle: document.getElementById('csApFilterToggle'),
    filterToggleCount: document.getElementById('csApFilterToggleCount'),
    filterClose: document.getElementById('csApFilterClose'),
    filterPanel: document.getElementById('csApFilters'),
    priceMin: document.getElementById('csApPriceMin'),
    priceMax: document.getElementById('csApPriceMax'),
    priceMinInput: document.getElementById('csApPriceMinInput'),
    priceMaxInput: document.getElementById('csApPriceMaxInput'),
    minPriceLabel: document.getElementById('csApMinPriceLabel'),
    maxPriceLabel: document.getElementById('csApMaxPriceLabel'),
    priceRange: document.getElementById('csApPriceRange'),
    pricePresets: document.getElementById('csApPricePresets')
  };


  function isLocalStaticPreview() {
    return !window.COSMOSKIN_ENABLE_LOCAL_API && (location.protocol === 'file:' || location.hostname === ['local','host'].join('') || location.hostname === '127.0.0.1');
  }

  var state = {
    products: [],
    filtered: [],
    visibleCount: 24,
    defaults: { minPrice: 0, maxPrice: 0 },
    filters: {
      q: '',
      category: new Set(),
      brand: new Set(),
      concern: new Set(),
      texture: new Set(),
      ingredient: new Set(),
      feature: new Set(),
      minPrice: 0,
      maxPrice: 0,
      sort: 'featured'
    }
  };

  var labelMaps = {
    category: new Map(),
    brand: new Map(),
    concern: new Map([
      ['nem', 'Nem'],
      ['bariyer', 'Bariyer Onarıcı'],
      ['akne-denge', 'Akne & Denge'],
      ['aydinlatici', 'Aydınlatıcı'],
      ['anti-aging', 'Anti-Aging'],
      ['hassas-cilt', 'Hassas Cilt'],
      ['gunes-korumasi', 'Güneş Koruması']
    ]),
    texture: new Map([
      ['hafif', 'Hafif'],
      ['jel', 'Jel'],
      ['krem', 'Krem'],
      ['yag', 'Yağ'],
      ['essence', 'Essence'],
      ['serum-ampul', 'Serum & Ampul'],
      ['maske', 'Maske']
    ]),
    ingredient: new Map([
      ['centella', 'Centella'],
      ['niacinamide', 'Niacinamide'],
      ['hyaluronic-acid', 'Hyaluronic Acid'],
      ['snail-mucin', 'Snail Mucin'],
      ['propolis', 'Propolis'],
      ['ceramide', 'Ceramide'],
      ['vitamin-c', 'Vitamin C'],
      ['salicylic-acid', 'Salicylic Acid'],
      ['rice', 'Rice'],
      ['spf', 'SPF']
    ]),
    feature: new Map([
      ['best-seller', 'Çok Satan'],
      ['new', 'Yeni'],
      ['editor-pick', 'Editör Önerisi'],
      ['daily-use', 'Günlük Kullanım'],
      ['sensitive-friendly', 'Hassas Ciltlere Uygun']
    ])
  };

  var bestSellerSlugs = new Set([
    'beauty-of-joseon-relief-sun-spf50',
    'anua-heartleaf-77-soothing-toner',
    'torriden-dive-in-hyaluronic-acid-serum',
    'skin1004-madagascar-centella-ampoule',
    'dr-jart-ceramidin-cream',
    'cosrx-advanced-snail-96-mucin-essence',
    'round-lab-birch-juice-sunscreen',
    'anua-heartleaf-pore-control-cleansing-oil'
  ]);

  var newSlugs = new Set([
    'round-lab-1025-dokdo-cleanser',
    'goodal-green-tangerine-vitamin-c-serum',
    'by-wishtrend-pure-vitamin-c-21-5-serum',
    'torriden-dive-in-watery-moisture-sun-cream',
    'skin1004-hyalu-cica-water-fit-sun-serum'
  ]);

  var editorSlugs = new Set([
    'beauty-of-joseon-relief-sun-spf50',
    'skin1004-madagascar-centella-ampoule',
    'cosrx-advanced-snail-96-mucin-essence',
    'round-lab-dokdo-toner',
    'torriden-solid-in-ceramide-cream'
  ]);

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugify(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function fold(value) {
    return slugify(value).replace(/-/g, ' ');
  }

  function formatPrice(value) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') return window.COSMOSKIN_FORMAT_PRICE(value);
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function priceDisplayHtml(product, options) {
    var PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && typeof PD.renderPriceHtml === 'function') return PD.renderPriceHtml(product, options);
    return '<span class="cs-price cs-price--compact"><span class="cs-price__current">' + esc(formatPrice(product.price)) + '</span></span>';
  }

  function readNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function getInitialReviewStats(product) {
    var count = readNumber(product.reviewCount || product.review_count || product.reviewsCount || product.reviews_count || product.approved_count);
    var rating = readNumber(product.rating || product.avgRating || product.avg_rating || product.ratingValue || product.rating_value);
    if (count > 0 && rating > 0) {
      return { rating: Math.round(Math.min(5, Math.max(0, rating)) * 10) / 10, reviewCount: Math.round(count), hasReviewSummary: true };
    }
    return { rating: 0, reviewCount: 0, hasReviewSummary: false };
  }

  function hasReviewStats(product) {
    return !!(product && product.hasReviewSummary && Number(product.reviewCount) > 0 && Number(product.rating) > 0);
  }

  function includesAny(haystack, needles) {
    return needles.some(function (needle) { return haystack.indexOf(needle) !== -1; });
  }

  function deriveConcerns(product, text) {
    var out = new Set(product.concernSlugs || []);
    if (includesAny(text, ['nem', 'hyaluronic', 'hyaluronik', 'hydration', 'water', 'dive in', 'watery', 'moisture', 'aquaring', 'dokdo', 'laneige'])) out.add('nem');
    if (includesAny(text, ['bariyer', 'barrier', 'ceramide', 'seramid', 'mucin', 'snail', 'cica', 'cream', 'onarıcı', 'onari'])) out.add('bariyer');
    if (includesAny(text, ['akne', 'acne', 'blemish', 'bha', 'aha', 'pore', 'gözenek', 'gozenek', 'salicylic', 'salisilik', 'pimple', 'sebum'])) out.add('akne-denge');
    if (includesAny(text, ['glow', 'ışıltı', 'isılti', 'aydin', 'bright', 'vitamin c', 'niacinamide', 'niasinamid', 'arbutin', 'rice', 'leke', 'tangerine'])) out.add('aydinlatici');
    if (includesAny(text, ['collagen', 'kolajen', 'anti aging', 'sıkı', 'siki', 'wrapping'])) out.add('anti-aging');
    if (includesAny(text, ['hassas', 'sensitive', 'soothing', 'yatıştırıcı', 'yatistirici', 'centella', 'heartleaf', 'low ph'])) out.add('hassas-cilt');
    if (includesAny(text, ['spf', 'sun', 'güneş', 'gunes', 'koruyucu', 'sunscreen'])) out.add('gunes-korumasi');
    return Array.from(out).filter(Boolean);
  }

  function deriveTextures(product, text) {
    var out = new Set();
    if (includesAny(text, ['hafif', 'light', 'watery', 'gel', 'sun gel', 'low ph'])) out.add('hafif');
    if (includesAny(text, ['gel'])) out.add('jel');
    if (includesAny(text, ['cream', 'krem', 'ceramidin', 'lotion'])) out.add('krem');
    if (includesAny(text, ['oil', 'yağ', 'yag'])) out.add('yag');
    if (includesAny(text, ['essence', 'essans', 'toner', 'tonik'])) out.add('essence');
    if (includesAny(text, ['serum', 'ampoule', 'ampul', 'amfül', 'amful'])) out.add('serum-ampul');
    if (includesAny(text, ['mask', 'maske', 'patch', 'pad'])) out.add('maske');
    if (out.size === 0) out.add('hafif');
    return Array.from(out);
  }

  function deriveIngredients(text) {
    var out = new Set();
    if (includesAny(text, ['centella', 'cica'])) out.add('centella');
    if (includesAny(text, ['niacinamide', 'niasinamid'])) out.add('niacinamide');
    if (includesAny(text, ['hyaluronic', 'hyaluronik', 'hyalu'])) out.add('hyaluronic-acid');
    if (includesAny(text, ['snail', 'mucin', 'salyangoz'])) out.add('snail-mucin');
    if (includesAny(text, ['propolis'])) out.add('propolis');
    if (includesAny(text, ['ceramide', 'seramid', 'ceramidin'])) out.add('ceramide');
    if (includesAny(text, ['vitamin c', 'vita c', 'c vitamini', 'tangerine'])) out.add('vitamin-c');
    if (includesAny(text, ['salicylic', 'salisilik'])) out.add('salicylic-acid');
    if (includesAny(text, ['rice', 'pirinç', 'pirinc'])) out.add('rice');
    if (includesAny(text, ['spf', 'sun', 'güneş', 'gunes'])) out.add('spf');
    return Array.from(out);
  }

  function deriveFeatures(product, text) {
    var out = new Set();
    if (bestSellerSlugs.has(product.slug)) out.add('best-seller');
    if (newSlugs.has(product.slug)) out.add('new');
    if (editorSlugs.has(product.slug)) out.add('editor-pick');
    if (includesAny(text, ['günlük', 'gunluk', 'daily', 'low ph', 'toner', 'spf'])) out.add('daily-use');
    if (includesAny(text, ['hassas', 'sensitive', 'soothing', 'centella', 'heartleaf', 'low ph', 'cica'])) out.add('sensitive-friendly');
    return Array.from(out);
  }

  function makeDescription(product, concerns) {
    if (product.description) return product.description;
    if (concerns.indexOf('gunes-korumasi') !== -1) return 'Günlük kullanım için hafif dokulu, şehir temposuna uygun Kore SPF seçkisi.';
    if (concerns.indexOf('akne-denge') !== -1) return 'Gözenek, sebum ve denge odağıyla rutini sadeleştiren hedef bakım ürünü.';
    if (concerns.indexOf('aydinlatici') !== -1) return 'Daha aydınlık ve canlı görünüm hissi için seçilmiş aktif içerik desteği.';
    if (concerns.indexOf('bariyer') !== -1) return 'Cilt bariyeri ve konfor hissini destekleyen, günlük rutine uygun bakım.';
    if (concerns.indexOf('nem') !== -1) return 'Nem katmanını destekleyen, hafif ve dengeli K-Beauty bakım seçimi.';
    return 'COSMOSKIN tarafından seçilmiş, sade ve etkili Kore cilt bakımı ürünü.';
  }

  function enhanceProduct(product) {
    var keywords = Array.isArray(product.keywords) ? product.keywords.join(' ') : '';
    var fullText = fold([product.name, product.brand, product.category, product.volume, keywords].join(' '));
    var categoryKey = product.categorySlug || slugify(product.category);
    var brandKey = product.brandSlug || slugify(product.brand);
    var concerns = deriveConcerns(product, fullText);
    var textures = deriveTextures(product, fullText);
    var ingredients = deriveIngredients(fullText);
    var features = deriveFeatures(product, fullText);
    var reviewStats = getInitialReviewStats(product);
    var safeSlug = product.slug || slugify(product.name);
    var safeId = product.id || safeSlug;
    var safeUrl = product.url || ('/products/' + safeSlug + '.html');
    var badge = '';
    if (features.indexOf('best-seller') !== -1) badge = 'En Çok Satan';
    else if (features.indexOf('new') !== -1) badge = 'Yeni';
    else if (features.indexOf('editor-pick') !== -1) badge = 'Editör Önerisi';

    labelMaps.category.set(categoryKey, product.category || 'Kategori');
    labelMaps.brand.set(brandKey, product.brand || 'Marka');

    var chips = [];
    concerns.slice(0, 2).forEach(function (key) { if (labelMaps.concern.get(key)) chips.push(labelMaps.concern.get(key).replace(' Onarıcı', '')); });
    if (chips.length < 2 && ingredients[0] && labelMaps.ingredient.get(ingredients[0])) chips.push(labelMaps.ingredient.get(ingredients[0]));
    if (chips.length < 2 && textures[0] && labelMaps.texture.get(textures[0])) chips.push(labelMaps.texture.get(textures[0]));

    return Object.assign({}, product, {
      id: safeId,
      slug: safeSlug,
      url: safeUrl,
      categoryKey: categoryKey,
      brandKey: brandKey,
      concernKeys: concerns,
      textureKeys: textures,
      ingredientKeys: ingredients,
      featureKeys: features,
      badge: badge,
      rating: reviewStats.rating,
      reviewCount: reviewStats.reviewCount,
      hasReviewSummary: reviewStats.hasReviewSummary,
      description: makeDescription(product, concerns),
      chips: chips.slice(0, 3),
      searchText: fullText + ' ' + concerns.join(' ') + ' ' + textures.join(' ') + ' ' + ingredients.join(' ') + ' ' + features.join(' '),
      sortScore: (features.indexOf('best-seller') !== -1 ? 1000 : 0) + (features.indexOf('editor-pick') !== -1 ? 500 : 0) + (features.indexOf('new') !== -1 ? 250 : 0)
    });
  }

  function activePriceChanged() {
    return Number(state.filters.minPrice) !== Number(state.defaults.minPrice) || Number(state.filters.maxPrice) !== Number(state.defaults.maxPrice);
  }

  function getSelectedCount() {
    return ['category', 'brand', 'concern', 'texture', 'ingredient', 'feature'].reduce(function (sum, key) {
      return sum + state.filters[key].size;
    }, 0) + (activePriceChanged() ? 1 : 0) + (state.filters.q ? 1 : 0);
  }

  function readUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var aliases = { category: ['category', 'kategori'], brand: ['brand', 'marka'], concern: ['concern', 'cilt'], q: ['q', 'search'] };
    Object.keys(aliases).forEach(function (key) {
      aliases[key].forEach(function (name) {
        var value = params.get(name);
        if (!value) return;
        if (key === 'q') state.filters.q = value;
        else value.split(',').map(slugify).filter(Boolean).forEach(function (part) { state.filters[key].add(part); });
      });
    });
    ['texture', 'ingredient', 'feature'].forEach(function (key) {
      var value = params.get(key);
      if (value) value.split(',').map(slugify).filter(Boolean).forEach(function (part) { state.filters[key].add(part); });
    });
    var min = Number(params.get('min'));
    var max = Number(params.get('max'));
    if (Number.isFinite(min) && min > 0) state.filters.minPrice = min;
    if (Number.isFinite(max) && max > 0) state.filters.maxPrice = max;
    var sort = params.get('sort');
    if (sort) state.filters.sort = sort;
  }

  function writeUrlParams() {
    var params = new URLSearchParams();
    if (state.filters.q) params.set('q', state.filters.q);
    ['category', 'brand', 'concern', 'texture', 'ingredient', 'feature'].forEach(function (key) {
      var values = Array.from(state.filters[key]);
      if (values.length) params.set(key, values.join(','));
    });
    if (activePriceChanged()) {
      params.set('min', String(state.filters.minPrice));
      params.set('max', String(state.filters.maxPrice));
    }
    if (state.filters.sort !== 'featured') params.set('sort', state.filters.sort);
    var next = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    try {
      if (window.location && window.location.pathname) window.history.replaceState({}, '', next);
    } catch (_error) {
      /* Non-browser previews can block history updates; live site URLs continue to sync normally. */
    }
  }

  function countFor(key, value, products) {
    return products.filter(function (p) {
      if (key === 'category') return p.categoryKey === value;
      if (key === 'brand') return p.brandKey === value;
      return p[key + 'Keys'] && p[key + 'Keys'].indexOf(value) !== -1;
    }).length;
  }

  function renderFilterList(key, items) {
    var host = document.querySelector('[data-filter-list="' + key + '"]');
    if (!host) return;
    host.innerHTML = items.map(function (item) {
      return '<label class="cs-ap-check" data-filter-row="' + esc(key) + '" data-label="' + esc(fold(item.label)) + '">' +
        '<input type="checkbox" data-filter-key="' + esc(key) + '" value="' + esc(item.value) + '">' +
        '<span>' + esc(item.label) + '</span><small>' + esc(item.count) + '</small></label>';
    }).join('');
  }

  function buildFilters() {
    var products = state.products;
    var categories = Array.from(labelMaps.category.entries()).map(function (entry) {
      return { value: entry[0], label: entry[1], count: countFor('category', entry[0], products) };
    }).filter(function (item) { return item.count > 0; }).sort(function (a, b) { return a.label.localeCompare(b.label, 'tr'); });

    categories.unshift({ value: 'all-products', label: 'Tüm Ürünler', count: products.length });

    var brands = Array.from(labelMaps.brand.entries()).map(function (entry) {
      return { value: entry[0], label: entry[1], count: countFor('brand', entry[0], products) };
    }).filter(function (item) { return item.count > 0; }).sort(function (a, b) { return a.label.localeCompare(b.label, 'tr'); });

    var concerns = Array.from(labelMaps.concern.entries()).map(function (entry) { return { value: entry[0], label: entry[1], count: countFor('concern', entry[0], products) }; }).filter(function (item) { return item.count > 0; });
    var textures = Array.from(labelMaps.texture.entries()).map(function (entry) { return { value: entry[0], label: entry[1], count: countFor('texture', entry[0], products) }; }).filter(function (item) { return item.count > 0; });
    var ingredients = Array.from(labelMaps.ingredient.entries()).map(function (entry) { return { value: entry[0], label: entry[1], count: countFor('ingredient', entry[0], products) }; }).filter(function (item) { return item.count > 0; });
    var features = Array.from(labelMaps.feature.entries()).map(function (entry) { return { value: entry[0], label: entry[1], count: countFor('feature', entry[0], products) }; }).filter(function (item) { return item.count > 0; });

    renderFilterList('category', categories);
    renderFilterList('brand', brands);
    renderFilterList('concern', concerns);
    renderFilterList('texture', textures);
    renderFilterList('ingredient', ingredients);
    renderFilterList('feature', features);
  }

  function syncInputsFromState() {
    if (els.search) els.search.value = state.filters.q;
    if (els.sort) els.sort.value = state.filters.sort;
    document.querySelectorAll('[data-filter-key]').forEach(function (input) {
      var key = input.getAttribute('data-filter-key');
      if (key === 'category' && input.value === 'all-products') input.checked = state.filters.category.size === 0;
      else input.checked = state.filters[key] && state.filters[key].has(input.value);
    });
    syncPriceControls();
  }

  function syncPriceControls() {
    var min = Number(state.filters.minPrice);
    var max = Number(state.filters.maxPrice);
    [els.priceMin, els.priceMax].forEach(function (el) {
      if (!el) return;
      el.min = state.defaults.minPrice;
      el.max = state.defaults.maxPrice;
    });
    if (els.priceMin) els.priceMin.value = min;
    if (els.priceMax) els.priceMax.value = max;
    if (els.priceMinInput) els.priceMinInput.value = min;
    if (els.priceMaxInput) els.priceMaxInput.value = max;
    if (els.minPriceLabel) els.minPriceLabel.textContent = formatPrice(min);
    if (els.maxPriceLabel) els.maxPriceLabel.textContent = formatPrice(max);
    if (els.priceRange) {
      var total = Math.max(1, state.defaults.maxPrice - state.defaults.minPrice);
      var left = ((min - state.defaults.minPrice) / total) * 100;
      var right = 100 - (((max - state.defaults.minPrice) / total) * 100);
      els.priceRange.style.setProperty('--range-left', Math.max(0, Math.min(100, left)) + '%');
      els.priceRange.style.setProperty('--range-right', Math.max(0, Math.min(100, right)) + '%');
    }
    document.querySelectorAll('.cs-ap-price-preset').forEach(function (btn) {
      var a = Number(btn.dataset.min);
      var b = Number(btn.dataset.max);
      btn.classList.toggle('is-active', activePriceChanged() && a === min && b === max);
    });
  }

  function setupPrice() {
    var prices = state.products.map(function (p) { return Number(p.price || 0); }).filter(Number.isFinite);
    if (!prices.length) {
      state.defaults.minPrice = 0;
      state.defaults.maxPrice = 0;
      state.filters.minPrice = 0;
      state.filters.maxPrice = 0;
      syncPriceControls();
      return;
    }
    var min = Math.floor(Math.min.apply(null, prices) / 10) * 10;
    var max = Math.ceil(Math.max.apply(null, prices) / 10) * 10;
    state.defaults.minPrice = min;
    state.defaults.maxPrice = max;
    if (!state.filters.minPrice) state.filters.minPrice = min;
    if (!state.filters.maxPrice) state.filters.maxPrice = max;

    if (els.pricePresets) {
      var presetRaw = [
        [min, Math.min(650, max)],
        [650, Math.min(850, max)],
        [850, Math.min(1000, max)],
        [1000, max]
      ].filter(function (pair, idx, arr) { return pair[0] < pair[1] && arr.findIndex(function (p) { return p[0] === pair[0] && p[1] === pair[1]; }) === idx; });
      els.pricePresets.innerHTML = presetRaw.map(function (pair) {
        return '<button class="cs-ap-price-preset" type="button" data-min="' + pair[0] + '" data-max="' + pair[1] + '">' + esc(formatPrice(pair[0])) + ' - ' + esc(formatPrice(pair[1])) + '</button>';
      }).join('');
    }
  }

  function normalizePricePair(min, max) {
    min = Math.max(state.defaults.minPrice, Math.min(Number(min), state.defaults.maxPrice));
    max = Math.max(state.defaults.minPrice, Math.min(Number(max), state.defaults.maxPrice));
    if (min > max) {
      var tmp = min;
      min = max;
      max = tmp;
    }
    state.filters.minPrice = min;
    state.filters.maxPrice = max;
  }

  function matchesProduct(product) {
    var f = state.filters;
    if (f.q && product.searchText.indexOf(fold(f.q)) === -1) return false;
    if (f.category.size && !f.category.has(product.categoryKey)) return false;
    if (f.brand.size && !f.brand.has(product.brandKey)) return false;
    if (f.concern.size && !Array.from(f.concern).every(function (key) { return product.concernKeys.indexOf(key) !== -1; })) return false;
    if (f.texture.size && !Array.from(f.texture).every(function (key) { return product.textureKeys.indexOf(key) !== -1; })) return false;
    if (f.ingredient.size && !Array.from(f.ingredient).every(function (key) { return product.ingredientKeys.indexOf(key) !== -1; })) return false;
    if (f.feature.size && !Array.from(f.feature).every(function (key) { return product.featureKeys.indexOf(key) !== -1; })) return false;
    if (Number(product.price) < Number(f.minPrice) || Number(product.price) > Number(f.maxPrice)) return false;
    return true;
  }

  function sortProducts(products) {
    var sorted = products.slice();
    switch (state.filters.sort) {
      case 'best': sorted.sort(function (a, b) { return Number(b.featureKeys.indexOf('best-seller') !== -1) - Number(a.featureKeys.indexOf('best-seller') !== -1) || b.sortScore - a.sortScore || a.name.localeCompare(b.name, 'tr'); }); break;
      case 'new': sorted.sort(function (a, b) { return Number(b.featureKeys.indexOf('new') !== -1) - Number(a.featureKeys.indexOf('new') !== -1) || a.name.localeCompare(b.name, 'tr'); }); break;
      case 'rating': sorted.sort(function (a, b) { return Number(hasReviewStats(b)) - Number(hasReviewStats(a)) || b.rating - a.rating || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name, 'tr'); }); break;
      case 'price-asc': sorted.sort(function (a, b) { return a.price - b.price; }); break;
      case 'price-desc': sorted.sort(function (a, b) { return b.price - a.price; }); break;
      case 'name-asc': sorted.sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); }); break;
      default: sorted.sort(function (a, b) { return b.sortScore - a.sortScore; });
    }
    return sorted;
  }

  function cardHtml(product) {
    var badge = product.badge ? '<span class="cs-ap-card-badge">' + esc(product.badge) + '</span>' : '<span class="cs-ap-card-badge">' + esc(product.brand) + '</span>';
    var chips = product.chips.length ? product.chips : [product.category];
    var ratingHtml = hasReviewStats(product)
      ? '<div class="cs-ap-rating" aria-label="' + esc(product.rating.toFixed(1) + ' puan, ' + product.reviewCount + ' yorum') + '"><span class="star">★</span><strong>' + esc(product.rating.toFixed(1)) + '</strong><span>· ' + esc(product.reviewCount.toLocaleString('tr-TR')) + ' yorum</span></div>'
      : '';
    return '<article class="product-card cs-catalog-card" data-product-id="' + esc(product.id) + '" data-brand="' + esc(product.brand) + '">' +
      '<div class="product-media-wrap">' +
        '<a class="product-media" href="' + esc(product.url) + '" aria-label="' + esc(product.name) + '">' +
          '<img src="' + esc(product.image) + '" alt="' + esc(product.name) + '" loading="lazy" width="420" height="420">' + badge +
        '</a>' +
        '<button class="favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + esc(product.id) + '" data-name="' + esc(product.name) + '" data-brand="' + esc(product.brand) + '" data-price="' + esc(product.price) + '" data-image="' + esc(product.image) + '" data-url="' + esc(product.url) + '"><span class="favorite-btn-icon" aria-hidden="true"><svg fill="none" viewBox="0 0 24 24"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg></span></button>' +
      '</div>' +
      '<div class="product-body">' +
        '<div class="brandline">' + esc(product.brand) + '</div>' +
        '<a href="' + esc(product.url) + '"><h3>' + esc(product.name) + '</h3></a>' +
        '<p>' + esc(product.description) + '</p>' +
        ratingHtml +
        '<div class="pills">' + chips.slice(0, 3).map(function (chip) { return '<span class="pill">' + esc(chip) + '</span>'; }).join('') + '</div>' +
        '<div class="meta-note">' + esc(product.volume || product.category) + ' · ' + esc(product.category) + '</div>' +
        '<div class="price-row"><div><div class="price">' + priceDisplayHtml(product, { compact: true }) + '</div><div class="price-note">KDV dahil</div></div>' +
        '<button class="btn btn-primary" type="button" data-add-cart="" data-id="' + esc(product.id) + '" data-slug="' + esc(product.slug) + '" data-name="' + esc(product.name) + '" data-brand="' + esc(product.brand) + '" data-price="' + esc(product.price) + '" data-image="' + esc(product.image) + '" data-url="' + esc(product.url) + '">SEPETE EKLE</button></div>' +
      '</div>' +
    '</article>';
  }

  function renderActiveFilters() {
    if (!els.activeFilters) return;
    var chips = [];
    if (state.filters.q) chips.push({ key: 'q', value: 'q', label: 'Arama: ' + state.filters.q });
    ['category', 'brand', 'concern', 'texture', 'ingredient', 'feature'].forEach(function (key) {
      state.filters[key].forEach(function (value) {
        var label = (labelMaps[key] && labelMaps[key].get(value)) || value;
        chips.push({ key: key, value: value, label: label });
      });
    });
    if (activePriceChanged()) chips.push({ key: 'price', value: 'price', label: formatPrice(state.filters.minPrice) + ' - ' + formatPrice(state.filters.maxPrice) });
    els.activeFilters.innerHTML = chips.map(function (chip) {
      return '<button class="cs-ap-filter-chip" type="button" data-remove-filter="' + esc(chip.key) + '" data-value="' + esc(chip.value) + '">' + esc(chip.label) + '<span aria-hidden="true">×</span></button>';
    }).join('');
    var count = getSelectedCount();
    if (els.filterToggleCount) els.filterToggleCount.textContent = count + ' aktif filtre';
  }

  function renderQuickActive() {
    document.querySelectorAll('.cs-ap-quick').forEach(function (btn) {
      var quick = btn.dataset.quick || 'all';
      var active = false;
      if (quick === 'all') active = getSelectedCount() === 0;
      else {
        var parts = quick.split(':');
        active = parts.length === 2 && state.filters[parts[0]] && state.filters[parts[0]].has(parts[1]);
      }
      btn.classList.toggle('is-active', active);
    });
  }

  function applyBrandSearch() {
    var term = fold(els.brandSearch && els.brandSearch.value || '');
    document.querySelectorAll('[data-filter-row="brand"]').forEach(function (row) {
      row.classList.toggle('is-muted', term && (row.dataset.label || '').indexOf(term) === -1);
    });
  }


  function bindFallbackCartButtons(scope) {
    if (typeof window.initCartButtons === 'function') return;
    (scope || document).querySelectorAll('[data-add-cart]').forEach(function (button) {
      if (button.dataset.apFallbackCartBound) return;
      button.dataset.apFallbackCartBound = 'true';
      button.addEventListener('click', function () {
        var item = {
          id: button.dataset.id,
          slug: button.dataset.slug || button.dataset.id,
          name: button.dataset.name,
          brand: button.dataset.brand,
          price: Number(button.dataset.price || 0),
          image: button.dataset.image,
          url: button.dataset.url,
          qty: 1
        };
        try {
          var cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
          var found = cart.find(function (entry) { return entry.id === item.id; });
          if (found) found.qty = Number(found.qty || 1) + 1;
          else cart.push(item);
          localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
          document.querySelectorAll('.cart-count').forEach(function (node) {
            node.textContent = String(cart.reduce(function (sum, entry) { return sum + Number(entry.qty || 1); }, 0));
          });
          var drawer = document.getElementById('cartDrawer');
          var backdrop = document.getElementById('backdrop');
          if (drawer) drawer.classList.add('active');
          if (backdrop) backdrop.classList.add('active');
        } catch (_error) {
          /* If storage is unavailable, keep the UI stable. */
        }
      });
    });
  }

  function render() {
    state.filtered = sortProducts(state.products.filter(matchesProduct));
    var visible = state.filtered.slice(0, state.visibleCount);
    if (els.grid) {
      els.grid.innerHTML = visible.map(cardHtml).join('');
      if (typeof window.initFavoriteButtons === 'function') window.initFavoriteButtons(els.grid);
      if (typeof window.initCartButtons === 'function') window.initCartButtons(els.grid);
      bindFallbackCartButtons(els.grid);
    }
    if (els.empty) els.empty.hidden = state.filtered.length !== 0;
    if (els.resultCount) els.resultCount.textContent = state.filtered.length.toLocaleString('tr-TR');
    if (els.mobileResultCount) els.mobileResultCount.textContent = state.filtered.length.toLocaleString('tr-TR') + ' ürün bulundu';
    if (els.loadMore) {
      els.loadMore.hidden = state.filtered.length <= visible.length;
      els.loadMore.disabled = state.filtered.length <= visible.length;
    }
    renderActiveFilters();
    renderQuickActive();
    syncInputsFromState();
    writeUrlParams();
  }

  function clearFilters(keepSort) {
    state.filters.q = '';
    ['category', 'brand', 'concern', 'texture', 'ingredient', 'feature'].forEach(function (key) { state.filters[key].clear(); });
    state.filters.minPrice = state.defaults.minPrice;
    state.filters.maxPrice = state.defaults.maxPrice;
    if (!keepSort) state.filters.sort = 'featured';
    state.visibleCount = Number(els.perPage && els.perPage.value || 24);
    if (els.brandSearch) els.brandSearch.value = '';
    applyBrandSearch();
    render();
  }

  function bindEvents() {
    document.querySelectorAll('[data-filter-group] .cs-ap-filter-title').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var group = btn.closest('[data-filter-group]');
        var open = !group.classList.contains('is-open');
        group.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    document.addEventListener('change', function (event) {
      var input = event.target.closest('[data-filter-key]');
      if (!input || !root.contains(input)) return;
      var key = input.dataset.filterKey;
      if (key === 'category' && input.value === 'all-products') {
        state.filters.category.clear();
      } else if (state.filters[key]) {
        if (key === 'category') document.querySelectorAll('[data-filter-key="category"][value="all-products"]').forEach(function (all) { all.checked = false; });
        if (input.checked) state.filters[key].add(input.value);
        else state.filters[key].delete(input.value);
      }
      state.visibleCount = Number(els.perPage && els.perPage.value || 24);
      render();
    });

    if (els.search) {
      els.search.addEventListener('input', function () {
        state.filters.q = els.search.value.trim();
        state.visibleCount = Number(els.perPage && els.perPage.value || 24);
        render();
      });
    }

    if (els.brandSearch) els.brandSearch.addEventListener('input', applyBrandSearch);

    if (els.sort) els.sort.addEventListener('change', function () { state.filters.sort = els.sort.value; render(); });
    if (els.perPage) els.perPage.addEventListener('change', function () { state.visibleCount = Number(els.perPage.value || 24); render(); });
    if (els.loadMore) els.loadMore.addEventListener('click', function () { state.visibleCount += Number(els.perPage && els.perPage.value || 24); render(); });
    if (els.clear) els.clear.addEventListener('click', function () { clearFilters(false); });
    if (els.emptyClear) els.emptyClear.addEventListener('click', function () { clearFilters(true); });

    [els.priceMin, els.priceMax].forEach(function (input) {
      if (!input) return;
      input.addEventListener('input', function () {
        normalizePricePair(els.priceMin.value, els.priceMax.value);
        syncPriceControls();
      });
      input.addEventListener('change', function () { render(); });
    });

    [els.priceMinInput, els.priceMaxInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener('change', function () {
        normalizePricePair(els.priceMinInput.value, els.priceMaxInput.value);
        render();
      });
    });

    if (els.pricePresets) {
      els.pricePresets.addEventListener('click', function (event) {
        var btn = event.target.closest('.cs-ap-price-preset');
        if (!btn) return;
        normalizePricePair(btn.dataset.min, btn.dataset.max);
        render();
      });
    }

    document.querySelectorAll('.cs-ap-quick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.dataset.quick;
        if (value === 'all') {
          clearFilters(true);
          return;
        }
        var parts = value.split(':');
        if (parts.length !== 2 || !state.filters[parts[0]]) return;
        state.filters[parts[0]].clear();
        state.filters[parts[0]].add(parts[1]);
        state.visibleCount = Number(els.perPage && els.perPage.value || 24);
        render();
      });
    });

    if (els.activeFilters) {
      els.activeFilters.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-remove-filter]');
        if (!btn) return;
        var key = btn.dataset.removeFilter;
        var value = btn.dataset.value;
        if (key === 'q') state.filters.q = '';
        else if (key === 'price') {
          state.filters.minPrice = state.defaults.minPrice;
          state.filters.maxPrice = state.defaults.maxPrice;
        } else if (state.filters[key]) state.filters[key].delete(value);
        render();
      });
    }

    if (els.filterToggle) els.filterToggle.addEventListener('click', function () {
      document.body.classList.add('cs-ap-filter-open');
      els.filterToggle.setAttribute('aria-expanded', 'true');
    });
    if (els.filterClose) els.filterClose.addEventListener('click', function () {
      document.body.classList.remove('cs-ap-filter-open');
      if (els.filterToggle) els.filterToggle.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') document.body.classList.remove('cs-ap-filter-open');
    });
  }

  function applyReviewSummary(product, summary) {
    var count = readNumber(summary && (summary.approved_count || summary.total_count || summary.reviewCount || summary.review_count));
    var avg = readNumber(summary && (summary.avg_rating || summary.avgRating || summary.rating));
    if (count > 0 && avg > 0) {
      product.rating = Math.round(Math.min(5, Math.max(0, avg)) * 10) / 10;
      product.reviewCount = Math.round(count);
      product.hasReviewSummary = true;
    } else {
      product.rating = 0;
      product.reviewCount = 0;
      product.hasReviewSummary = false;
    }
  }

  function reviewCacheKey(slug) {
    return 'cosmoskin_review_summary_' + slug;
  }

  function readCachedReviewSummary(slug) {
    try {
      var raw = sessionStorage.getItem(reviewCacheKey(slug));
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (!cached || Date.now() - Number(cached.ts || 0) > 5 * 60 * 1000) return null;
      return cached.summary || null;
    } catch (_error) {
      return null;
    }
  }

  function writeCachedReviewSummary(slug, summary) {
    try {
      sessionStorage.setItem(reviewCacheKey(slug), JSON.stringify({ ts: Date.now(), summary: summary || {} }));
    } catch (_error) {
      /* Storage can be unavailable in private browsing; the catalogue still works without cache. */
    }
  }

  async function fetchReviewSummary(product) {
    if (!product || !product.slug || typeof fetch !== 'function' || isLocalStaticPreview()) return null;
    var cached = readCachedReviewSummary(product.slug);
    if (cached) return cached;
    var apiBase = ((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '');
    try {
      var response = await fetch(apiBase + '/reviews?product_slug=' + encodeURIComponent(product.slug), { credentials: 'same-origin' });
      if (!response.ok) return null;
      var data = await response.json().catch(function () { return {}; });
      var summary = data && data.summary ? data.summary : null;
      writeCachedReviewSummary(product.slug, summary || {});
      return summary;
    } catch (_error) {
      return null;
    }
  }

  async function hydrateReviewSummaries() {
    var products = state.products.filter(function (product) { return product && product.slug; });
    var index = 0;
    var changed = false;
    async function worker() {
      while (index < products.length) {
        var product = products[index++];
        var summary = await fetchReviewSummary(product);
        var before = product.rating + ':' + product.reviewCount + ':' + product.hasReviewSummary;
        applyReviewSummary(product, summary || {});
        var after = product.rating + ':' + product.reviewCount + ':' + product.hasReviewSummary;
        if (before !== after) changed = true;
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (changed) render();
  }

  function init(rawProducts) {
    var products = (rawProducts || window.COSMOSKIN_PRODUCTS || []).filter(Boolean).map(enhanceProduct);
    state.products = products;
    state.visibleCount = Number(els.perPage && els.perPage.value || 24);
    if (els.totalProducts) els.totalProducts.textContent = products.length.toLocaleString('tr-TR');
    if (els.totalBrands) els.totalBrands.textContent = new Set(products.map(function (p) { return p.brandKey; })).size.toLocaleString('tr-TR');
    setupPrice();
    readUrlParams();
    buildFilters();
    bindEvents();
    syncInputsFromState();
    render();
    hydrateReviewSummaries();
  }

  var ready = window.COSMOSKIN_PRODUCTS_READY || Promise.resolve(window.COSMOSKIN_PRODUCTS || []);
  ready.then(init).catch(function () { init(window.COSMOSKIN_PRODUCTS || []); });
})();
