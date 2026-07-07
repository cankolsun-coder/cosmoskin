(function () {
  'use strict';

  var SECTION_ID = 'smart-routine';
  var ICON_BASE = '/assets/icons/cosmoskin/';
  var REVIEW_CACHE = new Map();
  var REVIEW_API = ((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '');

  function isLocalStaticPreview() {
    return !window.COSMOSKIN_ENABLE_LOCAL_API && (location.protocol === 'file:' || location.hostname === ['local','host'].join('') || location.hostname === '127.0.0.1');
  }

  var iconFiles = {
    ui: { 'arrow-right':'system-arrow-right', check:'status-check', info:'status-info', offer:'commerce-gift' },
    goals: { 'goal-hydration':'routine-goal-hydration', 'goal-barrier':'routine-goal-barrier', 'goal-radiance':'routine-goal-radiance', 'goal-blemish':'routine-goal-tone', 'goal-sensitive':'routine-goal-sensitive', 'goal-pore':'routine-goal-pore', 'goal-acne':'routine-goal-acne-prone' },
    routine: { 'step-cleanse':'routine-step-cleanse', 'step-prep':'routine-step-prep', 'step-serum':'routine-step-serum', 'step-moisturize':'routine-step-moisturize', 'step-protect':'routine-step-spf' },
    state: { empty:'status-empty', info:'status-info', warning:'status-warning', check:'status-check' }
  };

  function iconPath(group, name) {
    var file = iconFiles[group] && iconFiles[group][name] ? iconFiles[group][name] : name;
    return ICON_BASE + file + '.svg';
  }

  var icon = {
    ui: function (name) { return iconPath('ui', name); },
    goals: function (name) { return iconPath('goals', name); },
    routine: function (name) { return iconPath('routine', name); },
    state: function (name) { return iconPath('state', name); }
  };

  function iconImg(src, className) {
    return '<img class="' + esc(className || 'cs-icon cs-icon--md') + '" src="' + esc(src) + '" alt="" aria-hidden="true" loading="lazy">';
  }

  var goalConfig = [
    { id: 'nem', label: 'Nem', icon: icon.goals('goal-hydration'), keywords: ['nem', 'hydration', 'hyaluronic', 'glycerin', 'water', 'moisture'] },
    { id: 'bariyer', label: 'Bariyer', icon: icon.goals('goal-barrier'), keywords: ['bariyer', 'ceramide', 'seramid', 'panthenol', 'centella', 'squalane', 'mucin'] },
    { id: 'isilti', label: 'Işıltı', icon: icon.goals('goal-radiance'), keywords: ['ışıltı', 'glow', 'niacinamide', 'vitamin c', 'rice', 'pirinç', 'arbutin'] },
    { id: 'leke', label: 'Leke', icon: icon.goals('goal-blemish'), keywords: ['leke', 'dark spot', 'vitamin c', 'arbutin', 'ton', 'spf'] },
    { id: 'hassasiyet', label: 'Hassasiyet', icon: icon.goals('goal-sensitive'), keywords: ['hassas', 'soothing', 'heartleaf', 'centella', 'low ph', 'yatıştırıcı'] },
    { id: 'gozenek', label: 'Gözenek & Sebum', icon: icon.goals('goal-pore'), keywords: ['gözenek', 'gozenek', 'pore', 'sebum', 'bha', 'salicylic', 'pad'] },
    { id: 'akne', label: 'Sivilceye Eğilim', icon: icon.goals('goal-acne'), keywords: ['akne', 'acne', 'blemish', 'sivilce', 'salicylic', 'bha', 'tea tree'] }
  ];

  var skinTypes = [
    { id: 'kuru', label: 'Kuru' },
    { id: 'karma', label: 'Karma' },
    { id: 'yagli', label: 'Yağlı' },
    { id: 'hassas', label: 'Hassas' }
  ];

  var stepConfig = [
    { id: 'temizle', label: 'Temizle', description: 'Cildi arındır ve tazele.', icon: icon.routine('step-cleanse') },
    { id: 'hazirla', label: 'Hazırla', description: 'Cildi dengeleyip hazırla.', icon: icon.routine('step-prep') },
    { id: 'serum', label: 'Serum', description: 'Hedefe yönelik bakım.', icon: icon.routine('step-serum') },
    { id: 'nemlendir', label: 'Nemlendir', description: 'Nemi cilde hapseder.', icon: icon.routine('step-moisturize') },
    { id: 'koru', label: 'Koru', description: 'UV, çevresel etkenlere karşı koru.', icon: icon.routine('step-protect') }
  ];

  var ratingFallback = {};

  var productEnhancements = {
    'anua-heartleaf-77-soothing-toner': { routineStep: 'hazirla', usageTime: ['day', 'night'], skinGoals: ['hassasiyet', 'bariyer', 'nem'], skinTypes: ['hassas', 'karma', 'kuru'], benefits: ['heartleaf', 'soothing', 'denge'], sensitiveFriendly: true, editorPick: true, stock: true },
    'anua-heartleaf-pore-control-cleansing-oil': { routineStep: 'temizle', usageTime: ['night'], skinGoals: ['bariyer', 'hassasiyet'], skinTypes: ['karma', 'yagli', 'hassas'], benefits: ['yağ bazlı temizleme', 'heartleaf', 'makyaj temizliği'], sensitiveFriendly: true, editorPick: true, stock: true, nightPriority: 22 },
    'beauty-of-joseon-relief-sun-spf50': { routineStep: 'koru', usageTime: ['day'], skinGoals: ['leke', 'isilti', 'bariyer', 'nem'], skinTypes: ['kuru', 'karma', 'hassas'], benefits: ['rice extract', 'probiotics', 'spf50'], sensitiveFriendly: true, editorPick: true, stock: true },
    'beauty-of-joseon-glow-serum-propolis-niacinamide': { routineStep: 'serum', usageTime: ['day', 'night'], skinGoals: ['isilti', 'leke', 'bariyer'], skinTypes: ['karma', 'yagli', 'kuru'], benefits: ['niacinamide', 'propolis', 'glow'], sensitiveFriendly: true, editorPick: true, stock: true },
    'beauty-of-joseon-glow-deep-serum': { routineStep: 'serum', usageTime: ['day', 'night'], skinGoals: ['leke', 'isilti'], skinTypes: ['kuru', 'karma'], benefits: ['rice', 'arbutin', 'ton eşitleme'], sensitiveFriendly: true, stock: true },
    'beauty-of-joseon-dynasty-cream': { routineStep: 'nemlendir', usageTime: ['day', 'night'], skinGoals: ['nem', 'isilti', 'bariyer'], skinTypes: ['kuru', 'karma'], benefits: ['rice water', 'squalane', 'ginseng'], sensitiveFriendly: true, stock: true },
    'beauty-of-joseon-green-plum-refreshing-cleanser': { routineStep: 'temizle', usageTime: ['day', 'night'], skinGoals: ['hassasiyet', 'bariyer'], skinTypes: ['karma', 'yagli', 'hassas'], benefits: ['green plum', 'nazik temizlik'], sensitiveFriendly: true, stock: true },
    'by-wishtrend-pure-vitamin-c-21-5-serum': { routineStep: 'serum', usageTime: ['night'], skinGoals: ['leke', 'isilti'], skinTypes: ['karma', 'yagli'], benefits: ['vitamin c', 'antioksidan'], sensitiveFriendly: false, aggressive: true, stock: true },
    'cosrx-advanced-snail-96-mucin-essence': { routineStep: 'hazirla', usageTime: ['day', 'night'], skinGoals: ['nem', 'bariyer', 'hassasiyet'], skinTypes: ['kuru', 'karma', 'hassas'], benefits: ['snail mucin', 'repair', 'elasticity'], sensitiveFriendly: true, editorPick: true, stock: true },
    'cosrx-the-vitamin-c-23-serum': { routineStep: 'serum', usageTime: ['night'], skinGoals: ['leke', 'isilti'], skinTypes: ['karma', 'yagli'], benefits: ['vitamin c', 'brightening'], sensitiveFriendly: false, aggressive: true, stock: true },
    'cosrx-aha-bha-clarifying-treatment-toner': { routineStep: 'hazirla', usageTime: ['night'], skinGoals: ['leke'], skinTypes: ['yagli', 'karma'], benefits: ['aha', 'bha', 'gözenek'], sensitiveFriendly: false, aggressive: true, stock: true },
    'cosrx-low-ph-good-morning-gel-cleanser': { routineStep: 'temizle', usageTime: ['day', 'night'], skinGoals: ['hassasiyet', 'bariyer', 'nem'], skinTypes: ['hassas', 'karma', 'kuru'], benefits: ['low ph', 'nazik', 'gel cleanser'], sensitiveFriendly: true, editorPick: true, stock: true, dayPriority: 12 },
    'cosrx-salicylic-acid-daily-gentle-cleanser': { routineStep: 'temizle', usageTime: ['night'], skinGoals: ['leke'], skinTypes: ['yagli', 'karma'], benefits: ['salicylic acid', 'akne', 'temizleyici'], sensitiveFriendly: false, aggressive: true, stock: true },
    'cosrx-oil-free-ultra-moisturizing-lotion': { routineStep: 'nemlendir', usageTime: ['day', 'night'], skinGoals: ['nem', 'bariyer'], skinTypes: ['yagli', 'karma'], benefits: ['oil free', 'lightweight moisturizer'], sensitiveFriendly: true, stock: true },
    'dr-jart-ceramidin-cream': { routineStep: 'nemlendir', usageTime: ['night'], skinGoals: ['bariyer', 'nem', 'hassasiyet'], skinTypes: ['kuru', 'hassas'], benefits: ['ceramide', 'barrier repair', 'cream'], sensitiveFriendly: true, editorPick: true, stock: true, nightPriority: 24 },
    'goodal-green-tangerine-vitamin-c-serum': { routineStep: 'serum', usageTime: ['day', 'night'], skinGoals: ['leke', 'isilti'], skinTypes: ['karma', 'yagli'], benefits: ['vitamin c', 'dark spot', 'glow'], sensitiveFriendly: true, editorPick: true, stock: true },
    'im-from-rice-toner': { routineStep: 'hazirla', usageTime: ['day', 'night'], skinGoals: ['isilti', 'nem'], skinTypes: ['kuru', 'karma'], benefits: ['rice toner', 'glow', 'nem'], sensitiveFriendly: true, stock: true },
    'isntree-hyaluronic-acid-watery-sun-gel': { routineStep: 'koru', usageTime: ['day'], skinGoals: ['nem', 'leke', 'bariyer'], skinTypes: ['kuru', 'karma'], benefits: ['hyaluronic acid', 'sun gel', 'spf50'], sensitiveFriendly: true, stock: true },
    'laneige-water-sleeping-mask': { routineStep: 'nemlendir', usageTime: ['night'], skinGoals: ['nem'], skinTypes: ['kuru', 'karma'], benefits: ['sleeping mask', 'water', 'night hydration'], sensitiveFriendly: true, stock: true },
    'medicube-zero-pore-pad': { routineStep: 'hazirla', usageTime: ['night'], skinGoals: ['leke'], skinTypes: ['yagli', 'karma'], benefits: ['pore', 'pad', 'denge'], sensitiveFriendly: false, stock: true },
    'medicube-collagen-night-wrapping-mask': { routineStep: 'nemlendir', usageTime: ['night'], skinGoals: ['nem', 'isilti'], skinTypes: ['kuru', 'karma'], benefits: ['night mask', 'collagen', 'glow'], sensitiveFriendly: true, stock: true },
    'round-lab-birch-juice-sunscreen': { routineStep: 'koru', usageTime: ['day'], skinGoals: ['nem', 'leke', 'hassasiyet'], skinTypes: ['kuru', 'hassas', 'karma'], benefits: ['birch juice', 'spf50', 'nem'], sensitiveFriendly: true, editorPick: true, stock: true },
    'round-lab-soybean-nourishing-cream': { routineStep: 'nemlendir', usageTime: ['day', 'night'], skinGoals: ['nem', 'bariyer', 'isilti'], skinTypes: ['kuru', 'karma'], benefits: ['soybean', 'ceramide', 'nourishing'], sensitiveFriendly: true, stock: true },
    'round-lab-1025-dokdo-cleanser': { routineStep: 'temizle', usageTime: ['day', 'night'], skinGoals: ['hassasiyet', 'bariyer', 'nem'], skinTypes: ['hassas', 'kuru', 'karma'], benefits: ['dokdo', 'low irritation', 'cleanser'], sensitiveFriendly: true, editorPick: true, stock: true },
    'round-lab-dokdo-toner': { routineStep: 'hazirla', usageTime: ['day', 'night'], skinGoals: ['nem', 'hassasiyet', 'bariyer'], skinTypes: ['hassas', 'kuru', 'karma'], benefits: ['toner', 'dokdo', 'minerals'], sensitiveFriendly: true, stock: true },
    'skin1004-madagascar-centella-ampoule': { routineStep: 'serum', usageTime: ['day', 'night'], skinGoals: ['hassasiyet', 'bariyer', 'nem'], skinTypes: ['hassas', 'karma', 'yagli', 'kuru'], benefits: ['centella', 'soothing', 'barrier'], sensitiveFriendly: true, editorPick: true, stock: true },
    'skin1004-hyalu-cica-water-fit-sun-serum': { routineStep: 'koru', usageTime: ['day'], skinGoals: ['hassasiyet', 'nem', 'leke'], skinTypes: ['hassas', 'karma', 'yagli'], benefits: ['hyalu-cica', 'water-fit', 'spf50'], sensitiveFriendly: true, editorPick: true, stock: true },
    'some-by-mi-aha-bha-miracle-toner': { routineStep: 'hazirla', usageTime: ['night'], skinGoals: ['leke'], skinTypes: ['yagli', 'karma'], benefits: ['aha bha pha', 'pore', 'akne'], sensitiveFriendly: false, aggressive: true, stock: true },
    'torriden-dive-in-hyaluronic-acid-serum': { routineStep: 'serum', usageTime: ['day', 'night'], skinGoals: ['nem', 'bariyer', 'hassasiyet'], skinTypes: ['kuru', 'karma', 'hassas', 'yagli'], benefits: ['hyaluronic acid', 'lightweight', 'hydration'], sensitiveFriendly: true, editorPick: true, stock: true },
    'torriden-solid-in-ceramide-cream': { routineStep: 'nemlendir', usageTime: ['day', 'night'], skinGoals: ['bariyer', 'nem', 'hassasiyet'], skinTypes: ['kuru', 'hassas', 'karma'], benefits: ['ceramide', 'panthenol', 'barrier'], sensitiveFriendly: true, editorPick: true, stock: true, dayPriority: 18 },
    'torriden-dive-in-watery-moisture-sun-cream': { routineStep: 'koru', usageTime: ['day'], skinGoals: ['nem', 'leke'], skinTypes: ['kuru', 'karma', 'yagli'], benefits: ['hyaluronic acid', 'watery', 'spf'], sensitiveFriendly: true, stock: true }
  };

  var routineState = {
    selectedGoals: [],
    selectedSkinType: 'karma',
    dayRoutine: [],
    nightRoutine: [],
    alternatives: {},
    overrides: {},
    removedSlots: {},
    matchScore: 96,
    totalPrice: 0,
    originalTotalPrice: 0,
    bundleDiscountRate: 0.10,
    bundleDiscountAmount: 0,
    bundleDiscountEligible: false,
    inventoryReady: false,
    inventoryError: '',
    sensitivity: 'orta',
    experience: 'baslangic',
    preference: 'tam'
  };

  window.COSMOSKIN_SMART_ROUTINE_STATE = routineState;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatPrice(value) {
    var amount = Number(value || 0);
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(amount) + ' TL';
  }

  function readNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function arrayIncludesAny(values, selected) {
    var set = new Set(Array.isArray(values) ? values : [values].filter(Boolean));
    return (selected || []).some(function (item) { return set.has(item); });
  }

  function getProductData() {
    return Array.isArray(window.COSMOSKIN_PRODUCTS) ? window.COSMOSKIN_PRODUCTS : [];
  }

  function resolveCatalogProduct(targetSlug) {
    if (!targetSlug) return null;
    var helpers = window.COSMOSKIN_PRODUCT_HELPERS;
    if (helpers && typeof helpers.getProductBySlug === 'function') return helpers.getProductBySlug(targetSlug);
    return getProductData().find(function (product) { return product.slug === targetSlug || product.id === targetSlug; }) || null;
  }

  function resolveCatalogPrice(targetSlug, fallbackPrice) {
    var live = resolveCatalogProduct(targetSlug);
    var price = readNumber(live && live.price != null ? live.price : fallbackPrice);
    return price > 0 ? price : 0;
  }

  function refreshRoutinePricesFromCatalog() {
    function patchList(list) {
      return (list || []).map(function (product) {
        if (!product || !product.slug) return product;
        var price = resolveCatalogPrice(product.slug, product.price);
        return price > 0 ? Object.assign({}, product, { price: price }) : product;
      });
    }
    routineState.dayRoutine = patchList(routineState.dayRoutine);
    routineState.nightRoutine = patchList(routineState.nightRoutine);
    calculateRoutineTotal();
  }

  function categoryToStep(product) {
    var category = String(product.category || '').toLowerCase();
    var name = String(product.name || '').toLowerCase();
    var keywords = (product.keywords || []).join(' ').toLowerCase();
    if (/güneş|spf|sun/.test(category + ' ' + name + ' ' + keywords)) return 'koru';
    if (/temizleyici|cleanser|cleansing|oil/.test(category + ' ' + name + ' ' + keywords)) return 'temizle';
    if (/serum|ampul|ampoule|vitamin c/.test(category + ' ' + name + ' ' + keywords)) return 'serum';
    if (/nemlendirici|cream|lotion|mask|krem/.test(category + ' ' + name + ' ' + keywords)) return 'nemlendir';
    if (/tonik|essence|toner|pad/.test(category + ' ' + name + ' ' + keywords)) return 'hazirla';
    return 'serum';
  }

  function inferGoals(product, enhancement) {
    var text = [product.name, product.brand, product.category, (product.keywords || []).join(' '), (enhancement.benefits || []).join(' ')].join(' ').toLowerCase();
    var goals = new Set(enhancement.skinGoals || []);
    goalConfig.forEach(function (goal) {
      if (goal.keywords.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) goals.add(goal.id);
    });
    if (!goals.size) goals.add('nem');
    return Array.from(goals);
  }

  function normalizeProductData(source) {
    var products = (Array.isArray(source) ? source : getProductData()).map(function (product) {
      var enhancement = productEnhancements[product.slug] || {};
      var fallback = null;
      var step = enhancement.routineStep || categoryToStep(product);
      var usageTime = enhancement.usageTime || (step === 'koru' ? ['day'] : ['day', 'night']);
      return Object.assign({}, product, enhancement, {
        id: product.id || product.slug,
        slug: product.slug,
        url: product.url || ('/products/' + product.slug + '.html'),
        image: product.image || '',
        price: readNumber(product.price),
        routineStep: step,
        usageTime: Array.isArray(usageTime) ? usageTime : [usageTime],
        skinGoals: inferGoals(product, enhancement),
        skinTypes: enhancement.skinTypes || ['kuru', 'karma', 'yagli', 'hassas'],
        rating: readNumber(product.rating || product.avgRating || product.avg_rating || (fallback && fallback.avg)),
        reviewCount: Math.round(readNumber(product.reviewCount || product.review_count || product.approved_count || (fallback && fallback.count))),
        stock: (function () {
          var inv = window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.getInventory === 'function' ? window.COSMOSKIN_STOCK.getInventory(product.slug) : null;
          return Boolean(inv && !inv._missing && inv.status === 'active' && (inv.allow_backorder || Number(inv.available_stock || 0) > 0));
        })(),
        inventoryKnown: Boolean(window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.getInventory === 'function' && window.COSMOSKIN_STOCK.getInventory(product.slug)),
        benefits: enhancement.benefits || []
      });
    }).filter(function (product) {
      return product.slug && product.name && product.image && product.price > 0;
    });
    return products;
  }

  async function refreshLiveInventory(force) {
    var stockApi = window.COSMOSKIN_STOCK;
    var slugs = getProductData().map(function (product) { return product.slug; }).filter(Boolean);
    if (!stockApi || typeof stockApi.loadInventory !== 'function') {
      routineState.inventoryReady = false;
      routineState.inventoryError = 'Stok servisi yüklenemedi. Rutin önerileri satın alınabilir olarak gösterilmiyor.';
      return false;
    }
    await stockApi.loadInventory(slugs, { force: force !== false });
    var service = typeof stockApi.getServiceState === 'function' ? stockApi.getServiceState() : { state: 'available' };
    routineState.inventoryReady = service.state === 'available';
    routineState.inventoryError = routineState.inventoryReady ? '' : (service.error || 'Stok servisine ulaşılamıyor.');
    return routineState.inventoryReady;
  }

  function scoreProduct(product, selectedGoals, selectedSkinType, routineStep, usageTime) {
    var score = 0;
    var goals = selectedGoals && selectedGoals.length ? selectedGoals : ['nem'];
    if (arrayIncludesAny(product.skinGoals, goals)) score += 30;
    if ((product.skinTypes || []).indexOf(selectedSkinType) !== -1) score += 20;
    if (product.routineStep === routineStep) score += 20;
    if ((product.usageTime || []).indexOf(usageTime) !== -1) score += 15;
    if (Number(product.rating || 0) >= 4.5) score += 5;
    if (product.stock) score += 10;
    if (product.editorPick) score += 5;
    if (routineStep === 'koru' && usageTime === 'day') score += 12;
    if (usageTime === 'night' && product.nightPriority) score += product.nightPriority;
    if (usageTime === 'day' && product.dayPriority) score += product.dayPriority;
    if (goals.indexOf('hassasiyet') !== -1 || selectedSkinType === 'hassas') {
      if (product.sensitiveFriendly) score += 25;
      if (product.aggressive) score -= 35;
    }
    if (routineState.sensitivity === 'yuksek') {
      if (product.sensitiveFriendly) score += 20;
      if (product.aggressive) score -= 80;
    }
    if (routineState.experience === 'baslangic' && product.aggressive) score -= 65;
    if (goals.indexOf('bariyer') !== -1 && /(ceramide|seramid|centella|panthenol|barrier|mucin|squalane)/i.test((product.benefits || []).join(' ') + ' ' + (product.keywords || []).join(' '))) score += 12;
    if (goals.indexOf('nem') !== -1 && /(hyaluronic|glycerin|water|moisture|nem)/i.test((product.benefits || []).join(' ') + ' ' + (product.keywords || []).join(' '))) score += 12;
    if (goals.indexOf('isilti') !== -1 && /(glow|niacinamide|vitamin c|rice|pirinç|arbutin)/i.test((product.benefits || []).join(' ') + ' ' + (product.keywords || []).join(' '))) score += 12;
    if (goals.indexOf('leke') !== -1 && /(spf|vitamin c|arbutin|dark spot|ton)/i.test((product.benefits || []).join(' ') + ' ' + (product.keywords || []).join(' ') + ' ' + product.category)) score += 14;
    if (goals.indexOf('gozenek') !== -1 && /(pore|gözenek|gozenek|sebum|bha|salicylic|pad|clay)/i.test((product.benefits || []).join(' ') + ' ' + (product.keywords || []).join(' ') + ' ' + product.category + ' ' + product.name)) score += 14;
    if (goals.indexOf('akne') !== -1 && /(akne|acne|blemish|sivilce|bha|salicylic|centella|heartleaf|cica)/i.test((product.benefits || []).join(' ') + ' ' + (product.keywords || []).join(' ') + ' ' + product.category + ' ' + product.name)) score += 14;
    return score;
  }

  function slotId(usageTime, step) {
    return usageTime + ':' + step;
  }

  function sortCandidates(products, selectedGoals, selectedSkinType, routineStep, usageTime) {
    return products
      .filter(function (product) {
        return product.stock && product.inventoryKnown && product.routineStep === routineStep && (product.usageTime || []).indexOf(usageTime) !== -1;
      })
      .map(function (product) {
        return Object.assign({}, product, { _score: scoreProduct(product, selectedGoals, selectedSkinType, routineStep, usageTime) });
      })
      .sort(function (a, b) {
        return b._score - a._score || b.rating - a.rating || b.reviewCount - a.reviewCount || a.price - b.price;
      });
  }

  function chooseForSlot(products, used, routineStep, usageTime) {
    var key = slotId(usageTime, routineStep);
    var candidates = sortCandidates(products, routineState.selectedGoals, routineState.selectedSkinType, routineStep, usageTime);
    routineState.alternatives[key] = candidates.slice(0, 8);

    if (routineState.removedSlots[key]) return null;

    var override = routineState.overrides[key];
    if (override) {
      var selected = candidates.find(function (product) { return product.slug === override; }) || products.find(function (product) { return product.slug === override; });
      if (selected && !used.has(selected.slug)) {
        selected = Object.assign({}, selected, {
          _score: scoreProduct(selected, routineState.selectedGoals, routineState.selectedSkinType, routineStep, usageTime),
          _slotKey: key,
          _usageTime: usageTime,
          _routineStep: routineStep
        });
        used.add(selected.slug);
        return selected;
      }
    }

    var unique = candidates.find(function (product) { return !used.has(product.slug); });
    if (unique) {
      used.add(unique.slug);
      return Object.assign({}, unique, { _slotKey: key, _usageTime: usageTime, _routineStep: routineStep });
    }
    return null;
  }

  function buildRoutine(selectedGoals, selectedSkinType) {
    if (Array.isArray(selectedGoals)) routineState.selectedGoals = selectedGoals.slice();
    if (selectedSkinType) routineState.selectedSkinType = selectedSkinType;
    var products = normalizeProductData();
    var used = new Set();
    var daySteps = ['temizle', 'hazirla', 'serum', 'nemlendir', 'koru'];
    var nightSteps = ['temizle', 'hazirla', 'serum', 'nemlendir'];
    routineState.alternatives = {};

    var day = daySteps.map(function (step) { return chooseForSlot(products, used, step, 'day'); }).filter(Boolean);
    var night = nightSteps.map(function (step) { return chooseForSlot(products, used, step, 'night'); }).filter(Boolean);

    if (selectedGoals.indexOf('leke') !== -1 && !day.some(function (p) { return p.routineStep === 'koru'; })) {
      var spf = sortCandidates(products, selectedGoals, selectedSkinType, 'koru', 'day').find(function (product) { return !used.has(product.slug); });
      if (spf) {
        used.add(spf.slug);
        day.push(Object.assign({}, spf, { _slotKey: slotId('day', 'koru'), _usageTime: 'day', _routineStep: 'koru' }));
      }
    }

    routineState.dayRoutine = day;
    routineState.nightRoutine = night;
    routineState.originalTotalPrice = calculateRoutineTotal(day, night, false);
    var offer = calculateBundleOffer(day, night);
    routineState.bundleDiscountEligible = offer.eligible;
    routineState.bundleDiscountAmount = offer.discount;
    routineState.totalPrice = offer.payable;
    routineState.matchScore = calculateMatchScore(day, night);
    return { dayRoutine: day, nightRoutine: night };
  }

  function getUniqueRoutineProducts(day, night, inStockOnly) {
    var unique = new Map();
    (day || routineState.dayRoutine).concat(night || routineState.nightRoutine).forEach(function (product) {
      if (!product || unique.has(product.slug)) return;
      if (inStockOnly && !product.stock) return;
      unique.set(product.slug, product);
    });
    return Array.from(unique.values());
  }

  function calculateRoutineTotal(day, night, applyDiscount) {
    var total = getUniqueRoutineProducts(day, night, true).reduce(function (sum, product) {
      return sum + Number(product.price || 0);
    }, 0);
    if (applyDiscount === false) return total;
    var uniqueCount = getUniqueRoutineProducts(day, night, true).length;
    return uniqueCount >= 2 ? Math.max(0, total - Math.round(total * routineState.bundleDiscountRate)) : total;
  }

  function calculateBundleOffer(day, night) {
    var uniqueProducts = getUniqueRoutineProducts(day, night, true);
    var subtotal = uniqueProducts.reduce(function (sum, product) { return sum + Number(product.price || 0); }, 0);
    var eligible = uniqueProducts.length >= 2;
    var discount = eligible ? Math.round(subtotal * routineState.bundleDiscountRate) : 0;
    return {
      eligible: eligible,
      discount: discount,
      payable: Math.max(0, subtotal - discount),
      uniqueCount: uniqueProducts.length
    };
  }

  function getCurrentRoutineMap() {
    var map = new Map();
    routineState.dayRoutine.concat(routineState.nightRoutine).forEach(function (product) {
      if (product && product._slotKey) map.set(product._slotKey, product);
    });
    return map;
  }

  function isProductSelectedElsewhere(productId, slotKey) {
    return routineState.dayRoutine.concat(routineState.nightRoutine).some(function (product) {
      return product && product.slug === productId && product._slotKey !== slotKey;
    });
  }

  function removeRoutineProduct(slotKey) {
    if (!slotKey) return;
    routineState.removedSlots[slotKey] = true;
    delete routineState.overrides[slotKey];
    var root = document.getElementById(SECTION_ID);
    if (root) {
      renderRecommendedRoutine(root);
      hydrateReviewSummaries(root);
    }
    showRoutineToast('Ürün rutinden çıkarıldı. Toplam tutar güncellendi.', 'success');
  }

  function calculateMatchScore(day, night) {
    var products = day.concat(night).filter(Boolean);
    if (!products.length) return 88;
    var max = 119;
    var avg = products.reduce(function (sum, product) { return sum + Math.max(0, Math.min(max, product._score || 0)); }, 0) / products.length;
    var base = Math.round(74 + (avg / max) * 22);
    if (!routineState.selectedGoals.length) base = Math.min(base, 88);
    return Math.max(82, Math.min(96, base));
  }

  function getGoalLabel(id) {
    var goal = goalConfig.find(function (item) { return item.id === id; });
    return goal ? goal.label : id;
  }

  function getSkinLabel(id) {
    var skin = skinTypes.find(function (item) { return item.id === id; });
    return skin ? skin.label : id;
  }

  function renderSelectedGoals(root) {
    root.querySelectorAll('[data-sr-goal]').forEach(function (button) {
      var id = button.getAttribute('data-sr-goal');
      var active = routineState.selectedGoals.indexOf(id) !== -1;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var count = root.querySelector('[data-sr-selected-count]');
    if (count) {
      count.textContent = routineState.selectedGoals.length
        ? routineState.selectedGoals.length + ' hedef seçildi'
        : 'Cilt hedefini seç';
    }
  }

  function renderSkinTypes(root) {
    root.querySelectorAll('[data-sr-skin]').forEach(function (button) {
      var id = button.getAttribute('data-sr-skin');
      button.setAttribute('aria-pressed', id === routineState.selectedSkinType ? 'true' : 'false');
    });
  }

  function renderRoutineSteps(root) {
    var target = root.querySelector('[data-sr-steps]');
    if (!target) return;
    target.innerHTML = stepConfig.map(function (step, index) {
      return '' +
        '<div class="smart-routine__step">' +
          '<div class="smart-routine__step-index">' + (index + 1) + '</div>' +
          '<div class="smart-routine__step-card">' +
            '<div class="smart-routine__step-icon">' + iconImg(step.icon, 'cs-icon cs-icon--routine') + '</div>' +
            '<div class="smart-routine__step-copy"><strong>' + esc(step.label) + '</strong><span>' + esc(step.description) + '</span></div>' +
            iconImg(icon.ui('arrow-right'), 'cs-icon cs-icon--sm smart-routine__step-arrow') +
          '</div>' +
        '</div>';
    }).join('');
  }

  function renderRating(product) {
    var rating = readNumber(product && product.rating);
    var count = Math.round(readNumber(product && product.reviewCount));
    if (!(rating > 0 && count > 0)) {
      // No verified reviews yet — render nothing (collapsed). When a real rating
      // arrives via product data, the regular rating block below renders.
      return '';
    }
    return '<div class="smart-routine__rating" aria-label="' + esc(rating.toFixed(1) + ' puan, ' + count + ' yorum') + '">' +
      '<span class="smart-routine__stars">★ ' + esc(rating.toFixed(1)) + '</span>' +
      '<span class="smart-routine__reviews">(' + esc(new Intl.NumberFormat('tr-TR').format(count)) + ')</span>' +
    '</div>';
  }

  function productStepLabel(product) {
    var map = { temizle: 'Temizleyici', hazirla: 'Hazırlayıcı', serum: 'Serum', nemlendir: 'Nemlendirici', koru: 'SPF Koruma' };
    return map[product.routineStep] || product.category || 'Bakım';
  }

  function recommendationReason(product) {
    var goalLabels = (product.skinGoals || []).filter(function (goal) { return routineState.selectedGoals.indexOf(goal) !== -1; }).map(getGoalLabel);
    var reason = goalLabels.length ? goalLabels.slice(0, 2).join(' ve ') + ' hedefinle uyumlu' : productStepLabel(product) + ' adımını tamamlar';
    if (routineState.selectedSkinType === 'hassas' && product.sensitiveFriendly) reason += '; hassas cilt seçimine uygun';
    return reason + '.';
  }

  function renderProductCard(product, index, total) {
    if (!product) return '';
    var slot = product._slotKey || slotId(product._usageTime || 'day', product._routineStep || product.routineStep);
    var isLast = index >= total - 1;
    return '<div class="smart-routine__product-wrap" data-sr-product-slot="' + esc(slot) + '">' +
      '<a class="smart-routine__product-card" href="' + esc(product.url) + '" aria-label="' + esc(product.name + ' ürün sayfasına git') + '">' +
        '<div class="smart-routine__product-media"><img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy"></div>' +
        '<div class="smart-routine__product-info">' +
          '<span class="smart-routine__product-step">' + esc(productStepLabel(product)) + '</span>' +
          '<strong class="smart-routine__product-name">' + esc(product.name) + '</strong>' +
          renderRating(product) +
          '<p class="smart-routine__product-reason"><strong>Neden önerildi?</strong> ' + esc(recommendationReason(product)) + '</p>' +
          '<div class="smart-routine__product-price">' + esc(formatPrice(product.price)) + '</div>' +
          '<span class="cs-stock-badge" data-cm-stock-badge data-product-slug="' + esc(product.slug) + '">Stokta</span>' +
        '</div>' +
      '</a>' +
      '<button class="smart-routine__product-remove" type="button" data-sr-remove-product="' + esc(slot) + '" aria-label="' + esc(product.name + ' ürününü rutinden çıkar') + '">×</button>' +
      (!isLast ? iconImg(icon.ui('arrow-right'), 'cs-icon cs-icon--sm smart-routine__connector') : '') +
    '</div>';
  }

  function renderRecommendedRoutine(root) {
    var day = root.querySelector('[data-sr-day-products]');
    var night = root.querySelector('[data-sr-night-products]');
    if (routineState.selectedGoals.length && !routineState.inventoryReady) {
      var inventoryMessage = routineState.inventoryError || 'Canlı stok durumu kontrol ediliyor…';
      var inventoryState = '<div class="smart-routine__empty"><strong>Canlı stok kontrolü</strong><span>' + esc(inventoryMessage) + '</span></div>';
      if (day) day.innerHTML = inventoryState;
      if (night) night.innerHTML = inventoryState;
      root.querySelectorAll('[data-sr-add-cart], [data-sr-save], [data-sr-show-alternatives]').forEach(function (button) { button.disabled = true; button.setAttribute('aria-disabled', 'true'); });
      var stockStatus = root.querySelector('[data-sr-stock]');
      if (stockStatus) stockStatus.textContent = routineState.inventoryError ? 'Doğrulanamadı' : 'Kontrol ediliyor';
      return;
    }
    if (!routineState.selectedGoals.length) {
      routineState.dayRoutine = [];
      routineState.nightRoutine = [];
      routineState.alternatives = {};
      routineState.matchScore = 0;
      routineState.totalPrice = 0;
      routineState.originalTotalPrice = 0;
      routineState.bundleDiscountEligible = false;
      routineState.bundleDiscountAmount = 0;
      var empty = '<div class="smart-routine__empty"><strong>Cilt hedefini seç</strong><span>Sana uygun sabah ve akşam rutinini görmek için Nem, Bariyer, Işıltı, Leke veya Hassasiyet hedeflerinden biriyle başlayabilirsin.</span></div>';
      if (day) day.innerHTML = empty;
      if (night) night.innerHTML = empty;
      var matchEmpty = root.querySelector('[data-sr-match]');
      if (matchEmpty) matchEmpty.textContent = 'Hedef bekliyor';
      var totalEmpty = root.querySelector('[data-sr-total]');
      if (totalEmpty) totalEmpty.textContent = '—';
      var originalTotalEmpty = root.querySelector('[data-sr-original-total]');
      if (originalTotalEmpty) originalTotalEmpty.textContent = '';
      var discountEmpty = root.querySelector('[data-sr-discount]');
      if (discountEmpty) discountEmpty.textContent = '—';
      var timeEmpty = root.querySelector('[data-sr-time]');
      if (timeEmpty) timeEmpty.textContent = 'Önce hedef seç';
      var stockEmpty = root.querySelector('[data-sr-stock]');
      if (stockEmpty) stockEmpty.textContent = '—';
      var subtitleEmpty = root.querySelector('[data-sr-routine-subtitle]');
      if (subtitleEmpty) subtitleEmpty.textContent = 'Cilt hedefini seçerek kişisel sabah ve akşam önerilerini aç.';
      var offerEmpty = root.querySelector('[data-sr-offer]');
      if (offerEmpty) {
        offerEmpty.hidden = false;
        offerEmpty.innerHTML = '<div class="smart-routine__offer-icon">' + iconImg(icon.state('info'), 'cs-icon cs-icon--status') + '</div><div><strong>Cilt hedefini seç</strong><span>Ürünler seçimden sonra gerçek ürün verisi ve stok durumuyla gösterilir.</span></div><b>Başla</b>';
      }
      root.querySelectorAll('[data-sr-add-cart], [data-sr-save], [data-sr-show-alternatives]').forEach(function (button) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      });
      return;
    }
    root.querySelectorAll('[data-sr-add-cart], [data-sr-save], [data-sr-show-alternatives]').forEach(function (button) {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
    });
    buildRoutine(routineState.selectedGoals, routineState.selectedSkinType);
    var noMatch = '<div class="smart-routine__empty"><strong>Şu anda uygun stoklu ürün bulunamadı</strong><span>Seçimini değiştirebilir veya destek ekibimizden ürün alternatifi isteyebilirsin.</span></div>';
    if (day) day.innerHTML = routineState.dayRoutine.length ? routineState.dayRoutine.map(function (product, index) { return renderProductCard(product, index, routineState.dayRoutine.length); }).join('') : noMatch;
    if (night) night.innerHTML = routineState.nightRoutine.length ? routineState.nightRoutine.map(function (product, index) { return renderProductCard(product, index, routineState.nightRoutine.length); }).join('') : noMatch;

    var match = root.querySelector('[data-sr-match]');
    if (match) match.textContent = '%' + routineState.matchScore + ' eşleşme';
    var total = root.querySelector('[data-sr-total]');
    if (total) total.textContent = formatPrice(routineState.totalPrice);
    var originalTotal = root.querySelector('[data-sr-original-total]');
    if (originalTotal) originalTotal.textContent = routineState.bundleDiscountEligible ? formatPrice(routineState.originalTotalPrice) : '';
    var discount = root.querySelector('[data-sr-discount]');
    if (discount) discount.textContent = routineState.bundleDiscountEligible ? '-' + formatPrice(routineState.bundleDiscountAmount) : '—';
    renderBundleOffer(root);
    var time = root.querySelector('[data-sr-time]');
    if (time) time.textContent = routineState.dayRoutine.length + routineState.nightRoutine.length >= 7 ? '3 dakikada hazır' : '2 dakikada hazır';
    var stock = root.querySelector('[data-sr-stock]');
    if (stock) stock.textContent = routineState.dayRoutine.concat(routineState.nightRoutine).every(function (product) { return product.stock; }) ? '✓' : 'Kontrol et';
    var subtitle = root.querySelector('[data-sr-routine-subtitle]');
    if (subtitle) {
      subtitle.textContent = getSkinLabel(routineState.selectedSkinType) + ' cilt için ' + routineState.selectedGoals.map(getGoalLabel).join(' + ') + ' odağı';
    }
  }

  function renderBundleOffer(root) {
    var offer = root.querySelector('[data-sr-offer]');
    if (!offer) return;
    var count = getUniqueRoutineProducts(routineState.dayRoutine, routineState.nightRoutine, true).length;
    if (routineState.bundleDiscountEligible) {
      offer.hidden = false;
      offer.innerHTML = '<div class="smart-routine__offer-icon">' + iconImg(icon.ui('offer'), 'cs-icon cs-icon--status') + '</div>' +
        '<div><strong>Rutin Set Avantajı</strong><span>Gündüz + gece rutininde 2+ üründe sepette %10 avantaj. Aynı ürün tekrar eklenmez.</span></div>' +
        '<b>-' + esc(formatPrice(routineState.bundleDiscountAmount)) + '</b>';
    } else {
      offer.hidden = false;
      offer.innerHTML = '<div class="smart-routine__offer-icon">' + iconImg(icon.ui('offer'), 'cs-icon cs-icon--status') + '</div>' +
        '<div><strong>Rutin Set Avantajı</strong><span>%10 avantaj için rutinde en az 2 stoklu ürün seçili olmalı.</span></div>' +
        '<b>' + count + '/2</b>';
    }
  }

  function collectCartItems() {
    var unique = new Map();
    routineState.dayRoutine.concat(routineState.nightRoutine).forEach(function (product) {
      if (!product || !product.stock || unique.has(product.slug)) return;
      unique.set(product.slug, {
        id: product.slug,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        price: resolveCatalogPrice(product.slug, product.price),
        image: product.image,
        url: product.url,
        qty: 1,
        routineBundle: true
      });
    });
    return Array.from(unique.values());
  }

  async function addRoutineToCart() {
    if (!routineState.selectedGoals.length) {
      showRoutineToast('Önce cilt hedefini seçmelisin.', 'warning');
      return;
    }
    var items = collectCartItems();
    if (!items.length) {
      showRoutineToast('Canlı stokta eklenebilir rutin ürünü bulunamadı.', 'error');
      return;
    }
    if (!window.COSMOSKIN_STOCK || typeof window.COSMOSKIN_STOCK.checkItems !== 'function') {
      showRoutineToast('Stok doğrulaması yapılamadığı için rutin sepete eklenmedi.', 'error');
      return;
    }
    try {
      var check = await window.COSMOSKIN_STOCK.checkItems(items.map(function (item) { return { product_slug: item.slug, quantity: 1 }; }));
      var unavailable = (check.items || []).filter(function (item) { return !item.can_purchase; });
      if (unavailable.length) {
        var names = unavailable.map(function (row) { var product = getProductData().find(function (entry) { return entry.slug === row.product_slug; }); return product ? product.name : row.product_slug; });
        await refreshLiveInventory(true);
        var root = document.getElementById(SECTION_ID);
        if (root) { renderRecommendedRoutine(root); hydrateReviewSummaries(root); }
        showRoutineToast('Stok durumu değişti: ' + names.join(', ') + '. Rutin güncellendi; hiçbir ürün sessizce atlanmadı.', 'warning');
        return;
      }
    } catch (error) {
      routineState.inventoryReady = false;
      routineState.inventoryError = error.message || 'Stok doğrulaması yapılamadı.';
      var currentRoot = document.getElementById(SECTION_ID);
      if (currentRoot) renderRecommendedRoutine(currentRoot);
      showRoutineToast('Stok doğrulanamadığı için rutin sepete eklenmedi. Lütfen tekrar deneyin.', 'error');
      return;
    }

    var existingItems = [];
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.getItems === 'function') existingItems = window.COSMOSKIN_CART_API.getItems() || [];
    else { try { existingItems = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); } catch (error) { existingItems = []; } }
    if (!Array.isArray(existingItems)) existingItems = [];
    var existingSlugs = new Set(existingItems.map(function (entry) { return entry.slug || entry.id; }).filter(Boolean));
    var freshItems = items.filter(function (item) { return !existingSlugs.has(item.slug); });
    try {
      localStorage.setItem('cosmoskin_routine_bundle_offer', JSON.stringify({
        source: 'smart-routine', discountRate: routineState.bundleDiscountRate, discountEligible: routineState.bundleDiscountEligible,
        discountAmount: routineState.bundleDiscountAmount, originalTotal: routineState.originalTotalPrice, payableTotal: routineState.totalPrice,
        productSlugs: items.map(function (item) { return item.slug; }), updatedAt: new Date().toISOString()
      }));
    } catch (error) {}
    if (!freshItems.length) { showRoutineToast('Rutinindeki ürünler zaten sepetinde. Tekrar eklenmedi.', 'info'); return; }
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.addItems === 'function') window.COSMOSKIN_CART_API.addItems(freshItems, { openDrawer: true });
    else {
      var stored = existingItems.slice();
      freshItems.forEach(function (item) { stored.push(item); });
      localStorage.setItem('cosmoskin_cart', JSON.stringify(stored));
      window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: stored } }));
    }
    showRoutineToast(freshItems.length + ' stoklu ürün sepete eklendi. Aynı ürünler tekrar eklenmedi.', 'success');
  }

  function resolveRoutineGoalParam() {
    if (routineState.selectedGoals.indexOf('bariyer') !== -1) return 'bariyer';
    if (routineState.selectedGoals.indexOf('isilti') !== -1 || routineState.selectedGoals.indexOf('leke') !== -1) return 'isilti';
    if (routineState.selectedGoals.indexOf('nem') !== -1) return 'nem';
    if (routineState.dayRoutine.some(function (product) { return product && product.routineStep === 'koru'; })) return 'spf';
    return 'nem';
  }

  function buildRoutineDraftPayload() {
    var base = {
      selectedGoals: routineState.selectedGoals.slice(),
      selectedSkinType: routineState.selectedSkinType,
      skinType: routineState.selectedSkinType,
      sensitivity: routineState.sensitivity || 'orta',
      habit: 'Sabah & Akşam',
      intensity: routineState.preference || 'dengeli',
      tolerance: routineState.experience || 'orta',
      dayRoutine: routineState.dayRoutine.map(safeRoutineProduct),
      nightRoutine: routineState.nightRoutine.map(safeRoutineProduct),
      uniqueProductSlugs: getUniqueRoutineProducts(routineState.dayRoutine, routineState.nightRoutine, true).map(function (product) { return product.slug; }),
      totalPrice: routineState.totalPrice,
      originalTotalPrice: routineState.originalTotalPrice,
      bundleDiscountRate: routineState.bundleDiscountRate,
      bundleDiscountAmount: routineState.bundleDiscountAmount,
      bundleDiscountEligible: routineState.bundleDiscountEligible,
      matchScore: routineState.matchScore,
      routine_score: routineState.matchScore,
      routine_title: routineState.selectedGoals.indexOf('bariyer') !== -1 ? 'Bariyer Odaklı Dengeli Rutin' : routineState.selectedGoals.indexOf('leke') !== -1 ? 'Leke Görünümü ve Ton Eşitsizliği Rutini' : routineState.selectedGoals.indexOf('gozenek') !== -1 ? 'Gözenek & Sebum Dengesi Rutini' : routineState.selectedGoals.indexOf('hassasiyet') !== -1 ? 'Hassasiyet Dostu Minimal Rutin' : 'COSMOSKIN Akıllı Rutin',
      source: 'home-smart-routine',
      source_channel: 'home-smart-routine',
      updatedAt: new Date().toISOString()
    };
    if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.homeStateToDraft === 'function') {
      return window.COSMOSKINRoutineData.homeStateToDraft(base);
    }
    return { skin_profile: base, routine_result: base, source_channel: 'home-smart-routine' };
  }

  function persistRoutineSelectionForRoutinePages() {
    var draft = buildRoutineDraftPayload();
    var legacyPayload = Object.assign({}, draft.routine_result || {}, {
      selectedGoals: routineState.selectedGoals.slice(),
      selectedSkinType: routineState.selectedSkinType,
      skinType: routineState.selectedSkinType,
      sensitivity: routineState.sensitivity || 'orta',
      habit: 'Sabah & Akşam',
      intensity: routineState.preference || 'dengeli',
      tolerance: routineState.experience || 'orta',
      dayRoutine: routineState.dayRoutine.map(safeRoutineProduct),
      nightRoutine: routineState.nightRoutine.map(safeRoutineProduct),
      uniqueProductSlugs: getUniqueRoutineProducts(routineState.dayRoutine, routineState.nightRoutine, true).map(function (product) { return product.slug; }),
      totalPrice: routineState.totalPrice,
      matchScore: routineState.matchScore,
      source: 'home-smart-routine',
      updatedAt: new Date().toISOString()
    });
    try {
      if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.saveDraft === 'function') window.COSMOSKINRoutineData.saveDraft(draft, { source: 'home-smart-routine' });
      localStorage.setItem('cosmoskin_last_routine', JSON.stringify(legacyPayload));
      localStorage.setItem('cosmoskin_pending_routine_preferences', JSON.stringify(legacyPayload));
      localStorage.setItem('cosmoskin_routine_preferences', JSON.stringify(legacyPayload));
    } catch (error) {}
    return draft;
  }

  function viewRoutinePage() {
    if (!routineState.selectedGoals.length) {
      showRoutineToast('Rutini detaylı görmek için önce cilt hedefini seç.', 'warning');
      return;
    }
    persistRoutineSelectionForRoutinePages();
    window.location.href = '/routine.html?from=home-smart-routine&goal=' + encodeURIComponent(resolveRoutineGoalParam()) + '&skin=' + encodeURIComponent(routineState.selectedSkinType || 'karma');
  }

  async function saveRoutine() {
    if (!routineState.selectedGoals.length) {
      showRoutineToast('Rutinini kaydetmek için önce cilt hedefini seç.', 'warning');
      return;
    }
    var draft = persistRoutineSelectionForRoutinePages();

    try {
      if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.saveToAccount === 'function') {
        var saved = await window.COSMOSKINRoutineData.saveToAccount(draft);
        if (saved && saved.needsAuth) {
          showRoutineToast('Rutinini kaydetmek için giriş yapmalısın. Seçimlerin kaybolmayacak.', 'warning');
          try { sessionStorage.setItem('cosmoskin_return_to', '/account/profile.html?tab=routines&routineSync=1'); } catch (error) {}
          if (typeof window.COSMOSKIN_OPEN_AUTH === 'function') window.COSMOSKIN_OPEN_AUTH('loginPanel');
          else document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: { tab: 'loginPanel' } }));
          return;
        }
        window.dispatchEvent(new CustomEvent('cosmoskin:routine-saved', { detail: saved }));
        showRoutineToast('Rutinin hesabına kaydedildi.', 'success');
        return;
      }
      localStorage.setItem('cosmoskin_saved_routine', JSON.stringify(draft));
      localStorage.setItem('cosmoskin_routine_active', JSON.stringify(draft.routine_result || draft));
      window.dispatchEvent(new CustomEvent('cosmoskin:routine-saved', { detail: draft }));
      showRoutineToast('Rutinin bu cihazda kaydedildi.', 'success');
    } catch (error) {
      showRoutineToast(error && error.message ? error.message : 'Rutin kaydedilemedi. Lütfen tekrar dene.', 'error');
    }
  }

  function safeRoutineProduct(product) {
    return {
      id: product.id || product.slug,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      category: product.category,
      routineStep: product.routineStep,
      price: product.price,
      image: product.image,
      url: product.url,
      rating: product.rating,
      reviewCount: product.reviewCount,
      stock: product.stock
    };
  }

  function alternativeLabel(key) {
    var parts = key.split(':');
    var usage = parts[0] === 'day' ? 'Gündüz' : 'Gece';
    var step = stepConfig.find(function (item) { return item.id === parts[1]; });
    return usage + ' · ' + (step ? step.label : parts[1]);
  }

  function showAlternatives() {
    var modal = document.querySelector('[data-sr-alternative-modal]');
    var target = document.querySelector('[data-sr-alternatives]');
    if (!modal || !target) return;
    var currentMap = getCurrentRoutineMap();
    var selectedBySlug = new Map();
    currentMap.forEach(function (product, key) { selectedBySlug.set(product.slug, key); });
    var groups = Object.keys(routineState.alternatives).map(function (key) {
      var list = routineState.alternatives[key] || [];
      if (!list.length) return '';
      return '<div class="smart-routine__alt-group">' +
        '<h4 class="smart-routine__alt-title">' + esc(alternativeLabel(key)) + '</h4>' +
        '<div class="smart-routine__alt-grid">' + list.map(function (product) {
          var takenSlot = selectedBySlug.get(product.slug);
          var disabled = takenSlot && takenSlot !== key;
          var selected = takenSlot === key;
          return '<button class="smart-routine__alt-card' + (selected ? ' is-selected' : '') + '" type="button" data-sr-replace="' + esc(key) + '" data-sr-product="' + esc(product.slug) + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
            '<img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy">' +
            '<strong>' + esc(product.name) + '</strong>' +
            '<span>' + esc(product.brand + ' · ' + formatPrice(product.price) + (product.rating > 0 && product.reviewCount > 0 ? ' · ★ ' + product.rating.toFixed(1) : '')) + '</span>' +
            (disabled ? '<em>Rutinde zaten var</em>' : selected ? '<em>Seçili ürün</em>' : '<em>Alternatif olarak seç</em>') +
          '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).join('');
    target.innerHTML = groups || '<div class="smart-routine__note">Alternatif ürün bulunamadı.</div>';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    var close = modal.querySelector('[data-sr-modal-close]');
    if (close) close.focus();
  }

  function replaceRoutineProduct(step, usageTime, productId) {
    var key = step.indexOf(':') !== -1 ? step : slotId(usageTime, step);
    if (isProductSelectedElsewhere(productId, key)) {
      showRoutineToast('Bu ürün rutinde zaten var. Aynı ürünü iki kez önermiyoruz.', 'warning');
      return;
    }
    routineState.overrides[key] = productId;
    delete routineState.removedSlots[key];
    var root = document.getElementById(SECTION_ID);
    if (root) {
      renderRecommendedRoutine(root);
      hydrateReviewSummaries(root);
    }
    var modal = document.querySelector('[data-sr-alternative-modal]');
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    showRoutineToast('Alternatif ürün rutine eklendi. Toplam tutar güncellendi.', 'success');
  }

  function showRoutineToast(message, type) {
    var toast = document.querySelector('[data-sr-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'smart-routine__toast';
      toast.setAttribute('data-sr-toast', '');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.type = type || 'info';
    toast.classList.add('is-visible');
    clearTimeout(showRoutineToast._timer);
    showRoutineToast._timer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2100);
  }

  function bindEvents(root) {
    root.addEventListener('click', function (event) {
      var goal = event.target.closest('[data-sr-goal]');
      if (goal) {
        var id = goal.getAttribute('data-sr-goal');
        if (routineState.selectedGoals.indexOf(id) !== -1) routineState.selectedGoals = routineState.selectedGoals.filter(function (item) { return item !== id; });
        else routineState.selectedGoals.push(id);
        routineState.overrides = {};
        routineState.removedSlots = {};
        renderSelectedGoals(root);
        renderRecommendedRoutine(root);
        hydrateReviewSummaries(root);
        return;
      }
      var skin = event.target.closest('[data-sr-skin]');
      if (skin) {
        routineState.selectedSkinType = skin.getAttribute('data-sr-skin') || routineState.selectedSkinType;
        routineState.overrides = {};
        routineState.removedSlots = {};
        renderSkinTypes(root);
        renderRecommendedRoutine(root);
        hydrateReviewSummaries(root);
        return;
      }
      if (event.target.closest('[data-sr-clear-goals]')) {
        routineState.selectedGoals = [];
        routineState.overrides = {};
        routineState.removedSlots = {};
        renderSelectedGoals(root);
        renderRecommendedRoutine(root);
        hydrateReviewSummaries(root);
        return;
      }
      var removeProduct = event.target.closest('[data-sr-remove-product]');
      if (removeProduct) {
        event.preventDefault();
        event.stopPropagation();
        removeRoutineProduct(removeProduct.getAttribute('data-sr-remove-product'));
        return;
      }
      if (event.target.closest('[data-sr-add-cart]')) {
        addRoutineToCart();
        return;
      }
      if (event.target.closest('[data-sr-save]')) {
        saveRoutine();
        return;
      }
      if (event.target.closest('[data-sr-view-routine]')) {
        viewRoutinePage();
        return;
      }
      if (event.target.closest('[data-sr-show-alternatives]')) {
        showAlternatives();
      }
    });

    document.addEventListener('click', function (event) {
      var modal = event.target.closest('[data-sr-alternative-modal]');
      var isBackdrop = event.target.matches('[data-sr-alternative-modal]');
      if (event.target.closest('[data-sr-modal-close]') || isBackdrop) {
        var openModal = modal || document.querySelector('[data-sr-alternative-modal]');
        if (openModal) {
          openModal.classList.remove('is-open');
          openModal.setAttribute('aria-hidden', 'true');
        }
        return;
      }
      var replace = event.target.closest('[data-sr-replace]');
      if (replace) replaceRoutineProduct(replace.getAttribute('data-sr-replace'), '', replace.getAttribute('data-sr-product'));
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var modal = document.querySelector('[data-sr-alternative-modal].is-open');
      if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  async function fetchReviewSummary(slug) {
    if (!slug || isLocalStaticPreview()) return null;
    if (REVIEW_CACHE.has(slug)) return REVIEW_CACHE.get(slug);
    var fallback = null;
    try {
      var response = await fetch(REVIEW_API + '/reviews?product_slug=' + encodeURIComponent(slug), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('review request failed');
      var data = await response.json();
      var summary = data.summary || data;
      var count = readNumber(summary && (summary.approved_count || summary.total_count || summary.reviewCount || summary.review_count));
      var avg = readNumber(summary && (summary.avg_rating || summary.avgRating || summary.rating || data.average));
      if (count > 0 && avg > 0) {
        var normalized = { avg: Math.round(Math.min(5, Math.max(0, avg)) * 10) / 10, count: Math.round(count) };
        REVIEW_CACHE.set(slug, normalized);
        ratingFallback[slug] = normalized;
        return normalized;
      }
    } catch (error) {
      // Live API may be unavailable in local previews; keep ratings empty instead of showing unverifiable social proof.
    }
    if (fallback) REVIEW_CACHE.set(slug, fallback);
    return fallback;
  }

  async function hydrateReviewSummaries(root) {
    var products = routineState.dayRoutine.concat(routineState.nightRoutine).filter(Boolean);
    await Promise.all(products.map(async function (product) {
      var summary = await fetchReviewSummary(product.slug);
      if (!summary) return;
      product.rating = summary.avg;
      product.reviewCount = summary.count;
    }));
    var current = document.getElementById(SECTION_ID);
    if (current && current === root) renderRecommendedRoutine(root);
  }

  function buildStaticControls(root) {
    var goals = root.querySelector('[data-sr-goals]');
    if (goals) {
      goals.innerHTML = goalConfig.map(function (goal) {
        return '<button class="smart-routine__goal" type="button" data-sr-goal="' + esc(goal.id) + '" aria-pressed="false">' +
          '<span class="smart-routine__goal-check">' + iconImg(icon.ui('check'), 'cs-icon cs-icon--sm') + '</span>' +
          iconImg(goal.icon, 'cs-icon cs-icon--goal') +
          '<span>' + esc(goal.label) + '</span>' +
        '</button>';
      }).join('');
    }
    var skins = root.querySelector('[data-sr-skins]');
    if (skins) {
      skins.innerHTML = skinTypes.map(function (skin) {
        return '<button class="smart-routine__skin-pill" type="button" data-sr-skin="' + esc(skin.id) + '" aria-pressed="false">' + esc(skin.label) + '</button>';
      }).join('');
    }
    renderRoutineSteps(root);
  }

  function initSmartRoutine() {
    var root = document.getElementById(SECTION_ID);
    if (!root || root.dataset.smartRoutineReady === 'true') return;
    root.dataset.smartRoutineReady = 'true';
    buildStaticControls(root);
    renderSelectedGoals(root);
    renderSkinTypes(root);
    renderRecommendedRoutine(root);
    bindEvents(root);
    refreshLiveInventory(true).then(function () { renderRecommendedRoutine(root); hydrateReviewSummaries(root); });

    if (window.COSMOSKIN_PRODUCTS_READY && typeof window.COSMOSKIN_PRODUCTS_READY.then === 'function') {
      window.COSMOSKIN_PRODUCTS_READY.then(function () {
        return refreshLiveInventory(true);
      }).then(function () { renderRecommendedRoutine(root); hydrateReviewSummaries(root); }).catch(function () {});
    }

    document.addEventListener('cosmoskin:products-updated', function () {
      refreshRoutinePricesFromCatalog();
      renderRecommendedRoutine(root);
      hydrateReviewSummaries(root);
    });
  }

  window.initSmartRoutine = initSmartRoutine;
  window.COSMOSKIN_SMART_ROUTINE = {
    initSmartRoutine: initSmartRoutine,
    getProductData: getProductData,
    normalizeProductData: normalizeProductData,
    scoreProduct: scoreProduct,
    buildRoutine: buildRoutine,
    renderSelectedGoals: renderSelectedGoals,
    renderRoutineSteps: renderRoutineSteps,
    renderRecommendedRoutine: renderRecommendedRoutine,
    calculateRoutineTotal: calculateRoutineTotal,
    calculateMatchScore: calculateMatchScore,
    addRoutineToCart: addRoutineToCart,
    saveRoutine: saveRoutine,
    showAlternatives: showAlternatives,
    replaceRoutineProduct: replaceRoutineProduct,
    removeRoutineProduct: removeRoutineProduct,
    formatPrice: formatPrice,
    showRoutineToast: showRoutineToast,
    refreshLiveInventory: refreshLiveInventory,
    resolveCatalogPrice: resolveCatalogPrice,
    refreshRoutinePricesFromCatalog: refreshRoutinePricesFromCatalog
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSmartRoutine);
  else initSmartRoutine();
})();
