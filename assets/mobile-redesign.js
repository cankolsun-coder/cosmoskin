(function(){
  'use strict';

  const IMG = {
    anuaToner:'/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp',
    anuaOil:'/assets/img/products/anua/anua-heartleaf-pore-control-cleansing-oil-card.webp',
    bojGlow:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-glow-serum-propolis-niacinamide-card.webp',
    bojSun:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp',
    bojCleanser:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-green-plum-refreshing-cleanser-card.webp',
    skinCream:'/assets/img/products/skin1004/skin1004-madagascar-centella-ampoule-card.webp',
    skinSun:'/assets/img/products/skin1004/skin1004-hyalu-cica-water-fit-sun-serum-card.webp',
    cosrxSnail:'/assets/img/products/cosrx/cosrx-advanced-snail-96-mucin-essence-card.webp',
    cosrxCleanser:'/assets/img/products/cosrx/cosrx-low-ph-good-morning-gel-cleanser-card.webp',
    torridenSerum:'/assets/img/products/torriden/torriden-dive-in-hyaluronic-acid-serum-card.webp',
    torridenCream:'/assets/img/products/torriden/torriden-solid-in-ceramide-cream-card.webp',
    roundCleanser:'/assets/img/products/round-lab/round-lab-1025-dokdo-cleanser-card.webp',
    roundToner:'/assets/img/products/round-lab/round-lab-dokdo-toner-card.webp',
    heroBg:'/assets/img/hero/hero-bg-cosmoskin-stone.png'
  };

  const PRODUCTS = [
    {slug:'anua-heartleaf-77-soothing-toner',brand:'Anua',name:'Heartleaf 77% Soothing Toner 250ml',short:'Yatıştırıcı & Arındırıcı Tonik',price:'849,00 TL',num:849,volume:'250ml',rating:'★★★★★ (4.8)',img:IMG.anuaToner,url:'/products/anua-heartleaf-77-soothing-toner.html',label:'Çok Satan'},
    {slug:'beauty-of-joseon-glow-serum-propolis-niacinamide',brand:'Beauty of Joseon',name:'Glow Serum Propolis + Niacinamide 30ml',short:'Aydınlatıcı & Canlandırıcı Serum',price:'879,00 TL',num:879,volume:'30ml',rating:'★★★★★ (4.9)',img:IMG.bojGlow,url:'/products/beauty-of-joseon-glow-serum-propolis-niacinamide.html',label:'Yeni'},
    {slug:'cosrx-advanced-snail-96-mucin-essence',brand:'COSRX',name:'Advanced Snail 96 Mucin Power Essence 100ml',short:'Bariyer & Nem Essence',price:'979,00 TL',num:979,volume:'100ml',rating:'★★★★★ (4.8)',img:IMG.cosrxSnail,url:'/products/cosrx-advanced-snail-96-mucin-essence.html',label:'Editör Seçimi'},
    {slug:'skin1004-madagascar-centella-ampoule',brand:'SKIN1004',name:'Madagascar Centella Ampoule 55ml',short:'Yatıştırıcı Ampul',price:'869,00 TL',num:869,volume:'55ml',rating:'★★★★★ (4.9)',img:IMG.skinCream,url:'/products/skin1004-madagascar-centella-ampoule.html',label:'Çok Satan'},
    {slug:'torriden-dive-in-hyaluronic-acid-serum',brand:'Torriden',name:'DIVE-IN Hyaluronic Acid Serum 50ml',short:'Yoğun Nem Serumu',price:'899,00 TL',num:899,volume:'50ml',rating:'★★★★★ (4.8)',img:IMG.torridenSerum,url:'/products/torriden-dive-in-hyaluronic-acid-serum.html',label:'Nem'},
    {slug:'beauty-of-joseon-relief-sun-spf50',brand:'Beauty of Joseon',name:'Relief Sun Rice + Probiotics SPF50+ 50ml',short:'Günlük SPF',price:'899,00 TL',num:899,volume:'50ml',rating:'★★★★★ (4.9)',img:IMG.bojSun,url:'/products/beauty-of-joseon-relief-sun-spf50.html',label:'SPF'}
  ];


  function formatTry(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return String(value || '');
    return n.toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' TL';
  }

  function normalizeImage(src){
    if(!src) return IMG.anuaToner;
    if(Array.isArray(src)) src = src[0];
    try { return new URL(src, location.origin).pathname; } catch(e) { return String(src); }
  }

  function productFromPage(){
    const slug = location.pathname.split('/').pop().replace(/\.html$/,'');
    const known = PRODUCTS.find(x=>x.slug === slug);
    let product = known ? {...known} : null;
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for(const script of scripts){
      try{
        const data = JSON.parse(script.textContent || '{}');
        const nodes = data['@graph'] || [data];
        const node = nodes.find(item => item && item['@type'] === 'Product');
        if(node){
          const price = node.offers && (node.offers.price || node.offers.lowPrice);
          product = {
            slug: node.sku || slug,
            brand: (node.brand && (node.brand.name || node.brand)) || (product && product.brand) || 'COSMOSKIN',
            name: node.name || (product && product.name) || document.title.replace(/\s\|\s.*$/,''),
            short: node.description ? String(node.description).replace(/\s+/g,' ').slice(0,72) : ((product && product.short) || 'Seçili Kore cilt bakım ürünü'),
            price: price ? formatTry(price) : ((product && product.price) || '699,00 TL'),
            num: price ? Number(price) : ((product && product.num) || 699),
            volume: (product && product.volume) || '',
            rating: (product && product.rating) || '★★★★★ (4.8)',
            img: normalizeImage(node.image || (product && product.img)),
            url: location.pathname,
            label: (product && product.label) || ''
          };
          break;
        }
      }catch(e){}
    }
    return product || {slug,brand:'COSMOSKIN',name:document.title.replace(/\s\|\s.*$/,''),short:'Seçili Kore cilt bakım ürünü',price:'699,00 TL',num:699,volume:'',rating:'★★★★★ (4.8)',img:IMG.anuaToner,url:location.pathname,label:''};
  }

  function listingMeta(){
    const p = location.pathname;
    const map = {
      '/collections/cleanse.html':['Temizleyiciler','Cildi arındıran seçili ürünler'],
      '/collections/hydrate.html':['Tonik & Essence','Nem katmanını destekleyen ürünler'],
      '/collections/treat.html':['Serum & Ampul','Hedef bakım odaklı serumlar'],
      '/collections/care.html':['Nemlendiriciler','Bariyer ve konfor odaklı ürünler'],
      '/collections/protect.html':['Güneş Koruyucular','Günlük SPF seçkisi'],
      '/collections/masks.html':['Maskeler','Destek bakım maskeleri'],
      '/collections/blemish.html':['Akne & Denge','Gözenek ve sebum dengesine destek']
    };
    if(map[p]) return {title:map[p][0], subtitle:map[p][1], count:'234 ürün'};
    if(p.includes('/brands/')){
      const name = p.split('/').pop().replace('.html','').split('-').map(w=>w.toUpperCase()==='COSRX'?'COSRX':w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      return {title:name, subtitle:'Seçili marka ürünleri', count:'24 ürün'};
    }
    return {title:'Serum & Ampul', subtitle:'Seçili Kore Cilt Bakımı', count:'234 ürün'};
  }

  function svg(name){
    const set = {
      menu:'<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
      close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
      back:'<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>',
      search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
      bag:'<svg viewBox="0 0 24 24"><path d="M7 8h10l1 12H6L7 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
      home:'<svg viewBox="0 0 24 24"><path d="m4 11 8-7 8 7v9H6v-6h12"/></svg>',
      grid:'<svg viewBox="0 0 24 24"><path d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z"/></svg>',
      heart:'<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-8.5-9.1A4.6 4.6 0 0 1 11 6l1 1 1-1a4.6 4.6 0 0 1 7.5 4.9C19 15.5 12 20 12 20Z"/></svg>',
      user:'<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
      leaf:'<svg viewBox="0 0 24 24"><path d="M5 19c9 0 14-6 14-14C12 5 6 9 5 19Z"/><path d="M5 19c4-5 8-7 14-14"/></svg>',
      shield:'<svg viewBox="0 0 24 24"><path d="M12 21s7-3.5 7-10V5.7L12 3 5 5.7V11c0 6.5 7 10 7 10Z"/><path d="m8.8 12.2 2.1 2.1 4.6-5"/></svg>',
      truck:'<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3V7Zm11 3h3.4l3.1 3.2V16H14v-6Z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10.8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
      cube:'<svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
      drop:'<svg viewBox="0 0 24 24"><path d="M12 3.4s6 6.45 6 10.8a6 6 0 1 1-12 0C6 9.85 12 3.4 12 3.4Z"/></svg>',
      sparkle:'<svg viewBox="0 0 24 24"><path d="M12 3v5M12 16v5M4 12h5M15 12h5M7.8 7.8l2.2 2.2M14 14l2.2 2.2M16.2 7.8 14 10M10 14l-2.2 2.2"/></svg>',
      bottle:'<svg viewBox="0 0 24 24"><path d="M9 3h6v4l2 3v10H7V10l2-3V3Z"/><path d="M9 7h6M8 13h8"/></svg>',
      tag:'<svg viewBox="0 0 24 24"><path d="M4 12V5h7l9 9-7 7-9-9Z"/><path d="M8 8h.01"/></svg>',
      filter:'<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 5v4M16 15v4"/></svg>',
      star:'<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
      chevron:'<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>',
      minus:'<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
      plus:'<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
      trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>',
      lock:'<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><path d="M6 10h12v10H6V10Z"/><path d="M12 14v2"/></svg>',
      sun:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
      moon:'<svg viewBox="0 0 24 24"><path d="M20 15.2A7.8 7.8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>',
      eye:'<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg>',
      share:'<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/></svg>'
    };
    return set[name] || '';
  }

  function nav(active){
    const items = [
      ['home','Ana Sayfa','/index.html','home'],
      ['grid','Kategoriler','/allproducts.html','list'],
      ['heart','Favoriler','/account/profile.html#favorites','fav'],
      ['bag','Sepetim','/checkout.html','cart'],
      ['user','Hesabım','/account/profile.html','account']
    ];
    return '<nav class="cm-bottom-nav" aria-label="Mobil alt navigasyon">'+items.map(i=>`<a class="${active===i[3]?'is-active':''}" href="${i[2]}">${svg(i[0])}<span>${i[1]}</span>${i[3]==='cart'?'<span class="cm-badge" data-cm-cart-badge>0</span>':''}</a>`).join('')+'</nav>';
  }

  function header(options){
    options = options || {};
    const promo = options.promo === false ? '' : `<div class="cm-promo">${svg('bag')}<span>750 TL ve üzeri alışverişlerde ücretsiz kargo!</span></div>`;
    const left = options.back ? `<a class="cm-icon-btn" href="${options.backHref || 'javascript:history.back()'}" aria-label="Geri dön">${svg('back')}</a>` : `<button class="cm-icon-btn" type="button" data-cm-menu aria-label="Menüyü aç">${svg('menu')}</button>`;
    return `${promo}<header class="cm-header ${options.promo === false ? 'cm-header--bare':''}">
      <div>${left}</div>
      <a href="/index.html" class="cm-wordmark" aria-label="COSMOSKIN anasayfa">COSMOSKIN</a>
      <div class="cm-header__right"><a class="cm-icon-btn" href="/search.html" aria-label="Ara">${svg('search')}</a><a class="cm-icon-btn" href="/checkout.html" aria-label="Sepetim">${svg('bag')}<span class="cm-badge" data-cm-cart-badge>0</span></a></div>
    </header>`;
  }

  function productCard(p){
    return `<a class="cm-product-card" href="${p.url}">
      ${p.label?`<span class="cm-chip-label">${p.label}</span>`:''}<span class="cm-fav" aria-hidden="true">${svg('heart')}</span>
      <span class="cm-product-card__media"><img src="${p.img}" alt="${escapeHtml(p.brand+' '+p.name)}" loading="lazy"></span>
      <span class="cm-product-card__body"><small>${p.brand}</small><h3>${p.name}</h3><b>${p.price}</b><span class="cm-rating">${p.rating}</span></span>
    </a>`;
  }

  function miniProduct(p){
    return `<a class="cm-mini-product" href="${p.url}"><img src="${p.img}" alt="${escapeHtml(p.brand+' '+p.name)}" loading="lazy"><small>${p.brand}</small><strong>${p.name.replace(/\s\d+ml|\s\d+ ml|\s\d+ml$/i,'')}</strong><b>${p.price}</b></a>`;
  }

  function categoryCard(img,title,desc,href){
    return `<a class="cm-category-card" href="${href}"><span class="cm-category-card__img"><img src="${img}" alt="${escapeHtml(title)}" loading="lazy"></span><strong>${title}</strong><span>${desc}</span></a>`;
  }

  function brandStrip(){
    const brands = ['anua','beauty-of-joseon','cosrx','round-lab','skin1004','torriden','thank-you-farmer'];
    return `<div class="cm-brand-strip" aria-label="Sevdiğin markalar">${brands.map(b=>`<img src="/assets/img/brands/${b}.svg" alt="${b.replace(/-/g,' ')}" loading="lazy">`).join('')}</div>`;
  }

  function trustStrip(){
    return `<section class="cm-trust-strip" aria-label="Güven unsurları">
      <div class="cm-trust-item">${svg('leaf')}<strong>%100 Orijinal<br>Ürün</strong></div>
      <div class="cm-trust-item">${svg('shield')}<strong>Güvenli<br>Alışveriş</strong></div>
      <div class="cm-trust-item">${svg('truck')}<strong>Hızlı<br>Teslimat</strong></div>
      <div class="cm-trust-item">${svg('cube')}<strong>Kolay<br>İade</strong></div>
    </section>`;
  }

  function homePage(){
    return `<div class="cm-mobile-page cm-mobile-home">
      ${header({promo:true})}
      <section class="cm-hero" aria-labelledby="cmHomeHeroTitle">
        <div class="cm-hero__copy">
          <h1 id="cmHomeHeroTitle">Cildin.<br>Işıltın.<br>Senin hikayen.</h1>
          <p>Seçili Kore cilt bakım ürünleri ile cildine iyi bak. Güvenli alışveriş, orijinal ürün, hızlı teslimat.</p>
          <div class="cm-hero__actions"><a class="cm-btn cm-btn--primary" href="/allproducts.html">ALIŞVERİŞE BAŞLA</a><a class="cm-btn" href="/collections/routine.html">RUTİNİNİ KEŞFET</a></div>
        </div>
        <div class="cm-hero__products" aria-hidden="true"><img class="p-serum" src="${IMG.bojGlow}" alt=""><img class="p-toner" src="${IMG.anuaToner}" alt=""><img class="p-cream" src="${IMG.torridenCream}" alt=""></div>
      </section>
      ${trustStrip()}
      ${brandStrip()}
      <div class="cm-page-inner">
        <div class="cm-section-head"><h2>İhtiyacına göre daha hızlı seçim yap</h2><a href="/allproducts.html">Tümünü Gör</a></div>
        <div class="cm-category-row">
          ${categoryCard(IMG.bojCleanser,'Temizleyiciler','Cildi arındır','/collections/cleanse.html')}
          ${categoryCard(IMG.roundToner,'Tonik & Essence','Dengele & hazırla','/collections/hydrate.html')}
          ${categoryCard(IMG.bojGlow,'Serum & Ampul','Onar & besle','/collections/treat.html')}
          ${categoryCard(IMG.torridenCream,'Nemlendiriciler','Nemlendir & koru','/collections/care.html')}
        </div>
        <div class="cm-section-head"><h2>Çok Satanlar</h2><a href="/allproducts.html">Tümünü Gör</a></div>
        <div class="cm-product-grid">${PRODUCTS.slice(0,4).map(productCard).join('')}</div>
      </div>
      ${nav('home')}
    </div>`;
  }

  function listingPage(){
    const meta = listingMeta();
    return `<div class="cm-mobile-page cm-mobile-listing">
      ${header({promo:false})}
      <div class="cm-page-inner">
        <form class="cm-search-box" action="/search.html" role="search">${svg('search')}<input name="q" type="search" placeholder="Ürün, marka veya içerik ara..."><button class="cm-filter-btn" type="button" aria-label="Filtreleri aç">${svg('filter')}</button></form>
        <div class="cm-chip-row" aria-label="Hızlı kategoriler">
          ${['Tümü','Temizleyici','Serum','Güneş','Nem','Bariyer','Işıltı'].map((c,i)=>`<a class="cm-chip ${i===0?'is-active':''}" href="${i===0?'/allproducts.html':'/collections/treat.html'}">${c}</a>`).join('')}
        </div>
        <div class="cm-listing-head"><div><h1>${meta.title}</h1><span>${meta.count}</span></div><div class="cm-listing-actions"><button class="cm-sort-btn" type="button">Sırala ${svg('chevron')}</button><button class="cm-sort-btn" type="button">${svg('filter')} Filtrele</button></div></div>
        <div class="cm-product-grid">${PRODUCTS.map(productCard).join('')}</div>
      </div>
      ${nav('list')}
    </div>`;
  }

  function pdpPage(){
    const p = productFromPage();
    const recs = [PRODUCTS[1], PRODUCTS[2], PRODUCTS[3], PRODUCTS[4]];
    return `<div class="cm-mobile-page cm-mobile-pdp">
      ${header({promo:false,back:true,backHref:'/allproducts.html'})}
      <section class="cm-pdp-hero" aria-label="Ürün görseli">
        <div class="cm-pdp-float"><button type="button" aria-label="Favoriye ekle">${svg('heart')}</button><button type="button" aria-label="Paylaş">${svg('share')}</button></div>
        <img class="cm-pdp-product" src="${p.img}" alt="${escapeHtml(p.brand+' '+p.name)}">
      </section>
      <section class="cm-pdp-info">
        <span class="cm-pdp-brand">${p.brand.toUpperCase()}</span>
        <h1>${p.name.replace(/\s\d+ml|\s\d+ ml|\s\d+ml$/i,'')}</h1>
        <p>${p.short || 'Seçili Kore cilt bakım ürünü'}</p>
        <div class="cm-pdp-meta"><span class="cm-rating">★★★★★</span><span>(4.8)</span><span>1.284 değerlendirme</span></div>
        <div class="cm-pdp-price-line"><b>${p.price}</b><span>${p.volume}</span></div>
        <div class="cm-qty-cta"><div class="cm-stepper" aria-label="Adet seçici"><button type="button">−</button><span>1</span><button type="button">+</button></div><button class="cm-btn cm-btn--primary" data-cm-add-cart="${p.slug}" type="button">SEPETE EKLE</button></div>
        <div class="cm-delivery-note">${svg('truck')} 750 TL ve üzeri alışverişlerde ücretsiz kargo!</div>
        <div class="cm-accordion" aria-label="Ürün bilgileri">
          <div class="cm-acc-row">${svg('star')}<div><strong>Öne Çıkan Faydalar</strong><span>Cildi yatıştırır, kızarıklık görünümünü azaltır ve gözenekleri arındırmaya yardımcı olur.</span></div>${svg('chevron')}</div>
          <div class="cm-acc-row">${svg('drop')}<div><strong>Nasıl Kullanılır?</strong><span>Temiz cilde pamuk yardımıyla uygulayın ve nazikçe yedirin.</span></div>${svg('chevron')}</div>
          <div class="cm-acc-row">${svg('shield')}<div><strong>İçerik</strong><span>Heartleaf Extract, Butylene Glycol, Betaine, Panthenol, Allantoin.</span></div>${svg('chevron')}</div>
          <div class="cm-acc-row">${svg('user')}<div><strong>Kimler İçin Uygun?</strong><span>Tüm cilt tipleri, özellikle hassas ve karma ciltler.</span></div>${svg('chevron')}</div>
        </div>
        <div class="cm-section-head"><h2>Birlikte iyi gider</h2></div>
        <div class="cm-reco-row">${recs.map(miniProduct).join('')}</div>
      </section>
      ${nav('list')}
    </div>`;
  }

  function routinePage(){
    return `<div class="cm-mobile-page cm-mobile-routine">
      ${header({promo:false})}
      <section class="cm-routine-title">
        <div class="cm-routine-title__top"><span>AKILLI RUTİN SEÇİMİ</span><span>1 / 4</span></div>
        <h1>Cildin için en doğru rutini birlikte oluşturalım.</h1>
        <p>Hedeflerini seç, cilt tipini ekle. Sana özel gündüz ve gece rutinin hazır olsun.</p>
      </section>
      <div class="cm-routine-builder">
        <section class="cm-step-block"><h2>1. Cilt Hedefini Seç</h2><small>En fazla 3 seçim yapabilirsin.</small><div class="cm-select-grid">
          <button class="cm-select-chip is-selected" type="button">${svg('drop')} Nem</button><button class="cm-select-chip is-selected" type="button">${svg('shield')} Bariyer</button><button class="cm-select-chip is-selected" type="button">${svg('sparkle')} Işıltı</button><button class="cm-select-chip" type="button">Akne Karşıtı</button><button class="cm-select-chip" type="button">Gözenek</button><button class="cm-select-chip" type="button">Yaşlanma Karşıtı</button>
        </div></section>
        <section class="cm-step-block"><h2>2. Cilt Tipini Seç <small style="display:inline;color:#988e84">(İsteğe Bağlı)</small></h2><div class="cm-select-grid cm-select-grid--skin"><button class="cm-select-chip" type="button">Kuru</button><button class="cm-select-chip is-selected" type="button">Karma</button><button class="cm-select-chip" type="button">Yağlı</button><button class="cm-select-chip" type="button">Hassas</button></div></section>
        <section class="cm-step-block"><h2>3. Rutini Seç</h2><div class="cm-toggle"><button class="is-active" type="button">${svg('sun')} Gündüz</button><button type="button">${svg('moon')} Gece</button></div></section>
        <section class="cm-routine-card" aria-label="Önerilen gündüz rutini">
          <div class="cm-routine-card__head"><div><strong>Önerilen Gündüz Rutini</strong><span>Hedeflerinle uyumlu</span></div><span class="cm-match">77%</span></div>
          <div class="cm-routine-products">
            <div class="cm-routine-step"><img src="${IMG.bojCleanser}" alt=""><b>1 Temizleyici</b><span>Cildi arındır</span></div>
            <div class="cm-routine-step"><img src="${IMG.anuaToner}" alt=""><b>2 Tonik</b><span>Dengele</span></div>
            <div class="cm-routine-step"><img src="${IMG.bojGlow}" alt=""><b>3 Serum</b><span>Onar & nemlendir</span></div>
            <div class="cm-routine-step"><img src="${IMG.torridenCream}" alt=""><b>4 Nemlendirici</b><span>Koru & besle</span></div>
          </div>
          <div class="cm-set-price"><div><small>Set Avantajı</small><span class="cm-chip" style="height:28px;min-height:28px;padding:0 9px;background:#fff9ef;color:#8a6840">%18 Avantaj</span></div><div style="text-align:right"><s>3.606,00 TL</s><b>2.959,00 TL</b></div></div>
          <button class="cm-btn cm-btn--primary cm-btn--wide" type="button" data-cm-add-routine>Tüm Rutini Sepete Ekle</button>
          <div class="cm-secondary-actions"><button class="cm-btn" type="button">${svg('heart')} Rutini Kaydet</button><button class="cm-btn" type="button">${svg('eye')} Rutini Gör</button></div>
        </section>
      </div>
      ${nav('list')}
    </div>`;
  }

  function cartPage(){
    const items = [PRODUCTS[1], PRODUCTS[0], PRODUCTS[3]];
    return `<div class="cm-mobile-page cm-mobile-cart">
      ${header({promo:true})}
      <section class="cm-cart-title"><h1>Sepetim <span>(3 ürün)</span></h1></section>
      <section class="cm-cart-list" aria-label="Sepetteki ürünler">
        ${items.map((p,i)=>`<article class="cm-cart-row"><div class="cm-cart-row__img"><img src="${p.img}" alt="${escapeHtml(p.brand+' '+p.name)}"></div><div><h2>${p.brand}<br>${p.name.replace(/\s\d+ml|\s\d+ ml|\s\d+ml$/i,'')}</h2><small>${p.short}<br>${p.volume}</small><b>${p.price}</b><div class="cm-stepper"><button type="button">−</button><span>1</span><button type="button">+</button></div></div><button class="cm-trash" aria-label="Ürünü sil" type="button">${svg('trash')}</button></article>`).join('')}
      </section>
      <section class="cm-coupon"><label>${svg('tag')}<input type="text" placeholder="İndirim kodunuzu girin"></label><button type="button">Uygula</button></section>
      <section class="cm-summary" aria-label="Sipariş özeti">
        <h2>Sipariş Özeti</h2><div class="cm-summary-row"><span>Ara Toplam</span><b>2.607,00 TL</b></div><div class="cm-summary-row"><span>İndirim</span><b>-161,97 TL</b></div><div class="cm-summary-row"><span>Teslimat</span><b>Ücretsiz</b></div><div class="cm-summary-row is-total"><span>Toplam</span><b>2.445,03 TL</b></div>
        <div class="cm-campaign-note">${svg('truck')} 750 TL ve üzeri alışverişlerde ücretsiz kargo avantajından yararlandınız.</div>
        <a class="cm-btn cm-btn--primary cm-btn--wide" href="/checkout.html#checkoutForm" style="margin-top:13px">Ödemeye Geç ${svg('chevron')}</a>
      </section>
      <section class="cm-cart-trust"><div>${svg('lock')}256-bit SSL<br>Güvenli Ödeme</div><div>${svg('shield')}%100 Orijinal<br>Ürün Garantisi</div><div>${svg('truck')}1-3 İş Günü<br>Hızlı Teslimat</div></section>
      ${nav('cart')}
    </div>`;
  }

  function menuOverlay(){
    const card = (icon,title,href)=>`<a class="cm-menu-card" href="${href}">${svg(icon)}<span>${title}</span></a>`;
    const link = (icon,title,href)=>`<a class="cm-menu-link" href="${href}">${svg(icon)}<span>${title}</span>${svg('chevron')}</a>`;
    return `<div class="cm-menu-dim" data-cm-menu-close></div><aside class="cm-menu-panel" aria-label="COSMOSKIN mobil menü" aria-hidden="true">
      <div class="cm-menu-head"><button class="cm-menu-close" type="button" data-cm-menu-close aria-label="Menüyü kapat">${svg('close')}</button><div><div class="cm-menu-logo">COSMOSKIN</div><div class="cm-menu-welcome">${svg('leaf')} Merhaba, güzelliğine iyi bak.</div></div></div>
      <nav class="cm-menu-main" aria-label="Genel navigasyon">
        ${link('grid','Kategoriler','/allproducts.html')}${link('tag','Markalar','/brands/anua.html')}${link('star','Çok Satanlar','/index.html#bestsellers')}${link('bottle','Rutinler','/collections/routine.html')}${link('sparkle','COSMOSKIN Edit','/index.html#brands')}${link('user','Destek','/contact.html')}
      </nav>
      <section class="cm-menu-section"><div class="cm-menu-section__head"><h3>Hızlı Kategoriler</h3><a href="/allproducts.html">Tümünü Gör</a></div><div class="cm-menu-card-grid">
        ${card('bottle','Temizleyiciler','/collections/cleanse.html')}${card('drop','Tonik & Essence','/collections/hydrate.html')}${card('sparkle','Serum & Ampul','/collections/treat.html')}${card('cube','Nemlendiriciler','/collections/care.html')}${card('shield','Güneş Koruyucu','/collections/protect.html')}${card('user','Maskeler','/collections/masks.html')}
      </div></section>
      <section class="cm-menu-section"><div class="cm-menu-section__head"><h3>Cilt Hedeflerine Göre Keşif</h3><a href="/collections/routine.html">Tümünü Gör</a></div><div class="cm-menu-card-grid">
        ${card('drop','Nem','/collections/hydrate.html')}${card('shield','Bariyer','/collections/care.html')}${card('sparkle','Işıltı','/collections/treat.html')}${card('leaf','Akne & Denge','/collections/blemish.html')}${card('heart','Hassasiyet','/collections/care.html')}${card('grid','Gözenek & Sebum','/collections/blemish.html')}
      </div></section>
      <section class="cm-menu-section"><div class="cm-menu-section__head"><h3>Sevdiğin Markalar</h3><a href="/brands/anua.html">Tümünü Gör</a></div><div class="cm-brand-cloud">
        ${['anua','cosrx','beauty-of-joseon','round-lab'].map(b=>`<a href="/brands/${b}.html"><img src="/assets/img/brands/${b}.svg" alt="${b}"></a>`).join('')}<a href="/brands/skin1004.html"><img src="/assets/img/brands/skin1004.svg" alt="SKIN1004"></a><a href="/brands/torriden.html"><img src="/assets/img/brands/torriden.svg" alt="Torriden"></a><a href="/collections/thank-you-farmer.html"><img src="/assets/img/brands/thank-you-farmer.svg" alt="Thank You Farmer"></a>
      </div></section>
      <nav class="cm-service-links" aria-label="Hesap ve destek">${link('user','Hesabım','/account/profile.html')}${link('cube','Siparişlerim','/account/orders.html')}${link('heart','Favorilerim','/account/profile.html#favorites')}${link('bag','Sepetim','/checkout.html')}${link('shield','Yardım & Destek','/contact.html')}${link('truck','İade ve Teslimat','/iade-degisim.html')}</nav>
    </aside>`;
  }

  function getPageType(){
    const p = location.pathname;
    if (p === '/' || /\/index\.html$/.test(p)) return 'home';
    if (/\/products\//.test(p)) return 'pdp';
    if (/checkout\.html/.test(p)) return 'cart';
    if (/\/collections\/routine\.html/.test(p)) return 'routine';
    if (/allproducts\.html|search\.html|\/collections\/|\/brands\//.test(p)) return 'listing';
    return null;
  }

  function addToCart(slug){
    const p = PRODUCTS.find(x=>x.slug===slug) || (location.pathname.includes('/products/') ? productFromPage() : PRODUCTS[0]);
    const item = {id:p.slug,slug:p.slug,name:p.name,brand:p.brand,price:p.num,image:p.img,url:p.url,qty:1};
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.addItems === 'function') {
      window.COSMOSKIN_CART_API.addItems([item], {openDrawer:false});
    } else {
      let cart = [];
      try{ cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); }catch(e){ cart = []; }
      const found = cart.find(x=>x.id===item.id || x.slug===item.slug);
      if (found) found.qty = Number(found.qty || 1) + 1; else cart.push(item);
      localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
      window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', {detail:{cart}}));
    }
    updateBadges();
    toast('Ürün sepetinize eklendi.');
  }

  function addRoutine(){
    ['beauty-of-joseon-green-plum-refreshing-cleanser','anua-heartleaf-77-soothing-toner','beauty-of-joseon-glow-serum-propolis-niacinamide','torriden-solid-in-ceramide-cream'].forEach(slug=>{
      const fallback = {
        'beauty-of-joseon-green-plum-refreshing-cleanser':{slug:'beauty-of-joseon-green-plum-refreshing-cleanser',brand:'Beauty of Joseon',name:'Green Plum Refreshing Cleanser',price:699,img:IMG.bojCleanser,url:'/products/beauty-of-joseon-green-plum-refreshing-cleanser.html'},
        'torriden-solid-in-ceramide-cream':{slug:'torriden-solid-in-ceramide-cream',brand:'Torriden',name:'Solid-In Ceramide Cream',price:899,img:IMG.torridenCream,url:'/products/torriden-solid-in-ceramide-cream.html'}
      }[slug];
      const p = PRODUCTS.find(x=>x.slug===slug) || fallback || PRODUCTS[0];
      const item = {id:p.slug,slug:p.slug,name:p.name,brand:p.brand,price:p.num || p.price,image:p.img,url:p.url,qty:1};
      let cart = [];
      try{ cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); }catch(e){ cart = []; }
      const found = cart.find(x=>x.id===item.id || x.slug===item.slug);
      if (found) found.qty = Number(found.qty || 1) + 1; else cart.push(item);
      localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
    });
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated'));
    updateBadges();
    toast('Rutin sepetinize eklendi.');
  }

  function cartCount(){
    try{
      const apiItems = window.COSMOSKIN_CART_API && window.COSMOSKIN_CART_API.getItems && window.COSMOSKIN_CART_API.getItems();
      const cart = apiItems || JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
      return cart.reduce((sum,item)=>sum + Number(item.qty || item.quantity || 1),0);
    }catch(e){ return 0; }
  }

  function updateBadges(){
    const count = cartCount();
    document.querySelectorAll('[data-cm-cart-badge]').forEach(el=>{ el.textContent = count || (location.pathname.includes('checkout') ? 3 : 0); });
  }

  function toast(text){
    let el = document.querySelector('.cm-mobile-toast');
    if(!el){ el = document.createElement('div'); el.className = 'cm-mobile-toast'; document.body.appendChild(el); }
    el.textContent = text;
    Object.assign(el.style,{position:'fixed',left:'50%',bottom:'92px',transform:'translateX(-50%) translateY(10px)',background:'#151412',color:'#fff',padding:'12px 16px',borderRadius:'999px',font:'700 12px/1 Plus Jakarta Sans,system-ui,sans-serif',zIndex:'160',opacity:'0',transition:'opacity .22s ease, transform .22s ease',boxShadow:'0 14px 30px rgba(0,0,0,.2)',pointerEvents:'none'});
    requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
    clearTimeout(el._t); el._t = setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(10px)'; },1800);
  }

  function escapeHtml(str){ return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function init(){
    const main = document.querySelector('main') || document.body;
    const type = getPageType();
    if(!type) return;
    let html = type==='pdp' ? pdpPage() : type==='cart' ? cartPage() : type==='routine' ? routinePage() : type==='listing' ? listingPage() : homePage();
    main.insertAdjacentHTML('afterbegin', html);
    document.body.insertAdjacentHTML('beforeend', menuOverlay());
    document.body.classList.add('cm-mobile-active');
    document.addEventListener('click', function(e){
      if(e.target.closest('[data-cm-menu]')){ document.body.classList.add('cm-menu-open'); const panel=document.querySelector('.cm-menu-panel'); if(panel) panel.setAttribute('aria-hidden','false'); }
      if(e.target.closest('[data-cm-menu-close]')){ document.body.classList.remove('cm-menu-open'); const panel=document.querySelector('.cm-menu-panel'); if(panel) panel.setAttribute('aria-hidden','true'); }
      const add = e.target.closest('[data-cm-add-cart]');
      if(add) addToCart(add.getAttribute('data-cm-add-cart'));
      if(e.target.closest('[data-cm-add-routine]')) addRoutine();
    });
    window.addEventListener('cosmoskin:cart-updated', updateBadges);
    window.addEventListener('storage', updateBadges);
    setTimeout(updateBadges, 50);
    setTimeout(updateBadges, 600);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
