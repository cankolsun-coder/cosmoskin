(function () {
  const $ = (s) => document.querySelector(s);
  const TOKEN_KEY = 'cosmoskin_admin_session_token';
  let token = sessionStorage.getItem(TOKEN_KEY) || '';
  let coupons = [];

  const LABELS = {
    requires_auth: 'Giriş zorunlu',
    allowed_tiers: 'Uygun üyelik seviyeleri',
    requires_first_order: 'İlk sipariş şartı',
    requires_birthday: 'Doğum günü şartı',
    birthday_mode: 'Doğum günü modu',
    requires_smart_routine: 'Akıllı Rutin şartı',
    excluded_product_slugs: 'Hariç tutulan ürünler',
    excluded_categories: 'Hariç tutulan kategoriler',
    rule_source_metadata: 'Kural kaynağı: metadata',
    rule_source_system_default: 'Kural kaynağı: sistem varsayılanı',
    checkout_revalidation: 'Checkout kuralları sunucu tarafında yeniden doğrulanır.'
  };

  function msg(text) {
    const el = $('#couponAdminStatus');
    if (el) el.textContent = text || '';
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('tr-TR');
  }

  function formatList(values) {
    if (!Array.isArray(values) || !values.length) return '—';
    return values.map((v) => esc(v)).join(', ');
  }

  function boolLabel(value) {
    return value ? 'Evet' : 'Hayır';
  }

  async function api(method, body) {
    const res = await fetch('/api/admin/coupons', {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'İşlem başarısız.');
    return data;
  }

  function adminView(coupon) {
    return coupon?.admin || {};
  }

  function canonical(coupon) {
    return adminView(coupon).canonical || {};
  }

  function eligibility(coupon) {
    return adminView(coupon).eligibility || {};
  }

  function usage(coupon) {
    return adminView(coupon).usage || {};
  }

  function detailRow(label, value) {
    return '<div class="cs-coupon-detail-row"><span class="cs-coupon-detail-label">' + esc(label) + '</span><span class="cs-coupon-detail-value">' + value + '</span></div>';
  }

  function renderCouponDetails(coupon) {
    const view = adminView(coupon);
    const canon = canonical(coupon);
    const elig = eligibility(coupon);
    const stats = usage(coupon);
    const conflict = view.field_conflicts?.warning
      ? '<p class="cs-coupon-warning">' + esc(view.field_conflicts.warning) + '</p>'
      : '';
    const id = esc(coupon.id);

    return '<tr class="cs-coupon-detail-row-wrap" data-coupon-detail="' + id + '"><td colspan="7">' +
      '<div class="cs-coupon-detail-panel">' +
      conflict +
      '<p class="cs-coupon-detail-kicker">' + esc(view.rule_source_label || '') + '</p>' +
      '<p class="cs-coupon-detail-note">' + esc(view.checkout_revalidation_notice || LABELS.checkout_revalidation) + '</p>' +
      '<div class="cs-coupon-detail-grid">' +
      detailRow('Kod', '<strong>' + esc(view.code || coupon.code) + '</strong>') +
      detailRow('Başlık', esc(view.title || coupon.title || '—')) +
      detailRow('Durum', view.is_active ? 'Aktif' : 'Pasif') +
      detailRow('Kanonik tip', esc(canon.coupon_type || '—')) +
      detailRow('Kanonik değer', esc(canon.coupon_value ?? '—')) +
      detailRow('Maks. indirim', canon.coupon_max_discount != null ? esc(canon.coupon_max_discount) + ' TL' : '—') +
      detailRow('Minimum sepet', esc(view.min_subtotal ?? 0) + ' TL') +
      detailRow('Kullanım limiti', view.usage_limit != null ? esc(view.usage_limit) : '—') +
      detailRow('Müşteri başına limit', view.per_customer_limit != null ? esc(view.per_customer_limit) : '—') +
      detailRow('Birleştirilebilir', boolLabel(view.stackable)) +
      detailRow('Başlangıç', formatDate(view.starts_at)) +
      detailRow('Bitiş', formatDate(view.ends_at)) +
      detailRow(LABELS.requires_auth, boolLabel(elig.requires_auth)) +
      detailRow(LABELS.allowed_tiers, formatList(elig.allowed_tiers)) +
      detailRow(LABELS.requires_first_order, boolLabel(elig.requires_first_order)) +
      detailRow(LABELS.requires_birthday, boolLabel(elig.requires_birthday)) +
      detailRow(LABELS.birthday_mode, esc(elig.birthday_mode || '—')) +
      detailRow(LABELS.requires_smart_routine, boolLabel(elig.requires_smart_routine)) +
      detailRow(LABELS.excluded_product_slugs, formatList(view.excluded_product_slugs)) +
      detailRow(LABELS.excluded_categories, formatList(view.excluded_categories)) +
      detailRow('Toplam kullanım', esc(stats.total_used_count ?? 0)) +
      detailRow('Aktif rezervasyon', esc(stats.active_reserved_count ?? 0)) +
      detailRow('Son kullanım', formatDate(stats.last_used_at)) +
      '</div>' +
      '<form class="cs-coupon-edit-form" data-coupon-edit="' + id + '">' +
      '<p class="cs-coupon-detail-kicker">Uygunluk düzenleme</p>' +
      '<div class="cs-admin-form-grid">' +
      '<label><input type="checkbox" name="requires_auth" ' + (elig.requires_auth ? 'checked' : '') + '> ' + LABELS.requires_auth + '</label>' +
      '<label><input type="checkbox" name="requires_first_order" ' + (elig.requires_first_order ? 'checked' : '') + '> ' + LABELS.requires_first_order + '</label>' +
      '<label><input type="checkbox" name="requires_birthday" ' + (elig.requires_birthday ? 'checked' : '') + '> ' + LABELS.requires_birthday + '</label>' +
      '<label><input type="checkbox" name="requires_smart_routine" ' + (elig.requires_smart_routine ? 'checked' : '') + '> ' + LABELS.requires_smart_routine + '</label>' +
      '<label>' + LABELS.allowed_tiers + '<input class="cs-row-input" name="allowed_tiers" placeholder="signature, elite" value="' + esc((elig.allowed_tiers || []).join(', ')) + '"></label>' +
      '<label>' + LABELS.birthday_mode + '<select class="cs-row-select" name="birthday_mode"><option value="">—</option><option value="day"' + (elig.birthday_mode === 'day' ? ' selected' : '') + '>day</option><option value="month"' + (elig.birthday_mode === 'month' ? ' selected' : '') + '>month</option></select></label>' +
      '<label>' + LABELS.excluded_product_slugs + '<input class="cs-row-input" name="excluded_product_slugs" placeholder="slug-1, slug-2" value="' + esc((view.excluded_product_slugs || []).join(', ')) + '"></label>' +
      '<label>' + LABELS.excluded_categories + '<input class="cs-row-input" name="excluded_categories" placeholder="cleanse, treat" value="' + esc((view.excluded_categories || []).join(', ')) + '"></label>' +
      '</div>' +
      '<p class="cs-coupon-detail-note">' + esc(view.partial_exclusion_notice || 'Bu kupon bazı ürünlerde geçerli değildir.') + ' Hariç tutma listeleri dahil etme değil, dışlama listesidir.</p>' +
      '<button class="cs-primary-btn" type="submit">Uygunluk kurallarını kaydet</button>' +
      '</form>' +
      '</div></td></tr>';
  }

  function row(coupon) {
    const view = adminView(coupon);
    const canon = canonical(coupon);
    const elig = eligibility(coupon);
    const tiers = (elig.allowed_tiers || []).join(', ') || '—';
    return '<tr data-coupon-id="' + esc(coupon.id) + '">' +
      '<td><strong>' + esc(coupon.code) + '</strong><br><small>' + esc(view.title || coupon.title || '') + '</small></td>' +
      '<td>' + esc(canon.coupon_type || coupon.type || '—') + '</td>' +
      '<td>' + esc(canon.coupon_value ?? coupon.value ?? 0) + '</td>' +
      '<td>' + esc(view.min_subtotal ?? coupon.min_subtotal ?? 0) + ' TL</td>' +
      '<td>' + (view.is_active ? 'Aktif' : 'Pasif') + '<br><small>' + esc(view.rule_source_label || '') + '</small></td>' +
      '<td><small>' + LABELS.allowed_tiers + ': ' + esc(tiers) + '</small></td>' +
      '<td>' +
      '<button type="button" class="cs-btn" data-detail="' + esc(coupon.id) + '">Detay</button> ' +
      '<button type="button" data-toggle="' + esc(coupon.id) + '" data-active="' + (view.is_active ? '0' : '1') + '">' + (view.is_active ? 'Pasifleştir' : 'Aktifleştir') + '</button>' +
      '</td></tr>';
  }

  function renderRows() {
    const tbody = $('#couponRows');
    if (!tbody) return;
    if (!coupons.length) {
      tbody.innerHTML = '<tr><td colspan="7">Kupon yok.</td></tr>';
      return;
    }
    const html = [];
    coupons.forEach((coupon) => {
      html.push(row(coupon));
      if (coupon._expanded) html.push(renderCouponDetails(coupon));
    });
    tbody.innerHTML = html.join('');
  }

  async function load() {
    token = $('#couponAdminToken')?.value || token;
    if (!token) return msg('Admin token gerekli.');
    sessionStorage.setItem(TOKEN_KEY, token);
    msg('Yükleniyor…');
    try {
      const data = await api('GET');
      coupons = (data.coupons || []).map((c) => ({ ...c, _expanded: false }));
      renderRows();
      msg('');
    } catch (e) {
      msg(e.message);
    }
  }

  function parseCsv(value) {
    return String(value || '')
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  async function saveEligibility(couponId, form) {
    const coupon = coupons.find((c) => String(c.id) === String(couponId));
    if (!coupon) throw new Error('Kupon bulunamadı.');
    const fd = new FormData(form);
    const body = {
      id: coupon.id,
      eligibility: {
        requires_auth: fd.get('requires_auth') === 'on',
        requires_first_order: fd.get('requires_first_order') === 'on',
        requires_birthday: fd.get('requires_birthday') === 'on',
        requires_smart_routine: fd.get('requires_smart_routine') === 'on',
        birthday_mode: String(fd.get('birthday_mode') || '').trim() || null,
        allowed_tiers: parseCsv(fd.get('allowed_tiers'))
      },
      excluded_product_slugs: parseCsv(fd.get('excluded_product_slugs')),
      excluded_categories: parseCsv(fd.get('excluded_categories'))
    };
    const data = await api('PATCH', body);
    const updated = data.coupon;
    const idx = coupons.findIndex((c) => String(c.id) === String(couponId));
    if (idx >= 0) coupons[idx] = { ...updated, _expanded: true };
    renderRows();
    msg('Uygunluk kuralları kaydedildi.');
  }

  async function create() {
    token = $('#couponAdminToken')?.value || token;
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    const body = {
      code: $('#couponCode').value,
      title: $('#couponTitle').value,
      type: $('#couponType').value,
      value: Number($('#couponValue').value || 0),
      min_subtotal: Number($('#couponMin').value || 0),
      max_discount: $('#couponMax').value ? Number($('#couponMax').value) : null,
      is_active: true
    };
    try {
      await api('POST', body);
      msg('Kupon oluşturuldu.');
      load();
    } catch (e) {
      msg(e.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = $('#couponAdminToken');
    if (input) input.value = token;
  });

  document.addEventListener('click', async (e) => {
    if (e.target.id === 'couponLoad') load();
    if (e.target.id === 'couponCreate') create();

    const detailBtn = e.target.closest('[data-detail]');
    if (detailBtn) {
      const id = detailBtn.dataset.detail;
      coupons = coupons.map((c) => (String(c.id) === String(id) ? { ...c, _expanded: !c._expanded } : c));
      renderRows();
      return;
    }

    const toggleBtn = e.target.closest('[data-toggle]');
    if (toggleBtn) {
      try {
        await api('PATCH', { id: toggleBtn.dataset.toggle, is_active: toggleBtn.dataset.active === '1' });
        load();
      } catch (err) {
        msg(err.message);
      }
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-coupon-edit]');
    if (!form) return;
    e.preventDefault();
    try {
      await saveEligibility(form.getAttribute('data-coupon-edit'), form);
    } catch (err) {
      msg(err.message);
    }
  });
})();
