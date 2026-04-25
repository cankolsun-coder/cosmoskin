/* COSMOSKIN — Mobile v7 */
(function(){
'use strict';

var SVG = {
  srch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></svg>',
  qr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="16" y="16" width="2" height="2"/><rect x="20" y="16" width="2" height="2"/><rect x="16" y="20" width="2" height="2"/><rect x="20" y="20" width="2" height="2"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="15" y2="17"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C12 21 4 15.5 4 9.5a4 4 0 0 1 8 0 4 4 0 0 1 8 0C20 15.5 12 21 12 21z"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><path d="m13 6 6 6-6 6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h11v10H2z"/><path d="M13 10h5l3 3v4h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  speed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 18 0"/><path d="M12 12l4-3"/><circle cx="12" cy="12" r="1.5"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  rotate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14H4v5"/><path d="M4 14a8 8 0 0 0 14 4"/><path d="M15 10h5V5"/><path d="M20 10A8 8 0 0 0 6 6"/></svg>',
  skincare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a8 8 0 0 0-8 8c0 5 4 9 8 10 4-1 8-5 8-10a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/></svg>',
  serum:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6v3l1 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7l1-2z"/><path d="M9 9h6"/><circle cx="12" cy="14" r="1.5"/></svg>',
  spf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M16.9 16.9l1.5 1.5M5.6 18.4l1.4-1.4M16.9 7.1l1.5-1.5"/></svg>',
  toner:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8v3l1 1v13a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V7l1-1z"/><path d="M12 11v5"/></svg>',
  mask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8c0-2 4-4 8-4s8 2 8 4-2 12-8 12S4 10 4 8z"/><circle cx="9" cy="11" r=".8"/><circle cx="15" cy="11" r=".8"/></svg>',
  cream:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M5 9V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg>',
  set:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="10" width="8" height="12" rx="1"/><rect x="11" y="5" width="8" height="17" rx="1"/><rect x="20" y="14" width="0" height="0"/></svg>'
};

var CATS = [
  {label:'Temizleyici', icon:'skincare', href:'/collections/cleanse.html'},
  {label:'Tonik',       icon:'toner',    href:'/collections/hydrate.html'},
  {label:'Serum',       icon:'serum',    href:'/collections/treat.html'},
  {label:'Krem',        icon:'cream',    href:'/collections/care.html'},
  {label:'Maske',       icon:'mask',     href:'/collections/masks.html'},
  {label:'SPF',         icon:'spf',      href:'/collections/protect.html'},
  {label:'Set',         icon:'set',      href:'/collections/routine.html'}
];

var TRUST = [
  {icon:'truck',  main:'Ücretsiz', sub:'750 TL üzeri'},
  {icon:'speed',  main:'1-2 Gün',  sub:'Hızlı teslimat'},
  {icon:'shield', main:'Orijinal', sub:'%100 garantili'},
  {icon:'rotate', main:'14 Gün',   sub:'Kolay iade'}
];

var PLACEHOLDERS = [
  'Niacinamide serum ara',
  'Vitamin C ara',
  'COSRX ara',
  'Centella tonik ara',
  'SPF 50 ara',
  'Beauty of Joseon ara'
];

var path = location.pathname;
var isHome = path === '/' || path === '' || path.indexOf('/index') !== -1;
var isMobile = function(){ return window.innerWidth <= 768; };
var qs = function(s,r){ return (r||document).querySelector(s); };
var qsa = function(s,r){ return (r||document).querySelectorAll(s); };

function el(tag, cls, html){
  var n = document.createElement(tag);
  if(cls) n.className = cls;
  if(html != null) n.innerHTML = html;
  return n;
}

/* ── HEADER ── */
function buildHeader(){
  if(qs('.m-header')) return;
  var h = el('header','m-header');
  h.innerHTML =
    '<button class="m-header__menu" aria-label="Menü" type="button">' + SVG.menu + '</button>' +
    '<a class="m-header__logo" href="/index.html" aria-label="Cosmoskin anasayfa">' +
      '<span class="m-header__wordmark">COSMOSKIN</span>' +
    '</a>' +
    '<div class="m-header__tools">' +
      '<button class="m-header__btn" id="mHdrAccount" aria-label="Hesap" type="button">' + SVG.user + '</button>' +
      '<button class="m-header__btn" id="mHdrCart" aria-label="Sepet" type="button">' +
        SVG.bag +
        '<span class="m-header__badge" id="mHdrBadge"></span>' +
      '</button>' +
    '</div>';

  /* Insert after announcement or as first body child */
  var ann = qs('.announcement');
  if(ann) ann.after(h);
  else document.body.prepend(h);

  /* Hamburger → open mobile drawer / existing nav */
  h.querySelector('.m-header__menu').addEventListener('click', function(){
    var drawer = qs('#accountDrawer');
    var bd = qs('#backdrop');
    if(drawer){ drawer.classList.add('open'); if(bd) bd.classList.add('open'); }
  });

  /* Account → existing handler */
  var acBtn = qs('#mHdrAccount');
  acBtn.addEventListener('click', function(){
    var btn = qs('#accountBtn');
    if(btn) btn.click();
  });

  /* Cart → existing handler */
  var cartBtn = qs('#mHdrCart');
  cartBtn.addEventListener('click', function(){
    var btn = qs('#cartBtn');
    if(btn){ btn.click(); return; }
    var drawer = qs('#cartDrawer');
    var bd = qs('#backdrop');
    if(drawer){ drawer.classList.add('open'); if(bd) bd.classList.add('open'); }
  });
}

/* ── SEARCH BAR ── */
var _phIdx = 0, _phTimer = null;
function rotatePlaceholder(span){
  _phTimer = setInterval(function(){
    span.style.opacity = '0';
    setTimeout(function(){
      _phIdx = (_phIdx + 1) % PLACEHOLDERS.length;
      span.textContent = PLACEHOLDERS[_phIdx];
      span.style.opacity = '1';
    }, 300);
  }, 3000);
}

function buildSearchBar(){
  if(qs('.m-search-bar')) return;
  if(path.indexOf('/search') !== -1) return;
  var header = qs('.m-header');
  if(!header) return;

  var bar = el('div','m-search-bar');
  bar.innerHTML =
    '<a class="m-search-bar__inner" href="/search.html" aria-label="Ara">' +
      SVG.srch.replace('<svg','<svg class="m-search-bar__icon"') +
      '<span class="m-search-bar__placeholder">' + PLACEHOLDERS[0] + '</span>' +
      '<span class="m-search-bar__qr" aria-label="QR ile ara">' + SVG.qr + '</span>' +
    '</a>';

  header.after(bar);
  rotatePlaceholder(bar.querySelector('.m-search-bar__placeholder'));
}

/* ── CATEGORIES ── */
function buildCategories(){
  if(qs('.m-categories') || !isHome) return;
  var bar = qs('.m-search-bar');
  if(!bar) return;

  var wrap = el('nav','m-categories');
  wrap.setAttribute('aria-label','Kategori kısayolları');
  var track = el('div','m-categories__track');

  CATS.forEach(function(c){
    var a = el('a','m-cat');
    a.href = c.href;
    a.setAttribute('aria-label', c.label);
    a.innerHTML =
      '<div class="m-cat__circle">' + SVG[c.icon] + '</div>' +
      '<div class="m-cat__label">' + c.label + '</div>';
    track.appendChild(a);
  });

  wrap.appendChild(track);
  bar.after(wrap);
}

/* ── TRUST BAR ── */
function buildTrust(){
  if(qs('.m-trust') || !isHome) return;
  var hero = qs('.hero-premium, .hero, section.hero');
  if(!hero) return;

  var bar = el('div','m-trust');
  bar.setAttribute('aria-label','Alışveriş güvencesi');

  TRUST.forEach(function(t){
    var item = el('div','m-trust__item');
    item.innerHTML =
      '<div class="m-trust__icon">' + SVG[t.icon] + '</div>' +
      '<div class="m-trust__main">' + t.main + '</div>' +
      '<div class="m-trust__sub">' + t.sub + '</div>';
    bar.appendChild(item);
  });

  hero.after(bar);
}

/* ── HERO DOTS (slider indicator) ── */
function buildHeroDots(){
  if(!isHome) return;
  var stage = qs('.hero-premium__stage');
  if(!stage || qs('.hero-premium__dots')) return;
  var dots = el('div','hero-premium__dots');
  dots.innerHTML = '<span class="is-active"></span><span></span><span></span><span></span>';
  stage.appendChild(dots);
}

/* ── ROUTINE: REPLACE OLD UI WITH TABS ── */
function buildRoutineTabs(){
  if(!isHome) return;
  var section = qs('.home-routine');
  if(!section || qs('.m-routine-tabs')) return;

  /* Find product data from products-data.js */
  var products = window.COSMOSKIN_PRODUCTS || [];

  /* Morning routine products */
  var morningSteps = [
    {label:'Temizle', slug:'round-lab-1025-dokdo-cleanser'},
    {label:'Ton Eşitle', slug:'torriden-dive-in-hyaluronic-acid-serum'},
    {label:'Koru', slug:'beauty-of-joseon-relief-sun-spf50'}
  ];
  var eveningSteps = [
    {label:'Temizle', slug:'cosrx-low-ph-good-morning-gel-cleanser'},
    {label:'Tedavi Et', slug:'beauty-of-joseon-glow-serum-propolis-niacinamide'},
    {label:'Nemlendir', slug:'torriden-solid-in-ceramide-cream'}
  ];

  function getProduct(slug){
    return products.find(function(p){ return p.id === slug || (p.url && p.url.indexOf(slug) !== -1); }) || null;
  }

  function buildStepEl(step){
    var p = getProduct(step.slug);
    var a = el('a','m-routine-step');
    a.href = p ? p.url : '#';
    a.innerHTML =
      '<div class="m-routine-step__num">' +
        /* filled circle with number */
      '</div>' +
      (p
        ? '<img class="m-routine-step__img" src="' + p.image + '" alt="' + (p.name||'') + '" loading="lazy" width="48" height="48"/>'
        : '<div class="m-routine-step__img"></div>') +
      '<div class="m-routine-step__body">' +
        '<div class="m-routine-step__label">' + step.label + '</div>' +
        '<div class="m-routine-step__name">' + (p ? p.name : step.slug) + '</div>' +
        (p ? '<div class="m-routine-step__price">₺' + p.price + '</div>' : '') +
      '</div>' +
      SVG.arrow.replace('<svg','<svg class="m-routine-step__arrow"');
    return a;
  }

  /* Build tabs */
  var tabs = el('div','m-routine-tabs');
  tabs.innerHTML =
    '<button class="m-routine-tab is-active" data-tab="morning" type="button">Sabah Rutini</button>' +
    '<button class="m-routine-tab" data-tab="evening" type="button">Akşam Rutini</button>';

  var stepsWrap = el('div','m-routine-steps');

  function renderSteps(arr, offset){
    stepsWrap.innerHTML = '';
    arr.forEach(function(step, i){
      var node = buildStepEl(step);
      node.querySelector('.m-routine-step__num').textContent = (offset||0) + i + 1;
      stepsWrap.appendChild(node);
    });
  }
  renderSteps(morningSteps, 0);

  tabs.addEventListener('click', function(e){
    var btn = e.target.closest('.m-routine-tab');
    if(!btn) return;
    tabs.querySelectorAll('.m-routine-tab').forEach(function(b){ b.classList.remove('is-active'); });
    btn.classList.add('is-active');
    renderSteps(btn.dataset.tab === 'morning' ? morningSteps : eveningSteps, 0);
  });

  /* Hero copy already exists — just append tabs after hero points */
  var heroPoints = qs('.home-routine__hero-points', section);
  if(heroPoints){
    heroPoints.after(tabs);
    tabs.after(stepsWrap);
  } else {
    var heroDiv = qs('.home-routine__hero', section);
    if(heroDiv){ heroDiv.appendChild(tabs); heroDiv.appendChild(stepsWrap); }
  }
}

/* ── EDITORIAL: inject structure if needed ── */
function buildEditorial(){
  if(!isHome) return;
  var ed = qs('.editorial-showcase');
  if(!ed || qs('.editorial-showcase__copy', ed)) return;

  /* Check for existing img */
  var img = qs('img', ed);
  if(img && !img.classList.contains('editorial-showcase__img')){
    img.className = 'editorial-showcase__img';
    img.style.height = '160px';
    img.style.objectFit = 'cover';
  }

  /* Inject copy block after image */
  var copy = el('div','editorial-showcase__copy');
  copy.innerHTML =
    '<span class="editorial-showcase__eyebrow">Derin Okuma</span>' +
    '<h2 class="editorial-showcase__title">K-Beauty\'nin 10 adımı mı? Aslında 3 yeter.</h2>' +
    '<a class="editorial-showcase__cta" href="/collections/routine.html">' +
      'Rutini keşfet ' + SVG.arrow +
    '</a>';

  if(img) img.after(copy);
  else ed.appendChild(copy);

  /* Remove container padding override */
  var container = qs('.container', ed);
  if(container) container.style.padding = '0';
}

/* ── CART BADGE SYNC (header + bottom nav) ── */
function updateBadges(){
  var count = 0;
  try{
    var cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
    count = cart.reduce(function(s,i){ return s + (i.qty||1); }, 0);
  } catch(e){}

  var hBadge = qs('#mHdrBadge');
  var navBadge = qs('#mNavBadge');
  [hBadge, navBadge].forEach(function(b){
    if(!b) return;
    b.textContent = count > 99 ? '99+' : (count > 0 ? String(count) : '');
    b.classList.toggle('is-on', count > 0);
  });
}

window.addEventListener('cosmoskin:cart-updated', updateBadges);
window.addEventListener('storage', function(e){ if(e.key==='cosmoskin_cart') updateBadges(); });

/* ── CART ADD FEEDBACK ── */
var _toastTimer = null;
function showToast(msg, link, linkLabel){
  var t = qs('.m-toast');
  if(!t) return;
  t.querySelector('.m-toast__msg').textContent = msg;
  var cta = t.querySelector('.m-toast__cta');
  if(cta){ cta.textContent = linkLabel||''; cta.href = link||'#'; }
  t.classList.add('is-on');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ t.classList.remove('is-on'); }, 2400);
}

