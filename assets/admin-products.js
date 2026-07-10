(function(){
  'use strict';
  var TOKEN_KEY='cosmoskin_admin_session_token';
  var canEditPrice=false;
  function notice(message,isError){var n=document.querySelector('.admin-inline-status');if(!n){n=document.createElement('div');n.className='admin-inline-status';n.style.cssText='position:fixed;right:18px;bottom:18px;background:'+(isError?'#7f2f23':'#17120f')+';color:#fff;padding:12px 14px;border-radius:14px;z-index:9999;max-width:360px';document.body.appendChild(n);}n.textContent=message||'';clearTimeout(notice._t);notice._t=setTimeout(function(){n.remove()},3200)}
  var $=function(s){return document.querySelector(s)};var products=[];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function token(){return ($('#adminToken')?.value||sessionStorage.getItem(TOKEN_KEY)||'').trim()}
  function fmt(n){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(Number(n||0))}
  function fmtTry(n){return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0))}
  function fmtDateTime(iso){
    if(!iso) return '';
    try{return new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso))}catch(_){return String(iso)}
  }
  function toDatetimeLocalValue(iso){
    if(!iso) return '';
    var d=new Date(iso);
    if(isNaN(d.getTime())) return '';
    var pad=function(n){return String(n).padStart(2,'0')};
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function fromDatetimeLocalValue(v){
    if(!v||!String(v).trim()) return null;
    var ms=Date.parse(String(v));
    if(!isNaN(ms)) return new Date(ms).toISOString();
    return null;
  }
  function readNullableNumber(input){
    if(!input) return null;
    var raw=String(input.value||'').trim();
    if(!raw) return null;
    var n=Number(raw);
    return Number.isFinite(n)?n:null;
  }
  function labelStatus(v){return {active:'Aktif',out_of_stock:'Stokta yok',draft:'Hazırlık',preorder:'Ön sipariş',inactive:'Pasif',discontinued:'Satıştan kaldırıldı'}[v]||v}
  function statusOptions(current){return ['active','out_of_stock','draft','preorder','inactive','discontinued'].map(function(v){return '<option value="'+v+'" '+(current===v?'selected':'')+'>'+labelStatus(v)+'</option>'}).join('')}
  function sourceBadge(product){
    if(product.effective_price_source==='admin_sale') return 'İndirim aktif';
    if(product.effective_price_source==='admin_override') return 'Admin fiyat';
    if(product.has_price_override) return 'Admin fiyat';
    return 'Katalog';
  }
  function priceField(slug,key,label,value,help,attrs){
    attrs=attrs||{};
    var type=attrs.type||'number';
    var extra=attrs.extra||'';
  return '<label class="cs-price-edit-label">'+esc(label)+'<input class="cs-row-input" data-price-'+key+'="'+esc(slug)+'" inputmode="'+(type==='number'?'numeric':'text')+'" type="'+type+'" '+extra+' value="'+esc(value==null?'':value)+'"><small class="cs-price-help">'+esc(help)+'</small></label>';
  }
  function validatePriceForm(slug){
    var regular=readNullableNumber(document.querySelector('[data-price-regular="'+CSS.escape(slug)+'"]'));
    var sale=readNullableNumber(document.querySelector('[data-price-sale="'+CSS.escape(slug)+'"]'));
    var compare=readNullableNumber(document.querySelector('[data-price-compare="'+CSS.escape(slug)+'"]'));
    var start=document.querySelector('[data-price-start="'+CSS.escape(slug)+'"]');
    var end=document.querySelector('[data-price-end="'+CSS.escape(slug)+'"]');
    if(!regular||regular<=0||!Number.isInteger(regular)) return 'Geçerli bir normal fiyat girin.';
    if(sale!=null){
      if(!Number.isInteger(sale)||sale<=0) return 'Geçerli bir indirimli fiyat girin.';
      if(sale>=regular) return 'İndirimli fiyat normal fiyattan düşük olmalıdır.';
    }
    if(compare!=null){
      if(!Number.isInteger(compare)||compare<=0) return 'Geçerli bir karşılaştırma fiyatı girin.';
      var payable=sale!=null?sale:regular;
      if(compare<=payable) return 'Karşılaştırma fiyatı indirimli fiyattan yüksek olmalıdır.';
    }
    var startIso=fromDatetimeLocalValue(start?.value||'');
    var endIso=fromDatetimeLocalValue(end?.value||'');
    if(startIso&&endIso&&Date.parse(endIso)<=Date.parse(startIso)) return 'İndirim tarihi aralığı geçerli değil.';
    return '';
  }
  function renderCatalogPrice(product){
    if(product.price_warning||product.catalog_price_warning){
      return '<div class="cs-catalog-price cs-catalog-price-warning"><span class="cs-price-warning">'+esc(product.price_warning||product.catalog_price_warning)+'</span></div>';
    }
    var regular=product.regular_price_try!=null?product.regular_price_try:product.catalog_price_try;
    var effective=product.effective_price_try!=null?product.effective_price_try:regular;
    var status=esc(product.price_status_label||sourceBadge(product));
    var html='<div class="cs-catalog-price"><strong>'+esc(fmtTry(effective))+'</strong><small>Katalog Fiyatı</small><small>Ödenecek fiyat</small><small>Durum: '+status+'</small><small>Kaynak: '+esc(sourceBadge(product))+'</small>';
    html+='<div class="cs-price-readout"><small>Normal: '+esc(fmtTry(regular))+'</small>';
    if(product.sale_price_try!=null) html+='<small>İndirimli: '+esc(fmtTry(product.sale_price_try))+'</small>';
    if(product.compare_at_price_try!=null) html+='<small>Üstü çizili: '+esc(fmtTry(product.compare_at_price_try))+'</small>';
    if(product.base_catalog_price_try!=null) html+='<small>Katalog baz: '+esc(fmtTry(product.base_catalog_price_try))+'</small>';
    html+='</div>';
    if(canEditPrice&&product.can_edit_price){
      html+='<div class="cs-price-edit-grid">';
      html+=priceField(product.slug,'regular','Normal fiyat',regular,'Ürünün varsayılan satış fiyatı.',' min="1" step="1"');
      html+=priceField(product.slug,'sale','İndirimli fiyat',product.sale_price_try,'Aktif olduğunda müşterinin ödeyeceği fiyat.',' min="1" step="1"');
      html+=priceField(product.slug,'compare','Üstü çizili fiyat',product.compare_at_price_try,'Sadece görsel karşılaştırma için kullanılır, tahsil edilmez.',' min="1" step="1"');
      html+=priceField(product.slug,'start','İndirim başlangıcı',toDatetimeLocalValue(product.sale_starts_at),'Boş bırakılırsa indirim hemen aktif kabul edilir.',{type:'datetime-local'});
      html+=priceField(product.slug,'end','İndirim bitişi',toDatetimeLocalValue(product.sale_ends_at),'Boş bırakılırsa indirim süresiz kalır.',{type:'datetime-local'});
      html+='<label class="cs-price-edit-label">Değişiklik nedeni<textarea class="cs-row-input" data-price-reason="'+esc(product.slug)+'" rows="2" placeholder="Opsiyonel not">'+esc(product.price_override_reason||'')+'</textarea></label>';
      html+='<div class="cs-price-edit-actions"><button class="cs-btn cs-btn-dark" data-price-save="'+esc(product.slug)+'" type="button">Fiyatı güncelle</button><small class="cs-price-error" data-price-error="'+esc(product.slug)+'"></small></div>';
      html+='</div>';
    } else if(product.price_edit_blocked_reason){
      html+='<small class="cs-price-note">'+esc(product.price_edit_blocked_reason)+'</small>';
    } else if(!canEditPrice){
      html+='<small class="cs-price-note">Fiyat salt okunur. Düzenleme için products:pricing:update yetkisi gerekir.</small>';
    }
    html+='<details class="cs-price-history" data-price-history="'+esc(product.slug)+'"><summary>Fiyat Geçmişi</summary><div class="cs-price-history-body" data-price-history-body="'+esc(product.slug)+'"><small class="cs-price-note">Yükleniyor…</small></div></details>';
    html+='</div>';
    return html;
  }
  async function load(){var t=token();if(!t){notice('Admin token gerekli',true);return}sessionStorage.setItem(TOKEN_KEY,t);var res=await fetch('/api/admin/products',{headers:{'x-admin-token':t}});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||'Ürünler yüklenemedi');products=data.products||[];canEditPrice=Boolean(data.permissions&&data.permissions.can_edit_price);render();notice('Ürün listesi güncel')}
  function render(){var q=($('#adminProductSearch')?.value||'').toLowerCase();var list=products.filter(function(p){return [p.name,p.brand,p.slug,p.catalog_title].join(' ').toLowerCase().includes(q)});$('#adminStockCount').textContent=fmt(list.reduce(function(s,p){return s+Number(p.inventory?.stock_qty||p.inventory?.stock_on_hand||0)},0));$('#adminLowStockCount').textContent=fmt(list.filter(function(p){return Number(p.inventory?.stock_qty||p.inventory?.stock_on_hand||0)<=Number(p.inventory?.low_stock_threshold||5)}).length);$('#adminInactiveCount').textContent=fmt(list.filter(function(p){return !['active','preorder'].includes(String(p.inventory?.status||'active'))}).length);$('#adminProductsBody').innerHTML=list.map(function(p){var inv=p.inventory||{};var stock=inv.stock_qty??inv.stock_on_hand??0;var sku=inv.sku||p.slug.toUpperCase().replace(/-/g,'_');return '<tr><td><strong>'+esc(p.catalog_title||p.name)+'</strong><br><small>'+esc(p.catalog_slug||p.slug)+'</small></td><td>'+esc(p.brand)+'</td><td>'+renderCatalogPrice(p)+'</td><td><input class="cs-row-input" data-stock="'+esc(p.slug)+'" value="'+esc(stock)+'" type="number" min="0"></td><td><select class="cs-row-select" data-status="'+esc(p.slug)+'">'+statusOptions(inv.status||'active')+'</select></td><td><input class="cs-row-input" style="width:150px" data-sku="'+esc(p.slug)+'" value="'+esc(sku)+'"></td><td><button class="cs-btn cs-btn-ghost" data-save="'+esc(p.slug)+'" type="button">Kaydet</button></td></tr>'}).join('')||'<tr><td colspan="7">Sonuç yok.</td></tr>'}
  async function save(slug){var body={product_slug:slug,stock_qty:Number(document.querySelector('[data-stock="'+CSS.escape(slug)+'"]').value||0),status:document.querySelector('[data-status="'+CSS.escape(slug)+'"]').value,sku:document.querySelector('[data-sku="'+CSS.escape(slug)+'"]').value};var res=await fetch('/api/admin/products',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-token':token()},body:JSON.stringify(body)});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)notice(data.error||'Kaydedilemedi',true);else load()}
  async function savePrice(slug){
    var errHost=document.querySelector('[data-price-error="'+CSS.escape(slug)+'"]');
    var btn=document.querySelector('[data-price-save="'+CSS.escape(slug)+'"]');
    var inlineError=validatePriceForm(slug);
    if(inlineError){if(errHost) errHost.textContent=inlineError;notice(inlineError,true);return}
    if(errHost) errHost.textContent='';
    var regular=readNullableNumber(document.querySelector('[data-price-regular="'+CSS.escape(slug)+'"]'));
    var sale=readNullableNumber(document.querySelector('[data-price-sale="'+CSS.escape(slug)+'"]'));
    var compare=readNullableNumber(document.querySelector('[data-price-compare="'+CSS.escape(slug)+'"]'));
    var start=document.querySelector('[data-price-start="'+CSS.escape(slug)+'"]');
    var end=document.querySelector('[data-price-end="'+CSS.escape(slug)+'"]');
    var reasonInput=document.querySelector('[data-price-reason="'+CSS.escape(slug)+'"]');
    var body={
      regular_price_try:regular,
      sale_price_try:sale,
      compare_at_price_try:compare,
      sale_starts_at:fromDatetimeLocalValue(start?.value||''),
      sale_ends_at:fromDatetimeLocalValue(end?.value||''),
      reason:String(reasonInput?.value||'').trim()
    };
    if(btn){btn.disabled=true;btn.textContent='Kaydediliyor…'}
    try{
      var res=await fetch('/api/admin/products/'+encodeURIComponent(slug)+'/price',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-token':token()},body:JSON.stringify(body)});
      var data=await res.json().catch(function(){return{}});
      if(!res.ok||data.ok===false){
        var msg=data.error||'Fiyat güncellenemedi';
        if(errHost) errHost.textContent=msg;
        notice(msg,true);
        return;
      }
      notice('Fiyat güncellendi');
      var historyHost=document.querySelector('[data-price-history-body="'+CSS.escape(slug)+'"]');
      if(historyHost){historyHost.removeAttribute('data-loaded')}
      await load();
      var historyBox=document.querySelector('[data-price-history="'+CSS.escape(slug)+'"]');
      if(historyBox&&historyBox.open) await loadPriceHistory(slug,true);
    } finally {
      if(btn){btn.disabled=false;btn.textContent='Fiyatı güncelle'}
    }
  }
  async function loadPriceHistory(slug,force){
    var host=document.querySelector('[data-price-history-body="'+CSS.escape(slug)+'"]');
    if(!host) return;
    if(host.dataset.loaded==='true'&&!force) return;
    host.innerHTML='<small class="cs-price-note">Yükleniyor…</small>';
    var res=await fetch('/api/admin/products/'+encodeURIComponent(slug)+'/price-history?limit=20',{headers:{'x-admin-token':token()}});
    var data=await res.json().catch(function(){return{}});
    if(!res.ok||data.ok===false){host.innerHTML='<small class="cs-price-note">Fiyat geçmişi yüklenemedi.</small>';return;}
    var items=Array.isArray(data.items)?data.items:[];
    if(!items.length){host.innerHTML='<small class="cs-price-note">Bu ürün için henüz fiyat değişikliği yok.</small>';host.dataset.loaded='true';return;}
    host.innerHTML=items.map(function(row){
      var who=esc(row.changed_by_admin||'—');
      var when=esc(fmtDateTime(row.changed_at));
      var reason=esc(row.reason||'');
      var src=esc(row.source||'admin');
      var label=esc(row.event_label||'Fiyat güncellendi');
      var lines=[];
      if(row.old_regular_price_try!==row.new_regular_price_try||row.new_regular_price_try!=null){
        lines.push('Normal: '+(row.old_regular_price_try!=null?fmtTry(row.old_regular_price_try):'—')+' → '+fmtTry(row.new_regular_price_try));
      }
      if(row.old_sale_price_try!==row.new_sale_price_try){
        lines.push('İndirimli: '+(row.old_sale_price_try!=null?fmtTry(row.old_sale_price_try):'—')+' → '+(row.new_sale_price_try!=null?fmtTry(row.new_sale_price_try):'—'));
      }
      if(row.old_compare_at_price_try!==row.new_compare_at_price_try){
        lines.push('Üstü çizili: '+(row.old_compare_at_price_try!=null?fmtTry(row.old_compare_at_price_try):'—')+' → '+(row.new_compare_at_price_try!=null?fmtTry(row.new_compare_at_price_try):'—'));
      }
      if(row.old_sale_starts_at!==row.new_sale_starts_at||row.old_sale_ends_at!==row.new_sale_ends_at){
        lines.push('Dönem: '+(row.old_sale_starts_at?fmtDateTime(row.old_sale_starts_at):'—')+' → '+(row.new_sale_starts_at?fmtDateTime(row.new_sale_starts_at):'—')+' / '+(row.old_sale_ends_at?fmtDateTime(row.old_sale_ends_at):'—')+' → '+(row.new_sale_ends_at?fmtDateTime(row.new_sale_ends_at):'—'));
      }
      var detail=lines.length?('<small>'+lines.map(esc).join('<br>')+'</small>'):'';
      return '<div class="cs-price-history-row"><div><strong>'+label+'</strong><small>'+when+(who&&who!=='—'?' · '+who:'')+'</small></div>'+detail+(reason?'<small class="cs-price-history-reason">'+reason+'</small>':'')+'<small class="cs-price-history-meta">Kaynak: '+src+'</small></div>';
    }).join('');
    host.dataset.loaded='true';
  }
  document.addEventListener('click',function(e){if(e.target.id==='adminProductLoad')load().catch(function(err){notice(err.message,true)});var saveBtn=e.target.closest('[data-save]');if(saveBtn)save(saveBtn.dataset.save);var priceBtn=e.target.closest('[data-price-save]');if(priceBtn)savePrice(priceBtn.dataset.priceSave).catch(function(err){notice(err.message,true)})});
  $('#adminProductSearch')?.addEventListener('input',render);
  if($('#adminToken'))$('#adminToken').value=sessionStorage.getItem(TOKEN_KEY)||'';
  document.addEventListener('toggle',function(e){var box=e.target&&e.target.closest&&e.target.closest('[data-price-history]');if(!box||box.tagName!=='DETAILS') return; if(box.open) loadPriceHistory(box.getAttribute('data-price-history')).catch(function(err){notice(err.message,true)})},true);
}());
