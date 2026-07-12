(function(){
  'use strict';
  const $=(s,p=document)=>p.querySelector(s);
  const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));

  function pdpSlug(){
    const el = document.querySelector('main[data-product-slug]');
    const slug = (el && el.getAttribute('data-product-slug')) || window.location.pathname;
    return String(slug || '')
      .trim()
      .replace(/^.*\/products\//, '')
      .replace(/\.html.*$/, '')
      .toLowerCase();
  }

  function fmtTry(amount){
    const n = Number(amount || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    try {
      return new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:0 }).format(n);
    } catch (_error) {
      return '₺' + String(Math.round(n));
    }
  }

  // UX3B — PDP price hydration state. Static HTML prices are skeletoned by CSS
  // (product-page.css) until the authoritative effective price is applied, so
  // customers never see a stale pre-override price flash. If the effective
  // price API fails or returns no row, we reveal the static catalog price as a
  // documented safe fallback (checkout stays server-authoritative regardless);
  // a hard timeout plus a pure-CSS reveal animation guarantee the price can
  // never stay hidden.
  const PRICE_READY_TIMEOUT_MS = 2500;
  let resolvePriceReady;
  const priceReadyPromise = new Promise((resolve) => { resolvePriceReady = resolve; });

  function markPdpPriceReady(reason){
    if (document.documentElement.getAttribute('data-cs-pdp-price-ready') === 'true') return;
    document.documentElement.setAttribute('data-cs-pdp-price-ready', 'true');
    document.documentElement.setAttribute('data-cs-pdp-price-source', String(reason || 'patched'));
    $$('.pdp5-price, .pdp-price, .mobile-sticky-pdp__copy').forEach((node) => {
      node.dataset.priceReady = 'true';
    });
    $$('[data-price-waiting]').forEach((btn) => {
      btn.removeAttribute('data-price-waiting');
      if (!btn.classList.contains('is-stock-disabled')) btn.disabled = false;
    });
    if (typeof resolvePriceReady === 'function') resolvePriceReady(reason || 'patched');
  }

  function holdPdpPurchaseButtons(){
    $$('.pdp-actions [data-add-cart], .pdp5-actions [data-add-cart], #mobileStickyAddBtn, [data-buy-now]').forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.setAttribute('data-price-waiting', 'true');
      btn.disabled = true;
    });
  }

  function patchJsonLdOfferPrice(price, currency){
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      let data;
      try { data = JSON.parse(script.textContent || '{}'); } catch (_error) { continue; }
      const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      const node = graph.find((entry) => entry && entry['@type'] === 'Product');
      if (!node) continue;
      node.offers = node.offers || { '@type': 'Offer' };
      node.offers.price = String(price);
      node.offers.priceCurrency = String(currency || 'TRY');
      script.textContent = JSON.stringify(data);
      return true;
    }
    return false;
  }

  function patchPdpPriceSurfaces(product){
    const PD = window.COSMOSKIN_PRICE_DISPLAY;
    const price = Number(product && (product.price ?? product.effective_price_try ?? product.price_try));
    if (!Number.isFinite(price) || price <= 0) return false;
    const currency = product && (product.effective_currency || product.currency || 'TRY');
    const priceHtml = PD && typeof PD.renderPriceHtml === 'function'
      ? PD.renderPriceHtml(product, { stack: true })
      : null;
    const formatted = fmtTry(price);

    const selectors = [
      '.pdp5-price',
      '.pdp-price',
      '[data-product-price]'
    ];
    selectors.forEach((sel) => {
      $$(sel).forEach((node) => {
        if (node.tagName === 'META') return;
        // UX3B: #reviewsSection carries data-product-price as widget DATA (set
        // below). Injecting price markup into it rendered a stray duplicate
        // "₺…" label right under the recommendations section. Never treat the
        // reviews shell (or anything inside it) as a price display slot.
        if (node.id === 'reviewsSection' || node.closest('#reviewsSection')) return;
        if (priceHtml) node.innerHTML = priceHtml;
        else node.textContent = formatted || node.textContent;
        node.dataset.effectivePriceApplied = 'true';
        node.dataset.priceReady = 'true';
      });
    });

    const stickyWrap = document.querySelector('.mobile-sticky-pdp__copy');
    if (stickyWrap) {
      const stickyTarget = stickyWrap.querySelector('.cs-price, strong');
      if (priceHtml && stickyTarget) stickyTarget.outerHTML = priceHtml;
      else if (stickyTarget) stickyTarget.textContent = formatted || stickyTarget.textContent;
      stickyWrap.dataset.effectivePriceApplied = 'true';
      stickyWrap.dataset.priceReady = 'true';
    }
    // Sticky PDP price anchor: .mobile-sticky-pdp__copy strong

    $$('[data-add-cart], [data-buy-now], .pdp5-favorite, [data-favorite-id]').forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      if (btn.dataset) {
        btn.dataset.price = String(price);
        btn.dataset.effectivePriceApplied = 'true';
      }
    });

    const reviewsShell = document.getElementById('reviewsSection');
    if (reviewsShell) {
      reviewsShell.setAttribute('data-product-price', String(price));
      reviewsShell.dataset.effectivePriceApplied = 'true';
    }

    patchJsonLdOfferPrice(price, currency);
    markPdpPriceReady('patched');
    return true;
  }

  async function loadEffectivePriceForSlug(slug){
    if (!slug) return null;
    try {
      const res = await fetch('/api/catalog/effective-prices', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const row = data && data.prices ? data.prices[slug] : null;
      if (!row || row.effective_price_try == null) return null;
      return {
        slug,
        price: Number(row.effective_price_try),
        effective_price_try: Number(row.effective_price_try),
        effective_currency: row.effective_currency || 'TRY',
        effective_price_source: row.effective_price_source || 'static',
        base_catalog_price_try: row.base_catalog_price_try,
        regular_price_try: row.regular_price_try,
        sale_price_try: row.sale_price_try,
        compare_at_price_try: row.compare_at_price_try,
        sale_active: Boolean(row.sale_active),
        sale_starts_at: row.sale_starts_at || null,
        sale_ends_at: row.sale_ends_at || null,
        price_display_mode: row.price_display_mode || 'regular',
        has_price_override: Boolean(row.has_price_override),
        price_override_valid: row.price_override_valid !== false,
        price_warning: row.price_warning || ''
      };
    } catch (_error) {
      return null;
    }
  }

  function productFromButton(btn){
    const helpers=window.COSMOSKIN_PRODUCT_HELPERS||{};
    const handle=btn.dataset.slug || btn.dataset.id || btn.dataset.url || window.location.pathname;
    const effective=typeof helpers.getProductByHandle==='function' ? helpers.getProductByHandle(handle) : null;
    return {
      id: effective?.id || btn.dataset.id || btn.dataset.slug,
      slug: effective?.slug || btn.dataset.slug || btn.dataset.id,
      name: effective?.name || btn.dataset.name,
      brand: effective?.brand || btn.dataset.brand,
      price: Number(effective?.price ?? btn.dataset.price ?? 0),
      price_try: Number(effective?.price_try ?? effective?.price ?? btn.dataset.price ?? 0),
      effective_price_try: Number(effective?.effective_price_try ?? effective?.price ?? btn.dataset.price ?? 0),
      effective_currency: effective?.effective_currency || 'TRY',
      effective_price_source: effective?.effective_price_source || 'static',
      base_catalog_price_try: Number(effective?.base_catalog_price_try ?? btn.dataset.price ?? 0),
      regular_price_try: Number(effective?.regular_price_try ?? effective?.base_catalog_price_try ?? btn.dataset.price ?? 0),
      sale_price_try: effective?.sale_price_try ?? null,
      compare_at_price_try: effective?.compare_at_price_try ?? null,
      sale_active: Boolean(effective?.sale_active),
      price_display_mode: effective?.price_display_mode || 'regular',
      has_price_override: Boolean(effective?.has_price_override),
      price_override_valid: effective?.price_override_valid !== false,
      price_warning: effective?.price_warning || '',
      image: effective?.image || btn.dataset.image,
      url: effective?.url || btn.dataset.url || window.location.pathname,
      qty: 1
    };
  }

  function bindTabs(){
    $$('.pdp5-tab').forEach((tab)=>{
      tab.addEventListener('click',()=>{
        const id=tab.dataset.pdpTab;
        $$('.pdp5-tab').forEach(t=>{t.classList.toggle('is-active',t===tab);t.setAttribute('aria-selected',t===tab?'true':'false');});
        $$('.pdp5-panel').forEach(panel=>{
          const active=panel.dataset.pdpPanel===id;
          panel.classList.toggle('is-active',active);
          panel.hidden=!active;
        });
      });
    });
  }

  function bindThumbs(){
    const img=$('.pdp5-main-image');
    if(!img) return;
    $$('.pdp5-thumb').forEach((thumb)=>{
      thumb.addEventListener('click',()=>{
        const src=thumb.dataset.pdpThumb;
        if(src) img.src=src;
        $$('.pdp5-thumb').forEach(t=>t.classList.toggle('is-active',t===thumb));
      });
    });
  }

  function bindBuyNow(){
    $$('[data-buy-now]').forEach((btn)=>{
      if(btn.dataset.buyBound) return;
      btn.dataset.buyBound='true';
      btn.addEventListener('click',async ()=>{
        // UX3B: never build a checkout redirect from a stale pre-hydration
        // price; the promise resolves on patch, fallback or hard timeout.
        await priceReadyPromise;
        const item=productFromButton(btn);
        if(window.COSMOSKIN_STOCK?.validateAdd){
          const allowed=await window.COSMOSKIN_STOCK.validateAdd(item);
          if(!allowed) return;
        }
        if(window.COSMOSKIN_CART_API?.addItems){
          window.COSMOSKIN_CART_API.addItems([item],{openDrawer:false});
        } else {
          try{
            const current=JSON.parse(localStorage.getItem('cosmoskin_cart')||'[]');
            const found=current.find(x=>x.id===item.id);
            if(found) found.qty=(found.qty||1)+1; else current.push(item);
            localStorage.setItem('cosmoskin_cart',JSON.stringify(current));
          }catch{}
        }
        window.location.href='/checkout.html';
      });
    });
  }

  function bindScrollLinks(){
    $$('[data-scroll-reviews]').forEach(a=>a.addEventListener('click',(e)=>{
      const target=$('#reviewsSection');
      if(target){e.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});}
    }));
  }

  const topRatingState={avg:0,count:0,canReview:false,hasPurchased:false,hover:0,selected:0};

  function renderTopRatingStars(value=0){
    $$('.pdp5-top-star').forEach((btn)=>{
      const rating=Number(btn.dataset.rating||0);
      const filled=rating<=value;
      btn.classList.toggle('is-filled', filled);
      btn.textContent=filled?'★':'☆';
    });
  }

  function showPdpNotice(message){
    let toast=document.querySelector('.favorite-toast');
    if(!toast){toast=document.createElement('div');toast.className='favorite-toast';document.body.appendChild(toast);}
    toast.textContent=message;
    toast.classList.add('show');
    clearTimeout(showPdpNotice._timer);
    showPdpNotice._timer=setTimeout(()=>toast.classList.remove('show'),2600);
  }

  async function userIsLoggedIn(){
    const client=window.cosmoskinSupabase;
    if(!client?.auth?.getUser) return false;
    try{const {data:{user}}=await client.auth.getUser();return !!user;}catch{return false;}
  }

  function buildRatingStars(avg){
    const safe=Math.max(0, Math.min(5, Number(avg||0)));
    return [1,2,3,4,5].map((n)=>{
      const fill=Math.max(0, Math.min(100, (safe-(n-1))*100));
      return `<span class="pdp5-star" style="--fill:${fill}%" aria-hidden="true"><span class="pdp5-star__base">★</span><span class="pdp5-star__fill">★</span></span>`;
    }).join('');
  }

  function formatReviewCount(count){
    const safe=Number(count||0);
    return safe === 1 ? '1 yorum' : `${safe.toLocaleString('tr-TR')} yorum`;
  }

  function bindTopRating(){
    const link=$('.pdp5-rating-link');
    const starWrap=$('.pdp5-stars');
    if(!link||!starWrap||starWrap.dataset.topRatingBound==='true') return;
    starWrap.dataset.topRatingBound='true';
    link.setAttribute('href','#reviewsSection');
    link.setAttribute('data-scroll-reviews','');
    link.setAttribute('aria-label','Yorumlar bölümüne git');
    link.classList.add('is-empty');
    starWrap.innerHTML=buildRatingStars(0);
    starWrap.hidden=true;
    const micro=$('#pdp5RatingMicro');
    if(micro){
      micro.textContent='Henüz yorum yok';
      micro.setAttribute('title','Bu ürün için henüz onaylanmış yorum yok');
    }
  }

  function updateProductSchemaAggregateRating(avg,count){
    const safeAvg=Number(avg||0);
    const safeCount=Number(count||0);
    const scripts=Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for(const script of scripts){
      let data;
      try{data=JSON.parse(script.textContent||'{}');}catch{continue;}
      const graph=Array.isArray(data['@graph']) ? data['@graph'] : [data];
      const product=graph.find((node)=>node && node['@type']==='Product');
      if(!product) continue;
      if(safeCount>0 && safeAvg>0){
        product.aggregateRating={
          '@type':'AggregateRating',
          ratingValue: Number(safeAvg.toFixed(1)),
          reviewCount: safeCount
        };
      }else{
        delete product.aggregateRating;
      }
      script.textContent=JSON.stringify(data);
      return;
    }
  }

  function syncRatingMicro(){
    document.addEventListener('cosmoskin:reviews-summary',(event)=>{
      const el=$('#pdp5RatingMicro');
      const starWrap=$('.pdp5-stars');
      const link=$('.pdp5-rating-link');
      const s=event.detail || {};
      topRatingState.avg=Number(s.avg||0);
      topRatingState.count=Number(s.count||0);
      topRatingState.canReview=!!s.canReview;
      topRatingState.hasPurchased=!!s.hasPurchased;
      const hasReviews=topRatingState.count>0 && topRatingState.avg>0;
      if(starWrap){
        starWrap.innerHTML=buildRatingStars(hasReviews ? topRatingState.avg : 0);
        starWrap.hidden=!hasReviews;
      }
      if(el){
        el.textContent = hasReviews ? `${topRatingState.avg.toFixed(1)} · ${formatReviewCount(topRatingState.count)}` : 'Henüz yorum yok';
        el.setAttribute('title', hasReviews ? `${topRatingState.count} doğrulanmış yorum ortalaması` : 'Bu ürün için henüz onaylanmış yorum yok');
      }
      updateProductSchemaAggregateRating(topRatingState.avg, topRatingState.count);
      if(link){
        link.classList.toggle('is-empty', !hasReviews);
        link.classList.toggle('is-rated', hasReviews);
        const label = hasReviews
          ? `${topRatingState.avg.toFixed(1)} puan, ${formatReviewCount(topRatingState.count)}. Yorumlara git.`
          : 'Henüz yorum yok. Yorumlar bölümüne git.';
        link.setAttribute('aria-label', label);
      }
    });
  }

  function init(){
    bindTabs();bindThumbs();bindBuyNow();bindScrollLinks();bindTopRating();syncRatingMicro();
    if(window.initFavoriteButtons) window.initFavoriteButtons(document);
    if(window.initCartButtons) window.initCartButtons(document);

    const slug = pdpSlug();
    const helpers = window.COSMOSKIN_PRODUCT_HELPERS || {};

    // UX3B hydration lifecycle: hold purchase buttons, then reveal via the
    // first authoritative patch, the documented static fallback, or the hard
    // timeout — whichever comes first. The skeleton CSS keys off
    // data-price-ready, and a pure-CSS animation reveals prices even if this
    // script never runs.
    document.documentElement.setAttribute('data-cs-price-hydrating', 'true');
    holdPdpPurchaseButtons();
    window.setTimeout(() => markPdpPriceReady('timeout-fallback'), PRICE_READY_TIMEOUT_MS);

    const fromCatalog = typeof helpers.getProductBySlug === 'function' ? helpers.getProductBySlug(slug) : null;
    if (fromCatalog && (fromCatalog.effective_price_source || 'static') !== 'static') {
      // Catalog already carries the effective overlay — safe to show now.
      patchPdpPriceSurfaces(fromCatalog);
    }

    let lastEffective = null;
    loadEffectivePriceForSlug(slug).then((effective) => {
      lastEffective = effective;
      if (effective) patchPdpPriceSurfaces(effective);
      else if (fromCatalog) { patchPdpPriceSurfaces(fromCatalog); markPdpPriceReady('static-fallback'); }
      else markPdpPriceReady('static-fallback');
      window.setTimeout(() => { if (lastEffective) patchPdpPriceSurfaces(lastEffective); }, 450);
      window.setTimeout(() => { if (lastEffective) patchPdpPriceSurfaces(lastEffective); }, 1600);
    });

    document.addEventListener('cosmoskin:products-updated', function () {
      const live = typeof helpers.getProductBySlug === 'function' ? helpers.getProductBySlug(slug) : null;
      if (live) patchPdpPriceSurfaces(live);
      loadEffectivePriceForSlug(slug).then((effective) => {
        lastEffective = effective || lastEffective;
        if (lastEffective) patchPdpPriceSurfaces(lastEffective);
      });
    });
  }

  window.PDP={init};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();

(function(){
  function scrollToReviews(){
    var target=document.getElementById('reviewsSection');
    if(!target) return;
    target.scrollIntoView({behavior:'smooth',block:'start'});
  }
  document.addEventListener('click',function(event){
    var btn=event.target.closest('[data-pdp-scroll-reviews]');
    if(!btn) return;
    event.preventDefault();
    document.querySelectorAll('.pdp5-tab').forEach(function(tab){
      tab.classList.remove('is-active');
      if(tab.hasAttribute('aria-selected')) tab.setAttribute('aria-selected','false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected','true');
    scrollToReviews();
  });
})();
