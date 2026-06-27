(function(){
  var TOKEN_KEY='cosmoskin_admin_session_token';
  var token=sessionStorage.getItem(TOKEN_KEY)||'';
  var $=function(s){return document.querySelector(s)};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function date(v){if(!v)return '—';try{return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch(e){return v}}
  function setStatus(m,e){var el=$('#customerStatus'); if(el){el.textContent=m||''; el.style.color=e?'#8a3b2f':''}}
  async function load(){token=$('#customerToken').value.trim(); if(!token){setStatus('Admin token gerekli.',true); return} sessionStorage.setItem(TOKEN_KEY,token); setStatus('Müşteri özeti yükleniyor...'); try{var res=await fetch('/api/admin/customers',{headers:{'x-admin-token':token}}); var data=await res.json().catch(function(){return{}}); if(!res.ok||data.ok===false) throw new Error(data.error||'Müşteri özeti alınamadı.'); $('#customerBody').innerHTML=(data.customers||[]).map(function(c){return '<tr><td><strong>'+esc((c.first_name||'')+' '+(c.last_name||''))+'</strong><span>'+esc(c.email)+'</span></td><td>'+esc(c.order_count||0)+'</td><td>'+esc(c.paid_order_count||0)+'</td><td>₺'+Number(c.total_paid_amount||0).toLocaleString('tr-TR')+'</td><td>'+esc(date(c.last_order_at))+'</td></tr>'}).join('')||'<tr><td colspan="5">Kayıt yok.</td></tr>'; setStatus('Müşteri özeti güncel. Detaylı PII gösterilmez.')}catch(e){setStatus(e.message,true)}}
  if($('#customerToken')){$('#customerToken').value=token; $('#customerLoad').addEventListener('click',load); if(token)load()}
})();
