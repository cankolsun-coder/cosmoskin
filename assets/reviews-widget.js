/**
 * COSMOSKIN — Reviews Widget v3
 * Fixes: POST create, PATCH edit, image upload, correct field names, user-friendly errors
 */
(function(){
'use strict';

var API = '/api/reviews';
var MAX_PHOTOS = 5;
var MAX_MB     = 5;

function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtDate(ts){
  if(!ts) return '';
  var d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'});
}

function stars(n, size){
  size = size || 14;
  var s = '<span class="csr-stars" aria-label="'+n+' / 5">';
  for(var i=1;i<=5;i++){
    s += '<svg width="'+size+'" height="'+size+'" viewBox="0 0 20 20">' +
         '<path d="M10 1l2.7 5.7 6.3.6-4.7 4.3 1.4 6.2L10 14.7 4.3 17.8l1.4-6.2L1 7.3l6.3-.6z"' +
         ' fill="'+(i<=n?'#16120e':'rgba(22,18,14,.18)')+'" stroke="none"/></svg>';
  }
  return s+'</span>';
}

function starSelector(idPrefix){
  return '<div class="csr-rating" id="'+idPrefix+'Rating" role="radiogroup" aria-label="Puan seçin">'+
    [1,2,3,4,5].map(function(n){
      return '<button type="button" class="csr-rstar" data-v="'+n+'" aria-label="'+n+' yıldız">'+
        '<svg width="24" height="24" viewBox="0 0 20 20">'+
        '<path d="M10 1l2.7 5.7 6.3.6-4.7 4.3 1.4 6.2L10 14.7 4.3 17.8l1.4-6.2L1 7.3l6.3-.6z" class="rstar-path"/></svg>'+
      '</button>';
    }).join('')+
  '</div>'+
  '<input type="hidden" id="'+idPrefix+'RatingVal" value="0"/>';
}

function bindStarSelector(container, idPrefix){
  var ratingEl  = container.querySelector('#'+idPrefix+'Rating');
  var ratingVal = container.querySelector('#'+idPrefix+'RatingVal');
  if(!ratingEl || !ratingVal) return;
  ratingEl.addEventListener('click', function(e){
    var b = e.target.closest('.csr-rstar');
    if(!b) return;
    var v = Number(b.dataset.v);
    ratingVal.value = v;
    ratingEl.querySelectorAll('.csr-rstar').forEach(function(s,i){
      s.querySelector('.rstar-path').setAttribute('fill', i<v?'#16120e':'rgba(22,18,14,.18)');
    });
  });
}

function setRating(container, idPrefix, n){
  var ratingEl  = container.querySelector('#'+idPrefix+'Rating');
  var ratingVal = container.querySelector('#'+idPrefix+'RatingVal');
  if(!ratingEl || !ratingVal) return;
  ratingVal.value = n;
  ratingEl.querySelectorAll('.csr-rstar').forEach(function(s,i){
    s.querySelector('.rstar-path').setAttribute('fill', i<n?'#16120e':'rgba(22,18,14,.18)');
  });
}

function setMsg(el, txt, type){
  if(!el) return;
  el.textContent = txt;
  el.className   = 'csr-msg' + (type ? ' csr-msg--'+type : '');
}

/* ── Photo preview ── */
function buildPhotoPreview(files){
  if(!files || !files.length) return '';
  var html = '<div class="csr-photo-preview">';
  for(var i=0;i<files.length;i++){
    var url = URL.createObjectURL(files[i]);
    html += '<div class="csr-photo-thumb"><img src="'+url+'" alt="Görsel '+(i+1)+'" loading="lazy"/></div>';
  }
  html += '</div>';
  return html;
}

/* ── Main widget factory ── */
function widget(host){
  var slug = host.dataset.productSlug || host.getAttribute('data-product-slug') || '';
  if(!slug){ host.textContent=''; return; }

  host.innerHTML = '<div class="csr-loading">Yorumlar yükleniyor…</div>';

  var currentReviews = [];

  function load(){
    return fetch(API+'?product_slug='+encodeURIComponent(slug))
      .then(function(r){ return r.json(); })
      .then(function(data){
        currentReviews = data.reviews || [];
        render(data);
      })
      .catch(function(){
        host.innerHTML = '<p class="csr-empty">Yorumlar yüklenemedi. Lütfen sayfayı yenileyin.</p>';
      });
  }

  function render(data){
    var list    = data.reviews || [];
    var summary = data.summary || {};

    var avgRaw = summary.avg_rating != null ? summary.avg_rating : (data.average || 0);
    var cntRaw = summary.approved_count != null ? summary.approved_count : (data.count || list.length);

    var html = '<div class="csr-bar">'+
      '<div class="csr-bar__left">'+
        '<div class="csr-avg">'+Number(avgRaw).toFixed(1)+'</div>'+
        stars(Math.round(avgRaw), 16)+
        '<div class="csr-count">'+cntRaw+' değerlendirme</div>'+
      '</div>'+
      '<button class="csr-write" type="button" id="csrWriteBtn">Yorum Yaz</button>'+
    '</div>';

    /* ── Write form ── */
    html += '<form class="csr-form" id="csrWriteForm" style="display:none" novalidate>'+
      '<h4>Yorum Yazın</h4>'+
      '<div class="csr-row"><label>Puan <span aria-hidden="true">*</span></label>'+
        starSelector('write')+
      '</div>'+
      '<div class="csr-row"><label>Ad Soyad <span aria-hidden="true">*</span></label>'+
        '<input type="text" name="name" maxlength="80" autocomplete="name"/></div>'+
      '<div class="csr-row"><label>E-posta <span class="csr-opt">(yayınlanmaz)</span></label>'+
        '<input type="email" name="email" maxlength="200" autocomplete="email"/></div>'+
      '<div class="csr-row"><label>Başlık</label>'+
        '<input type="text" name="title" maxlength="120"/></div>'+
      '<div class="csr-row"><label>Yorum <span aria-hidden="true">*</span></label>'+
        '<textarea name="body" maxlength="2000" rows="4"></textarea></div>'+
      '<div class="csr-row">'+
        '<label>Fotoğraf <span class="csr-opt">(en fazla '+MAX_PHOTOS+' adet, her biri '+MAX_MB+' MB)</span></label>'+
        '<input type="file" id="csrWritePhotos" accept="image/jpeg,image/png,image/webp" multiple/>'+
        '<div id="csrWritePhotoPreview"></div>'+
      '</div>'+
      '<div class="csr-form-footer">'+
        '<button type="button" class="csr-cancel" id="csrWriteCancel">İptal</button>'+
        '<button type="submit" class="csr-submit">Gönder</button>'+
      '</div>'+
      '<div class="csr-msg" id="csrWriteMsg"></div>'+
    '</form>';

    /* ── Reviews list ── */
    if(list.length){
      html += '<div class="csr-list" id="csrList">';
      list.forEach(function(r){
        var displayName = r.user_display_name || r.name || 'Anonim';
        var reviewImages = r.review_images || [];
        html += '<article class="csr-item" data-review-id="'+esc(r.id)+'">' +
          '<header>' +
            '<div class="csr-item__meta">'+
              '<strong>'+esc(displayName)+'</strong>'+
              '<time>'+fmtDate(r.created_at)+'</time>'+
              (r.updated_at ? '<span class="csr-edited">düzenlendi</span>' : '')+
            '</div>'+
            stars(r.rating, 13)+
          '</header>'+
          (r.title ? '<h5 class="csr-item__title">'+esc(r.title)+'</h5>' : '')+
          '<p class="csr-item__body">'+esc(r.body)+'</p>';

        if(reviewImages.length){
          html += '<div class="csr-item__photos">';
          reviewImages.forEach(function(img){
            html += '<a href="'+esc(img.url||img.public_url)+'" target="_blank" rel="noopener" class="csr-item__photo-link">'+
              '<img src="'+esc(img.url||img.public_url)+'" alt="Yorum görseli" loading="lazy" class="csr-item__photo"/>'+
            '</a>';
          });
          html += '</div>';
        }

        html += '<div class="csr-item__actions">'+
          '<button class="csr-edit-btn" type="button" data-id="'+esc(r.id)+'" '+
            'data-rating="'+esc(r.rating)+'" '+
            'data-title="'+esc(r.title||'')+'" '+
            'data-body="'+esc(r.body||'')+'"'+
          '>Düzenle</button>'+
        '</div>';

        html += '</article>';
      });
      html += '</div>';
    } else {
      html += '<p class="csr-empty">Henüz yorum yapılmamış. İlk yorumu siz yazın.</p>';
    }

    /* ── Edit form (hidden, single shared instance) ── */
    html += '<form class="csr-form csr-edit-form" id="csrEditForm" style="display:none" novalidate>'+
      '<h4>Yorumu Düzenle</h4>'+
      '<input type="hidden" id="csrEditId"/>'+
      '<div class="csr-row"><label>Puan <span aria-hidden="true">*</span></label>'+
        starSelector('edit')+
      '</div>'+
      '<div class="csr-row"><label>Başlık</label>'+
        '<input type="text" id="csrEditTitle" maxlength="120"/></div>'+
      '<div class="csr-row"><label>Yorum <span aria-hidden="true">*</span></label>'+
        '<textarea id="csrEditBody" maxlength="2000" rows="4"></textarea></div>'+
      '<div class="csr-row">'+
        '<label>Fotoğraf Ekle <span class="csr-opt">(en fazla '+MAX_PHOTOS+' adet, '+MAX_MB+' MB)</span></label>'+
        '<input type="file" id="csrEditPhotos" accept="image/jpeg,image/png,image/webp" multiple/>'+
        '<div id="csrEditPhotoPreview"></div>'+
      '</div>'+
      '<div class="csr-form-footer">'+
        '<button type="button" class="csr-cancel" id="csrEditCancel">İptal</button>'+
        '<button type="submit" class="csr-submit">Güncelle</button>'+
      '</div>'+
      '<div class="csr-msg" id="csrEditMsg"></div>'+
    '</form>';

    host.innerHTML = html;
    bindForms();
  }

  function bindForms(){
    var writeBtn    = host.querySelector('#csrWriteBtn');
    var writeForm   = host.querySelector('#csrWriteForm');
    var writeCancel = host.querySelector('#csrWriteCancel');
    var writeMsg    = host.querySelector('#csrWriteMsg');
    var writePhotos = host.querySelector('#csrWritePhotos');
    var writePhPrev = host.querySelector('#csrWritePhotoPreview');
    var editForm    = host.querySelector('#csrEditForm');
    var editCancel  = host.querySelector('#csrEditCancel');
    var editMsg     = host.querySelector('#csrEditMsg');
    var editPhotos  = host.querySelector('#csrEditPhotos');
    var editPhPrev  = host.querySelector('#csrEditPhotoPreview');

    bindStarSelector(host, 'write');
    bindStarSelector(host, 'edit');

    /* Photo preview bindings */
    if(writePhotos) writePhotos.addEventListener('change', function(){
      if(writePhPrev) writePhPrev.innerHTML = buildPhotoPreview(this.files);
    });
    if(editPhotos) editPhotos.addEventListener('change', function(){
      if(editPhPrev) editPhPrev.innerHTML = buildPhotoPreview(this.files);
    });

    /* Write form open/close */
    if(writeBtn) writeBtn.addEventListener('click', function(){
      writeForm.style.display = 'block';
      writeBtn.style.display  = 'none';
      writeForm.scrollIntoView({behavior:'smooth',block:'start'});
    });
    if(writeCancel) writeCancel.addEventListener('click', function(){
      writeForm.style.display = 'block' === writeForm.style.display ? 'none' : 'none';
      writeForm.reset();
      if(writePhPrev) writePhPrev.innerHTML = '';
      if(writeBtn) writeBtn.style.display = '';
      setMsg(writeMsg,'','');
    });

    /* Edit form open/close */
    host.addEventListener('click', function(e){
      var btn = e.target.closest('.csr-edit-btn');
      if(!btn) return;
      var id      = btn.dataset.id;
      var rating  = Number(btn.dataset.rating) || 0;
      var title   = btn.dataset.title || '';
      var body    = btn.dataset.body  || '';

      host.querySelector('#csrEditId').value   = id;
      host.querySelector('#csrEditTitle').value = title;
      host.querySelector('#csrEditBody').value  = body;
      setRating(host, 'edit', rating);

      editForm.style.display = 'block';
      editForm.scrollIntoView({behavior:'smooth',block:'start'});
      setMsg(editMsg,'','');
    });
    if(editCancel) editCancel.addEventListener('click', function(){
      editForm.style.display = 'none';
      editForm.reset();
      if(editPhPrev) editPhPrev.innerHTML = '';
      setMsg(editMsg,'','');
    });

    /* ── WRITE submit ── */
    if(writeForm) writeForm.addEventListener('submit', function(e){
      e.preventDefault();
      var fd      = new FormData(writeForm);
      var rating  = Number(host.querySelector('#writeRatingVal').value || 0);
      var name    = String(fd.get('name')||'').trim();
      var email   = String(fd.get('email')||'').trim();
      var title   = String(fd.get('title')||'').trim();
      var body    = String(fd.get('body')||'').trim();
      var photos  = writePhotos ? writePhotos.files : null;

      if(!rating)      { setMsg(writeMsg,'Lütfen puan seçin.','err'); return; }
      if(!name)        { setMsg(writeMsg,'Lütfen adınızı girin.','err'); return; }
      if(body.length<10){ setMsg(writeMsg,'Yorum en az 10 karakter olmalı.','err'); return; }

      if(photos && photos.length > MAX_PHOTOS){
        setMsg(writeMsg,'En fazla '+MAX_PHOTOS+' fotoğraf ekleyebilirsiniz.','err'); return;
      }
      if(photos){
        for(var i=0;i<photos.length;i++){
          if(photos[i].size > MAX_MB*1024*1024){
            setMsg(writeMsg,'Her fotoğraf en fazla '+MAX_MB+' MB olabilir.','err'); return;
          }
        }
      }

      var submit = writeForm.querySelector('.csr-submit');
      submit.disabled = true; submit.textContent = 'Gönderiliyor…';

      var payload = { product_slug:slug, name:name, email:email, title:title, body:body, rating:rating };

      fetch(API, {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify(payload)
      })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d.ok === false) throw new Error(d.error || 'Bir sorun oluştu.');
          var reviewId = d.id;

          /* Upload photos sequentially if any */
          var photoChain = Promise.resolve();
          if(photos && photos.length && reviewId){
            for(var i=0;i<photos.length;i++){
              (function(f){
                photoChain = photoChain.then(function(){
                  return uploadPhoto(reviewId, f).catch(function(){/* ignore photo errors */});
                });
              })(photos[i]);
            }
          }
          return photoChain;
        })
        .then(function(){
          setMsg(writeMsg,'Yorumunuz alındı. Onaydan sonra yayınlanacak. Teşekkürler.','ok');
          writeForm.reset();
          if(writePhPrev) writePhPrev.innerHTML = '';
          setTimeout(function(){
            writeForm.style.display='none';
            if(writeBtn) writeBtn.style.display='';
            setMsg(writeMsg,'','');
          }, 3000);
        })
        .catch(function(err){
          setMsg(writeMsg, friendlyError(err.message),'err');
        })
        .finally(function(){ submit.disabled=false; submit.textContent='Gönder'; });
    });

    /* ── EDIT submit ── */
    if(editForm) editForm.addEventListener('submit', function(e){
      e.preventDefault();
      var reviewId = host.querySelector('#csrEditId').value;
      if(!reviewId){ setMsg(editMsg,'Yorum ID bulunamadı.','err'); return; }

      var rating = Number(host.querySelector('#editRatingVal').value || 0);
      var title  = host.querySelector('#csrEditTitle').value.trim();
      var body   = host.querySelector('#csrEditBody').value.trim();
      var photos = editPhotos ? editPhotos.files : null;

      if(!rating)       { setMsg(editMsg,'Lütfen puan seçin.','err'); return; }
      if(body.length<10){ setMsg(editMsg,'Yorum en az 10 karakter olmalı.','err'); return; }

      if(photos && photos.length > MAX_PHOTOS){
        setMsg(editMsg,'En fazla '+MAX_PHOTOS+' fotoğraf ekleyebilirsiniz.','err'); return;
      }
      if(photos){
        for(var i=0;i<photos.length;i++){
          if(photos[i].size > MAX_MB*1024*1024){
            setMsg(editMsg,'Her fotoğraf en fazla '+MAX_MB+' MB olabilir.','err'); return;
          }
        }
      }

      var submit = editForm.querySelector('.csr-submit');
      submit.disabled = true; submit.textContent = 'Güncelleniyor…';

      /* PATCH request with JSON */
      fetch(API+'/'+encodeURIComponent(reviewId), {
        method:  'PATCH',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({ rating:rating, title:title, body:body })
      })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d.ok === false) throw new Error(d.error || 'Bir sorun oluştu.');

          /* Upload new photos if selected */
          var photoChain = Promise.resolve();
          if(photos && photos.length){
            for(var i=0;i<photos.length;i++){
              (function(f){
                photoChain = photoChain.then(function(){
                  return uploadPhoto(reviewId, f).catch(function(){/* ignore photo errors */});
                });
              })(photos[i]);
            }
          }
          return photoChain;
        })
        .then(function(){
          setMsg(editMsg,'Yorumunuz güncellendi. Onaydan sonra tekrar yayınlanacak.','ok');
          if(editPhPrev) editPhPrev.innerHTML = '';
          setTimeout(function(){
            editForm.style.display='none';
            editForm.reset();
            setMsg(editMsg,'','');
            /* Reload to reflect state */
            load();
          }, 2800);
        })
        .catch(function(err){
          setMsg(editMsg, friendlyError(err.message),'err');
        })
        .finally(function(){ submit.disabled=false; submit.textContent='Güncelle'; });
    });
  }

  function uploadPhoto(reviewId, file){
    var fd = new FormData();
    fd.append('image', file);
    /* Do NOT set Content-Type manually — browser sets boundary automatically */
    return fetch(API+'/'+encodeURIComponent(reviewId)+'/images', {
      method: 'POST',
      body:   fd
    }).then(function(r){ return r.json(); });
  }

  function friendlyError(msg){
    if(!msg) return 'Yorumunuz işlenirken bir sorun oluştu. Lütfen tekrar deneyin.';
    if(msg.toLowerCase().indexOf('method') !== -1) {
      return 'Yorumunuz işlenirken bir sorun oluştu. Lütfen tekrar deneyin.';
    }
    /* Pass through server-side validation messages */
    return msg;
  }

  load();
}

function init(){
  document.querySelectorAll('[data-cs-reviews]').forEach(widget);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
