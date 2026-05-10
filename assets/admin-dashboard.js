(function(){
  'use strict';
  var TOKEN_KEY='cosmoskin_admin_token_session';
  var token=sessionStorage.getItem(TOKEN_KEY)||'';
  var $=function(s){return document.querySelector(s)};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function setStatus(msg,isErr){var el=$('#dashStatus');if(el){el.textContent=msg||'';el.style.color=isErr?'#8a3b2f':''}}
  function card(label,value,note,alert){return '<article class="cs-summary-card '+(alert?'is-alert':'')+'"><span>'+esc(label)+'</span><strong>'+esc(value==null?'—':value)+'</strong>'+(note?'<small>'+esc(note)+'</small>':'')+'</article>'}
  function checklistItem(label,state){var cls=state==='ok'?'ok':state==='err'?'err':'';var text=state==='ok'?'Aktif':state==='err'?'Kontrol gerekli':'—';return '<article><span>'+esc(label)+'</span><strong class="'+cls+'">'+text+'</strong></article>'}
  async function read(path){var res=await fetch(path,{headers:{'x-admin-token':token}});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||'Endpoint erişilemedi.');return data}
  function num(v){return v==null?'—':Number(v||0).toLocaleString('tr-TR')}
  async function load(){token=($('#dashToken')||{}).value.trim();if(!token){setStatus('Admin token gerekli.',true);return}sessionStorage.setItem(TOKEN_KEY,token);setStatus('Operasyon özeti yükleniyor...');var status={token:'ok',inventory:'',orders:'',emails:'',invoices:''};var summary={};try{var data=await read('/api/admin/dashboard');var s=data.summary||{};summary.new_orders=s.new_orders;summary.preparing_orders=s.preparing_orders||s.packed_orders;summary.low_stock_products=s.low_stock_products;summary.out_of_stock_products=s.out_of_stock_products;summary.failed_emails=s.failed_emails;summary.return_requests=s.return_requests;summary.pending_invoices=s.pending_invoices;summary.shipped_orders=s.shipped_orders;status.inventory='ok';status.orders='ok';status.emails='ok';status.invoices='ok'}catch(e){setStatus('Dashboard endpointinden tam özet alınamadı; modül endpointleri yapısal olarak kontrol ediliyor.',false);await Promise.all([
      read('/api/admin/inventory?filter=all').then(function(d){status.inventory='ok';var s=d.summary||{};summary.low_stock_products=s.low_stock;summary.out_of_stock_products=s.out_of_stock}).catch(function(){status.inventory='err'}),
      read('/api/admin/orders').then(function(d){status.orders='ok';var orders=d.orders||[];summary.new_orders=orders.filter(function(o){return ['new','paid'].indexOf(String(o.status||'').toLowerCase())>-1}).length;summary.preparing_orders=orders.filter(function(o){return ['preparing','packed'].indexOf(String(o.fulfillment_status||o.status||'').toLowerCase())>-1}).length;summary.shipped_orders=orders.filter(function(o){return ['shipped','in_transit'].indexOf(String(o.fulfillment_status||o.status||'').toLowerCase())>-1}).length}).catch(function(){status.orders='err'}),
      read('/api/admin/email-logs?status=failed').then(function(d){status.emails='ok';summary.failed_emails=(d.logs||[]).length}).catch(function(){status.emails='err'}),
      read('/api/admin/invoices?invoice_status=pending').then(function(d){status.invoices='ok';summary.pending_invoices=(d.invoices||[]).length}).catch(function(){status.invoices='err'}),
      read('/api/admin/returns?status=requested').then(function(d){summary.return_requests=(d.returns||[]).length}).catch(function(){})
    ])}
    $('#dashCards').innerHTML=[
      card('Yeni siparişler',num(summary.new_orders),'Gerçek sipariş verisiyle dolar.'),
      card('Hazırlanacak siparişler',num(summary.preparing_orders),'Operasyon kuyruğu.'),
      card('Düşük stoklu ürünler',num(summary.low_stock_products),'Satın alma önceliği.',Number(summary.low_stock_products)>0),
      card('Stokta olmayan ürünler',num(summary.out_of_stock_products),'Sepete ekleme blokajı.',Number(summary.out_of_stock_products)>0),
      card('Başarısız e-postalar',num(summary.failed_emails),'Transactional mail riski.',Number(summary.failed_emails)>0),
      card('İade talepleri',num(summary.return_requests),'Müşteri destek takibi.',Number(summary.return_requests)>0),
      card('Bekleyen faturalar',num(summary.pending_invoices),'Mali operasyon kontrolü.',Number(summary.pending_invoices)>0),
      card('Kargoda olan siparişler',num(summary.shipped_orders),'Fulfillment akışı.')
    ].join('');
    $('#dashChecklist').innerHTML=[
      checklistItem('Admin token aktif',status.token),
      checklistItem('Stok endpointi erişilebilir',status.inventory),
      checklistItem('Sipariş endpointi erişilebilir',status.orders),
      checklistItem('E-posta log endpointi erişilebilir',status.emails),
      checklistItem('Fatura endpointi erişilebilir',status.invoices)
    ].join('');setStatus('Operasyon paneli güncel. Eksik endpointler sahte veriyle doldurulmadı.',false)}
  if($('#dashToken')){$('#dashToken').value=token;$('#dashLoad').addEventListener('click',function(){load().catch(function(e){setStatus(e.message,true)})});if(token)load().catch(function(e){setStatus(e.message,true)})}
}());
