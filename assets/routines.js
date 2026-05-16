(function () {
  'use strict';

  var KEYS = {
    pending: 'cosmoskin_pending_routine_preferences',
    preferences: 'cosmoskin_routine_preferences',
    profile: 'cosmoskin_routine_profile',
    active: 'cosmoskin_routine_active',
    favorites: 'cosmoskin_routine_favorites'
  };

  var ROUTINE_ROUTE = '/collections/routine';

  var goalLabels = { nem: 'Nem', bariyer: 'Bariyer', isilti: 'Işıltı', leke: 'Leke Karşıtı', akne: 'Akne & Sivilce Karşıtı', hassasiyet: 'Hassasiyet', gozenek: 'Gözenek Sıkılaştırıcı', parlaklik: 'Parlaklık' };
  var skinLabels = { kuru: 'Kuru', karma: 'Karma', yagli: 'Yağlı', hassas: 'Hassas', normal: 'Normal' };

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function readJSON(key, fallback) { try { var value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch (error) { return fallback; } }
  function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {} }
  function formatPrice(value) { try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0)); } catch (error) { return Number(value || 0) + ' TL'; } }
  function nowDate() { try { return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch (error) { return 'Bugün'; } }
  function icon(name) {
    var paths = {
      spark:'M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3Z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
      shield:'M12 3.8 19 7v5.4c0 4.3-2.9 6.8-7 8-4.1-1.2-7-3.7-7-8V7l7-3.2Z M8.9 12.2l2 2 4.3-4.5',
      sun:'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
      moon:'M17.5 16.8A7.2 7.2 0 0 1 8 7.3 7.2 7.2 0 1 0 17.5 16.8Z',
      heart:'M12 20.2 5.2 13.8a4.4 4.4 0 0 1 6.2-6.2l.6.6.6-.6a4.4 4.4 0 0 1 6.2 6.2L12 20.2Z',
      user:'M20 21a8 8 0 0 0-16 0 M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      history:'M4 12a8 8 0 1 0 2.4-5.7 M4 4v5h5 M12 8v5l3 2',
      compare:'M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3',
      bag:'M6.5 8.5h11l-.9 11H7.4l-.9-11Z M9.2 8.5V7.4a2.8 2.8 0 0 1 5.6 0v1.1',
      edit:'M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z M13.5 6l4.5 4.5',
      arrow:'M5 12h14 M13 6l6 6-6 6',
      lock:'M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v9H6z',
      target:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
      plus:'M12 5v14 M5 12h14',
      info:'M12 16v-4 M12 8h.01 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
      refresh:'M20 12a8 8 0 0 1-13.6 5.7L4 15 M4 20v-5h5 M4 12A8 8 0 0 1 17.6 6.3L20 9 M20 4v5h-5',
      leaf:'M19 4C11 4 5 9 5 16c0 3 2 5 5 5 7 0 9-9 9-17Z M5 19c4-5 8-8 14-15'
    };
    return '<span class="rt-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="' + (paths[name] || paths.spark) + '"></path></svg></span>';
  }

  function getProducts() {
    var products = window.COSMOSKIN_PRODUCTS || window.products || [];
    if (!Array.isArray(products) && products.products) products = products.products;
    return Array.isArray(products) ? products.filter(function (p) { return p && (p.slug || p.id) && p.name; }) : [];
  }
  function findProduct(slug) { return getProducts().find(function (p) { return p.slug === slug || p.id === slug; }); }
  function pickBySlugs(slugs) { return slugs.map(findProduct).filter(Boolean); }

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

  function getRoutinePreferences() {
    return normalizePreferences(readJSON(KEYS.active, null) || readJSON(KEYS.profile, null) || readJSON(KEYS.preferences, null) || readJSON(KEYS.pending, null));
  }

  function saveRoutinePreferences(prefs, options) {
    var normalized = normalizePreferences(Object.assign({}, prefs || {}, { updatedAt: new Date().toISOString() }));
    writeJSON(KEYS.profile, normalized);
    writeJSON(KEYS.preferences, normalized);
    if (options && options.active !== false) writeJSON(KEYS.active, normalized);
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
    var slug = item.slug || item.id || item.url || '';
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
    var sale = opts.sale;
    var stock = opts.stock;
    return '<article class="rt-product-card" data-product-slug="' + esc(product.slug) + '">' +
      '<button class="rt-product-card__fav' + (opts.activeFav ? ' is-active' : '') + '" type="button" data-rt-favorite="' + esc(product.slug) + '" aria-label="Favorilerden çıkar">' + icon('heart') + '</button>' +
      '<a class="rt-product-card__media" href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '"><img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy"></a>' +
      '<small>' + esc(product.brand || '') + '</small><strong>' + esc(product.name || '') + '</strong>' +
      '<div class="rt-price">' + esc(formatPrice(product.price)) + (sale ? '<span class="rt-old-price">' + esc(formatPrice(Number(product.price || 0) + 100)) + '</span>' : '') + '</div>' +
      (sale ? '<span class="rt-badge rt-badge--sale">İndirimde</span>' : stock ? '<span class="rt-badge rt-badge--stock">Az Stokta</span>' : '<span class="rt-badge">Cilt profiline uyumlu</span>') +
      '<div class="rt-product-card__actions"><button class="rt-btn rt-btn--black" type="button" data-rt-add-cart="' + esc(product.slug) + '">Sepete Ekle</button><a class="rt-btn" href="' + esc(product.url || ('/products/' + product.slug + '.html')) + '">Ürün Detayı</a><button class="rt-btn" type="button" data-rt-add-routine="' + esc(product.slug) + '">Rutine Ekle</button></div>' +
    '</article>';
  }

  function productStep(product, index, label) {
    if (!product) return '';
    return '<div class="rt-product-step"><a href="' + esc(product.url || '#') + '"><img src="' + esc(product.image) + '" alt="' + esc(product.brand + ' ' + product.name) + '" loading="lazy"></a><strong><small>' + (index + 1) + '</small>' + esc(label) + '</strong></div>';
  }

  function routineHref(view) {
    return ROUTINE_ROUTE + (view && view !== 'dashboard' ? '?view=' + encodeURIComponent(view) : '');
  }

  function sidebar(active) {
    var items = [
      ['dashboard', routineHref('dashboard'), 'Aktif Rutinim', 'spark'],
      ['history', routineHref('history'), 'Rutin Geçmişim', 'history'],
      ['favorites', routineHref('favorites'), 'Favori Ürünlerim', 'heart'],
      ['history', routineHref('history') + '#compare', 'Rutin Karşılaştır', 'compare'],
      ['profile', routineHref('profile'), 'Cilt Profilim', 'user']
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
      '<a class="rt-btn" href="/collections/routine?view=profile">' + icon('edit') + 'Profili Düzenle</a></div>';
  }

  function renderDashboard(host) {
    var prefs = mergePendingRoutinePreferences();
    var routine = activeRoutineProducts(prefs);
    var recs = recommendProducts(prefs).slice(0, 6);
    host.innerHTML = '<section class="rt-section"><div class="rt-container">' +
      '<div class="rt-page-head"><div><h1 class="rt-h1">Rutinlerim</h1><p class="rt-copy">Cilt profilin ve hedeflerine göre oluşturulan rutinin görüntülenebilir, düzenlenebilir ve yeni rutinler oluşturabilirsin.</p></div><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">' + icon('spark') + 'Akıllı Rutini Başlat</a></div>' +
      summaryBar(prefs) +
      '<div class="rt-shell">' + sidebar('dashboard') + '<div class="rt-content">' +
        '<section class="rt-routine-hero"><div><span class="rt-tag">Aktif Rutinim · En son güncellendi: ' + esc(nowDate()) + '</span><h2 class="rt-h2">Dengeli & Aydınlık Bakım Rutini</h2><p>Cildinin ihtiyaçlarına göre oluşturulan bu rutin, cildini nazikçe arındırır, nemlendirir ve ışıl ışıl bir görünüm kazandırmayı hedefler.</p></div><div class="rt-score"><div class="rt-score-ring" style="--score:92"><strong>92</strong><span>100</span></div><small>Cilt uyumun yüksek</small></div></section>' +
        '<section class="rt-routine-flow"><div class="rt-flow-col"><h3 class="rt-flow-title">' + icon('sun') + 'Sabah Rutini</h3><div class="rt-product-steps">' + routine.morning.map(function (p,i) { return productStep(p,i,['Temizle','Dengele','Nemlendir','Koru'][i] || 'Bakım'); }).join('') + '</div></div><div class="rt-flow-col"><h3 class="rt-flow-title">' + icon('moon') + 'Akşam Rutini</h3><div class="rt-product-steps">' + routine.evening.map(function (p,i) { return productStep(p,i,['Temizle','Bakım','Onar','Yenile'][i] || 'Bakım'); }).join('') + '</div></div></section>' +
        '<section class="rt-reason"><h3>' + icon('sun') + 'Neden Bu Ürünler?</h3><p>Bu rutin, cilt tipin (' + esc(skinText(prefs).toLocaleLowerCase('tr-TR')) + '), cilt hedeflerin ve içerik tercihlerin göz önünde bulundurularak hazırlandı.</p><div class="rt-reason-list"><span>' + icon('spark') + 'Aydınlık görünümü destekler</span><span>' + icon('shield') + 'Cilt bariyerini güçlendirir</span><span>' + icon('leaf') + 'Nem dengesini korur</span><span>' + icon('target') + 'Tahrişi azaltmaya yardımcı olur</span></div></section>' +
        '<div class="rt-products-head"><div><h2>Önerilen Ürünler</h2><p>Cilt profiline %90+ uyumlu ürünler</p></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-add-all>' + icon('bag') + 'Tümünü Sepete Ekle</button> <a class="rt-btn" href="/collections/routine?view=profile">' + icon('edit') + 'Rutinini Düzenle</a></div></div>' +
        '<div class="rt-products-grid rt-products-grid--six">' + recs.map(function (p) { return productCard(p); }).join('') + '</div>' +
        '<section class="rt-improve rt-card"><h2 class="rt-products-head"><span><b>Rutinini İyileştir</b><small>Daha iyi sonuçlar için bu önerilere göz atabilirsin.</small></span></h2><div class="rt-improve-grid">' + improveCards() + '</div></section>' +
      '</div></div></div></section>';
  }

  function improveCards() {
    var items = [
      ['Ekstra Nem Desteği','Cildinin nem ihtiyacı var gibi görünüyor. Nemlendirici adımını güçlendirebilirsin.','torriden-dive-in-hyaluronic-acid-serum'],
      ['Peeling Önerisi','Haftada 1–2 kez nazik bir peeling ile cilt dokunu daha pürüzsüz hale getir.','some-by-mi-aha-bha-miracle-toner'],
      ['Gece Onarım Desteği','Gece kullanımına uygun onarıcı içerikler cildini yenilemeye yardımcı olur.','torriden-solid-in-ceramide-cream']
    ];
    return items.map(function (item) { return '<a class="rt-improve-card" href="/collections/routine"><img src="' + esc(productImage(item[2],0)) + '" alt=""><div><strong>' + esc(item[0]) + '</strong><span>' + esc(item[1]) + '</span><b>Ürünleri Keşfet ' + icon('arrow') + '</b></div></a>'; }).join('');
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
      '</div><aside class="rt-login-card rt-card">' + icon('lock') + '<div><h2>Rutinini kaydet</h2><p>Rutinlerini kaydetmek ve istediğin zaman kaldığın yerden devam etmek için giriş yapmalısın.</p></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-auth="login">Giriş Yap</button><a href="#" data-rt-auth="register">Hesabın yok mu? Kayıt Ol →</a></div></aside></div>' +
      '<div class="rt-feature-row rt-card"><div class="rt-feature">' + icon('target') + '<strong>Cilt Hedefine Göre</strong><span>Hedeflerine uygun sade bir plan oluşturur.</span></div><div class="rt-feature">' + icon('sun') + '<strong>Sabah & Akşam Akışı</strong><span>Güne ve geceye uygun iki ayrı akış sunar.</span></div><div class="rt-feature">' + icon('shield') + '<strong>Ürün Uyumu</strong><span>İçerik uyumsuzluklarını tespit edip öneriler önerir.</span></div><div class="rt-feature">' + icon('leaf') + '<strong>Sade Akış</strong><span>Az adımla etkili sonuç, cildi yormayan rutin.</span></div><div class="rt-feature">' + icon('bag') + '<strong>Sepette Hazır Sonuç</strong><span>Rutini tamamladığında kolayca sepete ekle.</span></div></div>' +
      '<section class="rt-how"><p class="rt-eyebrow">NASIL ÇALIŞIR?</p><h2 class="rt-h2">Rutinini 3 adımda oluştur.</h2><div class="rt-step-grid"><div class="rt-step-card"><small>01</small><strong>Cilt hedefini seç</strong><p>Nem, parlaklık, sivilce, hassasiyet gibi hedeflerinden birini veya birkaçını seç.</p></div><div class="rt-step-arrow"></div><div class="rt-step-card"><small>02</small><strong>Kullanım düzenini belirle</strong><p>Sabah ve/veya akşam akışını ve cilt tipine uygun tercihlerini belirle.</p></div><div class="rt-step-arrow"></div><div class="rt-step-card"><small>03</small><strong>Kişisel önerini al</strong><p>Cildine uygun akıllı bir rutin sırala senin için oluşturulur.</p></div></div></section>' +
      '<section class="rt-preview rt-card"><div><h2 class="rt-h3">Rutin önizleme alanı</h2><p class="rt-copy" style="font-size:13px">Akışını burada görebilirsin. Adımlarını tamamladığında sana özel sabah ve akşam rutinin bu alanda görüntülenecek.</p></div><div class="rt-flow-card"><h3>' + icon('sun') + 'Sabah Rutini</h3>' + miniSteps(['Temizle','Dengele','Nemlendir','Koru']) + '</div><div class="rt-flow-card"><h3>' + icon('moon') + 'Akşam Rutini</h3>' + miniSteps(['Temizle','Bakım','Onar','Yenile']) + '</div><div style="display:grid;place-items:center;color:#b48963">' + icon('leaf') + '</div></section>' +
      '<section class="rt-continue rt-card"><div class="rt-continue-mark">' + icon('refresh') + '</div><div><strong>' + (hasPending ? 'Anasayfada seçtiğin hedefler burada devam eder.' : 'Seçimlerini başlattığında burada devam eder.') + '</strong><p class="rt-copy" style="margin-top:4px;font-size:13px">Hedeflerini, cilt tipini ve tercihlerini bu sayfada senkronize şekilde görebilirsin.</p><div class="rt-continue-values">' + (prefs.selectedGoals || []).slice(0,4).map(function (id) { return '<span class="rt-pill">' + esc(goalLabels[id] || id) + '</span>'; }).join('') + '<span class="rt-pill">' + esc(skinText(prefs)) + '</span><span class="rt-pill">' + esc(prefs.habit) + '</span></div></div><div><button class="rt-btn rt-btn--black" type="button" data-rt-auth="login">Seçimlerimi Devam Ettir</button><a class="rt-btn" href="/index.html#smart-routine">Yeni Rutin Oluştur</a></div></section>' +
      '<section class="rt-promo-banner rt-card"><div><p class="rt-eyebrow">KENDİNE ÖZEL, SADE VE ETKİLİ</p><h2 class="rt-h2">Bakımını sadeleştir, cildine uygun akışını keşfet.</h2><div class="rt-welcome-actions"><a class="rt-btn rt-btn--black" href="/index.html#smart-routine">Rutine Başla</a><button class="rt-btn" type="button" data-rt-auth="login">Giriş Yap</button></div><p class="rt-copy" style="font-size:12px">Güvenli, hızlı ve kişisel bir deneyim.</p></div><div class="rt-promo-art" aria-hidden="true"></div></section>' +
      '<div class="rt-faq-row"><a class="rt-faq-card" href="/contact.html">' + icon('info') + '<span><strong>Rutin nasıl çalışır?</strong><br><small>Akıllı Rutin, hedeflerin ve alışkanlıklarına göre sana özel plan oluşturur.</small></span>' + icon('arrow') + '</a><a class="rt-faq-card" href="#" data-rt-auth="login">' + icon('lock') + '<span><strong>Giriş yapmadan başlayabilir miyim?</strong><br><small>Evet, rutini oluşturup görüntüleyebilirsin. Kaydetmek için giriş yapmalısın.</small></span>' + icon('arrow') + '</a><a class="rt-faq-card" href="/contact.html">' + icon('leaf') + '<span><strong>Öneriler güncellenir mi?</strong><br><small>Evet, hedeflerin ve ürünlerinle öneriler düzenli güncellenir.</small></span>' + icon('arrow') + '</a></div>' +
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
      '<div class="rt-profile-actions"><button class="rt-btn rt-btn--black" type="button" data-rt-save-profile>Kaydet ve Güncelle</button><a class="rt-btn" href="/collections/routine">İptal</a><button class="rt-btn" type="button" data-rt-reset-profile>Varsayılanlara Dön</button></div></div>' +
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
    var products = recommendProducts(prefs).slice(0, 8);
    writeJSON(KEYS.favorites, products.map(function (p) { return p.slug; }));
    host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-fav-top"><div><h1 class="rt-h1">Favori Ürünlerim</h1><p class="rt-copy">Beğendiğin ve tekrar almak istediğin ürünleri burada kolayca görüntüleyebilir, rutine ekleyebilirsin.</p><div class="rt-stats"><div class="rt-stat">' + icon('heart') + '<strong>' + products.length + '</strong><span>Toplam Favori Ürün</span><small>Gerçek ürün kataloğundan</small></div><div class="rt-stat">' + icon('spark') + '<strong>' + Math.max(0, products.length - 2) + '</strong><span>Rutine Uyumlu</span><small>Cilt profiline uygun</small></div><div class="rt-stat">' + icon('target') + '<strong>' + Math.min(2, products.length) + '</strong><span>Öne Çıkan</span><small>Rutin hedeflerine göre</small></div><div class="rt-stat">' + icon('bag') + '<strong>' + Math.min(3, products.length) + '</strong><span>Sepete Uygun</span><small>Rutine eklenebilir</small></div></div></div><aside class="rt-fit-card rt-card"><h3>Favorilerinden Sana Uygun Seçkiler <a href="/collections/routine" style="float:right;color:#111;text-decoration:none">Tümünü Gör →</a></h3>' + fitRow(products[0], products[1], 'Nem & Onarım Rutini', 'Kuru ve hassas ciltler için yoğun nem desteği.') + fitRow(products[2], products[3], 'Aydınlık & Pürüzsüzlük Rutini', 'Cilt tonunu eşitleyen ve canlandıran bakım.') + '</aside></div><div class="rt-shell">' + sidebar('favorites') + '<div class="rt-content"><div class="rt-filter-bar rt-card"><div class="rt-tabs"><button class="rt-tab is-active" type="button" data-rt-filter="all">Tümü</button><button class="rt-tab" type="button" data-rt-filter="routine">Rutinle Uyumlu</button><button class="rt-tab" type="button" data-rt-filter="sale">İndirimde</button><button class="rt-tab" type="button" data-rt-filter="stock">Stoktaki</button></div><select class="rt-sort" aria-label="Sıralama"><option>Eklenme Tarihine Göre</option><option>Fiyata Göre Artan</option><option>Fiyata Göre Azalan</option></select></div><div class="rt-products-grid" data-rt-fav-grid>' + products.map(function (p, i) { return productCard(p, { activeFav: i % 3 === 0, sale: i === 4, stock: i === 7 }); }).join('') + '</div></div></div></div></section>';
  }

  function fitRow(a, b, title, copy) {
    return '<div class="rt-fit-row"><div class="rt-fit-media"><img src="' + esc(a && a.image || '') + '" alt=""><span>+</span><img src="' + esc(b && b.image || '') + '" alt=""></div><div><strong>' + esc(title) + '</strong><p>' + esc(copy) + '</p><a class="rt-btn" href="/collections/routine" style="height:32px;padding:0 12px">Keşfet</a></div></div>';
  }

  function renderHistory(host) {
    var prefs = mergePendingRoutinePreferences();
    var routine = activeRoutineProducts(prefs);
    var products = recommendProducts(prefs);
    host.innerHTML = '<section class="rt-section"><div class="rt-container"><div class="rt-breadcrumb"><a href="/collections/routine?view=history">Rutin Geçmişim</a> / <strong>Geçmiş Rutin Detayı</strong></div><div class="rt-shell">' + sidebar('history') + '<div class="rt-content"><section class="rt-routine-hero"><div><span class="rt-tag">Kaydedilen Rutin</span><h1 class="rt-h2">Parlaklık & Bariyer Rutini</h1><p>Cilt tonunu eşitlemeye, canlı görünümü artırmaya ve cilt bariyerini güçlendirmeye odaklanan dengeli bir rutin.</p><div class="rt-history-meta"><div>' + icon('history') + '<p><small>Oluşturulma Tarihi</small><strong>20 Nisan 2024</strong></p></div><div>' + icon('refresh') + '<p><small>Son Kullanım</small><strong>28 Nisan 2024</strong></p></div><div>' + icon('user') + '<p><small>Oluşturan</small><strong>Sen</strong></p></div></div></div><div class="rt-score"><div class="rt-score-ring" style="--score:89"><strong>89</strong><span>100</span></div><small>Çok iyi uyum</small></div></section><section class="rt-routine-flow"><div class="rt-flow-col"><h3 class="rt-flow-title">' + icon('sun') + 'Sabah Rutini</h3><div class="rt-product-steps">' + routine.morning.map(function (p,i) { return productStep(p,i,['Temizle','Aydınlat','Nemlendir','Koru'][i] || 'Bakım'); }).join('') + '</div></div><div class="rt-flow-col"><h3 class="rt-flow-title">' + icon('moon') + 'Akşam Rutini</h3><div class="rt-product-steps">' + routine.evening.map(function (p,i) { return productStep(p,i,['Temizle','Bakım','Onar','Yenile'][i] || 'Bakım'); }).join('') + '</div></div></section><p class="rt-note">' + icon('info') + 'Bu rutin geçmişte oluşturuldu ve artık aktif rutininden farklı olabilir.</p><section class="rt-card rt-compare"><h2>Neden Bu Rutin?</h2><p class="rt-copy" style="font-size:13px;margin-top:0">Bu rutin, cilt profilin (' + esc(skinText(prefs).toLocaleLowerCase('tr-TR')) + ', hassas) ve hedeflerin doğrultusunda oluşturuldu.</p><div class="rt-why-grid"><div class="rt-why-item"><strong>Aydınlık Görünüm</strong><p>Cilt tonunu eşitleyerek ışıl ışıl bir görünüm kazandırmaya yardımcı olur.</p></div><div class="rt-why-item"><strong>Bariyer Desteği</strong><p>Cilt bariyerini güçlendirir ve daha dengeli bir cilt yapısını destekler.</p></div><div class="rt-why-item"><strong>Nem Dengesi</strong><p>Cildin ihtiyaç duyduğu nemi sağlayarak dolgun ve sağlıklı bir görünüm sunar.</p></div><div class="rt-why-item"><strong>Hassasiyete Uygun</strong><p>Hassas ciltlerin toleransını gözeten nazik içeriklerle formüle edilmiştir.</p></div></div></section><section class="rt-compare rt-card" id="compare"><h2>Mevcut rutinine göre değişenler</h2><div class="rt-compare-grid">' + compareCard(products[8], products[3]) + compareCard(products[0], products[1]) + compareCard(products[4], products[2]) + '</div><p class="rt-copy" style="font-size:12px">Formülasyonlar ve içerikler zamanla değişebilir. Daha iyi sonuçlar için rutinini güncelleyebilirsin.</p></section><div class="rt-action-row"><button class="rt-btn rt-btn--black" type="button" data-rt-apply-history>' + icon('refresh') + '<strong>Bu Rutini Yeniden Uygula<span>Bu rutini aktif rutinim olarak ayarla</span></strong></button><a class="rt-btn" href="#compare">' + icon('compare') + '<strong>Güncel Rutinimle Karşılaştır<span>İçerik ve ürün farklarını gör</span></strong></a><button class="rt-btn rt-btn--soft" type="button" data-rt-add-all>' + icon('bag') + '<strong>Sepete Ekle<span>Tüm rutin ürünlerini sepete ekle</span></strong></button></div></div></div></div></section>';
  }

  function compareCard(a, b) {
    return '<div class="rt-compare-card"><div class="rt-compare-side"><img src="' + esc(a && a.image || '') + '" alt=""><div><small>Mevcut Rutin</small><strong>' + esc(a && a.brand || '') + '<br>' + esc(a && a.name || '') + '</strong></div></div><span>→</span><div class="rt-compare-side"><img src="' + esc(b && b.image || '') + '" alt=""><div><small>Bu Rutin</small><strong>' + esc(b && b.brand || '') + '<br>' + esc(b && b.name || '') + '</strong></div></div></div>';
  }

  function waitForAuthClient() {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function tick() {
        if (window.cosmoskinSupabase && window.cosmoskinSupabase.auth) return resolve(window.cosmoskinSupabase);
        if (Date.now() - started > 1100) return resolve(null);
        setTimeout(tick, 60);
      })();
    });
  }

  async function detectAuthState() {
    var storedUser = readJSON('cosmoskin_user', null);
    if (storedUser && (storedUser.email || storedUser.id || storedUser.name)) return { loggedIn: true, user: storedUser, source: 'local' };
    var client = await waitForAuthClient();
    if (client && client.auth && typeof client.auth.getSession === 'function') {
      try {
        var result = await client.auth.getSession();
        if (result && result.data && result.data.session && result.data.session.user) return { loggedIn: true, user: result.data.session.user, source: 'supabase' };
      } catch (error) {}
    }
    return { loggedIn: false, user: null, source: 'none' };
  }

  function openAuth(mode) {
    try { sessionStorage.setItem('cosmoskin_return_to', ROUTINE_ROUTE + '?routineSync=1'); } catch (error) {}
    var eventName = 'cosmoskin:open-auth-modal';
    try { document.dispatchEvent(new CustomEvent(eventName, { detail: { tab: mode === 'register' ? 'registerPanel' : 'loginPanel' } })); } catch (error) {}
    var modal = qs('#accountModal');
    if (modal) {
      modal.classList.add('open','show');
      modal.setAttribute('aria-hidden','false');
      var backdrop = qs('#backdrop');
      if (backdrop) backdrop.classList.add('show');
      document.body.classList.add('modal-open');
      var panelId = mode === 'register' ? 'registerPanel' : 'loginPanel';
      qsa('.tab-panel', modal).forEach(function (panel) { panel.classList.toggle('active', panel.id === panelId); panel.hidden = false; });
      qsa('.tab-btn', modal).forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-tab') === panelId); });
      var input = qs('#' + panelId + ' input', modal);
      if (input) setTimeout(function () { input.focus(); }, 80);
      return;
    }
    window.location.href = '/index.html?next=' + encodeURIComponent('/collections/routine?routineSync=1');
  }

  function toast(message) {
    var el = qs('[data-rt-toast]');
    if (!el) { el = document.createElement('div'); el.className = 'rt-toast'; el.setAttribute('data-rt-toast',''); document.body.appendChild(el); }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.classList.remove('is-visible'); }, 2200);
  }

  function addProductToCart(slug) {
    var p = findProduct(slug);
    if (!p) return;
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
  }

  function addRoutineProductsToCart() {
    var prefs = getRoutinePreferences();
    var routine = activeRoutineProducts(prefs);
    var unique = new Set();
    routine.morning.concat(routine.evening).forEach(function (p) { if (p && !unique.has(p.slug)) { unique.add(p.slug); addProductToCart(p.slug); } });
    toast(unique.size + ' rutin ürünü sepete eklendi.');
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
      var viewLink = event.target.closest('[data-rt-view]');
      if (viewLink) { event.preventDefault(); navigateRoutine(host, viewLink.getAttribute('data-rt-view') || 'dashboard'); return; }
      var routineAnchor = event.target.closest('a[href^="/collections/routine"]');
      if (routineAnchor) {
        event.preventDefault();
        var href = routineAnchor.getAttribute('href') || ROUTINE_ROUTE;
        var parsed = new URL(href, window.location.origin);
        var targetView = routineAnchor.getAttribute('data-rt-view') || parsed.searchParams.get('view') || (parsed.hash || '').replace(/^#/, '') || 'dashboard';
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
      if (save) { saveRoutinePreferences(collectProfileFromDOM()); toast('Cilt profilin güncellendi.'); return; }
      var reset = event.target.closest('[data-rt-reset-profile]');
      if (reset) { saveRoutinePreferences(defaultPreferences()); renderProfile(host); toast('Varsayılan profil geri yüklendi.'); return; }
      var add = event.target.closest('[data-rt-add-cart]');
      if (add) { addProductToCart(add.getAttribute('data-rt-add-cart')); toast('Ürün sepetinize eklendi.'); return; }
      if (event.target.closest('[data-rt-add-all]')) { addRoutineProductsToCart(); return; }
      var fav = event.target.closest('[data-rt-favorite]');
      if (fav) { fav.classList.toggle('is-active'); toast(fav.classList.contains('is-active') ? 'Ürün favorilere eklendi.' : 'Ürün favorilerden kaldırıldı.'); return; }
      var addRoutine = event.target.closest('[data-rt-add-routine]');
      if (addRoutine) { toast('Ürün rutine eklendi.'); return; }
      if (event.target.closest('[data-rt-add-owned]')) { toast('Ürün ekleme alanı hazırlandı.'); return; }
      if (event.target.closest('[data-rt-remove-owned]')) { var owned = event.target.closest('.rt-owned'); if (owned) owned.remove(); toast('Ürün mevcut ürünlerinden kaldırıldı.'); return; }
      if (event.target.closest('[data-rt-apply-history]')) { writeJSON(KEYS.active, getRoutinePreferences()); toast('Geçmiş rutin aktif rutin olarak ayarlandı.'); return; }
      var filter = event.target.closest('[data-rt-filter]');
      if (filter) { qsa('[data-rt-filter]').forEach(function (btn) { btn.classList.remove('is-active'); }); filter.classList.add('is-active'); toast(filter.textContent.trim() + ' filtresi uygulandı.'); return; }
    });
  }

  function currentView(defaultView) {
    var params = new URLSearchParams(window.location.search || '');
    var view = params.get('view') || (window.location.hash || '').replace(/^#/, '') || defaultView || 'dashboard';
    if (['dashboard','profile','favorites','history'].indexOf(view) === -1) view = 'dashboard';
    return view;
  }

  async function renderSmartRoute(host, view) {
    host.innerHTML = '<div class="rt-loading">Rutin deneyimi hazırlanıyor...</div>';
    var auth = await detectAuthState();
    if (!auth.loggedIn) { renderWelcome(host); return { loggedIn:false, view:'welcome' }; }
    mergePendingRoutinePreferences();
    view = view || currentView('dashboard');
    if (view === 'profile') renderProfile(host);
    else if (view === 'favorites') renderFavorites(host);
    else if (view === 'history') renderHistory(host);
    else renderDashboard(host);
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
    var defaultView = page === 'profile' ? 'profile' : page === 'favorites' ? 'favorites' : page === 'history' ? 'history' : 'dashboard';
    await renderSmartRoute(host, currentView(defaultView));
    bindPage(host);
    window.addEventListener('popstate', function () { renderSmartRoute(host, currentView(defaultView)); });
  }

  window.COSMOSKIN_ROUTINE = {
    detectAuthState: detectAuthState,
    getRoutinePreferences: getRoutinePreferences,
    saveRoutinePreferences: saveRoutinePreferences,
    mergePendingRoutinePreferences: mergePendingRoutinePreferences,
    renderRoutineDashboard: renderDashboard,
    renderRoutineProfile: renderProfile,
    handleRoutineCTA: openAuth,
    handleRoutineNav: init,
    navigateRoutine: navigateRoutine,
    addRoutineProductsToCart: addRoutineProductsToCart
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
