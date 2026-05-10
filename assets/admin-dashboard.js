(function(){
  var TOKEN_KEY='cosmoskin_admin_token_session';
  var token=sessionStorage.getItem(TOKEN_KEY)||'';
  var $=function(s){return document.querySelector(s)};
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function setStatus(msg,isErr){var el=$('#dashStatus');if(el){el.textContent=msg;el.style.color=isErr?'#8a3b2f':''}}
  function card(label,value){return '<article><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>'}
  async function load(){token=$('#dashToken').value.trim();if(!token){setStatus('Admin token gerekli.',true);return}sessionStorage.setItem(TOKEN_KEY,token);setStatus('Özet yükleniyor...');try{var invRes=await fetch('/api/admin/inventory',{headers:{'x-admin-token':token}});var inv=await invRes.json();if(!invRes.ok||inv.ok===false)throw new Error(inv.error||'Stok özeti alınamadı.');var ordRes=await fetch('/api/admin/orders?limit=50',{headers:{'x-admin-token':token}});var ord=await ordRes.json();if(!ordRes.ok||ord.ok===false)throw new Error(ord.error||'Sipariş özeti alınamadı.');var s=inv.summary||{},o=ord.summary||{};$('#dashCards').innerHTML=[card('Low stock products',s.low_stock||0),card('Out of stock products',s.out_of_stock||0),card('Pending restock alerts',s.pending_restock_alerts||0),card('New orders',o.paid||0),card('Preparing orders',o.preparing||0),card('Shipped orders',o.shipped||0)].join('');setStatus('Dashboard güncel.')}catch(e){setStatus(e.message,true)}}
  $('#dashToken').value=token;$('#dashLoad').addEventListener('click',load);if(token)load();
})();
