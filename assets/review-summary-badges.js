(function(){
  'use strict';
  const CFG=window.COSMOSKIN_CONFIG||{};
  const API=(CFG.apiBase||'/api').replace(/\/$/,'');
  const CACHE_TTL=1000*60*10;

  const esc=(value)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const readNumber=(value)=>{
    const n=Number(value);
    return Number.isFinite(n)?n:0;
  };
  const formatCount=(count)=>Number(count)===1?'1 yorum':`${Number(count||0).toLocaleString('tr-TR')} yorum`;
  const cacheKey=(slug)=>`cosmoskin_review_summary_${slug}`;

  function buildStars(avg){
    const safe=Math.max(0,Math.min(5,Number(avg||0)));
    return [1,2,3,4,5].map((n)=>{
      const fill=Math.max(0,Math.min(100,(safe-(n-1))*100));
      return `<span class="cs-rating-star" style="--fill:${fill}%" aria-hidden="true"><span class="cs-rating-star__base">★</span><span class="cs-rating-star__fill">★</span></span>`;
    }).join('');
  }

  function normalizeSummary(summary){
    const count=readNumber(summary && (summary.approved_count ?? summary.total_count ?? summary.reviewCount ?? summary.review_count));
    const avg=readNumber(summary && (summary.avg_rating ?? summary.avgRating ?? summary.rating));
    if(count>0 && avg>0){
      return {count:Math.round(count),avg:Math.round(Math.min(5,Math.max(0,avg))*10)/10};
    }
    return {count:0,avg:0};
  }

  function readCached(slug){
    try{
      const raw=sessionStorage.getItem(cacheKey(slug));
      if(!raw) return null;
      const parsed=JSON.parse(raw);
      if(!parsed || Date.now()-Number(parsed.ts||0)>CACHE_TTL) return null;
      return parsed.summary||null;
    }catch{return null;}
  }

  function writeCached(slug,summary){
    try{sessionStorage.setItem(cacheKey(slug),JSON.stringify({ts:Date.now(),summary:summary||{}}));}catch{}
  }

  async function fetchSummary(slug){
    const cached=readCached(slug);
    if(cached) return cached;
    const res=await fetch(`${API}/reviews?product_slug=${encodeURIComponent(slug)}`,{credentials:'same-origin'});
    const data=await res.json().catch(()=>({}));
    const summary=data && data.summary ? data.summary : {};
    writeCached(slug,summary);
    return summary;
  }

  function ensureRatingNode(card){
    let node=card.querySelector('.cs-card-rating');
    if(node) return node;
    node=document.createElement('a');
    node.className='cs-card-rating';
    node.hidden=true;
    const meta=card.querySelector('.meta-note');
    const price=card.querySelector('.price-row');
    if(meta && meta.parentNode) meta.insertAdjacentElement('afterend',node);
    else if(price && price.parentNode) price.insertAdjacentElement('beforebegin',node);
    else card.appendChild(node);
    return node;
  }

  function productSlugFromCard(card){
    const btn=card.querySelector('[data-add-cart]');
    if(btn?.dataset?.slug) return btn.dataset.slug;
    if(btn?.dataset?.id) return btn.dataset.id;
    const href=card.querySelector('a[href*="/products/"]')?.getAttribute('href')||'';
    const match=href.match(/\/products\/([^/?#]+)\.html/i);
    return match ? match[1] : '';
  }

  async function hydrateCard(card){
    const slug=productSlugFromCard(card);
    if(!slug) return;
    const node=ensureRatingNode(card);
    const href=card.querySelector('a[href*="/products/"]')?.getAttribute('href')||`/products/${slug}.html`;
    node.href=href.replace(/#.*$/,'')+'#reviewsSection';
    try{
      const summary=normalizeSummary(await fetchSummary(slug));
      if(!summary.count){
        node.hidden=true;
        node.innerHTML='';
        return;
      }
      node.hidden=false;
      node.setAttribute('aria-label',`${summary.avg.toFixed(1)} puan, ${formatCount(summary.count)}. Ürün yorumlarına git.`);
      node.innerHTML=`<span class="cs-card-rating__stars">${buildStars(summary.avg)}</span><strong>${esc(summary.avg.toFixed(1))}</strong><span>· ${esc(formatCount(summary.count))}</span>`;
    }catch{
      node.hidden=true;
      node.innerHTML='';
    }
  }

  function init(){
    const cards=Array.from(document.querySelectorAll('#bestsellers .product-card'));
    if(!cards.length) return;
    cards.forEach(hydrateCard);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
