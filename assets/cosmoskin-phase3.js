
(function(){
  'use strict';
  var sent = new Set();
  var root = document.documentElement;
  function qs(s,r){return (r||document).querySelector(s)}
  function qsa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function text(v){return String(v == null ? '' : v).trim()}
  function slugFromUrl(){var m=location.pathname.match(/\/products\/([^/]+)\.html/);return m?m[1]:''}
  function itemFromButton(btn){if(!btn)return null;return {item_id:text(btn.dataset.slug||btn.dataset.id), item_name:text(btn.dataset.name), item_brand:text(btn.dataset.brand), price:Number(btn.dataset.price||0), currency:'TRY', quantity:1}}
  function sanitizeParams(params){var out={};Object.keys(params||{}).forEach(function(k){var v=params[k];if(v==null)return;if(typeof v==='string')out[k]=v.slice(0,200);else if(typeof v==='number'||typeof v==='boolean')out[k]=v;else if(Array.isArray(v))out[k]=v.slice(0,20).map(function(x){return typeof x==='object'?sanitizeParams(x):x});});return out}
  window.cosmoskinTrackEvent = window.cosmoskinTrackEvent || function(name, params, opts){
    var eventName = text(name).replace(/[^a-z0-9_]/gi,'').slice(0,80);
    if(!eventName)return;
    var safe = sanitizeParams(params||{});
    var key = eventName + ':' + JSON.stringify(safe).slice(0,500);
    if(!(opts&&opts.allowDuplicate) && sent.has(key))return;
    sent.add(key);
    if(typeof window.gtag === 'function') window.gtag('event', eventName, safe);
  };
  function postCrm(eventType, data){
    try{fetch('/api/crm/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({event_type:eventType},data||{}))}).catch(function(){});}catch(e){}
  }
  window.cosmoskinRecordCrmEvent = window.cosmoskinRecordCrmEvent || postCrm;
  function productDataFromPage(){
    var btn = qs('[data-add-cart][data-slug], [data-add-cart][data-id]');
    var item = itemFromButton(btn)||{};
    item.item_id = item.item_id || slugFromUrl();
    item.item_name = item.item_name || text(qs('h1')&&qs('h1').textContent);
    item.item_brand = item.item_brand || text(qs('.pdp5-brand')&&qs('.pdp5-brand').textContent);
    return item.item_id ? item : null;
  }
  function trackProductView(){
    if(!/\/products\//.test(location.pathname))return;
    var item = productDataFromPage();
    if(!item)return;
    window.cosmoskinTrackEvent('view_item',{currency:'TRY', value:Number(item.price||0), items:[item]});
    postCrm('product_viewed',{product_slug:item.item_id, metadata:{page:location.pathname}});
  }
  function bindCommerceEvents(){
    document.addEventListener('click',function(e){
      var add = e.target.closest('[data-add-cart]');
      if(add){var item=itemFromButton(add); if(item){window.cosmoskinTrackEvent('add_to_cart',{currency:'TRY',value:Number(item.price||0),items:[item]},{allowDuplicate:true}); postCrm('added_to_cart',{product_slug:item.item_id, metadata:{page:location.pathname}});}}
      var fav = e.target.closest('[data-favorite-id]');
      if(fav){postCrm('favorite_added',{product_slug:text(fav.dataset.favoriteId), metadata:{page:location.pathname}})}
      var checkout = e.target.closest('a[href*="checkout.html"], #checkoutSubmit');
      if(checkout && !checkout.disabled){window.cosmoskinTrackEvent('begin_checkout',{currency:'TRY'});postCrm('checkout_started',{metadata:{page:location.pathname}})}
    },true);
    document.addEventListener('submit',function(e){
      if(e.target && e.target.id==='checkoutForm'){
        window.cosmoskinTrackEvent('begin_checkout',{currency:'TRY'});
        window.cosmoskinTrackEvent('add_shipping_info',{currency:'TRY'});
        window.cosmoskinTrackEvent('add_payment_info',{currency:'TRY'});
      }
    },true);
    window.addEventListener('cosmoskin:cart-remove',function(ev){
      var item = ev.detail && ev.detail.item; if(item) window.cosmoskinTrackEvent('remove_from_cart',{currency:'TRY',items:[item]},{allowDuplicate:true});
    });
  }
  function addCss(){
    if(qs('#cosmoskinPhase3Styles'))return;
    var style=document.createElement('style');style.id='cosmoskinPhase3Styles';style.textContent='\
      .cs-phase3-compliance{margin:28px 0;padding:24px;border:1px solid rgba(42,31,22,.11);border-radius:28px;background:linear-gradient(135deg,rgba(255,252,247,.78),rgba(242,232,220,.46));}\
      .cs-phase3-compliance h2{margin:0 0 14px;font-family:Cormorant Garamond,serif;font-size:30px;font-weight:400;letter-spacing:-.03em;color:#17120f}\
      .cs-phase3-compliance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}\
      .cs-phase3-compliance-grid article{padding:16px;border:1px solid rgba(35,27,20,.08);border-radius:18px;background:rgba(255,255,255,.58)}\
      .cs-phase3-compliance-grid strong{display:block;margin-bottom:7px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6d6054}\
      .cs-phase3-compliance-grid span{display:block;color:#1f1711;font-size:13px;line-height:1.6;white-space:pre-line}\
      .cs-stock-filter-inline{display:flex;align-items:center;gap:8px;margin:12px 0;padding:10px 12px;border:1px solid rgba(35,27,20,.1);border-radius:999px;background:rgba(255,255,255,.62);width:max-content;max-width:100%;font-size:12px;font-weight:700;color:#51463d}\
      .cs-stock-filter-inline input{width:16px;height:16px;accent-color:#17120f}\
      @media(max-width:720px){.cs-phase3-compliance-grid{grid-template-columns:1fr}.cs-phase3-compliance{padding:18px;border-radius:22px}}';
    document.head.appendChild(style);
  }
  function renderCompliance(data){
    if(!data)return;
    var fields=[['INCI / İçerik Listesi',data.inci_ingredients],['Kullanım',data.usage_instructions],['Uyarılar',data.warnings],['Menşei',data.origin_country],['Distribütör / İthalatçı',[data.distributor_name,data.importer_name].filter(Boolean).join(' / ')],['PAO / SKT Bilgisi',data.pao_info],['Barkod',data.barcode],['ÜTS / Referans',data.uts_code_or_reference]].filter(function(x){return text(x[1])});
    if(!fields.length)return;
    addCss();
    var target=qs('.pdp5-detail-grid')||qs('#reviewsSection')||qs('main'); if(!target)return;
    if(qs('#csComplianceSection'))return;
    var section=document.createElement('section');section.id='csComplianceSection';section.className='cs-phase3-compliance';section.setAttribute('aria-label','Ürün uygunluk bilgileri');
    section.innerHTML='<h2>Ürün Bilgileri</h2><div class="cs-phase3-compliance-grid">'+fields.map(function(f){return '<article><strong>'+escapeHtml(f[0])+'</strong><span>'+escapeHtml(f[1])+'</span></article>'}).join('')+'</div>';
    target.parentNode.insertBefore(section,target.nextSibling);
  }
  function escapeHtml(v){return text(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function loadCompliance(){
    var slug=slugFromUrl();if(!slug)return;
    fetch('/api/product-compliance?slug='+encodeURIComponent(slug)).then(function(r){return r.json()}).then(function(data){if(data&&data.ok)renderCompliance(data.compliance)}).catch(function(){});
  }
  function injectDynamicProductSchema(){
    var item=productDataFromPage(); if(!item)return;
    fetch('/api/inventory?product_slugs='+encodeURIComponent(item.item_id)).then(function(r){return r.json()}).then(function(data){
      var inv=(data.inventory||[])[0]; if(!inv)return;
      var existing=qs('script[data-cosmoskin-dynamic-product-schema]'); if(existing)existing.remove();
      var schema={ '@context':'https://schema.org', '@type':'Product', name:item.item_name, brand:{'@type':'Brand',name:item.item_brand||'COSMOSKIN'}, sku:item.item_id, offers:{'@type':'Offer', priceCurrency:'TRY', price:String(item.price||''), availability: inv.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url:location.href.split('#')[0]} };
      var img=qs('.pdp5-main-image img, .product-hero img, img[alt="'+CSS.escape(item.item_name||'')+'"]'); if(img&&img.src)schema.image=img.src;
      var sc=document.createElement('script');sc.type='application/ld+json';sc.dataset.cosmoskinDynamicProductSchema='true';sc.textContent=JSON.stringify(schema);document.head.appendChild(sc);
    }).catch(function(){});
  }
  function addStockFilter(){
    if(!/allproducts\.html|search\.html|\/collections\//.test(location.pathname))return;
    if(qs('#csStockFilterInline'))return;
    addCss();
    var anchor=qs('.filter-row,.filters,.collection-controls,.search-tools,.section-head')||qs('main'); if(!anchor)return;
    var label=document.createElement('label');label.id='csStockFilterInline';label.className='cs-stock-filter-inline';label.innerHTML=''; label.hidden=true;
    anchor.parentNode.insertBefore(label, anchor.nextSibling);
    var input=qs('input',label);
    input.addEventListener('change',function(){
      var cards=qsa('[data-product-id], .product-card, .pdp-related-card');
      cards.forEach(function(card){
        var btn=qs('[data-add-cart]',card); var unavailable=btn&&btn.disabled || /stokta yok/i.test(card.textContent||'');
        card.style.display=(input.checked&&unavailable)?'none':'';
      });
    });
  }
  document.addEventListener('DOMContentLoaded',function(){trackProductView();bindCommerceEvents();loadCompliance();injectDynamicProductSchema();addStockFilter();});
})();
