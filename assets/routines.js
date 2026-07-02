(function () {
  'use strict';

  var KEYS = {
    pending: 'cosmoskin_pending_routine_preferences',
    preferences: 'cosmoskin_routine_preferences',
    profile: 'cosmoskin_routine_profile',
    active: 'cosmoskin_routine_active',
    favorites: 'cosmoskin_routine_favorites',
    history: 'cosmoskin_routine_history',
    cart: 'cosmoskin_cart'
  };

  var ROUTINE_ROUTE = '/account/routines/';
  var ROUTINE_COMPARE_ROUTE = '/account/routine-compare/';
  var API_BASE = ((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '');
  var routineState = {
    auth: null,
    summary: null,
    favorites: [],
    inventory: {},
    currentView: 'dashboard',
    pendingFavorite: null
  };

  var goalLabels = { nem: 'Nem', bariyer: 'Bariyer', isilti: 'Işıltı', leke: 'Leke Karşıtı', akne: 'Akne & Sivilce Karşıtı', hassasiyet: 'Hassasiyet', gozenek: 'Gözenek Sıkılaştırıcı', parlaklik: 'Parlaklık' };
  var skinLabels = { kuru: 'Kuru', karma: 'Karma', yagli: 'Yağlı', hassas: 'Hassas', normal: 'Normal' };

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function readJSON(key, fallback) { try { var value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch (error) { return fallback; } }
  function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {} }
  function removeJSON(key) { try { localStorage.removeItem(key); } catch (error) {} }
  function formatPrice(value) { try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0)); } catch (error) { return Number(value || 0) + ' TL'; } }
  function nowDate() { try { return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch (error) { return 'Bugün'; } }
  function formatDateSafe(value) { try { return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(value ? new Date(value) : new Date()); } catch (error) { return 'Bugün'; } }
  function slugFromProduct(item) { return item && (item.slug || item.id || item.product_slug || item.productSlug || item.handle || item.url || ''); }
  var COSMOSKIN_ICON_BASE = '/assets/icons/cosmoskin/';
  var COSMOSKIN_ICON_MAP = {
    spark:'routine-goal-radiance', shield:'commerce-shield', sun:'routine-step-spf', moon:'routine-step-night', heart:'commerce-heart', user:'account-skin-profile', history:'status-history', compare:'status-compare', bag:'commerce-cart', edit:'system-edit', arrow:'system-arrow-right', lock:'status-lock', target:'routine-goal-tone', plus:'system-plus', info:'status-info', refresh:'status-sync', leaf:'routine-goal-sensitive', truck:'commerce-truck', crown:'account-club', ticket:'commerce-gift', bell:'account-notifications', pin:'account-addresses', invoice:'account-orders', support:'account-support', drop:'routine-goal-hydration', routine:'account-routine', empty:'status-empty', warning:'status-warning', check:'status-check', serum:'routine-step-serum', cleanse:'routine-step-cleanse', moisturize:'routine-step-moisturize', spf:'routine-step-spf', weekly:'routine-step-weekly', night:'routine-step-night', repair:'routine-step-repair'
  };
  var RT_PUBLIC_ICON_MAP = {
    goal: { nem:'routine-goal-hydration', bariyer:'routine-goal-barrier', isilti:'routine-goal-radiance', leke:'routine-goal-tone', gozenek:'routine-goal-pore', hassasiyet:'routine-goal-sensitive', akne:'routine-goal-acne-prone', parlaklik:'routine-goal-radiance' },
    skin: { kuru:'routine-goal-hydration', karma:'routine-goal-barrier', yagli:'routine-goal-pore', hassas:'routine-goal-sensitive', normal:'routine-goal-radiance' },
    sensitivity: { dusuk:'status-check', orta:'routine-goal-barrier', yuksek:'routine-goal-sensitive' },
    style: { minimal:'routine-step-cleanse', orta:'account-routine', kapsamli:'routine-step-weekly' },
    texture: { hafif:'routine-goal-hydration', dengeli:'routine-goal-barrier', zengin:'routine-step-moisturize' }
  };
  function iconPath(name) {
    return COSMOSKIN_ICON_BASE + (COSMOSKIN_ICON_MAP[name] || name || 'routine-goal-radiance') + '.svg';
  }
  function icon(name) {
    return '<span class="rt-icon" aria-hidden="true"><img class="cs-icon cs-icon--routine" src="' + esc(iconPath(name)) + '" alt="" aria-hidden="true" loading="lazy"></span>';
  }
  function publicChoiceIcon(type, id) {
    var group = RT_PUBLIC_ICON_MAP[type] || {};
    return '<span class="rt-public-choice-icon" aria-hidden="true"><img class="cs-icon cs-icon--routine" src="' + esc(COSMOSKIN_ICON_BASE + (group[id] || COSMOSKIN_ICON_MAP.spark) + '.svg') + '" alt="" aria-hidden="true" loading="lazy"></span>';
  }


  function getProducts() {
    var products = window.COSMOSKIN_PRODUCTS || window.products || [];
    if (!Array.isArray(products) && products.products) products = products.products;
    return Array.isArray(products) ? products.filter(function (p) { return p && (p.slug || p.id) && p.name; }) : [];
  }
  function findProduct(slug) { return getProducts().find(function (p) { return p.slug === slug || p.id === slug; }); }
  function pickBySlugs(slugs) { return slugs.map(findProduct).filter(Boolean); }
  function compact(arr) { return (arr || []).filter(Boolean); }
  function uniq(arr) { var seen = new Set(); return (arr || []).filter(function (item) { var key = String(item || ''); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
  function asArray(value) { if (Array.isArray(value)) return value.filter(Boolean); if (value == null || value === '') return []; return [value]; }
  function normalizeText(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
  }

  function defaultPreferences() {
    return {
      selectedGoals: ['isilti', 'nem', 'bariyer'],
      selectedSkinType: 'karma',
      sensitivity: 'orta',
      habit: 'Sabah & Akşam',
      intensity: 'orta',
      tolerance: 'orta',
      avoid: ['Parfüm', 'Ağır Yağlar', 'Alkol', 'Uçucu Yağlar', 'Yüksek Asitler', 'Komedojenik Yapılar'],
      source: 'routine-default',
      updatedAt: new Date().toISOString()
    };
  }

  function normalizePreferences(raw) {
    var base = defaultPreferences();
    raw = raw || {};
    var skinMap = { dry:'kuru', oily:'yagli', combination:'karma', sensitive:'hassas', normal:'normal', kuru:'kuru', yagli:'yagli', karma:'karma', hassas:'hassas' };
    var goalMap = { hydration:'nem', barrier:'bariyer', glow:'isilti', balance:'nem', dehydration:'nem', sensitivity:'hassasiyet', tone:'leke', blemish:'akne', isilti:'isilti', nem:'nem', bariyer:'bariyer', leke:'leke', akne:'akne', hassasiyet:'hassasiyet', gozenek:'gozenek', parlaklik:'parlaklik' };
    var goals = raw.selectedGoals || raw.goals || raw.skinGoals || raw.goal || [];
    if (typeof goals === 'string') goals = goals.split(/[,+]/).map(function (x) { return x.trim(); });
    goals = Array.isArray(goals) ? goals.filter(Boolean) : base.selectedGoals;
    var concerns = raw.concerns || raw.selectedConcerns || [];
    if (typeof concerns === 'string') concerns = concerns.split(/[,+]/).map(function (x) { return x.trim(); });
    if (Array.isArray(concerns)) goals = goals.concat(concerns);
    goals = goals.map(function (id) { return goalMap[id] || id; }).filter(Boolean);
    goals = goals.filter(function (id, index) { return goals.indexOf(id) === index; });
    var skin = raw.selectedSkinType || raw.skinType || raw.skin || base.selectedSkinType;
    skin = skinMap[skin] || skin;
    return Object.assign({}, base, raw, {
      selectedGoals: goals.length ? goals : base.selectedGoals,
      selectedSkinType: skin,
      sensitivity: raw.sensitivity || raw.skinSensitivity || (skin === 'hassas' ? 'orta' : base.sensitivity),
      habit: raw.habit || raw.period || raw.usagePattern || base.habit,
      intensity: raw.intensity || raw.routineIntensity || base.intensity,
      tolerance: raw.tolerance || raw.activeTolerance || base.tolerance,
      avoid: Array.isArray(raw.avoid) ? raw.avoid : base.avoid
    });
  }

  function profileFromAccountUser(user) {
    user = user || {};
    var concerns = Array.isArray(user.secondary_goals) ? user.secondary_goals : (Array.isArray(user.skin_concerns) ? user.skin_concerns : []);
    var primary = user.primary_goal || user.routine_goal || concerns[0] || '';
    var secondary = concerns.find(function (goal) { return goal && goal !== primary; }) || '';
    return {
      skinType: user.skin_type || '',
      sensitivity: user.skin_sensitivity || user.sensitivity || '',
      primaryGoal: primary,
      secondaryGoal: secondary,
      routineStyle: user.routine_style || user.routine_intensity || '',
      budgetBand: user.budget_band || '',
      avoidIngredients: user.avoid_ingredients || [],
      preferredTexture: user.preferred_texture || '',
      spfHabit: user.spf_habit || '',
      updatedAt: user.skin_profile_updated_at || user.updatedAt || user.updated_at || ''
    };
  }

  function canonicalProfile() {
    if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.get === 'function') {
      try { return window.COSMOSKINSkinProfile.get() || {}; } catch (e) {}
    }
    return readJSON('cosmoskin_skin_profile', {}) || {};
  }

  function hasProfileData(profile) {
    if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.isNonEmpty === 'function') {
      try { return window.COSMOSKINSkinProfile.isNonEmpty(profile || {}); } catch (e) {}
    }
    profile = profile || {};
    return Boolean(profile.skinType || profile.selectedSkinType || profile.skin_type || profile.primaryGoal || profile.routine_goal || (Array.isArray(profile.selectedGoals) && profile.selectedGoals.length));
  }

  function hasUsableSkinProfile() {
    return hasProfileData(canonicalProfile()) || hasProfileData(readJSON(KEYS.profile, null)) || hasProfileData(readJSON(KEYS.preferences, null)) || hasProfileData(readJSON(KEYS.pending, null)) || hasProfileData(profileFromAccountUser(routineState.summary && routineState.summary.user));
  }

  function syncProfileFromSummary(summary) {
    var profile = profileFromAccountUser(summary && summary.user);
    if (!hasProfileData(profile)) return;
    if (window.COSMOSKINSkinProfile) {
      try {
        if (typeof window.COSMOSKINSkinProfile.merge === 'function') window.COSMOSKINSkinProfile.merge(profile);
        else if (typeof window.COSMOSKINSkinProfile.save === 'function') window.COSMOSKINSkinProfile.save(profile);
        return;
      } catch (e) {}
    }
    writeJSON('cosmoskin_skin_profile', profile);
  }

  function syncRoutineResultFromSummary(summary) {
    var latest = (summary && summary.routine_results || [])[0];
    if (!latest) return;
    var result = latest.result && typeof latest.result === 'object' ? latest.result : {};
    var routine = Object.assign({}, result, {
      id: latest.id || result.id,
      title: latest.routine_title || result.title || 'Kayıtlı Akıllı Rutin',
      name: latest.routine_title || result.name || result.title || 'Kayıtlı Akıllı Rutin',
      score: latest.routine_score || result.routine_score || result.score || 86,
      source: 'backend',
      updatedAt: latest.updated_at || latest.completed_at || latest.created_at || result.updatedAt || new Date().toISOString(),
      skin_profile_snapshot: latest.skin_profile_snapshot || result.skin_profile_snapshot || {},
      morning: latest.morning_steps || result.morning_steps || result.morning || [],
      evening: latest.evening_steps || result.evening_steps || result.evening || [],
      weekly: latest.weekly_steps || result.weekly_steps || result.weekly || [],
      recommended_products: latest.recommended_products || result.recommended_products || result.products || []
    });
    if (Object.keys(routine).length > 2) writeJSON(KEYS.active, routine);
  }

  function getRoutinePreferences() {
    var canonical = null;
    if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.get === 'function') {
      try { canonical = window.COSMOSKINSkinProfile.get(); } catch (e) { canonical = null; }
    }
    var source = readJSON(KEYS.active, null) || readJSON(KEYS.profile, null) || readJSON(KEYS.preferences, null) || readJSON(KEYS.pending, null);
    if (routineState.summary && routineState.summary.user && hasProfileData(profileFromAccountUser(routineState.summary.user))) {
      var remoteProfile = profileFromAccountUser(routineState.summary.user);
      source = Object.assign({}, source || {}, {
        selectedSkinType: remoteProfile.skinType,
        sensitivity: remoteProfile.sensitivity || (source && source.sensitivity) || '',
        selectedGoals: [remoteProfile.primaryGoal, remoteProfile.secondaryGoal].filter(Boolean),
        intensity: remoteProfile.routineStyle || (source && source.intensity) || '',
        updatedAt: remoteProfile.updatedAt || (source && source.updatedAt)
      });
    }
    if (canonical && canonical.skinType) {
      source = Object.assign({}, source || {}, {
        selectedSkinType: canonical.skinType,
        sensitivity: canonical.sensitivity || (source && source.sensitivity) || '',
        selectedGoals: [canonical.primaryGoal, canonical.secondaryGoal].filter(Boolean),
        intensity: canonical.routineStyle || (source && source.intensity) || '',
        updatedAt: canonical.updatedAt
      });
    }
    return normalizePreferences(source);
  }

  function saveRoutinePreferences(prefs, options) {
    var normalized = normalizePreferences(Object.assign({}, prefs || {}, { updatedAt: new Date().toISOString() }));
    writeJSON(KEYS.profile, normalized);
    writeJSON(KEYS.preferences, normalized);
    if (options && options.active !== false) writeJSON(KEYS.active, normalized);
    if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.save === 'function') {
      try {
        window.COSMOSKINSkinProfile.save({
          skinType: normalized.selectedSkinType,
          sensitivity: normalized.sensitivity,
          primaryGoal: (normalized.selectedGoals || [])[0] || '',
          secondaryGoal: (normalized.selectedGoals || [])[1] || '',
          routineStyle: normalized.intensity
        });
      } catch (e) {}
    }
    return normalized;
  }

  function mergePendingRoutinePreferences() {
    var pending = readJSON(KEYS.pending, null);
    if (!pending) return getRoutinePreferences();
    var merged = normalizePreferences(Object.assign({}, getRoutinePreferences(), pending, { updatedAt: new Date().toISOString() }));
    writeJSON(KEYS.profile, merged);
    writeJSON(KEYS.preferences, merged);
    writeJSON(KEYS.active, merged);
    try { localStorage.removeItem(KEYS.pending); } catch (error) {}
    return merged;
  }

  function goalText(prefs) { return (prefs.selectedGoals || []).map(function (id) { return goalLabels[id] || id; }).join(' · ') || 'Aydınlık · Nem · Bariyer'; }
  function skinText(prefs) { return skinLabels[prefs.selectedSkinType] || prefs.selectedSkinType || 'Karma'; }
  function cap(text) { text = String(text || ''); return text ? text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1) : ''; }
  function productImage(slug, fallbackIndex) {
    var p = findProduct(slug) || getProducts()[fallbackIndex || 0] || {};
    return p.image || '/assets/packaging-mockup-premium.png';
  }

  function recommendProducts(prefs) {
    var goals = (prefs.selectedGoals || []).join(' ').toLocaleLowerCase('tr-TR');
    var preferred = [];
    if (/nem|bariyer/.test(goals)) preferred = preferred.concat(['anua-heartleaf-77-soothing-toner','torriden-dive-in-hyaluronic-acid-serum','torriden-solid-in-ceramide-cream','cosrx-advanced-snail-96-mucin-essence']);
    if (/isilti|leke|parlak/.test(goals)) preferred = preferred.concat(['beauty-of-joseon-glow-deep-serum','beauty-of-joseon-glow-serum-propolis-niacinamide','goodal-green-tangerine-vitamin-c-serum','im-from-rice-toner']);
    if (/hassas|akne|gozenek/.test(goals)) preferred = preferred.concat(['anua-heartleaf-pore-control-cleansing-oil','round-lab-1025-dokdo-cleanser','skin1004-madagascar-centella-ampoule','some-by-mi-aha-bha-miracle-toner']);
    preferred = preferred.concat(['beauty-of-joseon-relief-sun-spf50','skin1004-hyalu-cica-water-fit-sun-serum','cosrx-low-ph-good-morning-gel-cleanser','round-lab-birch-juice-sunscreen']);
    var used = new Set();
    var list = [];
    preferred.forEach(function (slug) { var p = findProduct(slug); if (p && !used.has(p.slug)) { used.add(p.slug); list.push(p); } });
    getProducts().forEach(function (p) { if (list.length < 12 && !used.has(p.slug)) { used.add(p.slug); list.push(p); } });
    return list;
  }

  function hydrateRoutineProduct(item) {
    if (!item) return null;
    var slug = typeof item === 'string' ? item : (item.slug || item.id || item.product_slug || item.productSlug || item.url || '');
    var catalog = findProduct(slug) || (window.COSMOSKIN_PRODUCT_HELPERS && window.COSMOSKIN_PRODUCT_HELPERS.getProductByHandle ? window.COSMOSKIN_PRODUCT_HELPERS.getProductByHandle(slug) : null);
    return catalog || (item.name ? {
      id: item.slug || item.id,
      slug: item.slug || item.id,
      name: item.name,
      brand: item.brand || 'COSMOSKIN',
      category: item.category || '',
      price: Number(item.price || 0),
      image: item.image || '/assets/packaging-mockup-premium.png',
      url: item.url || ('/products/' + (item.slug || item.id) + '.html')
    } : null);
  }

  function getRoutineProfile() {
    return getRoutinePreferences();
  }

  function getProductCatalog() {
    return getProducts();
  }

  function productText(product) {
    return normalizeText([product && product.brand, product && product.name, product && product.category, product && product.keywordText, (product && product.keywords || []).join(' ')].join(' '));
  }

  function productMatchesGoal(product, goal) {
    var text = productText(product);
    var terms = {
      nem: ['nem', 'hydration', 'hyaluronic', 'hyaluronik', 'moisture', 'aqua', 'water'],
      bariyer: ['bariyer', 'barrier', 'ceramide', 'seramid', 'snail', 'mucin', 'panthenol', 'centella', 'cica'],
      isilti: ['glow', 'isilt', 'bright', 'radiance', 'rice', 'pirinc', 'vitamin c', 'niacinamide', 'niasinamid'],
      parlaklik: ['glow', 'isilt', 'parlak', 'bright', 'radiance', 'rice', 'vitamin c', 'niacinamide'],
      leke: ['leke', 'spot', 'vitamin c', 'arbutin', 'niacinamide', 'tangerine', 'bright'],
      akne: ['akne', 'acne', 'pimple', 'salicylic', 'salisilik', 'aha', 'bha', 'pore', 'gözenek', 'gozenek'],
      gozenek: ['pore', 'gözenek', 'gozenek', 'sebum', 'bha', 'clay', 'pad'],
      hassasiyet: ['hassas', 'sensitive', 'heartleaf', 'centella', 'cica', 'soothing', 'yatistir']
    };
    return (terms[goal] || [goal]).some(function (term) { return text.indexOf(normalizeText(term)) !== -1; });
  }

  function activeTerms(product) {
    var text = productText(product);
    return ['aha','bha','pha','salicylic','salisilik','vitamin c','retinol','arbutin','acid','asit','peeling'].filter(function (term) { return text.indexOf(term) !== -1; });
  }

  function isBarrierProduct(product) {
    var text = productText(product);
    return ['ceramide','seramid','snail','mucin','beta-glucan','beta glucan','panthenol','centella','cica','heartleaf','hyaluronic','hyaluronik'].some(function (term) { return text.indexOf(term) !== -1; });
  }

  function getRoutineProductList(routine) {
    return compact((routine && routine.morning || []).concat(routine && routine.evening || []).map(function (step) { return step && (step.product || step); }));
  }

  function stepFromProduct(product, index, period, label) {
    if (!product) return null;
    var defaultLabels = period === 'morning' ? ['Temizle','Dengele','Nemlendir','Koru'] : ['Temizle','Bakım','Onar','Yenile'];
    return {
      id: period + '-' + index + '-' + product.slug,
      step: index + 1,
      label: label || defaultLabels[index] || 'Bakım',
      product: product
    };
  }

  function hydrateStep(item, index, period) {
    if (!item) return null;
    var product = hydrateRoutineProduct(item.product || item);
    return stepFromProduct(product, index, period, item.label || item.stepLabel || item.step || item.type);
  }

  function stepsFromSlugs(slugs, period) {
    return compact(slugs.map(function (slug, index) { return stepFromProduct(findProduct(slug), index, period); }));
  }

  function routineProductsFromRaw(raw, prefs, fallbackKind) {
    raw = raw || {};
    var morningRaw = raw.morning || raw.day || raw.dayRoutine || raw.morningRoutine || raw.am || [];
    var eveningRaw = raw.evening || raw.night || raw.nightRoutine || raw.eveningRoutine || raw.pm || [];
    var allRaw = raw.products || raw.items || raw.productSlugs || [];
    var morning = asArray(morningRaw).map(function (item, index) { return hydrateStep(item, index, 'morning'); }).filter(Boolean).slice(0, 5);
    var evening = asArray(eveningRaw).map(function (item, index) { return hydrateStep(item, index, 'evening'); }).filter(Boolean).slice(0, 5);
    if ((!morning.length || !evening.length) && allRaw.length) {
      var all = asArray(allRaw).map(hydrateRoutineProduct).filter(Boolean);
      if (!morning.length) morning = all.slice(0, 4).map(function (p, i) { return stepFromProduct(p, i, 'morning'); });
      if (!evening.length) evening = all.slice(4, 8).concat(all.slice(0, Math.max(0, 4 - all.slice(4, 8).length))).map(function (p, i) { return stepFromProduct(p, i, 'evening'); });
    }
    if (morning.length && evening.length) return { morning: morning, evening: evening };
    return generatedRoutineProducts(prefs, fallbackKind || 'active');
  }

  function generatedRoutineProducts(prefs, kind) {
    var goals = (prefs.selectedGoals || []).join(' ');
    var isBright = /isilti|leke|parlak/.test(goals);
    var isSensitive = /hassas/.test(String(prefs.sensitivity || '') + ' ' + goals);
    var maps = {
      active: {
        morning: ['round-lab-1025-dokdo-cleanser','anua-heartleaf-77-soothing-toner', isBright ? 'beauty-of-joseon-glow-serum-propolis-niacinamide' : 'torriden-dive-in-hyaluronic-acid-serum', 'beauty-of-joseon-relief-sun-spf50'],
        evening: ['anua-heartleaf-pore-control-cleansing-oil', isSensitive ? 'skin1004-madagascar-centella-ampoule' : 'some-by-mi-aha-bha-miracle-toner', 'cosrx-advanced-snail-96-mucin-essence', 'torriden-solid-in-ceramide-cream']
      },
      glowBarrier: {
        morning: ['anua-heartleaf-77-soothing-toner','beauty-of-joseon-glow-deep-serum','cosrx-advanced-snail-96-mucin-essence','beauty-of-joseon-relief-sun-spf50'],
        evening: ['anua-heartleaf-pore-control-cleansing-oil','beauty-of-joseon-glow-serum-propolis-niacinamide','torriden-solid-in-ceramide-cream','skin1004-hyalu-cica-water-fit-sun-serum']
      },
      hydration: {
        morning: ['round-lab-dokdo-toner','torriden-dive-in-hyaluronic-acid-serum','cosrx-oil-free-ultra-moisturizing-lotion','round-lab-birch-juice-sunscreen'],
        evening: ['round-lab-1025-dokdo-cleanser','cosrx-advanced-snail-96-mucin-essence','laneige-water-sleeping-mask','dr-jart-ceramidin-cream']
      },
      balance: {
        morning: ['cosrx-low-ph-good-morning-gel-cleanser','skin1004-centella-toning-toner','skin1004-madagascar-centella-ampoule','skin1004-hyalu-cica-water-fit-sun-serum'],
        evening: ['anua-heartleaf-pore-control-cleansing-oil','cosrx-aha-bha-clarifying-treatment-toner','cosrx-acne-pimple-master-patch','cosrx-oil-free-ultra-moisturizing-lotion']
      }
    };
    var selected = maps[kind] || maps.active;
    return { morning: stepsFromSlugs(selected.morning, 'morning'), evening: stepsFromSlugs(selected.evening, 'evening') };
  }

  function normalizeRoutineRecord(raw, prefs, fallbackKind, index) {
    raw = raw || {};
    var flow = routineProductsFromRaw(raw, prefs, fallbackKind);
    var goals = uniq(asArray(raw.goals || raw.selectedGoals || raw.skinGoals || prefs.selectedGoals)).slice(0, 4);
    var routine = {
      id: raw.id || raw.key || raw.slug || (fallbackKind || 'routine') + '-' + (index || 0),
      name: raw.name || raw.title || (fallbackKind === 'active' ? 'Dengeli & Aydınlık Bakım Rutini' : fallbackKind === 'hydration' ? 'Nem & Konfor Rutini' : fallbackKind === 'balance' ? 'Gözenek & Denge Rutini' : 'Parlaklık & Bariyer Rutini'),
      source: raw.source || fallbackKind || 'generated',
      skinType: raw.skinType || raw.selectedSkinType || prefs.selectedSkinType || 'karma',
      sensitivity: raw.sensitivity || prefs.sensitivity || 'orta',
      goals: goals.length ? goals : ['isilti','nem','bariyer'],
      morning: flow.morning,
      evening: flow.evening,
      createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString()
    };
    routine.score = Number(raw.score || raw.routineScore || calculateRoutineScore(routine, prefs));
    routine.estimatedMinutes = Number(raw.estimatedMinutes || raw.time || Math.max(6, Math.round((routine.morning.length + routine.evening.length) * 1.1)));
    return routine;
  }

  function serializeRoutine(routine, source) {
    return {
      id: routine.id,
      name: routine.name,
      source: source || routine.source || 'routine-compare',
      score: routine.score,
      skinType: routine.skinType,
      sensitivity: routine.sensitivity,
      goals: routine.goals,
      estimatedMinutes: routine.estimatedMinutes,
      dayRoutine: (routine.morning || []).map(function (step) { return Object.assign({ label: step.label }, step.product); }),
      nightRoutine: (routine.evening || []).map(function (step) { return Object.assign({ label: step.label }, step.product); }),
      updatedAt: new Date().toISOString()
    };
  }

  function getActiveRoutine() {
    var prefs = getRoutineProfile();
    var raw = readJSON(KEYS.active, null) || {};
    return normalizeRoutineRecord(raw, prefs, 'active', 0);
  }

  function getRoutineHistory() {
    var prefs = getRoutineProfile();
    var history = readJSON(KEYS.history, []);
    if (!Array.isArray(history)) history = [];
    return history.map(function (item, index) { return normalizeRoutineRecord(item, prefs, 'history', index); });
  }

  function getGeneratedCompareRoutines(prefs) {
    return [
      normalizeRoutineRecord({ id:'generated-glow-barrier', name:'Parlaklık & Bariyer Rutini', goals:['isilti','bariyer'] }, prefs, 'glowBarrier', 1),
      normalizeRoutineRecord({ id:'generated-hydration', name:'Nem & Konfor Rutini', goals:['nem','bariyer','hassasiyet'] }, prefs, 'hydration', 2),
      normalizeRoutineRecord({ id:'generated-balance', name:'Gözenek & Denge Rutini', goals:['gozenek','akne','hassasiyet'] }, prefs, 'balance', 3)
    ];
  }

  function getDefaultCompareRoutine(selectedId) {
    var prefs = getRoutineProfile();
    var routines = getRoutineHistory().concat(getGeneratedCompareRoutines(prefs));
    return routines.find(function (routine) { return routine.id === selectedId; }) || routines[0] || normalizeRoutineRecord({}, prefs, 'glowBarrier', 1);
  }

  function calculateGoalMatch(routine, prefs) {
    var goals = uniq((prefs.selectedGoals || []).concat(routine.goals || [])).slice(0, 4);
    var products = getRoutineProductList(routine);
    if (!goals.length || !products.length) return 72;
    var hits = products.reduce(function (sum, product) {
      return sum + goals.reduce(function (inner, goal) { return inner + (productMatchesGoal(product, goal) ? 1 : 0); }, 0);
    }, 0);
    return Math.min(100, Math.round(58 + (hits / Math.max(1, goals.length * products.length)) * 42));
  }

  function calculateBarrierSupport(routine) {
    var products = getRoutineProductList(routine);
    var hits = products.filter(isBarrierProduct).length;
    return Math.min(100, Math.round(48 + (hits / Math.max(1, products.length)) * 52));
  }

  function calculateSensitivityFit(routine, prefs) {
    var products = getRoutineProductList(routine);
    var activeCount = products.reduce(function (sum, product) { return sum + activeTerms(product).length; }, 0);
    var soothing = products.filter(function (product) { return /heartleaf|centella|cica|soothing|hassas|sensitive|snail|ceramide|seramid/.test(productText(product)); }).length;
    var sensitivity = normalizeText(prefs.sensitivity || routine.sensitivity || '');
    var penalty = /yuksek|orta|hassas/.test(sensitivity) ? activeCount * 7 : activeCount * 3;
    return Math.max(38, Math.min(100, 78 + soothing * 4 - penalty));
  }

  function detectProductConflicts(routine) {
    var products = getRoutineProductList(routine);
    var categories = {};
    products.forEach(function (product) { categories[product.category] = (categories[product.category] || 0) + 1; });
    var activeCount = products.reduce(function (sum, product) { return sum + (activeTerms(product).length ? 1 : 0); }, 0);
    var duplicateSteps = Object.keys(categories).filter(function (category) { return categories[category] > 3; }).length;
    var warnings = [];
    if (activeCount >= 3) warnings.push('Aktif içerik yoğunluğu yüksek');
    if (duplicateSteps) warnings.push('Benzer adım tekrarı var');
    return { count: warnings.length, warnings: warnings, activeCount: activeCount, duplicateSteps: duplicateSteps };
  }

  function calculateMorningPracticality(routine) {
    var steps = routine && routine.morning ? routine.morning.length : 0;
    if (steps <= 4) return 92;
    if (steps === 5) return 76;
    return 62;
  }

  function calculateRoutineScore(routine, prefs) {
    var goal = calculateGoalMatch(routine, prefs);
    var barrier = calculateBarrierSupport(routine);
    var sensitivity = calculateSensitivityFit(routine, prefs);
    var practical = calculateMorningPracticality(routine);
    var conflicts = detectProductConflicts(routine).count;
    return Math.max(50, Math.min(98, Math.round(goal * .36 + barrier * .24 + sensitivity * .24 + practical * .16 - conflicts * 4)));
  }

  function metricLabel(score) {
    if (score >= 88) return 'Çok yüksek';
    if (score >= 76) return 'Yüksek';
    if (score >= 62) return 'Orta';
    return 'Dikkat';
  }

  function deltaChip(delta, warning) {
    if (warning) return { text:'Dikkat', tone:'warn' };
    if (delta >= 4) return { text:'+' + delta + ' daha iyi', tone:'good' };
    if (delta <= -4) return { text:Math.abs(delta) + ' puan geride', tone:'warn' };
    return { text:'Eşit', tone:'neutral' };
  }

  function getProductComparisonBadge(currentStep, compareStep, prefs) {
    var current = currentStep && currentStep.product;
    var compare = compareStep && compareStep.product;
    if (current && compare && current.slug === compare.slug) return { text:'Aynı ürün', tone:'same' };
    if (!compare && current) return { text:'Çıkarıldı', tone:'removed' };
    if (compare && !current) return { text:'Yeni öneri', tone:'new' };
    if (compare && productMatchesGoal(compare, (prefs.selectedGoals || [])[0] || 'nem')) return { text:'Daha uyumlu', tone:'better' };
    if (compare && activeTerms(compare).length && /orta|yuksek/.test(normalizeText(prefs.sensitivity))) return { text:'Dikkat', tone:'warn' };
    return { text:'Yeni öneri', tone:'new' };
  }

  function compareRoutines(active, compared, prefs) {
    active.score = calculateRoutineScore(active, prefs);
    compared.score = calculateRoutineScore(compared, prefs);
    var activeGoal = calculateGoalMatch(active, prefs);
    var comparedGoal = calculateGoalMatch(compared, prefs);
    var activeBarrier = calculateBarrierSupport(active);
    var comparedBarrier = calculateBarrierSupport(compared);
    var activeSensitivity = calculateSensitivityFit(active, prefs);
    var comparedSensitivity = calculateSensitivityFit(compared, prefs);
    var activeConflicts = detectProductConflicts(active);
    var comparedConflicts = detectProductConflicts(compared);
    var activePracticality = calculateMorningPracticality(active);
    var comparedPracticality = calculateMorningPracticality(compared);
    return {
      rows: [
        ['Cilt hedefi uyumu', goalText({ selectedGoals: active.goals }), goalText({ selectedGoals: compared.goals }), deltaChip(comparedGoal - activeGoal)],
        ['Bariyer desteği', metricLabel(activeBarrier), metricLabel(comparedBarrier), deltaChip(comparedBarrier - activeBarrier)],
        ['Hassasiyet uyumu', metricLabel(activeSensitivity), metricLabel(comparedSensitivity), deltaChip(comparedSensitivity - activeSensitivity)],
        ['Ürün çakışması', activeConflicts.count ? activeConflicts.count + ' uyarı' : 'Temiz', comparedConflicts.count ? comparedConflicts.count + ' uyarı' : 'Temiz', comparedConflicts.count < activeConflicts.count ? { text:'Daha sade', tone:'good' } : comparedConflicts.count > activeConflicts.count ? { text:'Dikkat', tone:'warn' } : { text:'Eşit', tone:'neutral' }],
        ['Sabah pratikliği', metricLabel(activePracticality), metricLabel(comparedPracticality), compared.morning.length < active.morning.length ? { text:'Daha sade', tone:'good' } : deltaChip(comparedPracticality - activePracticality)]
      ],
      compatibility: {
        conflicts: activeConflicts.count || comparedConflicts.count ? (comparedConflicts.count + ' uyarı') : 'Temiz',
        sensitivity: metricLabel(comparedSensitivity),
        actives: comparedConflicts.activeCount >= 3 ? 'Yüksek' : comparedConflicts.activeCount >= 2 ? 'Orta' : 'Düşük',
        barrier: comparedBarrier >= 84 ? 'Evet' : comparedBarrier >= 68 ? 'Kısmen' : 'Hayır'
      },
      changes: buildRoutineChanges(active, compared, prefs)
    };
  }

  function buildRoutineChanges(active, compared, prefs) {
    var activeSteps = (active.morning || []).concat(active.evening || []);
    var comparedSteps = (compared.morning || []).concat(compared.evening || []);
    var changes = [];
    for (var i = 0; i < Math.max(activeSteps.length, comparedSteps.length); i += 1) {
      var current = activeSteps[i] && activeSteps[i].product;
      var next = comparedSteps[i] && comparedSteps[i].product;
      if (!current || !next || current.slug === next.slug) continue;
      var reason = productMatchesGoal(next, 'bariyer') ? 'Bariyer desteği ve konfor odağı güçlenir.' : productMatchesGoal(next, 'isilti') || productMatchesGoal(next, 'leke') ? 'Aydınlık görünüm odağı daha belirgin hale gelir.' : productMatchesGoal(next, 'nem') ? 'Nem desteği daha dengeli bir akışa taşınır.' : 'Cilt profiline daha sade bir ürün akışı sunar.';
      changes.push({ index: i, period: i < (active.morning || []).length ? 'morning' : 'evening', current: current, next: next, reason: reason, badge: getProductComparisonBadge(activeSteps[i], comparedSteps[i], prefs) });
      if (changes.length >= 4) break;
    }
    return changes;
  }

  function activeRoutineProducts(prefs) {
    var day = Array.isArray(prefs.dayRoutine) ? prefs.dayRoutine.map(hydrateRoutineProduct).filter(Boolean) : [];
    var night = Array.isArray(prefs.nightRoutine) ? prefs.nightRoutine.map(hydrateRoutineProduct).filter(Boolean) : [];
    if (day.length || night.length) {
      var fallback = recommendProducts(prefs);
      return {
        morning: (day.length ? day : [fallback[8], fallback[0], fallback[2], fallback[5]]).filter(Boolean).slice(0, 4),
        evening: (night.length ? night : [fallback[6], fallback[1], fallback[2], fallback[4]]).filter(Boolean).slice(0, 4)
      };
    }
    var products = recommendProducts(prefs);
    return {
      morning: [products[8], products[0], products[2], products[5]].filter(Boolean),
      evening: [products[6], products[1], products[2], products[4]].filter(Boolean)
    };
  }

  function productCard(product, opts) {
    opts = opts || {};
    if (!product) return '';
    var favoriteActive = opts.activeFav || isFavorite(product.slug);
    return '<article class="rt-product-card" data-product-slug="' + esc(product.slug) + '">' +
      '<button class="rt-product-card__fav' + (favoriteActive ? ' is-active' : '') + '" type="button" data-rt-favorite="' + esc(product.slug) + '" aria-label="' + (favoriteActive ? 'Favorilerden çıkar' : 'Favorilere ekle') + '">' + icon('heart') + '</button>' +
      '<a class="rt-product-card__media" href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '"><img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy"></a>' +
      '<small>' + esc(product.brand || '') + '</small><strong>' + esc(product.name || '') + '</strong>' +
      '<div class="rt-price">' + esc(formatPrice(product.price)) + '</div>' +
      '<span class="rt-badge rt-badge--stock cm-stock-badge is-unknown" data-cm-stock-badge data-product-slug="' + esc(product.slug) + '">Stok bilgisi kontrol ediliyor</span>' +
      '<div class="rt-product-card__actions"><button class="rt-btn rt-btn--black" type="button" data-rt-add-cart="' + esc(product.slug) + '" data-cm-add-cart="' + esc(product.slug) + '">Sepete Ekle</button><a class="rt-btn" href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '">Ürün Detayı</a><a class="rt-btn" href="/account/routine-profile/">Rutini Düzenle</a></div>' +
    '</article>';
  }

  function productStep(product, index, label) {
    if (!product) return '';
    return '<div class="rt-product-step"><a href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '"><img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy"></a><strong><small>' + (index + 1) + '</small>' + esc(label) + '</strong></div>';
  }

  function routineHref(view) {
    if (view === 'profile') return '/account/routine-profile/';
    if (view === 'favorites') return '/account/routine-favorites/';
    if (view === 'history') return '/account/routine-history/';
    if (view === 'compare') return ROUTINE_COMPARE_ROUTE;
    if (view === 'recommendations') return ROUTINE_ROUTE + '?tab=recommendations';
    return ROUTINE_ROUTE;
  }

  function sidebar(active) {
    var items = [
      ['dashboard', routineHref('dashboard'), 'Akıllı Rutinim', 'spark'],
      ['compare', routineHref('compare'), 'Rutinleri Karşılaştır', 'compare'],
      ['history', routineHref('history'), 'Rutin Geçmişi', 'history'],
      ['favorites', routineHref('favorites'), 'Favori Ürünlerim', 'heart'],
      ['profile', routineHref('profile'), 'Cilt Profilim', 'user'],
      ['recommendations', routineHref('recommendations'), 'Önerilen Ürünler', 'bag']
    ];
    return '<aside class="rt-sidebar rt-card"><div class="rt-sidebar-title">RUTİNLERİM</div><nav class="rt-side-nav" aria-label="Rutin menüsü">' + items.map(function (item) {
      return '<a class="' + (active === item[0] ? 'is-active' : '') + '" href="' + item[1] + '" data-rt-view="' + item[0] + '">' + icon(item[3]) + '<span>' + item[2] + '</span></a>';
    }).join('') + '</nav><div class="rt-side-promo"><p>Cildine iyi gelen, sadece sana özel bir rutin.</p><div class="rt-side-products"><img src="' + esc(productImage('anua-heartleaf-77-soothing-toner',0)) + '" alt=""><img src="' + esc(productImage('torriden-dive-in-hyaluronic-acid-serum',1)) + '" alt=""><img src="' + esc(productImage('torriden-solid-in-ceramide-cream',2)) + '" alt=""><img src="' + esc(productImage('beauty-of-joseon-relief-sun-spf50',3)) + '" alt=""></div><a href="/index.html#smart-routine">Yeni Rutin Oluştur ' + icon('arrow') + '</a></div></aside>';
  }

  function summaryBar(prefs) {
    return '<div class="rt-summary-bar rt-card">' +
      '<div class="rt-summary-item">' + icon('spark') + '<div><small>Cilt Profilin</small><strong>' + esc(skinText(prefs)) + ' · ' + esc(cap(prefs.sensitivity)) + '</strong></div></div>' +
      '<div class="rt-summary-item">' + icon('shield') + '<div><small>Cilt Hedeflerin</small><strong>' + esc(goalText(prefs)) + '</strong></div></div>' +
      '<div class="rt-summary-item">' + icon('refresh') + '<div><small>Rutin Yoğunluğu</small><strong>' + esc(cap(prefs.intensity)) + '</strong></div></div>' +
      '<div class="rt-summary-item">' + icon('leaf') + '<div><small>Oluşturulan Rutin</small><strong>1 Aktif Rutin</strong></div></div>' +
      '<a class="rt-btn" href="/account/routine-profile/">' + icon('edit') + 'Profili Düzenle</a></div>';
  }

  function renderDashboard(host) {
    var prefs = mergePendingRoutinePreferences();
    if (!hasUsableSkinProfile()) {
      host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-page-head"><div><h1 class="rt-h1">Akıllı Rutinim</h1><p class="rt-copy">Cilt profilin tamamlandığında sana daha doğru, daha sade ve gerçek ürün verisine bağlı rutin önerileri sunabiliriz.</p></div><a class="rt-btn rt-btn--black" href="/account/routine-profile/">' + icon('edit') + 'Cilt Profilimi Tamamla</a></div><div class="rt-shell">' + sidebar('dashboard') + '<div class="rt-content"><section class="rt-empty-state rt-card">' + icon('spark') + '<h2>Henüz aktif bir rutinin yok.</h2><p>Cilt tipini ve bakım hedeflerini seçerek sana özel bakım akışını oluşturabilirsin.</p><a class="rt-btn rt-btn--black" href="/account/routine-profile/">Cilt Profilimi Tamamla</a></section></div></div></div></section>';
      return;
    }
    var routine = activeRoutineProducts(prefs);
    var recs = recommendProducts(prefs).slice(0, 6);
    var score = calculateRoutineScore(normalizeRoutineRecord(readJSON(KEYS.active, null) || {}, prefs, 'active', 0), prefs);
    host.innerHTML = '<section class="rt-section"><div class="rt-container">' +
      '<div class="rt-page-head"><div><h1 class="rt-h1">Akıllı Rutinim</h1><p class="rt-copy">Cilt profilin ve hedeflerine göre oluşturulan rutinin görüntülenebilir, düzenlenebilir ve yeni rutinler oluşturabilirsin.</p></div><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">' + icon('spark') + 'Yeni Rutin Oluştur</a></div>' +
      summaryBar(prefs) +
      '<div class="rt-shell">' + sidebar('dashboard') + '<div class="rt-content">' +
        '<section class="rt-routine-hero"><div><span class="rt-tag">Aktif Rutinim · En son güncellendi: ' + esc(nowDate()) + '</span><h2 class="rt-h2">Dengeli & Aydınlık Bakım Rutini</h2><p>Bu rutin, seçtiğin cilt hedefleri ve ürün kategorileri üzerinden hazırlanan bir bakım akışıdır. Uyum skoru, hedef, hassasiyet ve adım yoğunluğu gibi kriterlerle hesaplanan rehber niteliğinde bir değerdir.</p></div><div class="rt-score"><div class="rt-score-ring" style="--score:' + score + '"><strong>' + score + '</strong><span>100</span></div><small>Rutin uyum skoru</small></div></section>' +
        '<section class="rt-routine-flow"><div class="rt-flow-col"><h3 class="rt-flow-title">' + icon('sun') + 'Sabah Rutini</h3><div class="rt-product-steps">' + routine.morning.map(function (p,i) { return productStep(p,i,['Temizle','Dengele','Nemlendir','Koru'][i] || 'Bakım'); }).join('') + '</div></div><div class="rt-flow-col"><h3 class="rt-flow-title">' + icon('moon') + 'Akşam Rutini</h3><div class="rt-product-steps">' + routine.evening.map(function (p,i) { return productStep(p,i,['Temizle','Bakım','Onar','Yenile'][i] || 'Bakım'); }).join('') + '</div></div></section>' +
        '<section class="rt-reason"><h3>' + icon('sun') + 'Neden Bu Ürünler?</h3><p>Bu rutin, cilt tipin (' + esc(skinText(prefs).toLocaleLowerCase('tr-TR')) + '), cilt hedeflerin ve içerik tercihlerin göz önünde bulundurularak hazırlandı.</p><div class="rt-reason-list"><span>' + icon('spark') + 'Aydınlık görünümü destekler</span><span>' + icon('shield') + 'Cilt bariyerini güçlendirir</span><span>' + icon('leaf') + 'Nem dengesini korur</span><span>' + icon('target') + 'Tahrişi azaltmaya yardımcı olur</span></div></section>' +
        '<div class="rt-products-head"><div><h2>Önerilen Ürünler</h2><p>Cilt hedeflerin, rutin yoğunluğun ve ürün kategorilerine göre seçilen gerçek katalog ürünleri.</p></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-add-all>' + icon('bag') + 'Tümünü Sepete Ekle</button> <a class="rt-btn" href="/account/routine-profile/">' + icon('edit') + 'Rutinini Düzenle</a></div></div>' +
        '<div class="rt-products-grid rt-products-grid--six">' + recs.map(function (p) { return productCard(p); }).join('') + '</div>' +
        '<section class="rt-improve rt-card"><div class="rt-improve-head"><h2>Rutinini İyileştir</h2><p>Daha dengeli bir bakım hissi için ilgili ürün seçkilerine göz atabilirsin.</p></div><div class="rt-improve-grid">' + improveCards() + '</div></section>' +
      '</div></div></div></section>';
    refreshInventory(host);
  }

  function improveCards() {
    var items = [
      ['Ekstra Nem Desteği','Nem desteğini güçlendiren hafif serum ve essence seçeneklerini keşfet.','torriden-dive-in-hyaluronic-acid-serum','/collections/hydration.html'],
      ['Gözenek & Denge','Rutinini yormadan arındırma ve sebum görünümü odağı ekleyebilirsin.','some-by-mi-aha-bha-miracle-toner','/collections/pore-sebum.html'],
      ['Bariyer Desteği','Gece rutininde konfor ve bariyer görünümünü destekleyen kremleri incele.','torriden-solid-in-ceramide-cream','/collections/barrier.html']
    ];
    return items.map(function (item) { return '<a class="rt-improve-card" href="' + esc(item[3]) + '"><img src="' + esc(productImage(item[2],0)) + '" alt=""><div><strong>' + esc(item[0]) + '</strong><span>' + esc(item[1]) + '</span><b>Ürünleri Keşfet ' + icon('arrow') + '</b></div></a>'; }).join('');
  }

  function renderRecommendationsPage(host) {
    var prefs = mergePendingRoutinePreferences();
    if (!hasUsableSkinProfile()) {
      host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-shell">' + sidebar('recommendations') + '<div class="rt-content"><section class="rt-empty-state rt-card">' + icon('bag') + '<h1>Öneriler için cilt profilin gerekli.</h1><p>Cilt profilini tamamladığında sana daha doğru ürün önerileri sunabiliriz.</p><a class="rt-btn rt-btn--black" href="/account/routine-profile/">Cilt Profilimi Tamamla</a></section></div></div></div></section>';
      return;
    }
    var products = recommendProducts(prefs).slice(0, 12);
    host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-page-head"><div><h1 class="rt-h1">Önerilen Ürünler</h1><p class="rt-copy">Cilt profilin, hedeflerin ve tercih ettiğin rutin yoğunluğu dikkate alınarak seçilen gerçek katalog ürünleri.</p></div><a class="rt-btn" href="/allproducts.html">Tüm Ürünleri Keşfet</a></div><div class="rt-shell">' + sidebar('recommendations') + '<div class="rt-content">' + (products.length ? '<div class="rt-products-grid">' + products.map(function (p) { return productCard(p); }).join('') + '</div>' : '<section class="rt-empty-state rt-card">' + icon('bag') + '<h2>Bu profile uygun ürün önerisi şu anda bulunmuyor.</h2><p>Katalog güncellendikçe bu alan yenilenecek.</p><a class="rt-btn rt-btn--black" href="/allproducts.html">Tüm ürünleri keşfet</a></section>') + '</div></div></div></section>';
    refreshInventory(host);
  }

  function renderWelcome(host) {
    var prefs = normalizePreferences(readJSON(KEYS.pending, null) || readJSON(KEYS.preferences, null));
    var hasPending = !!readJSON(KEYS.pending, null);
    host.innerHTML = '<section class="rt-section"><div class="rt-container">' +
      '<div class="rt-welcome-hero"><div class="rt-welcome-copy"><p class="rt-eyebrow">AKILLI RUTİN MERKEZİ</p><h1 class="rt-h1">Cildine özel bakım yolculuğunu başlat.</h1><p class="rt-copy">COSMOSKIN Akıllı Rutin, cilt hedeflerin ve alışkanlıklarına göre senin için sade bir sabah ve akşam planı oluşturur. Cildi yormayan, dengeli ve sürdürülebilir bir bakışla tanış.</p><div class="rt-welcome-actions"><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">Akıllı Rutine Başlat</a></div><div class="rt-avatars"><div class="rt-avatars__stack"><span class="rt-avatar">C</span><span class="rt-avatar">S</span><span class="rt-avatar">K</span></div><div><strong>Kişisel rutin akışı</strong><span>seçimlerinle gerçek ürün verisine bağlanır.</span></div></div></div>' +
      '<div class="rt-flow-board">' +
        '<div class="rt-flow-card"><h3>' + icon('target') + 'Cilt Hedeflerini</h3><div class="rt-pill-row"><span class="rt-pill">Nem</span><span class="rt-pill">Parlaklık</span><span class="rt-pill">Işıltı</span><span class="rt-pill">Sivilce</span><span class="rt-pill">Hassasiyet</span></div></div>' +
        '<div class="rt-flow-card"><h3>' + icon('sun') + 'Sabah Akışı</h3>' + miniSteps(['Temizle','Dengele','Nemlendir','Koru']) + '</div>' +
        '<div class="rt-flow-card"><h3>' + icon('moon') + 'Akşam Akışı</h3>' + miniSteps(['Temizle','Bakım','Onar','Yenile']) + '</div>' +
        '<div class="rt-flow-card"><h3>' + icon('spark') + 'Anasayfada seçtiğin Akıllı Rutin seçimlerin bu rutine kolayca yansır.</h3><p class="rt-copy" style="margin:0;font-size:12px">Seçimlerin senkronize edilir.</p></div>' +
      '</div><aside class="rt-login-card rt-card">' + icon('lock') + '<div><h2>Rutinini kaydet</h2><p>Rutinlerini kaydetmek ve istediğin zaman kaldığın yerden devam etmek için giriş yapmalısın.</p></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-auth="login">Giriş Yap</button><button class="rt-link-auth" type="button" data-rt-auth="register">Hesabın yok mu? Kayıt Ol →</button></div></aside></div>' +
      '<div class="rt-feature-row rt-card"><div class="rt-feature">' + icon('target') + '<strong>Cilt Hedefine Göre</strong><span>Hedeflerine uygun sade bir plan oluşturur.</span></div><div class="rt-feature">' + icon('sun') + '<strong>Sabah & Akşam Akışı</strong><span>Güne ve geceye uygun iki ayrı akış sunar.</span></div><div class="rt-feature">' + icon('shield') + '<strong>Ürün Uyumu</strong><span>İçerik uyumsuzluklarını tespit edip öneriler önerir.</span></div><div class="rt-feature">' + icon('leaf') + '<strong>Sade Akış</strong><span>Az adımla etkili sonuç, cildi yormayan rutin.</span></div><div class="rt-feature">' + icon('bag') + '<strong>Sepette Hazır Sonuç</strong><span>Rutini tamamladığında kolayca sepete ekle.</span></div></div>' +
      '<section class="rt-how"><p class="rt-eyebrow">NASIL ÇALIŞIR?</p><h2 class="rt-h2">Rutinini 3 adımda oluştur.</h2><div class="rt-step-grid"><div class="rt-step-card"><small>01</small><strong>Cilt hedefini seç</strong><p>Nem, parlaklık, sivilce, hassasiyet gibi hedeflerinden birini veya birkaçını seç.</p></div><div class="rt-step-arrow"></div><div class="rt-step-card"><small>02</small><strong>Kullanım düzenini belirle</strong><p>Sabah ve/veya akşam akışını ve cilt tipine uygun tercihlerini belirle.</p></div><div class="rt-step-arrow"></div><div class="rt-step-card"><small>03</small><strong>Kişisel önerini al</strong><p>Cildine uygun akıllı bir rutin sırala senin için oluşturulur.</p></div></div></section>' +
      '<section class="rt-preview rt-card"><div><h2 class="rt-h3">Rutin önizleme alanı</h2><p class="rt-copy" style="font-size:13px">Akışını burada görebilirsin. Adımlarını tamamladığında sana özel sabah ve akşam rutinin bu alanda görüntülenecek.</p></div><div class="rt-flow-card"><h3>' + icon('sun') + 'Sabah Rutini</h3>' + miniSteps(['Temizle','Dengele','Nemlendir','Koru']) + '</div><div class="rt-flow-card"><h3>' + icon('moon') + 'Akşam Rutini</h3>' + miniSteps(['Temizle','Bakım','Onar','Yenile']) + '</div><div style="display:grid;place-items:center;color:#b48963">' + icon('leaf') + '</div></section>' +
      '<section class="rt-continue rt-card"><div class="rt-continue-mark">' + icon('refresh') + '</div><div><strong>' + (hasPending ? 'Anasayfada seçtiğin hedefler burada devam eder.' : 'Seçimlerini başlattığında burada devam eder.') + '</strong><p class="rt-copy" style="margin-top:4px;font-size:13px">Hedeflerini, cilt tipini ve tercihlerini bu sayfada senkronize şekilde görebilirsin.</p><div class="rt-continue-values">' + (prefs.selectedGoals || []).slice(0,4).map(function (id) { return '<span class="rt-pill">' + esc(goalLabels[id] || id) + '</span>'; }).join('') + '<span class="rt-pill">' + esc(skinText(prefs)) + '</span><span class="rt-pill">' + esc(prefs.habit) + '</span></div></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-auth="login">Seçimlerimi Devam Ettir</button><a class="rt-btn" href="/index.html#smart-routine">Yeni Rutin Oluştur</a></div></section>' +
      '<section class="rt-promo-banner rt-card"><div><p class="rt-eyebrow">KENDİNE ÖZEL, SADE VE ETKİLİ</p><h2 class="rt-h2">Bakımını sadeleştir, cildine uygun akışını keşfet.</h2><div class="rt-welcome-actions"><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">Rutine Başla</a><button class="rt-btn" type="button" data-rt-auth="login">Giriş Yap</button></div><p class="rt-copy" style="font-size:12px">Güvenli, hızlı ve kişisel bir deneyim.</p></div><div class="rt-promo-art" aria-hidden="true"></div></section>' +
      '<div class="rt-faq-row"><a class="rt-faq-card" href="/contact.html">' + icon('info') + '<span><strong>Rutin nasıl çalışır?</strong><br><small>Akıllı Rutin, hedeflerin ve alışkanlıklarına göre sana özel plan oluşturur.</small></span>' + icon('arrow') + '</a><button class="rt-faq-card" type="button" data-rt-auth="login">' + icon('lock') + '<span><strong>Giriş yapmadan başlayabilir miyim?</strong><br><small>Evet, rutini oluşturup görüntüleyebilirsin. Kaydetmek için giriş yapmalısın.</small></span>' + icon('arrow') + '</button><a class="rt-faq-card" href="/contact.html">' + icon('leaf') + '<span><strong>Öneriler güncellenir mi?</strong><br><small>Evet, hedeflerin ve ürünlerinle öneriler düzenli güncellenir.</small></span>' + icon('arrow') + '</a></div>' +
      '</div></section>';
  }

  function miniSteps(labels) {
    return '<div class="rt-mini-steps">' + labels.map(function (label, index) { return '<span class="rt-mini-step"><i>' + icon(['user','bag','leaf','heart'][index] || 'spark') + '</i>' + esc(label) + '</span>' + (index < labels.length - 1 ? '<span class="rt-mini-arrow"></span>' : ''); }).join('') + '</div>';
  }

  function renderProfile(host) {
    var prefs = mergePendingRoutinePreferences();
    var products = recommendProducts(prefs).slice(0, 4);
    host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-shell">' + sidebar('profile') + '<div class="rt-content"><div class="rt-profile-grid"><div><h1 class="rt-h1" style="font-size:52px">Cilt Profilini Düzenle</h1><p class="rt-copy">Cilt profilini güncelle, sana özel ve daha isabetli öneriler al.</p><div class="rt-reason" style="margin:22px 0 18px">' + icon('info') + '<p>Bu bilgiler, rutinin senin cildine en uygun şekilde oluşturulmasına yardımcı olur. Aynı ürünleri önermemek ve içerik uyumunu artırmak için kullanılır.</p></div>' +
      formBlock('1. Cilt Tipi','skin',[['karma','Karma'],['yagli','Yağlı'],['kuru','Kuru'],['normal','Normal']], prefs.selectedSkinType, false) +
      formBlock('2. Cilt Hassasiyeti','sensitivity',[['dusuk','Düşük'],['orta','Orta'],['yuksek','Yüksek']], prefs.sensitivity, false) +
      formBlock('3. Hedeflerin <small>(Birden fazla seçebilirsin)</small>','goals',[['isilti','Aydınlık'],['nem','Nem'],['bariyer','Bariyer Güçlendirme'],['akne','Akne & Sivilce Karşıtı'],['gozenek','Gözenek Sıkılaştırıcı'],['leke','Leke Karşıtı'],['yaslanma','Yaşlanma Karşıtı']], prefs.selectedGoals, true) +
      formBlock('4. Sabah / Akşam Alışkanlığı','habit',[['Sadece Sabah','Sadece Sabah'],['Sabah & Akşam','Sabah & Akşam'],['Sadece Akşam','Sadece Akşam']], prefs.habit, false) +
      formBlock('5. Rutin Yoğunluğu','intensity',[['minimal','Minimal'],['orta','Orta'],['kapsamli','Kapsamlı']], prefs.intensity, false) +
      formBlock('6. Aktif İçerik Toleransı','tolerance',[['dusuk','Düşük'],['orta','Orta'],['yuksek','Yüksek']], prefs.tolerance, false) +
      '<div class="rt-form-card"><h3>7. Mevcut Ürünlerin <small>(Sahip olduğun ürünleri seç, tekrar önermeyelim)</small></h3><div class="rt-products-owned">' + products.map(function (p) { return '<div class="rt-owned"><img src="' + esc(p.image) + '" alt=""><div><strong>' + esc(p.brand) + '</strong><span>' + esc(p.name.split(':')[0]) + '</span></div><button type="button" data-rt-remove-owned>×</button></div>'; }).join('') + '<button class="rt-add-owned" type="button" data-rt-add-owned>' + icon('plus') + 'Ürün Ekle</button></div></div>' +
      formBlock('8. Kaçındığım İçerikler <small>(İstemediğin içerikleri seç)</small>','avoid',[['Parfüm','Parfüm'],['Ağır Yağlar','Ağır Yağlar'],['Alkol','Alkol'],['Uçucu Yağlar','Uçucu Yağlar'],['Yüksek Asitler','Yüksek Asitler'],['Komedojenik Yapılar','Komedojenik Yapılar']], prefs.avoid, true) +
      '<div class="rt-profile-actions"><button class="rt-btn rt-btn--black" type="button" data-rt-save-profile>Kaydet ve Güncelle</button><a class="rt-btn" href="/account/routines/">İptal</a><button class="rt-btn" type="button" data-rt-reset-profile>Varsayılanlara Dön</button></div></div>' +
      '<aside class="rt-summary-side">' + profileSummary(prefs) + '</aside></div></div></div></div></section>';
  }

  function formBlock(title, group, options, selected, multi) {
    selected = Array.isArray(selected) ? selected : [selected];
    return '<div class="rt-form-card" data-rt-group="' + esc(group) + '" data-rt-multi="' + (multi ? 'true' : 'false') + '"><h3>' + title + '</h3><div class="rt-select-grid">' + options.map(function (option) { return '<button class="rt-choice" type="button" data-rt-value="' + esc(option[0]) + '" aria-pressed="' + (selected.indexOf(option[0]) !== -1 ? 'true' : 'false') + '">' + esc(option[1]) + (selected.indexOf(option[0]) !== -1 ? ' ✓' : '') + '</button>'; }).join('') + '</div></div>';
  }

  function profileSummary(prefs) {
    return '<div class="rt-summary-card rt-card"><h3>Profil Özeti</h3>' +
      line('shield','Cilt Tipi', skinText(prefs)) + line('shield','Hassasiyet', cap(prefs.sensitivity)) + line('spark','Hedefler', goalText(prefs)) + line('moon','Rutin Alışkanlığı', prefs.habit) + line('compare','Rutin Yoğunluğu', cap(prefs.intensity)) + line('refresh','Aktif Toleransı', cap(prefs.tolerance)) + '<a class="rt-btn" style="width:100%;margin-top:12px" href="#top">Özeti Düzenle</a></div>' +
      '<div class="rt-summary-card rt-card"><h3>Canlı Uyum Analizi</h3><div class="rt-analysis-list"><div class="rt-analysis-item"><span>İçerik uyumu</span><b>Uyumlu</b></div><div class="rt-analysis-item"><span>Çakışma kontrolü</span><b>Temiz</b></div><div class="rt-analysis-item"><span>Tekrarsız öneri</span><b>Aktif</b></div><div class="rt-analysis-item"><span>Bariyer dostu öneri</span><b>Açık</b></div></div><p class="rt-copy" style="font-size:11px;margin-top:16px">Profilin son güncelleme tarihi: ' + esc(nowDate()) + '</p></div>';
  }
  function line(ic, label, value) { return '<div class="rt-summary-line">' + icon(ic) + '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div></div>'; }

  function renderFavorites(host) {
    var prefs = mergePendingRoutinePreferences();
    var products = (routineState.favorites || []).map(function (fav) { return hydrateRoutineProduct(fav.product_slug || fav.slug || fav.id) || fav; }).filter(Boolean);
    host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-fav-top"><div><h1 class="rt-h1">Favori Ürünlerim</h1><p class="rt-copy">Beğendiğin ve tekrar almak istediğin ürünleri burada kolayca görüntüleyebilir, rutine ekleyebilirsin.</p><div class="rt-stats"><div class="rt-stat">' + icon('heart') + '<strong>' + products.length + '</strong><span>Toplam Favori Ürün</span><small>Hesabına kayıtlı</small></div><div class="rt-stat">' + icon('bag') + '<strong>' + products.filter(function (p) { return p && p.slug; }).length + '</strong><span>Sepete Uygun</span><small>Stok kontrolüyle</small></div><div class="rt-stat">' + icon('target') + '<strong>' + (hasUsableSkinProfile() ? 'Aktif' : 'Eksik') + '</strong><span>Cilt Profili</span><small>Öneri kalitesi için</small></div><div class="rt-stat">' + icon('refresh') + '<strong>' + esc(nowDate()) + '</strong><span>Son Kontrol</span><small>Favori senkronu</small></div></div></div><aside class="rt-fit-card rt-card"><h3>Favori ürünlerin</h3><p class="rt-copy" style="font-size:12px;margin-top:0">Favoriler, hesap favori API’si ve yerel favori önbelleğiyle senkronize edilir.</p></aside></div><div class="rt-shell">' + sidebar('favorites') + '<div class="rt-content">' + (products.length ? '<div class="rt-filter-bar rt-card"><div class="rt-tabs"><button class="rt-tab is-active" type="button" data-rt-filter="all">Tümü</button></div><select class="rt-sort" aria-label="Sıralama"><option>Eklenme Tarihine Göre</option><option>Fiyata Göre Artan</option><option>Fiyata Göre Azalan</option></select></div><div class="rt-products-grid" data-rt-fav-grid>' + products.map(function (p) { return productCard(p, { activeFav: true }); }).join('') + '</div>' : '<section class="rt-empty-state rt-card">' + icon('heart') + '<h2>Henüz favori ürünün yok.</h2><p>Rutinine uygun ürünleri favorilerine ekleyerek daha sonra kolayca ulaşabilirsin.</p><a class="rt-btn rt-btn--black" href="/allproducts.html">Ürünleri Keşfet</a></section>') + '</div></div></div></section>';
    refreshInventory(host);
  }

  function renderHistory(host) {
    var history = getRoutineHistory();
    if (!history.length) {
      host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-page-head"><div><h1 class="rt-h1">Rutin Geçmişi</h1><p class="rt-copy">Aktif hale getirdiğin veya kaydettiğin rutinler burada listelenir.</p></div><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">Alternatif Rutin Oluştur</a></div><div class="rt-shell">' + sidebar('history') + '<div class="rt-content"><section class="rt-empty-state rt-card">' + icon('history') + '<h2>Henüz rutin geçmişin yok.</h2><p>Bir rutini uyguladığında önceki aktif rutinin burada güvenle saklanır.</p><a class="rt-btn rt-btn--black" href="/account/routines/">Akıllı Rutinime Dön</a></section></div></div></div></section>';
      return;
    }
    host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-page-head"><div><h1 class="rt-h1">Rutin Geçmişi</h1><p class="rt-copy">Kaydettiğin rutinleri inceleyebilir ve istediğin rutini tekrar aktif hale getirebilirsin.</p></div><a class="rt-btn" href="/account/routine-compare/">Rutinleri Karşılaştır</a></div><div class="rt-shell">' + sidebar('history') + '<div class="rt-content"><div class="rt-history-list">' + history.map(function (routine) {
      var meta = routineMeta(routine);
      return '<article class="rt-history-card rt-card"><div><small>' + esc(formatDateSafe(routine.createdAt)) + '</small><h2>' + esc(routine.name) + '</h2><p>' + esc(meta.goals) + ' · ' + esc(meta.productCount) + ' ürün · ' + esc(meta.time) + '</p></div><div class="rt-history-card__actions"><span>Rutin uyum skoru: ' + esc(routine.score) + '/100</span><button class="rt-btn rt-btn--black" type="button" data-rt-apply-history="' + esc(routine.id) + '">Rutini Aktif Yap</button></div></article>';
    }).join('') + '</div></div></div></div></section>';
  }

  function routineMeta(routine) {
    var products = getRoutineProductList(routine);
    return {
      goals: goalText({ selectedGoals: routine.goals || [] }),
      skin: (skinLabels[routine.skinType] || cap(routine.skinType) || 'Karma') + ' + ' + cap(routine.sensitivity || 'orta'),
      productCount: uniq(products.map(function (p) { return p.slug; })).length,
      time: '~' + (routine.estimatedMinutes || Math.max(6, products.length)) + ' dk'
    };
  }

  function scoreRing(score, light) {
    var value = Math.max(0, Math.min(100, Number(score || 0)));
    return '<div class="routine-compare-score' + (light ? ' routine-compare-score--light' : '') + '" style="--score:' + value + '"><strong>' + value + '</strong><span>/100</span></div>';
  }

  function summaryCard(routine, title, selectorHtml) {
    var meta = routineMeta(routine);
    return '<article class="routine-compare-summary rt-card"><div><span>' + esc(title) + '</span>' + (selectorHtml || '<h2>' + esc(routine.name) + '</h2>') + '<p>' + icon('user') + esc(meta.skin) + '</p><p>' + icon('target') + esc(meta.goals) + '</p></div><div class="routine-compare-score-wrap">' + scoreRing(routine.score, true) + '<small>Rutin uyum skoru</small></div><footer><small>Sabah ' + routine.morning.length + ' adım</small><small>Akşam ' + routine.evening.length + ' adım</small><small>' + meta.productCount + ' ürün</small><small>' + esc(meta.time) + '</small></footer></article>';
  }

  function routineSelect(routines, selected) {
    return '<label class="routine-compare-select"><span class="visually-hidden">Karşılaştırılacak rutin</span><select data-rt-compare-select>' + routines.map(function (routine) {
      var suffix = /^generated|glowBarrier|hydration|balance/.test(String(routine.source || routine.id)) ? ' · önerilen alternatif' : '';
      return '<option value="' + esc(routine.id) + '"' + (routine.id === selected.id ? ' selected' : '') + '>' + esc(routine.name + suffix) + '</option>';
    }).join('') + '</select></label>';
  }

  function metricCard(routine, label, dark) {
    var meta = routineMeta(routine);
    var rows = [
      ['sun', 'Sabah Adım Sayısı', routine.morning.length + ' adım'],
      ['moon', 'Akşam Adım Sayısı', routine.evening.length + ' adım'],
      ['bag', 'Toplam Ürün', meta.productCount + ' ürün'],
      ['history', 'Tahmini Süre', meta.time],
      ['target', 'Öne Çıkan Hedefler', meta.goals]
    ];
    return '<article class="routine-compare-hero-card' + (dark ? ' is-dark' : '') + '"><div class="routine-compare-hero-head"><div><span>' + esc(label) + '</span><h2>' + esc(routine.name) + '</h2></div><div class="routine-compare-score-wrap">' + scoreRing(routine.score, !dark) + '<small>Rutin uyum skoru</small></div></div><dl>' + rows.map(function (row) { return '<div>' + icon(row[0]) + '<dt>' + esc(row[1]) + '</dt><dd>' + esc(row[2]) + '</dd></div>'; }).join('') + '</dl></article>';
  }

  function renderAnalysisRows(rows) {
    return rows.map(function (row) {
      var chip = row[3] || { text:'Eşit', tone:'neutral' };
      return '<tr><th scope="row">' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td><td>' + esc(row[2]) + '</td><td><span class="routine-compare-chip is-' + esc(chip.tone || 'neutral') + '">' + esc(chip.text) + '</span></td></tr>';
    }).join('');
  }

  function stepList(title, steps, counterpart, prefs) {
    return '<div class="routine-compare-step-col"><h3>' + esc(title) + '</h3><ol>' + steps.map(function (step, index) {
      var badge = getProductComparisonBadge(counterpart && counterpart[index], step, prefs);
      var product = step.product;
      return '<li><span class="routine-compare-step-no">' + (index + 1) + '</span><div class="routine-compare-step-img"><img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy"></div><div><small>' + esc(step.label) + '</small><strong>' + esc(product.brand) + '</strong><span>' + esc(product.name) + '</span></div><b class="routine-compare-badge is-' + esc(badge.tone) + '">' + esc(badge.text) + '</b></li>';
    }).join('') + '</ol></div>';
  }

  function stepComparison(title, activeSteps, comparedSteps, prefs) {
    return '<section class="routine-compare-panel rt-card"><h2>' + esc(title) + '</h2><div class="routine-compare-step-grid">' + stepList('Mevcut Rutin', activeSteps, comparedSteps, prefs) + stepList('Karşılaştırılan Rutin', comparedSteps, activeSteps, prefs) + '</div></section>';
  }

  function changeCard(change) {
    var current = change.current;
    var next = change.next;
    return '<article class="routine-compare-change"><div class="routine-compare-change-row"><a href="' + esc(current.url || ('/products/' + current.slug + '.html')) + '"><img src="' + esc(current.image) + '" alt="' + esc(current.brand + ' ' + current.name) + '" loading="lazy"></a><div><small>' + esc(current.brand) + '</small><strong>' + esc(current.name) + '</strong><b>' + esc(formatPrice(current.price)) + '</b></div><span aria-hidden="true">→</span><a href="' + esc(next.url || ('/products/' + next.slug + '.html')) + '"><img src="' + esc(next.image) + '" alt="' + esc(next.brand + ' ' + next.name) + '" loading="lazy"></a><div><small>' + esc(next.brand) + '</small><strong>' + esc(next.name) + '</strong><b>' + esc(formatPrice(next.price)) + '</b></div></div><p><strong>Neden?</strong> ' + esc(change.reason) + '</p><div class="routine-compare-change-actions"><a class="rt-btn" href="' + esc(next.url || '/allproducts.html') + '">Ürün Detayı</a><button class="rt-btn rt-btn--black" type="button" data-rt-replace-product data-current-slug="' + esc(current.slug) + '" data-next-slug="' + esc(next.slug) + '" data-period="' + esc(change.period) + '">Bu değişimi uygula</button></div></article>';
  }

  function compatibilityCards(compatibility) {
    var items = [
      ['shield', 'Çakışma Kontrolü', compatibility.conflicts, compatibility.conflicts === 'Temiz' ? 'Önemli bir çakışma yok.' : 'Aktif içerik yoğunluğu kontrol edilmeli.'],
      ['heart', 'Hassasiyet Riski', compatibility.sensitivity === 'Dikkat' ? 'Orta' : compatibility.sensitivity, 'Hassas ciltler için kullanım sıklığı izlenmeli.'],
      ['sun', 'Aktif İçerik Yoğunluğu', compatibility.actives, 'Dengeli bir aktif içerik profili.'],
      ['leaf', 'Bariyer Dostu', compatibility.barrier, 'Bariyer destekleyici içerikler mevcut.']
    ];
    return items.map(function (item) { return '<article class="routine-compare-status">' + icon(item[0]) + '<div><span>' + esc(item[1]) + '</span><strong>' + esc(item[2]) + '</strong><p>' + esc(item[3]) + '</p></div></article>'; }).join('');
  }

  function recommendationCopy(active, compared, comparison) {
    var scoreDelta = compared.score - active.score;
    if (scoreDelta > 3) return {
      title: compared.name + ' daha güçlü bir tercih olabilir.',
      body: 'Bu rutin, seçili cilt hedeflerine göre daha yüksek uyum gösteriyor. Özellikle bariyer desteği, aydınlık görünüm ve ürün tekrarını azaltma tarafında daha dengeli bir akış sunuyor.'
    };
    if (scoreDelta < -3) return {
      title: 'Mevcut rutinin senin profilin için daha dengeli görünüyor.',
      body: 'Karşılaştırılan rutin iyi bir alternatif olsa da mevcut rutinin cilt profilin, hassasiyet seviyen ve sabah pratikliği açısından daha dengeli bir görünüm veriyor.'
    };
    return {
      title: 'İki rutin de cilt profiline uyumlu; fark kullanım önceliklerinde.',
      body: 'Skorlar birbirine yakın. Karşılaştırılan rutin belirli hedeflerde güçlenirken mevcut rutinin daha tanıdık ve sürdürülebilir bir kullanım akışı sunuyor.'
    };
  }

  function renderCompare(host, selectedId) {
    var prefs = mergePendingRoutinePreferences();
    if (!hasUsableSkinProfile()) {
      host.innerHTML = '<section class="rt-section routine-compare-page"><div class="rt-container"><div class="rt-shell">' + sidebar('compare') + '<div class="rt-content"><section class="rt-empty-state rt-card">' + icon('compare') + '<h1>Karşılaştırılacak rutin bulunmuyor.</h1><p>Cilt profilini tamamladığında aktif rutinini önerilen alternatiflerle karşılaştırabilirsin.</p><a class="rt-btn rt-btn--black" href="/account/routine-profile/">Cilt Profilimi Tamamla</a></section></div></div></div></section>';
      return;
    }
    var active = getActiveRoutine();
    var choices = getRoutineHistory().concat(getGeneratedCompareRoutines(prefs));
    var compared = choices.find(function (routine) { return routine.id === selectedId; }) || choices[0] || getDefaultCompareRoutine();
    var comparison = compareRoutines(active, compared, prefs);
    var rec = recommendationCopy(active, compared, comparison);
    host.innerHTML = '<section class="rt-section routine-compare-page"><div class="rt-container"><div class="rt-shell">' + sidebar('compare') + '<div class="rt-content">' +
      '<div class="routine-compare-head"><div><h1 class="rt-h1">Rutin Karşılaştır</h1><p class="rt-copy">Mevcut rutinin ile önerilen veya geçmiş rutinlerini içerik, uyum ve adım bazında karşılaştır.</p></div><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">' + icon('plus') + 'Yeni Rutin Oluştur</a></div>' +
      '<div class="routine-compare-selector">' + summaryCard(active, 'Mevcut Aktif Rutin') + summaryCard(compared, 'Karşılaştırılacak Rutin', routineSelect(choices, compared)) + '</div>' +
      '<div class="routine-compare-cards">' + metricCard(active, 'MEVCUT RUTİN', true) + '<div class="routine-compare-vs">VS</div>' + metricCard(compared, 'KARŞILAŞTIRILAN RUTİN', false) + '</div>' +
      '<section class="routine-compare-panel rt-card"><h2>Uyum Analizi</h2><div class="routine-compare-table-wrap"><table class="routine-compare-table"><thead><tr><th>Kriter</th><th>Mevcut Rutin</th><th>Karşılaştırılan Rutin</th><th>Sonuç</th></tr></thead><tbody>' + renderAnalysisRows(comparison.rows) + '</tbody></table></div></section>' +
      '<div class="routine-compare-steps">' + stepComparison('Sabah Rutini Karşılaştırması', active.morning, compared.morning, prefs) + stepComparison('Akşam Rutini Karşılaştırması', active.evening, compared.evening, prefs) + '</div>' +
      '<section class="routine-compare-panel rt-card"><h2>Rutininde Değişenler</h2><div class="routine-compare-changes">' + (comparison.changes.length ? comparison.changes.map(changeCard).join('') : '<div class="routine-compare-empty">Bu iki rutin arasında ürün değişimi bulunmuyor.</div>') + '</div></section>' +
      '<section class="routine-compare-panel rt-card"><h2>İçerik Uyumu</h2><div class="routine-compare-status-grid">' + compatibilityCards(comparison.compatibility) + '</div></section>' +
      '<section class="routine-compare-decision rt-card"><div class="routine-compare-decision-art"><img src="' + esc(productImage('beauty-of-joseon-dynasty-cream', 4)) + '" alt=""></div><div><span>COSMOSKIN önerisi</span><h2>' + esc(rec.title) + '</h2><p>' + esc(rec.body) + '</p><div class="routine-compare-decision-actions"><button class="rt-btn rt-btn--black" type="button" data-rt-apply-compare data-compare-id="' + esc(compared.id) + '">Bu Rutini Uygula</button><button class="rt-btn" type="button" data-rt-compare-cart data-compare-id="' + esc(compared.id) + '">Ürünleri Sepete Ekle</button><a class="rt-btn" href="/account/routines/">Mevcut Rutinimde Kal</a></div></div></section>' +
      '</div></div></div></section>';
  }

  function waitForAuthClient() {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function tick() {
        if (window.cosmoskinSupabase && window.cosmoskinSupabase.auth) return resolve(window.cosmoskinSupabase);
        if (Date.now() - started > 3500) return resolve(null);
        setTimeout(tick, 60);
      })();
    });
  }

  async function detectAuthState() {
    var storedUser = readJSON('cosmoskin_user', null);
    var client = await waitForAuthClient();
    if (client && client.auth && typeof client.auth.getSession === 'function') {
      try {
        var result = await client.auth.getSession();
        if (result && result.data && result.data.session && result.data.session.user) {
          routineState.auth = { loggedIn: true, user: result.data.session.user, session: result.data.session, source: 'supabase' };
          return routineState.auth;
        }
      } catch (error) {}
    }
    if (storedUser && (storedUser.email || storedUser.id || storedUser.name)) {
      routineState.auth = { loggedIn: false, user: storedUser, session: null, source: 'local_guest' };
      return routineState.auth;
    }
    routineState.auth = { loggedIn: false, user: null, session: null, source: 'none' };
    return routineState.auth;
  }

  async function routineApiFetch(path, options) {
    options = options || {};
    var auth = routineState.auth && routineState.auth.loggedIn ? routineState.auth : await detectAuthState();
    var token = auth && auth.session && auth.session.access_token;
    if (!token) throw new Error('Oturum doğrulanamadı.');
    var headers = Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + token }, options.headers || {});
    var res = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || 'İşlem tamamlanamadı.');
    return data;
  }

  function normalizeFavorite(item) {
    if (!item) return null;
    var slug = item.product_slug || item.product_id || item.slug || item.id || item.url || '';
    var product = hydrateRoutineProduct(slug) || hydrateRoutineProduct(item);
    slug = product && product.slug || slug;
    if (!slug) return null;
    return {
      id: item.id || slug,
      product_slug: slug,
      slug: slug,
      name: product && product.name || item.product_name || item.name || 'Ürün',
      brand: product && product.brand || item.brand || 'COSMOSKIN',
      price: Number(product && product.price || item.price || 0),
      image: product && product.image || item.image || '',
      url: product && product.url || item.url || ('/products/' + slug + '.html')
    };
  }

  function readLocalFavorites() {
    var keys = ['cosmoskin_favorites', 'cosmoskin_favorites_v1', KEYS.favorites];
    for (var i = 0; i < keys.length; i += 1) {
      var raw = readJSON(keys[i], null);
      if (!raw) continue;
      var values = Array.isArray(raw) ? raw : Object.values(raw || {});
      var normalized = values.map(normalizeFavorite).filter(Boolean);
      if (normalized.length) return normalized;
    }
    return [];
  }

  function writeLocalFavorites(favorites) {
    var normalized = (favorites || []).map(normalizeFavorite).filter(Boolean);
    writeJSON('cosmoskin_favorites', normalized.map(function (item) {
      return { id: item.product_slug, slug: item.product_slug, name: item.name, brand: item.brand, price: item.price, image: item.image, url: item.url };
    }));
    try { window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: normalized } })); } catch (e) {}
  }

  function isFavorite(slug) {
    slug = String(slug || '');
    return routineState.favorites.some(function (item) { return item.product_slug === slug || item.slug === slug || item.id === slug; });
  }

  async function loadAccountState() {
    var auth = routineState.auth && routineState.auth.loggedIn ? routineState.auth : await detectAuthState();
    if (!auth.loggedIn) return routineState;
    try {
      if (auth.session && auth.session.access_token) {
        var summary = await routineApiFetch('/account/summary');
        routineState.summary = summary;
        routineState.favorites = (summary.favorites || []).map(normalizeFavorite).filter(Boolean);
        writeLocalFavorites(routineState.favorites);
        syncProfileFromSummary(summary);
        syncRoutineResultFromSummary(summary);
        if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.syncPendingDraft === 'function') {
          try { await window.COSMOSKINRoutineData.syncPendingDraft(auth.session); } catch (syncError) { console.warn('COSMOSKIN routine draft sync skipped:', syncError && syncError.message); }
        }
      } else {
        routineState.favorites = readLocalFavorites();
      }
    } catch (error) {
      if (auth.session && auth.session.access_token) throw error;
      routineState.favorites = readLocalFavorites();
    }
    return routineState;
  }

  function refreshInventory(root) {
    var slugs = qsa('[data-product-slug], [data-cm-stock-badge], [data-cm-add-cart]', root || document).map(function (node) {
      return node.getAttribute('data-product-slug') || node.getAttribute('data-cm-add-cart') || node.dataset.productSlug || '';
    }).filter(Boolean);
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.loadInventory === 'function') {
      window.COSMOSKIN_STOCK.loadInventory(slugs).catch(function () {});
    }
  }

  function openAuth(mode) {
    try { sessionStorage.setItem('cosmoskin_return_to', ROUTINE_ROUTE + '?routineSync=1'); } catch (error) {}
    var panelId = mode === 'register' ? 'registerPanel' : 'loginPanel';
    if (typeof window.COSMOSKIN_OPEN_AUTH === 'function') {
      window.COSMOSKIN_OPEN_AUTH(panelId);
      return;
    }
    var eventName = 'cosmoskin:open-auth-modal';
    try { document.dispatchEvent(new CustomEvent(eventName, { detail: { tab: panelId } })); } catch (error) {}
    var modal = qs('#accountModal');
    if (modal) {
      modal.classList.add('open','show');
      modal.setAttribute('aria-hidden','false');
      var backdrop = qs('#backdrop');
      if (backdrop) backdrop.classList.add('show');
      document.body.classList.add('modal-open');
      qsa('.tab-panel', modal).forEach(function (panel) { panel.classList.toggle('active', panel.id === panelId); panel.hidden = false; });
      qsa('.tab-btn', modal).forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-tab') === panelId); });
      var input = qs('#' + panelId + ' input', modal);
      if (input) setTimeout(function () { input.focus(); }, 80);
      return;
    }
    window.location.href = '/index.html?next=' + encodeURIComponent('/account/routines/?routineSync=1');
  }

  function toast(message) {
    var el = qs('[data-rt-toast]');
    if (!el) { el = document.createElement('div'); el.className = 'rt-toast'; el.setAttribute('data-rt-toast',''); document.body.appendChild(el); }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.classList.remove('is-visible'); }, 2200);
  }

  async function addProductToCart(slug) {
    var p = findProduct(slug);
    if (!p) return false;
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.validateAdd === 'function') {
      var allowed = await window.COSMOSKIN_STOCK.validateAdd({ product_slug: p.slug, quantity: 1 });
      if (!allowed) return false;
    }
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.addItems === 'function') {
      window.COSMOSKIN_CART_API.addItems([{ id:p.slug, slug:p.slug, name:p.name, brand:p.brand, price:p.price, image:p.image, url:p.url, qty:1 }], { openDrawer:false });
    } else {
      var cart = readJSON('cosmoskin_cart', []);
      if (!Array.isArray(cart)) cart = [];
      var existing = cart.find(function (item) { return (item.slug || item.id) === p.slug; });
      if (existing) existing.qty = Number(existing.qty || existing.quantity || 1) + 1;
      else cart.push({ id:p.slug, slug:p.slug, name:p.name, brand:p.brand, price:p.price, image:p.image, url:p.url, qty:1 });
      writeJSON('cosmoskin_cart', cart);
      try { window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: cart } })); } catch (error) {}
    }
    return true;
  }

  async function addRoutineProductsToCart() {
    var prefs = getRoutinePreferences();
    var routine = activeRoutineProducts(prefs);
    var unique = new Set();
    var added = 0;
    for (var i = 0, products = routine.morning.concat(routine.evening); i < products.length; i += 1) {
      var p = products[i];
      if (p && !unique.has(p.slug)) {
        unique.add(p.slug);
        if (await addProductToCart(p.slug)) added += 1;
      }
    }
    toast(added + ' rutin ürünü sepete eklendi.');
  }

  async function addComparedRoutineToCart(compareId) {
    var routine = getDefaultCompareRoutine(compareId);
    var unique = new Set();
    var products = getRoutineProductList(routine);
    var added = 0;
    for (var i = 0; i < products.length; i += 1) {
      var product = products[i];
      if (!product || unique.has(product.slug)) continue;
      unique.add(product.slug);
      if (await addProductToCart(product.slug)) added += 1;
    }
    toast(added + ' ürün sepete eklendi.');
  }

  function applyComparedRoutine(compareId) {
    var active = getActiveRoutine();
    var compared = getDefaultCompareRoutine(compareId);
    var history = readJSON(KEYS.history, []);
    if (!Array.isArray(history)) history = [];
    history.unshift(serializeRoutine(active, 'previous-active'));
    writeJSON(KEYS.history, history.slice(0, 12));
    writeJSON(KEYS.active, serializeRoutine(compared, 'routine-compare-applied'));
    toast('Yeni rutinin aktif hale getirildi.');
    setTimeout(function () { window.location.href = '/account/routines/'; }, 450);
  }

  function replaceRoutineProduct(currentSlug, nextSlug) {
    var active = getActiveRoutine();
    var nextProduct = findProduct(nextSlug);
    if (!nextProduct) return false;
    var replaced = false;
    ['morning','evening'].forEach(function (period) {
      active[period] = (active[period] || []).map(function (step, index) {
        if (!replaced && step.product && step.product.slug === currentSlug) {
          replaced = true;
          return stepFromProduct(nextProduct, index, period, step.label);
        }
        return step;
      });
    });
    active.score = calculateRoutineScore(active, getRoutineProfile());
    writeJSON(KEYS.active, serializeRoutine(active, 'routine-compare-replacement'));
    return replaced;
  }

  async function toggleFavorite(slug, button) {
    var product = hydrateRoutineProduct(slug);
    if (!product) throw new Error('Ürün bilgisi bulunamadı.');
    var wasFavorite = isFavorite(slug);
    function setButton(active) {
      if (!button) return;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-label', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
    }
    setButton(!wasFavorite);
    if (wasFavorite) routineState.favorites = routineState.favorites.filter(function (item) { return item.product_slug !== slug && item.slug !== slug && item.id !== slug; });
    else routineState.favorites = routineState.favorites.concat([normalizeFavorite(product)]);
    writeLocalFavorites(routineState.favorites);
    try {
      var auth = routineState.auth && routineState.auth.loggedIn ? routineState.auth : await detectAuthState();
      if (auth.session && auth.session.access_token) {
        if (wasFavorite) await routineApiFetch('/account/favorites?product_slug=' + encodeURIComponent(slug), { method: 'DELETE' });
        else await routineApiFetch('/account/favorites', { method: 'POST', body: normalizeFavorite(product) });
        await loadAccountState();
      }
      toast(wasFavorite ? 'Ürün favorilerden kaldırıldı.' : 'Ürün favorilerine eklendi.');
    } catch (error) {
      setButton(wasFavorite);
      if (wasFavorite) routineState.favorites = routineState.favorites.concat([normalizeFavorite(product)]);
      else routineState.favorites = routineState.favorites.filter(function (item) { return item.product_slug !== slug && item.slug !== slug && item.id !== slug; });
      writeLocalFavorites(routineState.favorites);
      throw error;
    }
  }

  function routineResultPayloadFromPreferences(normalized) {
    var routine = activeRoutineProducts(normalized);
    var products = [];
    var seen = new Set();
    routine.morning.concat(routine.evening).forEach(function (step) {
      var product = step && (step.product || step);
      if (!product || !product.slug || seen.has(product.slug)) return;
      seen.add(product.slug);
      products.push({ slug: product.slug, name: product.name, brand: product.brand, price: product.price, routine_step: step.label || '', period: step.period || '' });
    });
    var base = {
      selectedGoals: normalized.selectedGoals || [],
      selectedSkinType: normalized.selectedSkinType || '',
      sensitivity: normalized.sensitivity || '',
      routine_style: normalized.intensity || '',
      avoid_ingredients: normalized.avoid || [],
      routine_title: normalized.intensity === 'advanced' || normalized.intensity === 'kapsamli' ? 'Gelişmiş Akıllı Rutin' : normalized.intensity === 'minimal' ? 'Başlangıç Akıllı Rutini' : 'Dengeli Akıllı Rutin',
      routine_score: calculateRoutineScore(routine, normalized),
      morning_steps: routine.morning,
      evening_steps: routine.evening,
      weekly_steps: routine.weekly || [],
      recommended_products: products,
      source_channel: 'routine-center',
      result: serializeRoutine(routine, 'smart-routine-backend-save')
    };
    if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.normalizeRoutineResult === 'function') {
      return window.COSMOSKINRoutineData.normalizeRoutineResult(base, { source: 'routine-center' });
    }
    return {
      routine_key: 'smart-routine-' + Date.now(),
      routine_title: base.routine_title,
      result: base.result,
      recommended_products: products
    };
  }

  async function saveRoutineProfileToAccount(prefs) {
    var normalized = saveRoutinePreferences(prefs);
    var auth = routineState.auth && routineState.auth.loggedIn ? routineState.auth : await detectAuthState();
    if (auth.session && auth.session.access_token) {
      var skinPayload = {
        skin_type: normalized.selectedSkinType || '',
        sensitivity: normalized.sensitivity || '',
        skin_sensitivity: normalized.sensitivity || '',
        primary_goal: (normalized.selectedGoals || [])[0] || '',
        routine_goal: (normalized.selectedGoals || [])[0] || '',
        secondary_goals: (normalized.selectedGoals || []).slice(1).filter(Boolean),
        skin_concerns: (normalized.selectedGoals || []).filter(Boolean),
        routine_style: normalized.intensity || '',
        avoid_ingredients: (normalized.avoid || []).filter(Boolean),
        source_channel: 'routine-center',
        updated_at: new Date().toISOString()
      };
      if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.normalizeSkinProfile === 'function') {
        skinPayload = Object.assign(skinPayload, window.COSMOSKINRoutineData.normalizeSkinProfile(skinPayload, { source: 'routine-center' }));
      }
      var savedSkin = await routineApiFetch('/account/skin-profile', { method: 'POST', body: skinPayload });
      var routinePayload = routineResultPayloadFromPreferences(normalized);
      if (savedSkin && savedSkin.skin_profile && savedSkin.skin_profile.id) routinePayload.skin_profile_id = savedSkin.skin_profile.id;
      await routineApiFetch('/account/routine-results', { method: 'POST', body: routinePayload });
      await loadAccountState();
    }
    return normalized;
  }

  function applyHistoryRoutine(historyId) {
    var routine = getRoutineHistory().find(function (item) { return item.id === historyId; });
    if (!routine) return false;
    var active = getActiveRoutine();
    var history = readJSON(KEYS.history, []);
    if (!Array.isArray(history)) history = [];
    history = history.filter(function (item) { return (item.id || item.key || item.slug) !== historyId; });
    history.unshift(serializeRoutine(active, 'previous-active'));
    writeJSON(KEYS.history, history.slice(0, 12));
    writeJSON(KEYS.active, serializeRoutine(routine, 'history-applied'));
    return true;
  }


  var PUBLIC_ROUTINE_STEPS = [
    { id:'goal', title:'Cilt hedefin', subtitle:'Bugün rutinin hangi görünüm hedefiyle başlasın?' },
    { id:'skin', title:'Cilt tipin', subtitle:'Ürün dokusu ve adım yoğunluğunu buna göre dengeliyoruz.' },
    { id:'sensitivity', title:'Hassasiyet seviyesi', subtitle:'Aktif içerik yoğunluğunu güvenli ve yumuşak tutmak için.' },
    { id:'style', title:'Rutin yoğunluğu', subtitle:'Minimal, dengeli veya daha kapsamlı bir akış seç.' },
    { id:'texture', title:'Doku tercihin', subtitle:'Hafif, dengeli veya zengin doku hissi.' },
    { id:'result', title:'Rutin haritan', subtitle:'Sabah, akşam ve haftalık destek önerin hazır.' }
  ];

  var PUBLIC_GOAL_OPTIONS = [
    ['nem','Nem & Bariyer','Nem dengesi ve konfor hissi'],
    ['leke','Leke & Ton Eşitsizliği','Aydınlık görünüm ve SPF odağı'],
    ['gozenek','Gözenek & Sebum Dengesi','Daha dengeli ve arınmış görünüm'],
    ['hassasiyet','Hassasiyet & Kızarıklık Eğilimi','Daha sakin, bariyer dostu akış'],
    ['akne','Sivilceye Eğilimli Cilt Görünümü','Yormayan denge ve temizlik odağı'],
    ['isilti','Işıltı & Cam Cilt Görünümü','Daha canlı ve nemli görünüm']
  ];
  var PUBLIC_SKIN_OPTIONS = [['kuru','Kuru'],['karma','Karma'],['yagli','Yağlı'],['hassas','Hassas'],['normal','Normal']];
  var PUBLIC_SENSITIVITY_OPTIONS = [['dusuk','Düşük'],['orta','Orta'],['yuksek','Yüksek']];
  var PUBLIC_STYLE_OPTIONS = [['minimal','Minimal'],['orta','Dengeli'],['kapsamli','Gelişmiş']];
  var PUBLIC_TEXTURE_OPTIONS = [['hafif','Hafif doku'],['dengeli','Dengeli doku'],['zengin','Zengin krem hissi']];

  function mapPublicGoal(value) {
    var map = { hydration:'nem', barrier:'bariyer', glow:'isilti', tone:'leke', spot:'leke', blemish:'akne', pore:'gozenek', sebum:'gozenek', sensitive:'hassasiyet', spf:'leke' };
    return map[value] || value;
  }

  function publicWizardState() {
    if (!routineState.publicWizard) {
      var params = new URLSearchParams(window.location.search || '');
      var source = readJSON(KEYS.pending, null) || readJSON(KEYS.preferences, null) || readJSON(KEYS.active, null) || {};
      var goalParam = mapPublicGoal(params.get('goal') || params.get('routine_goal') || '');
      var skinParam = params.get('skin') || '';
      var prefs = normalizePreferences(Object.assign({}, source, {
        selectedGoals: goalParam ? [goalParam] : (source.selectedGoals || ['nem','bariyer']),
        selectedSkinType: skinParam || source.selectedSkinType || 'karma',
        source: 'routine-center-premium'
      }));
      routineState.publicWizard = { step: goalParam ? 1 : 0, prefs: prefs, lastSavedAt: '' };
    }
    return routineState.publicWizard;
  }

  function publicGoalTitle(prefs) {
    if ((prefs.selectedGoals || []).indexOf('leke') !== -1) return 'Leke Görünümü ve Ton Eşitsizliği Rutini';
    if ((prefs.selectedGoals || []).indexOf('gozenek') !== -1) return 'Gözenek & Sebum Dengesi Rutini';
    if ((prefs.selectedGoals || []).indexOf('akne') !== -1) return 'Sivilceye Eğilimli Cilt Görünümü Rutini';
    if ((prefs.selectedGoals || []).indexOf('hassasiyet') !== -1) return 'Hassasiyet Dostu Minimal Rutin';
    if ((prefs.selectedGoals || []).indexOf('isilti') !== -1) return 'Nem & Işıltı Başlangıç Rutini';
    return 'Bariyer Odaklı Dengeli Rutin';
  }

  function publicStepLabel(product, index, period) {
    var text = productText(product);
    if (/spf|sun|güneş|gunes/.test(text)) return 'SPF';
    if (/cleanser|cleansing|temizleyici|oil/.test(text)) return 'Temizle';
    if (/toner|essence|pad|tonik/.test(text)) return 'Hazırla';
    if (/serum|ampoule|ampul|vitamin c/.test(text)) return period === 'evening' ? 'Destekle' : 'Serum';
    if (/cream|krem|lotion|moisturiz|mask/.test(text)) return 'Nemlendir';
    return ['Temizle','Hazırla','Serum','Nemlendir','SPF'][index] || 'Bakım';
  }

  function buildPublicRoutine(prefs) {
    var raw = activeRoutineProducts(prefs);
    var morningProducts = (raw.morning || []).map(function (step) { return step && (step.product || step); }).filter(Boolean).slice(0, 5);
    var eveningProducts = (raw.evening || []).map(function (step) { return step && (step.product || step); }).filter(Boolean).slice(0, 5);
    if ((prefs.selectedGoals || []).indexOf('leke') !== -1 && !morningProducts.some(function (p) { return /spf|sun|güneş|gunes/.test(productText(p)); })) {
      var spf = recommendProducts(Object.assign({}, prefs, { selectedGoals: uniq((prefs.selectedGoals || []).concat(['leke'])) })).find(function (p) { return /spf|sun|güneş|gunes/.test(productText(p)); });
      if (spf && !morningProducts.some(function (p) { return p.slug === spf.slug; })) morningProducts.push(spf);
    }
    var morning = morningProducts.map(function (p, i) { return stepFromProduct(p, i, 'morning', publicStepLabel(p, i, 'morning')); });
    var evening = eveningProducts.map(function (p, i) { return stepFromProduct(p, i, 'evening', publicStepLabel(p, i, 'evening')); });
    var weekly = [];
    if ((prefs.selectedGoals || []).indexOf('hassasiyet') !== -1 || prefs.sensitivity === 'yuksek') weekly.push({ label:'Bariyer destek günü', description:'Aktif içerik yoğunluğunu düşük tutup konfora odaklan.' });
    if ((prefs.selectedGoals || []).indexOf('gozenek') !== -1 || (prefs.selectedGoals || []).indexOf('akne') !== -1) weekly.push({ label:'Denge kontrolü', description:'Arındırıcı adımları düşük sıklıkta ve bariyer desteğiyle dengele.' });
    if ((prefs.selectedGoals || []).indexOf('leke') !== -1) weekly.push({ label:'SPF devamlılığı', description:'Gündüz SPF adımını rutinin sabit parçası olarak koru.' });
    if (!weekly.length) weekly.push({ label:'Nem konforu', description:'Haftada birkaç gün rutini sade tutarak nem desteğini öne çıkar.' });
    var routine = { morning: morning, evening: evening, weekly: weekly, goals: prefs.selectedGoals || [], skinType: prefs.selectedSkinType, sensitivity: prefs.sensitivity };
    routine.score = calculateRoutineScore(routine, prefs);
    return routine;
  }

  function publicReasonForProduct(product, prefs, period) {
    var goals = (prefs.selectedGoals || []).filter(function (goal) { return productMatchesGoal(product, goal); }).map(function (goal) { return goalLabels[goal] || goal; });
    var reason = goals.length ? goals.slice(0, 2).join(' ve ') + ' hedefinle uyumlu' : 'Rutin adımını tamamlar';
    if (prefs.sensitivity === 'yuksek' && activeTerms(product).length) reason += '; düşük sıklıkla başlanması önerilir';
    if (period === 'morning' && /spf|sun|güneş|gunes/.test(productText(product))) reason += '; gündüz SPF adımı için konumlandı';
    return reason + '.';
  }

  function publicProductCard(step, prefs, period) {
    var product = step && (step.product || step);
    if (!product) return '';
    return '<article class="rt-public-product rt-card" data-product-slug="' + esc(product.slug || '') + '">' +
      '<a class="rt-public-product__media" href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '"><img src="' + esc(product.image || '/assets/packaging-mockup-premium.png') + '" alt="' + esc((product.brand || '') + ' ' + (product.name || '')) + '" loading="lazy"></a>' +
      '<div class="rt-public-product__body"><span>' + esc(step.label || publicStepLabel(product, 0, period)) + ' · ' + (period === 'morning' ? 'Sabah' : 'Akşam') + '</span><small>' + esc(product.brand || '') + '</small><strong>' + esc(product.name || '') + '</strong><p><b>Neden önerildi?</b> ' + esc(publicReasonForProduct(product, prefs, period)) + '</p><div class="rt-public-product__foot"><b>' + esc(formatPrice(product.price)) + '</b><a class="rt-btn" href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '">Ürünü İncele</a></div></div>' +
    '</article>';
  }

  function publicChoiceGrid(type, options, selected, multi) {
    selected = Array.isArray(selected) ? selected : [selected].filter(Boolean);
    return '<div class="rt-public-choice-grid rt-public-choice-grid--' + esc(type) + '">' + options.map(function (option) {
      var id = option[0];
      var active = selected.indexOf(id) !== -1;
      return '<button class="rt-public-choice' + (active ? ' is-selected' : '') + '" type="button" data-rt-public-choice="' + esc(type) + '" data-value="' + esc(id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + publicChoiceIcon(type, id) + '<strong>' + esc(option[1]) + '</strong>' + (option[2] ? '<span class="rt-public-choice-copy">' + esc(option[2]) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function publicProgressMarkup(step) {
    return '<div class="rt-public-progress" role="list" aria-label="Akıllı rutin adımları">' + PUBLIC_ROUTINE_STEPS.map(function (item, index) {
      return '<button type="button" role="listitem" data-rt-public-step="' + index + '" class="' + (index === step ? 'is-active' : index < step ? 'is-complete' : '') + '"><span>' + (index + 1) + '</span><b>' + esc(item.title) + '</b></button>';
    }).join('') + '</div>';
  }

  function publicQuestionMarkup(state) {
    var step = state.step;
    var prefs = state.prefs;
    var current = PUBLIC_ROUTINE_STEPS[step] || PUBLIC_ROUTINE_STEPS[0];
    var body = '';
    if (current.id === 'goal') body = publicChoiceGrid('goal', PUBLIC_GOAL_OPTIONS, prefs.selectedGoals || [], true);
    else if (current.id === 'skin') body = publicChoiceGrid('skin', PUBLIC_SKIN_OPTIONS, prefs.selectedSkinType, false);
    else if (current.id === 'sensitivity') body = publicChoiceGrid('sensitivity', PUBLIC_SENSITIVITY_OPTIONS, prefs.sensitivity || 'orta', false);
    else if (current.id === 'style') body = publicChoiceGrid('style', PUBLIC_STYLE_OPTIONS, prefs.intensity || 'orta', false);
    else if (current.id === 'texture') body = publicChoiceGrid('texture', PUBLIC_TEXTURE_OPTIONS, prefs.preferredTexture || 'dengeli', false);
    else body = '<div class="rt-public-ready"><strong>Rutin haritan hazır.</strong><span>Sonucu aşağıda sabah, akşam ve haftalık destek olarak inceleyebilirsin.</span></div>';
    return '<section class="rt-public-wizard rt-card" id="routine-center-start"><div class="rt-public-question-head"><span>Adım ' + (step + 1) + ' / ' + PUBLIC_ROUTINE_STEPS.length + '</span><h2>' + esc(current.title) + '</h2><p>' + esc(current.subtitle) + '</p></div>' + body + '<div class="rt-public-wizard-actions"><button class="rt-btn" type="button" data-rt-public-action="back"' + (step <= 0 ? ' disabled aria-disabled="true"' : '') + '>Geri</button><button class="rt-btn rt-btn--black" type="button" data-rt-public-action="next">' + (step >= PUBLIC_ROUTINE_STEPS.length - 1 ? 'Sonucu Güncelle' : 'Devam Et') + '</button></div><p class="rt-public-note">Bu öneri kozmetik bakım rehberi niteliğindedir; tıbbi teşhis veya tedavi amacı taşımaz.</p></section>';
  }

  function publicFlowMarkup(title, steps, prefs, period) {
    if (!steps.length) return '<div class="rt-public-empty rt-card"><strong>' + esc(title) + '</strong><span>Bu adım için uygun ürün stoğu hazırlanıyor.</span></div>';
    return '<section class="rt-public-flow rt-card"><h3>' + (period === 'morning' ? icon('sun') : icon('moon')) + esc(title) + '</h3><div class="rt-public-step-list">' + steps.map(function (step, index) {
      var product = step.product || step;
      return '<div class="rt-public-step"><span>' + (index + 1) + '</span><div><strong>' + esc(step.label || publicStepLabel(product, index, period)) + '</strong><small>' + esc(product && product.name ? product.name : 'Ürün seçimi hazırlanıyor') + '</small></div></div>';
    }).join('') + '</div></section>';
  }

  function publicResultMarkup(state) {
    var prefs = state.prefs;
    var routine = buildPublicRoutine(prefs);
    var products = uniq((routine.morning || []).concat(routine.evening || []).map(function (step) { return step && step.product && step.product.slug; })).length;
    return '<section class="rt-public-result" data-rt-public-result>' +
      '<div class="rt-public-result-hero rt-card"><div><span class="rt-tag">COSMOSKIN Akıllı Rutin</span><h2>' + esc(publicGoalTitle(prefs)) + '</h2><p>' + esc(skinText(prefs)) + ' cilt, ' + esc(cap(prefs.sensitivity || 'orta')) + ' hassasiyet ve ' + esc(goalText(prefs).toLocaleLowerCase('tr-TR')) + ' hedefleri için oluşturulan bakım rotası.</p><div class="rt-public-profile-chips"><span>' + esc(skinText(prefs)) + '</span><span>' + esc(goalText(prefs)) + '</span><span>' + esc(cap(prefs.intensity || 'orta')) + ' rutin</span><span>' + products + ' ürün</span></div></div><div class="rt-public-score"><div class="rt-score-ring" style="--score:' + routine.score + '"><strong>' + routine.score + '</strong><span>100</span></div><small>Cilt hedeflerin ve tercihlerinle uyum skoru</small></div></div>' +
      '<div class="rt-public-flow-grid">' + publicFlowMarkup('Sabah Rutini', routine.morning, prefs, 'morning') + publicFlowMarkup('Akşam Rutini', routine.evening, prefs, 'evening') + '<section class="rt-public-flow rt-card"><h3>' + icon('leaf') + 'Haftalık Destek</h3><div class="rt-public-step-list">' + routine.weekly.map(function (item, index) { return '<div class="rt-public-step"><span>' + (index + 1) + '</span><div><strong>' + esc(item.label) + '</strong><small>' + esc(item.description) + '</small></div></div>'; }).join('') + '</div></section></div>' +
      '<div class="rt-public-products-head"><div><h2>Önerilen ürünler</h2><p>Öneriler mevcut ürün kataloğundaki bilgilerden hazırlanır. Stok veya ürün verisi yoksa kırık kart gösterilmez.</p></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-public-action="save">Rutini Kaydet</button><button class="rt-btn" type="button" data-rt-public-action="cart">Tümünü Sepete Ekle</button></div></div>' +
      ((routine.morning.length || routine.evening.length) ? '<div class="rt-public-products">' + routine.morning.concat(routine.evening).map(function (step) { return publicProductCard(step, prefs, step.period || 'morning'); }).join('') + '</div>' : '<section class="rt-empty-state rt-card"><h2>Bu adım için uygun ürün stoğu hazırlanıyor.</h2><p>Katalog güncellendikçe rutin önerileri otomatik olarak zenginleşir.</p></section>') +
      '<aside class="rt-public-disclaimer rt-card"><strong>Kozmetik öneri notu</strong><p>Bu rutin, ürün seçimini kolaylaştırmak için hazırlanmış kozmetik bakım rehberidir. Cilt rahatsızlığı, yoğun hassasiyet veya tedavi ihtiyacında dermatoloji uzmanına danışılmalıdır.</p></aside>' +
    '</section>';
  }

  function persistPublicRoutineDraft(prefs) {
    var payload = routineResultPayloadFromPreferences(Object.assign({}, prefs, { source_channel:'routine-center-premium' }));
    if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.buildDraft === 'function') {
      return window.COSMOSKINRoutineData.saveDraft(payload, { source:'routine-center-premium', status:'pending' });
    }
    writeJSON(KEYS.pending, prefs);
    return { skin_profile:prefs, routine_result:payload, source_channel:'routine-center-premium' };
  }

  async function savePublicRoutine(host) {
    var state = publicWizardState();
    saveRoutinePreferences(state.prefs, { active:false });
    var draft = persistPublicRoutineDraft(state.prefs);
    var auth = routineState.auth && routineState.auth.loggedIn ? routineState.auth : await detectAuthState();
    if (!auth || !auth.loggedIn || !(auth.session && auth.session.access_token)) {
      toast('Rutin taslağın kaydedildi. Hesabına aktarmak için giriş yapmalısın.');
      try { sessionStorage.setItem('cosmoskin_return_to', '/account/profile.html?tab=routines&routineSync=1'); } catch (error) {}
      openAuth('loginPanel');
      return;
    }
    try {
      if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.saveToAccount === 'function') await window.COSMOSKINRoutineData.saveToAccount(draft, auth.session);
      else await saveRoutineProfileToAccount(state.prefs);
      await loadAccountState();
      toast('Rutinin hesabına kaydedildi.');
      renderPublicRoutineCenter(host, { auth: auth });
    } catch (error) {
      toast(error && error.message ? error.message : 'Rutin kaydedilemedi. Lütfen tekrar dene.');
    }
  }

  function renderPublicRoutineCenter(host, options) {
    options = options || {};
    var state = publicWizardState();
    var auth = options.auth || routineState.auth || { loggedIn:false };
    var routine = buildPublicRoutine(state.prefs);
    host.innerHTML = '<section class="rt-section rt-public-center"><div class="rt-container">' +
      '<div class="rt-public-hero"><div><p class="rt-eyebrow">AKILLI RUTİN MERKEZİ</p><h1 class="rt-h1">Cildin için kişisel Kore bakım rotası.</h1><p class="rt-copy">Cilt hedefin, hassasiyet seviyen ve rutin yoğunluğuna göre sabah, akşam ve haftalık destek adımlarını premium bir akışta hazırlarız.</p><div class="rt-public-hero-actions"><a class="rt-btn rt-btn--black" href="#routine-center-start">Rutinimi Oluştur</a><a class="rt-btn" href="/index.html#smart-routine">Hızlı seçim alanına dön</a></div></div><aside class="rt-public-auth rt-card">' + icon('shield') + '<strong>' + (auth.loggedIn ? 'Rutin kayda hazır' : 'Rutin taslağın kaybolmaz') + '</strong><p>' + (auth.loggedIn ? 'Sonucu kaydettiğinde Hesabım > Akıllı Rutinim alanına aktarılır.' : 'Giriş yapmadan sonucu görebilir, kaydetmek istediğinde taslağını hesabına aktarabilirsin.') + '</p></aside></div>' +
      '<div class="rt-public-benchmark-row"><span>Hızlı hedef seçimi</span><span>Danışmanlık hissi</span><span>Gerçek ürün kataloğu</span><span>Kozmetik öneri dili</span></div>' +
      publicProgressMarkup(state.step) + '<div class="rt-public-layout">' + publicQuestionMarkup(state) + '<aside class="rt-public-summary rt-card"><span>Ön izleme</span><h2>' + esc(publicGoalTitle(state.prefs)) + '</h2><p>' + esc(goalText(state.prefs)) + ' · ' + esc(skinText(state.prefs)) + ' cilt · ' + esc(cap(state.prefs.sensitivity || 'orta')) + ' hassasiyet</p><div class="rt-score-ring" style="--score:' + routine.score + '"><strong>' + routine.score + '</strong><span>100</span></div><small>Rutin uyum skoru</small></aside></div>' +
      publicResultMarkup(state) + '</div></section>';
    refreshInventory(host);
  }
  function collectProfileFromDOM() {
    var prefs = getRoutinePreferences();
    qsa('[data-rt-group]').forEach(function (groupEl) {
      var group = groupEl.getAttribute('data-rt-group');
      var values = qsa('.rt-choice[aria-pressed="true"]', groupEl).map(function (btn) { return btn.getAttribute('data-rt-value'); }).filter(Boolean);
      if (group === 'skin') prefs.selectedSkinType = values[0] || prefs.selectedSkinType;
      if (group === 'sensitivity') prefs.sensitivity = values[0] || prefs.sensitivity;
      if (group === 'goals') prefs.selectedGoals = values.length ? values : prefs.selectedGoals;
      if (group === 'habit') prefs.habit = values[0] || prefs.habit;
      if (group === 'intensity') prefs.intensity = values[0] || prefs.intensity;
      if (group === 'tolerance') prefs.tolerance = values[0] || prefs.tolerance;
      if (group === 'avoid') prefs.avoid = values;
    });
    return prefs;
  }

  function bindPage(host) {
    document.addEventListener('click', function (event) {
      var publicHost = qs('[data-routine-page="smart"]');
      var publicChoice = event.target.closest('[data-rt-public-choice]');
      if (publicHost && publicChoice) {
        var state = publicWizardState();
        var type = publicChoice.getAttribute('data-rt-public-choice');
        var value = publicChoice.getAttribute('data-value');
        if (type === 'goal') {
          var goals = state.prefs.selectedGoals || [];
          if (goals.indexOf(value) !== -1) goals = goals.filter(function (item) { return item !== value; });
          else goals = goals.concat([value]).slice(-3);
          state.prefs.selectedGoals = goals.length ? goals : ['nem'];
        } else if (type === 'skin') state.prefs.selectedSkinType = value;
        else if (type === 'sensitivity') state.prefs.sensitivity = value;
        else if (type === 'style') state.prefs.intensity = value;
        else if (type === 'texture') state.prefs.preferredTexture = value;
        state.prefs.updatedAt = new Date().toISOString();
        saveRoutinePreferences(state.prefs, { active:false });
        persistPublicRoutineDraft(state.prefs);
        renderPublicRoutineCenter(publicHost, { auth:routineState.auth });
        return;
      }
      var publicStep = event.target.closest('[data-rt-public-step]');
      if (publicHost && publicStep) {
        publicWizardState().step = Math.max(0, Math.min(PUBLIC_ROUTINE_STEPS.length - 1, Number(publicStep.getAttribute('data-rt-public-step')) || 0));
        renderPublicRoutineCenter(publicHost, { auth:routineState.auth });
        return;
      }
      var publicAction = event.target.closest('[data-rt-public-action]');
      if (publicHost && publicAction) {
        var action = publicAction.getAttribute('data-rt-public-action');
        var stateAction = publicWizardState();
        if (action === 'back') stateAction.step = Math.max(0, stateAction.step - 1);
        else if (action === 'next') stateAction.step = Math.min(PUBLIC_ROUTINE_STEPS.length - 1, stateAction.step + 1);
        else if (action === 'save') { savePublicRoutine(publicHost); return; }
        else if (action === 'cart') { saveRoutinePreferences(stateAction.prefs, { active:false }); persistPublicRoutineDraft(stateAction.prefs); addRoutineProductsToCart().catch(function (error) { toast(error && error.message ? error.message : 'Rutin ürünleri sepete eklenemedi.'); }); return; }
        persistPublicRoutineDraft(stateAction.prefs);
        renderPublicRoutineCenter(publicHost, { auth:routineState.auth });
        return;
      }
      var viewLink = event.target.closest('[data-rt-view]');
      if (viewLink) { event.preventDefault(); navigateRoutine(host, viewLink.getAttribute('data-rt-view') || 'dashboard'); return; }
      var routineAnchor = event.target.closest('a[href^="/account/routine"], a[href^="/collections/routine"], a[href^="/routine.html"], a[href^="/rutinler"]');
      if (routineAnchor) {
        event.preventDefault();
        var href = routineAnchor.getAttribute('href') || ROUTINE_ROUTE;
        var parsed = new URL(href, window.location.origin);
        var path = parsed.pathname.replace(/\/$/, '');
        var targetView = routineAnchor.getAttribute('data-rt-view') || parsed.searchParams.get('tab') || parsed.searchParams.get('view') || (parsed.hash || '').replace(/^#/, '') || 'dashboard';
        if (!routineAnchor.getAttribute('data-rt-view')) {
          if (/routine-profile/.test(path)) targetView = 'profile';
          else if (/routine-favorites/.test(path)) targetView = 'favorites';
          else if (/routine-history/.test(path)) targetView = 'history';
          else if (/routine-compare/.test(path)) targetView = 'compare';
        }
        navigateRoutine(host, targetView);
        return;
      }
      var auth = event.target.closest('[data-rt-auth]');
      if (auth) { event.preventDefault(); openAuth(auth.getAttribute('data-rt-auth')); return; }
      var choice = event.target.closest('.rt-choice');
      if (choice) {
        var group = choice.closest('[data-rt-group]');
        var multi = group && group.getAttribute('data-rt-multi') === 'true';
        if (!multi) qsa('.rt-choice', group).forEach(function (btn) { btn.setAttribute('aria-pressed','false'); btn.textContent = btn.textContent.replace(/\s*✓$/, ''); });
        var active = choice.getAttribute('aria-pressed') === 'true';
        choice.setAttribute('aria-pressed', active && multi ? 'false' : 'true');
        choice.textContent = choice.textContent.replace(/\s*✓$/, '') + ((choice.getAttribute('aria-pressed') === 'true') ? ' ✓' : '');
        return;
      }
      var save = event.target.closest('[data-rt-save-profile]');
      if (save) {
        save.disabled = true;
        save.setAttribute('aria-busy', 'true');
        saveRoutineProfileToAccount(collectProfileFromDOM()).then(function () {
          toast('Cilt profilin güncellendi.');
        }).catch(function (error) {
          toast(error && error.message ? error.message : 'Cilt profili kaydedilemedi.');
        }).finally(function () {
          save.disabled = false;
          save.removeAttribute('aria-busy');
        });
        return;
      }
      var reset = event.target.closest('[data-rt-reset-profile]');
      if (reset) { saveRoutinePreferences(defaultPreferences()); renderProfile(host); toast('Varsayılan profil geri yüklendi.'); return; }
      var add = event.target.closest('[data-rt-add-cart]');
      if (add) { addProductToCart(add.getAttribute('data-rt-add-cart')).then(function (added) { if (added) toast('Ürün sepetinize eklendi.'); }).catch(function (error) { toast(error && error.message ? error.message : 'Ürün sepete eklenemedi.'); }); return; }
      if (event.target.closest('[data-rt-add-all]')) { addRoutineProductsToCart().catch(function (error) { toast(error && error.message ? error.message : 'Rutin ürünleri sepete eklenemedi.'); }); return; }
      var fav = event.target.closest('[data-rt-favorite]');
      if (fav) { toggleFavorite(fav.getAttribute('data-rt-favorite'), fav).then(function () { if (routineState.currentView === 'favorites') renderFavorites(host); }).catch(function (error) { toast(error && error.message ? error.message : 'Favori işlemi tamamlanamadı.'); }); return; }
      var addRoutine = event.target.closest('[data-rt-add-routine]');
      if (addRoutine) { window.location.href = '/account/routine-profile/'; return; }
      if (event.target.closest('[data-rt-add-owned]')) { window.location.href = '/allproducts.html'; return; }
      if (event.target.closest('[data-rt-remove-owned]')) { var owned = event.target.closest('.rt-owned'); if (owned) owned.remove(); toast('Ürün mevcut ürünlerinden kaldırıldı.'); return; }
      var applyHistory = event.target.closest('[data-rt-apply-history]');
      if (applyHistory) {
        if (applyHistoryRoutine(applyHistory.getAttribute('data-rt-apply-history'))) {
          toast('Seçilen rutin aktif hale getirildi.');
          navigateRoutine(host, 'dashboard');
        } else toast('Bu rutin bulunamadı.');
        return;
      }
      var applyCompare = event.target.closest('[data-rt-apply-compare]');
      if (applyCompare) { applyComparedRoutine(applyCompare.getAttribute('data-compare-id')); return; }
      var compareCart = event.target.closest('[data-rt-compare-cart]');
      if (compareCart) { addComparedRoutineToCart(compareCart.getAttribute('data-compare-id')).catch(function (error) { toast(error && error.message ? error.message : 'Rutin ürünleri sepete eklenemedi.'); }); return; }
      var replace = event.target.closest('[data-rt-replace-product]');
      if (replace) {
        var currentSelection = qs('[data-rt-compare-select]') && qs('[data-rt-compare-select]').value;
        if (replaceRoutineProduct(replace.getAttribute('data-current-slug'), replace.getAttribute('data-next-slug'))) {
          toast('Rutinindeki ürün güncellendi.');
          renderCompare(host, currentSelection);
        } else {
          toast('Bu değişim şu anda uygulanamadı.');
        }
        return;
      }
      var filter = event.target.closest('[data-rt-filter]');
      if (filter) { qsa('[data-rt-filter]').forEach(function (btn) { btn.classList.remove('is-active'); }); filter.classList.add('is-active'); toast(filter.textContent.trim() + ' filtresi uygulandı.'); return; }
    });
    document.addEventListener('change', function (event) {
      var select = event.target.closest('[data-rt-compare-select]');
      if (!select) return;
      renderCompare(host, select.value);
    });
  }

  function currentView(defaultView) {
    var params = new URLSearchParams(window.location.search || '');
    var path = window.location.pathname.replace(/\/$/, '');
    var view = params.get('tab') || params.get('view') || '';
    if (!view) {
      if (/routine-profile/.test(path)) view = 'profile';
      else if (/routine-favorites/.test(path)) view = 'favorites';
      else if (/routine-history/.test(path)) view = 'history';
      else if (/routine-compare/.test(path)) view = 'compare';
      else view = (window.location.hash || '').replace(/^#/, '') || defaultView || 'dashboard';
    }
    if (['dashboard','profile','favorites','history','compare','recommendations'].indexOf(view) === -1) view = 'dashboard';
    return view;
  }

  async function renderSmartRoute(host, view) {
    host.innerHTML = '<div class="rt-loading">Rutin deneyimi hazırlanıyor...</div>';
    var auth = await detectAuthState();
    if (host && host.getAttribute('data-routine-page') === 'smart') {
      routineState.auth = auth;
      renderPublicRoutineCenter(host, { auth: auth });
      return { loggedIn: !!auth.loggedIn, view:'public-smart' };
    }
    view = view || currentView('dashboard');
    if (!auth.loggedIn) {
      if (view === 'compare') {
        window.location.replace('/account/routines/');
        return { loggedIn:false, view:'redirect' };
      }
      renderWelcome(host);
      return { loggedIn:false, view:'welcome' };
    }
    await loadAccountState();
    mergePendingRoutinePreferences();
    if (view === 'profile') renderProfile(host);
    else if (view === 'favorites') renderFavorites(host);
    else if (view === 'history') renderHistory(host);
    else if (view === 'compare') renderCompare(host);
    else if (view === 'recommendations') renderRecommendationsPage(host);
    else renderDashboard(host);
    routineState.currentView = view;
    refreshInventory(host);
    return { loggedIn:true, view:view };
  }

  async function navigateRoutine(host, view, replace) {
    var url = routineHref(view);
    if (replace) window.history.replaceState({ routineView:view }, '', url);
    else window.history.pushState({ routineView:view }, '', url);
    await renderSmartRoute(host, view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function init() {
    var host = qs('[data-routine-page]');
    if (!host) return;
    var page = host.getAttribute('data-routine-page');
    var defaultView = page === 'profile' ? 'profile' : page === 'favorites' ? 'favorites' : page === 'history' ? 'history' : page === 'compare' ? 'compare' : 'dashboard';
    await renderSmartRoute(host, currentView(defaultView));
    bindPage(host);
    window.addEventListener('popstate', function () { renderSmartRoute(host, currentView(defaultView)); });
    document.addEventListener('cosmoskin:auth-state', function (event) {
      var user = event.detail && event.detail.user;
      routineState.auth = { loggedIn: !!user, user: user || null, session: routineState.auth && routineState.auth.session || null, source: 'auth-event' };
      if (user) renderSmartRoute(host, currentView(defaultView));
    });
    waitForAuthClient().then(function (client) {
      if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') return;
      try {
        client.auth.onAuthStateChange(function (_event, session) {
          routineState.auth = { loggedIn: !!(session && session.user), user: session && session.user || null, session: session || null, source: 'supabase' };
          if (session && session.user) renderSmartRoute(host, currentView(defaultView));
        });
      } catch (e) {}
    });
  }

  window.COSMOSKIN_ROUTINE = {
    detectAuthState: detectAuthState,
    getRoutinePreferences: getRoutinePreferences,
    saveRoutinePreferences: saveRoutinePreferences,
    mergePendingRoutinePreferences: mergePendingRoutinePreferences,
    getRoutineProfile: getRoutineProfile,
    getActiveRoutine: getActiveRoutine,
    getRoutineHistory: getRoutineHistory,
    getProductCatalog: getProductCatalog,
    getDefaultCompareRoutine: getDefaultCompareRoutine,
    compareRoutines: compareRoutines,
    calculateGoalMatch: calculateGoalMatch,
    calculateBarrierSupport: calculateBarrierSupport,
    calculateSensitivityFit: calculateSensitivityFit,
    detectProductConflicts: detectProductConflicts,
    calculateMorningPracticality: calculateMorningPracticality,
    getProductComparisonBadge: getProductComparisonBadge,
    renderRoutineComparePage: renderCompare,
    bindRoutineCompareEvents: bindPage,
    applyComparedRoutine: applyComparedRoutine,
    addComparedRoutineToCart: addComparedRoutineToCart,
    replaceRoutineProduct: replaceRoutineProduct,
    renderRoutineDashboard: renderDashboard,
    renderRoutineProfile: renderProfile,
    renderRoutineFavorites: renderFavorites,
    renderRoutineHistory: renderHistory,
    renderRoutineRecommendations: renderRecommendationsPage,
    renderSmartRoute: renderSmartRoute,
    handleRoutineCTA: openAuth,
    handleRoutineNav: init,
    navigateRoutine: navigateRoutine,
    addRoutineProductsToCart: addRoutineProductsToCart
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
