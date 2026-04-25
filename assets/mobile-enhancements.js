(function(){
  if (window.innerWidth > 768) return;

  const path = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*$/, '');
  const pageMeta = {
    'cleanse.html': {eyebrow:'Step 01', title:'Nazik başlangıç', desc:'Jel ve köpük yapıda, cildi germeyen temizleme akışı.', chips:['Günlük','Nazik','Denge']},
    'hydrate.html': {eyebrow:'Step 02', title:'Nem katmanı', desc:'Essence, serum ve bariyer dostu nem desteği.', chips:['Nem','Bariyer','Katmanlı']},
    'treat.html': {eyebrow:'Step 03', title:'Hedef bakım', desc:'Ton, doku ve aydınlık görünüm için aktif seçkiler.', chips:['Aktif','Leke','Işıltı']},
    'care.html': {eyebrow:'Support', title:'Rutini tamamla', desc:'Krem, essence ve destek adımlarıyla kapanış.', chips:['Konfor','Krem','Bariyer']},
    'protect.html': {eyebrow:'Step 04', title:'Günlük koruma', desc:'Hafif yapıda SPF seçkileriyle final katmanı.', chips:['SPF','Hafif','Şehir']},
    'masks.html': {eyebrow:'Boost', title:'Hızlı bakım', desc:'Rutine destek veren maske ve ekstra bakım adımları.', chips:['Mask','Haftalık','Destek']},
    'routine.html': {eyebrow:'Edit', title:'Hazır rutin setleri', desc:'Başlangıç için dengeli ve tek bakışta anlaşılır akışlar.', chips:['Set','Kolay','Başlangıç']},
    'checkout.html': {eyebrow:'Secure checkout', title:'Hızlı ve net ödeme', desc:'Teslimat, ödeme ve sipariş özetini mobilde daha sade takip et.', chips:['Güvenli','KDV dahil','Net toplam']},
    'profile.html': {eyebrow:'Account', title:'Hesabını tek ekranda yönet', desc:'Sipariş, favori, adres ve rutin tercihlerini uygulama hissiyle takip et.', chips:['Sipariş','Favori','Adres']},
    'orders.html': {eyebrow:'Orders', title:'Sipariş akışın', desc:'Onaylanan siparişlerini ve toplamlarını mobilde daha rahat izle.', chips:['Takip','Özet','Geçmiş']},
    'anua.html': {eyebrow:'Brand edit', title:'Anua seçkisi', desc:'Heartleaf odaklı hafif ve sakinleştirici bakım ürünleri.', chips:['Heartleaf','Sakin','Günlük']},
    'beauty-of-joseon.html': {eyebrow:'Brand edit', title:'Beauty of Joseon', desc:'Glow, serum ve rahat SPF odağında güçlü edit.', chips:['Glow','SPF','Hanbang']},
    'cosrx.html': {eyebrow:'Brand edit', title:'COSRX seçkisi', desc:'Essence, aktif serum ve günlük bakım ikonları.', chips:['Snail','Active','Iconic']},
    'round-lab.html': {eyebrow:'Brand edit', title:'Round Lab', desc:'Nazik temizleme ve dengeli bariyer bakım seçkisi.', chips:['Nazik','Temizle','Denge']},
    'torriden.html': {eyebrow:'Brand edit', title:'Torriden', desc:'Katmanlı nem ve hafif doku arayanlar için edit.', chips:['Nem','Serum','SPF']},
    'skin1004.html': {eyebrow:'Brand edit', title:'SKIN1004', desc:'Centella odaklı hafif ve yatıştırıcı bakım akışı.', chips:['Centella','Hassas','Calm']},
    'thank-you-farmer.html': {eyebrow:'Brand edit', title:'Thank You Farmer', desc:'Günlük konfor ve bakım hissi veren rafine ürün çizgisi.', chips:['Daily','Comfort','Cream']},
    'blemish.html': {eyebrow:'Concern', title:'Akne eğilimi', desc:'Sebum ve gözenek odağında daha hafif seçimler.', chips:['Akne','Sebum','Gözenek']},
    'index.html': {eyebrow:'Cosmoskin mobile', title:'Seçilmiş K-beauty', desc:'Ana sayfada hızlı keşif, rafine kartlar ve uygulama hissine yakın gezinme.', chips:['Edit','Premium','Mobile']}
  };

  document.documentElement.classList.add('mobile-master-ready');
  document.body.classList.add('mobile-master-ready');

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function createSearchSheet(){
    if (qs('.mobile-search-sheet')) return;
    const el = document.createElement('div');
    el.className = 'mobile-search-sheet';
    const links = [
      ['/cleanse.html','Temizleyiciler'], ['/hydrate.html','Nem & Bariyer'], ['/treat.html','Hedef Bakım'], ['/protect.html','SPF'], ['/routine.html','Rutinler']
    ];
    const brands = [ ['/anua.html','Anua'], ['/cosrx.html','COSRX'], ['/beauty-of-joseon.html','BOJ'], ['/torriden.html','Torriden'] ];
    el.innerHTML = `
      <div class="mobile-search-sheet__inner">
        <div class="mobile-search-sheet__top">
          <button class="mobile-search-sheet__close" type="button" aria-label="Aramayı kapat">×</button>
          <div class="mobile-search-sheet__field">
            <span>⌕</span>
            <input type="search" placeholder="Ürün, marka veya içerik ara" aria-label="Mobil arama" />
          </div>
        </div>
        <div class="mobile-search-sheet__section">
          <h4>Hızlı erişim</h4>
          <div class="mobile-search-sheet__chips">${links.map(([u,t])=>`<a href="${u}">${t}</a>`).join('')}</div>
        </div>
        <div class="mobile-search-sheet__section">
          <h4>Markalar</h4>
          <div class="mobile-search-sheet__cards">${brands.map(([u,t])=>`<a href="${u}"><small>Brand</small><strong>${t}</strong></a>`).join('')}</div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const input = qs('input', el);
    qs('.mobile-search-sheet__close', el).addEventListener('click', ()=> el.classList.remove('is-open'));
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        const q = input.value.trim();
        if(q) window.location.href = `/index.html?q=${encodeURIComponent(q)}`;
      }
    });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') el.classList.remove('is-open'); });
    window.openMobileSearch = function(){ if(qs('.cs-bottom-nav')){ location.href='/search.html'; return; } el.classList.add('is-open'); setTimeout(()=>input.focus(), 30); };
  }

  function addSearchButton(){
    if(qs('.cs-bottom-nav')) return;
    const tools = qs('.header-tools');
    if (!tools || qs('.mobile-header-search-btn', tools)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-header-search-btn';
    btn.setAttribute('aria-label', 'Arama');
    btn.innerHTML = '⌕';
    btn.addEventListener('click', ()=> window.openMobileSearch && window.openMobileSearch());
    tools.prepend(btn);
  }

  function enhanceHeader(){
    const header = qs('.header');
    if(!header) return;
    let lastY = 0;
    const onScroll = ()=>{
      const y = window.scrollY || 0;
      header.classList.toggle('mobile-header-condensed', y > 24);
      document.body.classList.toggle('mobile-scroll-down', y > lastY && y > 88);
      lastY = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive:true});
  }

  function addBottomNav(){
    if(qs('.mobile-bottom-nav') || qs('.cs-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    const catPages = ['cleanse.html','hydrate.html','treat.html','protect.html','care.html','masks.html','blemish.html','anua.html','beauty-of-joseon.html','cosrx.html','round-lab.html','skin1004.html','thank-you-farmer.html','torriden.html','routine.html'];
    const accountActive = /profile|orders/.test(path);
    const cartActive = /checkout/.test(path);
    nav.innerHTML = `
      <a href="/index.html" class="${path === 'index.html' ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">⌂</span><span>Anasayfa</span></a>
      <a href="/cleanse.html" class="${catPages.includes(path) ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">◫</span><span>Shop</span></a>
      <button type="button" class="mobile-bottom-nav__search"><span class="mobile-bottom-nav__icon">⌕</span><span>Ara</span></button>
      <a href="/profile.html" class="${accountActive ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">◌</span><span>Hesap</span></a>
      <a href="/checkout.html" class="${cartActive ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">👜</span><span>Sepet</span></a>`;
    qs('.mobile-bottom-nav__search', nav).addEventListener('click', ()=> window.openMobileSearch && window.openMobileSearch());
    document.body.appendChild(nav);
  }

  function decoratePageHero(){
    const hero = qs('.page-hero, .empty-collection__card');
    if(!hero || qs('.mobile-luxe-hero__meta', hero)) return;
    hero.classList.add('mobile-luxe-hero');
    const meta = pageMeta[path] || pageMeta['index.html'];
    const metaEl = document.createElement('div');
    metaEl.className = 'mobile-luxe-hero__meta';
    metaEl.innerHTML = `
      <div class="mobile-luxe-hero__topline"><span>${meta.eyebrow}</span><strong>${meta.title}</strong></div>
      <p>${meta.desc}</p>
      <div class="mobile-luxe-hero__chips">${meta.chips.map(ch => `<span>${ch}</span>`).join('')}</div>`;
    const inner = hero.classList.contains('empty-collection__card') ? hero : qs('.container', hero) || hero;
    inner.appendChild(metaEl);
  }

  function addPagePills(){
    const hero = qs('.page-hero .container, .empty-collection__card');
    if(!hero || qs('.mobile-page-pillbar', hero)) return;
    const wrap = document.createElement('div');
    wrap.className = 'mobile-page-pillbar';
    wrap.innerHTML = `
      <a href="/index.html">Anasayfa</a>
      <a href="/routine.html">Rutinler</a>
      <a href="/protect.html">SPF</a>
      <a href="/hydrate.html">Nem</a>
      <a href="/treat.html">Bakım</a>`;
    qsa('a', wrap).forEach(a=>{ if((a.getAttribute('href').split('/').pop() || '').replace(/\?.*/, '') === path) a.classList.add('is-active'); });
    hero.appendChild(wrap);
  }

  function addEditorialRail(){
    if(path === 'index.html' || qs('.mobile-editorial-rail')) return;
    const anchor = qs('.page-hero, .empty-collection, .section');
    if(!anchor) return;
    const section = document.createElement('section');
    section.className = 'mobile-editorial-rail';
    section.innerHTML = `
      <div class="mobile-editorial-rail__head"><span>Mobil edit</span><strong>Hızlı seçim alanı</strong></div>
      <div class="mobile-editorial-rail__track">
        <a href="/cleanse.html"><small>Step 01</small><strong>Temizle</strong><span>Arındır & başlat</span></a>
        <a href="/hydrate.html"><small>Step 02</small><strong>Nemlendir</strong><span>Katmanlı nem</span></a>
        <a href="/treat.html"><small>Step 03</small><strong>Bakım</strong><span>Aktif hedef seçkisi</span></a>
        <a href="/protect.html"><small>Step 04</small><strong>Koru</strong><span>Hafif SPF</span></a>
      </div>`;
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
  }

  function addCategoryShortcuts(){
    if(path === 'index.html' || qs('.mobile-category-shortcuts')) return;
    const target = qs('.product-grid')?.parentElement;
    if(!target) return;
    const section = document.createElement('section');
    section.className = 'mobile-category-shortcuts';
    section.innerHTML = `
      <div class="mobile-category-shortcuts__head"><div class="mobile-category-shortcuts__title">Hızlı kategori</div><a href="/index.html#collections">Tümü</a></div>
      <div class="mobile-category-shortcuts__track">
        <a class="mobile-category-shortcuts__item" href="/cleanse.html"><span class="mobile-category-shortcuts__eyebrow">Step 01</span><strong class="mobile-category-shortcuts__name">Temizle</strong></a>
        <a class="mobile-category-shortcuts__item" href="/hydrate.html"><span class="mobile-category-shortcuts__eyebrow">Step 02</span><strong class="mobile-category-shortcuts__name">Nemlendir</strong></a>
        <a class="mobile-category-shortcuts__item" href="/treat.html"><span class="mobile-category-shortcuts__eyebrow">Step 03</span><strong class="mobile-category-shortcuts__name">Bakım</strong></a>
        <a class="mobile-category-shortcuts__item" href="/protect.html"><span class="mobile-category-shortcuts__eyebrow">Step 04</span><strong class="mobile-category-shortcuts__name">Koru</strong></a>
      </div>`;
    target.parentNode.insertBefore(section, target);
  }

  function decorateProductCards(){
    qsa('.product-card').forEach((card, index)=>{
      if(qs('.mobile-card-accent', card)) return;
      const body = qs('.product-body', card);
      if(!body) return;
      const accent = document.createElement('div');
      accent.className = 'mobile-card-accent';
      accent.innerHTML = `<span>Selected edit</span><small>${String(index+1).padStart(2,'0')}</small>`;
      body.insertBefore(accent, body.firstChild);
      const priceRow = qs('.price-row', card);
      if(priceRow && !qs('.mobile-card-detail-link', priceRow)){
        const mediaLink = qs('.product-media', card);
        const detail = document.createElement(mediaLink && mediaLink.getAttribute('href') ? 'a' : 'button');
        detail.className = 'mobile-card-detail-link';
        detail.textContent = 'Detayı Gör';
        if(detail.tagName === 'A') detail.href = mediaLink.getAttribute('href');
        else detail.type = 'button';
        priceRow.insertBefore(detail, priceRow.lastElementChild);
      }
    });
  }

  function enhanceAccountPage(){
    if(path !== 'profile.html') return;
    const main = qs('.acc-main');
    if(!main || qs('.mobile-account-tabs')) return;
    const tabs = document.createElement('div');
    tabs.className = 'mobile-account-tabs';
    tabs.innerHTML = `
      <button type="button" data-mobile-tab="overview" class="is-active">Genel</button>
      <button type="button" data-mobile-tab="orders">Sipariş</button>
      <button type="button" data-mobile-tab="favorites">Favori</button>
      <button type="button" data-mobile-tab="profile">Profil</button>`;
    main.parentNode.insertBefore(tabs, main);
    qsa('button', tabs).forEach(btn => {
      btn.addEventListener('click', ()=>{
        qsa('button', tabs).forEach(b=>b.classList.toggle('is-active', b===btn));
        const target = qs('#tab-'+btn.dataset.mobileTab);
        if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
  }

  function enhanceOrdersPage(){
    if(path !== 'orders.html') return;
    const head = qs('.section-head');
    if(!head || qs('.mobile-orders-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'mobile-orders-banner';
    banner.innerHTML = `<small>Sipariş Merkezi</small><strong>Onay, toplam ve geçmişi tek akışta görüntüle</strong>`;
    head.parentNode.insertBefore(banner, head.nextSibling);
  }

  function addCheckoutStepper(){
    if(path !== 'checkout.html' || qs('.mobile-checkout-steps')) return;
    const hero = qs('.page-hero .container');
    if(!hero) return;
    const steps = document.createElement('div');
    steps.className = 'mobile-checkout-steps';
    steps.innerHTML = `
      <span class="is-active"><small>01</small><strong>Adres</strong></span>
      <span><small>02</small><strong>Ödeme</strong></span>
      <span><small>03</small><strong>Onay</strong></span>`;
    hero.appendChild(steps);
  }

  function addCheckoutSticky(){
    if (path !== 'checkout.html' || qs('.mobile-sticky-checkout')) return;
    const sourceBtn = qs('.checkout-summary .btn.btn-primary, .checkout-summary a.btn.btn-primary, #checkoutSubmit');
    const bar = document.createElement('div');
    bar.className = 'mobile-sticky-checkout';
    bar.innerHTML = `
      <div class="mobile-sticky-checkout__meta">
        <span class="mobile-sticky-checkout__label">Ödenecek Toplam</span>
        <strong class="mobile-sticky-checkout__price">—</strong>
      </div>
      <button class="btn btn-primary" type="button">Ödemeye Geç</button>`;
    qs('button', bar).addEventListener('click', ()=>{
      if(sourceBtn) sourceBtn.click();
      else window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'});
    });
    document.body.appendChild(bar);
    const sync = ()=>{
      const liveTotal = qs('#checkoutTotal, #cartTotal, .checkout-summary .sum-row.total strong');
      if(liveTotal) qs('.mobile-sticky-checkout__price', bar).textContent = liveTotal.textContent.trim();
    };
    sync();
    setInterval(sync, 900);
  }

  function makePdpAccordions(){
    qsa('.pdp-detail-card').forEach((card, idx)=>{
      if(qs('.mobile-pdp-accordion', card)) return;
      const columns = qs('.pdp-columns', card);
      const note = qs('.pdp-detail-note', card);
      const specs = qs('.pdp-spec-grid', card);
      const head = qs('.pdp-detail-card__head', card);
      if(!head || !columns) return;
      const wrap = document.createElement('div');
      wrap.className = 'mobile-pdp-accordion';
      const sections = [];
      if(specs) sections.push({title:'Teknik bilgiler', body:specs.outerHTML});
      qsa('div', columns).forEach(col=>{
        const h = qs('h4', col); const block = col.cloneNode(true); if(h) h.remove();
        sections.push({title:h ? h.textContent.trim() : 'Detay', body:block.innerHTML});
      });
      if(note) sections.push({title:'Kısa not', body:note.innerHTML});
      wrap.innerHTML = sections.map((s, i)=>`<details class="mobile-pdp-accordion__item" ${i===0?'open':''}><summary>${s.title}</summary><div class="mobile-pdp-accordion__body">${s.body}</div></details>`).join('');
      columns.style.display='none';
      if(specs) specs.style.display='none';
      if(note) note.style.display='none';
      card.insertBefore(wrap, qs('.pdp-detail-actions', card) || null);
      const badge = document.createElement('div');
      badge.className = 'mobile-pdp-card-badge';
      badge.textContent = idx === 0 ? 'Öne çıkan seçim' : 'Detaylı inceleme';
      head.appendChild(badge);
    });
  }

  function addStickyPdpBar(){
    if(path === 'checkout.html' || path === 'index.html' || qs('.mobile-sticky-pdp')) return;
    const first = qs('.pdp-detail-card');
    if(!first) return;
    const title = qs('h3', first)?.textContent?.trim() || 'Seçili ürün';
    const price = qs('.pdp-detail-card__price', first)?.textContent?.trim() || '—';
    const primaryLink = qs('.pdp-detail-actions .btn.btn-primary', first);
    const bar = document.createElement('div');
    bar.className = 'mobile-sticky-pdp';
    bar.innerHTML = `
      <div class="mobile-sticky-pdp__copy">
        <span>${title}</span>
        <strong>${price}</strong>
      </div>
      <button type="button" class="btn btn-primary">Güvenli Ödeme</button>`;
    qs('button', bar).addEventListener('click', ()=>{
      if(primaryLink) window.location.href = primaryLink.getAttribute('href') || '/checkout.html';
      else window.location.href = '/checkout.html';
    });
    document.body.appendChild(bar);
  }

  function makeFiltersSticky(){
    const row = qs('.filter-row');
    if(row) row.classList.add('mobile-sticky-filters');
  }

  function addButtonFeedback(){
    qsa('button, .btn, a').forEach(el=>{
      if(el.dataset.mobileFxBound) return;
      el.dataset.mobileFxBound='1';
      el.addEventListener('touchstart', ()=> el.classList.add('is-touched'), {passive:true});
      const clear = ()=> el.classList.remove('is-touched');
      el.addEventListener('touchend', clear, {passive:true});
      el.addEventListener('touchcancel', clear, {passive:true});
    });
  }

  function upgradeDrawers(){
    qsa('.drawer').forEach(d=>d.classList.add('mobile-bottom-sheet'));
  }

  function init(){
    createSearchSheet();
    addSearchButton();
    enhanceHeader();
    addBottomNav();
    decoratePageHero();
    addPagePills();
    addEditorialRail();
    addCategoryShortcuts();
    decorateProductCards();
    enhanceAccountPage();
    enhanceOrdersPage();
    addCheckoutStepper();
    addCheckoutSticky();
    makePdpAccordions();
    addStickyPdpBar();
    makeFiltersSticky();
    upgradeDrawers();
    addButtonFeedback();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
