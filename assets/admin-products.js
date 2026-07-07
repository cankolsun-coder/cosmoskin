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
  function labelStatus(v){return {active:'Aktif',out_of_stock:'Stokta yok',draft:'Hazırlık',preorder:'Ön sipariş',inactive:'Pasif',discontinued:'Satıştan kaldırıldı'}[v]||v}
  function statusOptions(current){return ['active','out_of_stock','draft','preorder','inactive','discontinued'].map(function(v){return '<option value="'+v+'" '+(current===v?'selected':'')+'>'+labelStatus(v)+'</option>'}).join('')}
  function sourceBadge(product){
    if(product.effective_price_source==='admin_override')return 'Admin override';
    if(product.has_price_override)return 'Admin override';
    return 'Katalog';
  }
  function renderCatalogPrice(product){
    if(product.price_warning||product.catalog_price_warning){
      return '<div class="cs-catalog-price cs-catalog-price-warning"><span class="cs-price-warning">'+esc(product.price_warning||product.catalog_price_warning)+'</span></div>';
    }
    var effective=product.effective_price_try!=null?product.effective_price_try:product.catalog_price_try;
    var html='<div class="cs-catalog-price"><strong>'+esc(fmtTry(effective))+'</strong><small>Katalog Fiyatı</small><small>Kaynak: '+esc(sourceBadge(product))+'</small>';
    if(product.has_price_override&&product.base_catalog_price_try!=null){
      html+='<small>Katalog baz fiyatı: '+esc(fmtTry(product.base_catalog_price_try))+'</small>';
    } else {
      html+='<small>Kaynak dosya: products.json</small>';
    }
    if(canEditPrice&&product.can_edit_price){
      html+='<label class="cs-price-edit-label">Yeni fiyat (TRY)<input class="cs-row-input" data-price-input="'+esc(product.slug)+'" inputmode="numeric" type="number" min="1" step="1" value="'+esc(effective)+'"></label>';
      html+='<label class="cs-price-edit-label">Değişiklik notu<textarea class="cs-row-input" data-price-reason="'+esc(product.slug)+'" rows="2" placeholder="Opsiyonel not">'+esc(product.price_override_reason||'')+'</textarea></label>';
      html+='<button class="cs-btn cs-btn-dark" data-price-save="'+esc(product.slug)+'" type="button">Fiyatı güncelle</button>';
    } else if(product.price_edit_blocked_reason){
      html+='<small class="cs-price-note">'+esc(product.price_edit_blocked_reason)+'</small>';
    } else if(!canEditPrice){
      html+='<small class="cs-price-note">Fiyat salt okunur. Düzenleme için products:pricing:update yetkisi gerekir.</small>';
    }
    html+='</div>';
    return html;
  }
  async function load(){var t=token();if(!t){notice('Admin token gerekli',true);return}sessionStorage.setItem(TOKEN_KEY,t);var res=await fetch('/api/admin/products',{headers:{'x-admin-token':t}});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||'Ürünler yüklenemedi');products=data.products||[];canEditPrice=Boolean(data.permissions&&data.permissions.can_edit_price);render();notice('Ürün listesi güncel')}
  function render(){var q=($('#adminProductSearch')?.value||'').toLowerCase();var list=products.filter(function(p){return [p.name,p.brand,p.slug,p.catalog_title].join(' ').toLowerCase().includes(q)});$('#adminStockCount').textContent=fmt(list.reduce(function(s,p){return s+Number(p.inventory?.stock_qty||p.inventory?.stock_on_hand||0)},0));$('#adminLowStockCount').textContent=fmt(list.filter(function(p){return Number(p.inventory?.stock_qty||p.inventory?.stock_on_hand||0)<=Number(p.inventory?.low_stock_threshold||5)}).length);$('#adminInactiveCount').textContent=fmt(list.filter(function(p){return !['active','preorder'].includes(String(p.inventory?.status||'active'))}).length);$('#adminProductsBody').innerHTML=list.map(function(p){var inv=p.inventory||{};var stock=inv.stock_qty??inv.stock_on_hand??0;var sku=inv.sku||p.slug.toUpperCase().replace(/-/g,'_');return '<tr><td><strong>'+esc(p.catalog_title||p.name)+'</strong><br><small>'+esc(p.catalog_slug||p.slug)+'</small></td><td>'+esc(p.brand)+'</td><td>'+renderCatalogPrice(p)+'</td><td><input class="cs-row-input" data-stock="'+esc(p.slug)+'" value="'+esc(stock)+'" type="number" min="0"></td><td><select class="cs-row-select" data-status="'+esc(p.slug)+'">'+statusOptions(inv.status||'active')+'</select></td><td><input class="cs-row-input" style="width:150px" data-sku="'+esc(p.slug)+'" value="'+esc(sku)+'"></td><td><button class="cs-btn cs-btn-ghost" data-save="'+esc(p.slug)+'" type="button">Kaydet</button></td></tr>'}).join('')||'<tr><td colspan="7">Sonuç yok.</td></tr>'}
  async function save(slug){var body={product_slug:slug,stock_qty:Number(document.querySelector('[data-stock="'+CSS.escape(slug)+'"]').value||0),status:document.querySelector('[data-status="'+CSS.escape(slug)+'"]').value,sku:document.querySelector('[data-sku="'+CSS.escape(slug)+'"]').value};var res=await fetch('/api/admin/products',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-token':token()},body:JSON.stringify(body)});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)notice(data.error||'Kaydedilemedi',true);else load()}
  async function savePrice(slug){var priceInput=document.querySelector('[data-price-input="'+CSS.escape(slug)+'"]');var reasonInput=document.querySelector('[data-price-reason="'+CSS.escape(slug)+'"]');var body={regular_price_try:Number(priceInput?.value||0),reason:String(reasonInput?.value||'').trim()};var res=await fetch('/api/admin/products/'+encodeURIComponent(slug)+'/price',{method:'PATCH',headers:{'Content-Type':'application/json','x-admin-token':token()},body:JSON.stringify(body)});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false){notice(data.error||'Fiyat güncellenemedi',true);return}notice('Fiyat güncellendi');load()}
  document.addEventListener('click',function(e){if(e.target.id==='adminProductLoad')load().catch(function(err){notice(err.message,true)});var saveBtn=e.target.closest('[data-save]');if(saveBtn)save(saveBtn.dataset.save);var priceBtn=e.target.closest('[data-price-save]');if(priceBtn)savePrice(priceBtn.dataset.priceSave).catch(function(err){notice(err.message,true)})});$('#adminProductSearch')?.addEventListener('input',render);if($('#adminToken'))$('#adminToken').value=sessionStorage.getItem(TOKEN_KEY)||'';
}());