/* ── BOTTOM NAV ── */
function buildBottomNav(){
  if(qs('.m-bottom-nav')) return;

  var isCat = path.indexOf('/collections/') !== -1 || path.indexOf('/brands/') !== -1;
  var isFav = path.indexOf('/profile') !== -1;

  var nav = el('nav','m-bottom-nav');
  nav.setAttribute('aria-label','Ana gezinme');
  nav.id = 'mBottomNav';

  nav.innerHTML =
    '<a class="m-tab' + (isHome?' is-active':'') + '" href="/index.html" aria-label="Ana Sayfa">' + SVG.home + '<span>Ana Sayfa</span></a>' +
    '<a class="m-tab" href="/search.html" aria-label="Ara" id="mNavSearch">' + SVG.srch + '<span>Ara</span></a>' +
    '<a class="m-tab' + (isCat?' is-active':'') + '" href="/collections/cleanse.html" aria-label="Kategoriler">' + SVG.grid + '<span>Kategoriler</span></a>' +
    '<a class="m-tab' + (isFav?' is-active':'') + '" href="/profile.html#favorites" aria-label="Favoriler">' + SVG.heart + '<span>Favoriler</span></a>' +
    '<button class="m-tab" id="mNavCart" type="button" aria-label="Sepet">' +
      SVG.bag +
      '<span class="m-tab__badge" id="mNavBadge"></span>' +
      '<span>Sepet</span>' +
    '</button>';

  document.body.appendChild(nav);

  /* Toast element */
  if(!qs('.m-toast')){
    var toast = el('div','m-toast');
    toast.innerHTML = '<span class="m-toast__msg"></span><a class="m-toast__cta" href="/checkout.html">Sepete git</a>';
    document.body.appendChild(toast);
  }

  /* Cart button */
  var cartBtn = qs('#mNavCart');
  cartBtn.addEventListener('click', function(){
    var btn = qs('#cartBtn');
    if(btn){ btn.click(); return; }
    var drawer = qs('#cartDrawer');
    var bd = qs('#backdrop');
    if(drawer){ drawer.classList.add('open'); if(bd) bd.classList.add('open'); }
  });

  updateBadges();
}

