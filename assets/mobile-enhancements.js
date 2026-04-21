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
    'blemish.html': {eyebrow:'Concern', title:'Akne eğilimi', desc:'Sebum ve gözenek odağında daha hafif seçimler.', chips:['Akne','Sebum','Gözenek']}
  };

  function createSearchSheet(){
    if (document.querySelector('.mobile-search-sheet')) return;
    const el = document.createElement('div');
    el.className = 'mobile-search-sheet';
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
          <div class="mobile-search-sheet__chips">
            <a href="/cleanse.html">Temizleyiciler</a>
            <a href="/hydrate.html">Nem &amp; Bariyer</a>
            <a href="/treat.html">Hedef Bakım</a>
            <a href="/protect.html">SPF</a>
            <a href="/routine.html">Rutinler</a>
          </div>
        </div>
        <div class="mobile-search-sheet__section">
          <h4>Markalar</h4>
          <div class="mobile-search-sheet__cards">
            <a href="/anua.html"><small>Brand</small><strong>Anua</strong></a>
            <a href="/cosrx.html"><small>Brand</small><strong>COSRX</strong></a>
            <a href="/beauty-of-joseon.html"><small>Brand</small><strong>BOJ</strong></a>
            <a href="/torriden.html"><small>Brand</small><strong>Torriden</strong></a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const input = el.querySelector('input');
    el.querySelector('.mobile-search-sheet__close').addEventListener('click', ()=> el.classList.remove('is-open'));
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        const q = input.value.trim();
        if(q){ window.location.href = `/index.html?q=${encodeURIComponent(q)}`; }
      }
    });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') el.classList.remove('is-open'); });
    window.openMobileSearch = function(){ el.classList.add('is-open'); setTimeout(()=>input.focus(), 30); };
  }

  function addSearchButton(){
    const tools = document.querySelector('.header-tools');
    if (!tools || tools.querySelector('.mobile-header-search-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-header-search-btn';
    btn.setAttribute('aria-label', 'Arama');
    btn.innerHTML = '⌕';
    btn.addEventListener('click', ()=> window.openMobileSearch && window.openMobileSearch());
    tools.prepend(btn);
  }

  function enhanceHeader(){
    const header = document.querySelector('.header');
    if(!header) return;
    let lastY = 0;
    const onScroll = ()=>{
      const y = window.scrollY || 0;
      header.classList.toggle('mobile-header-condensed', y > 24);
      document.body.classList.toggle('mobile-scroll-down', y > lastY && y > 80);
      lastY = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive:true});
  }

  function addBottomNav(){
    if(document.querySelector('.mobile-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    const catPages = ['cleanse.html','hydrate.html','treat.html','protect.html','care.html','masks.html','blemish.html','anua.html','beauty-of-joseon.html','cosrx.html','round-lab.html','skin1004.html','thank-you-farmer.html','torriden.html'];
    const accountActive = /profile|orders/.test(path);
    const cartActive = /checkout/.test(path);
    nav.innerHTML = `
      <a href="/index.html" class="${path === 'index.html' ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">⌂</span><span>Ana Sayfa</span></a>
      <a href="/cleanse.html" class="${catPages.includes(path) ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">◫</span><span>Shop</span></a>
      <button type="button" class="mobile-bottom-nav__search"><span class="mobile-bottom-nav__icon">⌕</span><span>Ara</span></button>
      <a href="/profile.html" class="${accountActive ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">◌</span><span>Hesap</span></a>
      <a href="/checkout.html" class="${cartActive ? 'is-active' : ''}"><span class="mobile-bottom-nav__icon">👜</span><span>Sepet</span></a>`;
    nav.querySelector('.mobile-bottom-nav__search').addEventListener('click', ()=> window.openMobileSearch && window.openMobileSearch());
    document.body.appendChild(nav);
  }

  function decoratePageHero(){
    const hero = document.querySelector('.page-hero, .empty-collection__card');
    if(!hero || hero.querySelector('.mobile-luxe-hero__meta')) return;
    hero.classList.add('mobile-luxe-hero');
    const meta = pageMeta[path] || {eyebrow:'Cosmoskin', title:'Mobil seçki', desc:'Rafine ve hızlı bir mobil alışveriş deneyimi.' , chips:['Premium','Mobile','Edit']};
    const metaEl = document.createElement('div');
    metaEl.className = 'mobile-luxe-hero__meta';
    metaEl.innerHTML = `
      <div class="mobile-luxe-hero__topline"><span>${meta.eyebrow}</span><strong>${meta.title}</strong></div>
      <p>${meta.desc}</p>
      <div class="mobile-luxe-hero__chips">${meta.chips.map(ch => `<span>${ch}</span>`).join('')}</div>`;
    const inner = hero.querySelector('.container, .empty-collection__card');
    if (hero.classList.contains('empty-collection__card')) hero.appendChild(metaEl);
    else inner.appendChild(metaEl);
  }

  function addPagePills(){
    const hero = document.querySelector('.page-hero .container, .empty-collection__card');
    if(!hero || hero.querySelector('.mobile-page-pillbar')) return;
    const wrap = document.createElement('div');
    wrap.className = 'mobile-page-pillbar';
    wrap.innerHTML = `
      <a href="/index.html">Anasayfa</a>
      <a href="/routine.html">Rutinler</a>
      <a href="/protect.html">SPF</a>
      <a href="/hydrate.html">Nem</a>
      <a href="/treat.html">Bakım</a>`;
    wrap.querySelectorAll('a').forEach(a=>{ if(a.getAttribute('href').endsWith(path)) a.classList.add('is-active'); });
    hero.appendChild(wrap);
  }

  function addEditorialRail(){
    if(path === 'index.html' || document.querySelector('.mobile-editorial-rail')) return;
    const anchor = document.querySelector('.page-hero, .empty-collection, .section');
    if(!anchor) return;
    const section = document.createElement('section');
    section.className = 'mobile-editorial-rail';
    section.innerHTML = `
      <div class="mobile-editorial-rail__head">
        <span>Mobil edit</span>
        <strong>Hızlı seçim alanı</strong>
      </div>
      <div class="mobile-editorial-rail__track">
        <a href="/cleanse.html"><small>Step 01</small><strong>Temizle</strong><span>Arındır & başlat</span></a>
        <a href="/hydrate.html"><small>Step 02</small><strong>Nemlendir</strong><span>Katmanlı denge</span></a>
        <a href="/treat.html"><small>Step 03</small><strong>Hedef Bakım</strong><span>Aktif seçkiler</span></a>
        <a href="/protect.html"><small>Step 04</small><strong>Koru</strong><span>Günlük SPF</span></a>
      </div>`;
    anchor.insertAdjacentElement('afterend', section);
  }

  function addCategoryShortcuts(){
    const productGrid = document.querySelector('.product-grid, .routine-bundles__grid, .checkout-layout, .acc-main');
    const anchor = document.querySelector('.mobile-editorial-rail, .page-hero, .empty-collection');
    if(!anchor || !productGrid || document.querySelector('.mobile-category-shortcuts')) return;
    const sec = document.createElement('section');
    sec.className = 'mobile-category-shortcuts';
    sec.innerHTML = `
      <div class="mobile-category-shortcuts__head"><p class="mobile-category-shortcuts__title">Mobilde popüler akış</p><a href="/index.html#collections">Tümü</a></div>
      <div class="mobile-category-shortcuts__track">
        <a class="mobile-category-shortcuts__item" href="/cleanse.html"><span class="mobile-category-shortcuts__eyebrow">Cleanse</span><span class="mobile-category-shortcuts__name">Temizle</span></a>
        <a class="mobile-category-shortcuts__item" href="/hydrate.html"><span class="mobile-category-shortcuts__eyebrow">Hydrate</span><span class="mobile-category-shortcuts__name">Nemlendir</span></a>
        <a class="mobile-category-shortcuts__item" href="/treat.html"><span class="mobile-category-shortcuts__eyebrow">Treat</span><span class="mobile-category-shortcuts__name">Hedef Bakım</span></a>
        <a class="mobile-category-shortcuts__item" href="/protect.html"><span class="mobile-category-shortcuts__eyebrow">Protect</span><span class="mobile-category-shortcuts__name">Koru</span></a>
      </div>`;
    anchor.insertAdjacentElement('afterend', sec);
  }

  function decorateProductCards(){
    document.querySelectorAll('.product-card').forEach((card, idx)=>{
      if(card.querySelector('.mobile-card-accent')) return;
      card.classList.add('mobile-product-card');
      const accent = document.createElement('div');
      accent.className = 'mobile-card-accent';
      accent.innerHTML = `<span>${idx < 2 ? 'Editör Seçimi' : 'Günlük Seçki'}</span><small>KDV dahil</small>`;
      const body = card.querySelector('.product-body');
      if(body) body.prepend(accent);
    });
  }

  function enhanceAccountPage(){
    if(path !== 'profile.html') return;
    const main = document.querySelector('.acc-main');
    const sidebar = document.querySelector('.acc-sidebar');
    if(!main || !sidebar || document.querySelector('.mobile-account-tabs')) return;
    const tabs = document.createElement('div');
    tabs.className = 'mobile-account-tabs';
    tabs.innerHTML = `
      <button data-target="overview" class="is-active">Genel</button>
      <button data-target="orders">Sipariş</button>
      <button data-target="favorites">Favori</button>
      <button data-target="addresses">Adres</button>`;
    sidebar.insertAdjacentElement('afterend', tabs);
    tabs.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const target = btn.dataset.target;
        const navBtn = document.querySelector(`.acc-nav-item[data-tab="${target}"]`);
        if(navBtn) navBtn.click();
        tabs.querySelectorAll('button').forEach(b=>b.classList.remove('is-active'));
        btn.classList.add('is-active');
        window.scrollTo({top: tabs.offsetTop - 12, behavior:'smooth'});
      });
    });
  }

  function enhanceOrdersPage(){
    if(path !== 'orders.html') return;
    const head = document.querySelector('.section-head');
    if(!head || document.querySelector('.mobile-orders-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'mobile-orders-banner';
    banner.innerHTML = `<small>Sipariş Merkezi</small><strong>Onay, toplam ve geçmişi tek akışta görüntüle</strong>`;
    head.parentNode.insertBefore(banner, head.nextSibling);
  }

  function addCheckoutStepper(){
    if(path !== 'checkout.html' || document.querySelector('.mobile-checkout-steps')) return;
    const hero = document.querySelector('.page-hero .container');
    if(!hero) return;
    const steps = document.createElement('div');
    steps.className = 'mobile-checkout-steps';
    steps.innerHTML = `
      <span class="is-active"><small>01</small><strong>Adres</strong></span>
      <span><small>02</small><strong>Ödeme</strong></span>
      <span><small>03</small><strong>Onay</strong></span>`;
    hero.appendChild(steps);
  }


  function enhancePdpExperience(){
    const pdpCards = Array.from(document.querySelectorAll('.pdp-detail-card'));
    if(!pdpCards.length) return;

    const cardMap = new Map();
    document.querySelectorAll('.product-card').forEach(card => {
      const title = card.querySelector('h3')?.textContent?.trim();
      if(title) cardMap.set(title, card);
    });

    const railItems = [];
    pdpCards.forEach((card, idx) => {
      const titleEl = card.querySelector('.pdp-detail-card__head h3');
      const priceEl = card.querySelector('.pdp-detail-card__price');
      const eyebrowEl = card.querySelector('.fact-card__eyebrow');
      const title = titleEl?.textContent?.trim() || `Ürün ${idx + 1}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, '-').replace(/^-+|-+$/g, '');
      card.id = card.id || `pdp-${slug || idx + 1}`;
      card.dataset.pdpTitle = title;
      card.dataset.pdpPrice = priceEl?.textContent?.trim() || '—';
      if(idx === 0) card.classList.add('is-current');

      const linkedCard = cardMap.get(title);
      const mediaImg = linkedCard?.querySelector('.product-media img');
      railItems.push({
        id: card.id,
        title,
        brand: eyebrowEl?.textContent?.trim() || 'Product',
        price: priceEl?.textContent?.trim() || '—',
        src: mediaImg?.getAttribute('src') || '',
        alt: mediaImg?.getAttribute('alt') || title
      });

      if(linkedCard && !linkedCard.querySelector('.mobile-card-detail-btn')){
        const row = linkedCard.querySelector('.price-row');
        const btn = document.createElement('a');
        btn.className = 'mobile-card-detail-btn';
        btn.href = `#${card.id}`;
        btn.textContent = 'Detayı Gör';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          card.scrollIntoView({behavior:'smooth', block:'start'});
        });
        if(row) row.parentNode.insertBefore(btn, row);
      }

      const columns = card.querySelector('.pdp-columns');
      if(columns && !card.querySelector('.mobile-pdp-accordions')){
        const wrap = document.createElement('div');
        wrap.className = 'mobile-pdp-accordions';
        Array.from(columns.children).forEach((col, colIdx) => {
          const heading = col.querySelector('h4')?.textContent?.trim() || `Detay ${colIdx + 1}`;
          const details = document.createElement('details');
          details.className = 'mobile-pdp-accordion';
          if(colIdx === 0) details.open = true;
          details.innerHTML = `
            <summary><span>${heading}</span><span class="mobile-pdp-accordion__icon">+</span></summary>
            <div class="mobile-pdp-accordion__body">${col.innerHTML}</div>`;
          wrap.appendChild(details);
        });
        columns.replaceWith(wrap);
      }

      const note = card.querySelector('.pdp-detail-note');
      if(note && !card.querySelector('.mobile-pdp-mini-meta')){
        const mini = document.createElement('div');
        mini.className = 'mobile-pdp-mini-meta';
        mini.innerHTML = `<span>Ürün Notu</span>${note.innerHTML}`;
        note.replaceWith(mini);
      }
    });

    const pdpSection = document.querySelector('.pdp-section .container');
    if(pdpSection && !document.querySelector('.mobile-pdp-gallery') && railItems.length){
      const gallery = document.createElement('section');
      gallery.className = 'mobile-pdp-gallery';
      gallery.innerHTML = `
        <div class="mobile-pdp-gallery__head">
          <span>Ürün detay görünümü</span>
          <strong>Mobil PDP ön izleme</strong>
        </div>
        <div class="mobile-pdp-gallery__track">
          ${railItems.map(item => `
            <button type="button" class="mobile-pdp-gallery__item" data-target="${item.id}">
              <div class="mobile-pdp-gallery__thumb">${item.src ? `<img src="${item.src}" alt="${item.alt}">` : `<div class="mobile-pdp-gallery__placeholder">✦</div>`}</div>
              <small>${item.brand}</small>
              <strong>${item.title}</strong>
              <span>${item.price}</span>
            </button>`).join('')}
        </div>`;
      const sectionHead = document.querySelector('.pdp-section .section-head');
      if(sectionHead) sectionHead.insertAdjacentElement('afterend', gallery);
      gallery.querySelectorAll('.mobile-pdp-gallery__item').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.dataset.target);
          target && target.scrollIntoView({behavior:'smooth', block:'start'});
        });
      });
    }

    if(!document.querySelector('.mobile-pdp-sticky-bar')){
      const sticky = document.createElement('div');
      sticky.className = 'mobile-pdp-sticky-bar';
      sticky.innerHTML = `
        <div class="mobile-pdp-sticky-bar__meta">
          <span class="mobile-pdp-sticky-bar__eyebrow">Ürün detayı</span>
          <strong class="mobile-pdp-sticky-bar__title">${railItems[0]?.title || 'Ürün'}</strong>
          <small class="mobile-pdp-sticky-bar__price">${railItems[0]?.price || '—'}</small>
        </div>
        <div class="mobile-pdp-sticky-bar__actions">
          <button type="button" class="mobile-pdp-sticky-bar__ghost">Detaylar</button>
          <a href="/checkout.html" class="btn btn-primary mobile-pdp-sticky-bar__cta">Sepete Git</a>
        </div>`;
      document.body.appendChild(sticky);
      sticky.querySelector('.mobile-pdp-sticky-bar__ghost').addEventListener('click', () => {
        const current = document.querySelector('.pdp-detail-card.is-current') || pdpCards[0];
        current && current.scrollIntoView({behavior:'smooth', block:'start'});
      });

      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
        if(!visible) return;
        pdpCards.forEach(card => card.classList.remove('is-current'));
        visible.target.classList.add('is-current');
        sticky.querySelector('.mobile-pdp-sticky-bar__title').textContent = visible.target.dataset.pdpTitle || 'Ürün';
        sticky.querySelector('.mobile-pdp-sticky-bar__price').textContent = visible.target.dataset.pdpPrice || '—';
      }, { threshold:[0.35, 0.55, 0.75] });
      pdpCards.forEach(card => observer.observe(card));
    }
  }

  function addCheckoutSticky(){
    if (path !== 'checkout.html' || document.querySelector('.mobile-sticky-checkout')) return;
    const sourceBtn = document.querySelector('.checkout-summary .btn.btn-primary, .checkout-summary a.btn.btn-primary');
    const bar = document.createElement('div');
    bar.className = 'mobile-sticky-checkout';
    bar.innerHTML = `
      <div class="mobile-sticky-checkout__meta">
        <span class="mobile-sticky-checkout__label">Ödenecek Toplam</span>
        <strong class="mobile-sticky-checkout__price">—</strong>
      </div>
      <button class="btn btn-primary" type="button">Ödemeye Geç</button>`;
    bar.querySelector('button').addEventListener('click', ()=>{
      if(sourceBtn) sourceBtn.click();
      else window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'});
    });
    document.body.appendChild(bar);
    const sync = ()=>{
      const liveTotal = document.querySelector('#cartTotal, .checkout-summary .sum-row.total strong, .checkout-summary strong');
      if(liveTotal) bar.querySelector('.mobile-sticky-checkout__price').textContent = liveTotal.textContent.trim();
    };
    sync();
    setInterval(sync, 900);
  }

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
  enhancePdpExperience();
})();
