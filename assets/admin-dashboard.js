
(function(){
  var TOKEN_KEY='cosmoskin_admin_token_session';
  var token=sessionStorage.getItem(TOKEN_KEY)||'';
  var $=function(s){return document.querySelector(s)};
  function esc(v){return String(v==null?'':v).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function setStatus(msg,isErr){var el=$('#dashStatus');if(el){el.textContent=msg;el.style.color=isErr?'#8a3b2f':''}}
  function card(label,value){return '<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>'}
  async function load(){token=$('#dashToken').value.trim();if(!token){setStatus('Admin token gerekli.',true);return}sessionStorage.setItem(TOKEN_KEY,token);setStatus('Özet yükleniyor...');try{var res=await fetch('/api/admin/dashboard',{headers:{'x-admin-token':token}});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||'Dashboard özeti alınamadı.');var s=data.summary||{};$('#dashCards').innerHTML=[card('New orders',s.new_orders||0),card('Preparing orders',s.preparing_orders||0),card('Packed orders',s.packed_orders||0),card('Shipped orders',s.shipped_orders||0),card('Delivered today',s.delivered_today||0),card('Low stock products',s.low_stock_products||0),card('Out of stock products',s.out_of_stock_products||0),card('Pending restock alerts',s.pending_restock_alerts||0),card('Failed emails',s.failed_emails||0),card('Return requests',s.return_requests||0),card('Payment failures',s.payment_failures||0),card('Expiring lots 90d',s.expiring_lots_90d||0),card('Revenue today',s.revenue_today?('₺'+Number(s.revenue_today).toLocaleString('tr-TR')):'—')].join('');setStatus('Dashboard güncel. Revenue yalnızca paid order verisi güvenilir olduğunda referans alınmalıdır.')}catch(e){setStatus(e.message,true)}}
  if($('#dashToken')){$('#dashToken').value=token;$('#dashLoad').addEventListener('click',load);if(token)load()}
})();
