(function(){
  'use strict';
  const CFG=window.COSMOSKIN_CONFIG||{};
  const API=(CFG.apiBase||'/api').replace(/\/$/,'');
  const BUCKET='review-images';
  const MAX_FILES=5;
  const MAX_MB=2;
  const LABELS={1:'Hayal kırıklığı',2:'Beklentinin altında',3:'İdare eder',4:'Oldukça memnunum',5:'Mükemmel, kesinlikle öneririm'};
  const $=(s,p=document)=>p.querySelector(s);
  const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
  let section, slug='', sb=null, session=null, reviews=[], filtered=[], userReview=null, canReview=false, dataHasPurchased=false, page=0, rating=0, files=[], lightboxImages=[], lightboxIndex=0, helped=new Set();
  const PER=5;

  const esc=(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const fmtDate=(value)=>{try{return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(value));}catch{return '';}};

  async function waitForSb(ms=3500){
    if(window.cosmoskinSupabase) return window.cosmoskinSupabase;
    const start=Date.now();
    return await new Promise(resolve=>{
      const id=setInterval(()=>{
        if(window.cosmoskinSupabase || Date.now()-start>ms){clearInterval(id);resolve(window.cosmoskinSupabase||null);}
      },80);
    });
  }
  async function refreshSession(){
    sb=await waitForSb();
    if(!sb){session=null;return;}
    try{const res=await sb.auth.getSession();session=res?.data?.session||null;}catch{session=null;}
  }
  function authHeaders(){return session?.access_token ? {Authorization:`Bearer ${session.access_token}`} : {};}

  async function load(){
    const list=$('#rvList');
    if(list) list.innerHTML='<div class="pdp5-review-skeleton"></div><div class="pdp5-review-skeleton"></div>';
    await refreshSession();
    try{
      const res=await fetch(`${API}/reviews?product_slug=${encodeURIComponent(slug)}`,{headers:authHeaders()});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||'Yorumlar yüklenemedi.');
      reviews=Array.isArray(data.reviews)?data.reviews:[];
      filtered=[...reviews];
      userReview=data.user_review||null;
      canReview=!!data.can_review;
      dataHasPurchased=!!data.has_purchased;
      helped=new Set(Array.isArray(data.helpful_ids)?data.helpful_ids:[]);
      renderSummary(data.summary);
      renderWriteArea();
      renderFilters();
      renderList(true);
    }catch(error){
      if(list) list.innerHTML=`<div class="pdp5-empty">Yorumlar şu anda yüklenemedi. Lütfen sayfayı yenileyin.</div>`;
      renderWriteArea();
    }
  }

  function renderSummary(summary){
    const count=Number(summary?.approved_count ?? reviews.length ?? 0);
    const avg=count ? Number(summary?.avg_rating || (reviews.reduce((s,r)=>s+Number(r.rating||0),0)/count)).toFixed(1) : '—';
    $('#rvScoreBig') && ($('#rvScoreBig').textContent=avg);
    $('#rvCount') && ($('#rvCount').textContent=count ? `${count} doğrulanmış yorum` : 'Henüz yorum yok');
    $('#rvStarsRow') && ($('#rvStarsRow').innerHTML=stars(avg==='—'?0:Number(avg)));
    const hist=$('#rvHistogram');
    if(hist){
      const starCounts={5:Number(summary?.five_star||0),4:Number(summary?.four_star||0),3:Number(summary?.three_star||0),2:Number(summary?.two_star||0),1:Number(summary?.one_star||0)};
      hist.innerHTML=[5,4,3,2,1].map(st=>{
        const c=starCounts[st]||0; const pct=count?Math.round((c/count)*100):0;
        return `<div class="pdp5-hbar"><span>${st} yıldız</span><div class="pdp5-hbar-track"><div class="pdp5-hbar-fill" style="width:${pct}%"></div></div><span>${c}</span></div>`;
      }).join('');
    }
    document.dispatchEvent(new CustomEvent('cosmoskin:reviews-summary',{detail:{avg: avg==='—'?0:Number(avg), count, canReview, hasPurchased: !!dataHasPurchased}}));
  }
  function stars(avg){
    const n=Math.round(Number(avg||0));
    return '★★★★★'.split('').map((s,i)=>`<span style="opacity:${i<n?1:.22}">★</span>`).join('');
  }
  function renderWriteArea(){
    const wrap=$('#rvWriteWrap'); if(!wrap) return;
    if(canReview){
      wrap.innerHTML=`<button type="button" class="btn btn-primary" data-review-open>${userReview?'Yorumu Düzenle':'Yorum Yaz'}</button>`;
    } else if(session){
      wrap.innerHTML='<span class="pdp5-empty" style="display:inline-flex;padding:10px 14px;border-radius:999px">Yorum yazmak için ürünü satın almış olmalısın.</span>';
    } else {
      wrap.innerHTML='<a class="btn btn-secondary" href="/auth/login.html?returnTo='+encodeURIComponent(location.pathname+location.search+'#reviewsSection')+'">Giriş Yap</a>';
    }
  }
  function renderFilters(){
    const row=$('#rvFilterRow'); if(!row) return;
    row.hidden = reviews.length===0;
  }
  function renderList(reset=false){
    const list=$('#rvList'); if(!list) return;
    if(reset){page=0;list.innerHTML='';}
    if(!filtered.length){list.innerHTML='<div class="pdp5-empty">Bu ürün için henüz onaylanmış yorum yok.</div>'; $('#rvMoreWrap')&&($('#rvMoreWrap').hidden=true); return;}
    const next=filtered.slice(0,(page+1)*PER);
    list.innerHTML=next.map(card).join('');
    const more=$('#rvMoreWrap'); if(more) more.hidden=next.length>=filtered.length;
  }
  function initials(name){return String(name||'Müşteri').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toLocaleUpperCase('tr-TR')||'M';}
  function card(r){
    const name=esc(r.user_display_name||r.user?.name||'Doğrulanmış Müşteri');
    const imgs=(r.images||r.review_images||[]).filter(img=>(img.status||'approved')==='approved');
    const photoHtml=imgs.length?`<div class="pdp5-review-photos">${imgs.map((img,i)=>`<button type="button" data-lightbox-index="${i}" data-lightbox-review="${esc(r.id)}"><img src="${esc(img.public_url||img.url)}" alt="Yorum görseli" loading="lazy" /></button>`).join('')}</div>`:'';
    const own=session?.user?.id && session.user.id===r.user_id;
    const voted=helped.has(r.id);
    return `<article class="pdp5-review-card" data-review-id="${esc(r.id)}">
      <div class="pdp5-review-card__top"><div class="pdp5-review-user"><div class="pdp5-avatar">${esc(initials(name))}</div><div><strong>${name}</strong><span>${fmtDate(r.created_at)}</span>${r.verified_purchase!==false?'<div class="pdp5-verified">✓ Satın Aldı</div>':''}</div></div><div class="pdp5-review-rating">${stars(r.rating)}</div></div>
      <h3>${esc(r.title||'Ürün deneyimi')}</h3><p>${esc(r.body||'')}</p>${photoHtml}
      <div class="pdp5-review-actions"><button type="button" class="pdp5-helpful ${voted?'is-active':''}" data-helpful="${esc(r.id)}">Faydalı (${Number(r.helpful_count||0)})</button>${own?'<button type="button" class="pdp5-helpful" data-review-edit>Düzenle</button>':''}</div>
    </article>`;
  }

  function setFilter(type, btn){
    $$('.pdp5-filter').forEach(b=>b.classList.toggle('is-active',b===btn));
    if(type==='all') filtered=[...reviews];
    else if(type==='photo') filtered=reviews.filter(r=>(r.images||r.review_images||[]).some(img=>(img.status||'approved')==='approved'));
    else filtered=reviews.filter(r=>Number(r.rating)===Number(type));
    renderList(true);
  }
  function setRating(value){
    rating=Number(value||0);
    $$('#rvStarPicker [data-rating]').forEach(btn=>btn.classList.toggle('is-active',Number(btn.dataset.rating)<=rating));
    $('#rvRatingLabel') && ($('#rvRatingLabel').textContent=LABELS[rating]||'');
  }
  function openModal(edit=false){
    const modal=$('#rvModalOverlay'); if(!modal) return;
    modal.hidden=false; document.body.classList.add('modal-open');
    $('#rvFormStatus') && ($('#rvFormStatus').textContent='');
    const title=$('#rvTitleInput'), body=$('#rvBodyInput'); files=[]; renderPreviews();
    if(edit && userReview){
      if(title) title.value=userReview.title||''; if(body) body.value=userReview.body||''; setRating(userReview.rating||0);
    } else { if(title) title.value=''; if(body) body.value=''; setRating(0); }
    countChars();
  }
  function closeModal(){const modal=$('#rvModalOverlay'); if(modal) modal.hidden=true; document.body.classList.remove('modal-open');}
  function countChars(){
    const t=$('#rvTitleInput'), b=$('#rvBodyInput');
    $('#rvTitleCount') && ($('#rvTitleCount').textContent=`${(t?.value||'').length} / 100`);
    $('#rvBodyCount') && ($('#rvBodyCount').textContent=`${(b?.value||'').length} / 2000`);
  }
  function setStatus(msg,type=''){const el=$('#rvFormStatus'); if(el){el.textContent=msg;el.className=`pdp5-form-status ${type}`;}}
  function handleFiles(fileList){
    Array.from(fileList||[]).slice(0,MAX_FILES-files.length).forEach(file=>{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setStatus('Sadece JPG, PNG veya WEBP yükleyebilirsin.','error');return;}
      if(file.size>MAX_MB*1024*1024){setStatus(`Görsel ${MAX_MB} MB sınırını aşıyor.`,'error');return;}
      files.push({file,url:URL.createObjectURL(file)});
    });
    renderPreviews();
  }
  function renderPreviews(){
    const row=$('#rvPreviewRow'); if(!row) return;
    row.innerHTML=files.map((item,i)=>`<div class="pdp5-preview-item"><img src="${item.url}" alt="Önizleme"/><button type="button" data-remove-file="${i}">×</button></div>`).join('');
  }
  async function compress(file){
    return await new Promise(resolve=>{
      const img=new Image(); const url=URL.createObjectURL(file);
      img.onload=()=>{URL.revokeObjectURL(url);let w=img.width,h=img.height;const max=1400;if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(blob=>resolve({blob,width:w,height:h}),'image/webp',.84);};
      img.onerror=()=>resolve(null); img.src=url;
    });
  }
  async function uploadImages(reviewId){
    if(!sb||!session||!files.length) return [];
    const uploaded=[];
    for(let i=0;i<files.length;i++){
      const packed=await compress(files[i].file); if(!packed?.blob) continue;
      const path=`${session.user.id}/${reviewId||'new'}/${Date.now()}-${i}.webp`;
      const {error}=await sb.storage.from(BUCKET).upload(path,packed.blob,{contentType:'image/webp',upsert:false});
      if(error) continue;
      const {data}=sb.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({storagePath:path,publicUrl:data.publicUrl,width:packed.width,height:packed.height});
    }
    return uploaded;
  }
  async function submit(e){
    e.preventDefault();
    if(!session){setStatus('Yorum yazmak için giriş yapmalısın.','error');return;}
    if(!canReview){setStatus('Yalnızca satın aldığın ürünler için yorum yazabilirsin.','error');return;}
    const title=$('#rvTitleInput')?.value.trim()||''; const body=$('#rvBodyInput')?.value.trim()||'';
    if(!rating) return setStatus('Lütfen puan seç.','error');
    if(title.length<3) return setStatus('Başlık en az 3 karakter olmalı.','error');
    if(body.length<10) return setStatus('Yorum en az 10 karakter olmalı.','error');
    const btn=$('#rvSubmitBtn'), label=$('#rvSubmitLabel'); if(btn) btn.disabled=true; if(label) label.textContent='Gönderiliyor…'; setStatus('');
    try{
      const isEdit=!!userReview;
      let uploaded=[];
      if(isEdit && files.length){ if(label) label.textContent='Görseller yükleniyor…'; uploaded=await uploadImages(userReview.id); }
      const res=await fetch(`${API}/reviews${isEdit?`/${userReview.id}`:''}`,{method:isEdit?'PATCH':'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({product_slug:slug,title,body,rating,images:uploaded})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||'Yorum gönderilemedi.');
      if(!isEdit && files.length && data.review_id){
        if(label) label.textContent='Görseller yükleniyor…';
        const imgs=await uploadImages(data.review_id);
        if(imgs.length){await fetch(`${API}/reviews/images`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({review_id:data.review_id,images:imgs})});}
      }
      setStatus('Yorumun incelemeye alındı. Onaylandıktan sonra yayınlanacak.','success');
      setTimeout(()=>{closeModal();load();},900);
    }catch(error){setStatus(error.message||'Bağlantı hatası.','error');}
    finally{if(btn) btn.disabled=false;if(label) label.textContent='Yorumu Gönder';}
  }
  async function toggleHelpful(id,btn){
    if(!session){setStatus('Yorumu faydalı işaretlemek için giriş yapmalısın.','error'); return;}
    const voted=helped.has(id);
    try{
      const res=await fetch(`${API}/reviews/helpful`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({review_id:id,action:voted?'remove':'add'})});
      if(!res.ok) return;
      if(voted) helped.delete(id); else helped.add(id);
      const r=reviews.find(x=>x.id===id); if(r) r.helpful_count=Math.max(0,Number(r.helpful_count||0)+(voted?-1:1));
      renderList(true);
    }catch{}
  }
  function openLightboxFor(reviewId,index){
    const r=reviews.find(x=>String(x.id)===String(reviewId));
    lightboxImages=(r?.images||r?.review_images||[]).filter(img=>(img.status||'approved')==='approved').map(img=>img.public_url||img.url);
    lightboxIndex=Number(index)||0; const box=$('#rvLightbox'), img=$('#rvLbImg'); if(!box||!img||!lightboxImages.length) return;
    img.src=lightboxImages[lightboxIndex]; box.hidden=false;
  }
  function closeLightbox(){const box=$('#rvLightbox'); if(box) box.hidden=true;}
  function navLightbox(delta){if(!lightboxImages.length)return;lightboxIndex=(lightboxIndex+delta+lightboxImages.length)%lightboxImages.length;$('#rvLbImg')&&($('#rvLbImg').src=lightboxImages[lightboxIndex]);}

  function bind(){
    document.addEventListener('click',(e)=>{
      const open=e.target.closest('[data-review-open]'); if(open) return openModal(!!userReview);
      const close=e.target.closest('[data-review-close]'); if(close) return closeModal();
      const filter=e.target.closest('[data-review-filter]'); if(filter) return setFilter(filter.dataset.reviewFilter,filter);
      const more=e.target.closest('[data-review-more]'); if(more){page++;return renderList(false);}
      const helpful=e.target.closest('[data-helpful]'); if(helpful) return toggleHelpful(helpful.dataset.helpful,helpful);
      const edit=e.target.closest('[data-review-edit]'); if(edit) return openModal(true);
      const photo=e.target.closest('[data-review-photo]'); if(photo) return $('#rvPhotoInput')?.click();
      const rm=e.target.closest('[data-remove-file]'); if(rm){const i=Number(rm.dataset.removeFile); if(files[i]) URL.revokeObjectURL(files[i].url); files.splice(i,1); return renderPreviews();}
      const ph=e.target.closest('[data-lightbox-index]'); if(ph) return openLightboxFor(ph.dataset.lightboxReview,ph.dataset.lightboxIndex);
      if(e.target.closest('[data-lightbox-close]')) return closeLightbox();
      if(e.target.closest('[data-lightbox-prev]')) return navLightbox(-1);
      if(e.target.closest('[data-lightbox-next]')) return navLightbox(1);
    });
    $('#rvForm')?.addEventListener('submit',submit);
    $('#rvTitleInput')?.addEventListener('input',countChars); $('#rvBodyInput')?.addEventListener('input',countChars);
    $('#rvPhotoInput')?.addEventListener('change',(e)=>handleFiles(e.target.files));
    $$('#rvStarPicker [data-rating]').forEach(btn=>btn.addEventListener('click',()=>setRating(btn.dataset.rating)));
    const up=$('#rvUploadZone'); if(up){['dragenter','dragover'].forEach(n=>up.addEventListener(n,e=>{e.preventDefault();up.classList.add('is-drag');}));['dragleave','drop'].forEach(n=>up.addEventListener(n,e=>{e.preventDefault();up.classList.remove('is-drag');}));up.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));}
    document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){closeModal();closeLightbox();} if(!$('#rvLightbox')?.hidden){if(e.key==='ArrowLeft')navLightbox(-1);if(e.key==='ArrowRight')navLightbox(1);}});
    document.addEventListener('cosmoskin:auth-state',()=>load());
    document.addEventListener('cosmoskin:pdp-rating-intent',(event)=>{
      const value=Number(event.detail?.rating||0);
      if(!value) return;
      if(!session){
        document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal',{detail:{tab:'loginPanel'}}));
        return;
      }
      if(!canReview){
        const msg=document.querySelector('#rvFormStatus');
        if(msg){msg.textContent='Puan vermek için bu ürünü hesabınla satın almış olmalısın.';msg.className='pdp5-form-status error';}
        section?.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      openModal(!!userReview);
      setTimeout(()=>setRating(value),0);
    });
  }
  async function init(){section=$('#reviewsSection'); if(!section) return; slug=section.dataset.productSlug||''; bind(); await load();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  window.CosmoReviews={reload:load,openModal,closeModal};
})();
