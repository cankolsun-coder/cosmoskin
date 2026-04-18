
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

  const PRODUCTS = {
    cleanser: {
      id:'roundlab-cleanser', name:'1025 Dokdo Cleanser', brand:'Round Lab', volume:'150 ml', price:729, image:'/assets/img/cleanse.jpg',
      step:'Temizle', reason:'Nazik temizleme ile rutine temiz ve dengeli bir başlangıç sağlar.'
    },
    hydratingSerum: {
      id:'torriden-divein-serum', name:'DIVE-IN Low Molecular Hyaluronic Acid Serum', brand:'Torriden', volume:'50 ml', price:949, image:'/assets/img/hydrate.jpg',
      step:'Serum', reason:'Katmanlı nem hissi verir, dokusu hafiftir ve günlük kullanıma kolay uyum sağlar.'
    },
    snailEssence: {
      id:'cosrx-snail', name:'Advanced Snail 96 Mucin Power Essence', brand:'COSRX', volume:'100 ml', price:979, image:'/assets/img/hydrate.jpg',
      step:'Essence', reason:'Daha esnek ve konforlu bir ara katman oluşturarak cildi destekler.'
    },
    glowSerum: {
      id:'boj-glow', name:'Glow Serum: Propolis + Niacinamide', brand:'Beauty of Joseon', volume:'30 ml', price:879, image:'/assets/img/treat.jpg',
      step:'Tedavi', reason:'Daha canlı ve dengeli görünüm odağı için serum katmanını güçlendirir.'
    },
    moisturizer: {
      id:'roundlab-soy', name:'Soybean Nourishing Cream', brand:'Round Lab', volume:'80 ml', price:1049, image:'/assets/img/care.jpg',
      step:'Nemlendir', reason:'Rutini daha konforlu kapatır ve özellikle kuruya dönük histe iyi tamamlayıcı olur.'
    },
    reliefSun: {
      id:'boj-relief', name:'Relief Sun: Rice + Probiotics SPF50+ PA++++', brand:'Beauty of Joseon', volume:'50 ml', price:899, image:'/assets/img/protect.jpg',
      step:'Koruma', reason:'Sabah rutinini hafif his veren günlük güneş koruması ile tamamlar.'
    },
    waterySun: {
      id:'torriden-watery-sun', name:'DIVE-IN Watery Moisture Sun Cream SPF50+ PA++++', brand:'Torriden', volume:'60 ml', price:899, image:'/assets/img/protect.jpg',
      step:'Koruma', reason:'Daha hafif ve sulu hissiyat arayan seçimler için sabah katmanını dengeler.'
    }
  };

  function getSavedArray(){ try { return JSON.parse(localStorage.getItem(CONCERNS_KEY) || '[]'); } catch(e){ return []; } }
  function saveState(skin, goal, concerns){ if (skin) localStorage.setItem(SKIN_KEY, skin); if (goal) localStorage.setItem(GOAL_KEY, goal); localStorage.setItem(CONCERNS_KEY, JSON.stringify(concerns || [])); }
  function getState(){ return { skin: localStorage.getItem(SKIN_KEY) || 'combination', goal: localStorage.getItem(GOAL_KEY) || 'balance', concerns: getSavedArray() }; }
  function money(v){ return `${fmt.format(v)} TL`; }

  function buildRoutine(skin, goal, concerns){
    const selected = new Set(concerns || []);
    let items = [PRODUCTS.cleanser];
    let title = 'Dengeli günlük rutin';
    let analysis = 'Hafif, günlük ve kolay uygulanabilir kurgu';
    let summary = 'Sabah koruma ve akşam toparlayıcı nem odağıyla dengeli bir ürün seti önerildi.';
    let tags = [LABELS.skin[skin], LABELS.goal[goal]];

    if (goal === 'glow' || selected.has('tone') || selected.has('glow')) {
      items.push(PRODUCTS.glowSerum);
      title = 'Işıltı odaklı rutin';
      analysis = 'Daha canlı görünüm için serum odağı güçlendirildi';
      summary = 'Temizleme sonrası propolis ve niacinamide çizgisindeki serum ile daha canlı görünüm odağı öne çıkarıldı.';
      tags.push('Serum odağı');
    } else if (goal === 'barrier' || selected.has('sensitivity') || selected.has('barrier') || skin === 'sensitive') {
      items.push(PRODUCTS.snailEssence);
      title = 'Bariyer destekli rutin';
      analysis = 'Daha yumuşak katmanlar ve konfor odağı';
      summary = 'Ara katmanda daha destekleyici bir essence ve kapanışta daha konforlu bir krem ile hassasiyeti zorlamayan bir akış kuruldu.';
      tags.push('Essence katmanı');
    } else {
      items.push(PRODUCTS.hydratingSerum);
      if (goal === 'hydration' || selected.has('dehydration') || skin === 'dry') {
        title = 'Nem odaklı rutin';
        analysis = 'Nem hissini yükselten, günlük kullanımı kolay kurgu';
        summary = 'Serum ve krem katmanı daha belirgin tutularak su kaybı hissini azaltmaya odaklanan bir kombinasyon oluşturuldu.';
        tags.push('Yoğun nem');
      }
    }

    const useCream = goal === 'hydration' || goal === 'barrier' || selected.has('dehydration') || selected.has('barrier') || skin === 'dry' || skin === 'sensitive';
    if (useCream) items.push(PRODUCTS.moisturizer);

    const spf = (skin === 'oily' || skin === 'combination' || goal === 'balance' || selected.has('blemish')) ? PRODUCTS.waterySun : PRODUCTS.reliefSun;
    items.push(spf);

    if (skin === 'oily' || skin === 'combination' || goal === 'balance' || selected.has('blemish')) {
      title = goal === 'glow' ? title : 'Hafif denge rutini';
      analysis = goal === 'glow' ? analysis : 'Daha hafif his ve günlük denge odağı';
      if (goal !== 'glow') summary = 'Temizleme, hafif serum ve sulu his veren SPF ile günlük ritme kolay uyum sağlayan bir set kurgulandı.';
      tags.push('Hafif bitiş');
    }

    tags = [...new Set(tags.concat((concerns || []).map(c => LABELS.concern[c]).filter(Boolean)))].slice(0,4);
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const bundleName = title.replace('rutini','seti').replace('rutin','set');
    const route = goal === 'glow' || selected.has('tone') ? '/collections/treat.html' : goal === 'barrier' || selected.has('sensitivity') ? '/collections/care.html' : goal === 'hydration' || selected.has('dehydration') ? '/collections/hydrate.html' : '/collections/routine.html';
    return { items, title, analysis, summary, tags, total, bundleName, route, meta: `${items.length} ürün · ${money(total)}` };
  }

  function syncButtons(selector, value, attr){
    document.querySelectorAll(selector).forEach(btn => {
      const candidate = btn.getAttribute(attr);
      btn.classList.toggle('is-active', Array.isArray(value) ? value.includes(candidate) : candidate === value);
    });
  }

  function renderProductGrid(target, items){
    target.innerHTML = items.map(item => `
      <article class="home-routine__product-card">
        <div class="home-routine__product-media"><img src="${item.image}" alt="${item.name}"></div>
        <div class="home-routine__product-copy">
          <span class="home-routine__product-step">${item.step}</span>
          <div class="home-routine__product-name">${item.name}</div>
          <div class="home-routine__product-meta">${item.brand} · ${item.volume} · ${money(item.price)}</div>
          <div class="home-routine__product-reason">${item.reason}</div>
        </div>
      </article>
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
      const result = buildRoutine(skin, goal, concerns);
      progressFill.style.width = `${calcProgress()}%`;
      titleEl.textContent = result.title;
      analysisTitle.textContent = result.analysis;
      summaryEl.textContent = result.summary;
      metaEl.textContent = `${result.items.length} adım · ${LABELS.skin[skin] || ''}`.trim();
      tagsEl.innerHTML = result.tags.map(tag => `<span>${tag}</span>`).join('');
      renderProductGrid(gridEl, result.items);
      bundleNameEl.textContent = result.bundleName;
      bundleMetaEl.textContent = result.meta;
      linkEl.href = result.route;
      addBundleBtn.dataset.items = JSON.stringify(result.items.map(({id,name,brand,price,image}) => ({id,name,brand,price,image,qty:1})));
      document.querySelectorAll('[data-preset]').forEach(card => {
        const isActive = card.getAttribute('data-preset') === selectedPreset;
        card.classList.toggle('is-active', isActive);
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
        if (key === 'hydration') {
          skin = 'dry'; goal = 'hydration'; concerns = ['dehydration'];
        } else if (key === 'barrier') {
          skin = 'sensitive'; goal = 'barrier'; concerns = ['barrier'];
        } else if (key === 'glow') {
          skin = 'normal'; goal = 'glow'; concerns = ['glow'];
        }
        selectedPreset = key;
        saveAndNotify('Hazır seçim uygulandı.');
        return;
      }
      const skinBtn = event.target.closest('[data-skin-type]');
      if (skinBtn) { skin = skinBtn.getAttribute('data-skin-type') || skin; selectedPreset = presetFromState(); render(); return; }
      const goalBtn = event.target.closest('[data-goal]');
      if (goalBtn) { goal = goalBtn.getAttribute('data-goal') || goal; selectedPreset = presetFromState(); render(); return; }
      const concernBtn = event.target.closest('[data-concern]');
      if (concernBtn) {
        const value = concernBtn.getAttribute('data-concern');
        concerns = concerns.includes(value) ? concerns.filter(item => item !== value) : concerns.concat(value).slice(0,2);
        selectedPreset = presetFromState();
        render();
      }
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

    render();
  });
})();
