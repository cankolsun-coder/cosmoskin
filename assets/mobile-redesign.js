(() => {
  'use strict';

  const money = (value) => new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);

  const paths = {
    toner: '/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp',
    cleansingOil: '/assets/img/products/anua/anua-heartleaf-pore-control-cleansing-oil-card.webp',
    bojSerum: '/assets/img/products/beauty-of-joseon/beauty-of-joseon-glow-serum-propolis-niacinamide-card.webp',
    bojCleanser: '/assets/img/products/beauty-of-joseon/beauty-of-joseon-green-plum-refreshing-cleanser-card.webp',
    bojSun: '/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp',
    cosrxSnail: '/assets/img/products/cosrx/cosrx-advanced-snail-96-mucin-essence-card.webp',
    skinAmpoule: '/assets/img/products/skin1004/skin1004-madagascar-centella-ampoule-card.webp',
    skinSun: '/assets/img/products/skin1004/skin1004-hyalu-cica-water-fit-sun-serum-card.webp',
    torridenSerum: '/assets/img/products/torriden/torriden-dive-in-hyaluronic-acid-serum-card.webp',
    torridenCream: '/assets/img/products/torriden/torriden-solid-in-ceramide-cream-card.webp',
    roundCleanser: '/assets/img/products/round-lab/round-lab-1025-dokdo-cleanser-card.webp',
    roundToner: '/assets/img/products/round-lab/round-lab-dokdo-toner-card.webp',
    heroToner: '/assets/img/hero/toner.webp',
    heroSerum: '/assets/img/hero/serum.webp',
    heroMini: '/assets/img/hero/mini-serum.webp',
    heroCream: '/assets/img/hero/cream.webp'
  };

  const PRODUCTS = [
    { id: 'anua-77', brand: 'Anua', name: 'Heartleaf 77% Soothing Toner', category: 'Tonik & Essence', skinConcern: ['Nem', 'Bariyer'], price: 849, rating: 4.8, reviewCount: 1284, image: paths.toner, badge: 'Çok Satan', size: '250ml', description: 'Yatıştırıcı & Arındırıcı Tonik' },
    { id: 'boj-glow', brand: 'Beauty of Joseon', name: 'Glow Serum: Propolis + Niacinamide', category: 'Serum & Ampul', skinConcern: ['Işıltı', 'Bariyer'], price: 879, rating: 4.9, reviewCount: 914, image: paths.bojSerum, badge: 'Yeni', size: '30ml', description: 'Aydınlatıcı & Canlandırıcı Serum' },
    { id: 'cosrx-snail', brand: 'COSRX', name: 'Advanced Snail 96 Mucin Power Essence', category: 'Serum & Ampul', skinConcern: ['Nem', 'Bariyer'], price: 1049, rating: 4.8, reviewCount: 711, image: paths.cosrxSnail, badge: 'Editör Seçimi', size: '100ml', description: 'Onarıcı & nem destekleyici essence' },
    { id: 'skin1004-ampoule', brand: 'SKIN1004', name: 'Madagascar Centella Ampoule', category: 'Serum & Ampul', skinConcern: ['Bariyer', 'Hassasiyet'], price: 899, rating: 4.9, reviewCount: 684, image: paths.skinAmpoule, badge: 'Çok Satan', size: '55ml', description: 'Yatıştırıcı centella ampul' },
    { id: 'torriden-serum', brand: 'Torriden', name: 'Dive-In Hyaluronic Acid Serum', category: 'Serum & Ampul', skinConcern: ['Nem'], price: 949, rating: 4.7, reviewCount: 362, image: paths.torridenSerum, badge: 'Nem Favorisi', size: '50ml', description: 'Hyaluronik asit serum' },
    { id: 'torriden-cream', brand: 'Torriden', name: 'Solid-In Ceramide Cream', category: 'Nemlendiriciler', skinConcern: ['Bariyer', 'Nem'], price: 899, rating: 4.8, reviewCount: 476, image: paths.torridenCream, badge: 'Bariyer', size: '70ml', description: 'Seramid destekli nemlendirici krem' },
    { id: 'boj-cleanser', brand: 'Beauty of Joseon', name: 'Green Plum Refreshing Cleanser', category: 'Temizleyiciler', skinConcern: ['Akne & Denge'], price: 729, rating: 4.7, reviewCount: 308, image: paths.bojCleanser, badge: 'Nazik', size: '100ml', description: 'Düşük pH temizleyici jel' },
    { id: 'skin-sun', brand: 'SKIN1004', name: 'Hyalu-Cica Water-Fit Sun Serum', category: 'Güneş Bakımı', skinConcern: ['Nem', 'Işıltı'], price: 949, rating: 4.8, reviewCount: 542, image: paths.skinSun, badge: 'SPF', size: '50ml', description: 'Hafif güneş serumu' }
  ];

  const brandLogos = [
    { name: 'Anua', path: '/assets/img/brands/anua.svg' },
    { name: 'Beauty of Joseon', path: '/assets/img/brands/beauty-of-joseon.svg' },
    { name: 'COSRX', path: '/assets/img/brands/cosrx.svg' },
    { name: 'Round Lab', path: '/assets/img/brands/round-lab.svg' },
    { name: 'SKIN1004', path: '/assets/img/brands/skin1004.svg' },
    { name: 'Torriden', path: '/assets/img/brands/torriden.svg' },
    { name: 'Thank You Farmer', path: '/assets/img/brands/thank-you-farmer.svg' }
  ];

  const icons = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    bag: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    gift: '<path d="M4 10h16v10H4zM4 10h16V7H4zM12 7v13"/><path d="M12 7s-4 0-4-2 4-2 4 2ZM12 7s4 0 4-2-4-2-4 2Z"/>',
    leaf: '<path d="M20 4S9 4 5.5 9.5C2 15 8 20 8 20s9-2 12-16Z"/><path d="M8 20c2.5-6 6-9.5 12-16"/>',
    shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h3l3 3v3h-6z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 21v-9"/>',
    heart: '<path d="M20.5 8.8c0 5.4-8.5 10.2-8.5 10.2S3.5 14.2 3.5 8.8A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 1.8Z"/>',
    home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.3-4 4.2-6 8-6s6.7 2 8 6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.6l6.2-.9L12 3Z"/>',
    sliders: '<path d="M4 7h9M17 7h3M7 12h13M4 12h1M4 17h5M13 17h7"/><circle cx="15" cy="7" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="11" cy="17" r="2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    drop: '<path d="M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11Z"/>',
    sparkle: '<path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8L5 3Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 21v-9"/>',
    'user-heart': '<circle cx="9" cy="8" r="4"/><path d="M2.5 21c1-4 3.4-6 6.5-6 1.2 0 2.3.3 3.2.8"/><path d="M19.7 12.7c1.7 1.7.4 4.7-3.7 7.2-4.1-2.5-5.4-5.5-3.7-7.2A2.5 2.5 0 0 1 16 13a2.5 2.5 0 0 1 3.7-.3Z"/>',
    cart: '<circle cx="9" cy="20" r="1.8"/><circle cx="17" cy="20" r="1.8"/><path d="M3 4h2l2.4 11.3a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 2-1.6L20.5 8H7"/>',
    tag: '<path d="M20 12 12 20 4 12V4h8l8 8Z"/><circle cx="8" cy="8" r="1.3"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4"/>',
    bottle: '<path d="M10 2h4v5l3 4v10H7V11l3-4V2Z"/><path d="M9 14h6"/>',
    mask: '<path d="M6 4h12v7c0 5-2.5 8-6 9-3.5-1-6-4-6-9V4Z"/><path d="M9 10h.01M15 10h.01M9 15c2 1 4 1 6 0"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>'
  };

  function svg(name, className = '') {
    const body = icons[name] || icons.leaf;
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function statusBar() {
    return `<div class="phone-status"><span>9:41</span><span class="status-icons">${svg('sliders')}<span class="status-pill"></span></span></div>`;
  }

  function infoBar() {
    return `<div class="mobile-info">${svg('gift')} <span>750 TL ve üzeri alışverişlerde ücretsiz kargo!</span><button type="button" aria-label="Duyuruyu kapat">${svg('x')}</button></div>`;
  }

  function header({ info = false, back = false, cartCount = 2, menu = true } = {}) {
    return `${statusBar()}${info ? infoBar() : ''}
    <header class="mobile-header ${info ? '' : 'no-info'}">
      <button class="icon-button ${back ? '' : 'js-open-drawer'}" type="button" aria-label="${back ? 'Geri dön' : 'Menüyü aç'}">${svg(back ? 'arrowLeft' : menu ? 'menu' : 'arrowLeft')}</button>
      <div class="wordmark" aria-label="COSMOSKIN">COSMOSKIN</div>
      <div class="icon-row">
        <button class="icon-button" type="button" aria-label="Ara">${svg('search')}</button>
        <button class="icon-button" type="button" aria-label="Sepet">${svg('bag')}<span class="badge">${cartCount}</span></button>
      </div>
    </header>`;
  }

  function bottomNav(active = 'home', count = 2) {
    const items = [
      ['home', 'Ana Sayfa', 'home'], ['categories', 'Kategoriler', 'grid'], ['favorites', 'Favoriler', 'heart'], ['cart', 'Sepetim', 'bag'], ['account', 'Hesabım', 'user']
    ];
    return `<nav class="bottom-nav" aria-label="Alt navigasyon">${items.map(([key, label, icon]) => `<button type="button" class="nav-item ${active === key ? 'active' : ''}" data-nav="${key}" aria-label="${label}">${svg(icon)}${key === 'cart' ? `<span class="badge">${count}</span>` : ''}<span>${label}</span></button>`).join('')}</nav>`;
  }

  function trustStrip(compact = false) {
    const items = [
      ['leaf', '%100 Orijinal', 'Ürün'], ['shield', 'Güvenli', 'Alışveriş'], ['truck', 'Hızlı', 'Teslimat'], ['box', 'Kolay', 'İade']
    ];
    return `<div class="trust-strip">${items.map(([icon, a, b]) => `<div class="trust-item">${svg(icon)}<strong>${a}<br>${b}</strong>${compact ? '' : '<small></small>'}</div>`).join('')}</div>`;
  }

  function productCard(product, options = {}) {
    const { compact = false } = options;
    return `<article class="product-card" data-product-id="${product.id}">
      ${product.badge ? `<span class="card-badge">${product.badge}</span>` : ''}
      <button class="fav js-favorite" type="button" aria-label="Favorilere ekle">${svg('heart')}</button>
      <div class="image"><img src="${product.image}" alt="${product.brand} ${product.name}" loading="lazy"></div>
      <div class="content">
        <p class="brand">${product.brand}</p>
        <h4>${product.name}${compact ? '' : ` ${product.size}`}</h4>
        <p class="price">${money(product.price)}</p>
        <div class="rating">★★★★★ <small>(${product.rating})</small></div>
      </div>
    </article>`;
  }

  function categoryCard(title, sub, image) {
    return `<article class="category-card"><div class="image"><img src="${image}" alt="${title}"></div><strong>${title}</strong><small>${sub}</small></article>`;
  }

  function brandStrip() {
    return `<div class="brand-strip">${brandLogos.map(logo => `<img src="${logo.path}" alt="${logo.name}">`).join('')}</div>`;
  }

  function drawerContent(preview = false) {
    const nav = [
      ['grid', 'Kategoriler'], ['tag', 'Markalar'], ['star', 'Çok Satanlar'], ['bottle', 'Rutinler'], ['sparkle', 'COSMOSKIN Edit'], ['user-heart', 'Destek']
    ];
    const cats = [['bottle','Temizleyiciler'], ['drop','Tonik & Essence'], ['bottle','Serum & Ampul'], ['box','Nemlendiriciler'], ['sun','Güneş Koruyucular'], ['mask','Maskeler']];
    const concerns = ['Nem', 'Bariyer', 'Işıltı', 'Akne & Denge', 'Hassasiyet', 'Gözenek & Sebum'];
    const account = [['user','Hesabım'], ['box','Siparişlerim'], ['heart','Favorilerim'], ['bag','Sepetim'], ['user-heart','Yardım & Destek'], ['truck','İade ve Teslimat']];
    return `<div class="drawer-preview" role="dialog" aria-label="COSMOSKIN mobil menü">
      <button class="close js-close-drawer" type="button" aria-label="Menüyü kapat">${svg('x')}</button>
      <div class="drawer-brand"><div class="wordmark">COSMOSKIN</div><p>${svg('leaf')} Merhaba, güzelliğine iyi bak.</p></div>
      <div class="menu-list">${nav.map(([icon, label]) => `<button class="menu-link" type="button">${svg(icon)}<span>${label}</span>${svg('chevron')}</button>`).join('')}</div>
      <section class="drawer-section"><div class="drawer-section-head"><h3>Hızlı Kategoriler</h3><a href="#listing">Tümünü Gör</a></div><div class="drawer-grid">${cats.map(([icon, label]) => `<button class="drawer-card" type="button">${svg(icon)}<span>${label}</span></button>`).join('')}</div></section>
      <section class="drawer-section"><div class="drawer-section-head"><h3>Cilt Hedeflerine Göre Keşif</h3><a href="#routine">Tümünü Gör</a></div><div class="concern-grid">${concerns.map(label => `<button type="button">${label}</button>`).join('')}</div></section>
      <section class="drawer-section"><div class="drawer-section-head"><h3>Sevdiğin Markalar</h3><a href="#">Tümünü Gör</a></div><div class="brand-pills">${brandLogos.map(logo => `<span class="brand-pill"><img src="${logo.path}" alt="${logo.name}"></span>`).join('')}</div></section>
      <div class="account-links">${account.map(([icon, label]) => `<button class="menu-link" type="button">${svg(icon)}<span>${label}</span>${svg('chevron')}</button>`).join('')}</div>
    </div>`;
  }

  function renderDrawerOverlay() {
    return `<div class="drawer-overlay js-drawer" aria-hidden="true">${drawerContent()}</div>`;
  }

  function renderHome() {
    const best = [PRODUCTS[0], PRODUCTS[1], PRODUCTS[2], PRODUCTS[5]];
    return `<div class="mobile-app">
      ${header({ info: true, cartCount: 2 })}
      <div class="mobile-scroll">
        <section class="hero-mobile">
          <div class="hero-copy"><p class="micro">Kore’den. Bilimin ışığında.</p><h1>Cildin.<br>Işıltın.<br>Senin hikayen.</h1><p>Kore’nin yüksek performanslı formüllerini seçilmiş markalarla bir araya getiriyor; cildine hak ettiği özeni sade ve güvenli bir alışveriş deneyimiyle sunuyoruz.</p><div class="hero-actions"><a class="btn primary" href="#listing">ALIŞVERİŞE BAŞLA</a><a class="btn ghost" href="#routine">RUTİNİNİ KEŞFET</a></div></div>
          <div class="hero-products" aria-hidden="true"><span class="stone"></span><img class="toner" src="${paths.heroToner}" alt=""><img class="serum" src="${paths.heroSerum}" alt=""><img class="mini" src="${paths.heroMini}" alt=""><img class="cream" src="${paths.heroCream}" alt=""></div>
        </section>
        ${trustStrip()}
        ${brandStrip()}
        <section class="section-block"><div class="section-head"><h2 class="section-title">İhtiyacına göre daha hızlı seçim yap.</h2><button class="view-all">Tümünü Gör ${svg('chevron')}</button></div><div class="category-row">
          ${categoryCard('Temizleyiciler','Cildi arındır', paths.bojCleanser)}
          ${categoryCard('Tonik & Essence','Dengele & hazırla', paths.toner)}
          ${categoryCard('Serum & Ampul','Onar & besle', paths.bojSerum)}
          ${categoryCard('Nemlendiriciler','Nemlendir & koru', paths.torridenCream)}
        </div></section>
        <section class="section-block"><div class="section-head"><h2 class="section-title">ÇOK SATANLAR</h2><button class="view-all">Tümünü Gör ${svg('chevron')}</button></div><div class="product-grid">${best.map(p => productCard(p, { compact: true })).join('')}</div></section>
      </div>${bottomNav('home', 2)}${renderDrawerOverlay()}</div>`;
  }

  function renderListing() {
    const listing = [PRODUCTS[3], PRODUCTS[1], PRODUCTS[2], PRODUCTS[4], PRODUCTS[7], PRODUCTS[0]];
    return `<div class="mobile-app">
      ${header({ cartCount: 2 })}
      <div class="mobile-scroll">
        <div class="search-zone"><label class="search-bar">${svg('search')}<input type="search" placeholder="Ürün, marka veya içerik ara..." aria-label="Ürün ara"><button class="icon-button" type="button" aria-label="Filtreleri aç">${svg('sliders')}</button></label></div>
        <div class="chip-row" role="listbox" aria-label="Filtreler">${['Tümü','Temizleyici','Serum','Güneş','Nem','Bariyer','Işıltı'].map((x,i)=>`<button type="button" class="chip js-chip ${i===0?'selected':''}">${x}</button>`).join('')}</div>
        <div class="page-heading"><div><h1>Serum & Ampul</h1><p>234 ürün</p></div><div class="control-group"><button class="control" type="button">Sırala ${svg('chevronDown')}</button><button class="control" type="button">${svg('sliders')} Filtrele</button></div></div>
        <section class="product-grid listing-grid">${listing.map(p => productCard(p)).join('')}</section>
      </div>${bottomNav('categories', 2)}${renderDrawerOverlay()}</div>`;
  }

  function accordion(title, icon, body, open = false) {
    return `<details class="accordion" ${open ? 'open' : ''}><summary>${svg(icon)}<span>${title}</span>${svg('chevronDown', 'chev')}</summary><p>${body}</p></details>`;
  }

  function recoCard(p) {
    return `<article class="reco-card"><button class="fav js-favorite" type="button" aria-label="Favorilere ekle">${svg('heart')}</button><img src="${p.image}" alt="${p.brand} ${p.name}"><h4>${p.brand}<br>${p.name}</h4><strong>${money(p.price)}</strong></article>`;
  }

  function renderPDP() {
    const p = PRODUCTS[0];
    return `<div class="mobile-app">
      ${header({ back: true, cartCount: 2 })}
      <div class="mobile-scroll">
        <section class="pdp-visual"><img src="${p.image}" alt="${p.brand} ${p.name}"><div class="float-actions"><button class="icon-button js-favorite" type="button" aria-label="Favorilere ekle">${svg('heart')}</button><button class="icon-button" type="button" aria-label="Paylaş">${svg('share')}</button></div><span class="slide-count">1/5</span></section>
        <section class="pdp-info"><p class="brand-label">ANUA</p><h1>Heartleaf 77% Soothing Toner</h1><p class="desc">Yatıştırıcı & Arındırıcı Tonik</p><div class="rating pdp-rating">★★★★★ <small>(4.8) · 1.284 değerlendirme</small></div><div class="price-row"><strong>${money(p.price)}</strong><span>${p.size}</span></div><div class="purchase-row"><div class="stepper js-stepper" data-price="${p.price}"><button type="button" data-step="minus" aria-label="Azalt">−</button><b data-qty>1</b><button type="button" data-step="plus" aria-label="Artır">+</button></div><button class="btn primary block" type="button">SEPETE EKLE</button></div><p class="shipping-note">${svg('truck')} 750 TL ve üzeri alışverişlerde ücretsiz kargo!</p></section>
        <section class="accordion-list">
          ${accordion('Öne Çıkan Faydalar','star','Cildi yatıştırır, kızarıklık görünümünü azaltmaya ve gözenekleri arındırmaya yardımcı olur.', true)}
          ${accordion('Nasıl Kullanılır?','drop','Temiz cilde pamuk yardımıyla uygulayın ve nazikçe yedirin. Sabah ve akşam kullanıma uygundur.')}
          ${accordion('İçerik','shield','Heartleaf Extract %77, Butylene Glycol, Betaine, Panthenol, Allantoin.')}
          ${accordion('Kimler İçin Uygun?','user','Tüm cilt tipleri, özellikle hassas ve karma ciltler için uygundur.')}
        </section>
        <section class="section-block"><div class="section-head"><h2 class="section-title serif">Birlikte iyi gider</h2></div><div class="reco-row">${[PRODUCTS[1], PRODUCTS[6], PRODUCTS[5], PRODUCTS[3]].map(recoCard).join('')}</div></section>
      </div>${bottomNav('categories', 2)}</div>`;
  }

  function renderRoutine() {
    const routineProducts = [PRODUCTS[6], PRODUCTS[0], PRODUCTS[1], PRODUCTS[5]];
    return `<div class="mobile-app">
      ${header({ cartCount: 2 })}
      <div class="mobile-scroll">
        <section class="routine-top"><p class="routine-label"><span>AKILLI RUTİN SEÇİMİ</span><span>1 / 4</span></p><h1>Cildin için en doğru rutini birlikte oluşturalım.</h1><p>Hedeflerini seç, cilt tipini ekle. Sana özel gündüz ve gece rutinin hazır olsun.</p></section>
        <section class="routine-section"><h2>1. Cilt Hedefini Seç</h2><p>En fazla 3 seçim yapabilirsin.</p><div class="routine-chips">${['Nem','Bariyer','Işıltı','Akne Karşıtı','Gözenek','Yaşlanma Karşıtı'].map((x,i)=>`<button type="button" class="routine-chip js-chip ${[0,1,2].includes(i)?'selected':''}">${i===0?svg('drop'):i===1?svg('shield'):i===2?svg('sparkle'):''}<span>${x}</span></button>`).join('')}</div></section>
        <section class="routine-section"><h2>2. Cilt Tipini Seç <span style="color:#9a9288;font-weight:650;font-size:12px;">(İsteğe Bağlı)</span></h2><div class="routine-chips">${['Kuru','Karma','Yağlı','Hassas'].map((x,i)=>`<button type="button" class="routine-chip js-chip ${i===1?'selected':''}">${x}</button>`).join('')}</div></section>
        <section class="routine-section"><h2>3. Rutini Seç</h2><div class="segmented">${['Gündüz','Gece'].map((x,i)=>`<button type="button" class="routine-chip js-segment ${i===0?'selected':''}">${svg(i===0?'sun':'moon')} ${x}</button>`).join('')}</div></section>
        <section class="routine-card"><div class="routine-card-head"><div><h3>ÖNERİLEN <span data-routine-label>GÜNDÜZ</span> RUTİNİ</h3><p>Hedeflerinle uyumlu</p></div><span class="match-badge">77%</span></div><div class="routine-products">${routineProducts.map((p,i)=>`<article class="routine-step"><img src="${p.image}" alt="${p.brand} ${p.name}"><b>${i+1}<br>${['TEMİZLEYİCİ','TONİK','SERUM','NEMLENDİRİCİ'][i]}</b><small>${['Cildi arındır','Dengele','Onar & nemlendir','Koru & besle'][i]}</small></article>`).join('')}</div><div class="set-price"><span>Set Avantajı<br><small>Tek tek alım fiyatına göre</small></span><div><del>${money(3506)}</del><span class="discount">%18 Avantaj</span><strong>${money(2877)}</strong></div></div><div class="cta-stack"><button class="btn primary block" type="button">Tüm Rutini Sepete Ekle</button><div class="split"><button class="btn ghost" type="button">${svg('heart')} Rutini Kaydet</button><button class="btn ghost" type="button">${svg('search')} Rutini Gör</button></div></div></section>
      </div>${bottomNav('favorites', 2)}${renderDrawerOverlay()}</div>`;
  }

  function cartItem(p, qty = 1) {
    return `<article class="cart-item" data-price="${p.price}"><div class="thumb"><img src="${p.image}" alt="${p.brand} ${p.name}"></div><div><h3>${p.brand}<br>${p.name}</h3><p>${p.description}<br>${p.size}</p><strong>${money(p.price)}</strong><div class="stepper js-cart-stepper"><button type="button" data-step="minus" aria-label="Azalt">−</button><b data-qty>${qty}</b><button type="button" data-step="plus" aria-label="Artır">+</button></div></div><button class="remove js-remove" type="button" aria-label="Ürünü sil">${svg('trash')}</button></article>`;
  }

  function renderCart() {
    const items = [PRODUCTS[1], PRODUCTS[0], PRODUCTS[5]];
    return `<div class="mobile-app">
      ${header({ info: true, cartCount: 3 })}
      <div class="mobile-scroll has-footer-note">
        <section class="cart-title"><h1>Sepetim <span>(3 ürün)</span></h1></section>
        <section class="cart-list js-cart-list">${items.map(p => cartItem(p, 1)).join('')}</section>
        <div class="coupon"><input type="text" placeholder="İndirim kodunuzu girin" aria-label="İndirim kodu"><button type="button">Uygula</button></div>
        <section class="summary"><h2>Sipariş Özeti</h2><div class="summary-row"><span>Ara Toplam</span><strong data-subtotal>${money(2627)}</strong></div><div class="summary-row discount-row"><span>İndirim</span><span data-discount>-${money(249.7)}</span></div><div class="summary-row"><span>Teslimat</span><strong>Ücretsiz</strong></div><div class="summary-total"><span>Toplam<br><small>KDV dahildir.</small></span><strong data-total>${money(2377.3)}</strong></div><div class="campaign-note">${svg('truck')} 750 TL ve üzeri alışverişlerde ücretsiz kargo avantajından yararlandınız.</div><button class="btn primary block" type="button">Ödemeye Geç ${svg('chevron')}</button></section>
      </div><div class="cart-trust"><div class="trust-item">${svg('lock')}<strong>256-bit SSL<br>Güvenli Ödeme</strong></div><div class="trust-item">${svg('shield')}<strong>%100 Orijinal<br>Ürün Garantisi</strong></div><div class="trust-item">${svg('truck')}<strong>1-3 İş Günü<br>Hızlı Teslimat</strong></div></div>${bottomNav('cart', 3)}${renderDrawerOverlay()}</div>`;
  }

  function renderMenu() {
    return `<div class="mobile-app"><div class="menu-phone-bg">${statusBar()}<div class="menu-backdrop-preview"></div>${drawerContent(true)}</div>${bottomNav('home', 2)}</div>`;
  }

  const renderers = { home: renderHome, listing: renderListing, pdp: renderPDP, routine: renderRoutine, cart: renderCart, menu: renderMenu };

  function hydrateStandaloneIcons(scope = document) {
    scope.querySelectorAll('[data-icon]').forEach(node => {
      const name = node.getAttribute('data-icon');
      node.innerHTML = svg(name);
    });
  }

  function bindInteractions(scope) {
    scope.querySelectorAll('.mobile-info button').forEach(close => {
      close.addEventListener('click', () => {
        const bar = close.closest('.mobile-info');
        if (bar) bar.style.display = 'none';
      });
    });

    scope.querySelectorAll('.js-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('selected'));
    });

    scope.querySelectorAll('.js-segment').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.parentElement;
        group.querySelectorAll('.js-segment').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
        const phone = btn.closest('.mobile-app');
        const label = phone?.querySelector('[data-routine-label]');
        if (label) label.textContent = btn.textContent.toLowerCase().includes('gece') ? 'GECE' : 'GÜNDÜZ';
      });
    });

    scope.querySelectorAll('.js-favorite, .fav').forEach(fav => {
      fav.addEventListener('click', (event) => {
        event.preventDefault();
        fav.classList.toggle('active');
        fav.setAttribute('aria-pressed', fav.classList.contains('active') ? 'true' : 'false');
      });
    });

    scope.querySelectorAll('.js-stepper, .js-cart-stepper').forEach(stepper => {
      stepper.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-step]');
        if (!btn) return;
        const qtyNode = stepper.querySelector('[data-qty]');
        const current = Number(qtyNode.textContent) || 1;
        const next = btn.dataset.step === 'plus' ? current + 1 : Math.max(1, current - 1);
        qtyNode.textContent = next;
        updateCartTotals(stepper.closest('.mobile-app'));
      });
    });

    scope.querySelectorAll('.js-remove').forEach(remove => {
      remove.addEventListener('click', () => {
        const item = remove.closest('.cart-item');
        item?.remove();
        updateCartTotals(remove.closest('.mobile-app'));
      });
    });

    scope.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const nav = item.closest('.bottom-nav');
        nav.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
      });
    });

    scope.querySelectorAll('.js-open-drawer').forEach(open => {
      open.addEventListener('click', () => {
        const drawer = open.closest('.mobile-app')?.querySelector('.js-drawer');
        if (drawer) {
          drawer.classList.add('open');
          drawer.setAttribute('aria-hidden', 'false');
        }
      });
    });

    scope.querySelectorAll('.js-close-drawer').forEach(close => {
      close.addEventListener('click', () => closeDrawer(close.closest('.js-drawer')));
    });

    scope.querySelectorAll('.js-drawer').forEach(drawer => {
      drawer.addEventListener('click', (event) => {
        if (event.target === drawer) closeDrawer(drawer);
      });
    });
  }

  function closeDrawer(drawer) {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function updateCartTotals(app) {
    if (!app) return;
    const items = [...app.querySelectorAll('.cart-item')];
    const subtotal = items.reduce((sum, item) => {
      const price = Number(item.dataset.price) || 0;
      const qty = Number(item.querySelector('[data-qty]')?.textContent) || 1;
      return sum + price * qty;
    }, 0);
    const discount = Math.round(subtotal * 0.095 * 100) / 100;
    const total = Math.max(0, subtotal - discount);
    const title = app.querySelector('.cart-title h1 span');
    const count = items.reduce((sum, item) => sum + (Number(item.querySelector('[data-qty]')?.textContent) || 1), 0);
    app.querySelector('[data-subtotal]') && (app.querySelector('[data-subtotal]').textContent = money(subtotal));
    app.querySelector('[data-discount]') && (app.querySelector('[data-discount]').textContent = `-${money(discount)}`);
    app.querySelector('[data-total]') && (app.querySelector('[data-total]').textContent = money(total));
    if (title) title.textContent = `(${count} ürün)`;
    app.querySelectorAll('.mobile-header .badge, .bottom-nav .badge').forEach(badge => { badge.textContent = count || 0; });
  }

  function boot() {
    document.querySelectorAll('.phone-screen[data-render]').forEach(target => {
      const name = target.dataset.render;
      if (!renderers[name]) return;
      target.innerHTML = renderers[name]();
      bindInteractions(target);
      updateCartTotals(target.querySelector('.mobile-app'));
    });
    hydrateStandaloneIcons(document);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.querySelectorAll('.js-drawer.open').forEach(closeDrawer);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
