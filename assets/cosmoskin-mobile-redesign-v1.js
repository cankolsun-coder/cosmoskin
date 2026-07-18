/* COSMOSKIN Mobile Redesign v1 — one controlled mobile shell. */
(function () {
  'use strict';
  var BP = 767;
  var CART_KEY = 'cosmoskin_cart';
  var COUPON_KEY = 'cosmoskin_coupon_state_v1';
  var LEGACY_COUPON_KEY = 'cosmoskin_coupon_code';
  var activePanel = null;
  var lastFocus = null;
  var lockedY = 0;
  var filterState = { brand: '', stock: '', query: '' };
  var svg = {
    menu:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 7.25h15M4.5 12h15M4.5 16.75h15"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.75" cy="10.75" r="6.25"/><path d="m15.4 15.4 4.35 4.35"/></svg>',
    bag:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9.25V7.4a4 4 0 0 1 8 0v1.85"/><path d="M5.75 9.25h12.5l-.85 10.55A1.7 1.7 0 0 1 15.72 21.5H8.28a1.7 1.7 0 0 1-1.68-1.7L5.75 9.25Z"/></svg>',
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 10.5 12 4.5 19.5 10.5"/><path d="M6 10v9.5h12V10"/><path d="M10.5 19.5V14h3v5.5"/></svg>',
    grid:'<svg viewBox="0 0 24 24"><path d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z"/></svg>',
    heart:'<svg class="cs-nav-heart" viewBox="0 0 24 24" aria-hidden="true"><path class="cs-nav-heart__fill" d="M12 20s-7-4.6-8.4-9.1A4.7 4.7 0 0 1 11 6l1 1 1-1a4.7 4.7 0 0 1 7.4 4.9C19 15.4 12 20 12 20Z"/><path class="cs-nav-heart__stroke" d="M12 20s-7-4.6-8.4-9.1A4.7 4.7 0 0 1 11 6l1 1 1-1a4.7 4.7 0 0 1 7.4 4.9C19 15.4 12 20 12 20Z"/></svg>',
    user:'<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
    chevron:'<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>',
    filter:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 5v4M16 15v4"/></svg>',
    sort:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8M10 12h6M12 17h4"/></svg>'
  };
  function isMobile(){ return window.matchMedia ? window.matchMedia('(max-width: '+BP+'px)').matches : window.innerWidth <= BP; }
  function $(s,r){ return (r||document).querySelector(s); }
  function $$(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function fmt(v){ var n = Number(v || 0); try { return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(n); } catch(e){ return '₺'+Math.round(n); } }
  function route(){ var p = location.pathname; if(p==='/'||/index\.html$/.test(p))return'home'; if(/checkout\.html$/.test(p))return'checkout'; if(/cart\.html$/.test(p))return'cart'; if(/products\//.test(p))return'pdp'; if(/account\//.test(p))return'account'; if(/payment\/success\.html$/.test(p))return'payment-success'; if(/payment\/failure\.html$/.test(p))return'payment-failure'; if(/order-tracking\.html$/.test(p))return'order-tracking'; if(/allproducts\.html$|search\.html$|categories\.html$|brands\.html$|collections\//.test(p)||/brands\//.test(p))return'listing'; if(/contact\.html$/.test(p))return'contact'; if(/legal\//.test(p)||/(teslimat-kargo|iade-degisim|odeme-ve-guvenlik|mesafeli-satis|on-bilgilendirme|hakkimizda)\.html$/.test(p))return'content'; if(/akilli-rutin|routine|rutinler/.test(p))return'routine'; return'content'; }
  function cartItems(){ if(window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.getItems==='function') return window.COSMOSKIN_CART_API.getItems() || []; try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')||[];}catch(e){return [];} }
  function saveCart(items){ localStorage.setItem(CART_KEY, JSON.stringify(items||[])); try{ window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated',{detail:{cart:items||[]}})); document.dispatchEvent(new CustomEvent('cosmoskin:cart-updated',{detail:{cart:items||[]}})); }catch(e){} updateBadge(); }
  function subtotal(){ return cartItems().reduce(function(s,i){ return s + Number(i.price||0) * Number(i.qty||i.quantity||1); },0); }
  function cartCount(){ return cartItems().reduce(function(s,i){ return s + Number(i.qty||i.quantity||1); },0); }
  function normalizeCouponStorage(){ try{ var c = String(localStorage.getItem(LEGACY_COUPON_KEY)||'').toUpperCase(); var oldCode = 'COSMOS'+'KIN10'; if(c===oldCode || c==='CLUB10' || c==='WELCOME15') localStorage.removeItem(LEGACY_COUPON_KEY); var obj = JSON.parse(localStorage.getItem(COUPON_KEY)||'null'); if(obj && (String(obj.code||'').toUpperCase()===oldCode || String(obj.code||'').toUpperCase()==='CLUB10' || String(obj.code||'').toUpperCase()==='WELCOME15')) localStorage.removeItem(COUPON_KEY); }catch(e){} }
  function lockBody(){ if(document.body.classList.contains('cs-mobile-lock')) return; lockedY = window.scrollY || document.documentElement.scrollTop || 0; document.documentElement.classList.add('cs-mobile-lock'); document.body.classList.add('cs-mobile-lock'); document.body.style.position='fixed'; document.body.style.top='-'+lockedY+'px'; document.body.style.left='0'; document.body.style.right='0'; document.body.style.width='100%'; }
  function unlockBody(){ document.documentElement.classList.remove('cs-mobile-lock'); document.body.classList.remove('cs-mobile-lock'); document.body.style.position=''; document.body.style.top=''; document.body.style.left=''; document.body.style.right=''; document.body.style.width=''; window.scrollTo(0, lockedY || 0); }
  function openPanel(name, trigger){ lastFocus = trigger || document.activeElement; closePanel(false); activePanel = name; var backdrop = $('.cs-mobile-v1-backdrop'); var sheet = $('[data-cs-mobile-sheet="'+name+'"]'); if(!backdrop || !sheet) return; if(name==='cart') renderCart(); if(name==='filter') renderFilter(); if(name==='menu') renderMenuAccount(); backdrop.classList.add('is-open'); sheet.classList.add('is-open'); document.body.classList.add('cs-mobile-'+name+'-open'); lockBody(); setTimeout(function(){ var focusable = $('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', sheet); if(focusable) focusable.focus({preventScroll:true}); },30); }
  function closePanel(restore){ var backdrop = $('.cs-mobile-v1-backdrop'); if(backdrop) backdrop.classList.remove('is-open'); $$('.cs-mobile-v1-sheet.is-open').forEach(function(s){ s.classList.remove('is-open'); }); ['menu','search','filter','cart'].forEach(function(n){ document.body.classList.remove('cs-mobile-'+n+'-open'); }); if(activePanel) unlockBody(); activePanel = null; if(restore !== false && lastFocus && lastFocus.focus) { try{ lastFocus.focus({preventScroll:true}); }catch(e){} } }
  function mobileAnnouncement(){
    var announcement = $('.announcement');
    var track = $('.marquee', announcement);
    if (!announcement || !track) return;
    if (track.dataset.csMobileTicker === '2') return;
    var icons = {
      truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>',
      sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v4M12 16v4M4 12h4M16 12h4M7.05 7.05l2.83 2.83M14.12 14.12l2.83 2.83M16.95 7.05l-2.83 2.83M9.88 14.12l-2.83 2.83"/></svg>',
      lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8.2a4 4 0 0 1 8 0V11"/><rect x="6.5" y="11" width="11" height="9" rx="1.6"/></svg>',
      gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="9.2" rx="1"/><path d="M3.8 7h16.4v3H3.8zM12 7v12.2"/><path d="M12 7c-2.2 0-3.6-.9-3.6-2.1S9.4 3.5 10.6 3.5c1.4 0 1.4 2 1.4 3.5Zm0 0c2.2 0 3.6-.9 3.6-2.1S14.6 3.5 13.4 3.5C12 3.5 12 5.5 12 7Z"/></svg>'
    };
    var items = [
      { icon: 'truck', text: 'Türkiye geneli hızlı gönderim' },
      { icon: 'sparkle', text: 'Orijinal K-Beauty seçkisi' },
      { icon: 'lock', text: 'Güvenli ödeme' },
      { icon: 'gift', text: '2.500 TL üzeri ücretsiz kargo' }
    ];
    function groupHtml(ariaHidden) {
      return '<span class="cs-mobile-announcement__group"' + (ariaHidden ? ' aria-hidden="true"' : '') + '>' + items.map(function (item) {
        return '<span class="cs-mobile-announcement__item">' +
          '<span class="cs-mobile-announcement__icon">' + (icons[item.icon] || '') + '</span>' +
          '<span class="cs-mobile-announcement__text">' + item.text + '</span>' +
        '</span>';
      }).join('') + '</span>';
    }
    announcement.classList.add('cs-announcement--premium');
    track.dataset.csMobileTicker = '2';
    track.setAttribute('aria-label', items.map(function (i) { return i.text; }).join(' · '));
    track.innerHTML = groupHtml(false) + groupHtml(true);
  }
  function header(){ if($('.cs-mobile-v1-header')) return; var h=document.createElement('header'); h.className='cs-mobile-v1-header'; h.innerHTML='<button type="button" class="cs-mobile-v1-iconbtn" data-cs-open="menu" aria-label="Menüyü aç">'+svg.menu+'</button><a class="cs-mobile-v1-logo" href="/index.html" aria-label="COSMOSKIN anasayfa"><span>COSMOSKIN</span></a><div class="cs-mobile-v1-tools"><button type="button" class="cs-mobile-v1-iconbtn" data-cs-open="search" aria-label="Arama">'+svg.search+'</button><button type="button" class="cs-mobile-v1-iconbtn" data-cs-open="cart" aria-label="Sepet">'+svg.bag+'<span class="cs-mobile-v1-badge" data-cs-cart-badge hidden>0</span></button></div>'; var ann=$('.announcement'); if(ann && ann.parentNode) ann.insertAdjacentElement('afterend', h); else document.body.insertBefore(h, document.body.firstChild); }
  function bottomNav(){
    if (route() === 'checkout') return;
    var items = [['Ana Sayfa','/index.html','home'],['Kategoriler','/categories.html','grid'],['Favoriler','/favorites.html','heart'],['Sepetim','/cart.html','bag'],['Hesabım','/account/profile.html','user']];
    var currentIdx = tabPathIndex(location.pathname);
    var nav = $('.cs-mobile-v1-bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'cs-mobile-v1-bottom-nav';
      nav.setAttribute('aria-label', 'Mobil alt navigasyon');
      nav.innerHTML = '<span class="cs-mobile-v1-tab-indicator" aria-hidden="true"></span>' + items.map(function(i, idx){
        return '<a href="'+i[1]+'" data-cs-tab-nav data-tab-index="'+idx+'"'+(i[2]==='heart'?' data-cs-nav-heart':'')+'>'+svg[i[2]]+'<span>'+i[0]+'</span>'+(i[2]==='bag'?'<em class="cs-mobile-v1-badge" data-cs-cart-badge hidden>0</em>':'')+'</a>';
      }).join('');
      document.body.appendChild(nav);
    } else {
      ensureTabIndicator(nav);
      $$('a', nav).forEach(function(link, idx){
        if (!link.hasAttribute('data-cs-tab-nav')) {
          link.setAttribute('data-cs-tab-nav', '');
          link.setAttribute('data-tab-index', String(idx));
        }
      });
      ensureFavoritesHeartIcon(nav);
    }
    setBottomNavActive(currentIdx < 0 ? 0 : currentIdx, false);
  }
  function ensureFavoritesHeartIcon(nav){
    var link = nav && (nav.querySelector('[data-cs-nav-heart]') || nav.querySelector('a[href*="favorites"]'));
    if (!link) return;
    link.setAttribute('data-cs-nav-heart', '');
    if (link.querySelector('.cs-nav-heart__fill')) return;
    var label = link.querySelector('span');
    var badge = link.querySelector('.cs-mobile-v1-badge, em');
    link.innerHTML = svg.heart + (label ? label.outerHTML : '<span>Favoriler</span>') + (badge ? badge.outerHTML : '');
  }
  var heartBurstTimer = 0;
  function playFavoritesHeartBurst(){
    if (reducedMotion()) return;
    var link = $('.cs-mobile-v1-bottom-nav [data-cs-nav-heart]') || $('.cs-mobile-v1-bottom-nav a[href*="favorites"]');
    if (!link) return;
    ensureFavoritesHeartIcon(link.closest('.cs-mobile-v1-bottom-nav'));
    link.classList.remove('is-heart-burst');
    void link.offsetWidth;
    link.classList.add('is-heart-burst');
    if (heartBurstTimer) window.clearTimeout(heartBurstTimer);
    heartBurstTimer = window.setTimeout(function(){
      link.classList.remove('is-heart-burst');
      heartBurstTimer = 0;
    }, 1180);
  }
  function maybeFavoritesHeartBurst(){
    var shouldPlay = false;
    try {
      shouldPlay = sessionStorage.getItem('cs_mobile_heart_burst') === '1';
      if (shouldPlay) sessionStorage.removeItem('cs_mobile_heart_burst');
    } catch (e) {}
    if (!shouldPlay) return;
    if (tabPathIndex(location.pathname) !== 2) return;
    requestAnimationFrame(function(){
      requestAnimationFrame(playFavoritesHeartBurst);
    });
  }
  function mobileFooter(){
    var desktopFooter = $('footer.footer');
    var path = location.pathname || '';
    var allowFooter = route() === 'home' || /categories\.html$/.test(path);
    var existing = $('.cs-mobile-footer');
    if (!allowFooter) {
      if (existing) existing.remove();
      document.body.classList.remove('cs-has-mobile-footer', 'cs-mobile-footer-visible');
      if (desktopFooter) {
        desktopFooter.classList.add('cs-desktop-footer');
        desktopFooter.hidden = true;
        desktopFooter.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    if (!desktopFooter || existing) return;
    document.body.classList.add('cs-has-mobile-footer');
    desktopFooter.classList.add('cs-desktop-footer');
    desktopFooter.hidden = true;
    desktopFooter.setAttribute('aria-hidden', 'true');

    var footer = document.createElement('footer');
    footer.className = 'cs-mobile-footer';
    footer.setAttribute('aria-label', 'COSMOSKIN site bilgileri');
    footer.innerHTML = ''+
      '<section class="cs-mobile-footer__journal" aria-labelledby="csMobileJournalTitle">'+
        '<p class="cs-mobile-footer__eyebrow">COSMOSKIN Journal</p>'+
        '<h2 id="csMobileJournalTitle">Bakım notları,<br>ilk seninle.</h2>'+
        '<p>Yeni seçkiler, ürün önerileri ve cilt bakım rehberleri posta kutunda.</p>'+
        '<form class="cs-mobile-footer__form" action="/api/newsletter/subscribe" method="post" data-newsletter-form data-newsletter-source="mobile-footer" novalidate>'+
          '<label for="csMobileNewsletterEmail"><span class="visually-hidden">E-posta adresi</span><input id="csMobileNewsletterEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="E-posta adresin" required></label>'+
          '<button type="submit" aria-label="COSMOSKIN Journal’a kaydol"><span>Kaydol</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>'+
          '<p class="cs-mobile-footer__consent">Kaydolarak ticari ileti izni verirsiniz. <a href="/legal/ticari-elektronik-ileti-izni.html">İzin metni</a> · <a href="/legal/kvkk-aydinlatma-metni.html">KVKK</a></p>'+
          '<p class="cs-mobile-footer__status" data-newsletter-status aria-live="polite"></p>'+
        '</form>'+
      '</section>'+
      '<section class="cs-mobile-footer__navigation" aria-label="Footer bağlantıları">'+
        '<details class="cs-mobile-footer__group">'+
          '<summary><span>Alışveriş & Yardım</span><span class="cs-mobile-footer__plus" aria-hidden="true"></span></summary>'+
          '<div class="cs-mobile-footer__links"><a href="/order-tracking.html">Sipariş Takibi</a><a href="/legal/teslimat-ve-kargo.html">Teslimat ve Kargo</a><a href="/legal/iade-ve-cayma-politikasi.html">İade ve Cayma</a><a href="/odeme-ve-guvenlik.html">Ödeme ve Güvenlik</a><a href="/index.html#faq">Sıkça Sorulan Sorular</a></div>'+
        '</details>'+
        '<details class="cs-mobile-footer__group">'+
          '<summary><span>COSMOSKIN</span><span class="cs-mobile-footer__plus" aria-hidden="true"></span></summary>'+
          '<div class="cs-mobile-footer__links"><a href="/hakkimizda.html">Hakkımızda</a><a href="/cosmoskin-club.html">COSMOSKIN Club</a><a href="/contact.html">İletişim ve Destek</a><a href="https://etbis.ticaret.gov.tr/tr/SiteSorgulamaSonuc?siteId=42e611d4-51da-453d-a68a-90cb532f89dd" target="_blank" rel="noopener noreferrer">ETBİS Bilgilendirme</a></div>'+
        '</details>'+
        '<details class="cs-mobile-footer__group">'+
          '<summary><span>Yasal</span><span class="cs-mobile-footer__plus" aria-hidden="true"></span></summary>'+
          '<div class="cs-mobile-footer__links"><a href="/legal/on-bilgilendirme-formu.html">Ön Bilgilendirme Formu</a><a href="/legal/mesafeli-satis-sozlesmesi.html">Mesafeli Satış Sözleşmesi</a><a href="/legal/kvkk-aydinlatma-metni.html">KVKK Aydınlatma Metni</a><a href="/legal/gizlilik-ve-guvenlik-politikasi.html">Gizlilik Politikası</a><a href="/legal/cerez-politikasi.html">Çerez Politikası</a><a href="/legal/uyelik-sozlesmesi.html">Üyelik Sözleşmesi</a><a href="/legal/veri-sahibi-basvuru-formu.html">Veri Sahibi Başvuru Formu</a></div>'+
        '</details>'+
      '</section>'+
      '<section class="cs-mobile-footer__assurance" aria-label="Alışveriş güvenceleri">'+
        '<a class="cs-mobile-footer__assurance-item" href="/odeme-ve-guvenlik.html">'+
          '<span class="cs-mobile-footer__assurance-icon" aria-hidden="true">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M7.2 14.2h3.2"/><path d="M16.2 13.6v1.2M16.2 15.8v.2"/></svg>'+
          '</span>'+
          '<span class="cs-mobile-footer__assurance-copy"><strong>Güvenli ödeme</strong><small>iyzico · Visa · Troy</small></span>'+
        '</a>'+
        '<a class="cs-mobile-footer__assurance-item" href="/hakkimizda.html">'+
          '<span class="cs-mobile-footer__assurance-icon" aria-hidden="true">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4 19 6.2v5.1c0 4.4-2.9 7.9-7 9.5-4.1-1.6-7-5.1-7-9.5V6.2L12 3.4Z"/><path d="m9 12.1 2 2 4.2-4.3"/></svg>'+
          '</span>'+
          '<span class="cs-mobile-footer__assurance-copy"><strong>Orijinal ürün</strong><small>Seçilmiş K-Beauty</small></span>'+
        '</a>'+
        '<a class="cs-mobile-footer__assurance-item" href="/teslimat-kargo.html">'+
          '<span class="cs-mobile-footer__assurance-icon" aria-hidden="true">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.6h10.6v9.8H3.5zM14.1 9.4h3.2l3.2 3.1v4H14.1z"/><circle cx="7" cy="17.4" r="1.45"/><circle cx="16.9" cy="17.4" r="1.45"/></svg>'+
          '</span>'+
          '<span class="cs-mobile-footer__assurance-copy"><strong>Ücretsiz kargo</strong><small>2.500 TL ve üzeri</small></span>'+
        '</a>'+
        '<a class="cs-mobile-footer__assurance-item" href="/iade-degisim.html">'+
          '<span class="cs-mobile-footer__assurance-icon" aria-hidden="true">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 12a7.4 7.4 0 0 1 12.4-5.3L19 4.7"/><path d="M19 4.7v4H15.1"/><path d="M19.4 12a7.4 7.4 0 0 1-12.4 5.3L5 19.3"/><path d="M5 19.3v-4h3.9"/></svg>'+
          '</span>'+
          '<span class="cs-mobile-footer__assurance-copy"><strong>Kolay iade</strong><small>14 gün cayma</small></span>'+
        '</a>'+
      '</section>'+
      '<section class="cs-mobile-footer__brand">'+
        '<a class="cs-mobile-footer__wordmark" href="/index.html" aria-label="COSMOSKIN ana sayfa">COSMOSKIN</a>'+
        '<p>Seçilmiş Kore cilt bakımı.<br>İstanbul, Türkiye.</p>'+
        '<div class="cs-mobile-footer__socials" aria-label="COSMOSKIN sosyal medya">'+
          '<a href="https://instagram.com/cosmoskin.tr" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle class="is-fill" cx="17.2" cy="6.8" r="1.1"/></svg></a>'+
          '<a href="https://www.tiktok.com/@cosmoskin.tr" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 4c.45 2.55 1.9 4.18 4.55 4.42v3.05a7.2 7.2 0 0 1-4.5-1.46v5.65c0 3.1-2.18 5.34-5.26 5.34-2.77 0-4.99-1.94-4.99-4.62 0-2.83 2.37-4.78 5.34-4.78.42 0 .84.04 1.24.13v3.16a3.14 3.14 0 0 0-1.13-.2c-1.23 0-2.17.68-2.17 1.65 0 .94.78 1.56 1.81 1.56 1.18 0 1.96-.7 1.96-2.18V4h3.15Z"/></svg></a>'+
          '<a href="mailto:destek@cosmoskin.com.tr" aria-label="E-posta"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m5 7 7 6 7-6"/></svg></a>'+
        '</div>'+
      '</section>'+
      '<section class="cs-mobile-footer__payment" aria-label="Ödeme yöntemleri">'+
        '<span class="cs-mobile-footer__payment-logo cs-mobile-footer__payment-logo--iyzico" aria-label="iyzico"><img src="/assets/img/payments/iyzico-monochrome.svg" alt="" loading="lazy" decoding="async"></span>'+
        '<span class="cs-mobile-footer__payment-logo cs-mobile-footer__payment-logo--visa" aria-label="Visa"><img src="/assets/img/payments/visa.svg" alt="" loading="lazy" decoding="async"></span>'+
        '<span class="cs-mobile-footer__payment-logo cs-mobile-footer__payment-logo--mastercard" aria-label="Mastercard"><img src="/assets/img/payments/mastercard.svg" alt="" loading="lazy" decoding="async"></span>'+
        '<span class="cs-mobile-footer__payment-logo cs-mobile-footer__payment-logo--troy" aria-label="TROY"><img src="/assets/img/payments/troy.svg" alt="" loading="lazy" decoding="async"></span>'+
      '</section>'+
      '<div class="cs-mobile-footer__bottom"><span>© 2026 COSMOSKIN</span><a href="/legal/gizlilik-ve-guvenlik-politikasi.html">Gizlilik</a></div>';
    desktopFooter.parentNode.insertBefore(footer, desktopFooter);
    if ('IntersectionObserver' in window) {
      var footerObserver = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          document.body.classList.toggle('cs-mobile-footer-visible', entry.isIntersecting);
        });
      }, { threshold: 0, rootMargin: '0px 0px -80px 0px' });
      footerObserver.observe(footer);
    }
  }
  function mobileFaq(){
    var section = $('#faq.faq-section');
    if (!section || section.dataset.csMobileFaq === '1') return;
    section.dataset.csMobileFaq = '1';
    section.classList.add('cs-mobile-faq');
    var kicker = $('.section-head .kicker', section);
    var title = $('.section-head h2', section);
    if (kicker) kicker.textContent = 'Merak Edilenler';
    if (title) title.textContent = 'Alışverişe dair, net cevaplar.';
    var items = $$('.faq-item', section);
    items.forEach(function(item, index){
      item.style.setProperty('--cs-faq-index', '"' + String(index + 1).padStart(2, '0') + '"');
      item.addEventListener('toggle', function(){
        if (!item.open) return;
        items.forEach(function(other){ if (other !== item) other.open = false; });
      });
    });
  }
  function mobileSmartRoutine(){
    var root = $('#smart-routine');
    if (!root || root.dataset.csMobilePremium === '1') return;
    root.dataset.csMobilePremium = '1';
    root.classList.add('cs-mobile-smart-routine');
    var steps = $('[data-sr-steps]', root);
    var day = $('[data-sr-day-products]', root);
    var night = $('[data-sr-night-products]', root);
    if (steps) {
      steps.setAttribute('role', 'list');
      steps.setAttribute('aria-label', 'Beş adımlı bakım rutini');
    }
    if (day) {
      day.setAttribute('role', 'region');
      day.setAttribute('aria-label', 'Gündüz rutin ürünleri');
      day.setAttribute('tabindex', '0');
    }
    if (night) {
      night.setAttribute('role', 'region');
      night.setAttribute('aria-label', 'Gece rutin ürünleri');
      night.setAttribute('tabindex', '0');
    }
    var modal = $('[data-sr-alternative-modal]', root);
    if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
  }
  function contentTrustIcon(label){
    var text = String(label || '').toLocaleLowerCase('tr-TR');
    var type = 'security';
    var path = '<path d="M12 3.5 19 6v5.3c0 4.2-2.8 7.6-7 9.2-4.2-1.6-7-5-7-9.2V6l7-2.5Z"/><path d="m8.8 12 2 2 4.4-4.5"/>';
    if (/ödeme|visa|mastercard|iyzico|troy/.test(text)) {
      type = 'payment';
      path = '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M7 14.5h3"/>';
    } else if (/ücretsiz|avantaj|club|puan/.test(text)) {
      type = 'benefit';
      path = '<path d="M5 9.5h14v10H5zM4 6.5h16v3H4zM12 6.5v13"/><path d="M12 6.5H8.5a2 2 0 1 1 2-2c0 1.4 1.5 2 1.5 2Zm0 0h3.5a2 2 0 1 0-2-2c0 1.4-1.5 2-1.5 2Z"/>';
    } else if (/dhl|kargo|teslimat|gönderi/.test(text)) {
      type = 'shipping';
      path = '<path d="M3.5 6.5h10v10h-10zM13.5 9h3l3 3v4.5h-6z"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="16.8" cy="17.5" r="1.7"/>';
    }
    return '<span class="cs-content-trust-icon cs-content-trust-icon--' + type + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + path + '</svg></span>';
  }
  function supportPathwayIcon(label){
    var text = String(label || '').toLocaleLowerCase('tr-TR');
    var type = 'package';
    var shapes = '<path d="m4.5 7.5 7.5-4 7.5 4v9L12 20.5l-7.5-4v-9Z"/><path d="m4.8 7.7 7.2 4 7.2-4M12 11.7v8.5"/><circle cx="12" cy="7.2" r="1.45"/>';
    if (/teslimat|kargo/.test(text) && !/nerede/.test(text)) {
      type = 'shipping';
      shapes = '<path d="M3.5 6.5h10.8v10H3.5zM14.3 9.3h3.1l3.1 3.2v4h-6.2z"/><circle cx="7.1" cy="17.5" r="1.6"/><circle cx="17.4" cy="17.5" r="1.6"/><path d="M14.3 12.5h6.2"/>';
    } else if (/iade|cayma/.test(text)) {
      type = 'returns';
      shapes = '<rect x="5" y="3.8" width="14" height="16.4" rx="2.4"/><path d="M9 3.8h6v3H9zM8.4 12.2l2.2 2.2 5-5"/>';
    } else if (/ürün|içerik/.test(text)) {
      type = 'formula';
      shapes = '<path d="M9 3.5h6M10 3.5v5l-5 8.3A2.4 2.4 0 0 0 7 20.5h10a2.4 2.4 0 0 0 2-3.7L14 8.5v-5"/><path d="M7.2 15h9.6"/><circle cx="11" cy="12" r=".8"/>';
    } else if (/genel|iletişim/.test(text)) {
      type = 'message';
      shapes = '<path d="M4 5.5h16v11H9l-4.8 3 .8-3H4z"/><path d="M8 9.5h8M8 12.7h5.5"/>';
    } else if (/ortak|iş birliği/.test(text)) {
      type = 'partnership';
      shapes = '<path d="m8.2 9.2 2.3-2.3a2.1 2.1 0 0 1 3 0l4.9 4.9a2 2 0 0 1 0 2.8l-3.8 3.8a2 2 0 0 1-2.8 0l-6.2-6.2"/><path d="m3.5 10 3.2-3.2 3.4 3.4-3.2 3.2zM10.6 16l1.6-1.6M8.6 14l1.6-1.6M12.6 18l1.6-1.6"/>';
    }
    return '<span class="cs-support-pathway__icon cs-support-pathway__icon--' + type + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + shapes + '</svg></span>';
  }
  function mobileContentPages(){
    var main = $('main.cs-content-page');
    if (!main || main.dataset.csMobileContent === '1') return;
    main.dataset.csMobileContent = '1';
    main.classList.add('cs-mobile-content-ready');
    if ($('.cs-payment-card', main)) main.classList.add('cs-mobile-payment-page');
    var trust = $('.cs-legal-trust-grid, .cs-payment-trust-grid', main);
    if (trust) {
      trust.setAttribute('role', 'list');
      $$('.cs-legal-trust-grid > span, .cs-payment-trust-grid > span', main).forEach(function(item){
        item.setAttribute('role', 'listitem');
        if (!$('.cs-content-trust-icon', item)) item.insertAdjacentHTML('afterbegin', contentTrustIcon(item.textContent));
      });
    }
    $$('.cs-support-pathway', main).forEach(function(item){
      if (!$('.cs-support-pathway__icon', item)) item.insertAdjacentHTML('afterbegin', supportPathwayIcon(item.textContent));
    });
    $$('.cs-legal-card, .cs-content-card, .cs-payment-card', main).forEach(function(card, index){
      card.setAttribute('data-cs-section-index', String(index + 1).padStart(2, '0'));
    });
    var toc = $('.cs-legal-toc', main);
    if (toc) {
      toc.setAttribute('aria-label', 'Sayfa içindekiler');
      toc.setAttribute('role', 'navigation');
    }
  }
  function ensureTabIndicator(nav){
    if (!nav || nav.querySelector('.cs-mobile-v1-tab-indicator')) return;
    var indicator = document.createElement('span');
    indicator.className = 'cs-mobile-v1-tab-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.insertBefore(indicator, nav.firstChild);
  }
  function updateTabIndicator(index, animate){
    var nav = $('.cs-mobile-v1-bottom-nav');
    var indicator = nav && nav.querySelector('.cs-mobile-v1-tab-indicator');
    if (!nav || !indicator) return;
    var safeIndex = Math.max(0, Math.min(4, Number(index) || 0));
    if (animate === false) indicator.style.transition = 'none';
    nav.style.setProperty('--cs-tab-indicator-index', String(safeIndex));
    if (animate === false) {
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }
  }
  function sheets(){ if($('.cs-mobile-v1-backdrop')) return; var wrap=document.createElement('div'); wrap.innerHTML='<div class="cs-mobile-v1-backdrop" data-cs-close></div><aside class="cs-mobile-v1-sheet cs-mobile-v1-sheet--side" data-cs-mobile-sheet="menu" aria-label="Mobil menü"><div class="cs-mobile-v1-menu-head"><div class="cs-mobile-v1-menu-brand"><span class="cs-mobile-v1-menu-kicker">COSMOSKIN</span><strong class="cs-mobile-v1-menu-title">Menü</strong></div><button type="button" class="cs-mobile-v1-menu-close" data-cs-close aria-label="Menüyü kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div><div class="cs-mobile-v1-sheet-body cs-mobile-v1-sheet-body--menu"><nav class="cs-mobile-v1-menu" aria-label="Menü bağlantıları"><div class="cs-mobile-v1-menu-group"><a href="/index.html"><span>Ana Sayfa</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/allproducts.html"><span>Tüm Ürünler</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/categories.html"><span>Kategoriler</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/brands.html"><span>Markalar</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a></div><div class="cs-mobile-v1-menu-group"><p class="cs-mobile-v1-menu-label">Keşfet</p><a href="/routine.html"><span>Akıllı Rutin</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/cosmoskin-club.html"><span>COSMOSKIN Club</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/favorites.html"><span>Favoriler</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a></div><div class="cs-mobile-v1-menu-group"><p class="cs-mobile-v1-menu-label">Hesap & Destek</p><a href="/cart.html"><span>Sepetim</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/account/profile.html"><span>Hesabım</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/order-tracking.html"><span>Sipariş Takibi</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/teslimat-kargo.html"><span>Teslimat & Kargo</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/iade-degisim.html"><span>İade & Cayma</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a><a href="/contact.html"><span>İletişim</span><svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></a></div></nav><div class="cs-mobile-v1-menu-account" data-cs-menu-account></div></div></aside><aside class="cs-mobile-v1-sheet cs-mobile-v1-sheet--bottom cs-mobile-v1-sheet--search" data-cs-mobile-sheet="search" aria-label="Ürün ara"><span class="cs-mobile-v1-sheet-grip" aria-hidden="true"></span><div class="cs-mobile-v1-search-head"><div class="cs-mobile-v1-search-heading"><span class="cs-mobile-v1-search-kicker">COSMOSKIN</span><strong>Ürün Ara</strong></div><button type="button" class="cs-mobile-v1-search-close" data-cs-close aria-label="Kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div><div class="cs-mobile-v1-sheet-body cs-mobile-v1-sheet-body--search"><form class="cs-mobile-v1-search-form" data-cs-mobile-search><div class="cs-mobile-v1-search-field"><svg class="cs-mobile-v1-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg><input name="q" type="search" placeholder="Ürün, marka veya içerik ara" autocomplete="off" enterkeyhint="search" aria-label="Ürün, marka veya içerik ara"></div><button class="cs-mobile-v1-search-submit" type="submit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg><span>Ara</span></button></form><div class="cs-mobile-v1-search-suggest"><p class="cs-mobile-v1-search-suggest-title">Popüler aramalar</p><div class="cs-mobile-v1-search-chips"><a class="cs-mobile-v1-search-chip" href="/search.html?q=g%C3%BCne%C5%9F%20kremi">Güneş kremi</a><a class="cs-mobile-v1-search-chip" href="/search.html?q=serum">Serum</a><a class="cs-mobile-v1-search-chip" href="/search.html?q=temizleyici">Temizleyici</a><a class="cs-mobile-v1-search-chip" href="/search.html?q=nemlendirici">Nemlendirici</a><a class="cs-mobile-v1-search-chip" href="/search.html?q=tonik">Tonik</a><a class="cs-mobile-v1-search-chip" href="/search.html?q=maske">Maske</a></div><p class="cs-mobile-v1-search-suggest-title">Öne çıkan markalar</p><div class="cs-mobile-v1-search-chips"><a class="cs-mobile-v1-search-chip cs-mobile-v1-search-chip--brand" href="/brands/anua.html">Anua</a><a class="cs-mobile-v1-search-chip cs-mobile-v1-search-chip--brand" href="/brands/cosrx.html">COSRX</a><a class="cs-mobile-v1-search-chip cs-mobile-v1-search-chip--brand" href="/brands/beauty-of-joseon.html">Beauty of Joseon</a><a class="cs-mobile-v1-search-chip cs-mobile-v1-search-chip--brand" href="/brands/round-lab.html">Round Lab</a><a class="cs-mobile-v1-search-chip cs-mobile-v1-search-chip--brand" href="/brands/torriden.html">Torriden</a></div></div></div></aside><aside class="cs-mobile-v1-sheet cs-mobile-v1-sheet--bottom cs-mobile-v1-sheet--filter" data-cs-mobile-sheet="filter" aria-label="Filtrele"><span class="cs-mobile-v1-sheet-grip" aria-hidden="true"></span><div class="cs-mobile-v1-filter-head"><div class="cs-mobile-v1-filter-heading"><span class="cs-mobile-v1-filter-kicker">COSMOSKIN</span><strong>Filtrele</strong></div><button type="button" class="cs-mobile-v1-filter-close" data-cs-close aria-label="Kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div><div class="cs-mobile-v1-sheet-body cs-mobile-v1-sheet-body--filter" data-cs-filter-body></div></aside><aside class="cs-mobile-v1-sheet cs-mobile-v1-sheet--bottom cs-mobile-v1-sheet--cart" data-cs-mobile-sheet="cart" aria-label="Sepet"><span class="cs-mobile-v1-sheet-grip" aria-hidden="true"></span><div class="cs-mobile-v1-cart-head"><div class="cs-mobile-v1-cart-head__copy"><span class="cs-mobile-v1-cart-kicker">COSMOSKIN</span><strong class="cs-mobile-v1-cart-title">Sepet</strong><em class="cs-mobile-v1-cart-count" data-cs-cart-count-label hidden></em></div><button type="button" class="cs-mobile-v1-cart-close" data-cs-close aria-label="Sepeti kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div><div class="cs-mobile-v1-sheet-body cs-mobile-v1-sheet-body--cart" data-cs-cart-body></div></aside>'; while(wrap.firstChild) document.body.appendChild(wrap.firstChild); }
  function updateBadge(){
    var count=cartCount();
    $$('[data-cs-cart-badge]').forEach(function(b){
      b.textContent=String(count);
      b.hidden = count < 1;
      b.classList.toggle('is-wide', count > 9);
      b.setAttribute('aria-hidden', count < 1 ? 'true' : 'false');
    });
  }
  function readJSON(key){ try{ return JSON.parse(localStorage.getItem(key)||'null'); }catch(e){ return null; } }
  function menuProfile(){
    var user = {};
    var u = readJSON('cosmoskin_user'); if(u) user = Object.assign(user, u);
    var p = readJSON('cosmoskin_profile'); if(p) user = Object.assign(user, p);
    var authed = false;
    try {
      for (var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i); if(!k) continue;
        var isAuthKey = k.indexOf('sb-')===0 || k.indexOf('supabase')>-1 || k.indexOf('auth')>-1;
        if(!isAuthKey) continue;
        var parsed = readJSON(k); if(!parsed) continue;
        var au = parsed.user || (parsed.currentSession&&parsed.currentSession.user) || (parsed.session&&parsed.session.user);
        var tok = parsed.access_token || (parsed.currentSession&&parsed.currentSession.access_token) || (parsed.session&&parsed.session.access_token);
        if(tok) authed = true;
        if(au){ authed = true; var meta = au.user_metadata || {}; user = Object.assign(user, { email: au.email||user.email, name: meta.full_name||meta.name||user.name }); }
      }
    } catch(e){}
    if(!authed && (user.email || user.id || user.user_id)) authed = true;
    var first = user.first_name||user.firstName||''; var last = user.last_name||user.lastName||'';
    var composed = (first||last) ? (first+' '+last).trim() : '';
    var name = user.name||user.full_name||user.display_name||composed||'';
    var email = user.email||'';
    return { authed: authed, name: name, email: email };
  }
  function initials(name, email){ var base=(name||'').trim()||(email||'').trim(); if(!base) return 'CS'; var parts=base.replace(/@.*/,'').split(/[\s._-]+/).filter(Boolean); var a=(parts[0]||'')[0]||''; var b=(parts.length>1?parts[parts.length-1][0]:'')||''; return (a+b).toUpperCase()||'CS'; }
  function renderMenuAccount(){
    var host=$('[data-cs-menu-account]'); if(!host) return;
    var p=menuProfile();
    if(p.authed){
      var label=p.name||(p.email? p.email.replace(/@.*/,'') : 'COSMOSKIN üyesi');
      host.innerHTML=''+
        '<a class="cs-mobile-v1-account-card" href="/account/profile.html" aria-label="Hesabım">'+
          '<span class="cs-mobile-v1-account-avatar">'+esc(initials(p.name,p.email))+'</span>'+
          '<span class="cs-mobile-v1-account-meta"><strong>'+esc(label)+'</strong><small>'+esc(p.email||'Hesabımı görüntüle')+'</small></span>'+
          '<svg class="cs-mobile-v1-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>'+
        '</a>'+
        '<button type="button" class="cs-mobile-v1-signout" data-cs-logout>'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12H4.5"/><path d="m8 8.5-3.5 3.5 3.5 3.5"/><path d="M11 4.5h6.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H11"/></svg>'+
          '<span>Çıkış Yap</span>'+
        '</button>';
    } else {
      host.innerHTML=''+
        '<button type="button" class="cs-mobile-v1-signin" data-cs-open-auth="loginPanel">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h10.5"/><path d="m16 8.5 3.5 3.5-3.5 3.5"/><path d="M13 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H13"/></svg>'+
          '<span>Giriş Yap</span>'+
        '</button>'+
        '<a class="cs-mobile-v1-signup-link" href="/account/profile.html" data-cs-open-auth="registerPanel">Hesabın yok mu? <strong>Üye ol</strong></a>';
    }
  }
  function logout(){
    var done=function(){ try{ localStorage.removeItem('cosmoskin_user'); localStorage.removeItem('cosmoskin_profile'); localStorage.removeItem('cosmoskin_account_summary'); }catch(e){} location.href='/index.html'; };
    try {
      var client=window.cosmoskinSupabase;
      if(!client && window.supabase && window.supabase.createClient && window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.supabaseUrl && window.COSMOSKIN_CONFIG.supabaseAnonKey){ client=window.supabase.createClient(window.COSMOSKIN_CONFIG.supabaseUrl, window.COSMOSKIN_CONFIG.supabaseAnonKey); }
      if(client && client.auth && client.auth.signOut){ client.auth.signOut().finally(done); } else { done(); }
    } catch(e){ done(); }
  }
  function readCoupon(){
    try{
      if(window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.readState==='function'){
        var state = window.COSMOSKIN_COUPON.readState();
        if(state && state.code) return state;
      }
      return JSON.parse(localStorage.getItem(COUPON_KEY)||'null');
    }catch(e){ return null; }
  }
  function saveCouponState(coupon){
    try{
      if(!coupon){
        localStorage.removeItem(COUPON_KEY);
        localStorage.removeItem(LEGACY_COUPON_KEY);
        if(window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.clearState==='function') window.COSMOSKIN_COUPON.clearState();
        return;
      }
      localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
      localStorage.setItem(LEGACY_COUPON_KEY, coupon.code || '');
      if(window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.persistState==='function'){
        window.COSMOSKIN_COUPON.persistState(coupon, coupon.code);
      }
    }catch(e){}
  }
  function couponDiscountAmount(sub){
    var coupon = readCoupon();
    if(!coupon || !coupon.code) return 0;
    var min = Number(coupon.minSubtotal || coupon.min_subtotal || 0);
    if(Number(sub || 0) < min) return 0;
    return Math.max(0, Math.min(Number(sub || 0), Math.round(Number(coupon.discountAmount || coupon.discount_amount || 0))));
  }
  async function applyCartCoupon(code){
    code = String(code || '').trim().toUpperCase();
    var feedback = $('[data-cs-cart-coupon-status]');
    if(!code){
      saveCouponState(null);
      if(feedback){ feedback.textContent='Kupon kaldırıldı.'; feedback.className='cs-mobile-v1-cart-coupon__status'; }
      renderCart();
      return;
    }
    if(feedback){ feedback.textContent='Kupon kontrol ediliyor…'; feedback.className='cs-mobile-v1-cart-coupon__status is-pending'; }
    try{
      var result;
      if(window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.validate==='function'){
        result = await window.COSMOSKIN_COUPON.validate({ code: code, cartItems: cartItems() });
      } else {
        var res = await fetch('/api/coupons/validate', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ code: code, cart: cartItems() }) });
        var data = await res.json().catch(function(){ return {}; });
        result = (res.ok && data && data.ok) ? Object.assign({ ok:true, code:code }, data) : { ok:false, message:(data && (data.error||data.message)) || 'Bu kupon şu anda geçerli değil.' };
      }
      if(!result || !result.ok){
        saveCouponState(null);
        if(feedback){ feedback.textContent=result && result.message ? result.message : 'Bu kupon şu anda geçerli değil.'; feedback.className='cs-mobile-v1-cart-coupon__status is-error'; }
        return;
      }
      saveCouponState(Object.assign({ code: code }, result));
      renderCart();
      feedback = $('[data-cs-cart-coupon-status]');
      if(feedback){ feedback.textContent='Kupon uygulandı: '+code; feedback.className='cs-mobile-v1-cart-coupon__status is-success'; }
    }catch(err){
      saveCouponState(null);
      if(feedback){ feedback.textContent='Kupon doğrulanamadı. Lütfen tekrar deneyin.'; feedback.className='cs-mobile-v1-cart-coupon__status is-error'; }
    }
  }
  function renderCart(){
    var body=$('[data-cs-cart-body]'); if(!body) return;
    var items=cartItems();
    var countLabel=$('[data-cs-cart-count-label]');
    var count=cartCount();
    if(countLabel){
      if(count>0){
        countLabel.hidden=false;
        countLabel.textContent=count+' ürün';
      } else {
        countLabel.hidden=true;
        countLabel.textContent='';
      }
    }
    if(!items.length){
      body.innerHTML=''+
        '<div class="cs-mobile-v1-cart-empty">'+
          '<span class="cs-mobile-v1-cart-empty__mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 9.25V7.4a4 4 0 0 1 8 0v1.85"/><path d="M5.75 9.25h12.5l-.85 10.55A1.7 1.7 0 0 1 15.72 21.5H8.28a1.7 1.7 0 0 1-1.68-1.7L5.75 9.25Z"/></svg></span>'+
          '<strong>Sepetin henüz boş</strong>'+
          '<p>Seçilmiş K-Beauty ürünlerini keşfet, sepetine ekle.</p>'+
          '<a class="cs-mobile-v1-cart-cta" href="/allproducts.html">Alışverişe Başla</a>'+
        '</div>';
      return;
    }
    var sub=subtotal();
    var discount=couponDiscountAmount(sub);
    var ship=sub-discount>=2500?0:89;
    var total=Math.max(0, sub-discount+ship);
    var coupon=readCoupon();
    var couponCode=coupon && coupon.code ? String(coupon.code) : '';
    var freeShipRemain=Math.max(0, 2500-(sub-discount));
    body.innerHTML=''+
      '<div class="cs-mobile-v1-cart-studio">'+
        '<div class="cs-mobile-v1-cart-items">'+items.map(function(i, idx){
          var slug=esc(i.slug||i.id||'');
          var qty=Number(i.qty||i.quantity||1);
          var line=Number(i.price||0)*qty;
          return ''+
            '<article class="cs-mobile-v1-cart-item" style="--cs-cart-i:'+idx+'">'+
              '<a class="cs-mobile-v1-cart-item__media" href="'+esc(i.url||('/products/'+slug+'.html'))+'">'+
                '<img src="'+esc(i.image||'/assets/logo-mark.png')+'" alt="'+esc(i.name||'Ürün')+'" loading="lazy">'+
              '</a>'+
              '<div class="cs-mobile-v1-cart-item__body">'+
                '<div class="cs-mobile-v1-cart-item__top">'+
                  '<div class="cs-mobile-v1-cart-item__copy">'+
                    '<small>'+esc(i.brand||'COSMOSKIN')+'</small>'+
                    '<strong>'+esc(i.name||'COSMOSKIN ürünü')+'</strong>'+
                  '</div>'+
                  '<b class="cs-mobile-v1-cart-item__price">'+fmt(line)+'</b>'+
                '</div>'+
                '<div class="cs-mobile-v1-cart-item__actions">'+
                  '<div class="cs-mobile-v1-qty" role="group" aria-label="Adet">'+
                    '<button type="button" data-cs-cart-qty="-1" data-slug="'+slug+'" aria-label="Azalt">−</button>'+
                    '<span aria-live="polite">'+qty+'</span>'+
                    '<button type="button" data-cs-cart-qty="1" data-slug="'+slug+'" aria-label="Artır">+</button>'+
                  '</div>'+
                  '<button type="button" class="cs-mobile-v1-cart-remove" data-cs-cart-remove="'+slug+'">Kaldır</button>'+
                '</div>'+
              '</div>'+
            '</article>';
        }).join('')+'</div>'+
        '<div class="cs-mobile-v1-cart-dock">'+
          (freeShipRemain>0
            ? '<p class="cs-mobile-v1-cart-shipnote"><span></span>Ücretsiz kargoya <strong>'+fmt(freeShipRemain)+'</strong> kaldı</p>'
            : '<p class="cs-mobile-v1-cart-shipnote is-free"><span></span>Bu sepette kargo ücretsiz</p>')+
          '<div class="cs-mobile-v1-cart-coupon">'+
            '<label for="csMobileCartCoupon">İndirim kodu</label>'+
            '<div class="cs-mobile-v1-cart-coupon__row">'+
              '<input id="csMobileCartCoupon" type="text" value="'+esc(couponCode)+'" placeholder="Kodunu gir" autocomplete="off" autocapitalize="characters" spellcheck="false">'+
              '<button type="button" class="cs-mobile-v1-cart-coupon__apply" data-cs-cart-coupon-apply>Uygula</button>'+
            '</div>'+
            (couponCode ? '<button type="button" class="cs-mobile-v1-cart-coupon__clear" data-cs-cart-coupon-clear>Kuponu kaldır</button>' : '')+
            '<div class="cs-mobile-v1-cart-coupon__status'+(couponCode?' is-success':'')+'" data-cs-cart-coupon-status role="status" aria-live="polite">'+(couponCode ? ('Aktif: '+esc(couponCode)) : '')+'</div>'+
          '</div>'+
          '<div class="cs-mobile-v1-cart-totals" aria-label="Sipariş özeti">'+
            '<div class="cs-mobile-v1-cart-summary-row"><span>Ara toplam</span><strong>'+fmt(sub)+'</strong></div>'+
            (discount ? '<div class="cs-mobile-v1-cart-summary-row is-discount"><span>İndirim</span><strong>-'+fmt(discount)+'</strong></div>' : '')+
            '<div class="cs-mobile-v1-cart-summary-row"><span>Kargo</span><strong>'+(ship?fmt(ship):'Ücretsiz')+'</strong></div>'+
            '<div class="cs-mobile-v1-cart-summary-row is-total"><span>Toplam</span><strong>'+fmt(total)+'</strong></div>'+
          '</div>'+
          '<a class="cs-mobile-v1-cart-cta" href="/checkout.html">Ödemeye Geç</a>'+
          '<p class="cs-mobile-v1-cart-trust">Güvenli ödeme · Orijinal ürün · 14 gün cayma</p>'+
        '</div>'+
      '</div>';
  }
  function changeQty(slug, delta){ var items=cartItems().map(function(i){ if((i.slug||i.id)===slug){ i.qty=Math.max(1, Number(i.qty||i.quantity||1)+delta); i.quantity=i.qty; } return i; }); saveCart(items); renderCart(); }
  function removeItem(slug){ saveCart(cartItems().filter(function(i){ return (i.slug||i.id)!==slug; })); renderCart(); }
  function plpToolbar(){ if(!/^(listing|favorites)$/.test(route())) return; if($('.cs-allproducts')) return; var grid=$('.product-grid, .products-grid, .cs-ap-grid, .collection-grid'); if(!grid || $('.cs-mobile-v1-plpbar')) return; var bar=document.createElement('div'); bar.className='cs-mobile-v1-plpbar'; bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Filtre ve sıralama'); bar.innerHTML='<button type="button" class="cs-mobile-v1-plpbar__btn" data-cs-open="filter">'+svg.filter+'<span>Filtrele</span></button><label class="cs-mobile-v1-plpbar__sort"><span class="cs-mobile-v1-plpbar__sort-ico" aria-hidden="true">'+svg.sort+'</span><select aria-label="Sırala" data-cs-sort><option value="featured">Öne çıkan</option><option value="price-asc">Fiyat artan</option><option value="price-desc">Fiyat azalan</option><option value="name">Ürün adı</option></select><span class="cs-mobile-v1-plpbar__chev" aria-hidden="true"></span></label>'; grid.parentNode.insertBefore(bar, grid); }
  function productCards(){ return $$('.product-card, .cs-static-product-card'); }
  function cardPrice(card){ var btn=$('[data-add-cart]', card); if(btn && btn.dataset.price) return Number(btn.dataset.price||0); var text=(card.textContent||'').replace(/\./g,'').replace(/,/g,'.'); var m=text.match(/₺\s*([0-9.]+)/); return m?Number(m[1]):0; }
  function renderFilter(){
    var body=$('[data-cs-filter-body]'); if(!body) return;
    var brands=[];
    productCards().forEach(function(card){
      var b=card.dataset.brand || ($('.brandline',card)||{}).textContent || '';
      b=b.trim();
      if(b && brands.indexOf(b)===-1) brands.push(b);
    });
    brands.sort();
    var activeCount=(filterState.brand?1:0)+(filterState.stock?1:0);
    body.innerHTML=''+
      '<div class="cs-mobile-v1-filter">'+
        '<p class="cs-mobile-v1-filter__lede">Katalogu marka ve stok durumuna göre sadeleştir.</p>'+
        '<section class="cs-mobile-v1-filter-group" aria-labelledby="csFilterBrandTitle">'+
          '<header class="cs-mobile-v1-filter-group__head">'+
            '<h4 id="csFilterBrandTitle">Marka</h4>'+
            '<span>'+brands.length+' seçenek</span>'+
          '</header>'+
          '<div class="cs-mobile-v1-chipgrid" role="group" aria-label="Marka filtreleri">'+
            '<button type="button" class="cs-mobile-v1-chip '+(!filterState.brand?'is-active':'')+'" data-cs-filter-brand="" aria-pressed="'+(!filterState.brand?'true':'false')+'">Tümü</button>'+
            brands.map(function(b){
              var on=filterState.brand===b;
              return '<button type="button" class="cs-mobile-v1-chip '+(on?'is-active':'')+'" data-cs-filter-brand="'+esc(b)+'" aria-pressed="'+(on?'true':'false')+'">'+esc(b)+'</button>';
            }).join('')+
          '</div>'+
        '</section>'+
        '<section class="cs-mobile-v1-filter-group" aria-labelledby="csFilterStockTitle">'+
          '<header class="cs-mobile-v1-filter-group__head">'+
            '<h4 id="csFilterStockTitle">Stok</h4>'+
          '</header>'+
          '<div class="cs-mobile-v1-chipgrid cs-mobile-v1-chipgrid--stock" role="group" aria-label="Stok filtreleri">'+
            '<button type="button" class="cs-mobile-v1-chip '+(!filterState.stock?'is-active':'')+'" data-cs-filter-stock="" aria-pressed="'+(!filterState.stock?'true':'false')+'">Tümü</button>'+
            '<button type="button" class="cs-mobile-v1-chip '+(filterState.stock==='in'?'is-active':'')+'" data-cs-filter-stock="in" aria-pressed="'+(filterState.stock==='in'?'true':'false')+'">Stokta olanlar</button>'+
          '</div>'+
        '</section>'+
        '<div class="cs-mobile-v1-sheet-actions">'+
          '<button type="button" class="cs-mobile-v1-filter-clear" data-cs-filter-clear>Temizle</button>'+
          '<button type="button" class="cs-mobile-v1-filter-apply" data-cs-filter-apply>Uygula'+(activeCount?' <em>'+activeCount+'</em>':'')+'</button>'+
        '</div>'+
      '</div>';
  }
  function applyFilter(){ var visible=0; productCards().forEach(function(card){ var b=(card.dataset.brand || ($('.brandline',card)||{}).textContent || '').trim(); var text=(card.textContent||'').toLowerCase(); var out=/stokta yok|tükendi|bildir/i.test(text); var show=(!filterState.brand || b===filterState.brand) && (!filterState.stock || !out); card.style.display=show?'':'none'; if(show) visible++; }); var count=$('[data-cs-product-count], .product-count, .cs-ap-count'); if(count) count.textContent=visible+' ürün'; }
  function sortCards(value){ var grid=$('.product-grid, .products-grid, .cs-ap-grid, .collection-grid'); if(!grid) return; var cards=productCards().filter(function(c){return c.parentNode===grid;}); cards.sort(function(a,b){ if(value==='price-asc') return cardPrice(a)-cardPrice(b); if(value==='price-desc') return cardPrice(b)-cardPrice(a); if(value==='name') return (a.textContent||'').localeCompare(b.textContent||'','tr'); return 0; }); cards.forEach(function(c){ grid.appendChild(c); }); }
  function passwordToggles(){ $$('input[type="password"]').forEach(function(input){ if(input.dataset.csMobilePw) return; if(input.closest('.cs-security-pass')) { input.dataset.csMobilePw='1'; return; } input.dataset.csMobilePw='1'; var wrap=document.createElement('span'); wrap.className='cs-password-wrap'; input.parentNode.insertBefore(wrap,input); wrap.appendChild(input); var btn=document.createElement('button'); btn.type='button'; btn.className='cs-password-toggle'; btn.textContent='Göster'; btn.setAttribute('aria-label','Şifreyi göster'); btn.addEventListener('click',function(){ var visible=input.type==='text'; input.type=visible?'password':'text'; btn.textContent=visible?'Göster':'Gizle'; btn.setAttribute('aria-label', visible?'Şifreyi göster':'Şifreyi gizle'); }); wrap.appendChild(btn); }); }
  function accountTabs(){ /* Tab switching owned by account-dashboard.js — avoid double handlers */ }
  function normalizeRoutineLinks(){ $$('a[href="/account/routines/"], a[href="/collections/routine.html"], a[href="/routine.html"], a[href="/rutinler.html"]').forEach(function(a){ a.setAttribute('href','/routine.html'); }); }
  function checkoutMobile(){
    if (route() !== 'checkout') return;
    document.body.classList.add('cs-checkout-mobile');
    $$('.cs-mobile-v1-checkout-note').forEach(function (el) { el.remove(); });
    var summary = $('#csCheckoutSummary');
    if (summary) summary.classList.remove('is-collapsed');
    var toggle = $('#csCheckoutSummaryToggle');
    if (toggle) {
      toggle.hidden = true;
      toggle.setAttribute('aria-hidden', 'true');
    }
    var trust = $('#csCheckoutTrust');
    if (trust) trust.remove();
  }
  var AUTH_CLOSE_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.75 6.75l10.5 10.5M17.25 6.75l-10.5 10.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>';
  function enhanceAuthSheetHead(){
    if (!isMobile()) return;
    var modal = $('#accountModal');
    if (!modal) return;
    var head = $('.modal-head', modal);
    if (!head) return;
    if (head.dataset.csAuthHead !== '1') {
      head.dataset.csAuthHead = '1';
      head.classList.add('cs-auth-sheet-head');
      var closeBtn = head.querySelector('.icon-close');
      if (closeBtn) {
        closeBtn.classList.add('cs-auth-sheet-close');
        closeBtn.setAttribute('aria-label', 'Giriş penceresini kapat');
        if (!closeBtn.querySelector('svg')) closeBtn.innerHTML = AUTH_CLOSE_SVG;
      }
    }
    var copy = head.querySelector('div');
    var h2 = copy && copy.querySelector('h2');
    var mini = copy && copy.querySelector('.account-mini');
    if (h2) {
      h2.className = 'cs-auth-sheet-heading';
      h2.innerHTML = '<span class="cs-auth-sheet-brand">COSMOSKIN</span><span class="cs-auth-sheet-title">Hesap</span>';
    }
    if (mini) mini.classList.add('cs-auth-sheet-lede');
  }
  function openAuthSheet(tab){
    var panel = tab === 'registerPanel' || tab === 'register' || tab === 'signup' ? 'registerPanel' : 'loginPanel';
    closePanel(false);
    hoistOverlays();
    var cart = $('#cartDrawer');
    if (cart) {
      cart.classList.remove('open');
      cart.setAttribute('aria-hidden', 'true');
    }
    window.setTimeout(function(){
      try { sessionStorage.setItem('cosmoskin_return_to', location.pathname + location.search + location.hash); } catch(e){}
      if (typeof window.COSMOSKIN_OPEN_AUTH === 'function') {
        window.COSMOSKIN_OPEN_AUTH(panel);
        return;
      }
      document.dispatchEvent(new CustomEvent('cosmoskin:open-auth', { detail: { tab: panel } }));
      document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: { tab: panel } }));
      var modal = $('#accountModal');
      if (!modal) {
        var next = encodeURIComponent(location.pathname + location.search + location.hash);
        location.href = '/index.html?auth=' + (panel === 'registerPanel' ? 'register' : 'login') + '&next=' + next;
      }
    }, 120);
  }
  var TAB_NAV_ITEMS = [
    { href: '/index.html', key: 'home' },
    { href: '/categories.html', key: 'listing' },
    { href: '/favorites.html', key: 'favorites' },
    { href: '/cart.html', key: 'cart' },
    { href: '/account/profile.html', key: 'account' }
  ];
  var TAB_NAV_MS = 340;
  var tabNavBusy = false;
  function reducedMotion(){ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  var OVERLAY_IDS = {
    backdrop: 1,
    cartDrawer: 1,
    accountDrawer: 1,
    accountModal: 1,
    prefModal: 1,
    legalModal: 1,
    mobileStickyPdp: 1,
    mobileStickyCheckout: 1
  };
  function isOverlayNode(node){
    if (!node || node.nodeType !== 1) return false;
    if (OVERLAY_IDS[node.id]) return true;
    var cls = node.classList;
    return cls.contains('modal') || cls.contains('drawer') || cls.contains('backdrop') || cls.contains('mobile-sticky-pdp') || cls.contains('mobile-sticky-checkout');
  }
  function isShellNode(node){
    if (!node || node.nodeType !== 1) return false;
    if (node.id === 'cs-mobile-v1-page-stage') return true;
    if (isOverlayNode(node)) return true;
    var cls = node.classList;
    return cls.contains('cs-mobile-v1-header') || cls.contains('cs-mobile-v1-bottom-nav') || cls.contains('cs-mobile-v1-backdrop') || cls.contains('cs-mobile-v1-sheet');
  }
  function hoistOverlays(){
    // Keep drawers/modals on <body> so position:fixed stays viewport-relative.
    // Page-stage uses transform/will-change, which otherwise traps fixed overlays
    // and makes focus() scroll the PDP to the bottom (cart drawer visible under auth).
    var stage = $('#cs-mobile-v1-page-stage');
    if (!stage) return;
    Array.prototype.slice.call(stage.children).forEach(function(child){
      if (!isOverlayNode(child)) return;
      document.body.appendChild(child);
    });
  }
  function tabPathIndex(path){
    var p = String(path || location.pathname).split('?')[0].split('#')[0];
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    if (!p || p === '/') return 0;
    if (p === '/index.html' || /\/index\.html$/.test(p)) return 0;
    if (p === '/categories.html' || /\/categories\.html$/.test(p)) return 1;
    if (p === '/favorites.html' || /\/favorites\.html$/.test(p)) return 2;
    if (p === '/cart.html' || /\/cart\.html$/.test(p)) return 3;
    if (p === '/account/profile.html' || /\/account\/profile\.html$/.test(p)) return 4;
    return -1;
  }
  function tabHrefIndex(href){
    try { return tabPathIndex(new URL(href, location.origin).pathname); } catch (e) { return tabPathIndex(href); }
  }
  function tabDirection(fromIdx, toIdx){ return toIdx > fromIdx ? 'forward' : 'back'; }
  function ensurePageStage(){
    var stage = $('#cs-mobile-v1-page-stage');
    if (stage) {
      hoistOverlays();
      return stage;
    }
    stage = document.createElement('div');
    stage.id = 'cs-mobile-v1-page-stage';
    stage.className = 'cs-mobile-v1-page-stage';
    document.body.appendChild(stage);
    Array.prototype.slice.call(document.body.children).forEach(function(child){
      if (child === stage || isShellNode(child)) return;
      stage.appendChild(child);
    });
    hoistOverlays();
    return stage;
  }
  function rememberTabIndex(){
    var idx = tabPathIndex(location.pathname);
    if (idx < 0) return;
    try { sessionStorage.setItem('cs_mobile_tab_idx', String(idx)); } catch (e) {}
  }
  function resolveTabEnterDirection(){
    var curr = tabPathIndex(location.pathname);
    if (curr < 0) return;
    var flagged = false;
    try { flagged = sessionStorage.getItem('cs_mobile_tab_nav') === '1'; } catch (e) {}
    if (flagged) return;
    var prev = -1;
    try { prev = Number(sessionStorage.getItem('cs_mobile_tab_idx')); } catch (e) {}
    if (isNaN(prev) || prev < 0 || prev === curr) return;
    try {
      sessionStorage.setItem('cs_mobile_tab_nav', '1');
      sessionStorage.setItem('cs_mobile_tab_dir', tabDirection(prev, curr));
    } catch (e) {}
  }
  function playTabEnterAnimation(){
    if (reducedMotion()) return;
    var flagged = false;
    var dir = 'forward';
    try {
      flagged = sessionStorage.getItem('cs_mobile_tab_nav') === '1';
      dir = sessionStorage.getItem('cs_mobile_tab_dir') || 'forward';
      sessionStorage.removeItem('cs_mobile_tab_nav');
      sessionStorage.removeItem('cs_mobile_tab_dir');
    } catch (e) {}
    if (!flagged) return;
    var stage = $('#cs-mobile-v1-page-stage');
    if (!stage) return;
    stage.classList.add('cs-mobile-tab-enter', 'cs-mobile-tab-enter--' + (dir === 'back' ? 'back' : 'forward'));
    void stage.offsetWidth;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        stage.classList.add('cs-mobile-tab-enter-active');
        window.setTimeout(function(){
          stage.classList.remove('cs-mobile-tab-enter', 'cs-mobile-tab-enter-active', 'cs-mobile-tab-enter--forward', 'cs-mobile-tab-enter--back');
        }, TAB_NAV_MS + 40);
      });
    });
  }
  function setBottomNavActive(index, animate){
    var links = $$('.cs-mobile-v1-bottom-nav [data-cs-tab-nav]');
    links.forEach(function(link, i){
      link.classList.toggle('is-active', i === index);
      if (i === index) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    updateTabIndicator(index, animate);
  }
  function navigateTab(href, toIdx, fromIdx){
    if (tabNavBusy || toIdx < 0 || toIdx === fromIdx) return;
    closePanel(false);
    var dir = tabDirection(fromIdx, toIdx);
    if (toIdx === 2) {
      try { sessionStorage.setItem('cs_mobile_heart_burst', '1'); } catch (e) {}
    }
    if (reducedMotion()) {
      try {
        sessionStorage.setItem('cs_mobile_tab_idx', String(toIdx));
        sessionStorage.setItem('cs_mobile_tab_nav', '1');
        sessionStorage.setItem('cs_mobile_tab_dir', dir);
      } catch (e) {}
      location.href = href;
      return;
    }
    tabNavBusy = true;
    setBottomNavActive(toIdx, true);
    var stage = $('#cs-mobile-v1-page-stage');
    if (stage) {
      stage.classList.remove('cs-mobile-tab-exit', 'cs-mobile-tab-exit--forward', 'cs-mobile-tab-exit--back');
      stage.classList.add('cs-mobile-tab-exit', 'cs-mobile-tab-exit--' + dir);
      void stage.offsetWidth;
    }
    document.body.classList.add('cs-mobile-tab-navigating');
    window.setTimeout(function(){
      try {
        sessionStorage.setItem('cs_mobile_tab_idx', String(fromIdx));
        sessionStorage.setItem('cs_mobile_tab_nav', '1');
        sessionStorage.setItem('cs_mobile_tab_dir', dir);
        if (toIdx === 2) sessionStorage.setItem('cs_mobile_heart_burst', '1');
      } catch (e) {}
      location.href = href;
    }, TAB_NAV_MS);
  }
  var tabNavBound = false;
  function bindTabNavigation(){
    if (tabNavBound) return;
    tabNavBound = true;
    document.addEventListener('click', function(e){
      var link = e.target.closest('[data-cs-tab-nav]');
      if (!link || !isMobile() || tabNavBusy) return;
      var href = link.getAttribute('href');
      if (!href) return;
      var toIdx = tabHrefIndex(href);
      var fromIdx = tabPathIndex(location.pathname);
      if (toIdx < 0) return;
      if (toIdx === fromIdx) {
        e.preventDefault();
        closePanel(false);
        try {
          window.scrollTo({ top: 0, left: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
        } catch (err) {
          window.scrollTo(0, 0);
        }
        return;
      }
      if (fromIdx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      navigateTab(href, toIdx, fromIdx);
    }, true);
    window.addEventListener('pageshow', function(ev){
      tabNavBusy = false;
      document.body.classList.remove('cs-mobile-tab-navigating');
      var idx = tabPathIndex(location.pathname);
      if (idx >= 0) setBottomNavActive(idx, false);
      if (ev.persisted) playTabEnterAnimation();
    });
  }
  function bind(){ document.addEventListener('click', function(e){ var authOpen=e.target.closest('[data-cs-open-auth]'); if(authOpen){ e.preventDefault(); openAuthSheet(authOpen.getAttribute('data-cs-open-auth') || 'loginPanel'); return; } var open=e.target.closest('[data-cs-open]'); if(open){ e.preventDefault(); openPanel(open.getAttribute('data-cs-open'), open); return; } if(e.target.closest('[data-cs-close]')){ e.preventDefault(); closePanel(); return; } if(e.target.closest('[data-cs-logout]')){ e.preventDefault(); logout(); return; } var rm=e.target.closest('[data-cs-cart-remove]'); if(rm){ removeItem(rm.getAttribute('data-cs-cart-remove')); return; } var qty=e.target.closest('[data-cs-cart-qty]'); if(qty){ changeQty(qty.getAttribute('data-slug'), Number(qty.getAttribute('data-cs-cart-qty'))); return; } if(e.target.closest('[data-cs-cart-coupon-apply]')){ var input=$('#csMobileCartCoupon'); applyCartCoupon(input && input.value); return; } if(e.target.closest('[data-cs-cart-coupon-clear]')){ saveCouponState(null); renderCart(); return; } var brand=e.target.closest('[data-cs-filter-brand]'); if(brand){ filterState.brand=brand.getAttribute('data-cs-filter-brand')||''; renderFilter(); return; } var stock=e.target.closest('[data-cs-filter-stock]'); if(stock){ filterState.stock=stock.getAttribute('data-cs-filter-stock')||''; renderFilter(); return; } if(e.target.closest('[data-cs-filter-clear]')){ filterState={brand:'',stock:'',query:''}; applyFilter(); renderFilter(); return; } if(e.target.closest('[data-cs-filter-apply]')){ applyFilter(); closePanel(); return; } if(e.target.closest('[data-add-cart]')){ setTimeout(function(){ updateBadge(); if(isMobile()) openPanel('cart'); },180); } }); document.addEventListener('submit', function(e){ var sf=e.target.closest('[data-cs-mobile-search]'); if(sf){ e.preventDefault(); var q=sf.querySelector('input[name="q"]').value.trim(); location.href='/search.html'+(q?'?q='+encodeURIComponent(q):''); } }); document.addEventListener('change', function(e){ if(e.target.matches('[data-cs-sort]')) sortCards(e.target.value); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape') closePanel(); if(e.key==='Enter' && e.target && e.target.id==='csMobileCartCoupon'){ e.preventDefault(); applyCartCoupon(e.target.value); } }); ['cosmoskin:cart-updated','storage'].forEach(function(ev){ window.addEventListener(ev,function(){ updateBadge(); if(activePanel==='cart') renderCart(); }); document.addEventListener(ev,function(){ updateBadge(); if(activePanel==='cart') renderCart(); }); }); }
  function initSpotlightStories(){
    var root = document.querySelector('[data-cs-spotlight-stories]');
    if(!root || root.dataset.csSpotBound === '1') return;
    root.dataset.csSpotBound = '1';
    var stories = Array.prototype.slice.call(root.querySelectorAll('[data-spot-story]'));
    if(!stories.length) return;
    var hint = document.querySelector('.cs-spotlight__scroll-hint');
    var reduce = false;
    try{ reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    var io = null;
    function setActive(el){
      stories.forEach(function(s){
        var on = s === el;
        s.classList.toggle('is-active', on);
        s.classList.toggle('is-visible', on);
      });
    }
    function canSnapScroll(){
      return root.scrollHeight > root.clientHeight + 8;
    }
    function nearest(){
      var rootBox = root.getBoundingClientRect();
      var mid = rootBox.top + rootBox.height * 0.4;
      var best = stories[0], bestDist = Infinity;
      stories.forEach(function(s){
        var b = s.getBoundingClientRect();
        var d = Math.abs((b.top + b.height * 0.3) - mid);
        if(d < bestDist){ bestDist = d; best = s; }
      });
      return best;
    }
    function syncHint(){
      if(!hint) return;
      if(!canSnapScroll()){ hint.style.opacity = '0'; return; }
      var atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 14;
      hint.style.opacity = atEnd ? '0' : '1';
    }
    function refreshMode(){
      if(!canSnapScroll()){
        stories.forEach(function(s){ s.classList.add('is-active','is-visible'); });
        syncHint();
        return;
      }
      setActive(nearest());
      syncHint();
    }
    function onScroll(){
      if(!canSnapScroll()) return;
      setActive(nearest());
      syncHint();
    }
    if('IntersectionObserver' in window){
      io = new IntersectionObserver(function(entries){
        if(!canSnapScroll()) return;
        var top = null, topRatio = 0;
        entries.forEach(function(entry){
          if(entry.isIntersecting && entry.intersectionRatio >= topRatio){
            topRatio = entry.intersectionRatio;
            top = entry.target;
          }
        });
        if(top) setActive(top);
      },{ root: root, threshold: [0.35, 0.55, 0.75] });
      stories.forEach(function(s){ io.observe(s); });
    }
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', refreshMode, { passive: true });
    if(hint) hint.style.transition = reduce ? 'none' : 'opacity .35s ease';
    refreshMode();
    requestAnimationFrame(refreshMode);
  }
  function routeClasses(){ var r=route(); document.body.classList.add('cs-route-'+r); if(r==='listing'||r==='favorites') document.body.classList.add('cs-route-listing'); if(r==='pdp') document.body.classList.add('cs-route-pdp'); if(r==='account') document.body.classList.add('cs-route-account'); }
  function init(){ window.__COSMOSKIN_MOBILE_V1_ACTIVE__ = true; normalizeCouponStorage(); normalizeRoutineLinks(); initSpotlightStories(); if(!isMobile()) return; document.body.classList.add('cs-mobile-v1-active'); ensurePageStage(); resolveTabEnterDirection(); routeClasses(); mobileAnnouncement(); header(); bottomNav(); sheets(); mobileFooter(); mobileFaq(); mobileSmartRoutine(); mobileContentPages(); playTabEnterAnimation(); maybeFavoritesHeartBurst(); plpToolbar(); passwordToggles(); accountTabs(); checkoutMobile(); enhanceAuthSheetHead(); updateBadge(); applyFilter(); bind(); bindTabNavigation(); rememberTabIndex(); document.addEventListener('cosmoskin:open-auth', enhanceAuthSheetHead); document.addEventListener('cosmoskin:open-auth-modal', enhanceAuthSheetHead); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('resize', function(){ if(isMobile() && !document.body.classList.contains('cs-mobile-v1-active')) init(); });
})();
