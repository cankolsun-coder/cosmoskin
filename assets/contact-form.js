(function(){
  'use strict';
  function $(s,r){return (r||document).querySelector(s);}
  function turnstileSiteKey(){
    var cfg=window.COSMOSKIN_CONFIG||{};
    return String(window.COSMOSKIN_TURNSTILE_SITE_KEY||cfg.turnstileSiteKey||cfg.turnstile_site_key||'').trim();
  }
  function ensureTurnstile(form){
    var key=turnstileSiteKey();
    var host=$('[data-turnstile-container]',form);
    if(!key||!host||host.dataset.ready==='1') return;
    host.hidden=false;
    host.innerHTML='<div class="cf-turnstile" data-sitekey="'+key.replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];})+'"></div>';
    host.dataset.ready='1';
    if(!document.querySelector('script[data-turnstile-api]')){
      var script=document.createElement('script');
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async=true;script.defer=true;script.dataset.turnstileApi='1';
      document.head.appendChild(script);
    }
  }
  document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-contact-form]').forEach(ensureTurnstile);});
  document.addEventListener('submit', async function(event){
    var form=event.target&&event.target.matches('[data-contact-form]')?event.target:null;
    if(!form) return;
    event.preventDefault();
    var status=$('[data-contact-status]',form);
    if(status){status.className='cs-form-status';status.textContent='';}
    if(!form.checkValidity()){
      form.reportValidity();
      if(status){status.className='cs-form-status is-error';status.textContent='Lütfen zorunlu alanları kontrol edin.';}
      return;
    }
    ensureTurnstile(form);
    if(turnstileSiteKey()&&!form.querySelector('[name="cf-turnstile-response"]')){
      if(status){status.className='cs-form-status is-error';status.textContent='Lütfen güvenlik doğrulamasını tamamlayın.';}
      return;
    }
    var button=form.querySelector('button[type="submit"]');
    if(button) button.disabled=true;
    try{
      var response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}});
      var data=await response.json().catch(function(){return {};});
      if(!response.ok||data.ok===false) throw new Error(data.message||'Mesaj iletilemedi. Lütfen tekrar deneyin.');
      form.reset();
      if(status){status.className='cs-form-status is-success';status.textContent=data.message||'Mesajınız alındı.';}
    }catch(error){
      if(status){status.className='cs-form-status is-error';status.textContent=error.message||'Mesaj şu anda iletilemedi. Lütfen destek@cosmoskin.com.tr adresine yazın.';}
    }finally{
      if(button) button.disabled=false;
    }
  });
})();
