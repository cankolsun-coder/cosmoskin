(function(){
'use strict';

var API = '/api/reviews';

function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtDate(ts){
  var d = new Date(Number(ts));
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'});
}

function stars(n, size){
  size = size || 14;
  var s = '<span class="csr-stars" aria-label="' + n + ' / 5">';
  for(var i=1;i<=5;i++){
    s += '<svg width="'+size+'" height="'+size+'" viewBox="0 0 20 20">' +
         '<path d="M10 1l2.7 5.7 6.3.6-4.7 4.3 1.4 6.2L10 14.7 4.3 17.8l1.4-6.2L1 7.3l6.3-.6z"' +
         ' fill="' + (i<=n?'#16120e':'rgba(22,18,14,.18)') + '" stroke="none"/></svg>';
  }
  return s + '</span>';
}

function widget(host){
  var slug = host.dataset.productSlug || host.getAttribute('data-product-slug') || '';
  if(!slug){ host.textContent = ''; return; }

  host.innerHTML = '<div class="csr-loading">Yorumlar yükleniyor…</div>';

  function render(data){
    var list = data.reviews || [];

    var html = '<div class="csr-bar">' +
      '<div class="csr-bar__left">' +
        '<div class="csr-avg">' + (data.average || 0).toFixed(1) + '</div>' +
        stars(Math.round(data.average || 0), 16) +
        '<div class="csr-count">' + (data.count || 0) + ' değerlendirme</div>' +
      '</div>' +
      '<button class="csr-write" type="button" id="csrWriteBtn">Yorum Yaz</button>' +
    '</div>';

    html += '<form class="csr-form" id="csrForm" style="display:none" novalidate>' +
      '<h4>Yorumunuzu paylaşın</h4>' +
      '<div class="csr-row"><label>Puan <span aria-hidden="true">*</span></label>' +
        '<div class="csr-rating" id="csrRating" role="radiogroup" aria-label="Puan seçin">' +
          [1,2,3,4,5].map(function(n){
            return '<button type="button" class="csr-rstar" data-v="'+n+'" aria-label="'+n+' yıldız">' +
              '<svg width="24" height="24" viewBox="0 0 20 20"><path d="M10 1l2.7 5.7 6.3.6-4.7 4.3 1.4 6.2L10 14.7 4.3 17.8l1.4-6.2L1 7.3l6.3-.6z" class="rstar-path"/></svg>' +
            '</button>';
          }).join('') +
        '</div>' +
        '<input type="hidden" id="csrRatingVal" value="0"/>' +
      '</div>' +
      '<div class="csr-row"><label>Ad Soyad <span aria-hidden="true">*</span></label><input type="text" name="name" maxlength="80" autocomplete="name"/></div>' +
      '<div class="csr-row"><label>E-posta <span class="csr-opt">(yayınlanmaz)</span></label><input type="email" name="email" maxlength="200" autocomplete="email"/></div>' +
      '<div class="csr-row"><label>Başlık</label><input type="text" name="title" maxlength="120"/></div>' +
      '<div class="csr-row"><label>Yorum <span aria-hidden="true">*</span></label><textarea name="body" maxlength="2000" rows="4"></textarea></div>' +
      '<div class="csr-form-footer">' +
        '<button type="button" class="csr-cancel" id="csrCancel">İptal</button>' +
        '<button type="submit" class="csr-submit" id="csrSubmit">Gönder</button>' +
      '</div>' +
      '<div class="csr-msg" id="csrMsg"></div>' +
    '</form>';

    if(list.length){
      html += '<div class="csr-list">' + list.map(function(r){
        return '<article class="csr-item">' +
          '<header>' +
            '<div class="csr-item__meta"><strong>' + esc(r.name) + '</strong><time>' + fmtDate(r.created_at) + '</time></div>' +
            stars(r.rating, 13) +
          '</header>' +
          (r.title ? '<h5 class="csr-item__title">' + esc(r.title) + '</h5>' : '') +
          '<p class="csr-item__body">' + esc(r.body) + '</p>' +
        '</article>';
      }).join('') + '</div>';
    } else {
      html += '<p class="csr-empty">Henüz yorum yapılmamış. İlk yorumu siz yazın.</p>';
    }

    host.innerHTML = html;
    bindForm();
  }

  function bindForm(){
    var writeBtn = host.querySelector('#csrWriteBtn');
    var form     = host.querySelector('#csrForm');
    var cancel   = host.querySelector('#csrCancel');
    var submit   = host.querySelector('#csrSubmit');
    var msg      = host.querySelector('#csrMsg');
    var ratingEl = host.querySelector('#csrRating');
    var ratingVal= host.querySelector('#csrRatingVal');

    if(writeBtn) writeBtn.addEventListener('click', function(){
      form.style.display = 'block';
      writeBtn.style.display = 'none';
      form.scrollIntoView({behavior:'smooth',block:'start'});
    });

    if(cancel) cancel.addEventListener('click', function(){
      form.style.display = 'none';
      if(writeBtn) writeBtn.style.display = '';
    });

    if(ratingEl) ratingEl.addEventListener('click', function(e){
      var b = e.target.closest('.csr-rstar');
      if(!b) return;
      var v = Number(b.dataset.v);
      ratingVal.value = v;
      ratingEl.querySelectorAll('.csr-rstar').forEach(function(s,i){
        s.querySelector('.rstar-path').setAttribute('fill', i<v?'#16120e':'rgba(22,18,14,.18)');
      });
    });

    if(form) form.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {
        product_slug: slug,
        name:  String(fd.get('name')||'').trim(),
        email: String(fd.get('email')||'').trim(),
        title: String(fd.get('title')||'').trim(),
        body:  String(fd.get('body')||'').trim(),
        rating: Number(ratingVal.value)
      };
      if(!payload.rating){ setMsg(msg,'Lütfen puan seçin.','err'); return; }
      if(payload.body.length < 10){ setMsg(msg,'Yorum en az 10 karakter olmalı.','err'); return; }

      submit.disabled = true; submit.textContent = 'Gönderiliyor…';

      fetch(API, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d.ok === false || d.error) throw new Error(d.error || 'Hata');
          setMsg(msg,'Yorumunuz alındı. Onaydan sonra yayınlanacak. Teşekkürler.','ok');
          form.reset();
          ratingVal.value = 0;
          if(ratingEl) ratingEl.querySelectorAll('.rstar-path').forEach(function(p){ p.setAttribute('fill','rgba(22,18,14,.18)'); });
          setTimeout(function(){
            form.style.display='none';
            if(writeBtn) writeBtn.style.display='';
            setMsg(msg,'','');
          }, 3000);
        })
        .catch(function(e){ setMsg(msg, e.message || 'Hata oluştu','err'); })
        .finally(function(){ submit.disabled=false; submit.textContent='Gönder'; });
    });
  }

  function setMsg(el, txt, type){
    el.textContent = txt;
    el.className = 'csr-msg' + (type?' csr-msg--'+type:'');
  }

  fetch(API + '?product_slug=' + encodeURIComponent(slug))
    .then(function(r){ return r.json(); })
    .then(render)
    .catch(function(){ host.innerHTML = '<p class="csr-empty">Yorumlar yüklenemedi.</p>'; });
}

function init(){
  document.querySelectorAll('[data-cs-reviews]').forEach(widget);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
