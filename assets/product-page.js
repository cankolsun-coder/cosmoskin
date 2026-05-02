(function(){
  'use strict';
  const $=(s,p=document)=>p.querySelector(s);
  const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));

  function productFromButton(btn){
    return {
      id: btn.dataset.id || btn.dataset.slug,
      slug: btn.dataset.slug || btn.dataset.id,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: Number(btn.dataset.price || 0),
      image: btn.dataset.image,
      url: btn.dataset.url || window.location.pathname,
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
      btn.addEventListener('click',()=>{
        const item=productFromButton(btn);
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

  function syncRatingMicro(){
    document.addEventListener('cosmoskin:reviews-summary',(event)=>{
      const el=$('#pdp5RatingMicro');
      const s=event.detail || {};
      if(!el) return;
      el.textContent = Number(s.count||0)>0 ? `${s.avg} / 5 · ${s.count} yorum` : 'İlk yorumu sen yaz';
    });
  }

  function init(){
    bindTabs();bindThumbs();bindBuyNow();bindScrollLinks();syncRatingMicro();
    if(window.initFavoriteButtons) window.initFavoriteButtons(document);
    if(window.initCartButtons) window.initCartButtons(document);
  }

  window.PDP={init};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
