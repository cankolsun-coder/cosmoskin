/* ═══════════════════════════════════════════════════════════
   COSMOSKIN — Ürün Sayfası JS
   /assets/product-page.js
   ═══════════════════════════════════════════════════════════ */

/* ── Tab Geçişi ── */
const PDP = {
  switchTab(panelId, btn) {
    document.querySelectorAll('.pdp-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.pdp-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(panelId)?.classList.add('active');
  }
};

/* ═══════════════════════════════════════════════════════════
   REVIEWS — Yorum Sistemi
   ═══════════════════════════════════════════════════════════ */
const Reviews = (() => {

  const CFG = window.COSMOSKIN_CONFIG || {};
  const API  = CFG.apiBase || '/api';
  const PRODUCT_ID = document.getElementById('reviewsSection')?.dataset.productId || '';

  let _session      = null;
  let _hasPurchased = false;
  let _userReview   = null;
  let _allReviews   = [];
  let _filtered     = [];
  let _page         = 0;
  const PER          = 5;
  let _rating        = 0;
  let _files         = [];
  let _lbImgs        = [];
  let _lbIdx         = 0;
  let _helpedIds     = new Set();

  const LABELS = {1:'Hayal kırıklığı',2:'Beklentinin altında',3:'İdare eder',4:'Oldukça memnunum',5:'Mükemmel, kesinlikle öneririm'};

  async function init() {
    await waitForSupabase();
    const sb = window.cosmoskinSupabase;
    if (sb) {
      const { data: { session } } = await sb.auth.getSession();
      _session = session;
      if (_session) await checkPurchase();
    }
    await loadReviews();
    renderWriteBtn();

    document.addEventListener('cosmoskin:auth-state', async () => {
      const sb2 = window.cosmoskinSupabase;
      if (!sb2) return;
      const { data: { session } } = await sb2.auth.getSession();
      _session = session;
      if (_session) await checkPurchase();
      renderWriteBtn();
    });

    document.getElementById('rvTitleInput')?.addEventListener('input', e => {
      document.getElementById('rvTitleCount').textContent = `${e.target.value.length} / 100`;
    });
    document.getElementById('rvBodyInput')?.addEventListener('input', e => {
      document.getElementById('rvBodyCount').textContent = `${e.target.value.length} / 2000`;
    });
  }

  function waitForSupabase(timeout = 3000) {
    return new Promise(resolve => {
      if (window.cosmoskinSupabase) return resolve();
      const t = Date.now();
      const check = setInterval(() => {
        if (window.cosmoskinSupabase || Date.now() - t > timeout) {
          clearInterval(check);
          resolve();
        }
      }, 80);
    });
  }

  async function checkPurchase() {
    if (!_session) { _hasPurchased = false; return; }
    try {
      const sb = window.cosmoskinSupabase;
      const { data: orders } = await sb
        .from('orders')
        .select('id, order_items')
        .eq('user_id', _session.user.id)
        .eq('status', 'confirmed');
      _hasPurchased = (orders || []).some(order =>
        (order.order_items || []).some(item =>
          item.product_id === PRODUCT_ID || slugify(item.product_name || '') === PRODUCT_ID
        )
      );
    } catch { _hasPurchased = false; }
  }

  function renderWriteBtn() {
    const wrap = document.getElementById('rvWriteWrap');
    if (!wrap) return;
    if (_session && _hasPurchased) {
      const isEdit = !!_userReview;
      wrap.innerHTML = `
        <button class="btn btn-primary" onclick="Reviews.openModal()" style="min-height:52px;gap:10px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>
            <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/>
          </svg>
          ${isEdit ? 'Yorumunuzu Düzenleyin' : 'Yorum Yaz'}
        </button>`;
    } else {
      wrap.innerHTML = '';
    }
  }

  async function loadReviews() {
    try {
      const res  = await fetch(`${API}/reviews?product_id=${encodeURIComponent(PRODUCT_ID)}`);
      const data = await res.json();
      _allReviews = data.reviews || [];
      _filtered   = [..._allReviews];
      if (_session) {
        _userReview = _allReviews.find(r => r.user_id === _session.user.id) || null;
      }
      renderSummary(data.summary);
      renderList(true);
      if (_allReviews.length > 0) {
        document.getElementById('rvFilterRow').style.display = 'flex';
      }
    } catch {
      document.getElementById('rvList').innerHTML =
        `<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">Yorumlar yüklenemedi. Sayfayı yenileyin.</div>`;
    }
  }

  function renderSummary(s) {
    const score = parseFloat(s?.avg_rating || 0);
    const count = parseInt(s?.approved_count || 0);
    const total = count || 1;
    document.getElementById('rvScoreBig').textContent = count ? score.toFixed(1) : '—';
    const starsRow = document.getElementById('rvStarsRow');
    starsRow.innerHTML = [1,2,3,4,5].map(n =>
      `<span class="pdp-star ${score >= n ? 'on' : ''}" aria-hidden="true">★</span>`
    ).join('');
    document.getElementById('rvCount').textContent =
      count ? `${count} değerlendirme` : 'Henüz değerlendirme yok';
    const hist = document.getElementById('rvHistogram');
    const stars = {5:s?.five_star||0,4:s?.four_star||0,3:s?.three_star||0,2:s?.two_star||0,1:s?.one_star||0};
    hist.innerHTML = [5,4,3,2,1].map(n => {
      const pct = Math.round((stars[n] / total) * 100);
      return `<div class="pdp-hist-row">
        <span class="pdp-hist-label">${n}</span>
        <div class="pdp-hist-track"><div class="pdp-hist-fill" style="width:${pct}%"></div></div>
        <span class="pdp-hist-num">${stars[n]}</span>
      </div>`;
    }).join('');
  }

  function renderList(reset = false) {
    if (reset) _page = 0;
    const chunk = _filtered.slice(0, (_page + 1) * PER);
    const list  = document.getElementById('rvList');
    if (!_filtered.length) {
      list.innerHTML = `
        <div class="pdp-reviews-empty">
          <div class="empty-icon">✦</div>
          <h3>Henüz yorum yok</h3>
          <p>Bu ürünü deneyenler arasında ilk siz olabilirsiniz.</p>
        </div>`;
      document.getElementById('rvMoreWrap').style.display = 'none';
      return;
    }
    list.innerHTML = chunk.map(r => renderCard(r)).join('');
    document.getElementById('rvMoreWrap').style.display =
      _filtered.length > chunk.length ? 'block' : 'none';
  }

  function renderCard(r) {
    const initial = r.user_display_name?.charAt(0)?.toUpperCase() || '✦';
    const name    = r.user_display_name || 'Doğrulanmış Müşteri';
    const date    = new Date(r.created_at).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
    const stars   = [1,2,3,4,5].map(n => `<span class="pdp-rc-star ${n<=r.rating?'on':''}">★</span>`).join('');
    const imgs    = (r.review_images||[]).filter(i=>i.status==='approved');
    const imgHtml = imgs.length ? `<div class="pdp-rc-images">${imgs.map((img,i)=>
      `<img class="pdp-rc-thumb" src="${img.public_url}" alt="Yorum görseli" loading="lazy"
            onclick="Reviews.openLightbox(${JSON.stringify(imgs.map(x=>x.public_url)).replace(/"/g,'&quot;')},${i})">`
    ).join('')}</div>` : '';
    const voted = _helpedIds.has(r.id);
    const isOwn = _session?.user?.id === r.user_id;
    return `
      <article class="pdp-review-card" id="rvc-${r.id}">
        <div class="pdp-rc-top">
          <div class="pdp-rc-meta">
            <div class="pdp-rc-avatar">${esc(initial)}</div>
            <div class="pdp-rc-user">
              <span class="pdp-rc-name">${esc(name)}</span>
              <span class="pdp-rc-date">${date}</span>
            </div>
          </div>
          <div class="pdp-rc-right">
            <div class="pdp-rc-stars" aria-label="${r.rating} yıldız">${stars}</div>
            <span class="pdp-verified">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
              Satın Aldı
            </span>
          </div>
        </div>
        <h3 class="pdp-rc-title">${esc(r.title)}</h3>
        <p class="pdp-rc-body">${esc(r.body)}</p>
        ${imgHtml}
        ${r.is_edited?'<span style="font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase">(Düzenlendi)</span>':''}
        <div class="pdp-rc-footer">
          <button class="pdp-helpful-btn ${voted?'voted':''}"
                  onclick="Reviews.toggleHelpful('${r.id}',this)"
                  aria-pressed="${voted}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${voted?'currentColor':'none'}" stroke="currentColor" stroke-width="2">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14Z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Faydalı (${r.helpful_count||0})
          </button>
          ${isOwn?`<button class="pdp-helpful-btn" onclick="Reviews.openModal(true)">Düzenle</button>`:''}
        </div>
      </article>`;
  }

  function filter(type, btn) {
    document.querySelectorAll('.pdp-filter-btn').forEach(b=>b.classList.remove('active'));
    btn?.classList.add('active');
    if (type==='all') _filtered = [..._allReviews];
    else if (type==='photo') _filtered = _allReviews.filter(r=>(r.review_images||[]).some(i=>i.status==='approved'));
    else _filtered = _allReviews.filter(r=>r.rating===parseInt(type));
    renderList(true);
  }

  function loadMore() { _page++; renderList(false); }

  function openModal(isEdit = false) {
    if (isEdit && _userReview) {
      document.getElementById('rvTitleInput').value = _userReview.title || '';
      document.getElementById('rvBodyInput').value  = _userReview.body  || '';
      document.getElementById('rvTitleCount').textContent = `${(_userReview.title||'').length} / 100`;
      document.getElementById('rvBodyCount').textContent  = `${(_userReview.body||'').length} / 2000`;
      setRating(_userReview.rating || 0);
    }
    document.getElementById('rvModalOverlay').classList.add('show');
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    document.getElementById('rvModalOverlay').classList.remove('show');
    document.body.classList.remove('modal-open');
    setStatus('');
  }

  function setRating(val) {
    _rating = val;
    document.querySelectorAll('.pdp-star-pick').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) <= val);
    });
    document.getElementById('rvRatingLabel').textContent = LABELS[val] || '';
  }

  function handleFiles(files) {
    Array.from(files).slice(0, 5 - _files.length).forEach(f => {
      if (f.size > 5 * 1024 * 1024) { setStatus(`"${f.name}" 5 MB sınırını aşıyor.`, 'error'); return; }
      _files.push({ file: f, url: URL.createObjectURL(f) });
    });
    renderPreviews();
  }

  function renderPreviews() {
    document.getElementById('rvPreviewRow').innerHTML = _files.map((item, i) => `
      <div class="pdp-prev-item">
        <img class="pdp-prev-img" src="${item.url}" alt="">
        <button class="pdp-prev-del" onclick="Reviews.removeFile(${i})" aria-label="Kaldır">×</button>
      </div>`).join('');
  }

  function removeFile(i) {
    URL.revokeObjectURL(_files[i].url);
    _files.splice(i, 1);
    renderPreviews();
  }

  function onDragOver(e)  { e.preventDefault(); document.getElementById('rvUploadZone').classList.add('drag-on'); }
  function onDragLeave()  { document.getElementById('rvUploadZone').classList.remove('drag-on'); }
  function onDrop(e)      { e.preventDefault(); onDragLeave(); handleFiles(e.dataTransfer.files); }

  async function compressImage(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let {width, height} = img;
        const max = 1200;
        if (width > max || height > max) {
          const r = Math.min(max/width, max/height);
          width = Math.round(width*r); height = Math.round(height*r);
        }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        c.toBlob(resolve, 'image/webp', 0.82);
      };
      img.src = url;
    });
  }

  async function uploadImages(reviewId) {
    const sb = window.cosmoskinSupabase;
    if (!sb || !_files.length) return [];
    const results = [];
    for (let i = 0; i < _files.length; i++) {
      try {
        const blob = await compressImage(_files[i].file);
        const path = `${_session.user.id}/${reviewId}/${Date.now()}-${i}.webp`;
        const { error } = await sb.storage.from('review-images').upload(path, blob, { contentType:'image/webp' });
        if (error) continue;
        const { data: { publicUrl } } = sb.storage.from('review-images').getPublicUrl(path);
        results.push({ storagePath: path, publicUrl });
      } catch { /* continue */ }
    }
    return results;
  }

  async function submit() {
    const title = document.getElementById('rvTitleInput').value.trim();
    const body  = document.getElementById('rvBodyInput').value.trim();
    if (!_rating)          return setStatus('Lütfen puan seçin.', 'error');
    if (title.length < 3)  return setStatus('Başlık en az 3 karakter olmalı.', 'error');
    if (body.length  < 10) return setStatus('Yorum en az 10 karakter olmalı.', 'error');
    const btn   = document.getElementById('rvSubmitBtn');
    const label = document.getElementById('rvSubmitLabel');
    btn.disabled = true; label.textContent = 'Gönderiliyor…'; setStatus('');
    try {
      const token  = _session.access_token;
      const isEdit = !!_userReview;
      const endpoint = isEdit ? `${API}/reviews/${_userReview.id}` : `${API}/reviews`;
      const res = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: PRODUCT_ID, title, review_body: body, rating: _rating }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || 'Bir hata oluştu.', 'error'); return; }
      const reviewId = data.review_id || _userReview?.id;
      if (_files.length && reviewId) {
        label.textContent = 'Görseller yükleniyor…';
        const uploads = await uploadImages(reviewId);
        if (uploads.length) {
          await fetch(`${API}/reviews/images`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
            body: JSON.stringify({ review_id: reviewId, images: uploads }),
          });
        }
      }
      document.querySelector('.pdp-modal-box').innerHTML = `
        <div style="text-align:center;padding:24px 0">
          <div style="width:60px;height:60px;border-radius:50%;background:#edf7f1;border:1px solid rgba(31,122,79,.2);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:26px">✓</div>
          <h2 style="font-family:var(--serif);font-size:28px;font-weight:400;margin:0 0 10px;color:var(--text)">Teşekkür Ederiz</h2>
          <p style="color:var(--muted);font-size:14px;line-height:1.7;margin:0 0 24px">Yorumunuz incelemeye alındı.<br>Onay sonrası yayına alınacaktır.</p>
          <button class="btn btn-secondary" onclick="Reviews.closeModal()">Kapat</button>
        </div>`;
    } catch {
      setStatus('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
    } finally {
      btn.disabled = false; label.textContent = 'Yorumu Gönder';
    }
  }

  async function toggleHelpful(id, btn) {
    if (!_session) return;
    const voted = _helpedIds.has(id);
    try {
      await fetch(`${API}/reviews/helpful`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${_session.access_token}` },
        body: JSON.stringify({ review_id: id, action: voted ? 'remove' : 'add' }),
      });
      if (voted) _helpedIds.delete(id); else _helpedIds.add(id);
      const r = _allReviews.find(x=>x.id===id);
      if (r) { r.helpful_count = Math.max(0,(r.helpful_count||0)+(voted?-1:1)); }
      const card = document.getElementById(`rvc-${id}`);
      if (card) card.outerHTML = renderCard(r || {id});
    } catch { /* continue */ }
  }

  function openLightbox(images, idx) {
    if (typeof images === 'string') images = JSON.parse(images.replace(/&quot;/g,'"'));
    _lbImgs = images; _lbIdx = idx;
    document.getElementById('rvLbImg').src = _lbImgs[_lbIdx];
    document.getElementById('rvLightbox').classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    document.getElementById('rvLightbox').classList.remove('show');
    document.body.style.overflow = '';
  }
  function lbNav(dir, e) {
    e?.stopPropagation();
    _lbIdx = (_lbIdx + dir + _lbImgs.length) % _lbImgs.length;
    document.getElementById('rvLbImg').src = _lbImgs[_lbIdx];
  }

  function setStatus(msg, type='') {
    const el = document.getElementById('rvFormStatus');
    el.textContent = msg; el.className = `pdp-form-status ${type}`;
  }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function slugify(s) { return s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''); }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeLightbox(); }
    if (document.getElementById('rvLightbox').classList.contains('show')) {
      if (e.key === 'ArrowLeft') lbNav(-1);
      if (e.key === 'ArrowRight') lbNav(1);
    }
  });

  document.addEventListener('DOMContentLoaded', init);

  return { filter, loadMore, openModal, closeModal, setRating,
           handleFiles, removeFile, onDragOver, onDragLeave, onDrop,
           toggleHelpful, submit, openLightbox, closeLightbox, lbNav };
})();
