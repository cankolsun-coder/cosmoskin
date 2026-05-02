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

  function bindTopRating(){
    const link=$('.pdp5-rating-link');
    const starWrap=$('.pdp5-stars');
    if(!link||!starWrap||starWrap.dataset.topRatingBound==='true') return;
    starWrap.dataset.topRatingBound='true';
    link.removeAttribute('href');
    link.removeAttribute('data-scroll-reviews');
    link.setAttribute('role','group');
    link.setAttribute('aria-label','Ürün puanı ver');
    starWrap.innerHTML=[1,2,3,4,5].map(n=>`<button class="pdp5-top-star" type="button" data-rating="${n}" aria-label="${n} yıldız ver">☆</button>`).join('');
    renderTopRatingStars(0);
    const micro=$('#pdp5RatingMicro');
    if(micro) micro.textContent='0.0';
    $$('.pdp5-top-star',starWrap).forEach((btn)=>{
      btn.addEventListener('mouseenter',()=>{topRatingState.hover=Number(btn.dataset.rating);renderTopRatingStars(topRatingState.hover);});
      btn.addEventListener('focus',()=>{topRatingState.hover=Number(btn.dataset.rating);renderTopRatingStars(topRatingState.hover);});
      btn.addEventListener('click',async(event)=>{
        event.preventDefault();event.stopPropagation();
        const value=Number(btn.dataset.rating||0);
        topRatingState.selected=value;
        renderTopRatingStars(value);
        const loggedIn=await userIsLoggedIn();
        if(!loggedIn){
          showPdpNotice('Puan vermek için önce giriş yapmalısın.');
          document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal',{detail:{tab:'loginPanel'}}));
          return;
        }
        if(!topRatingState.canReview){
          showPdpNotice('Puan vermek için bu ürünü hesabınla satın almış olmalısın.');
        }
        document.dispatchEvent(new CustomEvent('cosmoskin:pdp-rating-intent',{detail:{rating:value}}));
      });
    });
    starWrap.addEventListener('mouseleave',()=>renderTopRatingStars(topRatingState.selected||0));
  }

  function syncRatingMicro(){
    document.addEventListener('cosmoskin:reviews-summary',(event)=>{
      const el=$('#pdp5RatingMicro');
      const s=event.detail || {};
      topRatingState.avg=Number(s.avg||0);
      topRatingState.count=Number(s.count||0);
      topRatingState.canReview=!!s.canReview;
      topRatingState.hasPurchased=!!s.hasPurchased;
      if(!el) return;
      el.textContent = topRatingState.count>0 ? topRatingState.avg.toFixed(1) : '0.0';
      el.setAttribute('title', topRatingState.count>0 ? `${topRatingState.count} doğrulanmış yorum ortalaması` : 'Henüz doğrulanmış puan yok');
    });
  }

  function init(){
    bindTabs();bindThumbs();bindBuyNow();bindScrollLinks();bindTopRating();syncRatingMicro();
    if(window.initFavoriteButtons) window.initFavoriteButtons(document);
    if(window.initCartButtons) window.initCartButtons(document);
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