/* ── ADD-TO-CART BUTTON SVG INJECT ── */
function patchCartButtons(){
  qsa('[data-add-cart]').forEach(function(btn){
    /* Replace text label with bag icon */
    if(!btn.querySelector('svg') && btn.closest('.price-row')){
      btn.innerHTML = SVG.bag.replace('stroke-width="1.7"','stroke-width="1.8"');
      btn.classList.add('btn-add-cart');
    }
  });

  /* Intercept cart add to show toast */
  document.addEventListener('click', function(e){
    var btn = e.target.closest('[data-add-cart]');
    if(!btn) return;
    var name = btn.dataset.name || 'Ürün';
    /* Short success flash on button */
    btn.classList.add('is-done');
    var orig = btn.innerHTML;
    btn.innerHTML = SVG.check;
    setTimeout(function(){
      btn.classList.remove('is-done');
      btn.innerHTML = orig || SVG.bag.replace('stroke-width="1.7"','stroke-width="1.8"');
    }, 1200);
    /* Toast */
    setTimeout(function(){
      showToast(name + ' sepete eklendi', '/checkout.html', 'Sepete git');
      updateBadges();
    }, 100);
    /* Haptic */
    try{ navigator.vibrate(10); } catch(e){}
  }, true);
}

/* ── ADD VOLUME TO PRODUCT CARDS ── */
function patchProductCards(){
  var products = window.COSMOSKIN_PRODUCTS || [];
  if(!products.length) return;

  qsa('.product-card').forEach(function(card){
    /* Already patched */
    if(card.querySelector('.product-volume')) return;

    /* Get slug from link */
    var link = card.querySelector('a[href*="/products/"]');
    if(!link) return;
    var href = link.getAttribute('href');
    var slugMatch = href.match(/products\/([^.]+)\.html/);
    if(!slugMatch) return;
    var slug = slugMatch[1];
    var p = products.find(function(x){ return x.id === slug || x.slug === slug; });
    if(!p || !p.volume) return;

    /* Inject volume after h3 */
    var h3 = card.querySelector('h3');
    if(!h3) return;
    var vol = el('div','product-volume');
    vol.textContent = p.volume;
    h3.after(vol);
  });
}

/* ── KILL LEGACY INJECTIONS ── */
function killLegacy(){
  var KILL = ['.mobile-bottom-nav','.mobile-header-search-btn','.mobile-search-sheet',
    '.mobile-page-pillbar','.mobile-luxe-hero__meta','.mobile-editorial-rail',
    '.mobile-category-shortcuts','.mobile-account-tabs','.mobile-orders-banner',
    '.mobile-checkout-steps','.mobile-sticky-checkout','.mobile-card-accent'];
  KILL.forEach(function(s){ qsa(s).forEach(function(n){ n.remove(); }); });
}

/* ── INIT ── */
function init(){
  if(!isMobile()) return;
  killLegacy();
  buildHeader();
  buildSearchBar();
  buildCategories();
  buildTrust();
  buildHeroDots();
  buildBottomNav();
  patchCartButtons();
  patchProductCards();
  /* Delayed: wait for home-routine JS to run */
  setTimeout(function(){
    buildRoutineTabs();
    buildEditorial();
    patchProductCards();
  }, 600);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('load', function(){
  if(!isMobile()) return;
  killLegacy();
  updateBadges();
  buildRoutineTabs();
  buildEditorial();
  patchProductCards();
});

})();
