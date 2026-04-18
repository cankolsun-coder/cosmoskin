
(function(){
  const SKIN_KEY = 'cosmoskin_skin_type';
  const CONCERNS_KEY = 'cosmoskin_skin_concerns';
  const PRODUCT_MAP = {
    cleanser: { id:'roundlab-cleanser', name:'1025 Dokdo Cleanser', note:'Nazik temizleme ile rutine net bir başlangıç sağlar.' },
    serum: { id:'torriden-divein-serum', name:'DIVE-IN Low Molecular Hyaluronic Acid Serum', note:'Katmanlı nem için hafif ve günlük kullanıma uygundur.' },
    sunscreen: { id:'boj-relief', name:'Relief Sun: Rice + Probiotics SPF 50+ PA++++', note:'%30 pirinç özü ve probiyotiklerle günlük kullanıma uygun SPF adımını tamamlar.' },
    moisturizer: { id:'roundlab-soy', name:'Soybean Nourishing Cream', note:'Siyah soya fasulyesi, seramid ve adenosin ile bakım adımını besleyici şekilde tamamlar.' },
    treatment: { id:'boj-glow', name:'Glow Serum: Propolis + Niacinamide', note:'Propolis ve niasinamid içeriğiyle daha dengeli ve canlı görünüm hedefleyen akışlara eşlik eder.' },
    essence: { id:'cosrx-snail', name:'Advanced Snail 96 Mucin Power Essence', note:'%96 snail mucin içeriğiyle serum öncesi nemli ve esnek bir katman sunar.' }
  };
  const BUNDLES = {
    hydration: { name:'Nem Rutini', meta:'3 ürün · günlük nem dengesi', items:[
      {id:'roundlab-cleanser',name:'1025 Dokdo Cleanser',brand:'Round Lab',price:729,image:'/assets/img/cleanse.jpg',qty:1},
      {id:'torriden-divein-serum',name:'DIVE-IN Low Molecular Hyaluronic Acid Serum',brand:'Torriden',price:949,image:'/assets/img/hydrate.jpg',qty:1},
      {id:'boj-relief',name:'Relief Sun: Rice + Probiotics SPF 50+ PA++++',brand:'Beauty of Joseon',price:899,image:'/assets/img/protect.jpg',qty:1}
    ]},
    barrier: { name:'Dengeli Katman', meta:'3 ürün · nem + bariyer desteği', items:[
      {id:'roundlab-cleanser',name:'1025 Dokdo Cleanser',brand:'Round Lab',price:729,image:'/assets/img/cleanse.jpg',qty:1},
      {id:'cosrx-snail',name:'Advanced Snail 96 Mucin Power Essence',brand:'COSRX',price:979,image:'/assets/img/hydrate.jpg',qty:1},
      {id:'roundlab-soy',name:'Soybean Nourishing Cream',brand:'Round Lab',price:1049,image:'/assets/img/care.jpg',qty:1}
    ]},
    glow: { name:'Glow Rutini', meta:'3 ürün · aydınlık görünüm odağı', items:[
      {id:'boj-glow',name:'Glow Serum: Propolis + Niacinamide',brand:'Beauty of Joseon',price:879,image:'/assets/img/treat.jpg',qty:1},
      {id:'torriden-divein-serum',name:'DIVE-IN Low Molecular Hyaluronic Acid Serum',brand:'Torriden',price:949,image:'/assets/img/hydrate.jpg',qty:1},
      {id:'boj-relief',name:'Relief Sun: Rice + Probiotics SPF 50+ PA++++',brand:'Beauty of Joseon',price:899,image:'/assets/img/protect.jpg',qty:1}
    ]}
  };
  const SKIN_LABELS = { dry:'Kuru', oily:'Yağlı', combination:'Karma', sensitive:'Hassas', normal:'Normal' };
  const CONCERN_LABELS = { dehydration:'Nemsizlik', sensitivity:'Hassasiyet', glow:'Donuk görünüm', barrier:'Bariyer desteği', tone:'Leke görünümü', blemish:'Akne eğilimi' };
  const ROUTE_MAP = { dehydration:'/collections/hydrate.html', sensitivity:'/collections/care.html', barrier:'/collections/care.html', tone:'/collections/treat.html', glow:'/collections/treat.html', blemish:'/collections/treat.html' };
  function getRoutineHref(skin, concerns){ const first=(concerns||[])[0]; if (first && ROUTE_MAP[first]) return ROUTE_MAP[first]; if (skin==='dry') return '/collections/hydrate.html'; if (skin==='sensitive') return '/collections/care.html'; if (skin==='oily' || skin==='combination') return '/collections/protect.html'; return '/collections/routine.html'; }

  function safeGetConcerns(){ try { return JSON.parse(localStorage.getItem(CONCERNS_KEY) || '[]'); } catch(e) { return []; } }
  function saveState(skin, concerns){ if (skin) localStorage.setItem(SKIN_KEY, skin); localStorage.setItem(CONCERNS_KEY, JSON.stringify(concerns || [])); }
  function buildRoutine(skin, concerns){
    const selected = new Set(concerns || []);
    const morning = [PRODUCT_MAP.cleanser, PRODUCT_MAP.serum, PRODUCT_MAP.sunscreen];
    const evening = [PRODUCT_MAP.cleanser, PRODUCT_MAP.serum, PRODUCT_MAP.moisturizer];
    const recommendations = [];
    let bundle = BUNDLES.hydration;
    let title = 'Dengeli başlangıç rutini';
    let summary = 'Sabah için temizleme, nem ve koruma; akşam için temizleme, serum ve konforlu kapanış önerilir.';
    if (skin === 'sensitive' || selected.has('sensitivity') || selected.has('barrier')) {
      morning.splice(1, 0, PRODUCT_MAP.essence);
      evening.splice(1, 0, PRODUCT_MAP.essence);
      recommendations.push('Destek Bakım · Barrier çizgisi');
      bundle = BUNDLES.barrier;
      title = 'Bariyer odağı güçlü rutin';
      summary = 'Daha hassas veya konfor odaklı bir cilt hissi için katmanlar yumuşatıldı ve bariyer desteği öne çıkarıldı.';
    }
    if (skin === 'oily' || skin === 'combination' || selected.has('blemish')) {
      recommendations.push('Hafif SPF · şehir kullanımı','Nazik temizleyici · sabah/akşam');
      title = 'Dengeli ve hafif rutin';
    }
    if (skin === 'dry' || selected.has('dehydration')) {
      recommendations.push('Yoğun nem kremi','Essence katmanı');
      title = 'Yoğun nem başlangıç rutini';
      summary = 'Nem tutmaya odaklanan katmanlar ile sabah ve akşam akışı daha destekleyici hale getirildi.';
      bundle = BUNDLES.barrier;
    }
    if (selected.has('glow') || selected.has('tone')) {
      evening[1] = PRODUCT_MAP.treatment;
      recommendations.push('Glow serum','Günlük SPF');
      bundle = BUNDLES.glow;
      title = 'Aydınlık görünüm rutini';
      summary = 'Daha canlı ve dengeli bir görünüm hedefleyen serum katmanı, sabah koruma ile eşleştirildi.';
    }
    if (!recommendations.length) recommendations.push('Nemlendirici','Günlük SPF','Nazik temizleyici');
    return { morning, evening, recommendations:[...new Set(recommendations)].slice(0,4), bundle, title, summary };
  }
  function renderSteps(target, items){ target.innerHTML = items.map(item => `<li><strong>${item.name}</strong><small>${item.note}</small></li>`).join(''); }
  function activateButtons(selector, value, attribute){ document.querySelectorAll(selector).forEach(btn => { btn.classList.toggle('is-active', btn.getAttribute(attribute) === value || (Array.isArray(value) && value.includes(btn.getAttribute(attribute)))); }); }

  document.addEventListener('DOMContentLoaded', function(){
    const section = document.getElementById('routineLanding');
    if (!section) return;
    const feedback = document.getElementById('homeRoutineFeedback');
    const morning = document.getElementById('homeRoutineMorning');
    const evening = document.getElementById('homeRoutineEvening');
    const recs = document.getElementById('homeRoutineRecommendations');
    const title = document.getElementById('homeRoutineTitle');
    const summary = document.getElementById('homeRoutineSummary');
    const meta = document.getElementById('homeRoutineMeta');
    const bundleName = document.getElementById('homeRoutineBundleName');
    const bundleMeta = document.getElementById('homeRoutineBundleMeta');
    const saveBtn = document.getElementById('homeRoutineSave');
    const generateBtn = document.getElementById('homeRoutineGenerate');
    const addBundleBtn = document.getElementById('homeRoutineAddBundle');
    const resultLink = document.getElementById('homeRoutineResultLink');
    let skin = localStorage.getItem(SKIN_KEY) || 'combination';
    let concerns = safeGetConcerns();
    function render(){
      activateButtons('[data-skin-type]', skin, 'data-skin-type');
      activateButtons('[data-concern]', concerns, 'data-concern');
      const result = buildRoutine(skin, concerns);
      title.textContent = result.title;
      summary.textContent = result.summary + (skin ? ` Seçim: ${SKIN_LABELS[skin] || 'Belirtilmedi'}.` : '');
      renderSteps(morning, result.morning);
      renderSteps(evening, result.evening);
      recs.innerHTML = result.recommendations.map(item => `<span>${item}</span>`).join('');
      bundleName.textContent = result.bundle.name;
      bundleMeta.textContent = result.bundle.meta;
      addBundleBtn.dataset.bundle = Object.keys(BUNDLES).find(key => BUNDLES[key] === result.bundle) || 'hydration';
      if (meta) meta.textContent = `Sabah ${result.morning.length} adım · Akşam ${result.evening.length} adım · ${result.bundle.meta}`;
      const href = getRoutineHref(skin, concerns);
      if (generateBtn) generateBtn.dataset.href = href;
      if (resultLink) resultLink.href = href;
      document.querySelectorAll('[data-preset]').forEach((card) => {
        const key = card.getAttribute('data-preset');
        card.classList.toggle('is-active', key === addBundleBtn.dataset.bundle);
      });
    }

    document.addEventListener('click', function(event){
      const presetBtn = event.target.closest('[data-preset]');
      if (presetBtn) {
        const preset = presetBtn.getAttribute('data-preset');
        if (preset === 'hydration') {
          skin = 'dry';
          concerns = ['dehydration'];
        } else if (preset === 'barrier') {
          skin = 'sensitive';
          concerns = ['barrier', 'sensitivity'];
        } else if (preset === 'glow') {
          skin = 'normal';
          concerns = ['glow', 'tone'];
        }
        render();
        feedback.textContent = `${presetBtn.querySelector('strong')?.textContent || 'Rutin'} seçim paneline uygulandı.`;
        feedback.classList.add('is-success');
        return;
      }
      const skinBtn = event.target.closest('[data-skin-type]');
      if (skinBtn) { skin = skinBtn.getAttribute('data-skin-type') || skin; render(); return; }
      const concernBtn = event.target.closest('[data-concern]');
      if (concernBtn) {
        const value = concernBtn.getAttribute('data-concern');
        concerns = concerns.includes(value) ? concerns.filter(item => item !== value) : concerns.concat(value).slice(0,3);
        render();
      }
    });
    saveBtn?.addEventListener('click', function(){
      saveState(skin, concerns); render();
      feedback.textContent = `${SKIN_LABELS[skin] || 'Cilt tipi'} seçimin kaydedildi. ${concerns.length ? concerns.map(item => CONCERN_LABELS[item]).join(', ') + ' odağıyla ' : ''}rutin hazırlandı.`;
      feedback.classList.add('is-success');
    });
    generateBtn?.addEventListener('click', function(){
      saveState(skin, concerns);
      window.location.href = this.dataset.href || getRoutineHref(skin, concerns);
    });
    addBundleBtn.addEventListener('click', function(){
      const bundle = BUNDLES[this.dataset.bundle || 'hydration'] || BUNDLES.hydration;
      if (window.COSMOSKIN_CART_API?.addItems) {
        window.COSMOSKIN_CART_API.addItems(bundle.items, { openDrawer:true });
        feedback.textContent = `${bundle.name} sepete eklendi.`;
        feedback.classList.add('is-success');
      }
    });
    render();
  });
})();
