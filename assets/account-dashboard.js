(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var state = {
    client: null,
    session: null,
    summary: null,
    activeTab: 'overview',
    ready: false,
    fatal: null,
    returnSuccessMessage: ''
  };

  var moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  var numberFmt = new Intl.NumberFormat('tr-TR');
  var tabAliases = {
    index: 'overview', dashboard: 'overview', home: 'overview',
    account: 'profile', bilgilerim: 'profile', profile: 'profile', bilgiler: 'profile',
    orders: 'orders', order: 'orders', siparisler: 'orders', siparişler: 'orders',
    returns: 'returns', refunds: 'returns', iadeler: 'returns', talepler: 'returns',
    favorites: 'favorites', favourities: 'favorites', favoriler: 'favorites',
    addresses: 'addresses', adresler: 'addresses',
    routines: 'routines', routine: 'routines', rutinler: 'routines', rutin: 'routines',
    skin: 'skin-profile', skin_profile: 'skin-profile', 'skin-profile': 'skin-profile', cilt: 'skin-profile',
    loyalty: 'club', membership: 'club', club: 'club', sadakat: 'club',
    coupons: 'coupons', coupon: 'coupons', kuponlar: 'coupons',
    payments: 'payments', payment: 'payments', odeme: 'payments', ödeme: 'payments',
    invoices: 'invoices', invoice: 'invoices', faturalar: 'invoices',
    notifications: 'notifications', notification: 'notifications', communication: 'notifications', journal: 'notifications',
    security: 'security', guvenlik: 'security', güvenlik: 'security',
    support: 'support', destek: 'support'
  };

  var statusLabels = {
    pending_payment: 'Ödeme Bekleniyor', pending_bank_transfer: 'Havale/EFT Bekleniyor', awaiting_transfer: 'Havale/EFT Bekleniyor',
    pending: 'Sipariş Alındı', created: 'Sipariş Alındı', confirmed: 'Ödeme Alındı', paid: 'Ödeme Alındı', processing: 'İşlemde',
    preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoya Verildi', delivered: 'Teslim Edildi', completed: 'Tamamlandı',
    cancelled: 'İptal Edildi', payment_failed: 'Ödeme Başarısız', failed: 'Başarısız', refunded: 'İade Edildi', partially_refunded: 'Kısmi İade'
  };
  var shipmentLabels = { not_started: 'Hazırlanmadı', unfulfilled: 'Hazırlanıyor', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoda', delivered: 'Teslim Edildi', cancelled: 'İptal Edildi' };
  var deprecatedCoupons = new Set(['COSMOSKIN10', 'CLUB10', 'WELCOME15']);

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatMoney(value) {
    var n = Number(value || 0);
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') return window.COSMOSKIN_FORMAT_PRICE(n);
    return moneyFmt.format(Number.isFinite(n) ? n : 0);
  }
  function formatDate(value, withTime) {
    if (!value) return 'Bilgi mevcut değil';
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: withTime ? '2-digit' : undefined, minute: withTime ? '2-digit' : undefined,
        timeZone: 'Europe/Istanbul'
      }).format(new Date(value));
    } catch (_) { return String(value).slice(0, 10); }
  }
  function normalizeTab(tab) { return tabAliases[String(tab || 'overview').replace(/^#/, '')] || 'overview'; }
  function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim()); }
  function readLocalFavorites() { try { var local = JSON.parse(localStorage.getItem('cosmoskin_favorites') || '[]'); return Array.isArray(local) ? local : []; } catch (_) { return []; } }
  function showToast(message, type) {
    var t = $('#accountToast');
    if (!t) return;
    if (t.parentElement !== document.body) document.body.appendChild(t);
    t.textContent = message;
    t.dataset.type = type || 'info';
    t.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { t.classList.remove('is-visible'); }, 3200);
  }
  function setLoading(loading) {
    var app = $('#accountApp'); var load = $('#accountLoading'); var layout = $('#accountLayout');
    var sidebar = $('.cs-account-sidebar');
    if (app) app.dataset.state = loading ? 'loading' : 'ready';
    if (load) load.hidden = !loading;
    if (layout) layout.hidden = loading;
    if (!loading && sidebar) {
      sidebar.hidden = false;
      sidebar.removeAttribute('aria-hidden');
      document.body.classList.remove('cs-account-auth');
      document.body.classList.add('cs-account-ready');
    }
  }
  function showFatal(title, message, detail) {
    state.fatal = { title: title, message: message, detail: detail };
    var app = $('#accountApp'); var load = $('#accountLoading'); var layout = $('#accountLayout');
    var sidebar = $('.cs-account-sidebar');
    if (app) app.dataset.state = 'error';
    if (layout) layout.hidden = true;
    if (sidebar) {
      sidebar.hidden = true;
      sidebar.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.add('cs-account-auth');
    document.body.classList.remove('cs-account-ready');
    if (load) {
      load.hidden = false;
      load.innerHTML = '<div class="cs-loading-card is-error cs-account-fatal-card">' +
        '<span class="cs-overline">HESAP BİLGİSİ</span>' +
        '<strong>' + escapeHtml(title || 'Bilgiler şu anda yüklenemedi.') + '</strong>' +
        '<p>' + escapeHtml(message || 'Hesap bilgileri alınırken bir hata oluştu.') + '</p>' +
        (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') +
        '<div class="cs-fatal-actions"><button class="cs-pill-btn cs-pill-btn--dark" onclick="window.location.reload()" type="button">Tekrar Dene</button><a class="cs-pill-btn" href="/index.html">Anasayfaya Dön</a></div>' +
      '</div>';
    }
  }
  function showAuthGate(message) {
    var app = $('#accountApp');
    var layout = $('#accountLayout');
    var load = $('#accountLoading');
    var sidebar = $('.cs-account-sidebar');
    var content = $('.cs-account-content');
    if (app) app.dataset.state = 'auth';
    if (load) load.hidden = true;
    if (layout) layout.hidden = false;
    if (sidebar) {
      sidebar.hidden = true;
      sidebar.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.add('cs-account-auth');
    document.body.classList.remove('cs-account-ready');
    if (content) {
      content.innerHTML =
        '<section class="cs-account-gate" aria-labelledby="csAccountGateTitle">' +
          '<p class="cs-account-gate__kicker">COSMOSKIN HESABIM</p>' +
          '<h1 id="csAccountGateTitle">Giriş yaparak devam et.</h1>' +
          '<p class="cs-account-gate__lede">' + escapeHtml(message || 'Siparişlerini, favorilerini, kuponlarını ve cilt rutininı güvenli hesap oturumuyla yönet.') + '</p>' +
          '<div class="cs-gate-actions">' +
            '<button type="button" class="cs-pill-btn cs-pill-btn--dark" data-cs-open-auth="loginPanel">Giriş Yap</button>' +
            '<button type="button" class="cs-pill-btn" data-cs-open-auth="registerPanel">Hesap Oluştur</button>' +
            '<a class="cs-pill-btn cs-pill-btn--quiet" href="/allproducts.html">Alışverişe Dön</a>' +
          '</div>' +
          '<ul class="cs-account-gate__benefits">' +
            '<li><span aria-hidden="true"></span>Sipariş ve kargo takibi</li>' +
            '<li><span aria-hidden="true"></span>Favoriler ve Akıllı Rutin</li>' +
            '<li><span aria-hidden="true"></span>Kuponlar ve Club puanları</li>' +
          '</ul>' +
        '</section>';
    }
  }
  function getApiBase() { return String(cfg.apiBase || '/api').replace(/\/$/, ''); }
  async function apiFetch(path, options) {
    options = options || {};
    if (!state.session || !state.session.access_token) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.');
    var res = await fetch(getApiBase() + path, {
      method: options.method || 'GET',
      headers: Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + state.session.access_token }, options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 401) throw new Error('Oturum süreniz dolmuş olabilir. Lütfen tekrar giriş yapın.');
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || 'İşlem tamamlanamadı.');
    return data;
  }

  var COSMOSKIN_ICON_BASE = '/assets/icons/cosmoskin/';
  // Club tier CSS classes: cs-tier-card--essential cs-tier-card--signature cs-tier-card--elite
  var COSMOSKIN_ACCOUNT_ICON_MAP = {
    home:'account-overview', bag:'account-orders', return:'account-returns', heart:'account-favorites', invoice:'account-orders', pin:'account-addresses', drop:'account-skin-profile', crown:'account-club', ticket:'commerce-gift', bell:'account-notifications', shield:'account-security', support:'account-support', truck:'commerce-truck', sparkle:'account-routine', user:'account-overview', clock:'status-sync', routine:'account-routine', payments:'account-payments', lock:'status-lock', empty:'status-empty', info:'status-info', check:'status-check'
  };
  function iconSvg(name) {
    var file = COSMOSKIN_ACCOUNT_ICON_MAP[name] || COSMOSKIN_ACCOUNT_ICON_MAP.sparkle;
    return '<img class="cs-icon cs-icon--account" src="' + escapeHtml(COSMOSKIN_ICON_BASE + file + '.svg') + '" alt="" aria-hidden="true" loading="lazy">';
  }

  /* Inline hub icons — <img> SVGs cannot inherit currentColor on dark/light wells */
  var HUB_ICON_PATHS = {
    bag: '<path d="M6.5 8.2h11l-.8 11.3H7.3L6.5 8.2Z"/><path d="M9.3 8.2V7.1a2.7 2.7 0 0 1 5.4 0v1.1"/><path d="M9.1 12.2h5.8"/>',
    heart: '<path d="M12 20.2 5.2 13.8a4.4 4.4 0 0 1 6.2-6.2l.6.6.6-.6a4.4 4.4 0 0 1 6.2 6.2L12 20.2Z"/>',
    sparkle: '<path d="M5 6.5h5.4M5 12h9.4M5 17.5h5.4"/><path d="m15.4 6.5 1.1 2.9 3 .9-3 .9-1.1 2.9-1.1-2.9-3-.9 3-.9 1.1-2.9Z"/>',
    crown: '<path d="m5 16-1-8.7 5 3.8 3-5.8 3 5.8 5-3.8-1 8.7H5Z"/><path d="M5.5 19h13"/>',
    ticket: '<path d="M4.5 10h15v10h-15V10Z"/><path d="M3.7 7h16.6v3H3.7V7ZM12 7v13"/><path d="M12 7c-2.8 0-4.2-.8-4.2-2.1 0-1 .8-1.8 1.8-1.8 1.5 0 2.4 1.5 2.4 3.9Z"/><path d="M12 7c2.8 0 4.2-.8 4.2-2.1 0-1-.8-1.8-1.8-1.8-1.5 0-2.4 1.5-2.4 3.9Z"/>',
    pin: '<path d="M12 21s6.4-5.8 6.4-10.8a6.4 6.4 0 0 0-12.8 0C5.6 15.2 12 21 12 21Z"/><circle cx="12" cy="10.2" r="2.1"/>',
    drop: '<path d="M12 4.2s5.4 6.1 5.4 9.7a5.4 5.4 0 1 1-10.8 0C6.6 10.3 12 4.2 12 4.2Z"/><path d="M9.2 14.9c.4 1.3 1.4 2.1 2.8 2.1"/>',
    support: '<path d="M4.8 12a7.2 7.2 0 0 1 14.4 0v4.1a2.8 2.8 0 0 1-2.8 2.8h-2.2"/><path d="M4.8 12v3.3a1.8 1.8 0 0 0 1.8 1.8h1.1v-5.9H4.8ZM19.2 12v5.1h-2.9v-5.9h2.9Z"/>',
    return: '<path d="M8.2 8.5H5.4V5.7"/><path d="M5.4 8.5A7 7 0 1 1 7.2 18"/><path d="M9.2 12h5.6"/><path d="m12.4 9.4 2.6 2.6-2.6 2.6"/>',
    invoice: '<path d="M7 4.5h10v15l-2.2-1.4-2.3 1.4-2.3-1.4L7.9 19.5 7 18.9V4.5Z"/><path d="M9.4 9h5.2M9.4 12h5.2M9.4 15h3.4"/>',
    user: '<circle cx="12" cy="8.2" r="3.1"/><path d="M5.4 19.2c1.1-3.2 3.2-4.7 6.6-4.7s5.5 1.5 6.6 4.7"/>',
    bell: '<path d="M8.2 17.6h7.6"/><path d="M9.1 17.6V10.8a2.9 2.9 0 0 1 5.8 0v6.8"/><path d="M6.6 14.4h10.8"/><path d="M11.2 4.8h1.6"/>',
    payments: '<rect x="3.8" y="7.2" width="16.4" height="11.2" rx="2.2"/><path d="M3.8 11.2h16.4"/><path d="M8.2 15.2h3.4"/>',
    shield: '<path d="M12 3.8 5.6 6.2v5.4c0 4.1 2.7 7.1 6.4 8.6 3.7-1.5 6.4-4.5 6.4-8.6V6.2L12 3.8Z"/><path d="m9.4 12 1.8 1.8 3.6-3.8"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.8v4.6l3 1.8"/>'
  };
  function hubIconSvg(name) {
    var paths = HUB_ICON_PATHS[name] || HUB_ICON_PATHS.sparkle;
    return '<svg class="cs-hub-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  /* Overview “more” list — thinner, optically matched icon set */
  var MORE_ICON_PATHS = {
    return:
      '<path d="M8.2 7.2h7.6v9.2c0 .7-.5 1.2-1.2 1.2H9.4c-.7 0-1.2-.5-1.2-1.2V7.2Z"/>' +
      '<path d="M10 4.8h4"/>' +
      '<path d="M7.2 11.2H4.6"/>' +
      '<path d="M6.2 9.4 4.4 11.2l1.8 1.8"/>',
    invoice:
      '<path d="M8 3.6h8c.7 0 1.2.5 1.2 1.2v14.6l-2.4-1.4-2.4 1.4-2.4-1.4-2.4 1.4V4.8c0-.7.5-1.2 1.2-1.2Z"/>' +
      '<path d="M10.2 8.4h3.6M10.2 11.6h3.6M10.2 14.8h2.2"/>',
    user:
      '<circle cx="12" cy="8" r="3.2"/>' +
      '<path d="M5.5 19.2c1-3.4 3.2-5.1 6.5-5.1s5.5 1.7 6.5 5.1"/>',
    bell:
      '<path d="M8.2 17.6h7.6"/>' +
      '<path d="M8.5 17.6V10.4a3.5 3.5 0 0 1 7 0v7.2"/>' +
      '<path d="M6.4 13.8h11.2"/>' +
      '<path d="M12 4.5v1.4"/>' +
      '<path d="M10.5 17.6a1.5 1.5 0 0 0 3 0"/>',
    payments:
      '<rect x="3.6" y="6.6" width="16.8" height="11.2" rx="2.3"/>' +
      '<path d="M3.6 10.4h16.8"/>' +
      '<path d="M7.4 14.6h3.8"/>' +
      '<path d="M15.2 14.6h1.8"/>',
    shield:
      '<path d="M12 3.5 5.4 6v5.4c0 4.3 2.9 7.4 6.6 8.9 3.7-1.5 6.6-4.6 6.6-8.9V6L12 3.5Z"/>' +
      '<path d="m9.2 12 2 2 3.8-4"/>'
  };
  function moreIconSvg(name) {
    var paths = MORE_ICON_PATHS[name] || MORE_ICON_PATHS.user;
    return '<svg class="cs-more-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  function moreChevronSvg() {
    return '<svg class="cs-more-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>';
  }


  function labelFromMap(value, map, fallback) {
    var key = String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '_').replace(/-/g, '_');
    return map[key] || (value ? String(value) : (fallback || 'Henüz tamamlanmadı'));
  }
  function cleanSkinType(value) {
    return labelFromMap(value, { dry:'Kuru cilt', kuru:'Kuru cilt', kuru_cilt:'Kuru cilt', oily:'Yağlı cilt', yagli:'Yağlı cilt', yağlı:'Yağlı cilt', yagli_cilt:'Yağlı cilt', yağlı_cilt:'Yağlı cilt', combination:'Karma cilt', karma:'Karma cilt', karma_cilt:'Karma cilt', normal:'Normal cilt', normal_cilt:'Normal cilt', sensitive:'Hassas cilt', hassas:'Hassas cilt', hassas_cilt:'Hassas cilt' }, 'Cilt profili bekliyor');
  }
  function cleanSensitivity(value) { return labelFromMap(value, { low:'Düşük', medium:'Orta', high:'Yüksek', dusuk:'Düşük', düşük:'Düşük', orta:'Orta', yuksek:'Yüksek', yüksek:'Yüksek' }, 'Belirtilmedi'); }
  function cleanGoal(value) { return labelFromMap(value, { hydration:'Nem desteği', nem:'Nem desteği', nem_destegi:'Nem desteği', nem_desteği:'Nem desteği', radiance:'Işıltı', glow:'Işıltı', isilti:'Işıltı', ışılti:'Işıltı', barrier:'Bariyer desteği', bariyer:'Bariyer desteği', blemish:'Leke/akne görünümü', leke:'Leke görünümü', acne:'Akne eğilimi', akne:'Akne eğilimi', anti_aging:'Yaşlanma karşıtı bakım', sensitive:'Hassasiyet desteği', hassasiyet:'Hassasiyet desteği' }, 'Belirtilmedi'); }

  function normalizeProduct(product) {
    if (!product || typeof product !== 'object') return null;
    var slug = product.slug || product.product_slug || product.id || '';
    return {
      id: product.id || slug,
      product_slug: slug,
      product_name: product.name || product.product_name || product.title || 'Ürün',
      brand: product.brand || 'COSMOSKIN',
      category: product.category || product.routine_step || '',
      price: Number(product.price || product.unit_price || product.line_total || 0) || 0,
      image: product.image || product.image_url || '',
      url: product.url || product.product_url || (slug ? '/products/' + slug + '.html' : '/allproducts.html'),
      keywords: asArray(product.keywords || product.tags || product.concern_tags),
      stock: product.stock_status || product.stockStatus || product.inventory_status || product.status || 'unknown'
    };
  }
  function allProducts() { return asArray(window.COSMOSKIN_PRODUCTS).map(normalizeProduct).filter(Boolean); }
  function getProductByHandle(handle) {
    var raw = String(handle || '').replace(/^.*\/products\//, '').replace(/\.html.*$/, '').replace(/^\//, '');
    var catalog = asArray(window.COSMOSKIN_PRODUCTS);
    var hit = catalog.find(function (p) {
      if (!p) return false;
      var slug = p.slug || p.product_slug || p.id || '';
      if (slug === raw || p.id === raw || p.url === handle) return true;
      var aliases = asArray(p.aliases);
      return aliases.indexOf(raw) !== -1;
    });
    return hit ? normalizeProduct(hit) : null;
  }
  function displayName(user) { return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Üye'; }
  function firstName(user) { return user.first_name || String(displayName(user)).split(/\s+/)[0] || ''; }
  function initials(user) {
    var n = displayName(user) || user.email || 'CK';
    var parts = String(n).trim().split(/\s+/);
    var letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
    return letters.toLocaleUpperCase('tr-TR') || 'CK';
  }

  function normalizeSummary(data) {
    data = safeObject(data);
    var user = safeObject(data.user);
    var orders = asArray(data.orders).map(function (o) { return Object.assign({ order_items: [], shipments: [], invoices: [], return_requests: [] }, safeObject(o)); });
    var returns = asArray(data.returns);
    orders.forEach(function (order) { asArray(order.return_requests).forEach(function (r) { returns.push(Object.assign({ order: order }, r)); }); });
    var stats = Object.assign({ order_count: orders.length, active_order_count: 0, favorites_count: 0, addresses_count: 0, unread_notifications: 0 }, safeObject(data.stats));
    return Object.assign({}, data, {
      user: user,
      stats: stats,
      orders: orders,
      returns: returns,
      addresses: asArray(data.addresses),
      favorites: asArray(data.favorites),
      coupons: asArray(data.coupons),
      locked_coupons: asArray(data.locked_coupons || data.upcoming_coupons),
      routine_results: asArray(data.routine_results || data.routines),
      support_requests: asArray(data.support_requests),
      notifications: asArray(data.notifications).map(function (n) {
        n = safeObject(n);
        var isRead = n.is_read === true || Boolean(n.read_at);
        return Object.assign({}, n, { is_read: isRead });
      }),
      legal_consents: asArray(data.legal_consents),
      notification_preferences: data.notification_preferences || safeObject(user.communication),
      skin_profile: data.skin_profile || null,
      membership: data.membership || null,
      points: Object.assign({ balance: 0, available: 0, pending: 0, reversed: 0, ledger: [] }, safeObject(data.points))
    });
  }
  // Canonical COSMOSKIN Club tiers — must match functions/api/_lib/loyalty-config.js
  // exactly. Only these three tiers exist; no other legacy tier names.
  var LOYALTY_TIERS = {
    essential: { code: 'essential', label: 'Essential Üye', name: 'Essential', spendThreshold: 0, orderThreshold: 0 },
    signature: { code: 'signature', label: 'Signature Üye', name: 'Signature', spendThreshold: 6000, orderThreshold: 3 },
    elite: { code: 'elite', label: 'Elite Üye', name: 'Elite', spendThreshold: 15000, orderThreshold: 8 }
  };
  var LOYALTY_POINT_STATUS_LABELS = { pending: 'Beklemede', available: 'Kullanılabilir', reversed: 'Geri alındı', expired: 'Süresi doldu' };
  var LOYALTY_POINT_EVENT_LABELS = { purchase: 'Sipariş kazanımı', purchase_partial_reversal: 'Kısmi iade düzeltmesi', redemption: 'Kullanıldı', birthday: 'Doğum günü avantajı', admin_adjustment: 'Manuel düzenleme' };
  function normalizeTierName(value, spendOrPoints) {
    var raw = String(value || '').toLocaleLowerCase('tr-TR');
    if (raw.indexOf('elite') !== -1) return LOYALTY_TIERS.elite.label;
    if (raw.indexOf('signature') !== -1) return LOYALTY_TIERS.signature.label;
    var spend = Number(spendOrPoints || 0);
    if (spend >= LOYALTY_TIERS.elite.spendThreshold) return LOYALTY_TIERS.elite.label;
    if (spend >= LOYALTY_TIERS.signature.spendThreshold) return LOYALTY_TIERS.signature.label;
    return LOYALTY_TIERS.essential.label;
  }
  function loyalty() {
    var summary = state.summary || {};
    var stats = summary.stats || {};
    var membership = summary.membership || {};
    var pointsObj = summary.points || {};
    var tier = stats.tier || {};
    var spend = finiteNumber(stats.product_spend_total ?? membership.loyalty_spend_ex_shipping ?? membership.rolling_spend_ex_shipping ?? membership.rolling_spend_12m ?? tier.spend, 0);
    // Available/pending/reversed points come straight from the backend ledger
    // (summary.points — status-aware, RPC-backed as of Batch 4 Step 2). Never
    // guessed from spend or order totals, even when the ledger is empty.
    var available = Math.max(0, Math.round(finiteNumber(pointsObj.available, 0)));
    var pending = Math.max(0, Math.round(finiteNumber(pointsObj.pending, 0)));
    var reversed = Math.max(0, Math.round(finiteNumber(pointsObj.reversed, 0)));
    var hasLedgerHistory = Boolean(pointsObj.has_ledger_history) || asArray(pointsObj.ledger).length > 0;
    var maintenanceNoteRequired = Boolean(pointsObj.maintenance_note_required);
    var label = normalizeTierName(membership.level_code || tier.key || tier.label, spend);
    var key = loyaltyTierKey(label);
    var canonical = LOYALTY_TIERS[key] || LOYALTY_TIERS.essential;
    var nextKey = key === 'essential' ? 'signature' : (key === 'signature' ? 'elite' : '');
    var nextTier = nextKey ? LOYALTY_TIERS[nextKey] : null;
    var next = nextTier ? nextTier.name : '';
    var threshold = nextTier ? nextTier.spendThreshold : Math.max(spend, LOYALTY_TIERS.elite.spendThreshold);
    var base = canonical.spendThreshold;
    var remaining = nextTier ? Math.max(0, threshold - spend) : 0;
    // Always derive fill from spend. Backend tier.progress can arrive as 0
    // even when spend > 0; never prefer a zero/stale progress over spend math.
    var spendProgress = nextTier
      ? Math.max(0, Math.min(100, Math.round(((spend - base) / Math.max(1, threshold - base)) * 100)))
      : 100;
    var apiProgress = Number(tier.progress);
    var progress = (Number.isFinite(apiProgress) && apiProgress > 0)
      ? Math.max(0, Math.min(100, Math.round(apiProgress)))
      : spendProgress;
    if (spend > 0 && progress === 0) progress = spendProgress;
    return { key: key, label: label, spend: spend, available: available, pending: pending, reversed: reversed, next: next, threshold: threshold, remaining: remaining, progress: progress, hasLedgerHistory: hasLedgerHistory, maintenanceNoteRequired: maintenanceNoteRequired };
  }
  function skinProfile() {
    var user = state.summary?.user || {};
    var row = state.summary?.skin_profile || {};
    var secondary = row.secondary_goal || row.secondaryGoal || '';
    var concerns = asArray(row.secondary_goals || row.concerns || row.skin_concerns || user.secondary_goals || user.skin_concerns);
    if (secondary && concerns.indexOf(secondary) === -1) concerns = [secondary].concat(concerns);
    var primaryGoal = row.primary_goal || row.routine_goal || user.primary_goal || user.routine_goal || '';
    var goals = concerns.slice();
    if (primaryGoal) goals.unshift(primaryGoal);
    return {
      id: row.id || '',
      skin_type: row.skin_type || row.skinType || user.skin_type || '',
      sensitivity: row.sensitivity || row.skin_sensitivity || user.skin_sensitivity || '',
      concerns: concerns,
      goals: goals.filter(Boolean),
      routine_goal: primaryGoal,
      secondary_goal: secondary || concerns[0] || '',
      routine_preference: row.routine_style || row.routine_preference || user.routine_style || '',
      budget_band: row.budget_band || user.budget_band || '',
      avoid_ingredients: asArray(row.avoid_ingredients || user.avoid_ingredients),
      preferred_texture: row.preferred_texture || user.preferred_texture || '',
      spf_habit: row.spf_habit || user.spf_habit || '',
      updated_at: row.updated_at || user.skin_profile_updated_at || ''
    };
  }
  function hasSkinProfile(sp) { sp = sp || skinProfile(); return Boolean(sp.skin_type || sp.sensitivity || sp.routine_goal || sp.goals.length || sp.updated_at); }
  function profileGoalLabels(sp) {
    sp = sp || skinProfile();
    var values = [];
    if (sp.routine_goal) values.push(cleanGoal(sp.routine_goal));
    sp.goals.forEach(function (g) { var label = cleanGoal(g); if (label && !values.includes(label)) values.push(label); });
    return values.filter(Boolean);
  }
  function normalizeRoutineRecord(row) {
    row = safeObject(row);
    var result = safeObject(row.result);
    var profile = safeObject(row.skin_profile_snapshot || result.skin_profile_snapshot);
    var morning = asArray(row.morning_steps || result.morning_steps || result.morning || result.dayRoutine);
    var evening = asArray(row.evening_steps || result.evening_steps || result.evening || result.nightRoutine);
    var weekly = asArray(row.weekly_steps || result.weekly_steps || result.weekly);
    var products = asArray(row.recommended_products || result.recommended_products || result.products || result.uniqueProductSlugs);
    return Object.assign({}, row, {
      result: result,
      skin_profile_snapshot: profile,
      morning_steps: morning,
      evening_steps: evening,
      weekly_steps: weekly,
      recommended_products: products,
      routine_score: Number(row.routine_score || result.routine_score || result.score || result.matchScore || 0) || 0,
      routine_title: row.routine_title || result.routine_title || result.title || result.name || 'Kayıtlı Akıllı Rutin',
      updated_at: row.updated_at || row.completed_at || row.created_at || result.updatedAt || ''
    });
  }
  function stepProduct(step) {
    step = safeObject(step);
    return step.product || step;
  }
  function routineStepsHtml(title, steps) {
    steps = asArray(steps);
    if (!steps.length) return '<section class="cs-routine-steps"><h4>' + escapeHtml(title) + '</h4><p>Bu adım için kayıtlı ürün bulunmuyor.</p></section>';
    return '<section class="cs-routine-steps"><h4>' + escapeHtml(title) + '</h4><ol>' + steps.map(function (step) {
      var product = stepProduct(step);
      var prod = getProductByHandle(product.product_slug || product.slug || product.id) || normalizeProduct(product);
      var rawLabel = String(step.label || step.routine_step || product.routine_step || prod?.category || 'Rutin adımı');
      var label = rawLabel.replace(new RegExp('^' + title + '\\s*[:\\-–]?\\s*', 'i'), '').trim() || rawLabel;
      return '<li><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(prod?.product_name || product.name || 'Ürün') + '</strong></li>';
    }).join('') + '</ol></section>';
  }
  function profilePreferenceCount(sp) {
    sp = sp || skinProfile();
    var count = 0;
    if (sp.skin_type) count += 1;
    if (sp.sensitivity) count += 1;
    count += sp.goals.filter(Boolean).length;
    if (sp.routine_preference) count += 1;
    return count;
  }

  function statusFromOrder(order) { return String(order?.status || order?.fulfillment_status || order?.payment_status || '').toLowerCase(); }
  function burnsWelcomeCoupon(order) {
    var status = statusFromOrder(order);
    var payment = String(order?.payment_status || '').toLowerCase();
    if (['cancelled', 'expired', 'failed', 'payment_failed'].includes(status)) return false;
    if (['pending', 'payment_pending', 'bank_transfer_pending'].includes(status)) return false;
    if (['failed', 'cancelled', 'expired', 'payment_failed', 'payment_pending', 'bank_transfer_pending', 'pending'].includes(payment)) return false;
    return ['paid', 'payment_confirmed', 'confirmed', 'processing', 'preparing', 'packed', 'shipped', 'delivered', 'completed'].includes(status)
      || ['paid', 'payment_confirmed', 'confirmed', 'captured'].includes(payment)
      || Boolean(order?.paid_at);
  }
  function paymentPaid(order) {
    var p = String(order?.payment_status || '').toLowerCase(); var s = statusFromOrder(order);
    return ['paid', 'confirmed', 'captured', 'preparing', 'packed', 'shipped', 'delivered', 'completed'].includes(p) || ['paid', 'confirmed', 'preparing', 'packed', 'shipped', 'delivered', 'completed'].includes(s) || Boolean(order?.paid_at);
  }
  function finiteNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (Number.isFinite(Number(fallback)) ? Number(fallback) : 0);
  }
  function loyaltyTierKey(label) {
    var raw = String(label || '').toLocaleLowerCase('tr-TR');
    if (raw.indexOf('elite') !== -1) return 'elite';
    if (raw.indexOf('signature') !== -1) return 'signature';
    return 'essential';
  }
  function hasSuccessfulOrder() {
    var stats = state.summary?.stats || {};
    if (Number(stats.paid_order_count || 0) > 0) return true;
    return asArray(state.summary?.orders).some(burnsWelcomeCoupon);
  }
  function parseBirthdayParts(value) {
    var raw = String(value || '').trim().slice(0, 10);
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return null;
    return { month: Number(match[2]), day: Number(match[3]) };
  }
  function isBirthdayCouponEligible(birthDate, now, windowDays) {
    var parts = parseBirthdayParts(birthDate);
    if (!parts) return false;
    now = now || new Date();
    var window = Math.max(0, Number(windowDays) || 0);
    if (window <= 0) return parts.month === (now.getMonth() + 1) && parts.day === now.getDate();
    var year = now.getFullYear();
    var birthday = new Date(year, parts.month - 1, parts.day);
    var today = new Date(year, now.getMonth(), now.getDate());
    var diffDays = Math.round((today.getTime() - birthday.getTime()) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && diffDays <= window;
  }
  function birthdayCouponUsedThisYear() {
    var year = new Date().getFullYear();
    return asArray(state.summary?.coupons).some(function (c) {
      var code = String(c.code || c.coupon_code || '').toUpperCase();
      if (code !== 'BIRTHDAY10') return false;
      var status = String(c.status || c.usage_status || '').toLowerCase();
      if (!['used', 'redeemed', 'consumed'].includes(status)) return false;
      var usedAt = c.used_at || c.redeemed_at || c.updated_at || c.created_at;
      return usedAt ? new Date(usedAt).getFullYear() === year : false;
    });
  }
  function isBirthday10Eligible() {
    if (state.summary?.coupon_eligibility && typeof state.summary.coupon_eligibility.birthday10_eligible === 'boolean') {
      return Boolean(state.summary.coupon_eligibility.birthday10_eligible);
    }
    var user = state.summary?.user || {};
    if (!user.birthday) return false;
    if (birthdayCouponUsedThisYear()) return false;
    return isBirthdayCouponEligible(user.birthday, new Date(), 0);
  }
  function activeOrders() {
    return asArray(state.summary?.orders).filter(function (o) {
      var s = statusFromOrder(o); var p = String(o.payment_status || '').toLowerCase();
      return ['paid', 'confirmed', 'processing', 'preparing', 'packed', 'shipped'].includes(s) || ['paid', 'confirmed', 'captured'].includes(p);
    });
  }
  function orderItems(order) { return asArray(order?.order_items || order?.items); }
  function itemCount(order) { return orderItems(order).reduce(function (sum, item) { return sum + (Number(item.quantity) || 1); }, 0); }
  function shipment(order) { return order?.latest_shipment || asArray(order?.shipments)[0] || {}; }
  function safeOrderNumber(order) { return String(order?.order_number || order?.id || 'Sipariş numarası yok'); }
  function orderStatusText(order) {
    if (order?.cancel_requested_at || String(order?.cancellation_status || '').toLowerCase() === 'request_pending') return 'İptal talebi alındı';
    var s = statusFromOrder(order);
    if (String(order?.cancellation_status || '').toLowerCase() === 'cancelled' || s === 'cancelled') return 'İptal Edildi';
    if (String(order?.payment_status || '').toLowerCase() === 'payment_failed' || s === 'payment_failed') return 'Ödeme Başarısız';
    if (['paid','confirmed'].includes(s)) return 'Hazırlanıyor';
    return statusLabels[s] || statusLabels[order?.fulfillment_status] || shipmentLabels[shipment(order).status] || 'Durum bilgisi bekleniyor';
  }
  function orderProgressStep(order) {
    var s = statusFromOrder(order); var ship = String(shipment(order).status || '').toLowerCase();
    var current = 1;
    if (paymentPaid(order)) current = 2;
    if (['preparing','packed','shipped','delivered','completed'].includes(s) || ['preparing','packed'].includes(String(order?.fulfillment_status || '').toLowerCase())) current = 3;
    if (['shipped','delivered','completed'].includes(s) || ship === 'shipped' || shipment(order).tracking_number) current = 4;
    if (['delivered','completed'].includes(s) || ship === 'delivered') current = 5;
    return current;
  }
  function orderProgress(order, opts) {
    opts = opts || {};
    var current = orderProgressStep(order);
    var labels = opts.short
      ? ['Alındı', 'Ödeme', 'Hazırlık', 'Kargo', 'Teslim']
      : ['Sipariş Alındı', 'Ödeme', 'Hazırlık', 'Kargo', 'Teslim'];
    var cls = 'cs-order-progress';
    var stepCls = 'cs-order-step';
    if (opts.spotlight) {
      cls = 'cs-order-spotlight__track';
      stepCls = 'cs-order-spotlight__step';
    } else if (opts.list) {
      cls = 'cs-order-card__track';
      stepCls = 'cs-order-card__step';
    }
    var fillPct = Math.max(0, Math.min(100, Math.round(((current - 1) / Math.max(1, labels.length - 1)) * 100)));
    var stepsHtml = labels.map(function (label, i) {
      var done = i < current - 1;
      var isCurrent = i === current - 1;
      return '<li class="' + stepCls + (done ? ' is-done' : '') + (isCurrent ? ' is-current' : '') + '">' +
        '<span class="' + (opts.spotlight ? 'cs-order-spotlight__dot' : '') + '" aria-hidden="true"></span>' +
        '<strong>' + escapeHtml(label) + '</strong>' +
      '</li>';
    }).join('');
    if (opts.spotlight) {
      return '<div class="cs-order-spotlight__journey" data-step="' + current + '">' +
        '<div class="cs-order-spotlight__rail" aria-hidden="true"><i class="cs-order-spotlight__rail-fill" style="--cs-order-fill:' + fillPct + '%"></i></div>' +
        '<ol class="' + cls + '" aria-label="Sipariş durumu">' + stepsHtml + '</ol>' +
      '</div>';
    }
    return '<ol class="' + cls + '" aria-label="Sipariş durumu" data-step="' + current + '">' + stepsHtml + '</ol>';
  }

  function orderSpotlight(order) {
    var firstItem = orderItems(order)[0] || {};
    var p = getProductByHandle(firstItem.product_slug || firstItem.product_id || firstItem.product_url) || normalizeProduct(firstItem) || {};
    var ship = shipment(order);
    var detail = '/account/order-detail.html?id=' + encodeURIComponent(order.id || order.order_number || '');
    var qty = Number(firstItem.quantity) || 1;
    var more = Math.max(0, itemCount(order) - qty);
    var moreLabel = more > 0 ? ' · +' + more + ' ürün' : '';
    var carrier = ship.carrier || ship.carrier_name || '';
    var shipLabel = shipmentLabels[ship.status] || orderStatusText(order);
    var statusText = orderStatusText(order);
    var statusKey = String(statusFromOrder(order) || '').toLowerCase();
    var pillTone = 'is-prep';
    if (['shipped'].includes(statusKey) || ship.tracking_number) pillTone = 'is-ship';
    if (['delivered', 'completed'].includes(statusKey)) pillTone = 'is-done';
    if (['cancelled', 'payment_failed'].includes(statusKey) || order.cancel_requested_at) pillTone = 'is-alert';
    var tracking = ship.tracking_number && ship.tracking_url
      ? '<a class="cs-order-spotlight__btn" href="' + escapeHtml(ship.tracking_url) + '" target="_blank" rel="noopener">Kargo takip</a>'
      : '';
    var chev = '<svg class="cs-order-spotlight__chev" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<article class="cs-order-spotlight cs-order-spotlight--v2" data-status="' + escapeHtml(statusKey || 'processing') + '">' +
      '<span class="cs-order-spotlight__aura" aria-hidden="true"></span>' +
      '<header class="cs-order-spotlight__head">' +
        '<div class="cs-order-spotlight__id">' +
          '<span class="cs-order-spotlight__kicker">Son sipariş</span>' +
          '<strong>' + escapeHtml(safeOrderNumber(order)) + '</strong>' +
          '<time datetime="' + escapeHtml(order.created_at || '') + '">' + escapeHtml(formatDate(order.created_at)) + ' · ' + itemCount(order) + ' ürün</time>' +
        '</div>' +
        '<a class="cs-order-spotlight__all" data-tab-link="orders" href="/account/profile.html?tab=orders">Tümü' + chev + '</a>' +
      '</header>' +
      '<div class="cs-order-spotlight__status">' +
        '<span class="cs-order-spotlight__pill ' + pillTone + '">' + escapeHtml(statusText) + '</span>' +
        (paymentPaid(order) ? '<span class="cs-order-spotlight__paid">Ödeme alındı</span>' : '') +
      '</div>' +
      orderProgress(order, { short: true, spotlight: true }) +
      '<a class="cs-order-spotlight__product" href="' + escapeHtml(p.url || '/allproducts.html') + '">' +
        '<span class="cs-order-spotlight__thumb"><img src="' + escapeHtml(p.image || firstItem.image || '/assets/logo-mark-beige.png') + '" alt="" loading="lazy"></span>' +
        '<span class="cs-order-spotlight__copy">' +
          '<span class="cs-order-spotlight__brand">' + escapeHtml(p.brand || firstItem.brand || 'COSMOSKIN') + '</span>' +
          '<strong>' + escapeHtml(p.product_name || firstItem.product_name || 'Ürün bilgisi bekleniyor') + '</strong>' +
          '<small>' + qty + ' adet' + moreLabel + '</small>' +
        '</span>' +
        '<b class="cs-order-spotlight__price">' + escapeHtml(formatMoney(order.total_amount || firstItem.line_total || p.price || 0)) + '</b>' +
      '</a>' +
      '<div class="cs-order-spotlight__meta" role="list">' +
        '<span role="listitem"><em>Durum</em><b>' + escapeHtml(shipLabel) + '</b></span>' +
        (carrier ? '<span role="listitem"><em>Kargo</em><b>' + escapeHtml(carrier) + '</b></span>' : '') +
      '</div>' +
      '<div class="cs-order-spotlight__actions">' +
        '<a class="cs-order-spotlight__btn cs-order-spotlight__btn--primary" href="' + escapeHtml(detail) + '">Sipariş detayı</a>' +
        '<a class="cs-order-spotlight__btn" data-tab-link="support" href="/account/profile.html?tab=support">Destek</a>' +
        tracking +
      '</div>' +
    '</article>';
  }

  function stockInfo(product) {
    product = product || {};
    var raw = String(product.stock || product.stock_status || product.inventory_status || product.status || '').toLowerCase();
    if (['out','out_of_stock','sold_out','unavailable','tükendi','stokta_yok'].includes(raw)) return { sellable: false, label: 'Stokta yok', className: 'is-out', buttonLabel: 'Stokta yok' };
    if (['in','in_stock','available','stokta','active','true'].includes(raw)) return { sellable: true, label: 'Stokta', className: 'is-in', buttonLabel: 'Sepete ekle' };
    return { sellable: false, label: 'Kontrol ediliyor', className: 'is-unknown', buttonLabel: 'Bekliyor' };
  }
  function liveStockState(product, opts) {
    opts = opts || {};
    product = product || {};
    var slug = product.product_slug || product.id || '';
    if (opts.useLiveStock && window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.favoriteStockState === 'function') {
      return window.COSMOSKIN_STOCK.favoriteStockState(slug);
    }
    return stockInfo(product);
  }
  function scoreProduct(product, sp) {
    product = product || {}; sp = sp || skinProfile();
    var hay = [product.product_name, product.brand, product.category].concat(product.keywords || []).join(' ').toLocaleLowerCase('tr-TR');
    var score = 0;
    sp.goals.concat([sp.routine_goal, sp.skin_type, sp.sensitivity]).filter(Boolean).forEach(function (value) {
      String(value).toLocaleLowerCase('tr-TR').split(/\s+|,|\//).filter(function (w) { return w.length > 2; }).forEach(function (w) { if (hay.indexOf(w) !== -1) score += 3; });
    });
    if (/güneş|spf|sun/i.test(product.category + ' ' + hay)) score += 2;
    if (/serum|ampul|essence|tonik/i.test(product.category + ' ' + hay)) score += 1;
    if (!stockInfo(product).sellable) score -= 20;
    return score;
  }
  function recommendedProducts(limit) {
    var products = allProducts();
    if (!products.length || !hasSkinProfile()) return [];
    var sp = skinProfile();
    return products.slice().sort(function (a, b) { return scoreProduct(b, sp) - scoreProduct(a, sp) || String(a.product_name).localeCompare(String(b.product_name), 'tr'); }).slice(0, Number(limit || 4));
  }
  function purchasedSlugMap() {
    var seen = {};
    asArray(state.summary?.orders).forEach(function (order) {
      orderItems(order).forEach(function (item) {
        var key = String(item.product_slug || item.slug || item.product_id || item.id || '').trim();
        if (key) seen[key] = true;
      });
    });
    return seen;
  }
  function purchaseBasedRecommendations(limit) {
    limit = Number(limit) || 8;
    var purchased = purchasedSlugMap();
    var purchasedKeys = Object.keys(purchased);
    if (!purchasedKeys.length) return recommendedProducts(limit);
    var brandSet = {};
    var catSet = {};
    purchasedKeys.forEach(function (slug) {
      var p = getProductByHandle(slug);
      if (!p) return;
      if (p.brand) brandSet[String(p.brand).toLocaleLowerCase('tr-TR')] = true;
      if (p.category) catSet[String(p.category).toLocaleLowerCase('tr-TR')] = true;
    });
    var sp = skinProfile();
    var catalog = allProducts().filter(function (p) {
      if (!p) return false;
      var slug = p.product_slug || p.id || '';
      return !purchased[slug] && !purchased[p.id];
    });
    if (!catalog.length) return recommendedProducts(limit);
    return catalog.map(function (p) {
      var score = scoreProduct(p, sp);
      if (brandSet[String(p.brand || '').toLocaleLowerCase('tr-TR')]) score += 10;
      if (catSet[String(p.category || '').toLocaleLowerCase('tr-TR')]) score += 6;
      return { product: p, score: score };
    }).sort(function (a, b) {
      return b.score - a.score || String(a.product.product_name).localeCompare(String(b.product.product_name), 'tr');
    }).slice(0, limit).map(function (row) { return row.product; });
  }
  function recsCarouselModule() {
    var products = purchaseBasedRecommendations(8);
    if (!products.length) return '';
    var hasPurchases = Object.keys(purchasedSlugMap()).length > 0;
    var kicker = hasPurchases ? 'Senin için' : 'Profiline göre';
    var title = hasPurchases ? 'Son alışverişine uygun seçkiler' : 'Cilt profiline uygun öneriler';
    var cards = products.map(function (p, i) {
      var slug = p.product_slug || p.id || '';
      return '<article class="cs-rec-slide" style="--cs-rec-i:' + i + '">' +
        '<a class="cs-rec-slide__media" href="' + escapeHtml(p.url || '/allproducts.html') + '">' +
          '<img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name || 'Ürün') + '" loading="lazy">' +
        '</a>' +
        '<div class="cs-rec-slide__body">' +
          '<span class="cs-rec-slide__brand">' + escapeHtml(p.brand || 'COSMOSKIN') + '</span>' +
          '<a class="cs-rec-slide__title" href="' + escapeHtml(p.url || '/allproducts.html') + '">' + escapeHtml(p.product_name || 'Ürün') + '</a>' +
          '<div class="cs-rec-slide__row">' +
            '<b>' + escapeHtml(formatMoney(p.price || 0)) + '</b>' +
            '<button class="cs-rec-slide__cart" type="button" data-add-product-cart="' + escapeHtml(slug) + '" aria-label="Sepete ekle">+</button>' +
          '</div>' +
        '</div></article>';
    }).join('');
    return '<section class="cs-overview-module cs-recs-rail" aria-label="' + escapeHtml(title) + '">' +
      '<header class="cs-recs-rail__head">' +
        '<div><span class="cs-recs-rail__kicker">' + escapeHtml(kicker) + '</span><h2>' + escapeHtml(title) + '</h2></div>' +
        '<div class="cs-recs-rail__controls">' +
          '<button type="button" class="cs-recs-rail__nav" data-recs-dir="-1" aria-label="Önceki ürünler">‹</button>' +
          '<button type="button" class="cs-recs-rail__nav" data-recs-dir="1" aria-label="Sonraki ürünler">›</button>' +
        '</div>' +
      '</header>' +
      '<div class="cs-recs-rail__track" data-recs-track tabindex="0">' + cards + '</div>' +
      '<a class="cs-recs-rail__more" href="/allproducts.html">Tüm ürünleri keşfet</a>' +
    '</section>';
  }
  function couponStripModule() {
    var coupons = activeCoupons().slice(0, 2);
    if (!coupons.length) return '';
    return '<section class="cs-overview-module cs-coupon-strip" aria-label="Aktif kuponlar">' +
      '<header class="cs-coupon-strip__head"><span>Aktif kupon</span><a data-tab-link="coupons" href="/account/profile.html?tab=coupons">Tümü</a></header>' +
      '<div class="cs-coupon-strip__list">' + coupons.map(function (c, i) {
        return '<article class="cs-coupon-strip__card" style="--cs-cp-i:' + i + '">' +
          '<strong>' + escapeHtml(c.code) + '</strong>' +
          '<p>' + escapeHtml(c.title || c.description || 'Avantaj') + '</p>' +
          '<button type="button" class="cs-coupon-strip__copy" data-copy-coupon="' + escapeHtml(c.code) + '">Kopyala</button>' +
        '</article>';
      }).join('') + '</div></section>';
  }
  function accountPulseModule(user) {
    var unread = asArray(state.summary?.notifications).filter(function (n) { return !n.is_read; }).length;
    var addr = asArray(state.summary?.addresses).find(function (a) { return a.is_default; }) || asArray(state.summary?.addresses)[0];
    var addrLabel = addr
      ? [addr.title || 'Adres', addr.district || addr.city].filter(Boolean).join(' · ')
      : 'Adres ekle';
    var l = loyalty();
    return '<section class="cs-overview-module cs-account-pulse" aria-label="Hesap özeti">' +
      '<a class="cs-account-pulse__item" data-tab-link="notifications" href="/account/profile.html?tab=notifications">' +
        '<em>Bildirim</em><strong>' + (unread ? unread + ' yeni' : 'Güncel') + '</strong>' +
      '</a>' +
      '<a class="cs-account-pulse__item" data-tab-link="addresses" href="/account/profile.html?tab=addresses">' +
        '<em>Teslimat</em><strong>' + escapeHtml(addrLabel) + '</strong>' +
      '</a>' +
      '<a class="cs-account-pulse__item" data-tab-link="club" href="/account/profile.html?tab=club">' +
        '<em>Puan</em><strong>' + escapeHtml(numberFmt.format(l.available)) + ' P</strong>' +
      '</a>' +
    '</section>';
  }
  function initOverviewCarousel() {
    var track = document.querySelector('[data-recs-track]');
    if (!track || track.dataset.bound === '1') return;
    track.dataset.bound = '1';
    var rail = track.closest('.cs-recs-rail');
    if (rail) {
      rail.querySelectorAll('[data-recs-dir]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dir = Number(btn.getAttribute('data-recs-dir')) || 1;
          var amount = Math.max(220, Math.floor(track.clientWidth * 0.78));
          track.scrollBy({ left: dir * amount, behavior: 'smooth' });
        });
      });
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    window.setTimeout(function () {
      if (!track.isConnected || track.scrollWidth <= track.clientWidth + 8) return;
      track.scrollBy({ left: 56, behavior: 'smooth' });
      window.setTimeout(function () {
        if (track.isConnected) track.scrollBy({ left: -56, behavior: 'smooth' });
      }, 520);
    }, 700);
  }
  function getCoupons() {
    var welcomeEligible = state.summary?.coupon_eligibility?.welcome10_eligible;
    if (welcomeEligible === undefined) welcomeEligible = !hasSuccessfulOrder();
    var user = state.summary?.user || {};
    var hasBirthday = Boolean(user.birthday);
    var birthdayEligible = isBirthday10Eligible();
    var coupons = asArray(state.summary?.coupons).map(function (c) {
      c = safeObject(c);
      var code = String(c.code || c.coupon_code || '').toUpperCase();
      var status = String(c.status || c.usage_status || 'available').toLowerCase();
      if (code === 'WELCOME10' && !welcomeEligible && ['available', 'active'].includes(status)) status = 'hidden';
      if (code === 'BIRTHDAY10' && !birthdayEligible && ['available', 'active'].includes(status)) status = 'hidden';
      var desc = c.description || c.message || 'Ödeme ekranında uygun koşullarda manuel olarak kullanılabilir.';
      desc = String(desc).replace(/Ödeme Ekranı[''`]?ta/gi, 'Ödeme ekranında').replace(/Ödeme Ekranı/gi, 'Ödeme Ekranı').replace(/ödeme ekranı/gi, 'ödeme ekranı');
      return Object.assign({
        code: code,
        status: status,
        title: c.title || (code ? code + ' kuponu' : 'COSMOSKIN avantajı'),
        description: desc,
        expires_at: c.expires_at || c.ends_at || '',
        scope_label: c.scope_label || (Number(c.min_subtotal ?? c.min_cart_total ?? 0) > 0 ? formatMoney(c.min_subtotal ?? c.min_cart_total ?? 0) + ' ve üzeri alışverişlerde' : 'Uygun ürünlerde geçerli'),
        min_subtotal: Number(c.min_subtotal ?? c.min_cart_total ?? 0),
        max_discount_amount: Number(c.max_discount_amount || c.max_discount || 0) || null,
        copyable: c.copyable !== false && ['available', 'active'].includes(status)
      }, c, { code: code, status: status, description: desc });
    }).filter(function (c) { return c.code && c.status !== 'hidden' && !deprecatedCoupons.has(c.code); });
    if (welcomeEligible && !coupons.some(function (c) { return String(c.code || '').toUpperCase() === 'WELCOME10'; })) {
      coupons.unshift({
        id: 'virtual-welcome10',
        code: 'WELCOME10',
        status: 'available',
        title: 'Hoş geldin indirimi',
        description: 'Yeni hesaplara özel. Uygun ilk siparişte ödeme ekranında manuel olarak kullanılabilir; kullanım koşulları sipariş sırasında doğrulanır.',
        scope_label: 'Uygun ilk siparişte manuel kullanım',
        copyable: true,
        source: 'account-default'
      });
    }
    if (birthdayEligible && !coupons.some(function (c) { return String(c.code || '').toUpperCase() === 'BIRTHDAY10'; })) {
      coupons.unshift({
        id: 'virtual-birthday10',
        code: 'BIRTHDAY10',
        status: 'available',
        title: 'Doğum günü avantajı',
        description: 'Doğum gününüze özel. Uygun siparişlerde ödeme ekranında manuel olarak kullanılabilir; kullanım koşulları sipariş sırasında doğrulanır.',
        scope_label: 'Doğum gününüze özel manuel kullanım',
        copyable: true,
        source: 'account-default'
      });
    }
    return coupons;
  }
  function couponExpired(c) {
    var exp = c.expires_at || c.valid_until || c.valid_to;
    return exp ? new Date(exp).getTime() <= Date.now() : false;
  }
  function couponExpiryLabel(c) {
    var exp = c.expires_at || c.valid_until || c.valid_to;
    if (!exp) return '';
    var ms = new Date(exp).getTime() - Date.now();
    if (ms <= 0) return 'Süresi doldu';
    var days = Math.ceil(ms / 86400000);
    if (days <= 1) return 'Bugün son gün';
    if (days <= 14) return days + ' gün kaldı';
    return 'Son: ' + formatDate(exp);
  }
  function couponUsed(c) { return ['used','redeemed','consumed'].includes(String(c.status || '').toLowerCase()); }
  function activeCoupons() { return getCoupons().filter(function (c) { var st = String(c.status || '').toLowerCase(); return ['available','active'].includes(st) && c.copyable !== false && !couponExpired(c) && !couponUsed(c); }); }
  function usedCoupons() { return getCoupons().filter(couponUsed); }
  function expiredCoupons() { return getCoupons().filter(function (c) { return couponExpired(c) && !couponUsed(c); }); }

  function ensureAccountDom() {
    $('.cs-account-top')?.setAttribute('hidden', '');
    var body = document.body;
    body.classList.add('account-premium-page');
    var sidebar = $('.cs-account-sidebar');
    var nav = $('#accountNav');
    if (sidebar && !$('#accountHub')) {
      var hub = document.createElement('nav');
      hub.className = 'cs-account-hub';
      hub.id = 'accountHub';
      hub.setAttribute('aria-label', 'Hesap hızlı erişim');
      if (nav) sidebar.insertBefore(hub, nav);
      else sidebar.appendChild(hub);
    }
    var hubEl = $('#accountHub');
    if (hubEl) {
      hubEl.className = 'cs-account-hub cs-account-hub--v5';
      hubEl.innerHTML =
        '<header class="cs-account-hub__head">' +
          '<p class="cs-account-hub__kicker">Menü</p>' +
          '<p class="cs-account-hub__sub">Sipariş, favori ve avantajların</p>' +
        '</header>' +
        '<div class="cs-account-hub__list" role="list">' + [
          hubItem('orders', 'bag', 'Siparişlerim', 'Takip & kargo', 'ordersBadgeHub'),
          hubItem('favorites', 'heart', 'Favoriler', 'Kaydettiklerin', 'favoritesBadgeHub'),
          hubItem('routines', 'sparkle', 'Rutinlerim', 'Bakım planın', 'routinesBadgeHub'),
          hubItem('club', 'crown', 'Club', 'Seviye & puan', 'clubBadgeHub'),
          hubItem('coupons', 'ticket', 'Kuponlar', 'Aktif fırsatlar', 'couponsBadgeHub'),
          hubItem('addresses', 'pin', 'Adresler', 'Teslimat', 'addressesBadgeHub'),
          hubItem('skin-profile', 'drop', 'Cilt Profili', 'Tercihlerin'),
          hubItem('support', 'support', 'Destek', 'Yardım talebi')
        ].join('') + '</div>';
    }
    if (nav) {
      nav.innerHTML = [
        '<div class="cs-nav-label">ALIŞVERİŞ</div>',
        navItem('overview', 'home', 'Genel Bakış'),
        navItem('orders', 'bag', 'Siparişlerim', 'ordersBadge'),
        navItem('returns', 'return', 'İade Taleplerim', 'returnsBadge'),
        navItem('favorites', 'heart', 'Favorilerim', 'favoritesBadge'),
        navItem('invoices', 'invoice', 'Faturalarım'),
        '<div class="cs-nav-label">BAKIM & AVANTAJLAR</div>',
        navItem('routines', 'sparkle', 'Rutinlerim', 'routinesBadge'),
        navItem('skin-profile', 'drop', 'Cilt Profilim'),
        navItem('club', 'crown', 'COSMOSKIN Club'),
        navItem('coupons', 'ticket', 'Kuponlarım', 'couponsBadge'),
        '<div class="cs-nav-label">HESAP</div>',
        navItem('profile', 'user', 'Hesap Bilgilerim'),
        navItem('addresses', 'pin', 'Adreslerim', 'addressesBadge'),
        navItem('payments', 'invoice', 'Ödeme Tercihlerim'),
        navItem('notifications', 'bell', 'Bildirim Tercihlerim', 'notificationsBadge'),
        navItem('security', 'shield', 'Güvenlik'),
        navItem('support', 'support', 'Destek Taleplerim')
      ].join('');
    }
    var content = $('.cs-account-content');
    if (content) {
      content.innerHTML = [
        panel('overview','overviewPanel'), panel('orders','ordersPanel'), panel('returns','returnsPanel'), panel('favorites','favoritesPanel'), panel('invoices','invoicesPanel'),
        panel('routines','routinesPanel'), panel('skin-profile','skinPanel'), panel('club','clubPanel'), panel('coupons','couponsPanel'), panel('profile','profilePanel'),
        panel('addresses','addressesPanel'), panel('payments','paymentsPanel'), panel('notifications','notificationsPanel'), panel('security','securityPanel'), panel('support','supportPanel')
      ].join('');
    }
  }
  function navItem(tab, icon, label, badgeId) {
    return '<a data-tab="' + escapeHtml(tab) + '" href="/account/profile.html?tab=' + escapeHtml(tab) + '"><span class="cs-nav-icon" data-icon="' + escapeHtml(icon) + '">' + iconSvg(icon) + '</span><span class="cs-nav-text">' + escapeHtml(label) + '</span>' + (badgeId ? ' <em id="' + escapeHtml(badgeId) + '">0</em>' : '') + '</a>';
  }
  function hubItem(tab, icon, label, hint, badgeId) {
    return '<a class="cs-account-hub__item" role="listitem" data-tab="' + escapeHtml(tab) + '" href="/account/profile.html?tab=' + escapeHtml(tab) + '">' +
      '<span class="cs-account-hub__icon" data-icon="' + escapeHtml(icon) + '">' + hubIconSvg(icon) + '</span>' +
      '<span class="cs-account-hub__copy">' +
        '<span class="cs-account-hub__label">' + escapeHtml(label) + '</span>' +
        (hint ? '<span class="cs-account-hub__hint">' + escapeHtml(hint) + '</span>' : '') +
      '</span>' +
      (badgeId ? '<em class="cs-account-hub__badge" id="' + escapeHtml(badgeId) + '" hidden>0</em>' : '') +
      '<span class="cs-account-hub__chev" aria-hidden="true"></span></a>';
  }
  function panel(tab, id) { return '<section class="cs-panel" data-panel="' + escapeHtml(tab) + '" id="' + escapeHtml(id) + '"></section>'; }
  var PANEL_BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6 9 12l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function panelChrome(title, lede, actionsHtml) {
    return '<div class="cs-tab-title cs-tab-title--premium">' +
      '<button type="button" class="cs-panel-back" data-tab-link="overview" aria-label="Hesabıma dön">' + PANEL_BACK_SVG + '<span>Hesabım</span></button>' +
      '<div class="cs-tab-title__copy"><span class="cs-overline">HESABIM</span><h1>' + title + '</h1>' +
      (lede ? '<p>' + lede + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="cs-panel-actions">' + actionsHtml + '</div>' : '') +
      '</div>';
  }
  function setHubBadge(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    var n = Number(value) || 0;
    el.textContent = String(n);
    if (n > 0) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  function renderAll() {
    renderShell();
    renderOverview(); renderOrders(); renderReturns(); renderFavorites(); renderInvoices();
    renderRoutines(); renderSkinProfile(); renderClub(); renderCoupons(); renderProfile();
    renderAddresses(); renderPayments(); renderNotifications(); renderSecurity(); renderSupport();
  }
  var PROFILE_CROWN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17.5h16M5.2 8.4l3.4 3.1L12 6l3.4 5.5 3.4-3.1-1.1 9.1H6.3L5.2 8.4Z"/></svg>';
  var PROFILE_SPARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l1.9 5.3 5.3 1.9-5.3 1.9L12 17.6l-1.9-5.3L4.8 10.4l5.3-1.9L12 3.2Z"/></svg>';
  function tierShortName(key) { return (LOYALTY_TIERS[key] || LOYALTY_TIERS.essential).name; }
  function renderProfileIdentity(user, l) {
    var card = $('.cs-profile-card'); if (!card) return;
    var name = displayName(user);
    var email = user.email || 'E-posta bilgisi yok';
    var mono = initials(user);
    var since = user.created_at ? formatDate(user.created_at) : '';
    var tier = tierShortName(l.key);
    var points = Math.max(0, Math.round(finiteNumber(l.available, 0)));
    var greet = firstName(user) ? 'Merhaba, ' + firstName(user) : 'Merhaba';
    var nextLine = l.next
      ? escapeHtml(l.next.replace(/\s*Üye\s*$/i, '')) + ' · kalan ' + escapeHtml(formatMoney(l.remaining))
      : 'En üst seviye';
    var fillPct = Math.max(0, Math.min(100, Number(l.progress) || 0));
    // Tiny stub only when there is real progress — never fake fill for ₺0 spend.
    var fillWidth = fillPct > 0 ? Math.max(6, fillPct) : 0;
    card.classList.add('cs-profile-card--v2', 'cs-profile-card--v5');
    card.setAttribute('data-tier', l.key || 'essential');
    var tierKey = (l.key === 'signature' || l.key === 'elite') ? l.key : 'essential';
    card.innerHTML =
      '<span class="cs-profile-card__aura" aria-hidden="true"></span>' +
      '<div class="cs-profile-card__head">' +
        '<div class="cs-profile-avatar cs-profile-avatar--' + tierKey + '" id="accountAvatar" data-tier="' + tierKey + '" aria-label="' + escapeHtml(tier) + ' üyesi">' +
          '<span class="cs-profile-avatar__text">' + escapeHtml(mono) + '</span>' +
          '<span class="cs-profile-avatar__badge" aria-hidden="true">' + PROFILE_CROWN_SVG + '</span>' +
        '</div>' +
        '<div class="cs-profile-info">' +
          '<div class="cs-profile-info__top">' +
            '<span class="cs-profile-kicker">HESABIM</span>' +
            '<span class="cs-profile-tier">' + PROFILE_SPARK_SVG + '<em>' + escapeHtml(tier) + '</em></span>' +
          '</div>' +
          '<p class="cs-profile-hello">' + escapeHtml(greet) + '</p>' +
          '<strong id="accountName" class="cs-profile-display-name">' + escapeHtml(name) + '</strong>' +
          '<span id="accountEmail">' + escapeHtml(email) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="cs-profile-card__meta">' +
        '<span class="cs-profile-meta-item"><b>' + points.toLocaleString('tr-TR') + '</b><small>Toplam puan</small></span>' +
        '<span class="cs-profile-meta-divider" aria-hidden="true"></span>' +
        '<span class="cs-profile-meta-item"><b id="accountMemberSince">' + escapeHtml(since || '—') + '</b><small>Üye tarihi</small></span>' +
      '</div>' +
      '<div class="cs-profile-card__progress cs-profile-meter" data-tab-link="club" role="link" tabindex="0" aria-label="Club seviye detayı" style="--cs-meter-fill:' + fillWidth + '%">' +
        '<div class="cs-profile-meter__head">' +
          '<span class="cs-profile-meter__kicker">Club ilerleme</span>' +
          '<span class="cs-profile-meter__pct">' + fillPct + '%</span>' +
        '</div>' +
        '<div class="cs-profile-card__progress-track cs-profile-meter__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + fillPct + '" aria-label="Seviye ilerlemesi ' + fillPct + ' yüzde">' +
          '<span class="cs-profile-meter__rail" aria-hidden="true"></span>' +
          '<span class="cs-profile-card__progress-fill cs-profile-meter__fill">' +
            '<i class="cs-profile-meter__sheen" aria-hidden="true"></i>' +
            '<i class="cs-profile-meter__glow" aria-hidden="true"></i>' +
            '<i class="cs-profile-meter__tip" aria-hidden="true"></i>' +
          '</span>' +
        '</div>' +
        '<p class="cs-profile-card__progress-meta cs-profile-meter__meta"><span>' + escapeHtml(tier) + '</span><span>' + nextLine + '</span></p>' +
        '<p class="cs-profile-card__progress-spend cs-profile-meter__spend"><span>' + escapeHtml(formatMoney(l.spend)) + '</span><span>' + escapeHtml(formatMoney(l.threshold)) + '</span></p>' +
      '</div>';
    animateProfileMeter(card);
  }
  function animateProfileMeter(card) {
    var meter = card && card.querySelector('.cs-profile-meter');
    if (!meter) return;
    meter.classList.remove('is-animated');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      meter.classList.add('is-animated');
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        meter.classList.add('is-animated');
      });
    });
  }
  function renderShell() {
    var summary = state.summary || {}; var user = summary.user || {};
    var l = loyalty();
    renderProfileIdentity(user, l);
    setText('#ordersBadge', String(summary.orders.length));
    setText('#returnsBadge', String(summary.returns.length));
    setText('#favoritesBadge', String(uniqueFavoriteList().length));
    setText('#addressesBadge', String(summary.addresses.length || summary.stats.addresses_count || 0));
    setText('#routinesBadge', String(summary.routine_results.length));
    setText('#couponsBadge', String(activeCoupons().length));
    setText('#notificationsBadge', String(summary.stats.unread_notifications || 0));
    setHubBadge('ordersBadgeHub', summary.orders.length);
    setHubBadge('favoritesBadgeHub', uniqueFavoriteList().length);
    setHubBadge('routinesBadgeHub', summary.routine_results.length);
    setHubBadge('couponsBadgeHub', activeCoupons().length);
    setHubBadge('addressesBadgeHub', summary.addresses.length || summary.stats.addresses_count || 0);
    renderFooterJournal(user);
    document.title = 'Hesabım | ' + (firstName(user) || 'COSMOSKIN');
    if (l.label) document.documentElement.style.setProperty('--cs-account-tier-progress', l.progress + '%');
  }
  function setText(selector, value) { var el = $(selector); if (el) el.textContent = value; }
  function todayIsoDate() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function premiumToggleHtml(name, isOn, label, description, opts) {
    opts = opts || {};
    var id = 'pref-' + String(name).replace(/[^a-z0-9_-]/gi, '-');
    var isLocked = Boolean(opts.locked || opts.disabled);
    var disabled = isLocked ? ' disabled aria-disabled="true"' : '';
    var locked = isLocked ? ' cs-premium-toggle--locked' : '';
    var stateClass = isOn ? ' is-on' : '';
    return '<label class="cs-premium-toggle' + stateClass + locked + '" for="' + escapeHtml(id) + '">' +
      '<input class="cs-premium-toggle__input" type="checkbox" name="' + escapeHtml(name) + '" id="' + escapeHtml(id) + '" ' + (isOn ? 'checked ' : '') + disabled + '>' +
      '<span class="cs-premium-toggle__track" aria-hidden="true"><span class="cs-premium-toggle__thumb"></span></span>' +
      '<span class="cs-premium-toggle__copy"><span class="cs-premium-toggle__label">' + escapeHtml(label) + '</span>' +
      (description ? '<small class="cs-premium-toggle__desc">' + escapeHtml(description) + '</small>' : '') + '</span></label>';
  }
  function syncPremiumToggle(input) {
    if (!input || !input.classList || !input.classList.contains('cs-premium-toggle__input')) return;
    var label = input.closest('.cs-premium-toggle');
    if (!label) return;
    label.classList.toggle('is-on', Boolean(input.checked));
    input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
  }
  function syncAllPremiumToggles(root) {
    $$('.cs-premium-toggle__input', root || document).forEach(syncPremiumToggle);
  }
  function profileCompletionPercent(user) {
    user = user || {};
    var fields = [user.first_name, user.last_name, user.phone, user.birthday, user.email];
    var filled = fields.filter(function (v) { return String(v || '').trim(); }).length;
    return Math.round((filled / fields.length) * 100);
  }
  function renderFooterJournal(user) {
    var newsletter = $('.footer-newsletter'); if (!newsletter) return;
    var prefs = Object.assign({}, safeObject(user.communication), safeObject(state.summary?.notification_preferences));
    var subscribed = Boolean(prefs.newsletter ?? prefs.newsletter_opt_in ?? prefs.newsletterOptIn);
    newsletter.classList.add('cs-account-journal-footer');
    newsletter.innerHTML = '<div class="cs-account-journal-copy"><p class="footer-newsletter__kicker">COSMOSKIN JOURNAL</p><h2 class="footer-newsletter__title">Yeni seçkiler ve bakım notları, ilk senin posta kutunda.</h2><p class="footer-newsletter__lede">Kampanyalar, ürün önerileri ve bakım notları için iletişim tercihlerin hesabınla kaydedilir.</p><p class="cs-account-journal-status">' + (subscribed ? 'Journal aboneliğin aktif.' : 'Journal aboneliğin aktif değil.') + '</p></div>' +
      '<div class="cs-account-journal-actions"><span>E-posta: ' + escapeHtml(user.email || 'Bilgi mevcut değil') + '</span><a class="footer-newsletter__btn" data-tab-link="notifications" href="/account/profile.html?tab=notifications"><span>Tercihleri Yönet</span></a>' + (subscribed ? '<button class="footer-newsletter__btn cs-journal-unsubscribe" data-newsletter-unsubscribe type="button"><span>Abonelikten Çık</span></button>' : '') + '</div><img class="cs-account-journal-logo" src="/assets/logo-mark.png" alt="" loading="lazy">';
  }

  function renderOverview() {
    var el = $('#overviewPanel'); if (!el) return;
    var user = state.summary.user || {}; var sp = skinProfile(); var latest = state.summary.orders[0];
    var l = loyalty(); var comm = Object.assign({}, safeObject(user.communication), safeObject(state.summary.notification_preferences));
    var completion = profileCompletionPercent(user);
    var greeting = firstName(user) ? 'Merhaba, ' + escapeHtml(firstName(user)) : 'Merhaba';
    var prefSummary = [
      comm.campaign_emails || comm.marketing_email_opt_in ? 'Kampanya' : null,
      comm.stock_notifications || comm.stock_alert_opt_in ? 'Stok' : null,
      comm.routine_reminders || comm.routine_reminder_opt_in ? 'Rutin' : null,
      comm.newsletter || comm.newsletter_opt_in ? 'Journal' : null
    ].filter(Boolean);
    el.innerHTML = '<section class="cs-overview-page cs-overview-page--v4">' +
      '<header class="cs-tab-title cs-tab-title--overview cs-tab-title--home cs-tab-title--desktop-only"><div class="cs-tab-title__copy"><span class="cs-overline">ÜYELİK ALANI</span><h1>' + greeting + '</h1><p>Sipariş, puan, favori ve bakım tercihlerin tek, sakin bir panelde.</p></div></header>' +
      '<div class="cs-stat-grid cs-stat-grid--pulse">' + overviewStatCards() + '</div>' +
      '<div class="cs-overview-hero-grid cs-overview-hero-grid--v3">' + clubMiniCard(l) + skinMiniCard(sp) + '</div>' +
      '<div class="cs-overview-modules cs-overview-modules--v3">' +
      (latest
        ? '<div class="cs-overview-module cs-overview-module--order">' + orderSpotlight(latest) + '</div>'
        : '<article class="cs-card cs-card-large cs-overview-module cs-overview-module--order"><div class="cs-card-head"><span>SON SİPARİŞ</span><a data-tab-link="orders" href="/account/profile.html?tab=orders">Tümünü Gör</a></div>' + emptyState('Henüz siparişiniz yok.', 'Sipariş verdiğinizde kargo ve ödeme durumunu buradan takip edebilirsiniz.', 'Alışverişe Başla', '/allproducts.html') + '</article>') +
      recsCarouselModule() +
      couponStripModule() +
      accountPulseModule(user) +
      '<article class="cs-card cs-overview-module cs-overview-module--desktop-only cs-profile-completion-card"><div class="cs-card-head"><span>PROFİL TAMAMLAMA</span><a data-tab-link="profile" href="/account/profile.html?tab=profile">Düzenle</a></div><div class="cs-profile-completion"><div class="cs-profile-completion__ring" style="--cs-completion:' + completion + '%"><strong>' + completion + '%</strong><span>tamamlandı</span></div><div class="cs-profile-completion__copy"><p>' + (user.birthday ? 'Doğum tarihiniz kayıtlı.' : 'Doğum tarihinizi ekleyerek doğum günü avantajlarını açabilirsiniz.') + '</p><small>' + escapeHtml([user.first_name, user.last_name].filter(Boolean).join(' ') || 'Ad soyad bekleniyor') + (user.phone ? ' · ' + escapeHtml(user.phone) : '') + '</small></div></div></article>' +
      '<article class="cs-card cs-overview-module cs-overview-module--desktop-only cs-preferences-preview-card"><div class="cs-card-head"><span>İLETİŞİM TERCİHLERİ</span><a data-tab-link="notifications" href="/account/profile.html?tab=notifications">Yönet</a></div><div class="cs-preferences-preview"><p>' + (prefSummary.length ? 'Aktif: ' + escapeHtml(prefSummary.join(' · ')) : 'Henüz pazarlama veya Journal tercihi seçilmedi.') + '</p><small>Sipariş ve kargo bildirimleri varsayılan olarak açıktır.</small><a class="cs-mini-btn dark" data-tab-link="notifications" href="/account/profile.html?tab=notifications">Tercihleri Düzenle</a></div></article>' +
      '<article class="cs-card cs-overview-module cs-overview-module--desktop-only"><div class="cs-card-head"><span>HIZLI ERİŞİM</span></div><div class="cs-quick-grid cs-quick-grid--compact">' + quickCards().join('') + '</div></article>' +
      '<article class="cs-card cs-overview-module cs-overview-module--desktop-only"><div class="cs-card-head"><span>HESAP GÜVENLİĞİ</span><a data-tab-link="security" href="/account/profile.html?tab=security">Ayarlar</a></div><ul class="cs-security-list cs-security-list--compact">' + securityChecklist().slice(0, 3).map(securityRow).join('') + '</ul></article>' +
      '<nav class="cs-overview-more cs-overview-more--v3" aria-label="Diğer hesap bölümleri">' +
        '<header class="cs-overview-more__head"><span>Hesap yönetimi</span></header>' +
        '<div class="cs-overview-more__list">' + overviewMoreLinks() + '</div>' +
      '</nav>' +
      '</div></section>';
    initOverviewCarousel();
  }
  function overviewMoreLinks() {
    var unread = asArray(state.summary?.notifications).filter(function (n) { return !n.is_read; }).length;
    var items = [
      { tab: 'returns', icon: 'return', label: 'İade Taleplerim', hint: 'Talep & durum' },
      { tab: 'invoices', icon: 'invoice', label: 'Faturalarım', hint: 'PDF arşivi' },
      { tab: 'profile', icon: 'user', label: 'Hesap Bilgilerim', hint: 'Profil & iletişim' },
      { tab: 'notifications', icon: 'bell', label: 'Bildirimler', hint: unread ? unread + ' yeni' : 'Tercihler', badge: unread },
      { tab: 'payments', icon: 'payments', label: 'Ödeme', hint: 'Güvenli yöntemler' },
      { tab: 'security', icon: 'shield', label: 'Güvenlik', hint: 'Şifre & oturum' }
    ];
    return items.map(function (item, i) {
      var badge = item.badge
        ? '<em class="cs-overview-more__badge">' + escapeHtml(String(item.badge)) + '</em>'
        : '';
      return '<a class="cs-overview-more__link" style="--cs-more-i:' + i + '" data-tab-link="' + escapeHtml(item.tab) + '" href="/account/profile.html?tab=' + escapeHtml(item.tab) + '">' +
        '<span class="cs-overview-more__icon" data-icon="' + escapeHtml(item.icon) + '" aria-hidden="true">' + moreIconSvg(item.icon) + '</span>' +
        '<span class="cs-overview-more__copy">' +
          '<span class="cs-overview-more__label">' + escapeHtml(item.label) + '</span>' +
          '<span class="cs-overview-more__hint">' + escapeHtml(item.hint) + '</span>' +
        '</span>' +
        '<span class="cs-overview-more__trail">' + badge + moreChevronSvg() + '</span>' +
      '</a>';
    }).join('');
  }
  function overviewStatCards() {
    var s = state.summary.stats; var l = loyalty();
    var cards = [
      { icon:'bag', label:'Sipariş', value:s.order_count || state.summary.orders.length || 0, tab:'orders' },
      { icon:'sparkle', label:'Puan', value:numberFmt.format(l.available), tab:'club' },
      { icon:'heart', label:'Favori', value:uniqueFavoriteList().length, tab:'favorites' },
      { icon:'ticket', label:'Kupon', value:activeCoupons().length, tab:'coupons' }
    ];
    return cards.map(function (c) {
      return '<a class="cs-stat cs-stat--link" data-tab-link="' + escapeHtml(c.tab) + '" href="/account/profile.html?tab=' + escapeHtml(c.tab) + '"><span class="cs-stat-icon">' + iconSvg(c.icon) + '</span><div><small>' + escapeHtml(c.label) + '</small><strong>' + escapeHtml(c.value) + '</strong></div></a>';
    }).join('');
  }
  function welcomeCard(user, stats, l) {
    var sp = skinProfile();
    var greeting = firstName(user) ? 'Merhaba ' + escapeHtml(firstName(user)) + ',' : 'Merhaba,';
    var prefText = hasSkinProfile(sp) ? profilePreferenceCount(sp) + ' kayıtlı bakım tercihi' : 'Cilt profili bekliyor';
    return '<article class="cs-account-welcome-card"><span class="cs-overline">HESABIM</span><h1>' + greeting + '<br>alışverişini ve bakım rutinini tek yerden yönet.</h1><p>Siparişlerin, favorilerin, adreslerin, kuponların ve cilt bakım rutinin gerçek hesap verileriyle burada görünür.</p><div class="cs-hero-chips"><span>' + iconSvg('truck') + '<b>' + activeOrders().length + ' aktif sipariş</b></span><span>' + iconSvg('sparkle') + '<b>' + escapeHtml(prefText) + '</b></span><span>' + iconSvg('pin') + '<b>' + (state.summary.addresses.length || stats.addresses_count || 0) + ' kayıtlı adres</b></span><span>' + iconSvg('ticket') + '<b>' + activeCoupons().length + ' aktif kupon</b></span><span>' + iconSvg('crown') + '<b>' + escapeHtml(l.label.replace(' Üye','')) + '</b></span></div></article>';
  }
  function clubMiniCard(l) {
    var tierKey = (l.key === 'signature' || l.key === 'elite') ? l.key : 'essential';
    var tierName = escapeHtml((l.label || '').replace(/\s*Üye\s*$/i, '') || tierShortName(tierKey));
    var fillPct = Math.max(0, Math.min(100, Number(l.progress) || 0));
    var fillWidth = fillPct > 0 ? Math.max(6, fillPct) : 0;
    var points = Math.max(0, Math.round(finiteNumber(l.available, 0)));
    var nextLine = l.next
      ? escapeHtml(String(l.next).replace(/\s*Üye\s*$/i, '')) + ' · kalan ' + escapeHtml(formatMoney(l.remaining))
      : 'En üst seviyedesin';
    return '<article class="cs-club-mini cs-club-mini--' + tierKey + ' cs-loyalty-card cs-loyalty-card--mini cs-loyalty-card--' + tierKey + '" data-tier="' + tierKey + '" style="--cs-club-fill:' + fillWidth + '%">' +
      '<span class="cs-club-mini__sheen" aria-hidden="true"></span>' +
      '<header class="cs-club-mini__top">' +
        '<span class="cs-club-mini__brand">' + iconSvg('crown') + '<em>COSMOSKIN Club</em></span>' +
        '<span class="cs-club-mini__points"><b>' + points.toLocaleString('tr-TR') + '</b><small>puan</small></span>' +
      '</header>' +
      '<div class="cs-club-mini__title-row">' +
        '<h2>' + tierName + '</h2>' +
        '<p class="cs-club-mini__next">' + nextLine + '</p>' +
      '</div>' +
      '<div class="cs-club-mini__meter" aria-label="Seviye ilerlemesi">' +
        '<div class="cs-club-mini__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + fillPct + '">' +
          '<span class="cs-club-mini__fill"><i aria-hidden="true"></i></span>' +
        '</div>' +
        '<div class="cs-club-mini__spend">' +
          '<strong>' + escapeHtml(formatMoney(l.spend)) + '</strong>' +
          '<span>/ ' + escapeHtml(formatMoney(l.threshold)) + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="cs-club-mini__note">Kargo hariç ürün net tutarı · 100 P = 1 TL</p>' +
      '<div class="cs-club-mini__actions cs-loyalty-links">' +
        '<a class="cs-club-mini__btn" data-tab-link="club" href="/account/profile.html?tab=club">Avantajlar</a>' +
        '<a class="cs-club-mini__btn" data-tab-link="club" href="/account/profile.html?tab=club#points">Puan Geçmişi</a>' +
        '<a class="cs-club-mini__btn cs-club-mini__btn--solid" href="/allproducts.html">Alışveriş</a>' +
      '</div>' +
    '</article>';
  }
  function skinMiniCard(sp) {
    sp = sp || skinProfile();
    var DROP_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2c2.8 3.6 6.2 7.1 6.2 10.4a6.2 6.2 0 1 1-12.4 0C5.8 10.3 9.2 6.8 12 3.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    if (!hasSkinProfile(sp)) {
      return '<article class="cs-skin-profile-card cs-skin-profile-card--mini cs-skin-profile-card--v6 is-empty">' +
        '<span class="cs-skin-profile-card__aura" aria-hidden="true"></span>' +
        '<div class="cs-skin-profile-card__head"><span class="cs-overline">' + DROP_SVG + 'Cilt profilim</span></div>' +
        '<h2>Profilini oluştur</h2>' +
        '<p class="cs-skin-profile-card__lede">Cilt tipi, hassasiyet ve bakım hedeflerini kaydet; rutin önerilerin gerçek profil verilerine göre hazırlansın.</p>' +
        '<div class="cs-skin-profile-actions">' +
          '<a class="cs-skin-profile-card__btn cs-skin-profile-card__btn--primary" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Profili Başlat</a>' +
          '<a class="cs-skin-profile-card__btn" href="/account/routines/">Rutin Merkezi</a>' +
        '</div></article>';
    }
    var typeLabel = cleanSkinType(sp.skin_type);
    var sensLabel = cleanSensitivity(sp.sensitivity);
    var primaryLabel = cleanGoal(sp.routine_goal) !== 'Belirtilmedi' ? cleanGoal(sp.routine_goal) : '';
    var secondaryLabel = sp.secondary_goal ? cleanGoal(sp.secondary_goal) : '';
    if (secondaryLabel === 'Belirtilmedi' || secondaryLabel === primaryLabel) secondaryLabel = '';
    var styleLabel = String(sp.routine_preference || '').trim();
    var goals = profileGoalLabels(sp).filter(function (g) {
      return g && g !== primaryLabel && g !== secondaryLabel && g !== 'Belirtilmedi';
    }).slice(0, 2);
    var activeRoutine = asArray(state.summary?.routine_results || state.summary?.routines).find(function (r) {
      return r && (r.is_active || r.active);
    }) || asArray(state.summary?.routine_results || state.summary?.routines)[0];
    var routineTitle = activeRoutine ? (activeRoutine.routine_title || activeRoutine.title || '') : '';
    var specs = [];
    if (sensLabel && sensLabel !== 'Belirtilmedi') specs.push({ label: 'Hassasiyet', value: sensLabel });
    if (primaryLabel) specs.push({ label: 'Öncelik', value: primaryLabel });
    if (secondaryLabel) specs.push({ label: 'İkincil', value: secondaryLabel });
    if (styleLabel) specs.push({ label: 'Rutin', value: styleLabel });
    var lede = primaryLabel
      ? typeLabel + ' için ' + primaryLabel.toLocaleLowerCase('tr-TR') + ' odaklı bakım tercihlerin kayıtlı.'
      : 'Cilt profilin kayıtlı. Rutin ve ürün önerileri bu bilgilerle güncellenir.';
    return '<article class="cs-skin-profile-card cs-skin-profile-card--mini cs-skin-profile-card--v6">' +
      '<span class="cs-skin-profile-card__aura" aria-hidden="true"></span>' +
      '<div class="cs-skin-profile-card__head">' +
        '<span class="cs-overline">' + DROP_SVG + 'Cilt profilim</span>' +
        '<span class="cs-skin-profile-card__badge">Kayıtlı</span>' +
      '</div>' +
      '<h2>' + escapeHtml(typeLabel) + '</h2>' +
      '<p class="cs-skin-profile-card__lede">' + escapeHtml(lede) + '</p>' +
      (specs.length
        ? '<dl class="cs-skin-profile-card__specs">' + specs.map(function (s) {
            return '<div><dt>' + escapeHtml(s.label) + '</dt><dd>' + escapeHtml(s.value) + '</dd></div>';
          }).join('') + '</dl>'
        : '') +
      (goals.length
        ? '<div class="cs-skin-tags">' + goals.map(function (t) {
            return '<span>' + escapeHtml(t) + '</span>';
          }).join('') + '</div>'
        : '') +
      (routineTitle
        ? '<a class="cs-skin-profile-card__routine" data-tab-link="routines" href="/account/profile.html?tab=routines">' +
            '<em>Aktif rutin</em><strong>' + escapeHtml(routineTitle) + '</strong>' +
          '</a>'
        : '') +
      '<div class="cs-skin-profile-card__foot">' +
        (sp.updated_at ? '<p class="cs-skin-profile-stamp">Güncellendi ' + escapeHtml(formatDate(sp.updated_at)) + '</p>' : '<span></span>') +
        '<div class="cs-skin-profile-actions">' +
          '<a class="cs-skin-profile-card__btn cs-skin-profile-card__btn--primary" data-tab-link="routines" href="/account/profile.html?tab=routines">Rutinlerim</a>' +
          '<a class="cs-skin-profile-card__btn" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Düzenle</a>' +
        '</div>' +
      '</div></article>';
  }
  function statCards() {
    var s = state.summary.stats; var l = loyalty();
    var cards = [
      { icon:'bag', label:'Toplam Sipariş', value:s.order_count || state.summary.orders.length || 0, hint:'Tüm sipariş geçmişi' },
      { icon:'truck', label:'Aktif Sipariş', value:activeOrders().length, hint:'Devam eden süreç' },
      { icon:'sparkle', label:'Kullanılabilir Puan', value:numberFmt.format(l.available), hint:'100 P = 1 TL' },
      { icon:'heart', label:'Favoriler', value:uniqueFavoriteList().length, hint:'Kaydedilen ürünler' },
      { icon:'pin', label:'Kayıtlı Adres', value:s.addresses_count || state.summary.addresses.length || 0, hint:'Teslimat/fatura' },
      { icon:'ticket', label:'Aktif Kupon', value:activeCoupons().length, hint:'Uygun avantaj' }
    ];
    return cards.map(function (c) { return '<article class="cs-stat"><span class="cs-stat-icon">' + iconSvg(c.icon) + '</span><div><small>' + escapeHtml(c.label) + '</small><strong>' + escapeHtml(c.value) + '</strong><em>' + escapeHtml(c.hint) + '</em></div></article>'; }).join('');
  }
  function recommendationBlock() {
    var products = recommendedProducts(3);
    if (!products.length) return emptyState('Profil tamamlanınca öneriler görünür.', 'Cilt profilini oluşturduktan sonra gerçek ürün verileriyle öneriler hazırlanır.', 'Cilt Profilim', '/account/profile.html?tab=skin-profile', 'skin-profile');
    return '<div class="cs-product-mini-row">' + products.map(productCard).join('') + '</div>';
  }
  function quickCards() {
    return [
      { icon:'bag', title:'Siparişlerim', text:'Sipariş ve kargo durumunu takip et.', tab:'orders' },
      { icon:'sparkle', title:'Rutinlerim', text:'Kayıtlı rutin sonuçlarını görüntüle.', tab:'routines' },
      { icon:'pin', title:'Adreslerim', text:'Teslimat ve fatura adreslerini yönet.', tab:'addresses' },
      { icon:'ticket', title:'Kuponlarım', text:'Kullanılabilir avantajları gör.', tab:'coupons' },
      { icon:'user', title:'Hesap Bilgilerim', text:'Ad, soyad ve telefon bilgilerini düzenle.', tab:'profile' },
      { icon:'support', title:'Destek Taleplerim', text:'Destek talebi oluştur ve takip et.', tab:'support' }
    ].map(function (item) { return '<a class="cs-quick-card" data-tab-link="' + escapeHtml(item.tab) + '" href="/account/profile.html?tab=' + escapeHtml(item.tab) + '"><span class="cs-help-icon">' + iconSvg(item.icon) + '</span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.text) + '</small></a>'; });
  }
  function emptyState(title, body, cta, href, tab) {
    return '<div class="cs-empty"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(body || '') + '</p>' + (cta ? '<a class="cs-pill-btn" ' + (tab ? 'data-tab-link="' + escapeHtml(tab) + '"' : '') + ' href="' + escapeHtml(href || '/allproducts.html') + '">' + escapeHtml(cta) + '</a>' : '') + '</div>';
  }
  function heartButtonHtml(slug, opts) {
    opts = opts || {};
    var svg = '<svg class="cs-heart-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>';
    if (opts.favoriteId || opts.isFavorite) {
      return '<button class="cs-heart-btn is-active" type="button" aria-label="Favorilerden kaldır" aria-pressed="true" data-remove-favorite="' + escapeHtml(opts.favoriteId || '') + '" data-remove-favorite-slug="' + escapeHtml(opts.favoriteSlug || slug) + '">' + svg + '</button>';
    }
    return '<button class="cs-heart-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-add-favorite="' + escapeHtml(slug) + '">' + svg + '</button>';
  }
  function productCard(product, opts) {
    product = normalizeProduct(product) || {}; opts = opts || {};
    var slug = product.product_slug || product.id || '';
    var stock = liveStockState(product, opts);
    var isFavorite = Boolean(opts.favoriteId || opts.isFavorite);
    var stockLine = '';
    if (!opts.hideStock) {
      if (opts.useLiveStock && isFavorite && stock.label) {
        stockLine = '<em class="cs-stock-dot ' + escapeHtml(stock.className) + '">' + escapeHtml(stock.label) + '</em>';
      } else if (!isFavorite && stock.label !== 'Stok kontrolü') {
        stockLine = '<em class="cs-stock-dot ' + escapeHtml(stock.className) + '">' + escapeHtml(stock.label) + '</em>';
      }
    }
    return '<article class="cs-product-mini' + (isFavorite ? ' cs-product-mini--favorite' : '') + '">' +
      '<a class="cs-product-mini__media" href="' + escapeHtml(product.url || '/allproducts.html') + '"><img src="' + escapeHtml(product.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(product.product_name || 'Ürün') + '" loading="lazy"></a>' +
      '<div class="cs-product-mini__body"><small>' + escapeHtml(product.brand || 'COSMOSKIN') + '</small><a href="' + escapeHtml(product.url || '/allproducts.html') + '"><strong>' + escapeHtml(product.product_name || 'Ürün') + '</strong></a><p>' + escapeHtml(product.category || 'K-Beauty seçkisi') + '</p>' +
      '<div class="cs-product-mini__bottom"><b>' + escapeHtml(formatMoney(product.price || 0)) + '</b><button class="cs-mini-btn dark" type="button" data-add-product-cart="' + escapeHtml(slug) + '" ' + (!stock.sellable ? 'disabled aria-disabled="true"' : '') + '>' + escapeHtml(stock.buttonLabel || (stock.sellable ? 'Sepete ekle' : 'Stokta yok')) + '</button>' + heartButtonHtml(slug, opts) + '</div>' +
      stockLine + '</div></article>';
  }

  function favoriteCard(product, opts) {
    product = normalizeProduct(product) || {}; opts = opts || {};
    var slug = product.product_slug || product.id || '';
    var stock = liveStockState(product, opts);
    if (opts.assumeInStock && stock.className === 'is-unknown') {
      stock = { sellable: true, label: 'Stokta', className: 'is-in', buttonLabel: 'Sepete ekle' };
    }
    var btnLabel = stock.sellable ? 'Sepete ekle' : (stock.className === 'is-unknown' ? 'Bekliyor' : 'Stokta yok');
    var idx = Number(opts.index) || 0;
    return '<article class="cs-fav-card" data-fav-slug="' + escapeHtml(slug) + '" style="--cs-fav-i:' + idx + '">' +
      '<div class="cs-fav-card__media">' +
        '<a class="cs-fav-card__image" href="' + escapeHtml(product.url || '/allproducts.html') + '">' +
          '<img src="' + escapeHtml(product.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(product.product_name || 'Ürün') + '" loading="lazy">' +
        '</a>' +
        heartButtonHtml(slug, opts) +
      '</div>' +
      '<div class="cs-fav-card__body">' +
        '<span class="cs-fav-card__brand">' + escapeHtml(product.brand || 'COSMOSKIN') + '</span>' +
        '<a class="cs-fav-card__title" href="' + escapeHtml(product.url || '/allproducts.html') + '">' + escapeHtml(product.product_name || 'Ürün') + '</a>' +
        '<div class="cs-fav-card__row">' +
          '<b class="cs-fav-card__price">' + escapeHtml(formatMoney(product.price || 0)) + '</b>' +
          (stock.className === 'is-out' ? '<span class="cs-fav-card__badge is-out">Stokta yok</span>' : '') +
          (stock.className === 'is-low' ? '<span class="cs-fav-card__badge is-low">Son ürünler</span>' : '') +
        '</div>' +
        '<button class="cs-fav-card__cta' + (stock.sellable ? '' : ' is-disabled') + '" type="button" data-add-product-cart="' + escapeHtml(slug) + '" ' + (!stock.sellable ? 'disabled aria-disabled="true"' : '') + '>' + escapeHtml(btnLabel) + '</button>' +
      '</div></article>';
  }
  function couponMiniCard() {
    var active = activeCoupons(); var used = usedCoupons();
    if (active.length) { var c = active[0]; return '<div class="cs-coupon-mini"><strong>' + escapeHtml(c.code) + '</strong><p>' + escapeHtml(c.description || 'Sepette veya ödeme adımında manuel uygulanabilir.') + '</p><small>' + escapeHtml(c.scope_label || '') + (c.max_discount_amount ? ' · Maks. ' + escapeHtml(formatMoney(c.max_discount_amount)) : '') + '</small><div class="cs-card-actions"><button class="cs-mini-btn dark" type="button" data-copy-coupon="' + escapeHtml(c.code) + '">Kodu Kopyala</button><a class="cs-mini-btn" data-tab-link="coupons" href="/account/profile.html?tab=coupons">Tüm Kuponlar</a></div></div>'; }
    return emptyState('Kullanılabilir kupon bulunmuyor.', used.length ? 'Kullanılmış kuponlarınızı Kuponlarım sekmesinde görebilirsiniz.' : 'Uygun kampanya olduğunda burada görünür.', 'Kuponlarımı Gör', '/account/profile.html?tab=coupons', 'coupons');
  }
  function deliveryMiniCard() {
    var addresses = state.summary.addresses; var orders = state.summary.orders; var last = orders[0];
    return '<div class="cs-delivery-shortcuts"><a data-tab-link="addresses" href="/account/profile.html?tab=addresses">' + iconSvg('pin') + '<strong>' + addresses.length + ' kayıtlı adres</strong><small>Adresleri yönet</small></a><a data-tab-link="orders" href="/account/profile.html?tab=orders">' + iconSvg('truck') + '<strong>' + (last ? orderStatusText(last) : 'Sipariş yok') + '</strong><small>Siparişleri takip et</small></a><a data-tab-link="invoices" href="/account/profile.html?tab=invoices">' + iconSvg('invoice') + '<strong>Faturalar</strong><small>Hazır olduğunda görüntüle</small></a></div>';
  }
  function securityChecklist() {
    var user = state.summary?.user || {};
    var provider = user.app_metadata?.provider || user.provider || state.session?.user?.app_metadata?.provider || 'E-posta';
    var emailOk = Boolean(user.email_verified || user.email_confirmed_at || state.session?.user?.email_confirmed_at);
    var phoneOk = Boolean(user.phone);
    var sessionOk = Boolean(state.session?.access_token);
    return [
      { key: 'email', label: 'E-posta doğrulaması', note: emailOk ? 'Doğrulandı' : 'Doğrulanmadı', tone: emailOk ? 'ok' : 'warn', icon: 'mail' },
      { key: 'phone', label: 'Telefon bilgisi', note: phoneOk ? 'Kayıtlı' : 'Telefon eklenmemiş', tone: phoneOk ? 'ok' : 'muted', icon: 'phone' },
      { key: 'created', label: 'Hesap oluşturma', note: user.created_at ? formatDate(user.created_at) : 'Bilgi mevcut değil', tone: 'muted', icon: 'calendar' },
      { key: 'provider', label: 'Giriş yöntemi', note: provider || 'Bilgi mevcut değil', tone: 'muted', icon: 'key' },
      { key: 'session', label: 'Oturum durumu', note: sessionOk ? 'Aktif oturum' : 'Oturum bulunamadı', tone: sessionOk ? 'ok' : 'warn', icon: 'session' },
      { key: '2fa', label: 'İki adımlı doğrulama', note: 'Bu özellik şu anda aktif değil', tone: 'muted', icon: 'shield' }
    ];
  }
  function securityRow(item) {
    return '<li><strong>' + escapeHtml(item.label) + '</strong><span>' + escapeHtml(item.note) + '</span></li>';
  }
  function securityIconSvg(name) {
    var paths = {
      mail: '<rect x="3.8" y="6.2" width="16.4" height="11.6" rx="2.2"/><path d="m5.2 8.2 6.8 5 6.8-5"/>',
      phone: '<path d="M8.2 4.8h2.4l1.2 3-1.6 1a9.2 9.2 0 0 0 4.8 4.8l1-1.6 3 1.2v2.4a1.8 1.8 0 0 1-1.8 1.8A12.4 12.4 0 0 1 5 6.6 1.8 1.8 0 0 1 6.8 4.8Z"/>',
      calendar: '<rect x="4.2" y="6" width="15.6" height="13.2" rx="2"/><path d="M8 4.6v2.8M16 4.6v2.8M4.2 10.2h15.6"/>',
      key: '<circle cx="9.2" cy="12" r="3.4"/><path d="M12 12h7.2v2.6M16.2 12v2.2"/>',
      session: '<circle cx="12" cy="12" r="7.2"/><path d="M12 8.2v4.2l2.6 1.6"/>',
      shield: '<path d="M12 3.8 5.6 6.2v5.4c0 4.1 2.7 7.1 6.4 8.6 3.7-1.5 6.4-4.5 6.4-8.6V6.2L12 3.8Z"/><path d="m9.4 12 1.8 1.8 3.6-3.8"/>'
    };
    return '<svg class="cs-security-row__ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.shield) + '</g></svg>';
  }
  function securityStudioRow(item, index) {
    return '<li class="cs-security-row tone-' + escapeHtml(item.tone || 'muted') + '" style="--cs-sec-i:' + index + '">' +
      '<span class="cs-security-row__icon" aria-hidden="true">' + securityIconSvg(item.icon) + '</span>' +
      '<div class="cs-security-row__copy">' +
        '<strong>' + escapeHtml(item.label) + '</strong>' +
        '<em>' + escapeHtml(item.note) + '</em>' +
      '</div>' +
      '<span class="cs-security-row__pill">' + escapeHtml(item.tone === 'ok' ? 'Tamam' : item.tone === 'warn' ? 'Kontrol' : 'Bilgi') + '</span>' +
    '</li>';
  }

  var ACTIVE_RETURN_STATUSES_CANCEL = ['requested', 'under_review', 'approved', 'return_code_shared', 'waiting_customer_ship', 'in_transit', 'received', 'inspection', 'refund_pending'];
  function orderReturnRows(order) {
    return asArray(order?.return_requests).length
      ? asArray(order.return_requests)
      : asArray(state.summary?.returns).filter(function (r) { return String(r.order_id) === String(order?.id); });
  }
  function orderCancelEligibility(order) {
    order = order || {};
    if (order.cancel_requested_at || String(order.cancellation_status || '').toLowerCase() === 'request_pending') {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: true, alreadyCancelled: false };
    }
    var status = statusFromOrder(order);
    var payment = String(order.payment_status || '').toLowerCase();
    var fulfillment = String(order.fulfillment_status || '').toLowerCase();
    var ship = shipment(order);
    var shipStatus = String(ship.status || '').toLowerCase();
    if (status === 'cancelled' || (status === 'payment_failed' && fulfillment === 'cancelled')) {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: true };
    }
    if (['shipped', 'delivered', 'cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned'].includes(status)) {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
    }
    if (['shipped', 'delivered', 'returned', 'cancelled'].includes(fulfillment)) {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
    }
    if (['shipped', 'delivered'].includes(shipStatus) || String(ship.tracking_number || '').trim()) {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
    }
    if (orderReturnRows(order).some(function (r) { return ACTIVE_RETURN_STATUSES_CANCEL.includes(String(r.status || '').toLowerCase()); })) {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
    }
    if (payment === 'paid' && ['paid', 'confirmed', 'preparing', 'packed'].includes(status)) {
      return { canDirectCancel: false, canRequestCancel: true, cancelRequested: false, alreadyCancelled: false };
    }
    if (['paid', 'refunded', 'partially_refunded'].includes(payment)) {
      return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
    }
    if (['pending', 'pending_payment', 'pending_bank_transfer', 'payment_failed'].includes(status)
      || ['pending', 'initiated', 'awaiting_transfer', 'failed', 'authorized'].includes(payment)) {
      return { canDirectCancel: true, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
    }
    return { canDirectCancel: false, canRequestCancel: false, cancelRequested: false, alreadyCancelled: false };
  }
  function orderCancelReasonOptions() {
    return ['', 'Vazgeçtim', 'Yanlış ürün seçtim', 'Yanlış adres', 'Ödeme yöntemini değiştirmek istiyorum', 'Diğer'].map(function (opt) {
      return '<option value="' + escapeHtml(opt) + '">' + escapeHtml(opt || 'İsteğe bağlı') + '</option>';
    }).join('');
  }
  function orderCancelControls(order) {
    var flags = orderCancelEligibility(order);
    if (flags.cancelRequested) {
      return '<div class="cs-order-cancel-block cs-order-cancel-block--note"><p class="cs-order-cancel-note">İptal talebiniz alındı. Siparişiniz henüz kargoya verilmediği için talebiniz ekibimiz tarafından incelenecek. Ödeme alındıysa ücret iadesi kontrol sonrası başlatılır.</p></div>';
    }
    if (flags.alreadyCancelled || (!flags.canDirectCancel && !flags.canRequestCancel)) return '';
    var mode = flags.canDirectCancel ? 'direct' : 'request';
    var label = mode === 'direct' ? 'Siparişi iptal et' : 'İptal talebi gönder';
    return '<details class="cs-order-cancel-block">' +
      '<summary>Siparişi iptal et</summary>' +
      '<div class="cs-order-cancel-block__body">' +
        '<label class="cs-order-cancel-reason"><span>İptal nedeni (isteğe bağlı)</span>' +
        '<select class="cs-input" data-cancel-reason-for="' + escapeHtml(order.id || '') + '">' + orderCancelReasonOptions() + '</select></label>' +
        '<button class="cs-mini-btn cs-mini-btn--danger" type="button" data-cancel-order="' + escapeHtml(order.id || '') + '" data-cancel-mode="' + mode + '">' + escapeHtml(label) + '</button>' +
      '</div></details>';
  }

  function orderCard(order, compact, index) {
    if (compact) return orderSpotlight(order);
    var firstItem = orderItems(order)[0] || {};
    var p = getProductByHandle(firstItem.product_slug || firstItem.product_id || firstItem.product_url) || normalizeProduct(firstItem) || {};
    var ship = shipment(order);
    var invoiceReady = asArray(order.invoices).some(function (i) { return i.pdf_url; });
    var detail = '/account/order-detail.html?id=' + encodeURIComponent(order.id || order.order_number || '');
    var qty = Number(firstItem.quantity) || 1;
    var more = Math.max(0, itemCount(order) - qty);
    var moreLabel = more > 0 ? ' · +' + more + ' ürün' : '';
    var carrier = ship.carrier || ship.carrier_name || '';
    var shipLabel = shipmentLabels[ship.status] || orderStatusText(order);
    var tracking = ship.tracking_number && ship.tracking_url
      ? '<a class="cs-order-card__btn" href="' + escapeHtml(ship.tracking_url) + '" target="_blank" rel="noopener">Kargo takip</a>'
      : '';
    var repeat = ['delivered','shipped','completed'].includes(statusFromOrder(order))
      ? '<button class="cs-order-card__btn" type="button" data-repeat-order="' + escapeHtml(order.id || '') + '">Tekrar satın al</button>'
      : '';
    var cancelBlock = orderCancelControls(order);
    var invoiceLabel = invoiceReady ? 'Hazır' : 'Bekleniyor';
    var delay = Number.isFinite(index) ? ' style="--cs-order-i:' + index + '"' : '';
    return '<article class="cs-order-card cs-order-card--v6"' + delay + '>' +
      '<header class="cs-order-card__head">' +
        '<div class="cs-order-card__id">' +
          '<strong>' + escapeHtml(safeOrderNumber(order)) + '</strong>' +
          '<time datetime="' + escapeHtml(order.created_at || '') + '">' + escapeHtml(formatDate(order.created_at)) + ' · ' + itemCount(order) + ' ürün</time>' +
          (paymentPaid(order) ? '<span class="cs-order-card__paid">Ödeme alındı</span>' : '') +
        '</div>' +
        '<span class="cs-order-card__pill">' + escapeHtml(orderStatusText(order)) + '</span>' +
      '</header>' +
      orderProgress(order, { short: true, list: true }) +
      '<a class="cs-order-card__product" href="' + escapeHtml(p.url || '/allproducts.html') + '">' +
        '<span class="cs-order-card__thumb"><img src="' + escapeHtml(p.image || firstItem.image || '/assets/logo-mark-beige.png') + '" alt="" loading="lazy"></span>' +
        '<span class="cs-order-card__copy">' +
          '<span class="cs-order-card__brand">' + escapeHtml(p.brand || firstItem.brand || 'COSMOSKIN') + '</span>' +
          '<strong>' + escapeHtml(p.product_name || firstItem.product_name || 'Ürün bilgisi bekleniyor') + '</strong>' +
          '<small>' + qty + ' adet' + moreLabel + '</small>' +
        '</span>' +
        '<b class="cs-order-card__price">' + escapeHtml(formatMoney(order.total_amount || firstItem.line_total || p.price || 0)) + '</b>' +
      '</a>' +
      '<div class="cs-order-card__meta" role="list">' +
        '<span role="listitem"><em>Durum</em><b>' + escapeHtml(shipLabel) + '</b></span>' +
        (carrier ? '<span role="listitem"><em>Kargo</em><b>' + escapeHtml(carrier) + '</b></span>' : '') +
        '<span role="listitem"><em>Fatura</em><b>' + escapeHtml(invoiceLabel) + '</b></span>' +
      '</div>' +
      '<div class="cs-order-card__actions">' +
        '<a class="cs-order-card__btn cs-order-card__btn--primary" href="' + escapeHtml(detail) + '">Sipariş detayı</a>' +
        '<a class="cs-order-card__btn" data-tab-link="support" href="/account/profile.html?tab=support">Destek</a>' +
        tracking + repeat +
      '</div>' +
      cancelBlock +
    '</article>';
  }
  function routineSummary(sp) {
    if (!hasSkinProfile(sp)) return '<div class="cs-routine-overview"><p><strong>Durum:</strong> Cilt profili henüz tamamlanmadı.</p><p>Rutin Merkezi testini tamamladığında kayıtlı rutinin ve önerilerin burada görünür.</p><div class="cs-card-actions"><a class="cs-mini-btn dark" href="/account/routines/">Rutin Merkezine Git</a><a class="cs-mini-btn" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Cilt Profilim</a></div></div>';
    var goals = profileGoalLabels(sp); var products = recommendedProducts(4);
    return '<div class="cs-routine-overview"><p><strong>Cilt Tipi:</strong> ' + escapeHtml(cleanSkinType(sp.skin_type)) + '</p><p><strong>Hedef:</strong> ' + escapeHtml(goals[0] || 'Belirtilmedi') + '</p><p><strong>Odak:</strong> ' + escapeHtml(goals.slice(0,3).join(', ') || 'Profil verilerine göre hazırlanır') + '</p><p><strong>Rutin Stili:</strong> ' + escapeHtml(sp.routine_preference || 'Belirtilmedi') + '</p><div class="cs-routine-thumbs">' + products.map(function (p) { return '<img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name) + '">'; }).join('') + '</div><div class="cs-card-actions"><a class="cs-mini-btn dark" data-tab-link="routines" href="/account/profile.html?tab=routines">Rutinlerim</a><a class="cs-mini-btn" data-add-routine-cart="true" href="/allproducts.html">Önerileri Sepete Ekle</a></div></div>';
  }

  function renderOrders() {
    var el = $('#ordersPanel'); if (!el) return;
    var orders = state.summary.orders;
    var count = orders.length;
    var lede = count
      ? count + ' sipariş · durum, kargo ve ürün detayları'
      : 'Sipariş verdiğinizde durum ve teslimat burada görünür.';
    el.innerHTML = panelChrome('Siparişlerim', lede) +
      (count
        ? '<div class="cs-order-list cs-order-list--v6">' + orders.map(function (o, i) { return orderCard(o, false, i); }).join('') + '</div>'
        : emptyState('Henüz siparişiniz yok.', 'Sipariş verdiğinizde durumunu ve teslimat bilgilerini burada takip edebilirsiniz.', 'Alışverişe Başla', '/allproducts.html'));
  }

  function returnStatusLabel(status) {
    return ({ requested:'İade talebiniz alındı.', under_review:'Talebiniz inceleniyor.', approved:'İade talebiniz onaylandı.', return_code_shared:'İade gönderim kodunuz hazır.', waiting_customer_ship:'Ürününüzü kargoya vermeniz bekleniyor.', in_transit:'İade gönderiniz yolda.', received:'Ürününüz tarafımıza ulaştı.', inspection:'Ürün kontrol ediliyor.', refund_pending:'Ücret iadeniz hazırlanıyor.', refunded:'Ücret iadeniz tamamlandı.', rejected:'İade talebiniz reddedildi.', cancelled:'İade talebiniz iptal edildi.', closed:'İade süreci kapatıldı.' })[String(status || '').toLowerCase()] || 'İade talebi alındı.';
  }
  function resolveDeliveryTimestampForOrder(order) {
    if (!order) return null;
    if (order.delivery_resolved_at) return order.delivery_resolved_at;
    if (order.delivered_at) return order.delivered_at;
    var ship = shipment(order);
    if (ship && ship.delivered_at) return ship.delivered_at;
    return null;
  }
  function deliveredDate(order) { return resolveDeliveryTimestampForOrder(order); }
  function returnWindowEnds(order) { var d = deliveredDate(order); if (!d) return null; var end = new Date(d); end.setDate(end.getDate() + 14); return end; }
  function isDeliveredOrder(order) {
    var deliveryAt = deliveredDate(order);
    if (!deliveryAt) return false;
    var s = String(order?.status || '').toLowerCase();
    if (['pending', 'pending_payment', 'pending_bank_transfer', 'payment_failed', 'cancelled', 'preparing', 'packed'].indexOf(s) >= 0) return false;
    return true;
  }
  function isReturnEligible(order) {
    if (order && typeof order.is_return_eligible === 'boolean') return order.is_return_eligible;
    var end = returnWindowEnds(order);
    return isDeliveredOrder(order) && end && Date.now() <= end.getTime();
  }
  function returnEligibleOrders() { return asArray(state.summary?.orders).filter(isReturnEligible); }
  function returnReasonOptions(selected) { return ['Vazgeçtim','Yanlış ürün gönderildi','Ürün hasarlı geldi','Eksik ürün gönderildi','Ürün beklentimi karşılamadı','Diğer'].map(function(reason){ return '<option value="' + escapeHtml(reason) + '" ' + (reason === selected ? 'selected' : '') + '>' + escapeHtml(reason) + '</option>'; }).join(''); }
  function orderReturnItemsHtml(order) {
    var items = orderItems(order);
    if (!items.length) return '<p class="cs-field-help full">Bu sipariş için ürün satırı bulunamadı. Destek ekibimizle iletişime geçebilirsiniz.</p>';
    return '<div class="cs-return-item-list">' + items.map(function(item, index){
      var qty = Number(item.quantity || item.qty || 1);
      var slug = item.product_slug || item.product_id || item.id || ('item-' + index);
      return '<article class="cs-return-item"><label class="cs-return-item__check"><input type="checkbox" name="return_item" value="' + escapeHtml(item.id || slug) + '" data-product-slug="' + escapeHtml(slug) + '" data-product-name="' + escapeHtml(item.product_name || item.name || 'Ürün') + '" data-unit-price="' + escapeHtml(item.unit_price || item.price || 0) + '"><span></span></label><div class="cs-return-item__media">' + (item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.product_name || item.name || 'Ürün') + '">' : iconSvg('bag')) + '</div><div class="cs-return-item__body"><strong>' + escapeHtml(item.product_name || item.name || 'Ürün') + '</strong><small>' + escapeHtml(item.brand || item.sku || '') + '</small><div class="cs-return-item__controls"><label><span>Adet</span><select class="cs-input" name="quantity_' + escapeHtml(item.id || slug) + '">' + Array.from({length:Math.max(1,qty)}, function(_, i){ return '<option value="' + (i+1) + '">' + (i+1) + '</option>'; }).join('') + '</select></label><label><span>İade sebebi</span><select class="cs-input" name="reason_' + escapeHtml(item.id || slug) + '">' + returnReasonOptions('Vazgeçtim') + '</select></label></div><label class="cs-return-item__note"><span>Ürün notu</span><input class="cs-input" name="note_' + escapeHtml(item.id || slug) + '" maxlength="240" placeholder="Ürünle ilgili kısa açıklama"></label></div></article>';
    }).join('') + '</div>';
  }
  function formatFileSize(bytes) {
    var n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }
  // H2: renders one already-signed return attachment (file_name, mime_type,
  // file_size, created_at, signed_url, download_url, preview_kind — see
  // functions/api/_lib/return-attachments.js). Never reads/renders a raw
  // storage path; falls back to a friendly "unavailable" card when the
  // backend could not produce a signed URL (expired/failed).
  // H2B: a URL is only ever treated as usable if it is a real Supabase
  // signed-object URL (contains /storage/v1/object/sign/). This is a
  // frontend defense-in-depth check on top of the backend contract
  // (functions/api/_lib/return-attachments.js only ever returns a real
  // signed URL or null) — it deliberately refuses any raw/public object URL,
  // file_path, or storage_path, even if one ever leaked through by mistake.
  function isRealSignedUrl(value) {
    return typeof value === 'string' && /\/storage\/v1\/object\/sign\//.test(value);
  }
  function renderReturnAttachment(file) {
    var name = escapeHtml(file.file_name || 'Ek dosya');
    var meta = [formatFileSize(file.file_size), file.created_at ? formatDate(file.created_at) : ''].filter(Boolean).map(escapeHtml).join(' · ');
    var metaHtml = meta ? '<small>' + meta + '</small>' : '';
    var viewUrl = isRealSignedUrl(file.signed_url) ? file.signed_url : '';
    var downloadUrl = isRealSignedUrl(file.download_url) ? file.download_url : viewUrl;
    if (!viewUrl) {
      return '<div class="cs-return-attachment cs-return-attachment--missing"><div class="cs-return-attachment__media cs-return-attachment__media--file"><span>Dosya</span></div><div class="cs-return-attachment__body"><strong>' + name + '</strong>' + metaHtml + '<em>Dosya şu anda görüntülenemiyor.</em></div></div>';
    }
    var isImage = file.preview_kind === 'image';
    var isVideo = file.preview_kind === 'video';
    var mediaHtml = isImage
      ? '<div class="cs-return-attachment__media"><img src="' + escapeHtml(viewUrl) + '" alt="' + name + '" loading="lazy" onerror="this.hidden=true;this.parentElement.classList.add(&#39;cs-return-attachment__media--broken&#39;);"></div>'
      : '<div class="cs-return-attachment__media cs-return-attachment__media--file"><span>' + (isVideo ? 'Video' : 'Dosya') + '</span></div>';
    return '<div class="cs-return-attachment"><a href="' + escapeHtml(viewUrl) + '" target="_blank" rel="noopener" aria-label="' + name + ' görüntüle">' + mediaHtml + '</a><div class="cs-return-attachment__body"><strong>' + name + '</strong>' + metaHtml + '<div class="cs-return-attachment__actions"><a class="cs-mini-btn" href="' + escapeHtml(viewUrl) + '" target="_blank" rel="noopener">Görüntüle</a><a class="cs-mini-btn dark" href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noopener">İndir</a></div></div></div>';
  }
  function returnRequestFormHtml() {
    var orders = returnEligibleOrders();
    if (!orders.length) return '<section class="cs-card cs-return-create-card"><div class="cs-card-head"><span>İADE TALEBİ OLUŞTUR</span></div><div class="cs-return-empty-eligible"><strong>İade edilebilir sipariş bulunmuyor.</strong><p>Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz. Teslim tarihinden itibaren 14 gün geçtikten sonra iade süresi dolmuştur.</p><a class="cs-mini-btn dark" data-tab-link="orders" href="/account/profile.html?tab=orders">Siparişlerime Git</a></div></section>';
    var orderOptions = orders.map(function(order){ return '<option value="' + escapeHtml(order.id || '') + '">' + escapeHtml(safeOrderNumber(order)) + ' · Son gün: ' + escapeHtml(formatDate(returnWindowEnds(order))) + '</option>'; }).join('');
    var first = orders[0];
    return '<section class="cs-card cs-return-create-card" id="returnCreateCard"><div class="cs-card-head"><span>İADE TALEBİ OLUŞTUR</span><button class="cs-mini-btn" type="button" data-close-return-form>Vazgeç</button></div><form class="cs-form cs-return-form" id="returnRequestForm"><label class="full"><span>Sipariş seçimi</span><select class="cs-input" name="order_id" data-return-order-select>' + orderOptions + '</select></label><div class="full" data-return-order-items>' + orderReturnItemsHtml(first) + '</div><label class="full"><span>Açıklama</span><textarea class="cs-input" name="customer_note" rows="4" maxlength="900" placeholder="Talebinizi değerlendirmemize yardımcı olacak kısa açıklama yazın."></textarea></label><label class="full"><span>Fotoğraf / Video</span><input class="cs-input" name="attachments" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple data-return-attachments><small class="cs-field-help">Hasarlı, yanlış veya eksik ürün taleplerinde fotoğraf/video zorunludur. JPG, PNG, WEBP veya MP4 · en fazla 5 dosya · dosya başına 10 MB.</small></label><div class="cs-return-hygiene-box full"><strong>Kozmetik/hijyen iade koşulları</strong><label><input type="checkbox" name="unused_confirmed"> Ürünün kullanılmadığını onaylıyorum.</label><label><input type="checkbox" name="hygiene_confirmed"> Ürünün ambalajının açılmadığını onaylıyorum.</label><label><input type="checkbox" name="seal_intact_confirmed"> Koruma bandı, mühür veya jelatinin bozulmadığını onaylıyorum.</label><label><input type="checkbox" name="resaleable_confirmed"> Ürünün yeniden satışa uygun durumda olduğunu onaylıyorum.</label><label><input type="checkbox" name="return_terms_confirmed" required> İade koşullarını okuduğumu ve talebin inceleme sonrası sonuçlandırılacağını kabul ediyorum.</label><p>Lütfen fotoğraf/video içinde kimlik, banka kartı, özel belge veya gereksiz kişisel bilgi görünmediğinden emin olun.</p></div><div class="cs-form-status full" id="returnRequestStatus" role="status"></div><button class="cs-pill-btn cs-pill-btn--dark full" type="submit">İade Talebi Oluştur</button></form></section>';
  }

  function renderReturns() {
    var el = $('#returnsPanel'); if (!el) return;
    var rows = asArray(state.summary.returns || []);
    var createOpen = String(new URL(window.location.href).searchParams.get('createReturn') || '') === '1' || el.dataset.returnFormOpen === 'true';
    var cards = rows.length ? '<div class="cs-order-list cs-return-list">' + rows.map(function (r) {
      var items = asArray((r.items && r.items.length ? r.items : r.requested_items));
      var attachments = asArray(r.attachments);
      var requestNo = r.return_number || ('CS-RET-' + String(r.id || '').replace(/-/g,'').slice(0,10).toUpperCase());
      var productList = items.length ? '<ul class="cs-return-products">' + items.map(function(item){ return '<li><strong>' + escapeHtml(item.product_name_snapshot || item.product_name || item.name || 'Ürün') + '</strong><span>' + escapeHtml(item.quantity || 1) + ' adet · ' + escapeHtml(item.reason || r.reason || 'İade talebi') + '</span></li>'; }).join('') + '</ul>' : '<p class="cs-field-help">Ürün detayları hazırlanıyor.</p>';
      var expectedAttachmentCount = Number(r.attachment_count || r.attachments_count || r.metadata?.attachment_count || 0);
      var attachmentList = attachments.length ? '<div class="cs-return-attachment-list">' + attachments.map(renderReturnAttachment).join('') + '</div>' : (expectedAttachmentCount > 0 ? '<span>Ek dosya kaydı hazırlanamadı. Lütfen destek ekibiyle iletişime geçin.</span>' : '<span>Ek dosya yok</span>');
      return '<article class="cs-card cs-return-card"><div class="cs-card-head"><span>' + escapeHtml(returnStatusLabel(r.status)) + '</span><small>' + escapeHtml(requestNo) + '</small></div><h3>' + escapeHtml(r.reason || 'İade talebi') + '</h3><p>' + escapeHtml(r.customer_note || 'Talebiniz COSMOSKIN ekibi tarafından incelenir.') + '</p>' + productList + '<details class="cs-return-details"><summary>İade detayını görüntüle</summary><div class="cs-return-detail-grid"><div><span>Talep No</span><strong>' + escapeHtml(requestNo) + '</strong></div><div><span>Sipariş</span><strong>' + escapeHtml(r.order_number || r.order_id || 'Sipariş bilgisi') + '</strong></div><div><span>Talep tarihi</span><strong>' + escapeHtml(formatDate(r.created_at || r.requested_at, true)) + '</strong></div><div><span>Durum</span><strong>' + escapeHtml(returnStatusLabel(r.status)) + '</strong></div><div class="full"><span>Ekler</span>' + attachmentList + '</div></div></details><div class="cs-return-meta"><small>Talep tarihi: ' + escapeHtml(formatDate(r.created_at || r.requested_at, true)) + '</small><small>Ek dosya: ' + attachments.length + '</small></div></article>';
    }).join('') + '</div>' : emptyState('Henüz iade talebiniz bulunmuyor.', 'Teslim edilmiş ve iade süresi devam eden siparişleriniz için iade talebi oluşturabilirsiniz.', null);
    var success = state.returnSuccessMessage ? '<div class="cs-return-success" role="status">' + escapeHtml(state.returnSuccessMessage) + '</div>' : '';
    el.innerHTML = panelChrome('İade Taleplerim', 'Teslim edilmiş siparişleriniz için resmi iade taleplerini buradan yönetin.', '<button class="cs-pill-btn cs-pill-btn--dark" data-open-return-form type="button">İade Talebi Oluştur</button>') + success + (createOpen ? returnRequestFormHtml() : '') + cards;
  }
  function uniqueFavoriteList() {
    if (state.authenticated) {
      var dbFavorites = asArray(state.summary.favorites);
      var seenAuth = {};
      return dbFavorites.map(function (f) {
        var key = f.product_slug || f.product_id || f.slug || f.id;
        if (!key || seenAuth[key]) return null;
        seenAuth[key] = true;
        var p = getProductByHandle(key) || normalizeProduct(f);
        return p ? Object.assign({ favorite_id: isUuid(f.id || f.favorite_id) ? (f.id || f.favorite_id) : '', product_slug: p.product_slug || key }, p) : null;
      }).filter(Boolean);
    }
    var local = window.COSMOSKINFavorites && typeof window.COSMOSKINFavorites.get === 'function'
      ? window.COSMOSKINFavorites.get()
      : readLocalFavorites();
    var seen = {};
    return local.map(function (item) {
      var key = item.product_slug || item.slug || item.id;
      if (!key || seen[key]) return null;
      seen[key] = true;
      var p = getProductByHandle(key) || normalizeProduct(item);
      return p ? Object.assign({ favorite_id: '', product_slug: p.product_slug || key }, p) : null;
    }).filter(Boolean);
  }
  function refreshFavoritesStock() {
    var favs = uniqueFavoriteList();
    if (!favs.length || !window.COSMOSKIN_STOCK || typeof window.COSMOSKIN_STOCK.loadInventory !== 'function') return;
    if (isDesignPreview()) return;
    var slugs = favs.map(function (p) { return p.product_slug || p.id; }).filter(Boolean);
    window.COSMOSKIN_STOCK.loadInventory(slugs).then(function () {
      if (state.activeTab !== 'favorites') return;
      var grid = document.querySelector('#favoritesPanel .cs-favorites-grid');
      if (!grid) return;
      favs.forEach(function (p) {
        var slug = p.product_slug || p.id || '';
        var stock = window.COSMOSKIN_STOCK.favoriteStockState(slug);
        var card = grid.querySelector('.cs-fav-card[data-fav-slug="' + String(slug).replace(/"/g, '\\"') + '"]');
        var btn = (card && card.querySelector('[data-add-product-cart]')) || grid.querySelector('[data-add-product-cart="' + String(slug).replace(/"/g, '\\"') + '"]');
        if (btn) {
          btn.disabled = !stock.sellable;
          btn.setAttribute('aria-disabled', stock.sellable ? 'false' : 'true');
          btn.textContent = stock.sellable ? 'Sepete ekle' : (stock.className === 'is-unknown' ? 'Bekliyor' : 'Stokta yok');
          btn.classList.toggle('is-disabled', !stock.sellable);
        }
        if (card) {
          var row = card.querySelector('.cs-fav-card__row');
          var badge = card.querySelector('.cs-fav-card__badge');
          if (badge) badge.remove();
          if (row && (stock.className === 'is-out' || stock.className === 'is-low')) {
            row.insertAdjacentHTML('beforeend',
              '<span class="cs-fav-card__badge ' + escapeHtml(stock.className) + '">' +
              escapeHtml(stock.className === 'is-low' ? 'Son ürünler' : 'Stokta yok') + '</span>');
          }
        }
      });
    }).catch(function () {});
  }
  function renderFavorites() {
    var el = $('#favoritesPanel'); if (!el) return;
    var favs = uniqueFavoriteList();
    var design = isDesignPreview();
    var count = favs.length;
    var lede = count ? count + ' kayıtlı ürün · sepete ekle veya kaldır' : 'Beğendiğin ürünleri kalp ile kaydet.';
    el.innerHTML = panelChrome('Favorilerim', lede, '') +
      (count
        ? '<div class="cs-favorites-grid cs-favorites-grid--v6" data-favorites-count="' + count + '">' +
          favs.map(function (p, i) {
            return favoriteCard(p, {
              favoriteId: p.favorite_id,
              favoriteSlug: p.product_slug,
              isFavorite: true,
              useLiveStock: !design,
              assumeInStock: design,
              index: i
            });
          }).join('') + '</div>'
        : emptyState('Favorilerin henüz boş.', 'Cilt bakım rutinine eklemek istediğin ürünleri kalp ikonuyla kaydedebilirsin.', 'Ürünleri Keşfet', '/allproducts.html'));
    refreshFavoritesStock();
  }
  function invoiceStatusMeta(invoice) {
    var status = String(invoice.invoice_status || invoice.status || '').toLowerCase();
    var hasPdf = Boolean(invoice.pdf_url || invoice.url);
    if (hasPdf || status === 'issued' || status === 'ready' || status === 'sent') {
      return { key: 'ready', label: 'Hazır' };
    }
    if (status === 'failed' || status === 'error') return { key: 'failed', label: 'Hata' };
    if (status === 'cancelled' || status === 'canceled') return { key: 'cancelled', label: 'İptal' };
    return { key: 'pending', label: 'Hazırlanıyor' };
  }
  function invoiceTypeLabel(invoice, order) {
    var type = String(invoice.invoice_type || order.invoice_type || '').toLowerCase();
    if (type === 'corporate' || type === 'company' || type === 'e_invoice' || type === 'einvoice') return 'Kurumsal';
    if (type === 'individual' || type === 'personal' || type === 'e_archive' || type === 'earchive') return 'Bireysel';
    return 'E-Fatura / e-Arşiv';
  }
  function renderInvoices() {
    var el = $('#invoicesPanel'); if (!el) return;
    var rows = [];
    asArray(state.summary && state.summary.orders).forEach(function (o) {
      asArray(o.invoices).forEach(function (i) { rows.push({ order: o, invoice: i }); });
    });
    rows.sort(function (a, b) {
      var da = new Date(a.invoice.issued_at || a.invoice.created_at || a.order.paid_at || a.order.created_at || 0).getTime();
      var db = new Date(b.invoice.issued_at || b.invoice.created_at || b.order.paid_at || b.order.created_at || 0).getTime();
      return db - da;
    });
    var readyCount = rows.filter(function (r) { return invoiceStatusMeta(r.invoice).key === 'ready'; }).length;
    var hero =
      '<article class="cs-inv-studio__hero">' +
        '<div class="cs-inv-studio__hero-top">' +
          '<span class="cs-inv-studio__icon" aria-hidden="true">' + iconSvg('invoice') + '</span>' +
          '<span class="cs-inv-studio__badge">' + rows.length + ' kayıt</span>' +
        '</div>' +
        '<span class="cs-inv-studio__kicker">Fatura arşivi</span>' +
        '<h2>Sipariş faturaların tek bakışta</h2>' +
        '<p>Hazır e-faturaları PDF olarak açabilir, sipariş detayına geçebilirsin. Fatura henüz oluşmadıysa ödeme sonrası e-posta ile de iletilir.</p>' +
        '<div class="cs-inv-studio__stats" role="list">' +
          '<span role="listitem"><em>Hazır</em><b>' + readyCount + '</b></span>' +
          '<span role="listitem"><em>Toplam</em><b>' + rows.length + '</b></span>' +
          '<span role="listitem"><em>Kaynak</em><b>Sipariş</b></span>' +
        '</div>' +
      '</article>';
    var list = rows.length
      ? '<div class="cs-inv-studio__list" role="list">' + rows.map(function (r, idx) {
          var inv = r.invoice || {};
          var order = r.order || {};
          var meta = invoiceStatusMeta(inv);
          var number = inv.invoice_number || inv.number || safeOrderNumber(order);
          var issued = inv.issued_at || inv.created_at || order.paid_at || order.created_at;
          var pdf = inv.pdf_url || inv.url || '';
          var orderHref = order.id
            ? '/account/order-detail.html?id=' + encodeURIComponent(order.id)
            : '/account/profile.html?tab=orders';
          var total = order.total_amount != null ? formatMoney(order.total_amount) : '';
          var cta = pdf
            ? '<a class="cs-inv-studio__btn cs-inv-studio__btn--dark" href="' + escapeHtml(pdf) + '" target="_blank" rel="noopener noreferrer">PDF’yi aç</a>'
            : '<a class="cs-inv-studio__btn" href="/contact.html">Destek al</a>';
          return '<article class="cs-inv-card cs-inv-card--' + meta.key + '" role="listitem" style="--cs-inv-i:' + idx + '">' +
            '<header class="cs-inv-card__head">' +
              '<div class="cs-inv-card__id">' +
                '<em class="cs-inv-card__status">' + escapeHtml(meta.label) + '</em>' +
                '<strong>' + escapeHtml(number) + '</strong>' +
              '</div>' +
              '<span class="cs-inv-card__mark" aria-hidden="true">' + iconSvg('invoice') + '</span>' +
            '</header>' +
            '<dl class="cs-inv-card__meta">' +
              '<div><dt>Tarih</dt><dd>' + escapeHtml(formatDate(issued)) + '</dd></div>' +
              '<div><dt>Sipariş</dt><dd>' + escapeHtml(safeOrderNumber(order)) + '</dd></div>' +
              '<div><dt>Tür</dt><dd>' + escapeHtml(invoiceTypeLabel(inv, order)) + '</dd></div>' +
              (total ? '<div><dt>Tutar</dt><dd>' + escapeHtml(total) + '</dd></div>' : '') +
            '</dl>' +
            '<div class="cs-inv-card__actions">' +
              cta +
              '<a class="cs-inv-studio__btn" href="' + escapeHtml(orderHref) + '">Siparişi gör</a>' +
            '</div>' +
          '</article>';
        }).join('') + '</div>'
      : '<div class="cs-inv-studio__empty">' +
          '<span class="cs-inv-studio__empty-icon" aria-hidden="true">' + iconSvg('invoice') + '</span>' +
          '<strong>Hazır fatura henüz yok</strong>' +
          '<p>Ödemesi tamamlanan siparişlerin e-faturası oluşunca burada ve e-posta adresinde görünür.</p>' +
          '<div class="cs-inv-card__actions">' +
            '<a class="cs-inv-studio__btn cs-inv-studio__btn--dark" data-tab-link="orders" href="/account/profile.html?tab=orders">Siparişlerim</a>' +
            '<a class="cs-inv-studio__btn" href="/allproducts.html">Alışverişe devam</a>' +
          '</div>' +
        '</div>';
    var note =
      '<aside class="cs-inv-studio__note">' +
        '<p><strong>Not:</strong> Fatura PDF’leri güvenli bağlantı üzerinden açılır. Kurumsal fatura bilgilerin checkout sırasında kaydedilir; değişiklik için destek ekibine yazabilirsin.</p>' +
        '<div class="cs-inv-card__actions">' +
          '<a class="cs-inv-studio__btn" data-tab-link="orders" href="/account/profile.html?tab=orders">Siparişler</a>' +
          '<a class="cs-inv-studio__btn" data-tab-link="support" href="/account/profile.html?tab=support">Destek</a>' +
        '</div>' +
      '</aside>';
    el.innerHTML = panelChrome('Faturalarım', 'Hazır e-faturalarını PDF olarak görüntüle.') +
      '<section class="cs-inv-studio" aria-label="Faturalarım">' + hero + list + note + '</section>';
  }
  function renderRoutines() {
    var el = $('#routinesPanel'); if (!el) return;
    var rows = asArray(state.summary.routine_results).map(normalizeRoutineRecord).sort(function (a, b) {
      if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1;
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
    function routineCard(r, index) {
      var products = asArray(r.recommended_products).slice(0, 5);
      var profile = safeObject(r.skin_profile_snapshot);
      var primaryGoal = cleanGoal(profile.primary_goal || profile.routine_goal || '');
      var skinType = cleanSkinType(profile.skin_type || '');
      var sensitivity = cleanSensitivity(profile.sensitivity || '');
      var score = Number(r.routine_score || 0);
      var scoreHtml = score ? '<div class="cs-routine-score"><strong>' + escapeHtml(score) + '</strong><span>/100</span></div>' : '';
      return '<article class="cs-routine-card ' + (r.is_active || index === 0 ? 'is-active' : '') + '"><div><span class="cs-overline">' + (r.is_active || index === 0 ? 'AKTİF RUTİN' : 'RUTİN SONUCU') + '</span><h3>' + escapeHtml(r.routine_title || 'Kayıtlı Akıllı Rutin') + '</h3><p>' + escapeHtml(r.result?.summary || 'Bu rutin cilt profili, hedef ve ürün adımı verilerine göre kaydedildi.') + '</p><div class="cs-routine-meta"><span>' + escapeHtml(skinType) + '</span><span>' + escapeHtml(primaryGoal) + '</span><span>' + escapeHtml(sensitivity) + '</span></div><small>Son güncelleme: ' + escapeHtml(formatDate(r.updated_at || r.created_at, true)) + '</small></div>' + scoreHtml + '<div class="cs-routine-thumbs">' + products.map(function (p) { var prod = getProductByHandle(p.product_slug || p.slug || p.id) || normalizeProduct(p); return '<a href="' + escapeHtml(prod?.url || '/allproducts.html') + '" class="cs-routine-thumb"><img src="' + escapeHtml(prod?.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(prod?.product_name || 'Ürün') + '" loading="lazy"></a>'; }).join('') + '</div><div class="cs-routine-step-grid">' + routineStepsHtml('Sabah', r.morning_steps) + routineStepsHtml('Akşam', r.evening_steps) + (r.weekly_steps.length ? routineStepsHtml('Haftalık', r.weekly_steps) : '') + '</div><div class="cs-card-actions"><a class="cs-mini-btn dark" href="/account/routines/">Rutin Dashboard’u Aç</a><button class="cs-mini-btn" type="button" data-add-saved-routine-cart="' + escapeHtml(r.id || '') + '">Ürünleri Sepete Ekle</button></div></article>';
    }
    el.innerHTML = panelChrome('Akıllı Rutinim', 'Kişisel bakım rotanız hesabınızla senkronize edilir.', '<a class="cs-pill-btn cs-pill-btn--dark" href="/account/routines/">Rutin Merkezine Git</a>') + (rows.length ? '<div class="cs-routine-list">' + rows.map(routineCard).join('') + '</div>' : emptyState('Henüz kayıtlı rutininiz yok.', 'Akıllı Rutin Merkezi’ni kullanarak kişisel bakım rotanızı oluşturabilirsiniz.', 'Rutin Merkezine Git', '/account/routines/'));
  }
  function skinCompletionPercent(sp) {
    sp = sp || skinProfile();
    var parts = 0;
    if (sp.skin_type) parts += 1;
    if (sp.sensitivity) parts += 1;
    if (sp.routine_goal || sp.goals.length) parts += 1;
    if (sp.routine_preference) parts += 1;
    return Math.round((parts / 4) * 100);
  }
  function skinChip(name, value, label, selected, hint) {
    return '<label class="cs-skin-chip' + (selected ? ' is-selected' : '') + '">' +
      '<input type="radio" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '"' + (selected ? ' checked' : '') + '>' +
      '<span class="cs-skin-chip__face">' +
        '<strong>' + escapeHtml(label) + '</strong>' +
        (hint ? '<em>' + escapeHtml(hint) + '</em>' : '') +
      '</span>' +
    '</label>';
  }
  function skinCheckChip(value, label, selected) {
    return '<label class="cs-skin-chip cs-skin-chip--check' + (selected ? ' is-selected' : '') + '">' +
      '<input type="checkbox" name="skin_concerns" value="' + escapeHtml(value) + '"' + (selected ? ' checked' : '') + '>' +
      '<span class="cs-skin-chip__face"><strong>' + escapeHtml(label) + '</strong></span>' +
    '</label>';
  }
  function renderSkinProfile() {
    var el = $('#skinPanel'); if (!el) return;
    var sp = skinProfile();
    var goals = profileGoalLabels(sp);
    var products = recommendedProducts(6);
    var complete = skinCompletionPercent(sp);
    var has = hasSkinProfile(sp);
    var typeLabel = has ? cleanSkinType(sp.skin_type) : 'Profil bekliyor';
    var typeCurrent = cleanSkinType(sp.skin_type);
    var sensCurrent = cleanSensitivity(sp.sensitivity);
    var goalCurrent = goals[0] || '';
    var styleCurrent = String(sp.routine_preference || '').trim();
    var skinTypes = [
      { v: 'Normal cilt', hint: 'Dengeli, az şikayet' },
      { v: 'Kuru cilt', hint: 'Nem ve bariyer odaklı' },
      { v: 'Karma cilt', hint: 'T bölge + yanak dengesi' },
      { v: 'Yağlı cilt', hint: 'Sebum ve gözenek' },
      { v: 'Hassas cilt', hint: 'Yumuşak formüller' }
    ];
    var sensitivities = [
      { v: 'Düşük', hint: 'Rahat tolerans' },
      { v: 'Orta', hint: 'Dengeli yaklaşım' },
      { v: 'Yüksek', hint: 'Nazik tercihler' }
    ];
    var primaryGoals = [
      { v: 'Nem desteği', hint: 'Hidrasyon' },
      { v: 'Cilt konforu ve bariyer görünümü', hint: 'Bariyer' },
      { v: 'Aydınlık görünüm', hint: 'Işıltı' },
      { v: 'Gözenek görünümü ve sebum dengesi', hint: 'Denge' },
      { v: 'Hassas ciltlere uygun ürün tercihi', hint: 'Konfor' }
    ];
    var concernOpts = ['Nem desteği', 'Cilt konforu', 'Bariyer desteği', 'Leke görünümü', 'Gözenek görünümü ve sebum', 'Hassas ciltlere uygun ürün tercihi'];
    var styles = [
      { v: 'Minimal (3 adım)', hint: 'Hızlı rutin' },
      { v: 'Dengeli (4-5 adım)', hint: 'Günlük denge' },
      { v: 'Detaylı (6+ adım)', hint: 'Katmanlı bakım' }
    ];
    function concernChecked(v) {
      if (goals.includes(v)) return true;
      return sp.goals.some(function (g) { return cleanGoal(g) === v || g === v; });
    }
    function styleSelected(v) {
      if (!styleCurrent) return false;
      return styleCurrent === v || styleCurrent.toLocaleLowerCase('tr-TR').indexOf(v.split(' ')[0].toLocaleLowerCase('tr-TR')) === 0;
    }
    var DROP = '<svg class="cs-skin-studio__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2c2.8 3.6 6.2 7.1 6.2 10.4a6.2 6.2 0 1 1-12.4 0C5.8 10.3 9.2 6.8 12 3.2Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/></svg>';
    var goalTags = goals.length
      ? '<div class="cs-skin-studio__tags">' + goals.slice(0, 4).map(function (g) { return '<span>' + escapeHtml(g) + '</span>'; }).join('') + '</div>'
      : '';
    el.innerHTML = panelChrome(
      'Cilt Profilim',
      'Cilt tipi, hassasiyet ve bakım hedefleri hesabınızla kaydedilir.',
      '<button class="cs-pill-btn cs-pill-btn--dark cs-skin-save-btn" type="button" id="saveSkinBtn">Profili Kaydet</button>'
    ) +
      '<section class="cs-skin-studio">' +
        '<article class="cs-skin-studio__hero">' +
          '<div class="cs-skin-studio__hero-top">' +
            '<span class="cs-skin-studio__icon" aria-hidden="true">' + DROP + '</span>' +
            '<div class="cs-skin-studio__ring" style="--cs-skin-complete:' + complete + ';--cs-ring-offset:' + (100 - complete) + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + complete + '" aria-label="Profil tamamlanma ' + complete + ' yüzde">' +
              '<svg class="cs-skin-studio__ring-svg" viewBox="0 0 36 36" aria-hidden="true">' +
                '<defs><linearGradient id="csSkinRingGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#8d663c"/><stop offset="55%" stop-color="#c9a46a"/><stop offset="100%" stop-color="#f0d7a8"/></linearGradient></defs>' +
                '<circle class="cs-skin-studio__ring-track" cx="18" cy="18" r="15" fill="none"/>' +
                '<circle class="cs-skin-studio__ring-progress" cx="18" cy="18" r="15" fill="none" stroke="url(#csSkinRingGrad)"/>' +
              '</svg>' +
              '<div class="cs-skin-studio__ring-label"><strong>' + complete + '%</strong><span>dolu</span></div>' +
            '</div>' +
          '</div>' +
          '<span class="cs-skin-studio__kicker">' + (has ? 'Aktif profil' : 'Profil kurulumu') + '</span>' +
          '<h2>' + escapeHtml(typeLabel) + '</h2>' +
          '<p>' + escapeHtml(has ? (goals.join(' · ') || 'Bakım hedefi henüz seçilmedi') : 'Birkaç seçimle rutin ve ürün önerilerinizi kişiselleştirin.') + '</p>' +
          goalTags +
          '<footer class="cs-skin-studio__meta">' +
            '<span>' + (sp.updated_at ? 'Son güncelleme · ' + escapeHtml(formatDate(sp.updated_at)) : 'Henüz kaydedilmedi') + '</span>' +
            '<a data-tab-link="routines" href="/account/profile.html?tab=routines">Rutinlerim</a>' +
          '</footer>' +
        '</article>' +
        '<form class="cs-skin-studio__form" id="skinForm" novalidate>' +
          '<fieldset class="cs-skin-block">' +
            '<legend><span>01</span>Cilt tipi</legend>' +
            '<p class="cs-skin-block__lede">Cildinizi en iyi tanımlayan tipi seçin.</p>' +
            '<div class="cs-skin-chipgrid">' + skinTypes.map(function (t) {
              return skinChip('skin_type', t.v, t.v, typeCurrent.toLowerCase() === t.v.toLowerCase(), t.hint);
            }).join('') + '</div>' +
          '</fieldset>' +
          '<fieldset class="cs-skin-block">' +
            '<legend><span>02</span>Hassasiyet</legend>' +
            '<p class="cs-skin-block__lede">Aktif içeriklere karşı toleransınız.</p>' +
            '<div class="cs-skin-chipgrid cs-skin-chipgrid--3">' + sensitivities.map(function (t) {
              return skinChip('skin_sensitivity', t.v, t.v, sensCurrent.indexOf(t.v) === 0, t.hint);
            }).join('') + '</div>' +
          '</fieldset>' +
          '<fieldset class="cs-skin-block">' +
            '<legend><span>03</span>Birincil bakım hedefi</legend>' +
            '<p class="cs-skin-block__lede">Önerilerin öncelik alacağı ana odak.</p>' +
            '<div class="cs-skin-chipgrid">' + primaryGoals.map(function (t) {
              return skinChip('routine_goal', t.v, t.v, goalCurrent === t.v, t.hint);
            }).join('') + '</div>' +
          '</fieldset>' +
          '<fieldset class="cs-skin-block">' +
            '<legend><span>04</span>Ek öncelikler</legend>' +
            '<p class="cs-skin-block__lede">İsterseniz birden fazla seçebilirsiniz.</p>' +
            '<div class="cs-skin-chipgrid cs-skin-chipgrid--wrap">' + concernOpts.map(function (v) {
              return skinCheckChip(v, v, concernChecked(v));
            }).join('') + '</div>' +
          '</fieldset>' +
          '<fieldset class="cs-skin-block">' +
            '<legend><span>05</span>Rutin stili</legend>' +
            '<p class="cs-skin-block__lede">Günlük bakımınıza uygun adım yoğunluğu.</p>' +
            '<div class="cs-skin-chipgrid cs-skin-chipgrid--3">' + styles.map(function (t) {
              return skinChip('routine_style', t.v, t.v, styleSelected(t.v), t.hint);
            }).join('') + '</div>' +
          '</fieldset>' +
          '<p class="cs-skin-studio__note">Bu alan kozmetik ürün seçimini kişiselleştirmek içindir; tıbbi teşhis veya tedavi tavsiyesi değildir.</p>' +
          '<div class="cs-skin-studio__actions">' +
            '<button class="cs-skin-studio__save" type="button" id="saveSkinBtnMobile" data-save-skin>Profili Kaydet</button>' +
            '<a class="cs-skin-studio__link" href="/account/routines/">Akıllı Rutin</a>' +
          '</div>' +
        '</form>' +
        skinProductsCarouselHtml(products, has) +
      '</section>';
    bindSkinChipUi(el);
    animateSkinRing(el);
    initSkinProductsRail(el);
  }
  function skinProductsCarouselHtml(products, hasProfile) {
    if (!products || !products.length) {
      return '<section class="cs-skin-products cs-skin-products--v3 is-empty" aria-label="Profiline göre ürünler">' +
        '<header class="cs-skin-rail__head">' +
          '<div><span class="cs-skin-rail__kicker">Senin için</span><h3>Profiline göre ürünler</h3></div>' +
        '</header>' +
        emptyState('Profil tamamlanınca öneriler görünür.', 'Aşağıdaki seçimleri kaydederek kişiselleştirilmiş ürün önerileri alın.', null) +
      '</section>';
    }
    var lede = hasProfile
      ? 'Cilt tipin ve hedeflerine göre seçilmiş bakım ürünleri.'
      : 'Profilini tamamladıkça öneriler kişiselleşir.';
    var cards = products.map(function (raw, i) {
      var p = normalizeProduct(raw) || {};
      var slug = p.product_slug || p.id || '';
      var stock = liveStockState(p, {});
      if (isDesignPreview() && stock.className === 'is-unknown') {
        stock = { sellable: true, label: 'Stokta', className: 'is-in', buttonLabel: 'Sepete ekle' };
      }
      var badge = '';
      if (!stock.sellable) {
        badge = '<em class="cs-skin-slide__badge ' + escapeHtml(stock.className) + '">' +
          escapeHtml(stock.className === 'is-out' ? 'Tükendi' : 'Stok kontrolü') +
        '</em>';
      }
      var cartBtn = stock.sellable
        ? '<button class="cs-skin-slide__cart" type="button" data-add-product-cart="' + escapeHtml(slug) + '" aria-label="Sepete ekle">+</button>'
        : '<a class="cs-skin-slide__cart cs-skin-slide__cart--link" href="' + escapeHtml(p.url || '/allproducts.html') + '" aria-label="Ürünü incele">→</a>';
      return '<article class="cs-skin-slide" style="--cs-skin-i:' + i + '">' +
        '<a class="cs-skin-slide__media" href="' + escapeHtml(p.url || '/allproducts.html') + '">' +
          '<img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name || 'Ürün') + '" loading="lazy">' +
          badge +
        '</a>' +
        '<div class="cs-skin-slide__body">' +
          '<span class="cs-skin-slide__brand">' + escapeHtml(p.brand || 'COSMOSKIN') + '</span>' +
          '<a class="cs-skin-slide__title" href="' + escapeHtml(p.url || '/allproducts.html') + '">' + escapeHtml(p.product_name || 'Ürün') + '</a>' +
          '<span class="cs-skin-slide__cat">' + escapeHtml(p.category || 'K-Beauty') + '</span>' +
          '<div class="cs-skin-slide__row">' +
            '<b>' + escapeHtml(formatMoney(p.price || 0)) + '</b>' +
            cartBtn +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
    return '<section class="cs-skin-products cs-skin-products--v3" aria-label="Profiline göre ürünler">' +
      '<header class="cs-skin-rail__head">' +
        '<div class="cs-skin-rail__titles">' +
          '<span class="cs-skin-rail__kicker">Senin için seçildi</span>' +
          '<h3>Profiline göre ürünler</h3>' +
          '<p>' + escapeHtml(lede) + '</p>' +
        '</div>' +
        '<div class="cs-skin-rail__controls">' +
          '<button type="button" class="cs-skin-rail__nav" data-skin-rail-dir="-1" aria-label="Önceki ürünler">' +
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<button type="button" class="cs-skin-rail__nav" data-skin-rail-dir="1" aria-label="Sonraki ürünler">' +
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<a class="cs-skin-rail__all" href="/allproducts.html">Tümünü gör</a>' +
        '</div>' +
      '</header>' +
      '<div class="cs-skin-rail__track" data-skin-rail-track tabindex="0">' + cards + '</div>' +
    '</section>';
  }
  function initSkinProductsRail(root) {
    var track = root && root.querySelector('[data-skin-rail-track]');
    if (!track || track.dataset.bound === '1') return;
    track.dataset.bound = '1';
    var rail = track.closest('.cs-skin-products--v3');
    if (rail) {
      rail.querySelectorAll('[data-skin-rail-dir]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dir = Number(btn.getAttribute('data-skin-rail-dir')) || 1;
          var amount = Math.max(200, Math.floor(track.clientWidth * 0.72));
          track.scrollBy({ left: dir * amount, behavior: 'smooth' });
        });
      });
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    window.setTimeout(function () {
      if (!track.isConnected || track.scrollWidth <= track.clientWidth + 8) return;
      track.scrollBy({ left: 48, behavior: 'smooth' });
      window.setTimeout(function () {
        if (track.isConnected) track.scrollBy({ left: -48, behavior: 'smooth' });
      }, 480);
    }, 650);
  }
  function animateSkinRing(root) {
    var ring = root && root.querySelector('.cs-skin-studio__ring');
    var progress = ring && ring.querySelector('.cs-skin-studio__ring-progress');
    if (!ring || !progress) return;
    var complete = Math.max(0, Math.min(100, Number(ring.style.getPropertyValue('--cs-skin-complete')) || 0));
    var radius = 15;
    var circumference = 2 * Math.PI * radius;
    progress.style.strokeDasharray = String(circumference);
    progress.style.strokeDashoffset = String(circumference);
    ring.style.setProperty('--cs-ring-circ', String(circumference));
    ring.style.setProperty('--cs-ring-offset', String(circumference * (1 - complete / 100)));
    ring.classList.remove('is-animated');
    var finish = function () {
      progress.style.strokeDashoffset = String(circumference * (1 - complete / 100));
      ring.classList.add('is-animated');
    };
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(finish);
    });
  }
  function syncSkinRingFromForm(root) {
    var form = root && root.querySelector('#skinForm');
    var ring = root && root.querySelector('.cs-skin-studio__ring');
    var progress = ring && ring.querySelector('.cs-skin-studio__ring-progress');
    if (!form || !ring || !progress) return;
    var parts = 0;
    if (form.elements.skin_type && form.elements.skin_type.value) parts += 1;
    if (form.elements.skin_sensitivity && form.elements.skin_sensitivity.value) parts += 1;
    if (form.elements.routine_goal && form.elements.routine_goal.value) parts += 1;
    if (form.elements.routine_style && form.elements.routine_style.value) parts += 1;
    var pct = Math.round((parts / 4) * 100);
    var radius = 15;
    var circumference = 2 * Math.PI * radius;
    ring.style.setProperty('--cs-skin-complete', String(pct));
    ring.setAttribute('aria-valuenow', String(pct));
    var strong = ring.querySelector('strong');
    if (strong) strong.textContent = pct + '%';
    progress.style.strokeDasharray = String(circumference);
    progress.style.strokeDashoffset = String(circumference * (1 - pct / 100));
    ring.classList.add('is-animated');
  }
  function bindSkinChipUi(root) {
    if (!root || root.dataset.skinChipBound === '1') return;
    root.dataset.skinChipBound = '1';
    root.addEventListener('change', function (e) {
      var input = e.target.closest('input');
      if (!input || !input.closest('.cs-skin-chip')) return;
      if (input.type === 'radio') {
        var name = input.name;
        $$('input[name="' + name + '"]', root).forEach(function (el) {
          var chip = el.closest('.cs-skin-chip');
          if (chip) chip.classList.toggle('is-selected', el.checked);
        });
      } else if (input.type === 'checkbox') {
        var checkChip = input.closest('.cs-skin-chip');
        if (checkChip) checkChip.classList.toggle('is-selected', input.checked);
      }
      syncSkinRingFromForm(root);
    });
  }
  function pointEventLabel(row) {
    var type = String(row.event_type || '').toLowerCase();
    if (LOYALTY_POINT_EVENT_LABELS[type]) return LOYALTY_POINT_EVENT_LABELS[type];
    return row.reason || row.description || 'Puan hareketi';
  }
  function pointStatusLabel(row) {
    var status = String(row.status || 'available').toLowerCase();
    return LOYALTY_POINT_STATUS_LABELS[status] || (row.status ? String(row.status) : 'Kayıt');
  }
  function pointStatusClass(row) {
    var status = String(row.status || 'available').toLowerCase();
    if (status === 'pending') return 'is-pending';
    if (status === 'reversed' || status === 'expired') return 'is-reversed';
    return 'is-available';
  }
  function pointLedgerIconName(row) {
    var type = String(row.event_type || '').toLowerCase();
    var status = String(row.status || '').toLowerCase();
    if (status === 'pending') return 'clock';
    if (type === 'redemption') return 'ticket';
    if (type === 'birthday') return 'crown';
    if (type.indexOf('reversal') !== -1 || status === 'reversed') return 'return';
    return 'sparkle';
  }
  function resolvePointOrderNo(p, orderById, orderByNumber) {
    if (p.order_number) return String(p.order_number);
    if (p.order_id && orderById[p.order_id]) return safeOrderNumber(orderById[p.order_id]);
    var blob = String(p.description || p.reason || '');
    var match = blob.match(/CS-[\w-]+/i);
    if (match) {
      var key = match[0].toUpperCase();
      if (orderByNumber[key]) return safeOrderNumber(orderByNumber[key]);
      return key;
    }
    return '';
  }
  function pointHistoryTable(ledger) {
    if (!ledger.length) {
      return '<section class="cs-ledger cs-ledger--v2" data-batch4-marker="BATCH4_LOYALTY_HISTORY">' +
        '<header class="cs-ledger__head"><div><span class="cs-ledger__kicker">Hareketler</span><h2>Puan geçmişi</h2></div></header>' +
        emptyState('Puan hareketi bulunmuyor.', 'Siparişler tamamlandığında puan hareketleri burada görünür.', null) +
      '</section>';
    }
    var orderById = {};
    var orderByNumber = {};
    asArray(state.summary.orders).forEach(function (o) {
      if (!o) return;
      if (o.id) orderById[o.id] = o;
      var no = safeOrderNumber(o);
      if (no) orderByNumber[String(no).toUpperCase()] = o;
    });
    var sorted = ledger.slice().sort(function (a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    var items = sorted.map(function (p, i) {
      var delta = finiteNumber(p.points_delta ?? p.points, 0);
      var earn = delta >= 0;
      var deltaText = (earn ? '+' : '') + numberFmt.format(delta) + ' P';
      var orderNo = resolvePointOrderNo(p, orderById, orderByNumber);
      var statusClass = pointStatusClass(p);
      var metaParts = [formatDate(p.created_at, true)];
      if (orderNo) metaParts.push(orderNo);
      return '<li class="cs-ledger__item ' + statusClass + (earn ? ' is-earn' : ' is-spend') + '" style="--cs-ledger-i:' + i + '">' +
        '<span class="cs-ledger__rail" aria-hidden="true"><span class="cs-ledger__dot">' + hubIconSvg(pointLedgerIconName(p)) + '</span></span>' +
        '<div class="cs-ledger__body">' +
          '<div class="cs-ledger__top">' +
            '<strong class="cs-ledger__delta">' + escapeHtml(deltaText) + '</strong>' +
            '<span class="cs-ledger__status ' + statusClass + '">' + escapeHtml(pointStatusLabel(p)) + '</span>' +
          '</div>' +
          '<p class="cs-ledger__title">' + escapeHtml(pointEventLabel(p)) + '</p>' +
          '<p class="cs-ledger__meta">' +
            '<time datetime="' + escapeHtml(p.created_at || '') + '">' + escapeHtml(metaParts[0] || '') + '</time>' +
            (orderNo ? '<span class="cs-ledger__sep" aria-hidden="true">·</span><span class="cs-ledger__order">' + escapeHtml(orderNo) + '</span>' : '') +
          '</p>' +
        '</div></li>';
    }).join('');
    return '<section class="cs-ledger cs-ledger--v2" data-batch4-marker="BATCH4_LOYALTY_HISTORY" aria-label="Puan geçmişi">' +
      '<header class="cs-ledger__head">' +
        '<div><span class="cs-ledger__kicker">Hareketler</span><h2>Puan geçmişi</h2></div>' +
        '<em class="cs-ledger__count">' + sorted.length + ' kayıt</em>' +
      '</header>' +
      '<ol class="cs-ledger__list">' + items + '</ol>' +
    '</section>';
  }
  function pointMaintenanceNote(l) {
    if (!l.maintenanceNoteRequired) return '';
    return '<p class="cs-point-maintenance-note">Önceki siparişleriniz için puan yansıtması kontrol ediliyor olabilir. Puan geçmişinizde eksik gördüğünüz bir işlem varsa destek ekibimizle iletişime geçebilirsiniz.</p>';
  }
  function renderClub() {
    var el = $('#clubPanel'); if (!el) return; var l = loyalty(); var ledger = asArray(state.summary.points?.ledger);
    // Copy source: /cosmoskin-club.html level cards — keep account click-details in sync.
    var tiers = [
      {
        key: 'essential',
        name: 'Essential',
        range: 'Başlangıç',
        title: 'Başlangıç seviyesi',
        requirement: 'COSMOSKIN hesabı oluşturan herkes.',
        benefits: [
          'İlk alışverişte %10 hoş geldin indirimi',
          'Minimum 1.000 TL sepet',
          'Üyelikten sonra 30 gün geçerli',
          'Kampanyasız ve indirimsiz ürünlerde geçerli',
          'Hesabım’dan sipariş geçmişi takibi',
          'Favorilere ürün ekleme',
          'Stok gelince e-posta bildirimi',
          'Akıllı rutin sonucunu hesapta saklama',
          'Doğum günü avantajı: 100 TL kupon, minimum 1.000 TL sepet'
        ]
      },
      {
        key: 'signature',
        name: 'Signature',
        range: 'Tekrar alışveriş',
        title: 'Tekrar alışveriş seviyesi',
        requirement: 'Son 12 ayda 5.000 TL alışveriş veya 3 tamamlanmış sipariş.',
        benefits: [
          'Yeni ürün ve kampanyalara 24 saat erken erişim',
          'Ücretsiz kargo eşiği 2.500 TL yerine 2.000 TL',
          'Ayda 1 kez %5 özel kod',
          '1.500 TL üzeri siparişte seçili mini ürün veya tester',
          'Doğum günü avantajı: 150 TL kupon, minimum 1.500 TL sepet',
          'Rutin tamamlama önerisi',
          'Ayda 1 gün çift puan'
        ]
      },
      {
        key: 'elite',
        name: 'Elite',
        range: 'Premium sadakat',
        title: 'Premium sadakat seviyesi',
        requirement: 'Son 12 ayda 15.000 TL alışveriş veya 6 tamamlanmış sipariş.',
        benefits: [
          'Yeni ürünlere 48 saat erken erişim',
          'Ayda 1 ücretsiz kargo hakkı veya 1.500 TL üzeri ücretsiz kargo',
          'Seçili dönemlerde %8-10 özel kod',
          '2.500 TL üzeri siparişte seçili özel mini ürün',
          'Öncelikli destek',
          'Akıllı rutin sonucuna göre kişisel öneri',
          'Doğum günü avantajı: kupon ve seçili dönemlerde mini ürün hediyesi',
          'Yeni gelen Kore markalarına lansman önceliği'
        ]
      }
    ];
    var tierStacks = tiers.map(function (t) {
      return '<div class="cs-tier-stack cs-tier-stack--' + t.key + '" data-tier-stack="' + t.key + '">' +
        '<button class="cs-tier-card cs-tier-card--' + t.key + '" type="button" data-club-tier="' + t.key + '" aria-expanded="false" aria-controls="clubTierDetail-' + t.key + '">' +
          '<span class="cs-tier-card__name">' + escapeHtml(t.name) + '</span>' +
          '<strong class="cs-tier-card__range">' + escapeHtml(t.range) + '</strong>' +
          '<em class="cs-tier-card__hint" aria-hidden="true">Detay</em>' +
        '</button>' +
        '<div class="cs-tier-drawer cs-tier-drawer--' + t.key + '" id="clubTierDetail-' + t.key + '" data-club-tier-detail="' + t.key + '" role="region" aria-hidden="true">' +
          '<div class="cs-tier-drawer__clip">' +
            '<div class="cs-tier-drawer__inner">' +
              '<p class="cs-tier-detail__kicker">' + escapeHtml(t.name) + '</p>' +
              '<h3>' + escapeHtml(t.title) + '</h3>' +
              '<p class="cs-tier-detail__req">' + escapeHtml(t.requirement) + '</p>' +
              '<ul>' + t.benefits.map(function (b) { return '<li>' + escapeHtml(b) + '</li>'; }).join('') + '</ul>' +
              '<p class="cs-tier-detail__note">Puanlar nakde çevrilemez. İade veya iptal edilen siparişlerde ilgili puanlar geri alınabilir; kargo tutarı puan hesabına dahil edilmez. Avantajlar dönemsel kampanya koşullarına, stok durumuna ve minimum sepet tutarına bağlı olarak değişebilir.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    var history = pointHistoryTable(ledger);
    var maintenanceNote = pointMaintenanceNote(l);
    el.innerHTML = panelChrome('COSMOSKIN Club', 'Seviyenizi, puan geçmişinizi ve avantajlarınızı takip edin.') +
      '<section class="cs-loyalty-detail"><article class="cs-loyalty-summary cs-loyalty-summary--club cs-loyalty-summary--' + escapeHtml(l.key) + '"><strong>' + escapeHtml(l.label.replace(' Üye','')) + '</strong><p>Mevcut harcama: ' + escapeHtml(formatMoney(l.spend)) + '. ' + (l.next ? 'Sonraki seviye: ' + escapeHtml(l.next) + '.' : 'En üst seviyedesiniz.') + '</p><div class="cs-loyalty-progress"><span style="width:' + l.progress + '%"></span></div><div class="cs-loyalty-metrics"><span>Kullanılabilir<b>' + escapeHtml(numberFmt.format(l.available)) + ' P</b></span><span>Bekleyen<b>' + escapeHtml(numberFmt.format(l.pending)) + ' P</b></span><span>İade/İptal<b>' + escapeHtml(numberFmt.format(l.reversed)) + ' P</b></span></div><small>Puan hesabında kargo hariç ürün net tutarı esas alınır.</small></article><div class="cs-tier-grid cs-tier-grid--premium">' + tierStacks + '</div>' + maintenanceNote + history + '</section>';
  }
  function renderCoupons() {
    var el = $('#couponsPanel'); if (!el) return;
    var user = state.summary?.user || {};
    var available = activeCoupons();
    var used = usedCoupons();
    var expired = expiredCoupons();
    function ticketCard(c, i, statusKey) {
      var statusLabel = statusKey === 'used' ? 'Kullanılmış' : statusKey === 'expired' ? 'Süresi doldu' : 'Kullanılabilir';
      var statusClass = statusKey === 'used' ? 'is-used' : statusKey === 'expired' ? 'is-expired' : 'is-available';
      var expiry = couponExpiryLabel(c);
      var copyable = statusKey === 'available' && c.copyable !== false;
      return '<article class="cs-ticket ' + statusClass + '" style="--cs-ticket-i:' + i + '">' +
        '<div class="cs-ticket__notch" aria-hidden="true"></div>' +
        '<div class="cs-ticket__body">' +
          '<div class="cs-ticket__top">' +
            '<span class="cs-ticket__status">' + escapeHtml(statusLabel) + '</span>' +
            (expiry ? '<span class="cs-ticket__expiry">' + escapeHtml(expiry) + '</span>' : '') +
          '</div>' +
          '<strong class="cs-ticket__code">' + escapeHtml(c.code) + '</strong>' +
          '<p class="cs-ticket__title">' + escapeHtml(c.title || c.code) + '</p>' +
          (c.description ? '<p class="cs-ticket__desc">' + escapeHtml(c.description) + '</p>' : '') +
          (c.scope_label ? '<p class="cs-ticket__scope">' + escapeHtml(c.scope_label) + '</p>' : '') +
          '<div class="cs-ticket__actions">' +
            (copyable
              ? '<button class="cs-ticket__btn cs-ticket__btn--primary" type="button" data-copy-coupon="' + escapeHtml(c.code) + '">Kodu kopyala</button>' +
                '<a class="cs-ticket__btn" href="/checkout.html">Ödemede kullan</a>'
              : '<span class="cs-ticket__hint">' + (statusKey === 'used' ? 'Bu kupon kullanıldı' : 'Bu kupon artık geçerli değil') + '</span>') +
          '</div>' +
        '</div></article>';
    }
    function panelList(items, statusKey, emptyTitle, emptyText) {
      if (!items.length) return emptyState(emptyTitle, emptyText, null);
      return '<div class="cs-coupons__list">' + items.map(function (c, i) { return ticketCard(c, i, statusKey); }).join('') + '</div>';
    }
    var birthdayReminder = '';
    if (!user.birthday) {
      birthdayReminder = '<aside class="cs-coupons__note cs-coupons__note--birthday">' +
        '<span class="cs-coupons__note-kicker">Doğum günü avantajı</span>' +
        '<h3>Doğum tarihinizi ekleyin</h3>' +
        '<p>Doğum gününüzde BIRTHDAY10 kuponunuz burada görünür. Kupon otomatik uygulanmaz; ödeme adımında manuel girilir.</p>' +
        '<a class="cs-ticket__btn cs-ticket__btn--primary" data-tab-link="profile" href="/account/profile.html?tab=profile">Doğum tarihi ekle</a>' +
      '</aside>';
    } else if (!isBirthday10Eligible() && !birthdayCouponUsedThisYear()) {
      birthdayReminder = '<aside class="cs-coupons__note cs-coupons__note--birthday">' +
        '<span class="cs-coupons__note-kicker">Doğum günü avantajı</span>' +
        '<h3>Doğum gününüzde aktif olur</h3>' +
        '<p>BIRTHDAY10 yalnızca doğum gününüzde görünür ve ödeme ekranında manuel kullanılır. Takvim yılında bir kez geçerlidir.</p>' +
      '</aside>';
    }
    el.innerHTML = panelChrome('Kuponlarım', 'Kuponlar ödeme ekranında manuel uygulanır; otomatik uygulanmaz.') +
      '<section class="cs-coupons cs-coupons--v2" data-coupon-tabs>' +
        '<div class="cs-coupons__filters" role="tablist" aria-label="Kupon durumu">' +
          '<button type="button" class="is-active" role="tab" aria-selected="true" data-coupon-filter="available">Kullanılabilir<em>' + available.length + '</em></button>' +
          '<button type="button" role="tab" aria-selected="false" data-coupon-filter="used">Kullanılmış<em>' + used.length + '</em></button>' +
          '<button type="button" role="tab" aria-selected="false" data-coupon-filter="expired">Süresi dolan<em>' + expired.length + '</em></button>' +
        '</div>' +
        '<div class="cs-coupons__panels">' +
          '<div data-coupon-panel="available" role="tabpanel">' + panelList(available, 'available', 'Kullanılabilir kupon yok.', 'Uygun kuponlar hesabınızda aktif olduğunda burada görünür.') + '</div>' +
          '<div data-coupon-panel="used" role="tabpanel" hidden>' + panelList(used, 'used', 'Kullanılmış kupon yok.', '') + '</div>' +
          '<div data-coupon-panel="expired" role="tabpanel" hidden>' + panelList(expired, 'expired', 'Süresi dolan kupon yok.', '') + '</div>' +
        '</div>' +
        birthdayReminder +
      '</section>';
  }
  function renderProfile() {
    var el = $('#profilePanel'); if (!el) return;
    var user = state.summary.user || {};
    var locked = Boolean(user.birth_date_locked && user.birthday);
    var complete = profileCompletionPercent(user);
    var mono = initials(user);
    var fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Profiliniz';
    var since = user.created_at ? formatDate(user.created_at) : '';
    var filled = [user.first_name, user.last_name, user.phone, user.birthday, user.email].filter(function (v) { return String(v || '').trim(); }).length;
    var birthdayHelp = locked
      ? 'Doğum tarihiniz kilitlidir. Doğum tarihi bir kez düzeltilebilir; güvenlik nedeniyle sonraki değişiklikler destek ekibiyle yapılır.'
      : (user.birthday
        ? 'Doğum tarihinizi bir kez daha düzeltebilirsiniz. Doğum tarihi bir kez düzeltilebilir; güvenlik nedeniyle sonraki değişiklikler destek ekibiyle yapılır.'
        : 'Doğum tarihin, doğum günü avantajları ve kişiselleştirme için kullanılır. İlk kayıt sonrası bir kez düzeltme hakkınız bulunur.');
    var birthdayAttrs = locked
      ? 'readonly aria-readonly="true" disabled aria-disabled="true"'
      : 'max="' + escapeHtml(todayIsoDate()) + '"';
    var USER_ICO = '<svg class="cs-profile-studio__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.2" r="3.4" stroke="currentColor" stroke-width="1.55"/><path d="M5.2 18.6c1.4-3.1 3.8-4.6 6.8-4.6s5.4 1.5 6.8 4.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>';
    var LOCK_ICO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.2" y="10.4" width="13.6" height="9.2" rx="2" stroke="currentColor" stroke-width="1.55"/><path d="M8.2 10.4V8.2a3.8 3.8 0 0 1 7.6 0v2.2" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>';
    el.innerHTML = panelChrome('Hesap Bilgilerim', 'Ad, soyad, telefon ve doğum günü bilgileriniz gerçek hesap profilinize kaydedilir.') +
      '<section class="cs-profile-studio">' +
        '<article class="cs-profile-studio__hero">' +
          '<div class="cs-profile-studio__hero-top">' +
            '<span class="cs-profile-studio__avatar" aria-hidden="true"><em>' + escapeHtml(mono) + '</em></span>' +
            '<div class="cs-profile-studio__ring" style="--cs-profile-complete:' + complete + ';--cs-ring-offset:' + (100 - complete) + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + complete + '" aria-label="Profil tamamlanma ' + complete + ' yüzde">' +
              '<svg class="cs-profile-studio__ring-svg" viewBox="0 0 36 36" aria-hidden="true">' +
                '<defs><linearGradient id="csProfileRingGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#d4b07a"/><stop offset="100%" stop-color="#b58a4a"/></linearGradient></defs>' +
                '<circle class="cs-profile-studio__ring-track" cx="18" cy="18" r="15" fill="none"/>' +
                '<circle class="cs-profile-studio__ring-progress" cx="18" cy="18" r="15" fill="none" stroke="url(#csProfileRingGrad)" stroke-dasharray="100" stroke-dashoffset="' + (100 - complete) + '"/>' +
              '</svg>' +
              '<div class="cs-profile-studio__ring-label"><strong>' + complete + '%</strong><span>dolu</span></div>' +
            '</div>' +
          '</div>' +
          '<span class="cs-profile-studio__kicker">Profil kartı</span>' +
          '<h2>' + escapeHtml(fullName) + '</h2>' +
          '<p>Kimlik ve iletişim bilgilerinizi güncelleyin. E-posta hesabınızla bağlıdır; doğum tarihi güvenlik nedeniyle sınırlı şekilde değiştirilebilir.</p>' +
          '<footer class="cs-profile-studio__meta">' +
            '<span>' + filled + ' / 5 alan · ' + escapeHtml(user.email || 'E-posta yok') + '</span>' +
            (since ? '<span>Üye · ' + escapeHtml(since) + '</span>' : '') +
          '</footer>' +
        '</article>' +
        '<form class="cs-profile-studio__form" id="profileForm" novalidate>' +
          '<fieldset class="cs-profile-block" style="--cs-prof-i:0">' +
            '<legend><span>01</span> Kimlik</legend>' +
            '<p class="cs-profile-block__lede">Sipariş ve faturalarda görünen adınız</p>' +
            '<div class="cs-profile-fields cs-profile-fields--2">' +
              '<label class="cs-profile-field"><span>Ad</span><input class="cs-input" name="first_name" value="' + escapeHtml(user.first_name || '') + '" autocomplete="given-name" required></label>' +
              '<label class="cs-profile-field"><span>Soyad</span><input class="cs-input" name="last_name" value="' + escapeHtml(user.last_name || '') + '" autocomplete="family-name" required></label>' +
            '</div>' +
          '</fieldset>' +
          '<fieldset class="cs-profile-block" style="--cs-prof-i:1">' +
            '<legend><span>02</span> İletişim</legend>' +
            '<p class="cs-profile-block__lede">Giriş e-postası sabit · telefon isteğe bağlı</p>' +
            '<div class="cs-profile-fields">' +
              '<label class="cs-profile-field cs-profile-field--readonly"><span>E-posta</span><input class="cs-input cs-input--readonly" name="email" type="email" readonly value="' + escapeHtml(user.email || '') + '" aria-readonly="true"></label>' +
              '<label class="cs-profile-field"><span>Telefon</span><input class="cs-input" name="phone" value="' + escapeHtml(user.phone || '') + '" autocomplete="tel" inputmode="tel" placeholder="İsteğe bağlı"></label>' +
            '</div>' +
          '</fieldset>' +
          '<fieldset class="cs-profile-block" style="--cs-prof-i:2">' +
            '<legend><span>03</span> Doğum günü</legend>' +
            '<p class="cs-profile-block__lede">Club doğum günü avantajı için kullanılır</p>' +
            '<label class="cs-profile-field cs-profile-field--birthday' + (locked ? ' is-locked' : '') + '">' +
              '<span>Doğum tarihi' + (locked ? ' <em class="cs-profile-field__lock">' + LOCK_ICO + 'Kilitli</em>' : '') + '</span>' +
              '<input class="cs-input cs-input--date' + (locked ? ' cs-input--locked' : '') + '" name="birthday" type="date" value="' + escapeHtml(user.birthday || '') + '" ' + birthdayAttrs + ' aria-describedby="profileBirthdayHelp">' +
            '</label>' +
            '<p class="cs-profile-field__help" id="profileBirthdayHelp">' + escapeHtml(birthdayHelp) + '</p>' +
          '</fieldset>' +
          '<p class="cs-profile-studio__note">Bu bilgiler yalnızca hesap yönetimi ve kişiselleştirme için kullanılır; üçüncü taraflarla pazarlama amacıyla paylaşılmaz.</p>' +
          '<div class="cs-form-status" id="profileSaveStatus" role="status" aria-live="polite"></div>' +
          '<div class="cs-profile-studio__actions">' +
            '<button class="cs-profile-studio__save" type="button" id="saveProfileBtn" data-save-profile>Bilgileri Kaydet</button>' +
            '<button class="cs-profile-studio__link" type="button" data-tab-link="security">Güvenlik ayarları</button>' +
          '</div>' +
        '</form>' +
      '</section>';
    requestAnimationFrame(function () {
      var ring = el.querySelector('.cs-profile-studio__ring-progress');
      if (ring) {
        ring.style.strokeDasharray = '100';
        ring.style.strokeDashoffset = String(100 - complete);
      }
    });
  }
  function renderAddresses() {
    var el = $('#addressesPanel'); if (!el) return; var addresses = state.summary.addresses;
    var orphanModal = document.body.querySelector(':scope > #addressModal');
    if (orphanModal) orphanModal.remove();
    document.body.classList.remove('cs-address-modal-open');
    var cards = addresses.length ? '<div class="cs-address-grid">' + addresses.map(function (a) { var recipient = [a.recipient_first_name || a.first_name, a.recipient_last_name || a.last_name].filter(Boolean).join(' '); var location = [a.neighborhood, a.district, a.city].filter(Boolean).join(' / '); return '<article class="cs-address-card"><div class="cs-address-head"><h3>' + escapeHtml(a.title || 'Adres') + '</h3><span>' + escapeHtml(addressTypeLabel(a.address_type || a.type)) + '</span></div><p>' + escapeHtml([a.address_line || a.address, location, a.postal_code || a.postalCode].filter(Boolean).join(', ')) + '</p><small>' + escapeHtml(recipient || 'Alıcı bilgisi') + (a.phone ? ' · ' + escapeHtml(a.phone) : '') + '</small>' + (a.is_default ? '<em class="cs-address-default">Varsayılan</em>' : '') + '<div class="cs-address-actions"><button class="cs-mini-btn" type="button" data-edit-address="' + escapeHtml(a.id) + '">Düzenle</button>' + (!a.is_default ? '<button class="cs-mini-btn" type="button" data-default-address="' + escapeHtml(a.id) + '">Varsayılan Yap</button>' : '') + '<button class="cs-mini-btn" type="button" data-delete-address="' + escapeHtml(a.id) + '">Sil</button></div></article>'; }).join('') + '</div>' : '<div class="cs-empty"><strong>Kayıtlı adresiniz bulunmuyor.</strong><p>Ödeme ekranında hızlı kullanım için teslimat ve fatura adresi ekleyebilirsiniz.</p><button class="cs-pill-btn" type="button" data-open-address-modal>Adres Ekle</button></div>';
    el.innerHTML = panelChrome('Adreslerim', 'Teslimat ve fatura adreslerinizi yönetin.', '<button class="cs-pill-btn" type="button" id="addAddressBtn">Yeni Adres Ekle</button>') + cards + addressModalHtml();
  }
  function addressTypeLabel(type) { return type === 'billing' ? 'Fatura' : type === 'both' ? 'Teslimat + Fatura' : 'Teslimat'; }
  function addressModalHtml() {
    var CLOSE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>';
    function field(label, control, extraClass) {
      return '<label class="' + (extraClass || '') + '"><span>' + label + '</span>' + control + '</label>';
    }
    return '<div class="cs-address-modal cs-address-modal--v2" id="addressModal" hidden>' +
      '<div class="cs-address-modal__card" role="dialog" aria-modal="true" aria-labelledby="addressModalTitle">' +
        '<form class="cs-address-form" id="addressForm">' +
          '<input type="hidden" name="id">' +
          '<div class="cs-address-modal__handle" aria-hidden="true"><span></span></div>' +
          '<header class="cs-address-modal__head">' +
            '<div class="cs-address-modal__titles">' +
              '<span class="cs-address-modal__kicker">Adreslerim</span>' +
              '<h2 id="addressModalTitle">Adres formu</h2>' +
            '</div>' +
            '<button type="button" class="cs-address-modal__close" id="addressCancelBtn" aria-label="Kapat">' + CLOSE + '</button>' +
          '</header>' +
          '<div class="cs-address-modal__body">' +
            '<div class="cs-form-grid cs-form-grid--address">' +
              field('Adres başlığı', '<input name="title" required placeholder="Ev / İş" autocomplete="organization">') +
              field('Adres tipi', '<select name="address_type"><option value="shipping">Teslimat</option><option value="billing">Fatura</option><option value="both">Teslimat + Fatura</option></select>') +
              field('Ad', '<input name="first_name" required autocomplete="given-name">') +
              field('Soyad', '<input name="last_name" required autocomplete="family-name">') +
              field('Telefon', '<input name="phone" required inputmode="tel" autocomplete="tel">', 'span-2') +
              field('İl', '<input name="city" required autocomplete="address-level1">') +
              field('İlçe', '<input name="district" required autocomplete="address-level2">') +
              field('Mahalle', '<input name="neighborhood" autocomplete="address-level3">') +
              field('Posta kodu', '<input name="postal_code" maxlength="5" inputmode="numeric" autocomplete="postal-code">') +
              field('Açık adres', '<textarea name="address_line" required rows="3" placeholder="Sokak, bina no, daire"></textarea>', 'span-2') +
              '<label class="cs-address-check span-2">' +
                '<input type="checkbox" name="is_default">' +
                '<span class="cs-address-check__box" aria-hidden="true">' +
                  '<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 12.5 10 16l7.5-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '</span>' +
                '<span class="cs-address-check__copy">' +
                  '<strong>Varsayılan adres yap</strong>' +
                  '<em>Teslimatlarda bu adres öncelikli kullanılsın</em>' +
                '</span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<footer class="cs-address-modal__foot">' +
            '<button class="cs-address-modal__btn" type="button" id="addressCancelBtn2">Vazgeç</button>' +
            '<button class="cs-address-modal__btn cs-address-modal__btn--primary" type="submit">Adresi Kaydet</button>' +
          '</footer>' +
        '</form>' +
      '</div>' +
    '</div>';
  }
  function renderPayments() {
    var el = $('#paymentsPanel'); if (!el) return;
    var SHIELD = '<svg class="cs-pay-studio__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.8 5.6 6.2v5.4c0 4.1 2.7 7.1 6.4 8.6 3.7-1.5 6.4-4.5 6.4-8.6V6.2L12 3.8Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/><path d="M9.6 12.2h4.8M12 9.8v4.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>';
    var CARD_ICO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.6" y="6.8" width="16.8" height="10.8" rx="2.2" stroke="currentColor" stroke-width="1.55"/><path d="M3.6 10.4h16.8M7.4 14.4h3.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/></svg>';
    var BANK_ICO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.2 10.2 12 5.6l7.8 4.6M5.4 10.2v7.2M18.6 10.2v7.2M3.6 17.4h16.8M9 13.2v4.2M12 13.2v4.2M15 13.2v4.2" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var logos = '<div class="cs-pay-studio__logos" aria-label="Desteklenen ödeme markaları">' +
      '<span><img src="/assets/img/payments/iyzico-monochrome.svg" alt="iyzico" loading="lazy" decoding="async"></span>' +
      '<span><img src="/assets/img/payments/visa.svg" alt="Visa" loading="lazy" decoding="async"></span>' +
      '<span><img src="/assets/img/payments/mastercard.svg" alt="Mastercard" loading="lazy" decoding="async"></span>' +
      '<span><img src="/assets/img/payments/troy.svg" alt="Troy" loading="lazy" decoding="async"></span>' +
    '</div>';
    el.innerHTML = panelChrome('Ödeme Tercihlerim', 'Kart ve havale seçenekleri ödeme adımında güvenli altyapı üzerinden sunulur.') +
      '<section class="cs-pay-studio">' +
        '<article class="cs-pay-studio__hero">' +
          '<div class="cs-pay-studio__hero-top">' +
            '<span class="cs-pay-studio__icon" aria-hidden="true">' + SHIELD + '</span>' +
            '<span class="cs-pay-studio__badge">Kart saklanmaz</span>' +
          '</div>' +
          '<span class="cs-pay-studio__kicker">Güvenli ödeme</span>' +
          '<h2>Hesapta kart tutulmaz</h2>' +
          '<p>COSMOSKIN kart numarası, CVV veya son kullanma tarihi saklamaz. Kart ödemesi ödeme adımında iyzico üzerinden 3D Secure ile tamamlanır. Kayıtlı kart yönetimi bu panelde sunulmaz.</p>' +
          logos +
        '</article>' +
        '<section class="cs-pay-methods" aria-label="Ödeme yöntemleri">' +
          '<article class="cs-pay-method" style="--cs-pay-i:0">' +
            '<header class="cs-pay-method__head">' +
              '<span class="cs-pay-method__icon" aria-hidden="true">' + CARD_ICO + '</span>' +
              '<div><em>01</em><h3>Kredi / banka kartı</h3></div>' +
            '</header>' +
            '<p>Visa, Mastercard ve Troy ile ödeme; işlem iyzico güvenli ödeme ekranında gerçekleşir.</p>' +
            '<ul class="cs-pay-method__steps">' +
              '<li><span>1</span>Ödeme adımında kartı seçin</li>' +
              '<li><span>2</span>iyzico ekranında bilgilerinizi girin</li>' +
              '<li><span>3</span>3D Secure doğrulamasını tamamlayın</li>' +
            '</ul>' +
            '<a class="cs-pay-method__cta" href="/checkout.html">Ödemeye git</a>' +
          '</article>' +
          '<article class="cs-pay-method cs-pay-method--bank" style="--cs-pay-i:1">' +
            '<header class="cs-pay-method__head">' +
              '<span class="cs-pay-method__icon" aria-hidden="true">' + BANK_ICO + '</span>' +
              '<div><em>02</em><h3>Havale / EFT</h3></div>' +
            '</header>' +
            '<p>Sipariş oluşturulduktan sonra banka bilgileri ve açıklama metni gösterilir. IBAN bu sayfada yayımlanmaz.</p>' +
            '<ul class="cs-pay-method__steps">' +
              '<li><span>1</span>Siparişi Havale/EFT ile oluşturun</li>' +
              '<li><span>2</span>Açıklamaya sipariş numarasını yazın</li>' +
              '<li><span>3</span>24 saat içinde ödemeyi tamamlayın</li>' +
            '</ul>' +
            '<a class="cs-pay-method__cta cs-pay-method__cta--ghost" href="/odeme-ve-guvenlik.html">Ödeme ve güvenlik</a>' +
          '</article>' +
        '</section>' +
        '<section class="cs-pay-note">' +
          '<header class="cs-pay-note__head"><span>03</span><div><h3>Destek</h3><p>Ödeme onayı veya havale soruları</p></div></header>' +
          '<p>Ödeme durumu sipariş detayında görünür. Kart veya havale sorunlarında destek talebi oluşturabilirsiniz.</p>' +
          '<div class="cs-pay-note__actions">' +
            '<button class="cs-pay-note__btn" type="button" data-tab-link="orders">Siparişlerim</button>' +
            '<button class="cs-pay-note__btn cs-pay-note__btn--dark" type="button" data-tab-link="support">Destek talebi</button>' +
          '</div>' +
        '</section>' +
      '</section>';
  }
  function notificationListHtml() {
    var rows = asArray(state.summary?.notifications);
    if (!rows.length) return '<div class="cs-notification-list" id="notificationsList">' + emptyState('Okunmamış bildirim bulunmuyor.', 'Sipariş, stok ve destek bildirimleri oluştuğunda burada görünür.', null) + '</div>';
    return '<div class="cs-notification-list" id="notificationsList">' + rows.slice(0, 12).map(function (n) {
      var unread = n.is_read === false ? ' is-unread' : '';
      return '<article class="cs-notification-item' + unread + '"><div><strong>' + escapeHtml(n.title || n.subject || 'Bildirim') + '</strong><p>' + escapeHtml(n.message || n.body || 'Detay bilgisi bulunmuyor.') + '</p><small>' + escapeHtml(formatDate(n.created_at, true)) + '</small></div>' + (n.is_read === false ? '<span>Yeni</span>' : '') + '</article>';
    }).join('') + '</div>';
  }
  function renderNotifications() {
    var el = $('#notificationsPanel'); if (!el) return; var user = state.summary.user || {}; var comm = Object.assign({}, safeObject(user.communication), safeObject(state.summary.notification_preferences));
    var journalActive = Boolean(comm.newsletter ?? comm.newsletter_opt_in ?? comm.newsletterOptIn);
    function prefOn(name, fallback) { return (comm[name] === undefined ? fallback : Boolean(comm[name])); }
    el.innerHTML = panelChrome('Bildirim Tercihlerim', 'Sipariş, kargo ve kampanya tercihlerinizi yönetin.', '<button class="cs-pill-btn" id="markAllNotificationsBtn" type="button">Bildirimleri Okundu Yap</button><button class="cs-pill-btn cs-pill-btn--dark" id="saveNotificationsBtn" type="button" data-save-notifications>Tercihleri Kaydet</button>') +
      '<form class="cs-toggle-grid cs-toggle-grid--premium" id="notificationPrefsForm">' +
      premiumToggleHtml('order_updates', true, 'Sipariş güncellemeleri', 'Sipariş durumu için zorunlu — kapatılamaz', { locked: true }) +
      premiumToggleHtml('cargo_updates', true, 'Kargo güncellemeleri', 'Teslimat takibi için zorunlu — kapatılamaz', { locked: true }) +
      premiumToggleHtml('campaign_emails', prefOn('campaign_emails', Boolean(comm.marketing_email_opt_in)), 'E-posta kampanyaları', 'İndirim ve ürün duyuruları') +
      premiumToggleHtml('sms_notifications', prefOn('sms_notifications', false), 'SMS bildirimleri', 'Sipariş veya izin verilen pazarlama SMS tercihleri') +
      premiumToggleHtml('stock_notifications', prefOn('stock_notifications', Boolean(comm.stock_alert_opt_in)), 'Stok bildirimleri', 'Favori ürün stok uyarıları') +
      premiumToggleHtml('routine_reminders', prefOn('routine_reminders', Boolean(comm.routine_reminder_opt_in)), 'Rutin önerileri', 'Bakım rutinine dair e-posta notları') +
      premiumToggleHtml('newsletter', prefOn('newsletter', Boolean(comm.newsletter_opt_in)), 'COSMOSKIN Journal', 'Bakım notları ve seçki e-postaları') +
      '</form><div class="cs-form-status" id="notificationSaveStatus" role="status" aria-live="polite"></div><section class="cs-content-help-card cs-journal-state"><div><span class="cs-overline">JOURNAL</span><h3>' + (journalActive ? 'Journal aboneliğiniz aktif.' : 'Journal aboneliğiniz aktif değil.') + '</h3><p>Abonelik tercihiniz güvenli şekilde kaydedilir. Kaydetme sonrası seçimleriniz bu ekranda korunur.</p></div>' + (journalActive ? '<button class="cs-pill-btn" data-newsletter-unsubscribe type="button">Abonelikten Çık</button>' : '<button class="cs-pill-btn" data-save-notifications type="button">Tercihleri Kaydet</button>') + '</section>' + notificationListHtml();
    syncAllPremiumToggles(el);
  }
  function renderSecurity() {
    var el = $('#securityPanel'); if (!el) return;
    var items = securityChecklist();
    var okCount = items.filter(function (i) { return i.tone === 'ok'; }).length;
    var warnCount = items.filter(function (i) { return i.tone === 'warn'; }).length;
    var SHIELD = '<svg class="cs-security-studio__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.8 5.6 6.2v5.4c0 4.1 2.7 7.1 6.4 8.6 3.7-1.5 6.4-4.5 6.4-8.6V6.2L12 3.8Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/><path d="m9.4 12 1.8 1.8 3.6-3.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var EYE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.8 12S6.4 6.8 12 6.8 21.2 12 21.2 12 17.6 17.2 12 17.2 2.8 12 2.8 12Z" stroke="currentColor" stroke-width="1.55"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.55"/></svg>';
    var rows = items.map(securityStudioRow).join('');
    el.innerHTML = panelChrome('Güvenlik', 'Oturum, şifre ve hesap/veri taleplerinizi güvenli şekilde yönetin.') +
      '<section class="cs-security-studio">' +
        '<article class="cs-security-studio__hero">' +
          '<div class="cs-security-studio__hero-top">' +
            '<span class="cs-security-studio__icon" aria-hidden="true">' + SHIELD + '</span>' +
            '<div class="cs-security-studio__stats" aria-label="Güvenlik özeti">' +
              '<span><strong>' + okCount + '</strong><em>doğrulandı</em></span>' +
              '<span><strong>' + warnCount + '</strong><em>dikkat</em></span>' +
            '</div>' +
          '</div>' +
          '<span class="cs-security-studio__kicker">Hesap koruması</span>' +
          '<h2>Güvenli oturum</h2>' +
          '<p>E-posta, telefon ve oturum durumunuz burada görünür. Şifre güncelleme ve çıkış işlemlerini aynı ekrandan yönetebilirsiniz.</p>' +
        '</article>' +
        '<section class="cs-security-block">' +
          '<header class="cs-security-block__head"><span>01</span><div><h3>Hesap durumu</h3><p>Doğrulama ve oturum sinyalleri</p></div></header>' +
          '<ul class="cs-security-rows">' + rows + '</ul>' +
        '</section>' +
        '<section class="cs-security-block">' +
          '<header class="cs-security-block__head"><span>02</span><div><h3>Şifre</h3><p>En az 8 karakter · güvenli bağlantı</p></div></header>' +
          '<form class="cs-security-pass" id="passwordForm" novalidate>' +
            '<label class="cs-security-pass__field">' +
              '<span>Yeni şifre</span>' +
              '<div class="cs-security-pass__control">' +
                '<input class="cs-input" name="password" type="password" autocomplete="new-password" minlength="8" required data-cs-mobile-pw="1">' +
                '<button type="button" class="cs-security-pass__toggle" data-toggle-password="password" aria-label="Şifreyi göster">' + EYE + '</button>' +
              '</div>' +
            '</label>' +
            '<label class="cs-security-pass__field">' +
              '<span>Yeni şifre tekrar</span>' +
              '<div class="cs-security-pass__control">' +
                '<input class="cs-input" name="password_confirm" type="password" autocomplete="new-password" minlength="8" required data-cs-mobile-pw="1">' +
                '<button type="button" class="cs-security-pass__toggle" data-toggle-password="password_confirm" aria-label="Şifreyi göster">' + EYE + '</button>' +
              '</div>' +
            '</label>' +
            '<p class="cs-security-pass__hint">Şifre en az 8 karakter olmalıdır. Başarı mesajı yalnızca kimlik doğrulama işlemi tamamlanırsa gösterilir.</p>' +
            '<button class="cs-security-pass__submit" type="submit">Şifreyi Güncelle</button>' +
          '</form>' +
        '</section>' +
        '<section class="cs-security-block cs-security-block--split">' +
          '<article class="cs-security-action">' +
            '<header class="cs-security-block__head"><span>03</span><div><h3>Aktif oturum</h3><p>Bu cihazdaki oturumu kapatın</p></div></header>' +
            '<p class="cs-security-action__lede">Ayrıntılı cihaz listesi şu anda sunulmamaktadır. Güvenli çıkış işlemini buradan yapabilirsiniz.</p>' +
            '<button class="cs-security-action__btn" id="logoutInlineBtn" type="button">Bu oturumdan çıkış yap</button>' +
          '</article>' +
          '<article class="cs-security-action cs-security-action--accent">' +
            '<header class="cs-security-block__head"><span>04</span><div><h3>Hesap / veri talebi</h3><p>KVKK ve hesap kapatma</p></div></header>' +
            '<p class="cs-security-action__lede">Hesap kapatma veya veri talepleri için destek kaydı oluşturabilirsiniz.</p>' +
            '<button class="cs-security-action__btn cs-security-action__btn--dark" type="button" data-tab-link="support">Destek talebi oluştur</button>' +
          '</article>' +
        '</section>' +
      '</section>';
  }
  function renderSupport() {
    var el = $('#supportPanel'); if (!el) return; var tickets = asArray(state.summary.support_requests); var orders = asArray(state.summary.orders);
    var ticketList = tickets.length ? '<div class="cs-order-list">' + tickets.map(function (t) { return '<article class="cs-card"><div class="cs-card-head"><span>' + escapeHtml(supportCategoryLabel(t.category || 'Destek')) + '</span><span class="cs-status-pill">' + escapeHtml(t.status || 'açık') + '</span></div><h3>' + escapeHtml(t.subject || 'Destek talebi') + '</h3><p>' + escapeHtml(t.message || '') + '</p><small>' + escapeHtml(formatDate(t.created_at, true)) + '</small></article>'; }).join('') + '</div>' : emptyState('Henüz destek talebiniz bulunmuyor.', 'Sipariş, ürün seçimi, kargo, ödeme veya hesap konularında destek talebi oluşturabilirsiniz. Resmi iade süreci için İade Taleplerim alanını kullanın.', null);
    var orderOptions = '<option value="">Sipariş seçmek istemiyorum</option>' + orders.map(function (o) { return '<option value="' + escapeHtml(o.id || '') + '">' + escapeHtml(safeOrderNumber(o)) + '</option>'; }).join('');
    el.innerHTML = panelChrome('Destek Taleplerim', 'Sipariş, ödeme, kargo veya hesap konularında destek kaydı oluşturun.') +
      '<article class="cs-card"><div class="cs-card-head"><span>YENİ DESTEK TALEBİ</span></div><form class="cs-form cs-form-compact" id="supportRequestForm"><label><span>Kategori</span><select class="cs-input" name="category" data-support-category><option value="order">Sipariş desteği</option><option value="product_selection">Ürün seçimi yönlendirmesi</option><option value="shipping">Kargo/teslimat</option><option value="return_request">İade süreci yönlendirmesi</option><option value="payment">Ödeme</option><option value="account">Hesap</option><option value="routine">Rutin Merkezi</option><option value="other">Diğer</option></select></label><label><span>Sipariş</span><select class="cs-input" name="order_id">' + orderOptions + '</select></label><div class="cs-content-help-card full" data-return-support-hint hidden><div><span class="cs-overline">İADE SÜRECİ</span><p>Bu konu resmi iade süreciyle ilgiliyse teslim edilmiş siparişiniz için İade Taleplerim alanından iade talebi oluşturabilirsiniz.</p></div><a class="cs-mini-btn dark" data-tab-link="returns" href="/account/profile.html?tab=returns&createReturn=1">İade Talebi Oluştur</a></div><label class="full"><span>Konu</span><input class="cs-input" name="subject" maxlength="140" required></label><label class="full"><span>Mesaj</span><textarea class="cs-input" name="message" rows="4" required></textarea></label><button class="cs-pill-btn cs-pill-btn--dark full" type="submit">Destek Talebi Oluştur</button></form></article>' + ticketList;
  }
  function supportCategoryLabel(cat) { return ({ order:'Sipariş', product_selection:'Ürün Seçimi', shipping:'Kargo/Teslimat', return_request:'İade Süreci', payment:'Ödeme', account:'Hesap', routine:'Rutin Merkezi', other:'Diğer' })[cat] || cat; }

  function switchTab(tab, push) {
    tab = normalizeTab(tab);
    if (!document.querySelector('[data-panel="' + tab + '"]')) tab = 'overview';
    state.activeTab = tab;
    var isHome = tab === 'overview';
    document.body.classList.toggle('cs-account-drill', !isHome);
    document.body.dataset.accountTab = tab;
    var app = $('#accountApp');
    if (app) app.dataset.tab = tab;
    $$('#accountNav [data-tab]').forEach(function (a) { a.classList.toggle('is-active', a.dataset.tab === tab); });
    $$('#accountHub [data-tab]').forEach(function (a) { a.classList.toggle('is-active', a.dataset.tab === tab); });
    $$('.cs-panel').forEach(function (p) {
      var active = p.dataset.panel === tab;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
      if (active) {
        p.classList.remove('cs-panel--enter');
        void p.offsetWidth;
        p.classList.add('cs-panel--enter');
      }
    });
    var url = new URL(window.location.href); url.searchParams.set('tab', tab);
    if (push) history.pushState({ tab: tab }, '', url.pathname + url.search); else history.replaceState({ tab: tab }, '', url.pathname + url.search);
    var h = $('[data-panel="' + tab + '"] h1,[data-panel="' + tab + '"] h2'); if (h) h.removeAttribute('tabindex');
    if (push && !isHome) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
    }
  }
  async function loadSummary() {
    var data = await apiFetch('/account/summary');
    if (!data || data.ok === false) throw new Error(data?.error || 'Hesap özeti alınamadı.');
    state.summary = normalizeSummary(data);
    renderAll();
    return state.summary;
  }

  function bindEvents() {
    $('#accountNav')?.addEventListener('click', function (e) { var a = e.target.closest('[data-tab]'); if (!a) return; e.preventDefault(); switchTab(a.dataset.tab, true); });
    $('#accountHub')?.addEventListener('click', function (e) { var a = e.target.closest('[data-tab]'); if (!a) return; e.preventDefault(); switchTab(a.dataset.tab, true); });
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab-link]'); if (tab) { e.preventDefault(); switchTab(tab.dataset.tabLink, true); }
      var add = e.target.closest('[data-add-product-cart]'); if (add) { e.preventDefault(); addToCart(getProductByHandle(add.dataset.addProductCart)).catch(handleError); }
      var fav = e.target.closest('[data-add-favorite]'); if (fav) { addFavorite(fav.dataset.addFavorite).catch(handleError); }
      var remFav = e.target.closest('[data-remove-favorite]'); if (remFav) { removeFavorite(remFav.dataset.removeFavorite, remFav.dataset.removeFavoriteSlug).catch(handleError); }
      var passToggle = e.target.closest('[data-toggle-password]');
      if (passToggle) {
        e.preventDefault();
        var form = passToggle.closest('form');
        var field = form && form.elements[passToggle.dataset.togglePassword];
        if (field) {
          var show = field.type === 'password';
          field.type = show ? 'text' : 'password';
          passToggle.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
          passToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
          passToggle.classList.toggle('is-on', show);
        }
      }
      var couponFilter = e.target.closest('[data-coupon-filter]');
      if (couponFilter) {
        e.preventDefault();
        var tabs = couponFilter.closest('[data-coupon-tabs]');
        if (tabs) {
          $$('[data-coupon-filter]', tabs).forEach(function (b) {
            var on = b === couponFilter;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          $$('[data-coupon-panel]', tabs).forEach(function (panel) {
            panel.hidden = panel.dataset.couponPanel !== couponFilter.dataset.couponFilter;
          });
        }
      }
      var coupon = e.target.closest('[data-copy-coupon]'); if (coupon) { copyCoupon(coupon.dataset.copyCoupon); }
      var routineCart = e.target.closest('[data-add-routine-cart]'); if (routineCart) { e.preventDefault(); var products = recommendedProducts(4); if (!products.length) return showToast('Sepete eklenebilecek profil önerisi bulunmuyor.', 'warning'); products.forEach(addToCart); }
      var savedRoutineCart = e.target.closest('[data-add-saved-routine-cart]'); if (savedRoutineCart) { e.preventDefault(); addSavedRoutineToCart(savedRoutineCart.dataset.addSavedRoutineCart); }
      var repeat = e.target.closest('[data-repeat-order]'); if (repeat) { repeatOrder(repeat.dataset.repeatOrder); }
      var cancelBtn = e.target.closest('[data-cancel-order]'); if (cancelBtn) { e.preventDefault(); cancelOrder(cancelBtn.dataset.cancelOrder, cancelBtn.dataset.cancelMode).catch(handleError); }
      var addAddress = e.target.closest('#addAddressBtn,[data-open-address-modal]'); if (addAddress) { e.preventDefault(); openAddressModal(); }
      var editAddress = e.target.closest('[data-edit-address]'); if (editAddress) { e.preventDefault(); openAddressModal(editAddress.dataset.editAddress); }
      var delAddress = e.target.closest('[data-delete-address]'); if (delAddress) { e.preventDefault(); deleteAddress(delAddress.dataset.deleteAddress).catch(handleError); }
      var defAddress = e.target.closest('[data-default-address]'); if (defAddress) { e.preventDefault(); setDefaultAddress(defAddress.dataset.defaultAddress).catch(handleError); }
      if (e.target.closest('#addressCancelBtn') || e.target.closest('#addressCancelBtn2') || e.target.closest('#cancelAddressBtn') || e.target.closest('#closeAddressModal')) { e.preventDefault(); closeAddressModal(); }
      if (e.target.matches('#saveProfileBtn') || e.target.closest('[data-save-profile]')) saveProfile().catch(handleError);
      if (e.target.matches('#saveSkinBtn') || e.target.closest('[data-save-skin]')) saveSkin().catch(handleError);
      if (e.target.matches('#saveNotificationsBtn') || e.target.closest('[data-save-notifications]')) saveNotifications().catch(handleError);
      if (e.target.matches('#markAllNotificationsBtn')) markAllNotificationsRead().catch(handleError);
      if (e.target.matches('#logoutBtn') || e.target.matches('#logoutInlineBtn')) logout();
      if (e.target.closest('[data-newsletter-unsubscribe]')) { e.preventDefault(); unsubscribeJournal().catch(handleError); }
      var openReturn = e.target.closest('[data-open-return-form]'); if (openReturn) { e.preventDefault(); var panel = $('#returnsPanel'); if (panel) panel.dataset.returnFormOpen = 'true'; renderReturns(); }
      var closeReturn = e.target.closest('[data-close-return-form]'); if (closeReturn) { e.preventDefault(); var rpanel = $('#returnsPanel'); if (rpanel) rpanel.dataset.returnFormOpen = 'false'; renderReturns(); }
      var clubTier = e.target.closest('[data-club-tier]');
      if (clubTier) {
        e.preventDefault();
        var key = clubTier.dataset.clubTier;
        var stack = clubTier.closest('[data-tier-stack]');
        var wasOpen = !!(stack && stack.classList.contains('is-open'));
        $$('[data-tier-stack]').forEach(function (s) {
          s.classList.remove('is-open');
          var btn = s.querySelector('[data-club-tier]');
          var panel = s.querySelector('[data-club-tier-detail]');
          if (btn) btn.setAttribute('aria-expanded', 'false');
          if (panel) panel.setAttribute('aria-hidden', 'true');
        });
        if (!wasOpen && stack) {
          stack.classList.add('is-open');
          clubTier.setAttribute('aria-expanded', 'true');
          var openPanel = stack.querySelector('[data-club-tier-detail]');
          if (openPanel) openPanel.setAttribute('aria-hidden', 'false');
          window.setTimeout(function () {
            try { stack.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
          }, 80);
        }
      }
      if (e.target.matches('#addressModal')) { e.preventDefault(); closeAddressModal(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAddressModal(); });
    document.addEventListener('change', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('cs-premium-toggle__input')) {
        if (e.target.disabled) {
          e.target.checked = true;
          syncPremiumToggle(e.target);
          return;
        }
        syncPremiumToggle(e.target);
      }
      var sel = e.target.closest('[data-return-order-select]');
      if (sel) {
        var order = state.summary.orders.find(function (o) { return String(o.id) === String(sel.value); });
        var target = $('[data-return-order-items]');
        if (target && order) target.innerHTML = orderReturnItemsHtml(order);
      }
      var cat = e.target.closest('[data-support-category]');
      if (cat) {
        var hint = $('[data-return-support-hint]');
        if (hint) hint.hidden = cat.value !== 'return_request';
      }
    });
    document.addEventListener('click', function (e) {
      var locked = e.target.closest('.cs-premium-toggle--locked');
      if (!locked) return;
      e.preventDefault();
      showToast('Sipariş ve kargo bildirimleri güvenlik için her zaman açıktır.', 'info');
    }, true);
    document.addEventListener('submit', function (e) {
      if (e.target.matches('#passwordForm')) { e.preventDefault(); updatePassword(e.target).catch(handleError); }
      if (e.target.matches('#addressForm')) { e.preventDefault(); saveAddress(e.target).catch(handleError); }
      if (e.target.matches('#supportRequestForm')) { e.preventDefault(); createSupportRequest(e.target).catch(handleError); }
      if (e.target.matches('#returnRequestForm')) { e.preventDefault(); createReturnRequest(e.target).catch(handleError); }
    });
    window.addEventListener('popstate', function () { switchTab(new URL(window.location.href).searchParams.get('tab') || 'overview', false); });
  }

  async function addToCart(product) {
    product = normalizeProduct(product);
    if (!product) return showToast('Ürün bilgisi bulunamadı.', 'warning');
    var slug = product.product_slug || product.id || '';
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.validateAdd === 'function') {
      var allowed = await window.COSMOSKIN_STOCK.validateAdd({ product_slug: slug, quantity: 1 });
      if (!allowed) return;
    } else if (!stockInfo(product).sellable) {
      return showToast('Bu ürün şu anda stokta yok.', 'warning');
    }
    var cart = []; try { cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); } catch (_) {}
    if (!Array.isArray(cart)) cart = [];
    var existing = cart.find(function (i) { return i.slug === product.product_slug || i.id === product.product_slug; });
    if (existing) existing.qty = Number(existing.qty || 1) + 1; else cart.push({ id: product.product_slug, slug: product.product_slug, name: product.product_name, brand: product.brand, price: product.price, image: product.image, url: product.url, qty: 1 });
    localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: cart } }));
    showToast('Ürün sepetinize eklendi.');
  }
  async function addFavorite(slug) {
    if (!slug) return;
    if (window.COSMOSKINFavorites && typeof window.COSMOSKINFavorites.add === 'function') {
      await window.COSMOSKINFavorites.add({ product_slug: slug, slug: slug });
    } else {
      await apiFetch('/account/favorites', { method:'POST', body:{ product_slug: slug } });
    }
    await loadSummary();
    switchTab(state.activeTab, false);
    showToast('Ürün favorilerinize eklendi.');
  }
  async function removeFavorite(id, slug) {
    if (!id && !slug) return;
    if (window.COSMOSKINFavorites && typeof window.COSMOSKINFavorites.remove === 'function') {
      await window.COSMOSKINFavorites.remove(slug || id);
    } else {
      await apiFetch('/account/favorites', { method:'DELETE', body:{ id: id, product_slug: slug } });
      if (slug) {
        var local = readLocalFavorites().filter(function(item){ return String(item.id || item.slug || item.product_slug || '') !== String(slug); });
        try { localStorage.setItem('cosmoskin_favorites', JSON.stringify(local)); } catch (_) {}
      }
    }
    await loadSummary();
    switchTab(state.activeTab, false);
    showToast('Ürün favorilerinizden çıkarıldı.');
  }
  function repeatOrder(orderId) { var order = state.summary.orders.find(function (o) { return String(o.id) === String(orderId); }); if (!order) return showToast('Sipariş bilgisi bulunamadı.', 'warning'); orderItems(order).forEach(function (item) { var p = getProductByHandle(item.product_slug || item.product_id) || normalizeProduct(item); if (p) addToCart(p); }); }
  async function cancelOrder(orderId, mode) {
    if (!orderId) return;
    var confirmText = mode === 'direct'
      ? 'Siparişinizi iptal etmek istediğinize emin misiniz?'
      : 'İptal talebiniz ekibimiz tarafından incelenecek. Devam edilsin mi?';
    if (!window.confirm(confirmText)) return;
    var reasonEl = document.querySelector('[data-cancel-reason-for="' + String(orderId).replace(/"/g, '') + '"]');
    var reason = reasonEl ? String(reasonEl.value || '').trim() : '';
    var data = await apiFetch('/account/orders/' + encodeURIComponent(orderId) + '/cancel', { method: 'POST', body: { reason: reason || undefined } });
    await loadSummary();
    switchTab(state.activeTab, false);
    showToast(data.message || (mode === 'direct' ? 'Siparişiniz iptal edildi.' : 'İptal talebiniz alındı.'));
  }
  function addSavedRoutineToCart(id) { var r = state.summary.routine_results.find(function (item) { return String(item.id || '') === String(id || ''); }); var products = asArray(r?.recommended_products || r?.products || r?.result?.recommended_products || r?.result?.products).map(function (p) { return getProductByHandle(p.product_slug || p.slug || p.id) || normalizeProduct(p); }).filter(Boolean); if (!products.length) return showToast('Bu rutinde sepete eklenebilecek ürün bulunamadı.', 'warning'); products.forEach(addToCart); }
  function copyCoupon(code) { if (!code) return; (navigator.clipboard?.writeText(code) || Promise.reject()).then(function () { showToast('Kupon kodu kopyalandı.'); }).catch(function () { window.prompt('Kupon kodunu kopyalayın:', code); }); }
  function openAddressModal(addressId) {
    var modal = $('#addressModal');
    var form = $('#addressForm');
    if (!modal || !form) return;
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    form.reset();
    form.elements.id.value = '';
    var addr = state.summary.addresses.find(function (a) { return String(a.id) === String(addressId); });
    if (addr) {
      form.elements.id.value = addr.id || '';
      form.elements.title.value = addr.title || '';
      form.elements.address_type.value = addr.address_type || addr.type || 'shipping';
      form.elements.first_name.value = addr.recipient_first_name || addr.first_name || '';
      form.elements.last_name.value = addr.recipient_last_name || addr.last_name || '';
      form.elements.phone.value = addr.phone || '';
      form.elements.city.value = addr.city || '';
      form.elements.district.value = addr.district || '';
      form.elements.neighborhood.value = addr.neighborhood || '';
      form.elements.postal_code.value = addr.postal_code || addr.postalCode || '';
      form.elements.address_line.value = addr.address_line || addr.address || '';
      form.elements.is_default.checked = Boolean(addr.is_default);
    }
    modal.hidden = false;
    document.body.classList.add('cs-address-modal-open');
    var first = form.querySelector('input[name="title"]');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }
  function closeAddressModal() {
    var modal = $('#addressModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('cs-address-modal-open');
  }
  async function saveAddress(form) { var data = new FormData(form); var payload = { id:data.get('id') || undefined, title:data.get('title'), address_type:data.get('address_type'), first_name:data.get('first_name'), last_name:data.get('last_name'), phone:data.get('phone'), city:data.get('city'), district:data.get('district'), neighborhood:data.get('neighborhood'), postal_code:data.get('postal_code'), address_line:data.get('address_line'), is_default:Boolean(data.get('is_default')) }; await apiFetch('/account/addresses', { method:payload.id ? 'PATCH' : 'POST', body:payload }); closeAddressModal(); await loadSummary(); switchTab('addresses', false); showToast('Adres kaydedildi.'); }
  async function deleteAddress(id) { if (!id || !window.confirm('Adres silinsin mi?')) return; await apiFetch('/account/addresses', { method:'DELETE', body:{ id:id } }); await loadSummary(); switchTab('addresses', false); showToast('Adres silindi.'); }
  async function setDefaultAddress(id) { var addr = state.summary.addresses.find(function (a) { return String(a.id) === String(id); }); if (!addr) return; await apiFetch('/account/addresses', { method:'PATCH', body:Object.assign({}, addr, { id:id, is_default:true }) }); await loadSummary(); switchTab('addresses', false); showToast('Varsayılan adres güncellendi.'); }
  async function saveSkin() {
    var form = $('#skinForm');
    if (!form) return;
    var concerns = $$('input[name="skin_concerns"]:checked', form).map(function (i) { return i.value; });
    var payload = {
      skin_type: form.elements.skin_type.value,
      sensitivity: form.elements.skin_sensitivity.value,
      skin_sensitivity: form.elements.skin_sensitivity.value,
      primary_goal: form.elements.routine_goal.value,
      routine_goal: form.elements.routine_goal.value,
      secondary_goals: concerns.filter(function (item) { return item !== form.elements.routine_goal.value; }),
      skin_concerns: concerns,
      routine_style: form.elements.routine_style?.value || '',
      source_channel: 'account-skin-profile',
      updated_at: new Date().toISOString(),
      skin_profile_updated_at: new Date().toISOString()
    };
    if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.normalizeSkinProfile === 'function') {
      payload = Object.assign(payload, window.COSMOSKINRoutineData.normalizeSkinProfile(payload, { source: 'account-skin-profile' }));
    }
    if (isDesignPreview()) {
      state.summary.skin_profile = Object.assign({}, safeObject(state.summary.skin_profile), payload);
      if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.save === 'function') {
        try {
          window.COSMOSKINSkinProfile.save({
            skinType: payload.skin_type,
            sensitivity: payload.sensitivity,
            primaryGoal: payload.primary_goal,
            secondaryGoal: (payload.secondary_goals && payload.secondary_goals[0]) || '',
            routineStyle: payload.routine_style,
            updatedAt: payload.updated_at
          });
        } catch (_) {}
      }
      renderSkinProfile();
      renderOverview();
      switchTab('skin-profile', false);
      showToast('Cilt profiliniz güncellendi.');
      return;
    }
    await apiFetch('/account/skin-profile', { method: 'POST', body: payload });
    await loadSummary();
    switchTab('skin-profile', false);
    showToast('Cilt profiliniz güncellendi.');
  }
  async function saveProfile() {
    var f = $('#profileForm'); if (!f) return;
    var status = $('#profileSaveStatus'); var btn = $('[data-save-profile]');
    var payload = { first_name:(f.elements.first_name?.value || '').trim(), last_name:(f.elements.last_name?.value || '').trim(), phone:(f.elements.phone?.value || '').trim() };
    var birthdayInput = f.elements.birthday;
    var birthdayValue = birthdayInput?.value || '';
    if (birthdayInput && !birthdayInput.disabled && birthdayValue) {
      if (birthdayValue > todayIsoDate()) {
        if (status) status.textContent = 'Doğum tarihi gelecekte olamaz.';
        return showToast('Doğum tarihi gelecekte olamaz.', 'warning');
      }
      payload.birthday = birthdayValue;
    }
    if (!payload.first_name || !payload.last_name) {
      if (status) status.textContent = 'Ad ve soyad zorunludur.';
      return showToast('Ad ve soyad zorunludur.', 'warning');
    }
    if (status) status.textContent = 'Bilgileriniz kaydediliyor...';
    if (btn) btn.disabled = true;
    try {
      if (isDesignPreview()) {
        state.summary.user = Object.assign({}, safeObject(state.summary.user), payload);
        if (payload.birthday) {
          state.summary.user.birthday = payload.birthday;
          state.summary.user.birth_date_locked = true;
        }
        renderProfile();
        renderProfileIdentity(state.summary.user, loyalty());
        renderOverview();
        switchTab('profile', false);
        showToast('Hesap bilgileriniz güncellendi.');
        return;
      }
      await apiFetch('/account/profile', { method:'PATCH', body:payload });
      if (status) status.textContent = 'Hesap bilgileriniz kaydedildi.';
      await loadSummary(); switchTab('profile', false); showToast('Hesap bilgileriniz güncellendi.');
    } catch (error) {
      if (status) status.textContent = error?.message || 'Hesap bilgileri şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.';
      throw error;
    } finally { if (btn) btn.disabled = false; }
  }
  function checkedFormValue(form, names, fallback) { for (var i = 0; i < names.length; i += 1) { var input = form.elements[names[i]]; if (input) return Boolean(input.checked); } return Boolean(fallback); }
  function applyNotificationPreferencesLocally(payload) {
    state.summary.notification_preferences = Object.assign({}, safeObject(state.summary.notification_preferences), payload);
    if (state.summary.user) {
      state.summary.user.communication = Object.assign({}, safeObject(state.summary.user.communication), payload, {
        marketing_email_opt_in: Boolean(payload.campaign_emails),
        stock_alert_opt_in: Boolean(payload.stock_notifications),
        routine_reminder_opt_in: Boolean(payload.routine_reminders),
        newsletter_opt_in: Boolean(payload.newsletter)
      });
    }
  }
  async function saveNotifications() {
    var f = $('#notificationPrefsForm'); if (!f) return;
    var status = $('#notificationSaveStatus'); var btn = $('#saveNotificationsBtn');
    var payload = {
      order_updates: true,
      cargo_updates: true,
      campaign_emails: checkedFormValue(f, ['campaign_emails','campaignEmails'], false),
      stock_notifications: checkedFormValue(f, ['stock_notifications','stockNotifications','restockAlerts'], false),
      routine_reminders: checkedFormValue(f, ['routine_reminders','routineReminders'], false),
      newsletter: checkedFormValue(f, ['newsletter','newsletter_opt_in'], false),
      sms_notifications: checkedFormValue(f, ['sms_notifications','smsNotifications'], false)
    };
    if (status) status.textContent = 'Tercihler kaydediliyor...';
    if (btn) btn.disabled = true;
    try {
      if (isDesignPreview()) {
        applyNotificationPreferencesLocally(payload);
        renderNotifications();
        renderOverview();
        renderFooterJournal(state.summary.user || {});
        var previewStatus = $('#notificationSaveStatus');
        if (previewStatus) previewStatus.textContent = 'Bildirim tercihleriniz kaydedildi.';
        showToast('Bildirim tercihleriniz kaydedildi.');
        return;
      }
      var res = await apiFetch('/account/notifications', { method:'PATCH', body:{ preferences:payload } });
      if (res && res.preferences) state.summary.notification_preferences = Object.assign({}, safeObject(state.summary.notification_preferences), res.preferences);
      await loadSummary(); switchTab('notifications', false);
      var updated = $('#notificationSaveStatus'); if (updated) updated.textContent = 'Bildirim tercihleriniz kaydedildi.';
      showToast('Bildirim tercihleriniz kaydedildi.');
    } catch (error) {
      var failStatus = $('#notificationSaveStatus');
      if (failStatus) failStatus.textContent = error?.message || 'Tercihleriniz şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.';
      throw error;
    } finally { if (btn) btn.disabled = false; }
  }
  async function markAllNotificationsRead() {
    if (isDesignPreview()) {
      state.summary.notifications = asArray(state.summary.notifications).map(function (n) {
        return Object.assign({}, n, { is_read: true, read_at: n.read_at || new Date().toISOString() });
      });
      if (state.summary.stats) state.summary.stats.unread_notifications = 0;
      renderNotifications();
      renderShell();
      showToast('Bildirimler okundu olarak işaretlendi.');
      return;
    }
    await apiFetch('/account/notifications', { method:'PATCH', body:{ mark_all_read:true } });
    await loadSummary();
    switchTab('notifications', false);
    showToast('Bildirimler okundu olarak işaretlendi.');
  }
  async function unsubscribeJournal() {
    var current = Object.assign({}, safeObject(state.summary?.user?.communication), safeObject(state.summary?.notification_preferences));
    var payload = {
      order_updates: true,
      cargo_updates: true,
      campaign_emails: Boolean(current.campaign_emails || current.marketing_email_opt_in),
      stock_notifications: Boolean(current.stock_notifications || current.stock_alert_opt_in),
      routine_reminders: Boolean(current.routine_reminders || current.routine_reminder_opt_in),
      sms_notifications: Boolean(current.sms_notifications),
      newsletter: false
    };
    if (isDesignPreview()) {
      applyNotificationPreferencesLocally(payload);
      renderNotifications();
      renderOverview();
      renderFooterJournal(state.summary.user || {});
      showToast('COSMOSKIN Journal aboneliğiniz kapatıldı.');
      return;
    }
    await apiFetch('/account/notifications', { method:'PATCH', body:{ preferences:payload } });
    await loadSummary();
    switchTab(state.activeTab, false);
    showToast('COSMOSKIN Journal aboneliğiniz kapatıldı.');
  }
  async function updatePassword(form) {
    var p = form.elements.password.value;
    var p2 = form.elements.password_confirm.value;
    if (p !== p2) return showToast('Şifreler eşleşmiyor.', 'warning');
    if (p.length < 8) return showToast('Şifre en az 8 karakter olmalı.', 'warning');
    if (isDesignPreview()) {
      form.reset();
      showToast('Şifreniz güncellendi.');
      return;
    }
    if (!state.client) return showToast('Şifre güncelleme için oturum gerekli.', 'warning');
    var res = await state.client.auth.updateUser({ password: p });
    if (res.error) throw res.error;
    form.reset();
    showToast('Şifreniz güncellendi.');
  }
  async function createSupportRequest(form) { var data = new FormData(form); var payload = { category:data.get('category'), order_id:data.get('order_id') || undefined, subject:data.get('subject'), message:data.get('message') }; await apiFetch('/account/support-requests', { method:'POST', body:payload }); form.reset(); await loadSummary(); switchTab('support', false); showToast('Destek talebiniz oluşturuldu.'); }
  async function uploadReturnAttachments(files, orderId) {
    var list = Array.prototype.slice.call(files || []).slice(0, 5);
    if (!list.length) return [];
    var allowed = ['image/jpeg','image/png','image/webp','video/mp4'];
    var uploaded = [];
    for (var i = 0; i < list.length; i += 1) {
      var file = list[i];
      if (!allowed.includes(file.type)) throw new Error('Yalnızca JPG, PNG, WEBP veya MP4 dosyaları yüklenebilir.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Dosya başına maksimum 10 MB yüklenebilir.');
      var ext = (file.name.split('.').pop() || 'file').replace(/[^a-z0-9]/gi,'').toLowerCase();
      var path = 'customer/' + (state.summary.user.id || 'user') + '/' + String(orderId || 'order') + '/' + Date.now() + '-' + i + '.' + ext;
      if (state.client?.storage?.from) {
        var result = await state.client.storage.from('return-attachments').upload(path, file, { cacheControl:'3600', upsert:false });
        if (result.error) throw result.error;
      }
      uploaded.push({ file_path:path, file_name:file.name, mime_type:file.type, file_size:file.size, uploaded_by:'customer' });
    }
    return uploaded;
  }
  async function createReturnRequest(form) {
    var status = $('#returnRequestStatus');
    var data = new FormData(form);
    var orderId = data.get('order_id');
    var selected = $$('input[name="return_item"]:checked', form);
    if (!orderId) throw new Error('İade için sipariş seçmelisiniz.');
    if (!selected.length) throw new Error('İade etmek istediğiniz ürünü seçmelisiniz.');
    var items = selected.map(function(input){ var id = input.value; return { order_item_id:id, product_slug:input.dataset.productSlug, product_name:input.dataset.productName, unit_price:input.dataset.unitPrice, quantity:Number((form.elements['quantity_' + id] || {}).value || 1), reason:(form.elements['reason_' + id] || {}).value || '', note:(form.elements['note_' + id] || {}).value || '' }; });
    var needsAttachment = items.some(function(item){ return ['Yanlış ürün gönderildi','Ürün hasarlı geldi','Eksik ürün gönderildi'].includes(item.reason); });
    var files = form.elements.attachments ? form.elements.attachments.files : [];
    if (needsAttachment && (!files || !files.length)) throw new Error('Hasarlı, yanlış veya eksik ürün taleplerinde fotoğraf/video eklenmelidir.');
    var attachments = await uploadReturnAttachments(files, orderId);
    var payload = {
      order_id: orderId,
      items: items,
      customer_note: data.get('customer_note') || '',
      attachments: attachments,
      unused_confirmed: Boolean(data.get('unused_confirmed')),
      hygiene_confirmed: Boolean(data.get('hygiene_confirmed')),
      seal_intact_confirmed: Boolean(data.get('seal_intact_confirmed')),
      resaleable_confirmed: Boolean(data.get('resaleable_confirmed')),
      return_terms_confirmed: Boolean(data.get('return_terms_confirmed'))
    };
    if (status) status.textContent = 'İade talebiniz oluşturuluyor...';
    await apiFetch('/returns', { method:'POST', body:payload });
    form.reset();
    state.returnSuccessMessage = 'İade talebiniz alındı. Talebiniz COSMOSKIN ekibi tarafından incelenecektir.';
    var currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('createReturn')) {
      currentUrl.searchParams.delete('createReturn');
      window.history.replaceState({}, '', currentUrl.pathname + (currentUrl.searchParams.toString() ? '?' + currentUrl.searchParams.toString() : '') + currentUrl.hash);
    }
    var panel = $('#returnsPanel'); if (panel) panel.dataset.returnFormOpen = 'false';
    await loadSummary();
    switchTab('returns', false);
    showToast('İade talebiniz alındı.');
  }

  function logout() { if (state.client) return state.client.auth.signOut().finally(function () { window.location.href = '/index.html'; }); window.location.href = '/index.html'; }
  function handleError(error) { console.error(error); var msg = error?.message || 'İşlem tamamlanamadı.'; if (/schema cache|campaign_emails|Supabase|column/i.test(msg)) msg = 'Tercihleriniz şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.'; showToast(msg, 'error'); }

  async function initSession() {
    cfg = window.COSMOSKIN_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase?.createClient) throw new Error('Hesap oturumu için Supabase public yapılandırması eksik.');
    state.client = window.cosmoskinSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
    var sessionResult = await state.client.auth.getSession();
    state.session = sessionResult?.data?.session || null;
    if (!state.session?.access_token) return false;
    return true;
  }
  // Localhost-only DESIGN PREVIEW mode.
  // Renders the full account UI with representative sample data so the layout
  // can be designed without a backend, Supabase session, or /api/* endpoints.
  // Activated with ?design=1 (or ?preview=1) and ONLY on local hosts, so it can
  // never affect production. No data is persisted; save actions stay backend-bound.
  function isDesignPreview() {
    try {
      var host = location.hostname;
      var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '' || /\.local$/.test(host);
      var params = new URLSearchParams(location.search);
      return isLocal && (params.get('design') === '1' || params.get('preview') === '1');
    } catch (_) { return false; }
  }
  function daysAgoIso(days) { var d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); }
  function daysAheadIso(days) { var d = new Date(); d.setDate(d.getDate() + days); return d.toISOString(); }
  function samplePreviewSummary() {
    return {
      user: {
        id: 'preview-user', first_name: 'Elif', last_name: 'Demir',
        email: 'elif.demir@example.com', phone: '+90 532 000 00 00',
        birthday: '1994-05-12', birth_date_locked: true,
        created_at: daysAgoIso(420), email_verified: true, email_confirmed_at: daysAgoIso(420),
        provider: 'E-posta',
        communication: {
          order_updates: true,
          cargo_updates: true,
          campaign_emails: false,
          sms_notifications: false,
          stock_notifications: true,
          routine_reminders: false,
          newsletter: false,
          marketing_email_opt_in: false,
          stock_alert_opt_in: true,
          routine_reminder_opt_in: false,
          newsletter_opt_in: false
        }
      },
      stats: {
        order_count: 3,
        active_order_count: 1,
        favorites_count: 4,
        addresses_count: 2,
        unread_notifications: 2,
        // Tier bar uses product-net spend (ex-shipping), not points balance.
        product_spend_total: 3290
      },
      membership: {
        level_code: 'essential',
        loyalty_spend_ex_shipping: 3290,
        rolling_spend_ex_shipping: 3290,
        completed_orders_12m: 3
      },
      points: {
        balance: 640, available: 480, pending: 160, reversed: 0, has_ledger_history: true,
        ledger: [
          { event_type: 'purchase', status: 'available', points_delta: 220, points: 220, created_at: daysAgoIso(6), description: 'CS-24193 siparişi kazanımı' },
          { event_type: 'purchase', status: 'available', points_delta: 260, points: 260, created_at: daysAgoIso(48), description: 'CS-23771 siparişi kazanımı' },
          { event_type: 'purchase', status: 'pending', points_delta: 160, points: 160, created_at: daysAgoIso(2), description: 'CS-24310 siparişi (onay bekliyor)' }
        ]
      },
      orders: [
        {
          id: 'ord-24310', order_number: 'CS-24310', status: 'preparing', payment_status: 'paid',
          created_at: daysAgoIso(2), subtotal_amount: 1290, total_amount: 1349, paid_at: daysAgoIso(2),
          order_items: [
            { product_slug: 'beauty-of-joseon-relief-sun-spf50', product_name: 'Relief Sun Rice + Probiotics SPF50+', brand: 'Beauty of Joseon', quantity: 2, unit_price: 349, line_total: 698, image: '' },
            { product_slug: 'torriden-dive-in-serum', product_name: 'Dive-In Low Molecular Hyaluronic Acid Serum', brand: 'Torriden', quantity: 1, unit_price: 592, line_total: 592, image: '' }
          ],
          shipments: [{ status: 'preparing', carrier: 'Aras Kargo' }], invoices: []
        },
        {
          id: 'ord-24193', order_number: 'CS-24193', status: 'shipped', payment_status: 'paid',
          created_at: daysAgoIso(6), subtotal_amount: 880, total_amount: 880, paid_at: daysAgoIso(6),
          order_items: [
            { product_slug: 'anua-heartleaf-77-soothing-toner', product_name: 'Heartleaf 77% Soothing Toner', brand: 'Anua', quantity: 1, unit_price: 439, line_total: 439, image: '' },
            { product_slug: 'cosrx-advanced-snail-96-mucin-essence', product_name: 'Advanced Snail 96 Mucin Power Essence', brand: 'COSRX', quantity: 1, unit_price: 441, line_total: 441, image: '' }
          ],
          shipments: [{ status: 'shipped', carrier: 'Yurtiçi Kargo', tracking_number: 'YK123456789', tracking_url: 'https://www.yurticikargo.com' }],
          invoices: [{ invoice_number: 'FTR-24193', invoice_status: 'issued', pdf_url: '/assets/logo-mark-beige.png', issued_at: daysAgoIso(6), invoice_type: 'individual' }]
        },
        {
          id: 'ord-23771', order_number: 'CS-23771', status: 'delivered', payment_status: 'paid',
          created_at: daysAgoIso(48), subtotal_amount: 1120, total_amount: 1120, paid_at: daysAgoIso(48),
          order_items: [
            { product_slug: 'laneige-water-sleeping-mask', product_name: 'Water Sleeping Mask', brand: 'Laneige', quantity: 1, unit_price: 620, line_total: 620, image: '' },
            { product_slug: 'round-lab-1025-dokdo-cleanser', product_name: '1025 Dokdo Cleanser', brand: 'Round Lab', quantity: 1, unit_price: 500, line_total: 500, image: '' }
          ],
          shipments: [{ status: 'delivered', carrier: 'Aras Kargo' }],
          invoices: [{ invoice_number: 'FTR-23771', invoice_status: 'issued', pdf_url: '/assets/logo-mark-beige.png', issued_at: daysAgoIso(47), invoice_type: 'individual' }]
        }
      ],
      addresses: [
        { id: 'adr-1', title: 'Ev', address_type: 'both', first_name: 'Elif', last_name: 'Demir', phone: '+90 532 000 00 00', city: 'İstanbul', district: 'Kadıköy', neighborhood: 'Caferağa Mah.', address_line: 'Moda Caddesi No: 42 D: 5', postal_code: '34710', is_default: true },
        { id: 'adr-2', title: 'İş', address_type: 'shipping', first_name: 'Elif', last_name: 'Demir', phone: '+90 532 000 00 00', city: 'İstanbul', district: 'Şişli', neighborhood: 'Mecidiyeköy Mah.', address_line: 'Büyükdere Caddesi No: 120 Kat: 8', postal_code: '34394', is_default: false }
      ],
      favorites: [
        { id: 'fav-1', product_slug: 'skin1004-madagascar-centella-ampoule' },
        { id: 'fav-2', product_slug: 'beauty-of-joseon-glow-deep-serum' },
        { id: 'fav-3', product_slug: 'cosrx-advanced-snail-96-mucin-essence' },
        { id: 'fav-4', product_slug: 'torriden-dive-in-hyaluronic-acid-serum' }
      ],
      coupons: [
        { code: 'WELCOME10', title: 'Hoş geldin indirimi', description: 'İlk siparişinde geçerli %10 indirim.', status: 'available', copyable: true, scope_label: 'Tüm ürünler', valid_until: daysAheadIso(30) },
        { code: 'CLUB15', title: 'Signature üye avantajı', description: 'Seçili bakım ürünlerinde %15 indirim.', status: 'available', copyable: true, scope_label: 'Bakım kategorisi', valid_until: daysAheadIso(14) }
      ],
      locked_coupons: [
        { code: 'BIRTHDAY10', title: 'Doğum günü kuponu', description: 'Doğum gününde otomatik görünür.', status: 'locked' }
      ],
      routine_results: [
        {
          id: 'rt-1', routine_title: 'Nem & Bariyer Rutini', is_active: true, updated_at: daysAgoIso(4),
          skin_type: 'combination', primary_goal: 'hydration', sensitivity: 'medium', routine_preference: 'Dengeli (4-5 adım)',
          result: { summary: 'Karma cilt için nem odaklı, bariyer destekleyici günlük rutin.', score: 82 },
          products: [
            { product_slug: 'anua-heartleaf-77-soothing-toner' },
            { product_slug: 'torriden-dive-in-serum' },
            { product_slug: 'cosrx-advanced-snail-96-mucin-essence' },
            { product_slug: 'beauty-of-joseon-relief-sun-spf50' }
          ]
        }
      ],
      notifications: [
        { id: 'n1', title: 'Siparişin hazırlanıyor', body: 'CS-24310 numaralı siparişin hazırlanmaya başlandı.', created_at: daysAgoIso(1), is_read: false, read_at: null },
        { id: 'n2', title: 'Kargoya verildi', body: 'CS-24193 numaralı siparişin kargoya teslim edildi.', created_at: daysAgoIso(5), is_read: false, read_at: null },
        { id: 'n3', title: 'Puan kazandın', body: '260 COSMOSKIN puanı hesabına tanımlandı.', created_at: daysAgoIso(48), is_read: true, read_at: daysAgoIso(47) }
      ],
      skin_profile: { skin_type: 'combination', sensitivity: 'medium', primary_goal: 'hydration', secondary_goal: 'barrier', routine_preference: 'Dengeli (4-5 adım)', updated_at: daysAgoIso(4) },
      support_requests: [],
      legal_consents: [],
      notification_preferences: {
        order_updates: true,
        cargo_updates: true,
        campaign_emails: false,
        sms_notifications: false,
        stock_notifications: true,
        routine_reminders: false,
        newsletter: false
      }
    };
  }
  function initDesignPreview() {
    cfg = window.COSMOSKIN_CONFIG || {};
    state.authenticated = true;
    state.session = { access_token: 'design-preview', user: { email: 'elif.demir@example.com', app_metadata: { provider: 'email' }, email_confirmed_at: daysAgoIso(420) } };
    state.summary = normalizeSummary(samplePreviewSummary());
    renderAll();
    var tab = normalizeTab(new URL(window.location.href).searchParams.get('tab') || 'overview');
    setLoading(false);
    switchTab(tab, false);
    state.ready = true;
    try {
      var app = $('#accountApp'); if (app) app.dataset.state = 'preview';
      console.info('%c[COSMOSKIN] Hesabım TASARIM ÖNİZLEME modu aktif — örnek verilerle, backend olmadan. Üretimi etkilemez.', 'color:#b58a4a;font-weight:700');
    } catch (_) {}
  }

  async function init() {
    try {
      ensureAccountDom();
      bindEvents();
      await (window.COSMOSKIN_PRODUCTS_READY || Promise.resolve());
      if (isDesignPreview()) { initDesignPreview(); return; }
      var loggedIn = await initSession();
      if (!loggedIn) { showAuthGate('Hesap bilgilerinizi görüntülemek için giriş yapmanız gerekir.'); return; }
      await loadSummary();
      if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.syncPendingDraft === 'function') {
        try {
          var synced = await window.COSMOSKINRoutineData.syncPendingDraft(state.session);
          if (synced && synced.ok && !synced.skipped) await loadSummary();
        } catch (syncError) {
          console.warn('COSMOSKIN routine draft sync skipped:', syncError && syncError.message);
        }
      }
      var tab = normalizeTab(new URL(window.location.href).searchParams.get('tab') || 'overview');
      setLoading(false);
      switchTab(tab, false);
      state.ready = true;
    } catch (error) {
      console.error(error);
      showFatal('Bilgiler şu anda yüklenemedi.', error.message || 'Hesap bilgileri alınırken hata oluştu.', 'Oturum veya bağlantı yapılandırmasını kontrol edin.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
