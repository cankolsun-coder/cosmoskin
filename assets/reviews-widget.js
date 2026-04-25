/**
 * COSMOSKIN — Reviews Widget v1
 * Loads + submits reviews via /api/reviews
 *
 * Usage on PDP page:
 *   <div data-cs-reviews data-product-slug="torriden-dive-in-hyaluronic-acid-serum"></div>
 *   <script src="/assets/reviews-widget.js"></script>
 */
(function () {
  'use strict';

  var API = '/api/reviews';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(ts) {
    var d = new Date(Number(ts));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function stars(rating, size) {
    size = size || 14;
    var html = '<span class="csr-stars" aria-label="' + rating + ' / 5">';
    for (var i = 1; i <= 5; i++) {
      html += '<svg viewBox="0 0 20 20" width="' + size + '" height="' + size + '" class="' + (i > rating ? 'is-empty' : '') + '">' +
              '<path d="M10 1l2.7 5.7 6.3.6-4.7 4.3 1.4 6.2L10 14.7 4.3 17.8l1.4-6.2L1 7.3l6.3-.6z"/></svg>';
    }
    html += '</span>';
    return html;
  }

  function widget(host) {
    var slug = host.dataset.productSlug || host.getAttribute('data-product-slug');
    if (!slug) {
      host.innerHTML = '<p style="color:#9d9087;font-size:13px">Ürün slug eksik.</p>';
      return;
    }

    host.innerHTML = '<div class="csr-loading" style="padding:32px;text-align:center;color:#9d9087">Yorumlar yükleniyor...</div>';

    function render(data) {
      var reviews = data.reviews || [];
      var html =
        '<div class="csr-summary">' +
          '<div class="csr-summary__avg">' +
            '<div class="csr-avg-num">' + (data.average || 0).toFixed(1) + '</div>' +
            stars(Math.round(data.average || 0), 18) +
            '<div class="csr-count">' + (data.count || 0) + ' yorum</div>' +
          '</div>' +
          '<button class="csr-write-btn" type="button" id="csrWriteBtn">Yorum Yaz</button>' +
        '</div>' +

        '<form class="csr-form" id="csrForm" style="display:none">' +
          '<h4>Yorumunuzu paylaşın</h4>' +
          '<div class="csr-form-row">' +
            '<label>Puan</label>' +
            '<div class="csr-rating-input" id="csrRatingInput">' +
              [1,2,3,4,5].map(function(n){ return '<button type="button" data-r="'+n+'" aria-label="'+n+' yıldız">' +
                '<svg viewBox="0 0 20 20" width="22" height="22"><path d="M10 1l2.7 5.7 6.3.6-4.7 4.3 1.4 6.2L10 14.7 4.3 17.8l1.4-6.2L1 7.3l6.3-.6z"/></svg>' +
              '</button>'; }).join('') +
            '</div>' +
            '<input type="hidden" name="rating" id="csrRating" value="0"/>' +
          '</div>' +
          '<div class="csr-form-row"><label>Ad Soyad</label><input type="text" name="name" maxlength="80" required/></div>' +
          '<div class="csr-form-row"><label>E-posta (yayınlanmaz)</label><input type="email" name="email" maxlength="200"/></div>' +
          '<div class="csr-form-row"><label>Başlık (opsiyonel)</label><input type="text" name="title" maxlength="120"/></div>' +
          '<div class="csr-form-row"><label>Yorumunuz</label><textarea name="body" maxlength="2000" rows="4" required></textarea></div>' +
          '<div class="csr-form-actions">' +
            '<button type="button" class="csr-cancel" id="csrCancelBtn">İptal</button>' +
            '<button type="submit" class="csr-submit">Gönder</button>' +
          '</div>' +
          '<div class="csr-form-msg" id="csrFormMsg"></div>' +
        '</form>' +

        '<div class="csr-list">' + (
          reviews.length
            ? reviews.map(function (r) {
                return '<article class="csr-item">' +
                  '<header>' +
                    '<div><strong>' + esc(r.name) + '</strong>' +
                    '<time>' + fmtDate(r.created_at) + '</time></div>' +
                    stars(r.rating, 14) +
                  '</header>' +
                  (r.title ? '<h5>' + esc(r.title) + '</h5>' : '') +
                  '<p>' + esc(r.body) + '</p>' +
                '</article>';
              }).join('')
            : '<p class="csr-empty">Bu ürün için henüz yorum yapılmadı. İlk yorumu siz bırakın.</p>'
        ) + '</div>';

      host.innerHTML = html;
      bindForm();
    }

    function load() {
      fetch(API + '?product=' + encodeURIComponent(slug))
        .then(function (r) { return r.json(); })
        .then(render)
        .catch(function () {
          host.innerHTML = '<p class="csr-empty">Yorumlar yüklenemedi. Daha sonra tekrar deneyin.</p>';
        });
    }

    function bindForm() {
      var writeBtn  = host.querySelector('#csrWriteBtn');
      var form      = host.querySelector('#csrForm');
      var cancelBtn = host.querySelector('#csrCancelBtn');
      var msg       = host.querySelector('#csrFormMsg');
      var ratingHidden = host.querySelector('#csrRating');
      var ratingInput  = host.querySelector('#csrRatingInput');

      if (writeBtn) writeBtn.addEventListener('click', function () {
        form.style.display = 'block';
        writeBtn.style.display = 'none';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        form.style.display = 'none';
        if (writeBtn) writeBtn.style.display = '';
      });

      if (ratingInput) ratingInput.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-r]');
        if (!btn) return;
        var r = Number(btn.dataset.r);
        ratingHidden.value = r;
        ratingInput.querySelectorAll('button').forEach(function (b, i) {
          b.classList.toggle('is-on', i < r);
        });
      });

      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = new FormData(form);
        var payload = {
          product_slug: slug,
          name:   String(data.get('name')  || '').trim(),
          email:  String(data.get('email') || '').trim(),
          title:  String(data.get('title') || '').trim(),
          body:   String(data.get('body')  || '').trim(),
          rating: Number(data.get('rating') || 0),
        };
        if (!payload.rating) { msg.textContent = 'Lütfen puan verin.'; msg.className = 'csr-form-msg is-error'; return; }
        if (payload.body.length < 10) { msg.textContent = 'Yorum en az 10 karakter olmalı.'; msg.className = 'csr-form-msg is-error'; return; }

        var submitBtn = form.querySelector('.csr-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Gönderiliyor...';

        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok === false || data.error) throw new Error(data.error || 'Gönderim başarısız');
            msg.textContent = 'Yorumunuz alındı, onaydan sonra yayınlanacak. Teşekkürler.';
            msg.className = 'csr-form-msg is-success';
            form.reset();
            ratingHidden.value = 0;
            ratingInput.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-on'); });
            setTimeout(function () { form.style.display = 'none'; if (host.querySelector('#csrWriteBtn')) host.querySelector('#csrWriteBtn').style.display = ''; }, 2400);
          })
          .catch(function (err) {
            msg.textContent = err.message || 'Hata oluştu';
            msg.className = 'csr-form-msg is-error';
          })
          .finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Gönder';
          });
      });
    }

    load();
  }

  function init() {
    document.querySelectorAll('[data-cs-reviews]').forEach(widget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
