(function(){
  const SKIN_KEY = 'cosmoskin_routine_skin';
  const GOAL_KEY = 'cosmoskin_routine_goal';
  const CONCERNS_KEY = 'cosmoskin_routine_concerns';
  const fmt = new Intl.NumberFormat('tr-TR');
  const LABELS = {
    skin: { dry:'Kuru cilt', oily:'Yağlı cilt', combination:'Karma cilt', sensitive:'Hassas cilt', normal:'Normal cilt' },
    goal: { hydration:'Nem dengesi', barrier:'Bariyer desteği', glow:'Işıltı', balance:'Denge' },
    concern: { dehydration:'Nemsizlik', sensitivity:'Hassasiyet', barrier:'Bariyer desteği', tone:'Leke görünümü', glow:'Mat görünüm', blemish:'Akne eğilimi' }
  };

  const PRODUCT_BLUEPRINTS = {
    cleanser: { slug:'round-lab-1025-dokdo-cleanser', step:'Temizle', reason:'Nazik köpük yapısı ve Ceramide NP desteğiyle temizlemeyi daha konforlu başlatır.' },
    hydratingSerum: { slug:'torriden-dive-in-hyaluronic-acid-serum', step:'Serum', reason:'5 farklı molekül boyutunda hyaluronik asit ile hafif ama katmanlı nem desteği sunar.' },
    snailEssence: { slug:'cosrx-advanced-snail-96-mucin-essence', step:'Essence', reason:'%96 snail secretion filtrate içeriğiyle ara katmanda nem ve esneklik hissini destekler.' },
    glowSerum: { slug:'beauty-of-joseon-glow-serum-propolis-niacinamide', step:'Tedavi', reason:'Niacinamide ve propolis ile daha dengeli, sakin ve canlı görünüm odağı kurar.' },
    moisturizer: { slug:'round-lab-soybean-nourishing-cream', step:'Nemlendir', reason:'Siyah soya fasulyesi, seramid ve adenosin ile besleyici kapanış sağlar.' },
    reliefSun: { slug:'beauty-of-joseon-relief-sun-spf50', step:'Koruma', reason:'Pirinç özü destekli kremsi ama hafif SPF yapısıyla sabah rutinini tamamlar.' },
    waterySun: { slug:'torriden-dive-in-watery-moisture-sun-cream', step:'Koruma', reason:'10 çeşit hyaluronik asit destekli hafif yapısıyla gündüz katmanını dengeler.' },
    nightMask: { slug:'medicube-collagen-night-wrapping-mask', step:'Gece maskesi', reason:'Gece boyunca ciltte bakım hissini destekleyen kapanış adımı olarak konumlanır.' },
    ceramideCream: { slug:'dr-jart-ceramidin-cream', step:'Bariyer kremi', reason:'Seramid odaklı yapısıyla akşam rutininde bariyer konforunu güçlendirir.' },
    centellaAmpoule: { slug:'skin1004-madagascar-centella-ampoule', step:'Ampul', reason:'Centella odaklı hafif ampul yapısıyla akşam sakinleştirme adımını destekler.' },
    waterSleepingMask: { slug:'laneige-water-sleeping-mask', step:'Uyku maskesi', reason:'Gece bakımında nem hissini koruyan rahat ve tamamlayıcı bir son adım sunar.' }
  };

  function getSavedArray(){ try { return JSON.parse(localStorage.getItem(CONCERNS_KEY) || '[]'); } catch(e){ return []; } }
  function saveState(skin, goal, concerns){ if (skin) localStorage.setItem(SKIN_KEY, skin); if (goal) localStorage.setItem(GOAL_KEY, goal); localStorage.setItem(CONCERNS_KEY, JSON.stringify(concerns || [])); }
  function getState(){ return { skin: localStorage.getItem(SKIN_KEY) || 'combination', goal: localStorage.getItem(GOAL_KEY) || 'balance', concerns: getSavedArray() }; }
  function money(v){ return typeof window.COSMOSKIN_FORMAT_PRICE === 'function' ? window.COSMOSKIN_FORMAT_PRICE(v) : `${fmt.format(v)} TL`; }
  function getCatalogProduct(slug){ return window.COSMOSKIN_PRODUCT_HELPERS?.getProductByHandle?.(slug) || null; }
  function getRoutineProducts(){
    return Object.fromEntries(Object.entries(PRODUCT_BLUEPRINTS).map(([key, config]) => {
      const product = getCatalogProduct(config.slug);
      return [key, {
        id: product?.id || config.slug,
        name: product?.name || config.slug,
        brand: product?.brand || '',
        volume: product?.volume || '',
        price: Number(product?.price || 0),
        image: product?.image || '',
        url: product?.url || `/products/${config.slug}.html`,
        step: config.step,
        reason: config.reason
      }];
    }));
  }

  function buildRoutine(skin, goal, concerns, mood){
    const PRODUCTS = getRoutineProducts();
    const selected = new Set(concerns || []);
    const isNight = mood === 'night';
    let items = [PRODUCTS.cleanser];
    let title = isNight ? 'Akşam onarım rutini' : 'Gündüz denge rutini';
    let analysis = isNight ? 'Gece boyunca konfor ve bariyer desteği odağı' : 'Gündüz koruma, hafiflik ve denge odağı';
    let summary = isNight
      ? 'Temizleme sonrası sakinleştirici katmanlar ve geceye uygun krem/maske adımıyla cildi yormayan bir akşam akışı önerildi.'
      : 'Temizleme sonrası hafif serum ve SPF ile gün içinde kolay taşınan, koruma odaklı bir rutin önerildi.';
    let tags = [LABELS.skin[skin], isNight ? 'Akşam kullanımı' : 'Gündüz kullanımı', LABELS.goal[goal]];

    if (isNight) {
      if (goal === 'glow' || selected.has('tone') || selected.has('glow')) {
        items.push(PRODUCTS.glowSerum);
        title = 'Akşam ışıltı rutini';
        analysis = 'Gece kullanımına uygun canlı görünüm desteği';
        summary = 'Temizleme sonrası propolis ve niacinamide odağıyla daha dengeli ve canlı görünüm hedefleyen akşam rutini oluşturuldu.';
        tags.push('Serum odağı');
      } else if (goal === 'barrier' || selected.has('sensitivity') || selected.has('barrier') || skin === 'sensitive') {
        items.push(PRODUCTS.centellaAmpoule);
        title = 'Akşam bariyer rutini';
        analysis = 'Sakinleştirici katman ve seramid destekli kapanış';
        summary = 'Centella odaklı ampul ve seramid çizgisindeki krem ile akşam saatlerine uygun, konfor odaklı bir akış kuruldu.';
        tags.push('Bariyer desteği');
      } else {
        items.push(PRODUCTS.hydratingSerum);
        title = 'Akşam nem rutini';
        analysis = 'Nem hissini gece boyunca korumaya odaklanan kurgu';
        summary = 'Hyaluronik asit destekli serum ve geceye uygun maske/krem katmanıyla su kaybı hissini azaltmaya odaklanan bir akşam seti önerildi.';
        tags.push('Gece nemi');
      }
      const needsBarrierCream = goal === 'barrier' || selected.has('barrier') || selected.has('sensitivity') || skin === 'sensitive';
      items.push(needsBarrierCream ? PRODUCTS.ceramideCream : PRODUCTS.moisturizer);
      items.push(goal === 'hydration' || selected.has('dehydration') || skin === 'dry' ? PRODUCTS.waterSleepingMask : PRODUCTS.nightMask);
    } else {
      if (goal === 'glow' || selected.has('tone') || selected.has('glow')) {
        items.push(PRODUCTS.glowSerum);
        title = 'Gündüz ışıltı rutini';
        analysis = 'Canlı görünüm ve SPF ile gündüz koruma odağı';
        summary = 'Temizleme sonrası propolis ve niacinamide çizgisindeki serum, SPF adımıyla gündüz kullanımına uygun şekilde tamamlandı.';
        tags.push('Serum odağı');
      } else if (goal === 'barrier' || selected.has('sensitivity') || selected.has('barrier') || skin === 'sensitive') {
        items.push(PRODUCTS.snailEssence);
        title = 'Gündüz bariyer rutini';
        analysis = 'Hafif essence ve koruma adımıyla konfor odağı';
        summary = 'Ara katmanda destekleyici essence, gündüz için hafif SPF ile tamamlanarak hassasiyeti zorlamayan bir akış kuruldu.';
        tags.push('Essence katmanı');
      } else {
        items.push(PRODUCTS.hydratingSerum);
        if (goal === 'hydration' || selected.has('dehydration') || skin === 'dry') {
          title = 'Gündüz nem rutini';
          analysis = 'Nem hissini yükselten ve SPF ile tamamlanan gündüz kurgusu';
          summary = 'Serum katmanı daha belirgin tutularak, gün içinde hafif his veren SPF ile tamamlanan nem odaklı bir kombinasyon oluşturuldu.';
          tags.push('Yoğun nem');
        }
      }
      const useCream = goal === 'hydration' || goal === 'barrier' || selected.has('dehydration') || selected.has('barrier') || skin === 'dry' || skin === 'sensitive';
      if (useCream) items.push(PRODUCTS.moisturizer);
      const spf = (skin === 'oily' || skin === 'combination' || goal === 'balance' || selected.has('blemish')) ? PRODUCTS.waterySun : PRODUCTS.reliefSun;
      items.push(spf);
      if (skin === 'oily' || skin === 'combination' || goal === 'balance' || selected.has('blemish')) {
        title = goal === 'glow' ? title : 'Gündüz hafif denge rutini';
        analysis = goal === 'glow' ? analysis : 'Daha hafif his ve günlük SPF odağı';
        if (goal !== 'glow') summary = 'Temizleme, hafif serum ve sulu his veren SPF ile gün içinde kolay taşınan bir set kurgulandı.';
        tags.push('Hafif bitiş');
      }
    }

    tags = [...new Set(tags.concat((concerns || []).map(c => LABELS.concern[c]).filter(Boolean)))].slice(0,4);
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const bundleName = title.replace('rutini','seti').replace('rutin','set');
    const route = goal === 'glow' || selected.has('tone') ? '/collections/treat.html' : goal === 'barrier' || selected.has('sensitivity') ? '/collections/care.html' : goal === 'hydration' || selected.has('dehydration') ? '/collections/hydrate.html' : '/collections/routine.html';
    return { items, title, analysis, summary, tags, total, bundleName, route, meta: `${items.length} ürün · ${money(total)}` };
  }

  function safeProductUrl(item){
    const url = String(item?.url || '').trim();
    if (url && url !== '#' && url !== 'undefined') return url;
    return `/products/${item.id}.html`;
  }

  function syncButtons(selector, value, attr){
    document.querySelectorAll(selector).forEach(btn => {
      const candidate = btn.getAttribute(attr);
      btn.classList.toggle('is-active', Array.isArray(value) ? value.includes(candidate) : candidate === value);
    });
  }

  function renderProductGrid(target, items){
    target.innerHTML = items.map(item => `
      <a class="home-routine__product-card" href="${safeProductUrl(item)}" aria-label="${item.name} ürün sayfasına git">
        <div class="home-routine__product-media"><img src="${item.image}" alt="${item.name}"></div>
        <div class="home-routine__product-copy">
          <span class="home-routine__product-step">${item.step}</span>
          <div class="home-routine__product-name">${item.name}</div>
          <div class="home-routine__product-meta">${item.brand} · ${item.volume} · ${money(item.price)}</div>
          <div class="home-routine__product-reason">${item.reason}</div>
        </div>
      </a>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', function(){
    const section = document.getElementById('routineLanding');
    if (!section) return;
    const feedback = document.getElementById('homeRoutineFeedback');
    const titleEl = document.getElementById('homeRoutineTitle');
    const analysisTitle = document.getElementById('homeRoutineAnalysisTitle');
    const summaryEl = document.getElementById('homeRoutineSummary');
    const metaEl = document.getElementById('homeRoutineMeta');
    const tagsEl = document.getElementById('homeRoutineRecommendations');
    const gridEl = document.getElementById('homeRoutineProductGrid');
    const bundleNameEl = document.getElementById('homeRoutineBundleName');
    const bundleMetaEl = document.getElementById('homeRoutineBundleMeta');
    const linkEl = document.getElementById('homeRoutineResultLink');
    const addBundleBtn = document.getElementById('homeRoutineAddBundle');
    const resetBtn = document.getElementById('homeRoutineReset');
    const saveBtn = document.getElementById('homeRoutineSave');
    const progressFill = document.getElementById('homeRoutineProgressFill');

    let { skin, goal, concerns } = getState();
    let selectedPreset = presetFromState();

    function calcProgress(){
      let count = 0;
      if (skin) count += 1;
      if (goal) count += 1;
      if ((concerns || []).length) count += 1;
      return [34, 67, 100][Math.max(0, count - 1)] || 34;
    }

    function render(){
      syncButtons('[data-skin-type]', skin, 'data-skin-type');
      syncButtons('[data-goal]', goal, 'data-goal');
      syncButtons('[data-concern]', concerns, 'data-concern');
      const mood = section.dataset.mood === 'night' ? 'night' : 'day';
      const result = buildRoutine(skin, goal, concerns, mood);
      progressFill.style.width = `${calcProgress()}%`;
      titleEl.textContent = result.title;
      analysisTitle.textContent = result.analysis;
      summaryEl.textContent = result.summary;
      metaEl.textContent = `${result.items.length} adım · ${mood === 'night' ? 'akşam' : 'gündüz'} · ${LABELS.skin[skin] || ''}`.trim();
      tagsEl.innerHTML = result.tags.map(tag => `<span>${tag}</span>`).join('');
      renderProductGrid(gridEl, result.items);
      bundleNameEl.textContent = result.bundleName;
      bundleMetaEl.textContent = result.meta;
      linkEl.href = result.route;
      addBundleBtn.dataset.items = JSON.stringify(result.items.map(({id,name,brand,price,image}) => ({id,name,brand,price,image,qty:1})));
      document.querySelectorAll('[data-preset]').forEach(card => {
        const isActive = card.getAttribute('data-preset') === selectedPreset;
        card.classList.toggle('is-active', isActive);
        card.toggleAttribute('data-active', isActive);
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    function presetFromState(){
      if (goal === 'glow' || concerns.includes('tone') || concerns.includes('glow')) return 'glow';
      if (goal === 'barrier' || concerns.includes('barrier') || concerns.includes('sensitivity') || skin === 'sensitive') return 'barrier';
      return 'hydration';
    }

    function saveAndNotify(message){
      saveState(skin, goal, concerns);
      feedback.textContent = message;
      feedback.classList.add('is-success');
      render();
    }

    document.addEventListener('click', function(event){
      const preset = event.target.closest('[data-preset]');
      if (preset) {
        const key = preset.getAttribute('data-preset');
        if (key === 'hydration') { skin = 'dry'; goal = 'hydration'; concerns = ['dehydration']; }
        else if (key === 'barrier') { skin = 'sensitive'; goal = 'barrier'; concerns = ['barrier']; }
        else if (key === 'glow') { skin = 'normal'; goal = 'glow'; concerns = ['glow']; }
        selectedPreset = key;
        document.querySelectorAll('[data-preset]').forEach(card => {
          const isActive = card.getAttribute('data-preset') === key;
          card.classList.toggle('is-active', isActive);
          card.toggleAttribute('data-active', isActive);
          card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        saveAndNotify('Hazır seçim uygulandı.');
        return;
      }
      const skinBtn = event.target.closest('[data-skin-type]');
      if (skinBtn) { skin = skinBtn.getAttribute('data-skin-type') || skin; selectedPreset = null; render(); return; }
      const goalBtn = event.target.closest('[data-goal]');
      if (goalBtn) { goal = goalBtn.getAttribute('data-goal') || goal; selectedPreset = null; render(); return; }
      const concernBtn = event.target.closest('[data-concern]');
      if (concernBtn) {
        const value = concernBtn.getAttribute('data-concern');
        concerns = concerns.includes(value) ? concerns.filter(item => item !== value) : concerns.concat(value).slice(0,2);
        selectedPreset = null;
        render();
      }
    });

    section.querySelectorAll('.home-routine__mood-btn').forEach((btn) => {
      btn.addEventListener('click', () => window.setTimeout(render, 0));
    });

    saveBtn?.addEventListener('click', function(){
      selectedPreset = presetFromState();
      saveAndNotify('Rutin kaydedildi.');
    });

    resetBtn?.addEventListener('click', function(){
      skin = 'combination'; goal = 'balance'; concerns = [];
      selectedPreset = presetFromState();
      saveAndNotify('Seçimler sıfırlandı.');
    });

    addBundleBtn?.addEventListener('click', function(){
      try {
        const items = JSON.parse(this.dataset.items || '[]');
        if (window.COSMOSKIN_CART_API?.addItems && items.length) {
          window.COSMOSKIN_CART_API.addItems(items, { openDrawer:true });
          feedback.textContent = 'Rutin seti sepete eklendi.';
          feedback.classList.add('is-success');
        }
      } catch(e) {}
    });

    document.addEventListener('cosmoskin:products-updated', render);
    render();
  });
})();
