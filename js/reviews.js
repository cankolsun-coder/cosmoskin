/**
 * COSMOSKIN — Reviews System
 * /js/reviews.js
 *
 * Bağımlılıklar:
 *   - window.cosmoskinSupabase  (assets/auth.js tarafından set edilir)
 *   - window.COSMOSKIN_CONFIG   (assets/site-config.js)
 *
 * Her ürün sayfasında şu element gereklidir:
 *   <section id="reviewsSection" data-product-slug="SLUG"></section>
 */

'use strict';

function bridgeLegacyReviews() {
  if (typeof window === 'undefined') return null;
  if (!window.Reviews || !document.getElementById('reviewsSection')) return null;

  window.CosmoReviews = window.Reviews;
  window.COSMOSKIN_LEGACY_REVIEW_SYSTEM = {
    deprecated: true,
    activeSystem: 'window.Reviews',
    source: '/assets/product-page.js'
  };

  if (!window.__COSMOSKIN_LEGACY_REVIEWS_NOTICE__) {
    window.__COSMOSKIN_LEGACY_REVIEWS_NOTICE__ = true;
    console.info('[Reviews] /js/reviews.js is deprecated on product pages. Using window.Reviews from /assets/product-page.js.');
  }

  return window.Reviews;
}

const CosmoReviews = (() => {
  const activeReviews = bridgeLegacyReviews();
  if (activeReviews) return activeReviews;

  /* ── Sabitler ──────────────────────────────────────────── */
  const BUCKET       = 'review-images';
  const MAX_FILE_MB  = 2;
  const MAX_FILES    = 5;
  const PER_PAGE     = 6;
  const RATE_LIMIT_S = 30; // saniye (istemci tarafı yumuşak limit)

  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
  const RATING_LABELS = {
    1: 'Hayal kırıklığı yarattı',
    2: 'Beklentinin altında kaldı',
    3: 'İdare eder',
    4: 'Oldukça memnunum',
    5: 'Mükemmel, kesinlikle öneririm',
  };

  /* ── Durum ─────────────────────────────────────────────── */
  let _sb           = null;   // Supabase client
  let _session      = null;   // mevcut oturum
  let _slug         = '';     // ürün slug
  let _hasPurchased = false;  // satın alma doğrulaması
  let _userReview   = null;   // bu kullanıcının yorumu
  let _allReviews   = [];
  let _filtered     = [];
  let _page         = 0;
  let _rating       = 0;
  let _files        = [];     // { file, objectUrl }
  let _lbImgs       = [];
  let _lbIdx        = 0;
  let _helpedSet    = new Set();
  let _lastSubmit   = 0;      // rate limit timestamp

  /* ── XSS koruması ─────────────────────────────────────── */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /* ── Supabase hazır olana kadar bekle ─────────────────── */
  function waitForSb(ms = 4000) {
    return new Promise(resolve => {
      if (window.cosmoskinSupabase) return resolve(window.cosmoskinSupabase);
      const deadline = Date.now() + ms;
      const id = setInterval(() => {
        if (window.cosmoskinSupabase || Date.now() > deadline) {
          clearInterval(id);
          resolve(window.cosmoskinSupabase || null);
        }
      }, 60);
    });
  }

  /* ── init ──────────────────────────────────────────────── */
  async function init() {
    const section = document.getElementById('reviewsSection');
    if (!section) return;

    _slug = section.dataset.productSlug || '';
    if (!_slug) {
      console.warn('[Reviews] data-product-slug eksik.');
      return;
    }

    _sb = await waitForSb();
    if (_sb) {
      const { data: { session } } = await _sb.auth.getSession();
      _session = session;
      if (_session) await _checkPurchase();
    }

    await _loadReviews();
    _renderWriteBtn();
    _bindCharCounters();

    // Auth değişikliklerini dinle
    document.addEventListener('cosmoskin:auth-state', async () => {
      if (!_sb) return;
      const { data: { session } } = await _sb.auth.getSession();
      _session = session;
      _hasPurchased = false;
      if (_session) await _checkPurchase();
      _renderWriteBtn();
    });
  }

  /* ── Satın alma doğrulama ──────────────────────────────── */
  async function _checkPurchase() {
    if (!_sb || !_session) { _hasPurchased = false; return; }
    try {
      // Supabase RPC fonksiyonunu kullan (reviews.sql'de tanımlı)
      const { data, error } = await _sb.rpc('check_purchase', {
        p_user_id: _session.user.id,
        p_product_slug: _slug,
      });
      if (error) throw error;
      _hasPurchased = !!data;
    } catch (err) {
      console.warn('[Reviews] purchase check failed:', err.message);
      _hasPurchased = false;
    }
  }

  /* ── Yorum yazma butonu ────────────────────────────────── */
  function _renderWriteBtn() {
    const wrap = document.getElementById('rvWriteWrap');
    if (!wrap) return;

    if (_session && _hasPurchased) {
      wrap.innerHTML = `
        <button class="btn btn-primary" onclick="CosmoReviews.openModal()" style="min-height:52px;gap:10px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>
            <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/>
          </svg>
          ${_userReview ? 'Yorumunuzu Düzenleyin' : 'Yorum Yaz'}
        </button>`;
    } else {
      wrap.innerHTML = '';
    }
  }

  /* ── Yorumları yükle ───────────────────────────────────── */
  async function _loadReviews() {
    const list = document.getElementById('rvList');
    if (!list) return;

    try {
      // Supabase'den doğrudan çek (API route yerine Supabase client)
      if (_sb) {
        await _loadFromSupabase();
      } else {
        // Fallback: API route
        await _loadFromApi();
      }
    } catch (err) {
      list.innerHTML = `<div class="pdp-reviews-empty">
        <p style="color:var(--muted)">Yorumlar yüklenemedi. Sayfayı yenileyin.</p>
      </div>`;
      console.error('[Reviews] load error:', err);
    }
  }

  async function _loadFromSupabase() {
    // 1. Yorumları çek (approved=true)
    const { data: reviews, error: revErr } = await _sb
      .from('reviews')
      .select('*')
      .eq('product_slug', _slug)
      .eq('approved', true)
      .order('created_at', { ascending: false });

    if (revErr) throw revErr;

    // 2. Her yorum için görselleri çek
    const reviewIds = (reviews || []).map(r => r.id);
    let imageMap = {};
    if (reviewIds.length) {
      const { data: images } = await _sb
        .from('review_images')
        .select('review_id, public_url, status, width, height')
        .in('review_id', reviewIds)
        .eq('status', 'approved');
      (images || []).forEach(img => {
        if (!imageMap[img.review_id]) imageMap[img.review_id] = [];
        imageMap[img.review_id].push(img);
      });
    }

    // 3. Kullanıcının kendi yorumunu bul (approved olmasa bile)
    if (_session) {
      const { data: own } = await _sb
        .from('reviews')
        .select('*')
        .eq('product_slug', _slug)
        .eq('user_id', _session.user.id)
        .maybeSingle();
      _userReview = own || null;
    }

    // 4. Helpful set
    if (_session && reviewIds.length) {
      const { data: helped } = await _sb
        .from('review_helpful')
        .select('review_id')
        .eq('user_id', _session.user.id)
        .in('review_id', reviewIds);
      _helpedSet = new Set((helped || []).map(h => h.review_id));
    }

    _allReviews = (reviews || []).map(r => ({
      ...r,
      review_images: imageMap[r.id] || [],
    }));
    _filtered = [..._allReviews];

    _renderSummary();
    _renderList(true);

    if (_allReviews.length > 0) {
      const fr = document.getElementById('rvFilterRow');
      if (fr) fr.style.display = 'flex';
    }
  }

  async function _loadFromApi() {
    const cfg = window.COSMOSKIN_CONFIG || {};
    const api = cfg.apiBase || '/api';
    const res  = await fetch(`${api}/reviews?product_slug=${encodeURIComponent(_slug)}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    _allReviews = data.reviews || [];
    _filtered   = [..._allReviews];
    _userReview = _session
      ? (_allReviews.find(r => r.user_id === _session.user.id) || null)
      : null;
    _renderSummaryFromData(data.summary);
    _renderList(true);
  }

  /* ── Özet render ───────────────────────────────────────── */
  function _renderSummary() {
    const approved = _allReviews;
    const count    = approved.length;
    const avg      = count
      ? approved.reduce((s, r) => s + r.rating, 0) / count
      : 0;

    const stars = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    approved.forEach(r => { stars[r.rating] = (stars[r.rating] || 0) + 1; });

    _renderSummaryFromData({
      avg_rating:     avg.toFixed(1),
      approved_count: count,
      five_star:  stars[5],
      four_star:  stars[4],
      three_star: stars[3],
      two_star:   stars[2],
      one_star:   stars[1],
    });
  }

  function _renderSummaryFromData(s) {
    const score = parseFloat(s?.avg_rating || 0);
    const count = parseInt(s?.approved_count || 0);
    const total = count || 1;

    const bigScore = document.getElementById('rvScoreBig');
    if (bigScore) bigScore.textContent = count ? score.toFixed(1) : '—';

    const starsRow = document.getElementById('rvStarsRow');
    if (starsRow) {
      starsRow.innerHTML = [1,2,3,4,5].map(n =>
        `<span class="pdp-star ${score >= n ? 'on' : ''}" aria-hidden="true">★</span>`
      ).join('');
      starsRow.setAttribute('aria-label', `${score.toFixed(1)} üzerinden 5 yıldız`);
    }

    const countEl = document.getElementById('rvCount');
    if (countEl) {
      countEl.textContent = count
        ? `${count} değerlendirme`
        : 'Henüz değerlendirme yok';
    }

    const hist = document.getElementById('rvHistogram');
    if (hist) {
      const stars = {
        5: s?.five_star  || 0,
        4: s?.four_star  || 0,
        3: s?.three_star || 0,
        2: s?.two_star   || 0,
        1: s?.one_star   || 0,
      };
      hist.innerHTML = [5,4,3,2,1].map(n => {
        const pct = Math.round((stars[n] / total) * 100);
        return `
          <div class="pdp-hist-row">
            <span class="pdp-hist-label">${n}</span>
            <div class="pdp-hist-track" role="progressbar"
                 aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
                 aria-label="${n} yıldız: ${stars[n]} yorum">
              <div class="pdp-hist-fill" style="width:${pct}%"></div>
            </div>
            <span class="pdp-hist-num">${stars[n]}</span>
          </div>`;
      }).join('');
    }
  }

  /* ── Liste render ──────────────────────────────────────── */
  function _renderList(reset = false) {
    if (reset) _page = 0;
    const list = document.getElementById('rvList');
    if (!list) return;

    const chunk = _filtered.slice(0, (_page + 1) * PER_PAGE);

    if (!_filtered.length) {
      list.innerHTML = `
        <div class="pdp-reviews-empty">
          <div class="empty-icon">✦</div>
          <h3>Henüz değerlendirme yok</h3>
          <p>Bu ürünü deneyenler arasında ilk siz olabilirsiniz.</p>
        </div>`;
      _el('rvMoreWrap', el => el.style.display = 'none');
      return;
    }

    list.innerHTML = chunk.map(_renderCard).join('');
    _el('rvMoreWrap', el => {
      el.style.display = _filtered.length > chunk.length ? 'block' : 'none';
    });
  }

  function _renderCard(r) {
    const initials = (r.user_display_name || 'M').charAt(0).toUpperCase();
    const name     = esc(r.user_display_name || 'Doğrulanmış Müşteri');
    const date     = new Date(r.created_at).toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const stars = [1,2,3,4,5].map(n =>
      `<span class="pdp-rc-star ${n <= r.rating ? 'on' : ''}" aria-hidden="true">★</span>`
    ).join('');

    const images = (r.review_images || []).filter(i => i.status === 'approved');
    const imgHtml = images.length
      ? `<div class="pdp-rc-images">${images.map((img, i) =>
          `<img class="pdp-rc-thumb" src="${esc(img.public_url)}"
                alt="Yorum görseli ${i + 1}" loading="lazy"
                width="${img.width || 80}" height="${img.height || 80}"
                onclick="CosmoReviews.openLightbox(${JSON.stringify(images.map(x => x.public_url)).replace(/"/g, '&quot;')}, ${i})">`
        ).join('')}</div>`
      : '';

    const voted = _helpedSet.has(r.id);
    const isOwn = _session?.user?.id === r.user_id;

    return `
      <article class="pdp-review-card" id="rvc-${r.id}">
        <div class="pdp-rc-top">
          <div class="pdp-rc-meta">
            <div class="pdp-rc-avatar" aria-hidden="true">${initials}</div>
            <div class="pdp-rc-user">
              <span class="pdp-rc-name">${name}</span>
              <span class="pdp-rc-date"><time datetime="${r.created_at}">${date}</time></span>
            </div>
          </div>
          <div class="pdp-rc-right">
            <div class="pdp-rc-stars" aria-label="${r.rating} yıldız">${stars}</div>
            <span class="pdp-verified">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              Satın Aldı
            </span>
          </div>
        </div>
        <h3 class="pdp-rc-title">${esc(r.title)}</h3>
        <p class="pdp-rc-body">${esc(r.body)}</p>
        ${imgHtml}
        ${r.is_edited ? '<span class="pdp-rc-edited">(Düzenlendi)</span>' : ''}
        <div class="pdp-rc-footer">
          <button class="pdp-helpful-btn ${voted ? 'voted' : ''}"
                  onclick="CosmoReviews.toggleHelpful('${r.id}', this)"
                  aria-pressed="${voted}"
                  aria-label="Faydalı bul (${r.helpful_count || 0})">
            <svg width="12" height="12" viewBox="0 0 24 24"
                 fill="${voted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"
                 aria-hidden="true">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14Z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Faydalı (${r.helpful_count || 0})
          </button>
          ${isOwn
            ? `<button class="pdp-helpful-btn" onclick="CosmoReviews.openModal(true)">Düzenle</button>`
            : ''}
        </div>
      </article>`;
  }

  /* ── Filtrele ──────────────────────────────────────────── */
  function filter(type, btn) {
    document.querySelectorAll('.pdp-filter-btn').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');

    if (type === 'all')      _filtered = [..._allReviews];
    else if (type === 'photo') {
      _filtered = _allReviews.filter(r =>
        (r.review_images || []).some(i => i.status === 'approved')
      );
    } else {
      _filtered = _allReviews.filter(r => r.rating === parseInt(type, 10));
    }
    _renderList(true);
  }

  function loadMore() {
    _page++;
    _renderList(false);
  }

  /* ── Modal ─────────────────────────────────────────────── */
  function openModal(isEdit = false) {
    const overlay = document.getElementById('rvModalOverlay');
    if (!overlay) return;

    if (isEdit && _userReview) {
      _el('rvTitleInput', el => {
        el.value = _userReview.title || '';
        _el('rvTitleCount', c => c.textContent = `${el.value.length} / 100`);
      });
      _el('rvBodyInput', el => {
        el.value = _userReview.body || '';
        _el('rvBodyCount', c => c.textContent = `${el.value.length} / 2000`);
      });
      setRating(_userReview.rating || 0);
    } else {
      // Formu sıfırla
      _el('rvTitleInput', el => el.value = '');
      _el('rvBodyInput',  el => el.value = '');
      _el('rvTitleCount', el => el.textContent = '0 / 100');
      _el('rvBodyCount',  el => el.textContent = '0 / 2000');
      setRating(0);
      _files = [];
      _el('rvPreviewRow', el => el.innerHTML = '');
    }

    overlay.classList.add('show');
    document.body.classList.add('modal-open');
    _setStatus('');
  }

  function closeModal() {
    document.getElementById('rvModalOverlay')?.classList.remove('show');
    document.body.classList.remove('modal-open');
    _setStatus('');
  }

  /* ── Puan seçici ───────────────────────────────────────── */
  function setRating(val) {
    _rating = val;
    document.querySelectorAll('.pdp-star-pick').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) <= val);
    });
    _el('rvRatingLabel', el => el.textContent = RATING_LABELS[val] || '');
  }

  /* ── Dosya yükleme ─────────────────────────────────────── */
  function handleFiles(files) {
    const remaining = MAX_FILES - _files.length;
    Array.from(files).slice(0, remaining).forEach(f => {
      if (!ALLOWED_MIME.includes(f.type)) {
        _setStatus(`"${f.name}" desteklenmiyor. JPG, PNG veya WEBP yükleyin.`, 'error');
        return;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        _setStatus(`"${f.name}" ${MAX_FILE_MB} MB sınırını aşıyor.`, 'error');
        return;
      }
      _files.push({ file: f, objectUrl: URL.createObjectURL(f) });
    });
    _renderPreviews();
  }

  function _renderPreviews() {
    const row = document.getElementById('rvPreviewRow');
    if (!row) return;
    row.innerHTML = _files.map((item, i) => `
      <div class="pdp-prev-item">
        <img class="pdp-prev-img" src="${item.objectUrl}" alt="Yorum görseli önizleme" loading="lazy">
        <button class="pdp-prev-del" onclick="CosmoReviews.removeFile(${i})"
                aria-label="Görseli kaldır" type="button">×</button>
      </div>`).join('');
  }

  function removeFile(i) {
    if (_files[i]) URL.revokeObjectURL(_files[i].objectUrl);
    _files.splice(i, 1);
    _renderPreviews();
  }

  function onDragOver(e)  { e.preventDefault(); document.getElementById('rvUploadZone')?.classList.add('drag-on'); }
  function onDragLeave()  { document.getElementById('rvUploadZone')?.classList.remove('drag-on'); }
  function onDrop(e)      { e.preventDefault(); onDragLeave(); handleFiles(e.dataTransfer.files); }

  /* ── Görsel sıkıştırma ─────────────────────────────────── */
  function _compress(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const max = 1200;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width  = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => resolve({ blob, width, height }), 'image/webp', 0.82);
      };
      img.src = url;
    });
  }

  /* ── Supabase Storage'a yükle ──────────────────────────── */
  async function _uploadImages(reviewId) {
    if (!_sb || !_files.length || !_session) return [];
    const results = [];

    for (let i = 0; i < _files.length; i++) {
      try {
        const { blob, width, height } = await _compress(_files[i].file);
        const path = `${_session.user.id}/${reviewId}/${Date.now()}-${i}.webp`;

        const { error: upErr } = await _sb.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: 'image/webp', upsert: false });

        if (upErr) { console.warn('[Reviews] upload error:', upErr.message); continue; }

        const { data: { publicUrl } } = _sb.storage.from(BUCKET).getPublicUrl(path);

        // review_images tablosuna kaydet (pending olarak başlar, admin onaylar)
        await _sb.from('review_images').insert({
          review_id:    reviewId,
          storage_path: path,
          public_url:   publicUrl,
          status:       'pending',
          width,
          height,
        });

        results.push({ storagePath: path, publicUrl, width, height });
      } catch (err) {
        console.warn('[Reviews] image processing error:', err);
      }
    }
    return results;
  }

  /* ── Yorum gönder ──────────────────────────────────────── */
  async function submit() {
    if (!_session) return _setStatus('Lütfen giriş yapın.', 'error');
    if (!_hasPurchased) return _setStatus('Yalnızca satın alınan ürünler için yorum yazılabilir.', 'error');

    // Rate limit (istemci tarafı)
    const now = Date.now();
    if (now - _lastSubmit < RATE_LIMIT_S * 1000) {
      const wait = Math.ceil((RATE_LIMIT_S * 1000 - (now - _lastSubmit)) / 1000);
      return _setStatus(`Lütfen ${wait} saniye bekleyin.`, 'error');
    }

    const title = _el('rvTitleInput')?.value.trim() || '';
    const body  = _el('rvBodyInput')?.value.trim()  || '';

    if (!_rating)         return _setStatus('Lütfen puan seçin.', 'error');
    if (title.length < 3) return _setStatus('Başlık en az 3 karakter olmalı.', 'error');
    if (body.length < 10) return _setStatus('Yorum en az 10 karakter olmalı.', 'error');

    const submitBtn   = document.getElementById('rvSubmitBtn');
    const submitLabel = document.getElementById('rvSubmitLabel');
    if (submitBtn) submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = 'Gönderiliyor…';
    _setStatus('');

    try {
      const isEdit = !!_userReview;

      if (isEdit) {
        // Güncelle
        const { error } = await _sb
          .from('reviews')
          .update({
            title,
            body,
            rating:    _rating,
            is_edited: true,
            approved:  false, // düzenleme sonrası tekrar onay bekler
          })
          .eq('id', _userReview.id)
          .eq('user_id', _session.user.id);

        if (error) throw error;

        if (_files.length) {
          if (submitLabel) submitLabel.textContent = 'Görseller yükleniyor…';
          await _uploadImages(_userReview.id);
        }
      } else {
        // Yeni yorum
        const profile = await _getProfile();
        const { data, error } = await _sb
          .from('reviews')
          .insert({
            product_slug:      _slug,
            user_id:           _session.user.id,
            user_display_name: profile.display_name || _session.user.email?.split('@')[0] || 'Kullanıcı',
            user_email:        _session.user.email,
            title,
            body,
            rating:   _rating,
            approved: false, // admin onayı bekler
          })
          .select('id')
          .single();

        if (error) throw error;

        if (_files.length && data?.id) {
          if (submitLabel) submitLabel.textContent = 'Görseller yükleniyor…';
          await _uploadImages(data.id);
        }
      }

      _lastSubmit = Date.now();

      // Başarı ekranı
      const box = document.querySelector('.pdp-modal-box');
      if (box) {
        box.innerHTML = `
          <div style="text-align:center;padding:32px 0">
            <div style="width:64px;height:64px;border-radius:50%;background:#edf7f1;border:1px solid rgba(31,122,79,.2);
                        display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px">✓</div>
            <h2 style="font-family:var(--serif);font-size:28px;font-weight:400;margin:0 0 10px;color:var(--text)">
              Teşekkür Ederiz
            </h2>
            <p style="color:var(--muted);font-size:14px;line-height:1.7;margin:0 0 24px">
              Yorumunuz incelemeye alındı.<br>Onay sonrası ürün sayfasında görünecektir.
            </p>
            <button class="btn btn-secondary" onclick="CosmoReviews.closeModal()">Kapat</button>
          </div>`;
      }

    } catch (err) {
      const msg = err.code === '23505'
        ? 'Bu ürün için zaten bir yorum yazdınız.'
        : (err.message || 'Bir hata oluştu. Tekrar deneyin.');
      _setStatus(msg, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Yorumu Gönder';
    }
  }

  /* ── Kullanıcı profili ─────────────────────────────────── */
  async function _getProfile() {
    if (!_sb || !_session) return {};
    try {
      const { data } = await _sb
        .from('user_profiles')
        .select('display_name, first_name, last_name')
        .eq('user_id', _session.user.id)
        .maybeSingle();
      if (data) {
        const dn = data.display_name
          || [data.first_name, data.last_name].filter(Boolean).join(' ')
          || '';
        return { display_name: dn };
      }
    } catch { /* sessizce geç */ }
    return {};
  }

  /* ── Faydalı oy ────────────────────────────────────────── */
  async function toggleHelpful(reviewId, btn) {
    if (!_session || !_sb) return;
    const voted = _helpedSet.has(reviewId);

    try {
      if (voted) {
        await _sb.from('review_helpful')
          .delete()
          .eq('review_id', reviewId)
          .eq('user_id', _session.user.id);
        _helpedSet.delete(reviewId);
      } else {
        await _sb.from('review_helpful')
          .insert({ review_id: reviewId, user_id: _session.user.id });
        _helpedSet.add(reviewId);
      }

      // Yerel sayacı güncelle
      const r = _allReviews.find(x => x.id === reviewId);
      if (r) {
        r.helpful_count = Math.max(0, (r.helpful_count || 0) + (voted ? -1 : 1));
        const card = document.getElementById(`rvc-${reviewId}`);
        if (card) card.outerHTML = _renderCard(r);
      }
    } catch (err) {
      console.warn('[Reviews] helpful error:', err.message);
    }
  }

  /* ── Lightbox ──────────────────────────────────────────── */
  function openLightbox(images, idx) {
    if (typeof images === 'string') {
      try { images = JSON.parse(images.replace(/&quot;/g, '"')); } catch { images = []; }
    }
    _lbImgs = images;
    _lbIdx  = Math.max(0, Math.min(idx, images.length - 1));
    const lb = document.getElementById('rvLightbox');
    const img = document.getElementById('rvLbImg');
    if (!lb || !img) return;
    img.src = _lbImgs[_lbIdx];
    lb.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    document.getElementById('rvLightbox')?.classList.remove('show');
    document.body.style.overflow = '';
  }

  function lbNav(dir, e) {
    e?.stopPropagation();
    _lbIdx = (_lbIdx + dir + _lbImgs.length) % _lbImgs.length;
    const img = document.getElementById('rvLbImg');
    if (img) img.src = _lbImgs[_lbIdx];
  }

  /* ── Char counter ──────────────────────────────────────── */
  function _bindCharCounters() {
    _el('rvTitleInput', el => el.addEventListener('input', () => {
      _el('rvTitleCount', c => c.textContent = `${el.value.length} / 100`);
    }));
    _el('rvBodyInput', el => el.addEventListener('input', () => {
      _el('rvBodyCount', c => c.textContent = `${el.value.length} / 2000`);
    }));
  }

  /* ── Yardımcılar ───────────────────────────────────────── */
  function _setStatus(msg, type = '') {
    const el = document.getElementById('rvFormStatus');
    if (!el) return;
    el.textContent  = msg;
    el.className    = `pdp-form-status ${type}`;
    el.setAttribute('role', msg ? 'alert' : 'status');
  }

  function _el(id, fn) {
    const el = document.getElementById(id);
    if (fn && el) fn(el);
    return el;
  }

  /* ── Klavye ────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeLightbox(); }
    const lb = document.getElementById('rvLightbox');
    if (lb?.classList.contains('show')) {
      if (e.key === 'ArrowLeft')  lbNav(-1);
      if (e.key === 'ArrowRight') lbNav(1);
    }
  });

  /* ── DOMContentLoaded ──────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ────────────────────────────────────────── */
  return {
    filter, loadMore,
    openModal, closeModal, setRating,
    handleFiles, removeFile, onDragOver, onDragLeave, onDrop,
    submit, toggleHelpful,
    openLightbox, closeLightbox, lbNav,
  };

})();

// Global erişim için (HTML onclick="" attribute'larından çağrılır)
window.CosmoReviews = CosmoReviews;
