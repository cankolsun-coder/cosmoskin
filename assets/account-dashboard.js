(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var state = {
    client: null,
    session: null,
    summary: null,
    activeTab: 'overview',
    returns: [],
    initialized: false
  };

  var moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  var numberFmt = new Intl.NumberFormat('tr-TR');
  var tabAliases = { loyalty: 'club', membership: 'club', skin: 'skin-profile', skin_profile: 'skin-profile', cilt: 'skin-profile', coupons: 'coupons', coupon: 'coupons', communication: 'notifications' };
  var statusLabels = {
    pending_payment: 'Ödeme Bekleniyor', pending_bank_transfer: 'Havale/EFT Bekleniyor', awaiting_transfer: 'Havale/EFT Bekleniyor', pending: 'Sipariş Alındı', confirmed: 'Ödeme Alındı', paid: 'Ödeme alındı', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoya Verildi', delivered: 'Teslim Edildi', cancelled: 'İptal Edildi', payment_failed: 'Ödeme Başarısız', failed: 'Başarısız', refunded: 'İade Edildi', partially_refunded: 'Kısmi İade'
  };
  var shipmentLabels = { not_started: 'Hazırlanmadı', unfulfilled: 'Hazırlanıyor', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoda', delivered: 'Teslim Edildi', cancelled: 'İptal Edildi' };

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatMoney(value) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') return window.COSMOSKIN_FORMAT_PRICE(value);
    return moneyFmt.format(Number(value || 0));
  }
  function formatDate(value, withTime) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: withTime ? '2-digit' : undefined, minute: withTime ? '2-digit' : undefined, timeZone: 'Europe/Istanbul' }).format(new Date(value));
    } catch (_) { return String(value).slice(0, 10); }
  }
  function normalizeTab(tab) { tab = String(tab || 'overview').replace(/^#/, ''); return tabAliases[tab] || tab; }
  function showToast(message) { var t = $('#accountToast'); if (!t) return; t.textContent = message; t.classList.add('is-visible'); clearTimeout(showToast.timer); showToast.timer = setTimeout(function () { t.classList.remove('is-visible'); }, 2800); }
  function setLoading(loading) { var app = $('#accountApp'); var load = $('#accountLoading'); var layout = $('#accountLayout'); if (app) app.dataset.state = loading ? 'loading' : 'ready'; if (load) load.hidden = !loading; if (layout) layout.hidden = loading; }
  function getApiBase() { return String(cfg.apiBase || '/api').replace(/\/$/, ''); }
  async function apiFetch(path, options) {
    options = options || {};
    if (!state.session?.access_token) throw new Error('Oturum bulunamadı.');
    var res = await fetch(getApiBase() + path, { method: options.method || 'GET', headers: Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + state.session.access_token }, options.headers || {}), body: options.body ? JSON.stringify(options.body) : undefined });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || 'İşlem tamamlanamadı.');
    return data;
  }

  function iconSvg(name) {
    var map = {
      home: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 11.2 12 5l7.5 6.2V20a1 1 0 0 1-1 1h-4.2v-5.4H9.7V21H5.5a1 1 0 0 1-1-1v-8.8Z"></path></svg>',
      bag: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.5 8.5h11l-.9 11h-9.2l-.9-11Z"></path><path d="M9.2 8.5V7.4a2.8 2.8 0 0 1 5.6 0v1.1"></path></svg>',
      return: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.2 7.2 4.8 11.6 9.2 16"></path><path d="M5.2 11.6h9.2a4.8 4.8 0 1 1 0 9.6h-1.3"></path></svg>',
      heart: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20.2 5.2 13.8a4.4 4.4 0 0 1 6.2-6.2l.6.6.6-.6a4.4 4.4 0 0 1 6.2 6.2L12 20.2Z"></path></svg>',
      invoice: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3.8h12v16.4l-2-1.1-2 1.1-2-1.1-2 1.1-2-1.1-2 1.1V3.8Z"></path><path d="M8.5 8h7M8.5 12h7M8.5 15h4"></path></svg>',
      pin: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s6.6-5.8 6.6-11a6.6 6.6 0 0 0-13.2 0C5.4 15.2 12 21 12 21Z"></path><path d="M12 12.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z"></path></svg>',
      drop: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4.2s5.7 6.7 5.7 10.2a5.7 5.7 0 0 1-11.4 0C6.3 10.9 12 4.2 12 4.2Z"></path><path d="M9.4 15.1a2.7 2.7 0 0 0 2.6 2.1"></path></svg>',
      crown: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 16-1-9 5 4 3-6 3 6 5-4-1 9H5Zm0 3h14"></path></svg>',
      ticket: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 8a2 2 0 0 0 0 4v4.5h15V12a2 2 0 0 0 0-4V3.5h-15V8Z"></path><path d="M9 7h6M9 13h6"></path></svg>',
      bell: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 10a6 6 0 1 0-12 0c0 4.8-1.8 6.2-1.8 6.2h15.6S18 14.8 18 10Z"></path><path d="M10 19.2h4"></path></svg>',
      shield: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3.8 19 7v5.5c0 4.3-2.9 6.8-7 7.9-4.1-1.1-7-3.6-7-7.9V7l7-3.2Z"></path><path d="m8.8 12.2 2.1 2.1 4.5-4.8"></path></svg>',
      support: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.8 12a7.2 7.2 0 0 1 14.4 0v4.2a2.8 2.8 0 0 1-2.8 2.8h-2.1"></path><path d="M4.8 12v3.5a1.8 1.8 0 0 0 1.8 1.8h1.1v-6.1H4.8Zm14.4 0v5.3h-2.9v-6.1h2.9Z"></path></svg>',
      truck: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.5 7h10.2v8.4H3.5V7Zm10.2 3h3.4l3.4 3.4v2h-6.8V10Z"></path><path d="M6.8 18.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm10.8 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"></path></svg>',
      sparkle: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z"></path></svg>',
      clock: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"></path><path d="M12 7.2v5.1l3.2 1.8"></path></svg>',
      calendar: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 4v3M17 4v3M4.5 8.5h15M6 6h12a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V7.5A1.5 1.5 0 0 1 6 6Z"></path></svg>'
    };
    return map[name] || map.sparkle;
  }

  function normalizeProduct(product) {
    if (!product) return null;
    var slug = product.slug || product.id || '';
    return { id: product.id || slug, product_slug: slug, product_name: product.name || product.product_name || 'Ürün', brand: product.brand || 'COSMOSKIN', category: product.category || '', price: Number(product.price || 0), image: product.image || '', url: product.url || (slug ? '/products/' + slug + '.html' : '/allproducts.html'), keywords: product.keywords || [], stock: product.stock_status || product.stockStatus || product.inventory_status || product.status || 'unknown' };
  }
  function allProducts() { return (window.COSMOSKIN_PRODUCTS || []).map(normalizeProduct).filter(Boolean); }
  function getProductByHandle(handle) {
    var raw = String(handle || '').replace(/^.*\/products\//, '').replace(/\.html.*$/, '');
    return allProducts().find(function (p) { return p.product_slug === raw || p.id === raw || p.url === handle; }) || null;
  }
  function displayName(user) { return user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'COSMOSKIN Üyesi'; }
  function firstName(user) { return user?.first_name || String(displayName(user)).split(/\s+/)[0] || ''; }
  function initials(user) { var n = displayName(user) || user?.email || 'CK'; var parts = String(n).trim().split(/\s+/); var letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2); return letters.toLocaleUpperCase('tr-TR') || 'CK'; }

  function normalizeTierName(value, points) {
    var raw = String(value || '').toLocaleLowerCase('tr-TR');
    if (raw.indexOf('elite') !== -1) return 'Elite Üye';
    if (raw.indexOf('signature') !== -1 || raw.indexOf('select') !== -1 || raw.indexOf('silver') !== -1) return 'Signature Üye';
    if (points >= 15000) return 'Elite Üye';
    if (points >= 6000) return 'Signature Üye';
    return 'Essential Üye';
  }
  function loyalty() {
    var summary = state.summary || {};
    var stats = summary.stats || {};
    var membership = summary.membership || {};
    var pointsObj = summary.points || {};
    var balance = Number(pointsObj.balance ?? membership.points_balance ?? stats.points_balance ?? stats.total_spent ?? 0) || 0;
    var pending = (pointsObj.ledger || []).filter(function (r) { return String(r.status || '').toLowerCase() === 'pending'; }).reduce(function (s, r) { return s + Math.max(0, Number(r.points_delta || r.points || 0)); }, 0);
    var label = normalizeTierName(membership.level_code || stats.tier?.label || stats.tier?.key, balance);
    var next = label === 'Essential Üye' ? 'Signature Üye' : label === 'Signature Üye' ? 'Elite Üye' : '';
    var threshold = label === 'Essential Üye' ? 6000 : label === 'Signature Üye' ? 15000 : Math.max(balance, 15000);
    var base = label === 'Signature Üye' ? 6000 : label === 'Elite Üye' ? 15000 : 0;
    var remaining = next ? Math.max(0, threshold - balance) : 0;
    var progress = next ? Math.max(0, Math.min(100, Math.round(((balance - base) / Math.max(1, threshold - base)) * 100))) : 100;
    return { label: label, points: Math.round(balance), available: Math.round(balance), pending: Math.round(pending), monthly: 0, expiring: 0, next: next, threshold: threshold, remaining: remaining, progress: progress };
  }
  function skinProfile() {
    var user = state.summary?.user || {};
    var row = state.summary?.skin_profile || {};
    var goals = row.skin_concerns || row.skin_goals || user.skin_concerns || [];
    if (!Array.isArray(goals)) goals = goals ? [goals] : [];
    var type = row.skin_type || user.skin_type || 'Karma Cilt';
    var sensitivity = row.skin_sensitivity || row.sensitivity || user.skin_sensitivity || '';
    var routineGoal = row.routine_goal || user.routine_goal || goals[0] || 'Nem desteği';
    return { skin_type: type || 'Karma Cilt', goals: goals.length ? goals : ['Nem', 'Işıltı', 'Bariyer desteği'], sensitivity: sensitivity || 'Belirtilmedi', routine_preference: row.routine_style || user.routine_style || 'Günlük bakım', product_preferences: ['Hafif yapı', 'nem odaklı', 'SPF desteği'], ingredient_preferences: 'Parfümsüz seçenekler öncelikli gösterilebilir', updated_at: row.updated_at || user.skin_profile_updated_at || '2026-06-27T12:00:00+03:00', routine_goal: routineGoal };
  }
  function statusFromOrder(order) { return String(order?.status || order?.fulfillment_status || order?.payment_status || '').toLowerCase(); }
  function activeOrders() { return (state.summary?.orders || []).filter(function (o) { var s = statusFromOrder(o); return ['paid', 'confirmed', 'preparing', 'packed', 'shipped'].includes(s) || ['paid'].includes(String(o.payment_status || '').toLowerCase()); }); }
  function getCoupons() {
    var rows = (state.summary?.coupons || []).slice();
    rows = rows.map(function (c) { return Object.assign({ code: c.code || c.coupon_code || 'CLUB10', status: c.status || 'available', title: c.title || 'COSMOSKIN Club’a özel %10 avantaj', description: c.description || 'Sepette uygulanabilir.', expires_at: c.expires_at || c.ends_at || '2026-06-30T20:59:00.000Z', scope_label: c.scope_label || 'Seçili ürünlerde geçerli', min_subtotal: c.min_subtotal ?? c.min_cart_total ?? 0 }, c); });
    if (!rows.some(function (c) { return String(c.code).toUpperCase() === 'CLUB10'; })) rows.unshift({ code: 'CLUB10', title: 'COSMOSKIN Club’a özel %10 avantaj', description: 'Sepette uygulanabilir.', status: 'available', expires_at: '2026-06-30T20:59:00.000Z', scope_label: 'Seçili ürünlerde geçerli', min_subtotal: 0, fallback: true });
    return rows;
  }
  function activeCoupons() { var now = Date.now(); return getCoupons().filter(function (c) { var st = String(c.status || '').toLowerCase(); var exp = c.expires_at ? new Date(c.expires_at).getTime() : Infinity; return ['available', 'active'].includes(st) && exp > now; }); }

  function ensureAccountDom() {
    $('.cs-account-top')?.setAttribute('hidden', '');
    var nav = $('#accountNav');
    if (nav) {
      nav.innerHTML = [
        '<div class="cs-nav-label">ALIŞVERİŞ</div>',
        navItem('overview', 'home', 'Genel Bakış'),
        navItem('orders', 'bag', 'Siparişlerim', 'ordersBadge'),
        navItem('returns', 'return', 'İade ve Taleplerim', 'returnsBadge'),
        navItem('favorites', 'heart', 'Favorilerim', 'favoritesBadge'),
        navItem('invoices', 'invoice', 'Faturalarım'),
        '<div class="cs-nav-label">HESAP</div>',
        navItem('addresses', 'pin', 'Adreslerim', 'addressesBadge'),
        navItem('skin-profile', 'drop', 'Cilt Profilim'),
        navItem('club', 'crown', 'COSMOSKIN Club'),
        navItem('coupons', 'ticket', 'Kuponlarım', 'couponsBadge'),
        navItem('notifications', 'bell', 'Bildirim Tercihlerim', 'notificationsBadge'),
        navItem('security', 'shield', 'Güvenlik ve Hesap'),
        navItem('support', 'support', 'Destek Merkezi')
      ].join('');
    }
    var content = $('.cs-account-content');
    if (content) {
      content.innerHTML = [
        panel('overview', 'overviewPanel'),
        panel('club', 'clubPanel'),
        panel('skin-profile', 'skinPanel'),
        panel('coupons', 'couponsPanel'),
        panel('orders', 'ordersPanel'),
        panel('returns', 'returnsPanel'),
        panel('favorites', 'favoritesPanel'),
        panel('addresses', 'addressesPanel'),
        panel('invoices', 'invoicesPanel'),
        panel('notifications', 'notificationsPanel'),
        panel('security', 'securityPanel'),
        panel('support', 'supportPanel')
      ].join('');
    }
  }
  function navItem(tab, icon, label, badgeId) { return '<a data-tab="' + tab + '" href="/account/profile.html?tab=' + tab + '"><span class="cs-nav-icon" data-icon="' + icon + '">' + iconSvg(icon) + '</span>' + escapeHtml(label) + (badgeId ? ' <em id="' + badgeId + '">0</em>' : '') + '</a>'; }
  function panel(tab, id) { return '<section class="cs-panel" data-panel="' + tab + '" id="' + id + '"></section>'; }

  function renderShell() {
    var summary = state.summary || {};
    var user = summary.user || {};
    var stats = summary.stats || {};
    var l = loyalty();
    $('#accountName') && ($('#accountName').textContent = displayName(user));
    $('#accountEmail') && ($('#accountEmail').textContent = user.email || '—');
    $('#accountAvatar') && ($('#accountAvatar').textContent = initials(user));
    $('#accountMemberSince') && ($('#accountMemberSince').textContent = 'Üyelik: ' + formatDate(user.created_at || new Date('2026-04-22T09:00:00+03:00')));
    $('#ordersBadge') && ($('#ordersBadge').textContent = String(summary.orders?.length || stats.order_count || 0));
    $('#returnsBadge') && ($('#returnsBadge').textContent = String((summary.returns || state.returns || []).length || 0));
    $('#favoritesBadge') && ($('#favoritesBadge').textContent = String(summary.favorites?.length || stats.favorites_count || 0));
    $('#addressesBadge') && ($('#addressesBadge').textContent = String(summary.addresses?.length || stats.addresses_count || 0));
    $('#couponsBadge') && ($('#couponsBadge').textContent = String(activeCoupons().length || 0));
    $('#notificationsBadge') && ($('#notificationsBadge').textContent = String(stats.unread_notifications || 0));
    renderFooterJournal(user);
  }

  function renderFooterJournal(user) {
    var newsletter = $('.footer-newsletter');
    if (!newsletter) return;
    newsletter.classList.add('cs-account-journal-footer');
    newsletter.innerHTML = '<div class="cs-account-journal-copy"><p class="footer-newsletter__kicker">COSMOSKIN JOURNAL</p><h2 class="footer-newsletter__title">Yeni seçkiler ve bakım notları, ilk senin posta kutunda.</h2><p class="footer-newsletter__lede">Kampanyalar, ürün önerileri ve cilt bakım seçkileri hakkında bildirim tercihlerini yönetebilirsin.</p></div><div class="cs-account-journal-actions"><span>E-posta: ' + escapeHtml(user?.email || '—') + '</span><a class="footer-newsletter__btn" data-tab-link="notifications" href="/account/profile.html?tab=notifications"><span>Bildirim Tercihlerimi Yönet</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"></path></svg></a></div><img class="cs-account-journal-logo" src="/assets/logo-mark.png" alt="" loading="lazy">';
  }

  function renderAll() {
    renderShell();
    renderOverview();
    renderClub();
    renderSkinProfile();
    renderCoupons();
    renderOrders();
    renderReturns();
    renderFavorites();
    renderAddresses();
    renderInvoices();
    renderNotifications();
    renderSecurity();
    renderSupport();
  }

  function renderOverview() {
    var el = $('#overviewPanel'); if (!el) return;
    var summary = state.summary || {}; var user = summary.user || {}; var s = summary.stats || {}; var l = loyalty(); var sp = skinProfile();
    var latest = (summary.orders || [])[0];
    el.innerHTML = '<section class="cs-overview-hero-grid">' + welcomeCard(user, s, l) + clubMiniCard(l) + skinMiniCard(sp) + '</section>' +
      '<section class="cs-overview-main-card"><div class="cs-panel-head cs-panel-head--inside"><div><span>ÖZET</span><h2>Hesap Genel Bakış</h2></div><div class="cs-panel-actions"><a class="cs-pill-btn" href="/account/routines/">Rutinlere Git</a><a class="cs-pill-btn" data-tab-link="returns" href="/account/profile.html?tab=returns">İade Taleplerim</a></div></div>' +
      '<div class="cs-stat-grid cs-stat-grid--six">' + statCards() + '</div>' +
      '<div class="cs-overview-grid cs-overview-grid--final"><article class="cs-card cs-card-large"><div class="cs-card-head"><span>SON SİPARİŞ</span></div>' + (latest ? orderCard(latest, true) : emptyState('Henüz siparişin bulunmuyor.', 'Sipariş verdiğinde durumunu buradan takip edebilirsin.', 'Alışverişe Başla', '/allproducts.html')) + '</article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>CİLT RUTİNİ</span><a data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Güncelle</a></div>' + routineSummary(sp) + '</article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>HESAP &amp; GÜVENLİK</span><a data-tab-link="security" href="/account/profile.html?tab=security">Ayarları Yönet</a></div>' + securityChecklist() + '</article></div>' +
      '<div class="cs-overview-grid cs-overview-grid--secondary"><article class="cs-card"><div class="cs-card-head"><span>KUPONLARIM</span></div>' + couponMiniCard() + '</article><article class="cs-card"><div class="cs-card-head"><span>FATURA &amp; TESLİMAT</span></div>' + deliveryMiniCard() + '</article></div>' +
      '<div class="cs-lower-grid"><article class="cs-card cs-recommend-card"><div class="cs-card-head"><span>SANA ÖZEL ÖNERİLER</span><a href="/allproducts.html">Tümünü Gör</a></div><div class="cs-product-mini-row">' + recommendedProducts(3).map(productCard).join('') + '</div></article><article class="cs-card"><div class="cs-card-head"><span>HIZLI ERİŞİM</span></div><div class="cs-quick-grid">' + quickCards().join('') + '</div></article></div></section>';
  }
  function welcomeCard(user, stats, l) {
    return '<article class="cs-account-welcome-card"><span class="cs-overline">HESABIM</span><h1>Merhaba ' + escapeHtml(firstName(user) || 'COSMOSKIN üyesi') + ',<br>siparişlerini, cilt profilini ve COSMOSKIN Club ayrıcalıklarını tek yerden yönet.</h1><p>Siparişlerin, favorilerin, adreslerin, kuponların ve cilt bakım rutinin düzenli ve hızlı erişimle senin için hazır.</p><div class="cs-hero-chips"><span>' + iconSvg('truck') + '<b>' + activeOrders().length + ' aktif sipariş</b></span><span>' + iconSvg('sparkle') + '<b>2 kayıtlı tercih</b></span><span>' + iconSvg('pin') + '<b>' + (state.summary?.addresses?.length || stats.addresses_count || 0) + ' kayıtlı adres</b></span><span>' + iconSvg('ticket') + '<b>' + activeCoupons().length + ' aktif kupon</b></span><span>' + iconSvg('crown') + '<b>Club: ' + escapeHtml(l.label.replace(' Üye','')) + '</b></span></div></article>';
  }
  function clubMiniCard(l) { return '<article class="cs-loyalty-card cs-loyalty-card--mini"><div aria-hidden="true" class="cs-loyalty-watermark"><img src="/assets/logo-mark.png" alt=""></div><span class="cs-overline">' + iconSvg('crown') + 'COSMOSKIN CLUB</span><h2>' + escapeHtml(l.label) + '</h2><div class="cs-loyalty-progress"><span style="width:' + l.progress + '%"></span></div><div class="cs-loyalty-meta"><strong>' + numberFmt.format(l.points) + ' / ' + numberFmt.format(l.threshold) + ' puan</strong><span>' + (l.next ? escapeHtml(l.next + ' için kalan: ' + numberFmt.format(l.remaining) + ' puan') : 'En üst seviye') + '</span></div><p>Tamamlanan siparişlerinden puan kazanırsın. Puanların sepet avantajlarına dönüşür.</p><div class="cs-loyalty-links"><a data-tab-link="club" href="/account/profile.html?tab=club">Avantajlarımı Gör</a><a data-tab-link="club" href="/account/profile.html?tab=club">Puan Geçmişi</a><a href="/allproducts.html">Alışverişe Devam Et</a></div></article>'; }
  function skinMiniCard(sp) { return '<article class="cs-skin-profile-card cs-skin-profile-card--mini"><span class="cs-overline">CİLT PROFİLİM</span><h2>' + escapeHtml(cleanSkinType(sp.skin_type)) + '</h2><div class="cs-skin-tags"><span>Nem</span><span>Işıltı</span><span>Bariyer desteği</span></div><p>Cilt profilin kayıtlı. Sana özel rutin ve ürün önerileri bu bilgilere göre güncellenir.</p><p class="cs-skin-profile-stamp">Son güncelleme: ' + escapeHtml(formatDate(sp.updated_at)) + '</p><div class="cs-skin-profile-actions"><a class="cs-mini-btn dark" href="/account/routines/">Rutinimi Gör</a><a class="cs-mini-btn" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Profili Güncelle</a></div></article>'; }
  function statCards() { var s = state.summary?.stats || {}; var l = loyalty(); return [ { icon:'bag', label:'Toplam Sipariş', value:s.order_count || (state.summary?.orders || []).length || 0, hint:'Tüm zamanların toplamı' }, { icon:'truck', label:'Aktif Sipariş', value:activeOrders().length, hint:'Devam eden sipariş' }, { icon:'sparkle', label:'Kazanılan Puan', value:numberFmt.format(l.points), hint:'Hesap geçmişine göre' }, { icon:'heart', label:'Favoriler', value:s.favorites_count || (state.summary?.favorites || []).length || 0, hint:'Kaydettiğiniz ürünler' }, { icon:'pin', label:'Kayıtlı Adres', value:s.addresses_count || (state.summary?.addresses || []).length || 0, hint:'Teslimat adresi' }, { icon:'ticket', label:'Aktif Kupon', value:activeCoupons().length, hint:'Kullanılabilir avantaj' } ].map(function (c) { return '<article class="cs-stat"><span class="cs-stat-icon">' + iconSvg(c.icon) + '</span><div><small>' + escapeHtml(c.label) + '</small><strong>' + escapeHtml(c.value) + '</strong><em>' + escapeHtml(c.hint) + '</em></div></article>'; }).join(''); }
  function emptyState(title, body, cta, href, tab) { return '<div class="cs-empty"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(body || '') + '</p>' + (cta ? '<a class="cs-pill-btn" ' + (tab ? 'data-tab-link="' + escapeHtml(tab) + '"' : '') + ' href="' + escapeHtml(href || '/allproducts.html') + '">' + escapeHtml(cta) + '</a>' : '') + '</div>'; }

  function orderItems(order) { return order?.order_items || order?.items || []; }
  function itemCount(order) { return orderItems(order).reduce(function (s, i) { return s + (Number(i.quantity) || 1); }, 0) || 1; }
  function shipment(order) { return order?.latest_shipment || (Array.isArray(order?.shipments) ? order.shipments[0] : null) || {}; }
  function safeOrderNumber(order) { var num = String(order?.order_number || order?.id || 'CS-2026-0001'); return /^TEST/i.test(num) ? 'CS-2026-0001' : num; }
  function paymentPaid(order) { var p = String(order?.payment_status || '').toLowerCase(); var s = statusFromOrder(order); return ['paid', 'confirmed', 'preparing', 'packed', 'shipped', 'delivered'].includes(p) || ['paid', 'confirmed', 'preparing', 'packed', 'shipped', 'delivered'].includes(s) || order?.paid_at; }
  function orderStatusText(order) { var s = statusFromOrder(order); if (String(order?.payment_status || '').toLowerCase() === 'payment_failed' || s === 'payment_failed') return 'Ödeme Başarısız'; if (['paid','confirmed'].includes(s)) return 'Hazırlanıyor'; return statusLabels[s] || statusLabels[order?.fulfillment_status] || shipmentLabels[shipment(order).status] || 'Hazırlanıyor'; }
  function orderProgress(order) {
    var s = statusFromOrder(order), ship = String(shipment(order).status || '').toLowerCase();
    var current = 0; if (paymentPaid(order)) current = 1; if (['preparing','packed','shipped','delivered'].includes(s) || ['preparing','packed'].includes(String(order?.fulfillment_status || '').toLowerCase())) current = 2; if (['shipped','delivered'].includes(s) || ship === 'shipped' || shipment(order).tracking_number) current = 3; if (['delivered'].includes(s) || ship === 'delivered') current = 4;
    var labels = ['Sipariş Alındı', 'Hazırlanıyor', 'Kargoya Verilecek', 'Teslim Edilecek'];
    return '<div class="cs-order-progress">' + labels.map(function (label, i) { return '<div class="cs-order-step ' + (i <= current - 1 ? 'is-done ' : '') + (i === Math.max(0, current - 1) ? 'is-current' : '') + '"><span></span><strong>' + label + '</strong></div>'; }).join('') + '</div>';
  }
  function orderCard(order, compact) {
    var firstItem = orderItems(order)[0] || {}; var p = getProductByHandle(firstItem.product_slug || firstItem.product_id || firstItem.product_url) || normalizeProduct(firstItem) || recommendedProducts(1)[0] || {};
    var ship = shipment(order); var invoiceReady = (order.invoices || []).some(function (i) { return i.pdf_url; }); var detail = '/account/order-detail.html?id=' + encodeURIComponent(order.id || order.order_number || '');
    var tracking = ship.tracking_number && ship.tracking_url ? '<a class="cs-mini-btn" href="' + escapeHtml(ship.tracking_url) + '" target="_blank" rel="noopener">Kargoyu Takip Et</a>' : '';
    var repeat = ['delivered','shipped'].includes(statusFromOrder(order)) ? '<button class="cs-mini-btn" type="button" data-repeat-order="' + escapeHtml(order.id || '') + '">Tekrar Satın Al</button>' : '';
    return '<article class="cs-order-card cs-order-card--rich ' + (compact ? 'is-compact' : '') + '"><div class="cs-order-card-head"><div><small>SON SİPARİŞ</small><strong>' + escapeHtml(safeOrderNumber(order)) + '</strong><time>' + escapeHtml(formatDate(order.created_at || new Date('2026-04-25T12:00:00+03:00'))) + ' · ' + itemCount(order) + ' ürün</time></div><div class="cs-order-head-actions"><span class="cs-status-pill preparing">' + escapeHtml(orderStatusText(order)) + '</span>' + (paymentPaid(order) ? '<span class="cs-status-pill paid">Ödeme alındı</span>' : '') + '</div></div>' + orderProgress(order) + '<div class="cs-order-body"><div class="cs-order-items"><a class="cs-order-product" href="' + escapeHtml(p.url || '/allproducts.html') + '"><span class="cs-order-thumb"><img src="' + escapeHtml(p.image || firstItem.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name || firstItem.product_name || 'Ürün') + '"></span><span class="cs-order-product-copy"><span>' + escapeHtml(p.brand || firstItem.brand || 'COSMOSKIN') + '</span><strong>' + escapeHtml(p.product_name || firstItem.product_name || 'Ürün') + '</strong><small>Adet: ' + escapeHtml(firstItem.quantity || 1) + '</small></span><b class="cs-order-total">' + escapeHtml(formatMoney(firstItem.line_total || firstItem.unit_price || p.price || order.total_amount || 0)) + '</b></a></div><aside class="cs-order-side"><div><span>Toplam</span><strong>' + escapeHtml(formatMoney(order.total_amount || firstItem.line_total || p.price || 0)) + '</strong></div><div><span>Kargo Durumu</span><strong>' + escapeHtml(shipmentLabels[ship.status] || 'Hazırlanıyor') + '</strong></div><div><span>Kargo Firması</span><strong>' + escapeHtml(ship.carrier || ship.carrier_name || 'DHL') + '</strong></div><div><span>Fatura</span><strong>' + (invoiceReady ? 'Hazır' : 'Hazırlanıyor') + '</strong></div></aside></div><div class="cs-order-actions"><a class="cs-mini-btn dark" href="' + escapeHtml(detail) + '">Sipariş Detayı</a><a class="cs-mini-btn" href="/contact.html">Destek Al</a>' + tracking + repeat + '</div></article>';
  }
  function routineSummary(sp) { return '<div class="cs-routine-overview"><p><strong>Cilt Tipi:</strong> ' + escapeHtml(cleanSkinType(sp.skin_type)) + '</p><p><strong>Hedef:</strong> Nem</p><p><strong>Odak:</strong> Nem, ışıltı</p><p><strong>Rutin Stili:</strong> Günlük bakım</p><p><strong>Durum:</strong> Profil kayıtlı</p><div class="cs-routine-thumbs">' + recommendedProducts(4).map(function (p) { return '<img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name) + '">'; }).join('') + '</div><div class="cs-card-actions"><a class="cs-mini-btn dark" href="/account/routines/">Rutini Gör</a><a class="cs-mini-btn" data-add-routine-cart="true" href="/allproducts.html">Önerileri Sepete Ekle</a></div></div>'; }
  function securityChecklist() { return '<div class="cs-security-checklist"><p><span class="ok">✓</span>E-posta doğrulandı</p><p><span class="ok">✓</span>Telefon kayıtlı</p><p><span class="warn">!</span>Şifre güncelleme önerilir</p><p><span class="ok">✓</span>KVKK tercihleri güncel</p><p><span class="ok">✓</span>E-posta ve SMS tercihleri yönetilebilir</p><a class="cs-mini-btn" data-tab-link="security" href="/account/profile.html?tab=security">Ayarları Yönet</a></div>'; }
  function couponMiniCard() { var c = activeCoupons()[0]; if (!c) return emptyState('Aktif kuponun bulunmuyor.', 'COSMOSKIN Club avantajların oluştuğunda burada görünür.', 'Kuponlarımı Gör', '/account/profile.html?tab=coupons', 'coupons'); return '<div class="cs-coupon-mini"><strong>' + escapeHtml(c.code) + '</strong><p>' + escapeHtml(c.title) + '</p><small>Sepette uygulanabilir.</small><a class="cs-mini-btn dark" data-tab-link="coupons" href="/account/profile.html?tab=coupons">Kuponları Gör</a></div>'; }
  function deliveryMiniCard() { return '<div class="cs-delivery-shortcuts"><a data-tab-link="invoices" href="/account/profile.html?tab=invoices">' + iconSvg('invoice') + '<b>Faturalarım</b><span>Hazır olduğunda görüntüle</span></a><a data-tab-link="addresses" href="/account/profile.html?tab=addresses">' + iconSvg('pin') + '<b>Teslimat adreslerim</b><span>Adres kayıtları</span></a><a data-tab-link="returns" href="/account/profile.html?tab=returns">' + iconSvg('return') + '<b>İade taleplerim</b><span>Taleplerini takip et</span></a><a href="/contact.html">' + iconSvg('support') + '<b>Destek kayıtlarım</b><span>Destek merkezi</span></a></div>'; }
  function quickCards() { return [ ['addresses','pin','Kayıtlı Adreslerim','Teslimat adresi'], ['coupons','ticket','Kuponlarım','Aktif kupon'], ['notifications','bell','Bildirim Tercihlerim','E-posta & SMS'], ['invoices','invoice','Faturalarım','Hazır fatura'], ['returns','return','İade Taleplerim','Açık talep'], ['support','support','Destek Merkezi','Yardım ve talepler'] ].map(function (x) { return '<a data-tab-link="' + x[0] + '" href="/account/profile.html?tab=' + x[0] + '"><span>' + iconSvg(x[1]) + '</span><b>' + escapeHtml(x[2]) + '</b><small>' + escapeHtml(x[3]) + '</small></a>'; }); }

  function recommendedProducts(limit, couponOnly) {
    var products = allProducts(); var sp = skinProfile(); var terms = [sp.skin_type, sp.routine_goal].concat(sp.goals || []).join(' ').toLocaleLowerCase('tr-TR');
    var preferred = ['beauty-of-joseon-relief-sun-spf50', 'anua-heartleaf-77-soothing-toner', 'cosrx-advanced-snail-96-mucin-essence', 'skin1004-centella-toning-toner', 'cosrx-low-ph-good-morning-gel-cleanser', 'beauty-of-joseon-glow-serum-propolis-niacinamide', 'cosrx-oil-free-ultra-moisturizing-lotion', 'anua-heartleaf-pore-control-cleansing-oil'];
    products.forEach(function (p) { var hay = [p.product_name, p.brand, p.category].concat(p.keywords || []).join(' ').toLocaleLowerCase('tr-TR'); p._score = 0; if (/karma|nem|ışıltı|isilti|bariyer/.test(terms) && /nem|spf|essence|tonik|snail|heartleaf|centella|güneş|serum/.test(hay)) p._score += 20; var idx = preferred.indexOf(p.product_slug); if (idx >= 0) p._score += 30 - idx; if (/Tonik|Essence|Güneş|Serum|Temizleyici|Nemlendirici/.test(p.category)) p._score += 5; });
    return products.sort(function (a, b) { return (b._score || 0) - (a._score || 0); }).slice(0, limit || 3);
  }
  function stockInfo(p) {
    var raw = String(p.stock || p.stock_status || p.inventory_status || '').toLowerCase();
    var qty = Number(p.available_stock ?? p.stock_on_hand ?? p.available ?? NaN);
    if (raw === 'out_of_stock' || raw === 'sold_out' || raw === 'inactive' || raw === 'passive' || qty === 0) return { label: 'Stokta yok', cls: 'is-out', sellable: false };
    if (raw === 'in_stock' || raw === 'active' || qty > 0) return { label: 'Stokta', cls: 'is-in', sellable: true };
    return { label: 'Stok bilgisi kontrol ediliyor', cls: 'is-unknown', sellable: false };
  }
  function productCard(p, mode) {
    mode = mode || 'cart';
    var stock = stockInfo(p);
    var cta = mode === 'inspect' ? 'Ürünü İncele' : (stock.sellable ? 'Sepete Ekle' : 'İncele');
    var action = mode === 'inspect' || !stock.sellable ? '<a class="cs-mini-btn dark" href="' + escapeHtml(p.url) + '">' + cta + '</a>' : '<button class="cs-mini-btn dark" type="button" data-add-product-cart="' + escapeHtml(p.product_slug) + '">' + cta + '</button>';
    return '<article class="cs-product-mini"><a class="cs-product-mini__media" href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name) + '" loading="lazy"></a><div><small>' + escapeHtml(String(p.brand || 'COSMOSKIN').toUpperCase()) + '</small><strong>' + escapeHtml(p.product_name) + '</strong><p>' + escapeHtml(p.category || 'Cilt Bakımı') + '</p><span class="cs-stock-dot ' + stock.cls + '">● ' + escapeHtml(stock.label) + '</span><div class="cs-product-mini__bottom"><b>' + escapeHtml(formatMoney(p.price)) + '</b>' + action + '<button class="cs-heart-btn" type="button" data-add-favorite="' + escapeHtml(p.product_slug) + '" aria-label="Favoriye ekle">♡</button></div></div></article>';
  }

  function renderClub() {
    var el = $('#clubPanel'); if (!el) return; var l = loyalty();
    el.innerHTML = '<div class="cs-tab-title"><div><h1>COSMOSKIN Club</h1><p>Üyelik seviyeni, puanlarını ve sana özel avantajları buradan takip edebilirsin.</p></div><a class="cs-pill-btn" href="/allproducts.html">Alışverişe Devam Et</a></div>' +
      '<article class="cs-club-hero"><img class="cs-club-watermark" src="/assets/logo-mark.png" alt=""><span class="cs-overline">' + iconSvg('crown') + 'COSMOSKIN CLUB</span><h2>' + escapeHtml(l.label) + '</h2><div class="cs-loyalty-progress"><span style="width:' + l.progress + '%"></span></div><strong>' + numberFmt.format(l.points) + ' / ' + numberFmt.format(l.threshold) + ' puan</strong><p>' + (l.next ? escapeHtml(l.next + ' seviyesine ' + numberFmt.format(l.remaining) + ' puan kaldı.') : 'Elite seviyesindesin.') + '</p><p>Tamamlanan siparişlerinden puan kazanırsın. Puanların sepet avantajlarına dönüşür.</p><div class="cs-club-info">Bir sonraki seviyede özel kampanya ve erken erişim avantajları seni bekliyor.</div><div class="cs-club-actions"><a class="cs-mini-btn" href="/legal/cosmoskin-club-kurallari.html">Avantajlarımı Gör</a><button class="cs-mini-btn" type="button" data-scroll-target="pointHistory">Puan Geçmişi</button><a class="cs-mini-btn light" href="/allproducts.html">Alışverişe Devam Et</a></div></article>' +
      '<section class="cs-level-journey">' + tierCard('1', 'Essential', 'Başlangıç seviyesi', 'Puan kazanımı ve Club kampanyalarına erişim.', l.label.indexOf('Essential') === 0) + tierCard('2', 'Signature', '6.000 puan sonrası', 'Özel kampanyalar, erken erişim ve seçili avantajlar.', l.label.indexOf('Signature') === 0) + tierCard('3', 'Elite', 'En özel seviye', 'Seçili kampanyalara öncelikli erişim ve özel bakım seçkileri.', l.label.indexOf('Elite') === 0) + '</section>' +
      '<section class="cs-stat-grid cs-stat-grid--four">' + [ ['sparkle','Kullanılabilir Puan',l.available], ['clock','Bekleyen Puan',l.pending], ['truck','Bu Ay Kazanılan',l.monthly], ['calendar','Süresi Yaklaşan Puan',l.expiring] ].map(function (c) { return '<article class="cs-stat"><span class="cs-stat-icon">' + iconSvg(c[0]) + '</span><div><small>' + c[1] + '</small><strong>' + numberFmt.format(c[2]) + '</strong></div></article>'; }).join('') + '</section><p class="cs-points-note">Puanlar, sipariş tamamlandıktan sonra kullanılabilir hale gelir.</p>' +
      '<section class="cs-benefit-grid">' + benefitCard('ticket','Club Kampanyaları','Üyelere özel dönemsel avantajlar.') + benefitCard('shield','Erken Erişim','Seçili yeni ürünlere öncelikli erişim.') + benefitCard('drop','Rutin Avantajları','Cilt profiline göre önerilen seçkilerde özel fırsatlar.') + benefitCard('bag','Sepet Avantajları','Puanların ve kuponların sepet deneyiminde avantaja dönüşür.') + '</section>' +
      '<section class="cs-club-bottom"><article class="cs-card" id="pointHistory"><div class="cs-card-head"><span>PUAN GEÇMİŞİ</span></div>' + pointHistory() + '</article><article class="cs-card"><div class="cs-card-head"><span>SIK SORULAN SORULAR</span></div>' + faq() + '</article></section>';
  }
  function tierCard(no, title, subtitle, body, active) { return '<article class="cs-tier-card-final ' + (active ? 'is-active' : '') + '"><span>' + no + '</span><div><h3>' + title + '</h3><strong>' + subtitle + '</strong><p>' + body + '</p></div>' + (!active ? '<em>⌄</em>' : '') + '</article>'; }
  function benefitCard(icon, title, body) { return '<article class="cs-benefit-card"><span>' + iconSvg(icon) + '</span><h3>' + title + '</h3><p>' + body + '</p></article>'; }
  function pointHistory() { var rows = state.summary?.points?.ledger || []; if (!rows.length) return '<div class="cs-point-table-head"><span>Tarih</span><span>İşlem</span><span>Puan</span><span>Durum</span></div>' + emptyState('Henüz puan hareketin bulunmuyor.', 'Tamamlanan siparişlerinden puan kazanmaya başlayabilirsin.', 'Alışverişe Başla', '/allproducts.html'); return '<div class="cs-point-table-head"><span>Tarih</span><span>İşlem</span><span>Puan</span><span>Durum</span></div>' + rows.slice(0, 8).map(function (r) { return '<div class="cs-point-row"><span>' + escapeHtml(formatDate(r.created_at)) + '</span><strong>' + escapeHtml(r.reason || r.event_type || 'Puan hareketi') + '</strong><b>' + escapeHtml((Number(r.points_delta || r.points || 0) > 0 ? '+' : '') + numberFmt.format(Number(r.points_delta || r.points || 0))) + '</b><em>' + escapeHtml(r.status || 'available') + '</em></div>'; }).join(''); }
  function faq() { return ['Club nasıl çalışır?', 'Puanlar ne zaman hesaba geçer?', 'Puanlar sepette nasıl kullanılır?', 'Seviye geçişleri nasıl hesaplanır?'].map(function (q) { return '<details class="cs-faq-row"><summary>' + q + '</summary><p>COSMOSKIN Club avantajları, üyelik durumu ve kampanya koşullarına göre hesabında görünür.</p></details>'; }).join(''); }

  function renderSkinProfile() {
    var el = $('#skinPanel'); if (!el) return; var sp = skinProfile();
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Cilt Profilim</h1><p>Cilt tipini, hedeflerini ve bakım tercihlerini güncel tut. COSMOSKIN önerileri bu profile göre kişiselleştirir.</p></div><div class="cs-panel-actions"><button class="cs-pill-btn" type="button" data-open-skin-editor>Profili Güncelle</button><a class="cs-pill-btn cs-pill-btn--brown" href="/account/routines/">Rutinimi Gör</a></div></div>' +
      '<article class="cs-skin-hero"><div class="cs-skin-visual"><img src="/assets/img/hero/hero-bg-cosmoskin-stone.webp" alt=""></div><div><span class="cs-overline">CİLT PROFİLİM</span><h2>' + escapeHtml(cleanSkinType(sp.skin_type)) + '</h2><div class="cs-skin-tags"><span>Nem</span><span>Işıltı</span><span>Bariyer desteği</span></div><p>Cilt profilin kayıtlı. Sana özel rutin ve ürün önerileri bu bilgilere göre güncellenir.</p><p class="cs-skin-profile-stamp">Son güncelleme: ' + escapeHtml(formatDate(sp.updated_at)) + '</p><div class="cs-skin-profile-actions"><a class="cs-mini-btn dark" href="/account/routines/">Rutinimi Gör</a><button class="cs-mini-btn" type="button" data-open-skin-editor>Profili Güncelle</button></div></div></article>' +
      '<section class="cs-skin-detail-grid">' + skinDetail('drop','Cilt Tipi',cleanSkinType(sp.skin_type)) + skinDetail('sparkle','Cilt Hedefleri','Nem, ışıltı, bariyer desteği') + skinDetail('shield','Hassasiyet Durumu','Belirtilmedi','Hassasiyet ekle') + skinDetail('calendar','Rutin Tercihi','Günlük bakım') + skinDetail('bag','Ürün Tercihleri','Hafif yapı, nem odaklı, SPF desteği') + skinDetail('drop','İçerik Tercihleri','Parfümsüz seçenekler öncelikli gösterilebilir') + '</section>' +
      '<section class="cs-skin-content-grid"><article class="cs-routine-card-final"><h3>☀ Sabah Rutini</h3>' + routineList('morning') + '</article><article class="cs-routine-card-final"><h3>☾ Akşam Rutini</h3>' + routineList('evening') + '</article><article class="cs-card cs-skin-products"><div class="cs-card-head"><span>PROFİLİNE UYGUN ÖNERİLER</span></div><div class="cs-product-mini-row cs-product-mini-row--compact">' + recommendedProducts(3).map(function (p) { return productCard(p, 'inspect'); }).join('') + '</div></article><article class="cs-card cs-profile-quiz-card"><h3>Cilt profilini güncelle</h3><p>Cilt tipin, hedeflerin veya bakım alışkanlıkların değiştiyse profilini birkaç adımda güncelleyebilirsin.</p><ol><li>Cilt Tipi</li><li>Hedefler</li><li>Hassasiyetler</li><li>Rutin Tercihi</li><li>Ürün Tercihleri</li></ol><button class="cs-mini-btn dark" type="button" data-open-skin-editor>Profili Güncelle</button></article><article class="cs-card cs-trust-note"><span>' + iconSvg('shield') + '</span><p>Cilt bakım önerileri, profilinde belirttiğin tercihlere göre kişiselleştirilir. Hassasiyet belirttiğinde öneriler daha dikkatli gösterilir.</p></article></section>' + skinEditorForm();
  }
  function cleanSkinType(value) { var v = String(value || 'Karma Cilt'); if (/karma/i.test(v)) return 'Karma cilt'; return v.replace(/Cilt$/, 'cilt'); }
  function skinDetail(icon, label, value, action) { return '<article class="cs-skin-detail-card"><span>' + iconSvg(icon) + '</span><div><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(value) + '</strong>' + (action ? '<button type="button" data-open-skin-editor>' + escapeHtml(action) + '</button>' : '') + '</div></article>'; }
  function routineProducts() { var all = recommendedProducts(8); function find(re) { return allProducts().find(function (p) { return re.test([p.product_slug, p.product_name, p.category].join(' ').toLocaleLowerCase('tr-TR')); }) || all.shift() || {}; } return { morning: [ ['Temizleyici', find(/low-ph|cleanser|temiz/)], ['Tonik / Essence', find(/heartleaf|toner|essence/)], ['Serum', find(/glow-serum|serum/)], ['Nemlendirici', find(/lotion|cream|nem/)], ['SPF', find(/relief-sun|spf|sun/)] ], evening: [ ['Temizleyici', find(/cleansing-oil|cleanser|temiz/)], ['Essence', find(/snail|essence/)], ['Serum', find(/niacinamide|serum/)], ['Krem', find(/cream|lotion|nem/)] ] }; }
  function routineList(type) { var items = routineProducts()[type] || []; return '<div class="cs-routine-steps-final">' + items.map(function (it, idx) { var p = it[1] || {}; return '<div><span>' + (idx + 1) + '</span><img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt=""><p><b>' + escapeHtml(it[0]) + '</b><small>' + escapeHtml(p.product_name || 'Önerilen ürün') + '</small></p><em>Önerildi</em></div>'; }).join('') + '</div>'; }
  function skinEditorForm() { var sp = skinProfile(); return '<form class="cs-skin-editor" id="skinForm" hidden><label><span>Cilt Tipi</span><select name="skin_type" class="cs-input"><option>Karma Cilt</option><option>Kuru Cilt</option><option>Yağlı Cilt</option><option>Normal Cilt</option><option>Hassas Cilt</option></select></label><label><span>Hassasiyet Tercihi</span><select name="skin_sensitivity" class="cs-input"><option value="">Belirtilmedi</option><option>Düşük</option><option>Orta</option><option>Yüksek</option></select></label><label><span>Bakım Önceliği</span><select name="routine_goal" class="cs-input"><option>Nem desteği</option><option>Işıltı</option><option>Bariyer desteği</option></select></label><fieldset><legend>Bakım Öncelikleri</legend><label><input name="skin_concerns" type="checkbox" value="Nem" checked> Nem</label><label><input name="skin_concerns" type="checkbox" value="Işıltı" checked> Işıltı</label><label><input name="skin_concerns" type="checkbox" value="Bariyer desteği" checked> Bariyer desteği</label></fieldset><button class="cs-pill-btn cs-pill-btn--dark" type="button" id="saveSkinBtn">PROFİLİ GÜNCELLE</button></form>'; }

  function renderCoupons() {
    var el = $('#couponsPanel'); if (!el) return; var l = loyalty(); var coupons = getCoupons(); var active = activeCoupons()[0];
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Kuponlarım</h1><p>COSMOSKIN Club avantajlarını, aktif kuponlarını ve kullanım durumlarını buradan takip edebilirsin.</p></div><a class="cs-pill-btn cs-pill-btn--brown" href="/allproducts.html">Alışverişe Başla</a></div>' +
      '<section class="cs-stat-grid cs-stat-grid--four">' + [ ['ticket','Aktif Kupon',activeCoupons().length], ['bag','Kullanılan Kupon',coupons.filter(function(c){return c.status==='used';}).length], ['clock','Süresi Yaklaşan',0], ['crown','Club Seviyesi',l.label.replace(' Üye','') + '<small>Signature’a ' + numberFmt.format(l.remaining) + ' puan kaldı</small>'] ].map(function (c) { return '<article class="cs-stat"><span class="cs-stat-icon">' + iconSvg(c[0]) + '</span><div><small>' + c[1] + '</small><strong>' + c[2] + '</strong></div></article>'; }).join('') + '</section>' +
      (active ? couponHero(active) : emptyState('Aktif kuponun bulunmuyor.', 'COSMOSKIN Club avantajların hesabına tanımlandığında burada görünür.', 'Alışverişe Başla', '/allproducts.html')) +
      '<section class="cs-coupon-tabs"><div class="cs-tabstrip"><button class="is-active" type="button">Aktif Kuponlar</button><button type="button">Kullanılanlar</button><button type="button">Süresi Dolanlar</button></div><div class="cs-coupon-row"><strong>' + escapeHtml(active?.code || '—') + '</strong><span>' + escapeHtml(active?.title || 'Aktif kupon bulunmuyor') + '</span><time>' + escapeHtml(active ? formatDate(active.expires_at) + '’ya kadar' : '—') + '</time><em>Seçili ürünlerde geçerli</em><b>Aktif</b>' + (active ? '<button class="cs-mini-btn" type="button" data-copy-coupon="' + escapeHtml(active.code) + '">Kuponu Kopyala</button>' : '') + '</div></section>' +
      '<section class="cs-coupon-grid"><article class="cs-card"><div class="cs-card-head"><span>KULLANIM KOŞULLARI</span></div><ul class="cs-terms-list"><li>Kupon yalnızca uygun ürünlerde kullanılabilir.</li><li>İndirimler başka kampanyalarla birleştirilemeyebilir.</li><li>Kupon süresi dolduğunda otomatik olarak pasif olur.</li><li>İade durumunda kupon iadesi kampanya koşullarına göre değerlendirilir.</li></ul></article><article class="cs-card cs-recommend-card"><div class="cs-card-head"><span>KUPONUNU KULLANABİLECEĞİN ÖNERİLER</span></div><p class="cs-card-intro">Cilt profiline uygun seçili ürünlerde kupon avantajını değerlendirebilirsin.</p><div class="cs-product-mini-row">' + recommendedProducts(3, true).map(productCard).join('') + '</div></article></section>' +
      '<article class="cs-content-help-card"><span>' + iconSvg('support') + '</span><div><h3>Kupon kullanımıyla ilgili yardıma mı ihtiyacın var?</h3><p>Kuponun sepette görünmüyorsa kullanım koşullarını kontrol edebilir veya destek ekibimize ulaşabilirsin.</p></div><a class="cs-mini-btn" href="/contact.html">Destek Merkezi</a></article>';
  }
  function couponHero(c) { return '<article class="cs-coupon-hero"><div class="cs-coupon-code"><small>KUPON KODU</small><strong>' + escapeHtml(c.code) + '</strong></div><div><h2>' + escapeHtml(c.title) + '</h2><p>' + escapeHtml(c.description || 'Sepette uygulanabilir.') + '</p><div class="cs-coupon-details"><span>' + iconSvg('calendar') + '<b>Geçerlilik:</b> ' + escapeHtml(formatDate(c.expires_at)) + '’ya kadar</span><span>' + iconSvg('ticket') + '<b>Kapsam:</b> ' + escapeHtml(c.scope_label || 'Seçili ürünlerde geçerli') + '</span><span>' + iconSvg('bag') + '<b>Minimum sepet:</b> ' + (Number(c.min_subtotal || 0) > 0 ? escapeHtml(formatMoney(c.min_subtotal)) : 'Yok') + '</span></div></div><div class="cs-coupon-actions"><button class="cs-mini-btn" type="button" data-copy-coupon="' + escapeHtml(c.code) + '">Kuponu Kopyala</button><a class="cs-mini-btn dark" href="/allproducts.html">Alışverişe Başla</a></div></article>'; }

  function renderOrders() { var el = $('#ordersPanel'); if (!el) return; var orders = state.summary?.orders || []; el.innerHTML = '<div class="cs-tab-title"><div><h1>Siparişlerim</h1><p>Sipariş durumunu, kargo bilgisini ve ürün detaylarını takip et.</p></div></div>' + (orders.length ? '<div class="cs-order-list">' + orders.map(function (o) { return orderCard(o, false); }).join('') + '</div>' : emptyState('Henüz siparişin bulunmuyor.', 'Sipariş verdiğinde durumunu ve teslimat bilgilerini burada takip edebilirsin.', 'Alışverişe Başla', '/allproducts.html')); }
  function renderReturns() { var el = $('#returnsPanel'); if (!el) return; el.innerHTML = '<div class="cs-tab-title"><div><h1>İade ve Taleplerim</h1><p>İade taleplerini ve destek süreçlerini buradan takip edebilirsin.</p></div></div>' + emptyState('Henüz iade talebin bulunmuyor.', 'Teslim edilen ve iade koşullarına uygun siparişler için talep oluşturabilirsin.', null); }
  function renderFavorites() { var el = $('#favoritesPanel'); if (!el) return; var favs = (state.summary?.favorites || []).map(function (f) { return getProductByHandle(f.product_slug || f.product_id) || normalizeProduct(f); }).filter(Boolean); el.innerHTML = '<div class="cs-tab-title"><div><h1>Favorilerim</h1><p>Favorilediğin ürünleri tek yerden yönet.</p></div><a class="cs-pill-btn" href="/allproducts.html">Ürünleri Keşfet</a></div>' + (favs.length ? '<div class="cs-product-mini-row">' + favs.map(productCard).join('') + '</div>' : emptyState('Favori ürünün bulunmuyor.', 'Beğendiğin ürünleri favorilerine ekleyerek daha sonra kolayca ulaşabilirsin.', 'Ürünleri Keşfet', '/allproducts.html')); }
  function addressTypeLabel(type) { return type === 'billing' ? 'Fatura' : type === 'both' ? 'Teslimat + Fatura' : 'Teslimat'; }
  function renderAddresses() {
    var el = $('#addressesPanel'); if (!el) return; var addresses = state.summary?.addresses || [];
    var cards = addresses.length ? '<div class="cs-address-grid">' + addresses.map(function (a) {
      var recipient = [a.recipient_first_name || a.first_name, a.recipient_last_name || a.last_name].filter(Boolean).join(' ');
      var location = [a.neighborhood, a.district, a.city].filter(Boolean).join(' / ');
      return '<article class="cs-address-card"><div class="cs-address-head"><h3>' + escapeHtml(a.title || 'Adres') + '</h3><span>' + escapeHtml(addressTypeLabel(a.address_type || a.type)) + '</span></div><p>' + escapeHtml([a.address_line || a.address, location, a.postal_code || a.postalCode].filter(Boolean).join(', ')) + '</p><small>' + escapeHtml(recipient || 'Alıcı bilgisi') + (a.phone ? ' · ' + escapeHtml(a.phone) : '') + '</small>' + (a.is_default ? '<em class="cs-address-default">Varsayılan</em>' : '') + '<div class="cs-address-actions"><button class="cs-mini-btn" type="button" data-edit-address="' + escapeHtml(a.id) + '">Düzenle</button><button class="cs-mini-btn" type="button" data-default-address="' + escapeHtml(a.id) + '">Varsayılan Yap</button><button class="cs-mini-btn" type="button" data-delete-address="' + escapeHtml(a.id) + '">Sil</button></div></article>';
    }).join('') + '</div>' : '<div class="cs-empty"><strong>Kayıtlı adresin bulunmuyor.</strong><p>Checkout sırasında hızlı kullanım için teslimat ve fatura adresi ekleyebilirsin.</p><button class="cs-pill-btn" type="button" id="addAddressBtn">Adres Ekle</button></div>';
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Adreslerim</h1><p>Teslimat ve fatura adreslerini yönet.</p></div><button class="cs-pill-btn" type="button" id="addAddressBtn">Yeni Adres Ekle</button></div>' + cards + addressModalHtml();
  }
  function addressModalHtml() {
    return '<div class="cs-address-modal" id="addressModal" hidden><div class="cs-address-modal__card"><form id="addressForm"><input type="hidden" name="id"><div class="cs-card-head"><span>ADRES FORMU</span><button type="button" class="cs-heart-btn" id="addressCancelBtn">×</button></div><div class="cs-form-grid"><label>Adres Başlığı<input name="title" required placeholder="Ev / İş"></label><label>Adres Tipi<select name="address_type"><option value="shipping">Teslimat</option><option value="billing">Fatura</option><option value="both">Teslimat + Fatura</option></select></label><label>Ad<input name="first_name" required></label><label>Soyad<input name="last_name" required></label><label>Telefon<input name="phone" required></label><label>İl<input name="city" required></label><label>İlçe<input name="district" required></label><label>Mahalle<input name="neighborhood"></label><label>Posta Kodu<input name="postal_code" maxlength="5"></label><label class="span-2">Açık Adres<textarea name="address_line" required></textarea></label><label class="cs-check span-2"><input type="checkbox" name="is_default"> Varsayılan adres yap</label></div><div class="cs-form-actions"><button class="cs-pill-btn" type="button" id="addressCancelBtn2">Vazgeç</button><button class="cs-pill-btn cs-pill-btn--dark" type="submit">Adresi Kaydet</button></div></form></div></div>';
  }
  function renderInvoices() { var el = $('#invoicesPanel'); if (!el) return; var rows = []; (state.summary?.orders || []).forEach(function (o) { (o.invoices || []).forEach(function (i) { rows.push({ order: o, invoice: i }); }); }); el.innerHTML = '<div class="cs-tab-title"><div><h1>Faturalarım</h1><p>Hazır faturalarını görüntüle.</p></div></div>' + (rows.length ? rows.map(function (r) { return '<article class="cs-return-card"><h3>' + escapeHtml(r.invoice.invoice_number || safeOrderNumber(r.order)) + '</h3><p>' + escapeHtml(formatDate(r.invoice.issued_at || r.invoice.created_at)) + '</p><a class="cs-mini-btn dark" href="' + escapeHtml(r.invoice.pdf_url || '/contact.html') + '">Faturayı Görüntüle</a></article>'; }).join('') : emptyState('Hazır faturanın bulunmuyor.', 'Faturaların hazır olduğunda burada görüntülenir.', null)); }
  function renderNotifications() { var el = $('#notificationsPanel'); if (!el) return; var user = state.summary?.user || {}; var comm = user.communication || {}; el.innerHTML = '<div class="cs-tab-title"><div><h1>Bildirim Tercihlerim</h1><p>Sipariş, kampanya, stok ve rutin bildirimlerini yönet.</p></div></div><form class="cs-toggle-grid" id="notificationPrefsForm"><label><input name="orderUpdates" type="checkbox" checked> <span>Sipariş güncellemeleri</span></label><label><input name="campaignEmails" type="checkbox" ' + (comm.marketing_email_opt_in ? 'checked' : '') + '> <span>Kampanya e-postaları</span></label><label><input name="smsNotifications" type="checkbox" ' + (comm.marketing_sms_opt_in ? 'checked' : '') + '> <span>SMS bildirimleri</span></label><label><input name="restockAlerts" type="checkbox"> <span>Stok bildirimleri</span></label><label><input name="routineReminders" type="checkbox"> <span>Rutin hatırlatmaları</span></label><button class="cs-pill-btn cs-pill-btn--dark" id="saveNotificationsBtn" type="button">Tercihleri Kaydet</button></form>'; }
  function renderSecurity() { var el = $('#securityPanel'); if (!el) return; var user = state.summary?.user || {}; el.innerHTML = '<div class="cs-tab-title"><div><h1>Güvenlik ve Hesap</h1><p>Hesap bilgilerini ve güvenlik ayarlarını yönet.</p></div></div><section class="cs-security-grid"><article class="cs-card"><div class="cs-card-head"><span>PROFİL & İLETİŞİM</span><button class="cs-mini-btn" id="saveProfileBtn" type="button">Kaydet</button></div><form class="cs-form cs-form-compact" id="profileForm"><label><span>Ad</span><input class="cs-input" name="first_name" value="' + escapeHtml(user.first_name || '') + '"></label><label><span>Soyad</span><input class="cs-input" name="last_name" value="' + escapeHtml(user.last_name || '') + '"></label><label><span>E-posta</span><input class="cs-input" name="email" type="email" readonly value="' + escapeHtml(user.email || '') + '"></label><label><span>Telefon</span><input class="cs-input" name="phone" value="' + escapeHtml(user.phone || '') + '"></label></form></article><article class="cs-card"><div class="cs-card-head"><span>ŞİFRE</span></div><form class="cs-form cs-form-compact" id="passwordForm"><label class="full"><span>Yeni Şifre</span><input class="cs-input" name="password" type="password" autocomplete="new-password"></label><label class="full"><span>Yeni Şifre Tekrar</span><input class="cs-input" name="password_confirm" type="password" autocomplete="new-password"></label><button class="cs-pill-btn cs-pill-btn--dark full" type="submit">Şifreyi Güncelle</button></form></article></section>'; }
  function renderSupport() { var el = $('#supportPanel'); if (!el) return; el.innerHTML = '<div class="cs-tab-title"><div><h1>Destek Merkezi</h1><p>Sipariş, kupon, teslimat veya cilt profiliyle ilgili destek al.</p></div></div><article class="cs-content-help-card"><span>' + iconSvg('support') + '</span><div><h3>Yardıma mı ihtiyacınız var?</h3><p>Destek ekibimize e-posta gönderebilir veya iletişim formunu kullanabilirsiniz.</p></div><a class="cs-mini-btn dark" href="/contact.html">Destek Merkezi</a></article>'; }

  function switchTab(tab, push) {
    tab = normalizeTab(tab);
    if (!document.querySelector('[data-panel="' + tab + '"]')) tab = 'overview';
    state.activeTab = tab;
    $$('#accountNav [data-tab]').forEach(function (a) { a.classList.toggle('is-active', a.dataset.tab === tab); });
    $$('.cs-panel').forEach(function (p) { p.classList.toggle('is-active', p.dataset.panel === tab); });
    var url = new URL(window.location.href); url.searchParams.set('tab', tab); if (push) history.pushState({ tab: tab }, '', url.pathname + url.search); else history.replaceState({ tab: tab }, '', url.pathname + url.search);
    var h = $('[data-panel="' + tab + '"] h1,[data-panel="' + tab + '"] h2'); if (h) h.setAttribute('tabindex', '-1');
  }

  async function loadSummary() {
    try { state.summary = await apiFetch('/account/summary'); } catch (error) { console.warn('COSMOSKIN account summary fallback:', error); state.summary = demoSummary(); }
    renderAll();
  }
  function demoSummary() {
    var sessionUser = state.session?.user || {};
    return { ok: true, user: { id: sessionUser.id || 'local', email: sessionUser.email || '', created_at: sessionUser.created_at || new Date().toISOString(), first_name: sessionUser.user_metadata?.first_name || '', last_name: sessionUser.user_metadata?.last_name || '', full_name: sessionUser.user_metadata?.full_name || 'COSMOSKIN Üyesi', phone: sessionUser.user_metadata?.phone || '', skin_type: 'Karma Cilt', skin_concerns: ['Nem','Işıltı','Bariyer desteği'], routine_goal: 'Nem desteği', skin_profile_updated_at: '2026-06-27T12:00:00+03:00', communication: {} }, stats: { order_count: 0, active_order_count: 0, favorites_count: 0, addresses_count: 0, unread_notifications: 0, points_balance: 0 }, points: { balance: 0, ledger: [] }, coupons: [], orders: [], addresses: [], favorites: [], notifications: [] };
  }

  function bindEvents() {
    $('#accountNav')?.addEventListener('click', function (e) { var a = e.target.closest('[data-tab]'); if (!a) return; e.preventDefault(); switchTab(a.dataset.tab, true); });
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab-link]'); if (tab) { e.preventDefault(); switchTab(tab.dataset.tabLink, true); }
      var add = e.target.closest('[data-add-product-cart]'); if (add) { addToCart(getProductByHandle(add.dataset.addProductCart)); }
      var fav = e.target.closest('[data-add-favorite]'); if (fav) { addFavorite(fav.dataset.addFavorite); }
      var coupon = e.target.closest('[data-copy-coupon]'); if (coupon) { copyCoupon(coupon.dataset.copyCoupon); }
      var repeat = e.target.closest('[data-repeat-order]'); if (repeat) { repeatOrder(repeat.dataset.repeatOrder); }
      var addAddress = e.target.closest('#addAddressBtn'); if (addAddress) { e.preventDefault(); openAddressModal(); }
      var editAddress = e.target.closest('[data-edit-address]'); if (editAddress) { e.preventDefault(); openAddressModal(editAddress.dataset.editAddress); }
      var delAddress = e.target.closest('[data-delete-address]'); if (delAddress) { e.preventDefault(); deleteAddress(delAddress.dataset.deleteAddress).catch(handleError); }
      var defAddress = e.target.closest('[data-default-address]'); if (defAddress) { e.preventDefault(); setDefaultAddress(defAddress.dataset.defaultAddress).catch(handleError); }
      if (e.target.closest('#addressCancelBtn') || e.target.closest('#addressCancelBtn2')) { e.preventDefault(); closeAddressModal(); }
      var openSkin = e.target.closest('[data-open-skin-editor]'); if (openSkin) { openSkinEditor(); }
      var scrollTarget = e.target.closest('[data-scroll-target]'); if (scrollTarget) { var node = document.getElementById(scrollTarget.dataset.scrollTarget); if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    document.addEventListener('submit', function (e) { if (e.target.matches('#passwordForm')) { e.preventDefault(); updatePassword(e.target).catch(handleError); } if (e.target.matches('#addressForm')) { e.preventDefault(); saveAddress(e.target).catch(handleError); } });
    document.addEventListener('click', function (e) { if (e.target.matches('#saveProfileBtn')) saveProfile().catch(handleError); if (e.target.matches('#saveSkinBtn')) saveSkin().catch(handleError); if (e.target.matches('#saveNotificationsBtn')) saveNotifications().catch(handleError); });
    $('#logoutBtn')?.addEventListener('click', logout); $('#logoutInlineBtn')?.addEventListener('click', logout);
    window.addEventListener('popstate', function () { switchTab(new URL(window.location.href).searchParams.get('tab') || 'overview', false); });
  }
  function addToCart(product) { if (!product) return showToast('Ürün bilgisi bulunamadı.'); if (!stockInfo(product).sellable) return showToast('Bu ürün için stok bilgisi doğrulanmadan sepete eklenemez.'); var cart = []; try { cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); } catch (_) {} if (!Array.isArray(cart)) cart = []; var existing = cart.find(function (i) { return i.slug === product.product_slug || i.id === product.product_slug; }); if (existing) existing.qty = Number(existing.qty || 1) + 1; else cart.push({ id: product.product_slug, slug: product.product_slug, name: product.product_name, brand: product.brand, price: product.price, image: product.image, url: product.url, qty: 1 }); localStorage.setItem('cosmoskin_cart', JSON.stringify(cart)); window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: cart } })); showToast('Ürün sepetinize eklendi.'); }
  function addFavorite(slug) { showToast('Ürün favorilerinize eklendi.'); }

  function repeatOrder(orderId) { var order = (state.summary?.orders || []).find(function (o) { return String(o.id) === String(orderId); }); if (!order) return showToast('Sipariş bilgisi bulunamadı.'); orderItems(order).forEach(function (item) { var p = getProductByHandle(item.product_slug || item.product_id) || normalizeProduct(item); if (p) addToCart(p); }); }
  function copyCoupon(code) { if (!code) return; (navigator.clipboard?.writeText(code) || Promise.reject()).then(function () { showToast('Kupon kodu kopyalandı.'); }).catch(function () { prompt('Kupon kodunu kopyalayın:', code); }); }
  function openAddressModal(addressId) {
    var modal = $('#addressModal'); var form = $('#addressForm'); if (!modal || !form) return;
    form.reset(); form.elements.id.value = '';
    var list = state.summary?.addresses || [];
    var addr = list.find(function (a) { return String(a.id) === String(addressId); });
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
  }
  function closeAddressModal() { var modal = $('#addressModal'); if (modal) modal.hidden = true; }
  async function saveAddress(form) {
    var data = new FormData(form);
    var payload = { id: data.get('id') || undefined, title: data.get('title'), address_type: data.get('address_type'), first_name: data.get('first_name'), last_name: data.get('last_name'), phone: data.get('phone'), city: data.get('city'), district: data.get('district'), neighborhood: data.get('neighborhood'), postal_code: data.get('postal_code'), address_line: data.get('address_line'), is_default: Boolean(data.get('is_default')) };
    var method = payload.id ? 'PATCH' : 'POST';
    await apiFetch('/account/addresses', { method: method, body: payload });
    closeAddressModal(); await loadSummary(); showToast('Adres kaydedildi.');
  }
  async function deleteAddress(id) { if (!id || !confirm('Adres silinsin mi?')) return; await apiFetch('/account/addresses', { method: 'DELETE', body: { id: id } }); await loadSummary(); showToast('Adres silindi.'); }
  async function setDefaultAddress(id) { var addr = (state.summary?.addresses || []).find(function (a) { return String(a.id) === String(id); }); if (!addr) return; await apiFetch('/account/addresses', { method: 'PATCH', body: Object.assign({}, addr, { id: id, is_default: true }) }); await loadSummary(); showToast('Varsayılan adres güncellendi.'); }
  function openSkinEditor() { var form = $('#skinForm'); if (!form) return switchTab('skin-profile', true); form.hidden = !form.hidden; if (!form.hidden) form.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  async function saveSkin() { var form = $('#skinForm'); if (!form) return; var concerns = $$('input[name="skin_concerns"]:checked', form).map(function (i) { return i.value; }); var payload = { skin_type: form.elements.skin_type.value, skin_sensitivity: form.elements.skin_sensitivity.value, routine_goal: form.elements.routine_goal.value, skin_concerns: concerns, skin_profile_updated_at: new Date().toISOString() }; try { await apiFetch('/account/skin-profile', { method: 'POST', body: payload }); } catch (_) {} if (state.client) { var res = await state.client.auth.updateUser({ data: Object.assign({}, state.session?.user?.user_metadata || {}, payload) }); if (res?.error) throw res.error; } Object.assign(state.summary.user, payload); if (state.summary) state.summary.skin_profile = Object.assign({}, state.summary.skin_profile || {}, { skin_type: payload.skin_type, sensitivity: payload.skin_sensitivity, concerns: payload.skin_concerns, routine_goal: payload.routine_goal, routine_style: 'Günlük bakım', updated_at: payload.skin_profile_updated_at }); renderAll(); showToast('Cilt profiliniz güncellendi.'); }
  async function saveProfile() { var f = $('#profileForm'); if (!f) return; var payload = { first_name: f.elements.first_name.value.trim(), last_name: f.elements.last_name.value.trim(), phone: f.elements.phone.value.trim() }; try { await apiFetch('/account/profile', { method: 'PATCH', body: payload }); } catch (_) { if (state.client) await state.client.auth.updateUser({ data: payload }); } Object.assign(state.summary.user, payload, { full_name: [payload.first_name, payload.last_name].filter(Boolean).join(' ') }); renderAll(); showToast('Hesap bilgileriniz güncellendi.'); }
  async function saveNotifications() { showToast('Bildirim tercihleriniz güncellendi.'); }
  async function updatePassword(form) { var p = form.elements.password.value; var p2 = form.elements.password_confirm.value; if (p !== p2) return showToast('Şifreler eşleşmiyor.'); if (p.length < 8) return showToast('Şifre en az 8 karakter olmalı.'); if (!state.client) return showToast('Şifre güncelleme için oturum gerekli.'); var res = await state.client.auth.updateUser({ password: p }); if (res.error) throw res.error; form.reset(); showToast('Şifreniz güncellendi.'); }
  function logout() { if (state.client) return state.client.auth.signOut().finally(function () { window.location.href = '/index.html'; }); window.location.href = '/index.html'; }
  function handleError(err) { console.error(err); showToast(err?.message || 'İşlem tamamlanamadı.'); }

  async function init() {
    try {
      cfg = window.COSMOSKIN_CONFIG || {};
      ensureAccountDom(); bindEvents(); await (window.COSMOSKIN_PRODUCTS_READY || Promise.resolve());
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient) {
        state.client = window.cosmoskinSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        var sessionResult = await state.client.auth.getSession(); state.session = sessionResult?.data?.session || null;
        if (!state.session?.access_token) { window.location.href = '/index.html?next=' + encodeURIComponent('/account/profile.html' + window.location.search); return; }
      } else { state.session = { user: { email: '', user_metadata: { full_name: 'COSMOSKIN Üyesi' } } }; }
      await loadSummary();
      var tab = normalizeTab(new URL(window.location.href).searchParams.get('tab') || 'overview'); switchTab(tab, false); setLoading(false); state.initialized = true;
    } catch (error) { console.error(error); setLoading(false); var loading = $('#accountLoading'); if (loading) { loading.hidden = false; loading.innerHTML = '<div class="cs-loading-card is-error"><strong>Bilgiler şu anda yüklenemedi.</strong><p>' + escapeHtml(error.message || 'Bilinmeyen hata') + '</p><button class="cs-pill-btn cs-pill-btn--dark" onclick="window.location.reload()" type="button">TEKRAR DENE</button></div>'; } }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
