(function(){
  'use strict';

  var CACHE = { products: null, guides: null };
  var KIND_LABELS = {
    cleanser: 'Temizleyici', toner: 'Tonik / Essence', serum: 'Serum / Ampul', moisturizer: 'Nemlendirici', sunscreen: 'Güneş koruyucu', mask: 'Maske', spot: 'Hedef bakım'
  };
  var STEP_LABELS = {
    cleanser: 'Temizleyici', toner: 'Tonik', serum: 'Serum', moisturizer: 'Nemlendirici', sunscreen: 'SPF', mask: 'Maske', spot: 'Hedef bakım'
  };
  var SKIN_LABELS = { kuru:'Kuru', yagli:'Yağlı', karma:'Karma', hassas:'Hassas', normal:'Normal' };
  var SENS_LABELS = { dusuk:'Düşük', orta:'Orta', yuksek:'Yüksek' };
  var GOAL_LABELS = { nem:'Nem', bariyer:'Bariyer', isilti:'Işıltı', leke:'Leke görünümü', akne:'Akne eğilimi', hassasiyet:'Hassasiyet', gozenek:'Gözenek', parlaklik:'Parlaklık' };
  var ICON_BASE = '/assets/icons/cosmoskin/';
  var KIND_ICONS = {
    cleanser:'routine-step-cleanse.svg', toner:'routine-step-prep.svg', serum:'routine-step-serum.svg', moisturizer:'routine-step-moisturize.svg', sunscreen:'routine-step-spf.svg', mask:'routine-step-weekly.svg', spot:'routine-step-repair.svg'
  };
  var TIME_LABELS = { morning:'Sabah', evening:'Akşam', both:'Sabah + Akşam', weekly:'Haftalık kullanım' };
  var COMPLEMENT_FLOW = {
    cleanser: ['toner','serum','moisturizer','sunscreen','mask'],
    toner: ['serum','moisturizer','sunscreen','cleanser'],
    serum: ['moisturizer','sunscreen','cleanser','toner'],
    moisturizer: ['serum','sunscreen','cleanser','toner'],
    sunscreen: ['cleanser','serum','moisturizer','toner','sunscreen'],
    mask: ['cleanser','serum','moisturizer','toner'],
    spot: ['cleanser','moisturizer','sunscreen','toner']
  };

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>"]/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]); }); }
  function lower(value){ return String(value || '').toLocaleLowerCase('tr-TR'); }
  function slug(){
    var root = $('.pdp5-page[data-product-slug]') || $('[data-product-slug]');
    var fromData = root && root.getAttribute('data-product-slug');
    if (fromData) return fromData;
    var match = location.pathname.match(/\/products\/([^.?#/]+)\.html/);
    return match ? match[1] : '';
  }
  function money(value){
    try { return new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:0 }).format(Number(value || 0)); }
    catch(e){ return '₺' + String(value || 0); }
  }
  function pointFmt(value){
    try { return new Intl.NumberFormat('tr-TR', { maximumFractionDigits:0 }).format(Math.max(0, Math.round(Number(value || 0)))); }
    catch(e){ return String(Math.round(Number(value || 0))); }
  }
  function productPrice(product){
    var price = Number(product && product.price);
    if (Number.isFinite(price) && price > 0) return price;
    var dataPrice = $('[data-price]');
    price = Number(dataPrice && dataPrice.getAttribute('data-price'));
    if (Number.isFinite(price) && price > 0) return price;
    var priceText = ($('.pdp5-price') && $('.pdp5-price').textContent || '').replace(/[^0-9,\.]/g,'').replace(/\./g,'').replace(',', '.');
    price = Number(priceText);
    return Number.isFinite(price) ? price : 0;
  }
  function iconMarkup(name, className){
    if (!name) return '';
    return '<img class="' + esc(className || 'cs-icon cs-icon--sm') + '" src="' + ICON_BASE + esc(name) + '" alt="" aria-hidden="true" loading="lazy">';
  }
  function normalizeTextKey(value){
    return lower(value).replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c');
  }
  function routineTimeKind(kind, guide){
    var usage = normalizeTextKey(guide && guide.usageTime);
    if (kind === 'sunscreen') return 'morning';
    if (kind === 'mask') return 'weekly';
    if (usage.indexOf('akşam') !== -1 && usage.indexOf('sabah') === -1) return 'evening';
    if (usage.indexOf('hafta') !== -1) return 'weekly';
    return 'both';
  }
  function routineTimeLabel(kind, guide){
    return TIME_LABELS[routineTimeKind(kind, guide)] || (guide && guide.usageTime) || 'Rutine göre';
  }
  function normalizeProductMeta(product, guide){
    product = product || {}; guide = guide || {};
    var kind = normalizeKind(guide.kind, product.category);
    return {
      slug: product.slug || slug(),
      brand: product.brand || guide.brand || '',
      name: product.name || guide.name || ($('h1') && $('h1').textContent) || '',
      price: productPrice(product),
      volume: product.volume || '',
      category: product.category || guide.category || '',
      routineStep: KIND_LABELS[kind] || 'Bakım',
      routineKind: kind,
      routineTime: routineTimeLabel(kind, guide),
      skinTypes: toArray(guide.idealSkinTypes),
      concerns: toArray(product.concern || product.concernSlugs).concat(toArray(guide.benefits)),
      activeLevel: inferActiveLevel(product, guide),
      image: product.image || (guide.images && guide.images.product) || ($('.pdp5-main-image') && $('.pdp5-main-image').getAttribute('src')) || '',
      url: product.url || location.pathname
    };
  }
  function inferActiveLevel(product, guide){
    var text = guideText(guide, product);
    if (includesAny(text, ['vitamin c 23','pure vitamin c','aha','bha','salicylic','retinol','peeling','clay','volcanic'])) return 'yüksek';
    if (includesAny(text, ['vitamin c','niacinamide','arbutin','propolis','toning','pore'])) return 'orta';
    return 'düşük';
  }
  function fitPercent(rawScore, product, guide, profile){
    if (!hasProfile(profile)) return null;
    var kind = normalizeKind(guide && guide.kind, product && product.category);
    var base = 54 + (Number(rawScore || 0) * 8.5);
    if (kind === 'sunscreen' && profileGoals(profile).indexOf('leke') !== -1) base += 7;
    if (profileSensitivity(profile).indexOf('yuksek') !== -1 && inferActiveLevel(product, guide) === 'yüksek') base -= 12;
    return Math.max(42, Math.min(96, Math.round(base)));
  }
  function stockLabel(product){
    var explicit = product && (product.stock_status || product.stockStatus || product.availability);
    var text = lower(explicit || ($('.pdp5-stock') && $('.pdp5-stock').textContent) || '');
    if (text.indexOf('yok') !== -1 || text.indexOf('out') !== -1 || Number(product && product.stock) === 0) return 'Stokta yok';
    if (text.indexOf('az') !== -1) return 'Sınırlı stok';
    return 'Stokta';
  }
  function renderClubPoints(product){
    var info = $('.pdp5-info');
    var card = $('.pdp5-purchase-card');
    if (!info || !card || $('.pdp8-club-points', info)) return;
    var price = productPrice(product);
    if (!price) return;
    var base = price;
    var signature = price * 1.25;
    var elite = price * 1.5;
    var div = document.createElement('div');
    div.className = 'pdp8-club-points';
    div.innerHTML = '<div class="pdp8-club-points__head"><span>COSMOSKIN Club</span><strong>Bu üründen yaklaşık ' + pointFmt(base) + ' P kazanırsınız</strong></div>' +
      '<div class="pdp8-club-points__tiers"><span>Essential <b>' + pointFmt(base) + ' P</b></span><span>Signature <b>' + pointFmt(signature) + ' P</b></span><span>Elite <b>' + pointFmt(elite) + ' P</b></span></div>' +
      '<p>Puan bilgisi ürün fiyatına göre yaklaşık gösterilir; ödeme adımında güncel sepet tutarı, kampanya ve iade koşullarına göre netleşir.</p>';
    card.insertBefore(div, $('.pdp5-actions', card) || card.firstChild);
  }
  function normalizeKind(value, category){
    value = lower(value);
    category = lower(category);
    if (value) return value;
    if (category.indexOf('temiz') !== -1) return 'cleanser';
    if (category.indexOf('tonik') !== -1 || category.indexOf('essence') !== -1) return 'toner';
    if (category.indexOf('serum') !== -1 || category.indexOf('ampul') !== -1) return 'serum';
    if (category.indexOf('nemlendir') !== -1 || category.indexOf('krem') !== -1) return 'moisturizer';
    if (category.indexOf('güneş') !== -1 || category.indexOf('spf') !== -1) return 'sunscreen';
    if (category.indexOf('maske') !== -1 || category.indexOf('mask') !== -1) return 'mask';
    return 'serum';
  }
  function guideText(guide, product){
    var parts = [];
    if (guide) {
      parts.push(guide.name, guide.category, guide.kind, guide.lead, guide.editorNote, guide.usageTime, guide.usage);
      (guide.idealSkinTypes || []).forEach(function(x){ parts.push(x); });
      (guide.benefits || []).forEach(function(x){ parts.push(x); });
      (guide.ingredients || []).forEach(function(x){ parts.push(x.name, x.description); });
    }
    if (product) {
      parts.push(product.name, product.brand, product.category, product.volume);
      (product.keywords || []).forEach(function(x){ parts.push(x); });
      (product.concern || product.concernSlugs || []).forEach(function(x){ parts.push(x); });
    }
    return lower(parts.filter(Boolean).join(' '));
  }
  function includesAny(text, words){ return words.some(function(word){ return text.indexOf(lower(word)) !== -1; }); }
  function toArray(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }

  async function loadProducts(){
    if (CACHE.products) return CACHE.products;
    if (window.COSMOSKIN_PRODUCTS_READY) {
      try { CACHE.products = await window.COSMOSKIN_PRODUCTS_READY; return CACHE.products || []; } catch(e) {}
    }
    if (window.COSMOSKIN_PRODUCTS) { CACHE.products = window.COSMOSKIN_PRODUCTS; return CACHE.products; }
    try {
      var response = await fetch('/products.json?v=20260702-pdp-v9', { cache:'default' });
      var data = await response.json();
      CACHE.products = data.products || [];
      return CACHE.products;
    } catch(e) { return []; }
  }
  async function loadGuides(){
    if (CACHE.guides) return CACHE.guides;
    try {
      var response = await fetch('/assets/data/product-guides.json?v=20260702-pdp-v9', { cache:'default' });
      CACHE.guides = await response.json();
      return CACHE.guides || {};
    } catch(e) { CACHE.guides = {}; return CACHE.guides; }
  }
  function productBySlug(products, currentSlug){
    return (products || []).find(function(p){
      return p.slug === currentSlug ||
        (p.url || '').indexOf('/products/' + currentSlug + '.html') !== -1 ||
        toArray(p.aliases).indexOf(currentSlug) !== -1;
    }) || null;
  }
  function guideBySlug(guides, currentSlug, product){
    if (!guides) return null;
    if (guides[currentSlug]) return guides[currentSlug];
    if (product && guides[product.slug]) return guides[product.slug];
    var aliases = toArray(product && product.aliases);
    for (var i=0; i<aliases.length; i++) { if (guides[aliases[i]]) return guides[aliases[i]]; }
    return null;
  }

  function readProfile(){
    if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.get === 'function') {
      try { return window.COSMOSKINSkinProfile.get() || {}; } catch(e) {}
    }
    var keys = ['cosmoskin_skin_profile','cosmoskin_routine_active','cosmoskin_routine_profile','cosmoskin_routine_preferences','cosmoskin_pending_routine_preferences'];
    for (var i=0; i<keys.length; i++) {
      try { var raw = localStorage.getItem(keys[i]); if (raw) return JSON.parse(raw) || {}; } catch(e) {}
    }
    return {};
  }
  function hasProfile(profile){ return !!(profile && (profile.skinType || profile.selectedSkinType || profile.skin || profile.primaryGoal || profile.selectedGoals)); }
  function profileSkin(profile){ return lower(profile.skinType || profile.selectedSkinType || profile.skin || '').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c'); }
  function profileSensitivity(profile){ return lower(profile.sensitivity || profile.skinSensitivity || '').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c'); }
  function profileGoals(profile){
    var goals = profile.selectedGoals || profile.goals || [];
    if (typeof goals === 'string') goals = goals.split(/[,+]/);
    goals = toArray(goals);
    if (profile.primaryGoal) goals.push(profile.primaryGoal);
    if (profile.secondaryGoal) goals.push(profile.secondaryGoal);
    return goals.map(function(g){ return lower(g).replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c'); }).filter(Boolean);
  }

  function scoreFit(product, guide, profile){
    var text = guideText(guide, product);
    var score = 0;
    var reasons = [];
    var cautions = [];
    var skin = profileSkin(profile);
    var sens = profileSensitivity(profile);
    var goals = profileGoals(profile);
    var kind = normalizeKind(guide && guide.kind, product && product.category);

    if (text.indexOf('tüm cilt') !== -1 || text.indexOf('tum cilt') !== -1) { score += 1.2; reasons.push('Farklı cilt tiplerine uyumlu günlük bakım diliyle konumlanıyor.'); }
    if (skin) {
      var skinRules = {
        kuru: ['kuru','nem','hyaluronic','hyalüronik','ceramide','seramid','cream','krem','barrier','bariyer','snail','mucin'],
        yagli: ['yağlı','yagli','sebum','gözenek','gozenek','pore','jel','hafif','su bazlı','water','oil-free','mat'],
        karma: ['karma','denge','hafif','nem','sebum','su bazlı','water','günlük'],
        hassas: ['hassas','sensitive','yatıştır','yatis','centella','heartleaf','panthenol','ceramide','bariyer','konfor'],
        normal: ['normal','günlük','gunluk','denge','nem','hafif','tüm cilt','tum cilt']
      };
      if (includesAny(text, skinRules[skin] || [])) { score += 2.2; reasons.push((SKIN_LABELS[skin] || 'Seçili') + ' cilt profilinizle uyumlu anahtar özellikler içeriyor.'); }
    }
    goals.forEach(function(goal){
      var goalRules = {
        nem: ['nem','hydration','hyaluronic','hyalüronik','water','aqua','dive-in','moisture'],
        bariyer: ['bariyer','barrier','ceramide','seramid','panthenol','cica','mucin','snail'],
        isilti: ['ışılt','isilt','glow','bright','vitamin c','niacinamide','rice','propolis'],
        parlaklik: ['ışılt','isilt','glow','bright','vitamin c','niacinamide','rice'],
        leke: ['leke','ton','arbutin','vitamin c','niacinamide','tangerine','bright'],
        akne: ['akne','acne','salicylic','bha','blemish','patch','pore','sebum'],
        gozenek: ['gözenek','gozenek','pore','sebum','clay','volcanic','bha','aha'],
        hassasiyet: ['hassas','sensitive','centella','heartleaf','yatıştır','yatis','ceramide','panthenol']
      };
      if (includesAny(text, goalRules[goal] || [])) { score += 1.4; reasons.push((GOAL_LABELS[goal] || 'Bakım hedefiniz') + ' odağınızla ilişkili içerik/ürün konumlandırması bulunuyor.'); }
    });
    if (sens.indexOf('yuksek') !== -1 || sens.indexOf('yüksek') !== -1) {
      if (includesAny(text, ['centella','heartleaf','ceramide','seramid','panthenol','hyaluronic','hyalüronik','bariyer','yatıştır'])) {
        score += 1.1; reasons.push('Yüksek hassasiyet seçiminiz için daha konforlu içerik odağı taşıyor.');
      }
      if (includesAny(text, ['vitamin c 23','pure vitamin c','aha','bha','salicylic','retinol','clay','asit','peeling'])) {
        score -= 1.8; cautions.push('Hassasiyetiniz yüksekse aktif/asit odaklı ürünlerde yavaş başlangıç ve yama testi önerilir.');
      }
    }
    if (kind === 'sunscreen') reasons.push('Gündüz rutininin son adımı olarak SPF adımını tamamlar.');
    if (kind === 'cleanser') reasons.push('Rutin başlangıcında cildi sonraki bakım adımlarına hazırlar.');
    if (kind === 'serum') reasons.push('Hedef bakım adımı olarak nem, ışıltı veya denge odağına göre konumlanabilir.');
    if (!cautions.length) cautions.push('İlk kullanımda küçük bir bölgede denemeniz ve tahriş durumunda kullanımı bırakmanız önerilir.');
    reasons = reasons.filter(function(value, index, arr){ return value && arr.indexOf(value) === index; }).slice(0,4);
    if (!reasons.length) reasons.push('Ürün kategorisi ve kullanım zamanı rutininize göre değerlendirilebilir.');
    var label = score >= 4 ? 'Yüksek uyum' : (score >= 2 ? 'Dengeli uyum' : 'Dikkatli başlangıç');
    return { score: score, label: label, reasons: reasons, cautions: cautions.slice(0,2) };
  }

  function buildRoutineSteps(kind){
    var order = ['cleanser','toner','serum','moisturizer','sunscreen'];
    if (kind === 'mask') order = ['cleanser','serum','mask','moisturizer'];
    if (kind === 'spot') order = ['cleanser','toner','spot','moisturizer'];
    return order.map(function(step){
      return '<div class="pdp8-routine-mini__step' + (step === kind ? ' is-current' : '') + '">' + iconMarkup(KIND_ICONS[step], 'cs-icon cs-icon--sm pdp8-step-icon') + '<span>' + esc(STEP_LABELS[step] || step) + '</span><em>' + (step === kind ? 'Bu ürün' : 'Adım') + '</em></div>';
    }).join('');
  }

  function renderTabs(product, guide){
    var tabList = $('.pdp5-tablist');
    var tabs = $('.pdp5-tabs');
    if (!tabList || !tabs || !guide || tabs.dataset.pdp8Enhanced === 'true') return;
    tabs.dataset.pdp8Enhanced = 'true';
    var reviewTab = $('[data-pdp-scroll-reviews]', tabList) || $('[data-pdp-tab="reviews"]', tabList);
    var fitTab = document.createElement('button');
    fitTab.setAttribute('aria-selected','false');
    fitTab.className = 'pdp5-tab';
    fitTab.dataset.pdpTab = 'fit';
    fitTab.setAttribute('role','tab');
    fitTab.type = 'button';
    fitTab.textContent = 'Cilt Profilime Uygun mu?';
    if (reviewTab) tabList.insertBefore(fitTab, reviewTab); else tabList.appendChild(fitTab);

    var overview = $('[data-pdp-panel="overview"]', tabs);
    var ingredients = $('[data-pdp-panel="ingredients"]', tabs);
    var usage = $('[data-pdp-panel="usage"]', tabs);
    var fitPanel = document.createElement('div');
    fitPanel.className = 'pdp5-panel';
    fitPanel.dataset.pdpPanel = 'fit';
    fitPanel.setAttribute('role','tabpanel');
    fitPanel.hidden = true;
    tabs.appendChild(fitPanel);

    var kind = normalizeKind(guide.kind, product && product.category);
    var ideal = toArray(guide.idealSkinTypes).slice(0,5);
    var benefits = toArray(guide.benefits).slice(0,5);
    var usageTime = guide.usageTime || (kind === 'sunscreen' ? 'Sabah' : 'Sabah & Akşam');
    var ingredientsList = toArray(guide.ingredients).slice(0,6);

    if (overview) {
      var texture = guide.texture || (kind === 'sunscreen' ? 'Hafif SPF doku' : KIND_LABELS[kind] || 'Bakım dokusu');
      overview.innerHTML = '<div class="pdp8-panel-head"><div><h2>Kısa ürün özeti</h2><p>' + esc(guide.lead || product.description || '') + '</p></div></div>' +
        '<div class="pdp8-summary-grid pdp8-summary-grid--compact">' +
        '<article class="pdp8-summary-card"><small>Rutin adımı</small><strong>' + esc(KIND_LABELS[kind] || product.category || 'Bakım') + '</strong><span>' + esc(routineSentence(kind)) + '</span></article>' +
        '<article class="pdp8-summary-card"><small>Doku</small><strong>' + esc(texture) + '</strong><span>' + esc(usageMicroCopy(kind, usageTime)) + '</span></article>' +
        '<article class="pdp8-summary-card"><small>Uygun profil</small><strong>' + esc(ideal[0] || 'Cilt profiline göre') + '</strong><span>' + esc((ideal.slice(1).join(' · ') || 'Cilt profilinizi tamamlayarak kişisel uygunluğu görün.')) + '</span></article>' +
        '</div>' +
        '<div class="pdp8-chip-row">' + ideal.concat(benefits).slice(0,8).map(function(chip){ return '<span class="pdp8-chip">' + esc(chip) + '</span>'; }).join('') + '</div>' +
        '<ul class="pdp8-brief-list pdp8-brief-list--compact">' +
        '<li>' + esc(guide.editorNote || 'COSMOSKIN editör notu bu ürünün rutin içindeki konumuna göre hazırlanmıştır.') + '</li>' +
        '<li>' + esc(guide.caution || 'Hassasiyetiniz varsa ilk kullanımda küçük bir bölgede denemeniz önerilir.') + '</li>' +
        '<li>' + esc(guide.inciNote || 'Tam içerik listesi için ürün ambalajındaki güncel INCI bilgisini esas alın.') + '</li>' +
        '</ul>';
    }
    if (ingredients) {
      var ingredientVisual = guide.images && (guide.images.ingredientVisual || guide.images.ingredientVisualCustom || guide.images.fallbackIngredientVisual);
      ingredients.innerHTML = '<div class="pdp8-panel-head"><div><h2>İçerik ve formül odağı</h2><p>Bu bölüm ürünün öne çıkan içerik yaklaşımını ve doku karakterini özetler. Marka formülleri dönemsel güncellenebileceği için nihai INCI kontrolü her zaman ürün ambalajından yapılmalıdır.</p></div></div>' +
        '<div class="pdp8-ingredient-layout"><div class="pdp8-ingredient-list">' + ingredientsList.map(function(item){ return '<article class="pdp8-ingredient-card"><b>' + esc(item.name || 'Öne çıkan içerik') + '</b><span>' + esc(item.description || 'Ürünün bakım vaadiyle ilişkili içerik odağı.') + '</span></article>'; }).join('') + '</div>' +
        (ingredientVisual ? '<figure class="pdp8-ingredient-visual"><img alt="' + esc((guide.texture || product.name || 'Ürün dokusu')) + ' doku görseli" src="' + esc(ingredientVisual) + '" loading="lazy"><figcaption>' + esc(guide.texture || 'Formül dokusu') + '</figcaption></figure>' : '') + '</div>' +
        '<p class="pdp8-safe-note">' + esc(guide.inciNote || 'Tam içerik listesi için ürün ambalajındaki güncel INCI bilgisini esas alın.') + ' Kozmetik ürünlerde hassasiyetiniz varsa ilk kullanım öncesi yama testi yapmanız önerilir.</p>';
    }
    if (usage) {
      var steps = usageSteps(kind, guide.usage);
      usage.innerHTML = '<div class="pdp8-panel-head"><div><h2>Nasıl kullanılır?</h2><p>' + esc(guide.usage || 'Ürünü rutindeki uygun adımda, temiz cilde uygulayın.') + '</p></div></div>' +
        '<div class="pdp8-usage-grid"><ol class="pdp8-usage-steps">' + steps.map(function(step){ return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>' +
        '<aside class="pdp8-routine-mini"><small>Rutindeki yeri</small><div class="pdp8-routine-mini__steps">' + buildRoutineSteps(kind) + '</div></aside></div>';
    }
    renderFitPanel(fitPanel, product, guide);
  }

  function routineSentence(kind){
    return ({ cleanser:'Temizleme adımı; bakımın başlangıcı.', toner:'Temizlik sonrası hazırlık ve nem katmanı.', serum:'Hedef bakım adımı; cilt ihtiyacına göre.', moisturizer:'Nem ve bariyer konforunu destekleyen adım.', sunscreen:'Sabah rutininin son koruma adımı.', mask:'Haftalık destek / yoğun bakım adımı.', spot:'Lokal hedef bakım adımı.' })[kind] || 'Rutindeki yerine göre kullanılır.';
  }
  function usageMicroCopy(kind, usageTime){
    if (kind === 'sunscreen') return 'Gündüz, dışarı çıkmadan önce ve ihtiyaç halinde yenileyerek.';
    if (kind === 'mask') return 'Ürünün formuna göre haftalık veya gece bakımı olarak.';
    if (kind === 'cleanser') return 'Sabah/akşam temizlik adımı olarak.';
    return usageTime + ' rutininde ürün sırasına göre.';
  }
  function usageSteps(kind, usage){
    if (kind === 'sunscreen') return ['Sabah rutininizin son adımı olarak yeterli miktarda uygulayın.', 'Yüz ve boyun bölgesine eşit şekilde yayın; göz çevresiyle doğrudan temastan kaçının.', 'Güneşe maruz kalındığında ve terleme/kurulanma sonrası gün içinde yenileyin.'];
    if (kind === 'cleanser') return ['Uygun miktarı cilde uygulayın.', 'Nazik hareketlerle masaj yapın; yağ bazlı temizleyicilerde suyla emülsifiye edin.', 'Ilık suyla durulayın ve ardından toner/serum adımlarına geçin.'];
    if (kind === 'toner') return ['Temizleme sonrası avuç içi veya pamuk yardımıyla uygulayın.', 'Cilt ihtiyacına göre tek kat veya ince katmanlar halinde kullanın.', 'Ardından serum ve nemlendiriciyle rutini tamamlayın.'];
    if (kind === 'serum') return ['Tonik/essence sonrası 2-4 damla veya uygun miktarı uygulayın.', 'Cilt tarafından emilmesini bekleyin.', 'Nemlendiriciyle kapatın; gündüz kullanımında SPF ile tamamlayın.'];
    if (kind === 'moisturizer') return ['Serum sonrası uygun miktarı yüz ve boyun bölgesine uygulayın.', 'Cilt bariyerini desteklemek için nazikçe yayın.', 'Sabah rutininde SPF ile tamamlayın.'];
    if (kind === 'mask') return ['Temiz cilde ürün formuna uygun şekilde uygulayın.', 'Ambalajda belirtilen süre/kullanım şeklini esas alın.', 'Gerekiyorsa durulayın veya gece bakımının son adımı olarak bırakın.'];
    return [usage || 'Ürünü rutindeki uygun adımda uygulayın.', 'Hassasiyet durumunda kullanım sıklığını azaltarak başlayın.', 'Gündüz rutininde SPF kullanmayı unutmayın.'];
  }

  function renderFitPanel(panel, product, guide){
    if (!panel) return;
    var profile = readProfile();
    if (!hasProfile(profile)) {
      var metaEmpty = normalizeProductMeta(product, guide);
      panel.innerHTML = '<div class="pdp8-fit-panel"><div class="pdp8-cta-card"><h3>Cilt profilinizi tamamlayın</h3><p>Bu ürünün cilt tipiniz, hassasiyet seviyeniz ve bakım hedeflerinizle uyumunu daha net görmek için kısa rutin testini tamamlayın.</p><a class="btn btn-primary" href="/routine.html?source=pdp&product=' + esc(metaEmpty.slug) + '">Akıllı Rutinimi Oluştur</a></div><aside class="pdp8-profile-box"><h3>Bu ürünün rutin konumu</h3><div class="pdp8-profile-row"><span>Rutin adımı</span><strong>' + esc(metaEmpty.routineStep) + '</strong></div><div class="pdp8-profile-row"><span>Kullanım zamanı</span><strong>' + esc(metaEmpty.routineTime) + '</strong></div><div class="pdp8-profile-row"><span>Stok bilgisi</span><strong>' + esc(stockLabel(product)) + '</strong></div></aside></div>';
      renderFitTeaser(null, product, guide);
      return;
    }
    var fit = scoreFit(product, guide, profile);
    var meta = normalizeProductMeta(product, guide);
    var percent = fitPercent(fit.score, product, guide, profile);
    var skin = profileSkin(profile);
    var sens = profileSensitivity(profile);
    var goals = profileGoals(profile);
    panel.innerHTML = '<div class="pdp8-fit-panel"><div class="pdp8-fit-card"><div class="pdp8-fit-score"><div class="pdp8-fit-score__badge pdp8-fit-score__badge--percent"><strong>' + esc(percent) + '</strong><span>/100</span></div><div class="pdp8-fit-score__copy"><strong>' + esc(fit.label) + ' · Rutin profiline göre uyum</strong><span>Bu değerlendirme cilt profiliniz, ürün kategorisi ve ürün rehberi verilerine göre hazırlanır; tıbbi tavsiye değildir.</span></div></div><div class="pdp8-routine-mini" aria-label="Ürünün rutin içindeki yeri">' + buildRoutineSteps(meta.routineKind) + '</div><ul class="pdp8-fit-reasons">' + fit.reasons.concat(fit.cautions).map(function(reason){ return '<li>' + esc(reason) + '</li>'; }).join('') + '</ul></div>' +
      '<aside class="pdp8-profile-box"><h3>Cilt profiliniz</h3><div class="pdp8-profile-row"><span>Cilt tipi</span><strong>' + esc(SKIN_LABELS[skin] || profile.skinType || 'Belirtilmedi') + '</strong></div><div class="pdp8-profile-row"><span>Hassasiyet</span><strong>' + esc(SENS_LABELS[sens] || profile.sensitivity || 'Belirtilmedi') + '</strong></div><div class="pdp8-profile-row"><span>Bakım hedefi</span><strong>' + esc(goals.map(function(g){ return GOAL_LABELS[g] || g; }).filter(Boolean).join(' · ') || 'Belirtilmedi') + '</strong></div><div class="pdp8-profile-row"><span>Ürün adımı</span><strong>' + esc(meta.routineStep) + ' · ' + esc(meta.routineTime) + '</strong></div><div class="pdp8-profile-row"><span>Güncelleme</span><strong><a href="/account/profile.html?tab=skin-profile">Cilt profilim</a></strong></div></aside></div>';
    renderFitTeaser(fit, product, guide);
  }
  function renderFitTeaser(fit, product, guide){
    var info = $('.pdp5-info');
    if (!info || $('.pdp8-fit-teaser', info)) return;
    var anchor = $('.pdp5-pills', info) || $('.pdp5-description', info);
    if (!anchor) return;
    var profile = readProfile();
    var div = document.createElement('div');
    div.className = 'pdp8-fit-teaser';
    if (fit) {
      var p1 = fitPercent(fit.score, product, guide, profile);
      div.innerHTML = '<div><strong>Cilt profilinize göre: ' + esc(p1) + '/100 · ' + esc(fit.label) + '</strong><span>' + esc((fit.reasons && fit.reasons[0]) || 'Ürün profilinizle birlikte değerlendirildi.') + '</span></div><button type="button" data-pdp-tab-jump="fit">Detayı Gör</button>';
    } else if (hasProfile(profile)) {
      var calc = scoreFit(product, guide, profile);
      var p2 = fitPercent(calc.score, product, guide, profile);
      div.innerHTML = '<div><strong>Cilt profilinize göre: ' + esc(p2) + '/100 · ' + esc(calc.label) + '</strong><span>' + esc(calc.reasons[0]) + '</span></div><button type="button" data-pdp-tab-jump="fit">Detayı Gör</button>';
    } else {
      var meta = normalizeProductMeta(product, guide);
      div.innerHTML = '<div><strong>Cilt profilime uygun mu?</strong><span>Profilinizi tamamlayarak ' + esc(meta.routineStep) + ' adımındaki bu ürünün rutininize uyumunu görün.</span></div><a href="/routine.html?source=pdp&product=' + esc(meta.slug) + '">Testi Başlat</a>';
    }
    anchor.insertAdjacentElement('afterend', div);
  }

  function enhanceGallery(guide){
    var card = $('.pdp5-media-card');
    var img = $('.pdp5-main-image');
    if (!card || !img || card.dataset.pdp8Gallery === 'true') return;
    card.dataset.pdp8Gallery = 'true';
    var thumbsWrap = $('.pdp5-media-thumbs') || $('.pdp5-thumbs');
    var thumbs = $$('.pdp5-thumb');
    var seen = Object.create(null);
    var duplicateThumbs = [];
    function canonicalSrc(src){ return String(src || '').split('#')[0].trim(); }
    thumbs.forEach(function(thumb){
      var thumbImg = $('img', thumb);
      var src = canonicalSrc(thumb.getAttribute('data-pdp-thumb') || (thumbImg && thumbImg.getAttribute('src')) || '');
      if (!src) return;
      if (seen[src]) { duplicateThumbs.push(thumb); return; }
      seen[src] = true;
      thumb.setAttribute('data-pdp-thumb', src);
    });
    duplicateThumbs.forEach(function(thumb){ thumb.parentNode && thumb.parentNode.removeChild(thumb); });
    thumbs = $$('.pdp5-thumb');
    var slides = Object.keys(seen);
    var currentSrc = canonicalSrc(img.getAttribute('src') || img.src || '');
    if (currentSrc && !seen[currentSrc]) { slides.unshift(currentSrc); seen[currentSrc] = true; }
    var extras = [];
    if (guide && guide.images) {
      extras = toArray(guide.images.gallery).concat([guide.images.ingredientVisual, guide.images.ingredientVisualCustom, guide.images.fallbackIngredientVisual]).filter(Boolean);
    }
    extras.forEach(function(src){ src = canonicalSrc(src); if (src && !seen[src]) { slides.push(src); seen[src] = true; } });
    if (!slides.length && currentSrc) slides = [currentSrc];
    if (thumbsWrap && extras.length) {
      slides.slice(0,6).forEach(function(src, i){
        if (!src || $('.pdp5-thumb[data-pdp-thumb="' + src + '"]', thumbsWrap)) return;
        if (i === 0) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdp5-thumb pdp8-generated-thumb';
        btn.setAttribute('aria-label', i === 1 ? 'Formül doku görseli' : 'Ek ürün görseli');
        btn.setAttribute('data-pdp-thumb', src);
        btn.innerHTML = '<img alt="Ek ürün görseli" loading="lazy" src="' + esc(src) + '">';
        thumbsWrap.appendChild(btn);
      });
      thumbs = $$('.pdp5-thumb');
    }
    thumbs.forEach(function(thumb, i){
      thumb.setAttribute('aria-label', thumb.getAttribute('aria-label') || ('Ürün görseli ' + (i + 1)));
      thumb.setAttribute('aria-pressed', thumb.classList.contains('is-active') ? 'true' : 'false');
    });
    var index = Math.max(0, slides.indexOf(currentSrc));
    if (slides.length < 2) {
      card.classList.add('is-single-image');
      if (thumbsWrap) thumbsWrap.hidden = thumbs.length <= 1;
      return;
    }
    var prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'pdp8-gallery-arrow pdp8-gallery-arrow--prev'; prev.setAttribute('aria-label','Önceki ürün görseli'); prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var next = document.createElement('button');
    next.type = 'button'; next.className = 'pdp8-gallery-arrow pdp8-gallery-arrow--next'; next.setAttribute('aria-label','Sonraki ürün görseli'); next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var count = document.createElement('div'); count.className = 'pdp8-gallery-count'; count.setAttribute('aria-live','polite');
    card.appendChild(prev); card.appendChild(next); card.appendChild(count);
    function setSlide(nextIndex){
      index = (nextIndex + slides.length) % slides.length;
      img.classList.add('is-switching');
      setTimeout(function(){ img.src = slides[index]; img.classList.remove('is-switching'); }, 120);
      thumbs.forEach(function(thumb){
        var thumbImg = $('img', thumb);
        var active = canonicalSrc(thumb.getAttribute('data-pdp-thumb') || (thumbImg && thumbImg.getAttribute('src')) || '') === slides[index];
        thumb.classList.toggle('is-active', active);
        thumb.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      count.textContent = (index + 1) + ' / ' + slides.length;
    }
    prev.addEventListener('click', function(){ setSlide(index - 1); });
    next.addEventListener('click', function(){ setSlide(index + 1); });
    thumbs.forEach(function(thumb){ thumb.addEventListener('click', function(){ var thumbImg = $('img', thumb); var src = canonicalSrc(thumb.getAttribute('data-pdp-thumb') || (thumbImg && thumbImg.getAttribute('src'))); var i = slides.indexOf(src); if (i >= 0) setSlide(i); }); });
    var touchStartX = 0;
    card.addEventListener('touchstart', function(e){ touchStartX = e.touches && e.touches[0] ? e.touches[0].clientX : 0; }, { passive:true });
    card.addEventListener('touchend', function(e){
      var endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
      var delta = endX - touchStartX;
      if (Math.abs(delta) > 44) setSlide(index + (delta < 0 ? 1 : -1));
    }, { passive:true });
    card.addEventListener('keydown', function(e){ if (e.key === 'ArrowLeft') setSlide(index - 1); if (e.key === 'ArrowRight') setSlide(index + 1); });
    setSlide(index);
  }

  function candidateReason(currentKind, candidateKind, profile, candidateGuide){
    if (currentKind === candidateKind) return 'Aynı adımda alternatif olarak değerlendirilebilir.';
    if (currentKind === 'sunscreen' && candidateKind === 'cleanser') return 'SPF kullanılan günlerde akşam arındırma adımını tamamlar.';
    if (currentKind === 'sunscreen' && candidateKind === 'serum') return 'Sabah SPF öncesi hafif bakım katmanı olarak uyumlu olabilir.';
    if (currentKind === 'serum' && candidateKind === 'moisturizer') return 'Serum sonrası nem ve bariyer konforunu destekler.';
    if (currentKind === 'cleanser' && candidateKind === 'toner') return 'Temizlik sonrası cildi bakım adımlarına hazırlar.';
    if (candidateKind === 'sunscreen') return 'Gündüz rutininde bakım adımlarını SPF ile tamamlar.';
    if (candidateKind === 'moisturizer') return 'Rutinin nem ve konfor adımını tamamlar.';
    if (candidateKind === 'serum') return 'Hedef bakım odağıyla rutini güçlendirebilir.';
    return 'Rutin akışında bu ürünle tamamlayıcı rol üstlenir.';
  }
  function scoreCandidate(current, currentGuide, candidate, candidateGuide, profile){
    var currentKind = normalizeKind(currentGuide && currentGuide.kind, current && current.category);
    var candidateKind = normalizeKind(candidateGuide && candidateGuide.kind, candidate && candidate.category);
    var flow = COMPLEMENT_FLOW[currentKind] || [];
    var flowIndex = flow.indexOf(candidateKind);
    var score = flowIndex >= 0 ? (8 - flowIndex) : 1;
    if (candidateKind === currentKind) score -= 1.5;
    var fit = hasProfile(profile) ? scoreFit(candidate, candidateGuide, profile).score : 0;
    score += fit;
    if (current && candidate && current.brand === candidate.brand) score += .4;
    return score;
  }
  function buildRecommendationCard(candidate, guide, reason, label){
    var img = candidate.image || (guide && guide.images && guide.images.product) || '/assets/img/editorial.jpg';
    return '<article class="product-card pdp-related-card pdp8-related-card" data-product-id="' + esc(candidate.slug) + '">' +
      '<span class="pdp8-rec-label">' + esc(label) + '</span>' +
      '<div class="product-media-wrap"><a class="product-media" href="' + esc(candidate.url || ('/products/' + candidate.slug + '.html')) + '"><img alt="' + esc(candidate.name) + '" loading="lazy" src="' + esc(img) + '"/></a></div>' +
      '<div class="product-body"><div class="product-meta">' + esc(candidate.brand || '') + '</div><h3><a href="' + esc(candidate.url || ('/products/' + candidate.slug + '.html')) + '">' + esc(candidate.name || '') + '</a></h3><p class="pdp8-rec-reason">' + esc(reason) + '</p><div class="product-price">' + money(candidate.price) + '</div>' +
      '<button class="btn btn-secondary" data-add-cart data-id="' + esc(candidate.slug) + '" data-slug="' + esc(candidate.slug) + '" data-name="' + esc(candidate.name || '') + '" data-brand="' + esc(candidate.brand || '') + '" data-price="' + esc(candidate.price || 0) + '" data-image="' + esc(img) + '" data-url="' + esc(candidate.url || ('/products/' + candidate.slug + '.html')) + '" type="button">Sepete Ekle</button></div></article>';
  }
  function renderRecommendations(products, guides, currentSlug){
    var section = $('.pdp5-related');
    var grid = $('.pdp5-related-grid', section || document);
    var head = $('.pdp5-section-head', section || document);
    if (!section || !grid || section.dataset.pdp8Recommendations === 'true') return;
    var current = productBySlug(products, currentSlug);
    var currentGuide = guideBySlug(guides, currentSlug, current) || null;
    if (!current || !currentGuide) return;
    var profile = readProfile();
    var currentKind = normalizeKind(currentGuide.kind, current.category);
    var scored = (products || []).filter(function(product){ return product.slug !== currentSlug && guides[product.slug]; }).map(function(product){
      var candidateGuide = guides[product.slug];
      var kind = normalizeKind(candidateGuide.kind, product.category);
      return { product: product, guide: candidateGuide, kind: kind, score: scoreCandidate(current, currentGuide, product, candidateGuide, profile) };
    }).sort(function(a,b){ return b.score - a.score; });
    var picks = [];
    var kinds = Object.create(null);
    scored.forEach(function(item){
      if (picks.length >= 4) return;
      var allowSameKind = item.kind === currentKind && picks.filter(function(p){ return p.kind === currentKind; }).length < 1;
      var allowKind = !kinds[item.kind] || allowSameKind;
      if (!allowKind && picks.length < 3) return;
      picks.push(item); kinds[item.kind] = true;
    });
    if (!picks.length) return;
    section.dataset.pdp8Recommendations = 'true';
    if (head) {
      var title = $('h2', head); var kicker = $('.kicker', head); var link = $('a', head);
      if (kicker) kicker.textContent = hasProfile(profile) ? 'Cilt profilinize göre' : 'Rutini tamamlayan seçimler';
      if (title) title.textContent = 'Bu ürünle uyumlu öneriler';
      if (link) link.href = '/routine.html';
      if (link) link.textContent = 'Rutinini oluştur';
      var mode = document.createElement('div');
      mode.className = 'pdp8-related-mode';
      mode.innerHTML = '<span>Rutin adımı uyumu</span><span>Cilt profili sinyali</span><span>Stokta olan ürün odağı</span>';
      head.appendChild(mode);
    }
    grid.innerHTML = picks.map(function(item){
      var label = item.kind === currentKind ? 'Alternatif' : 'Tamamlayıcı';
      return buildRecommendationCard(item.product, item.guide, candidateReason(currentKind, item.kind, profile, item.guide), label);
    }).join('');
    if (window.initCartButtons) window.initCartButtons(grid);
    if (window.initFavoriteButtons) window.initFavoriteButtons(grid);
  }

  function enhanceGuide(guides, currentSlug){
    var guideRoot = $('.cs-guide[data-guide-slug]');
    var guide = guideBySlug(guides, currentSlug, productBySlug((CACHE.products || []), currentSlug)) || (guideRoot && guides[guideRoot.getAttribute('data-guide-slug')]);
    if (!guideRoot || !guide || guideRoot.dataset.pdp8Enhanced === 'true') return;
    guideRoot.dataset.pdp8Enhanced = 'true';
    guideRoot.classList.add('is-pdp8-enhanced');
    var visualImg = guide.images && (guide.images.ingredientVisual || guide.images.ingredientVisualCustom || guide.images.fallbackIngredientVisual) || '';
    var art = $('.cs-guide-panel__art', guideRoot);
    var ingredients = toArray(guide.ingredients).slice(0,3);
    if (art && visualImg) {
      art.innerHTML = '<div class="cs-guide-dynamic-art cs-guide-dynamic-art--ingredient"><img class="cs-guide-dynamic-art__product" alt="' + esc((guide.texture || guide.name || 'Formül dokusu')) + '" src="' + esc(visualImg) + '" loading="lazy"><div class="cs-guide-dynamic-art__chips">' + ingredients.map(function(i){ return '<span>' + esc(i.name || '') + '</span>'; }).join('') + '</div></div>';
    }
    var heroContent = $('.cs-guide-hero__content', guideRoot);
    if (heroContent && !$('.cs-guide-compatibility-strip', heroContent)) {
      var kind = normalizeKind(guide.kind, guide.category);
      var strip = document.createElement('div');
      strip.className = 'cs-guide-compatibility-strip';
      strip.innerHTML = '<span><b>Cilt uyumu</b>' + esc(toArray(guide.idealSkinTypes).slice(0,2).join(' · ') || 'Profilinize göre') + '</span><span><b>Rutin adımı</b>' + esc(KIND_LABELS[kind] || guide.category || 'Bakım') + '</span><span><b>Kullanım</b>' + esc(guide.usageTime || 'Rutine göre') + '</span>';
      heroContent.appendChild(strip);
    }
  }


  function renderRoutineAside(product, guide){
    var aside = $('.pdp5-routine-card');
    if (!aside || aside.dataset.pdp8RoutineIntelligence === 'true' || !guide) return;
    aside.dataset.pdp8RoutineIntelligence = 'true';
    var profile = readProfile();
    var meta = normalizeProductMeta(product, guide);
    var fit = hasProfile(profile) ? scoreFit(product, guide, profile) : null;
    var percent = fit ? fitPercent(fit.score, product, guide, profile) : null;
    var benefits = toArray(guide.benefits).slice(0,3);
    aside.classList.add('pdp8-routine-intel-card');
    aside.innerHTML = '<p class="kicker">Akıllı Rutin Uyumu</p>' +
      '<div class="pdp8-routine-intel-card__head">' + iconMarkup(KIND_ICONS[meta.routineKind] || 'status-info.svg', 'cs-icon cs-icon--md pdp8-routine-intel-card__icon') + '<div><h2>' + esc(meta.routineStep) + '</h2><p>' + esc(meta.routineTime) + ' · ' + esc(stockLabel(product)) + '</p></div></div>' +
      (percent ? '<div class="pdp8-routine-intel-score"><strong>' + esc(percent) + '/100</strong><span>Cilt hedeflerin ve tercihlerine göre uyum</span></div>' : '<div class="pdp8-routine-intel-score is-empty"><strong>Profil gerekli</strong><span>Cilt profilini tamamladığında kişisel uyum skoru görünür.</span></div>') +
      '<div class="pdp8-routine-intel-chips">' + [meta.routineTime, meta.routineStep].concat(benefits).slice(0,5).map(function(item){ return '<span>' + esc(item) + '</span>'; }).join('') + '</div>' +
      '<p class="pdp8-routine-intel-note">' + esc(fit ? (fit.reasons[0] || 'Bu ürün rutin profilinizle birlikte değerlendirilir.') : 'Bu ürünün rutindeki yerini ve profilinize uyumunu görmek için Akıllı Rutin Merkezi’ni kullanabilirsiniz.') + '</p>' +
      '<div class="pdp8-routine-intel-actions"><a class="btn btn-secondary" href="/routine.html?source=pdp&product=' + esc(meta.slug) + '">Akıllı Rutinimi Oluştur</a><button class="btn btn-secondary" type="button" data-pdp-tab-jump="fit">Uyumu Gör</button></div>' +
      '<p class="pdp8-safe-note">Bu öneri kozmetik bakım rehberi niteliğindedir; tıbbi teşhis veya tedavi amacı taşımaz.</p>';
  }


  function bindDelegatedTabs(){
    if (document.documentElement.dataset.pdp8DelegatedTabs === 'true') return;
    document.documentElement.dataset.pdp8DelegatedTabs = 'true';
    document.addEventListener('click', function(event){
      var tab = event.target.closest('.pdp5-tab[data-pdp-tab]');
      if (!tab || tab.hasAttribute('data-pdp-scroll-reviews')) return;
      var root = tab.closest('.pdp5-tabs');
      var id = tab.getAttribute('data-pdp-tab');
      if (!root || !id) return;
      root.querySelectorAll('.pdp5-tab').forEach(function(item){
        if (item.hasAttribute('data-pdp-scroll-reviews')) return;
        var active = item === tab;
        item.classList.toggle('is-active', active);
        if (item.hasAttribute('aria-selected')) item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      root.querySelectorAll('.pdp5-panel').forEach(function(panel){
        var activePanel = panel.getAttribute('data-pdp-panel') === id;
        panel.classList.toggle('is-active', activePanel);
        panel.hidden = !activePanel;
      });
    });
  }

  async function init(){
    if (!$('.pdp5-page')) return;
    bindDelegatedTabs();
    var currentSlug = slug();
    var guides = await loadGuides();
    var products = await loadProducts();
    var product = productBySlug(products, currentSlug) || {};
    var guide = guideBySlug(guides, currentSlug, product);
    enhanceGallery(guide);
    renderClubPoints(product);
    renderTabs(product, guide);
    renderRoutineAside(product, guide);
    renderRecommendations(products, guides, currentSlug);
    enhanceGuide(guides, currentSlug);
    document.addEventListener('click', function(event){
      var jump = event.target.closest('[data-pdp-tab-jump]');
      if (!jump) return;
      var id = jump.getAttribute('data-pdp-tab-jump');
      var tab = $('[data-pdp-tab="' + id + '"]');
      if (tab) { tab.click(); var detail = $('.pdp5-detail-grid'); if (detail) detail.scrollIntoView({behavior:'smooth', block:'start'}); }
    }, { once:false });
    window.addEventListener('cosmoskin:skin-profile-change', function(){
      var fitPanel = $('[data-pdp-panel="fit"]');
      renderFitPanel(fitPanel, product, guide);
      var related = $('.pdp5-related');
      if (related) { related.dataset.pdp8Recommendations = ''; var grid = $('.pdp5-related-grid', related); if (grid) renderRecommendations(products, guides, currentSlug); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
