(function () {
  'use strict';

  var TOKEN_KEY = 'cosmoskin_admin_token';
  var API_BASE = '/api/admin/orders';
  var STATUS_OPTIONS = [
    ['all', 'Tüm durumlar'],
    ['pending_payment', 'Ödeme Bekliyor'],
    ['paid', 'Ödendi'],
    ['preparing', 'Hazırlanıyor'],
    ['shipped', 'Kargoda'],
    ['delivered', 'Teslim Edildi'],
    ['cancelled', 'İptal'],
    ['payment_failed', 'Ödeme Başarısız'],
    ['refunded', 'İade Edildi'],
    ['partially_refunded', 'Kısmi İade']
  ];

  var STATUS_LABELS = {
    pending_payment: 'Ödeme Bekliyor',
    paid: 'Ödendi',
    preparing: 'Hazırlanıyor',
    shipped: 'Kargoda',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal',
    payment_failed: 'Ödeme Başarısız',
    refunded: 'İade Edildi',
    partially_refunded: 'Kısmi İade'
  };

  var state = {
    orders: [],
    summary: {},
    selectedId: '',
    filters: { status: 'all', email: '', orderNumber: '', query: '', limit: 30, offset: 0 },
    loading: false,
    saving: false,
    lastLoadedAt: null,
    hasMore: false
  };

  var el = {};

  function qs(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }
  function money(value, currency) {
    try {
      return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(value || 0));
    } catch (error) {
      return Number(value || 0).toFixed(2) + ' ' + (currency || 'TRY');
    }
  }
  function dateTime(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }
  function shortDate(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }
  function statusLabel(status) { return STATUS_LABELS[status] || status || '—'; }
  function statusClass(status) { return 'status-badge status-' + String(status || 'pending_payment').replace(/[^a-z0-9_-]/gi, ''); }
  function getSelectedOrder() { return state.orders.find(function (order) { return order.id === state.selectedId; }) || null; }
  function getLatestShipment(order) { return Array.isArray(order && order.shipments) ? order.shipments[0] || null : null; }
  function getLatestPayment(order) { return Array.isArray(order && order.payments) ? order.payments[0] || null : null; }

  function toast(title, message, type) {
    if (!el.toastStack) return;
    var node = document.createElement('div');
    node.className = 'toast ' + (type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : '');
    node.innerHTML = '<strong>' + esc(title) + '</strong><span>' + esc(message || '') + '</span>';
    el.toastStack.appendChild(node);
    window.setTimeout(function () { node.remove(); }, 4600);
  }

  function apiHeaders() {
    return { 'content-type': 'application/json', 'x-admin-token': getToken() };
  }

  function buildQueryParams(loadMore) {
    var params = new URLSearchParams();
    if (state.filters.status && state.filters.status !== 'all') params.set('status', state.filters.status);
    if (state.filters.email) params.set('email', state.filters.email);
    if (state.filters.orderNumber) params.set('order_number', state.filters.orderNumber);
    params.set('limit', String(state.filters.limit));
    params.set('offset', String(loadMore ? state.filters.offset : 0));
    return params;
  }

  async function loadOrders(loadMore) {
    if (!getToken()) return showLogin();
    state.loading = true;
    render();
    try {
      var response = await fetch(API_BASE + '?' + buildQueryParams(loadMore).toString(), { headers: apiHeaders() });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || 'Siparişler alınamadı.');
      var incoming = Array.isArray(data.orders) ? data.orders : [];
      state.orders = loadMore ? state.orders.concat(incoming) : incoming;
      state.summary = data.summary || {};
      state.hasMore = Boolean(data.pagination && data.pagination.hasMore);
      state.filters.offset = loadMore ? state.filters.offset + incoming.length : incoming.length;
      state.lastLoadedAt = new Date();
      if (!state.selectedId && state.orders[0]) state.selectedId = state.orders[0].id;
      if (state.selectedId && !state.orders.some(function (order) { return order.id === state.selectedId; })) {
        state.selectedId = state.orders[0] ? state.orders[0].id : '';
      }
      showApp();
    } catch (error) {
      if (/unauthorized/i.test(error.message || '')) {
        clearToken();
        showLogin('Token geçersiz. Lütfen tekrar giriş yap.');
      } else {
        toast('Siparişler yüklenemedi', error.message || 'Bilinmeyen hata.', 'error');
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function updateOrder(payload) {
    state.saving = true;
    renderDrawer();
    try {
      var response = await fetch(API_BASE, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify(payload) });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || 'Sipariş güncellenemedi.');
      if (data.order) {
        state.orders = state.orders.map(function (order) { return order.id === data.order.id ? data.order : order; });
        state.selectedId = data.order.id;
      }
      var notify = data.notification || {};
      if (payload.notify_customer && notify.sent) {
        toast('Sipariş güncellendi', 'Müşteri bilgilendirme e-postası gönderildi.', 'success');
      } else if (payload.notify_customer && notify.reason) {
        toast('Sipariş güncellendi', 'E-posta atlandı: ' + notify.reason, 'success');
      } else if (payload.notify_customer && notify.error) {
        toast('Sipariş güncellendi', 'E-posta gönderilemedi: ' + notify.error, 'error');
      } else {
        toast('Sipariş güncellendi', 'Durum ve operasyon bilgileri kaydedildi.', 'success');
      }
      await loadOrders(false);
    } catch (error) {
      toast('Güncelleme başarısız', error.message || 'Bilinmeyen hata.', 'error');
    } finally {
      state.saving = false;
      renderDrawer();
    }
  }

  function filteredOrders() {
    var q = state.filters.query.trim().toLowerCase();
    if (!q) return state.orders;
    return state.orders.filter(function (order) {
      var haystack = [
        order.order_number, order.id, order.customer_email,
        order.customer_first_name, order.customer_last_name,
        order.customer_phone, order.city, order.district, order.status
      ].concat((order.order_items || []).map(function (item) { return [item.product_name, item.brand, item.product_slug].join(' '); })).join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
  }

  function renderStats() {
    var summary = state.summary || {};
    var cards = [
      ['Toplam Sipariş', summary.total || 0, 'Son 500 kayıt üzerinden operasyon görünümü'],
      ['Ödenmiş Ciro', money(summary.paidRevenue || 0, 'TRY'), 'Ödendi / hazırlanıyor / kargoda / teslim edildi'],
      ['Hazırlanacak', Number(summary.paid || 0) + Number(summary.preparing || 0), 'Ödeme sonrası operasyon kuyruğu'],
      ['Kargo Süreci', Number(summary.shipped || 0) + Number(summary.delivered || 0), 'Kargoda ve teslim edilen siparişler']
    ];
    el.statsGrid.innerHTML = cards.map(function (card) {
      return '<article class="stat-card"><p class="stat-label">' + esc(card[0]) + '</p><div class="stat-value">' + esc(card[1]) + '</div><p class="stat-copy">' + esc(card[2]) + '</p></article>';
    }).join('');

    el.heroPanel.innerHTML = [
      ['Bekleyen ödeme', summary.pending_payment || 0],
      ['Kargoya hazır', Number(summary.paid || 0) + Number(summary.preparing || 0)],
      ['Başarısız ödeme', summary.payment_failed || 0]
    ].map(function (row) {
      return '<div class="hero-row"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
    }).join('');

    el.sidebarMetrics.innerHTML = [
      ['Ödeme bekliyor', summary.pending_payment || 0],
      ['Hazırlanıyor', summary.preparing || 0],
      ['Kargoda', summary.shipped || 0],
      ['Teslim', summary.delivered || 0],
      ['İptal/İade', Number(summary.cancelled || 0) + Number(summary.refunded || 0) + Number(summary.partially_refunded || 0)]
    ].map(function (row) {
      return '<div class="mini-metric"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-status-nav]'), function (btn) {
      var key = btn.getAttribute('data-status-nav');
      btn.classList.toggle('is-active', state.filters.status === key);
      var count = key === 'all' ? summary.total : summary[key];
      var countEl = btn.querySelector('.nav-count');
      if (countEl) countEl.textContent = String(count || 0);
    });
  }

  function renderFilterControls() {
    el.statusFilter.innerHTML = STATUS_OPTIONS.map(function (option) {
      return '<option value="' + esc(option[0]) + '">' + esc(option[1]) + '</option>';
    }).join('');
    el.statusFilter.value = state.filters.status;
    el.emailFilter.value = state.filters.email;
    el.orderNumberFilter.value = state.filters.orderNumber;
    el.searchInput.value = state.filters.query;
  }

  function renderOrders() {
    var orders = filteredOrders();
    el.resultPill.textContent = (orders.length || 0) + ' kayıt';
    el.syncChip.textContent = state.loading ? 'Yükleniyor' : state.lastLoadedAt ? 'Son senkron: ' + dateTime(state.lastLoadedAt) : 'Henüz senkron yok';

    if (state.loading && !state.orders.length) {
      el.ordersFeed.innerHTML = '<div class="loading-state">Siparişler yükleniyor...</div>';
      return;
    }
    if (!orders.length) {
      el.ordersFeed.innerHTML = '<div class="empty-state"><h3 class="empty-title">Sipariş bulunamadı</h3><p>Filtreleri gevşet veya paneli yenile.</p></div>';
      return;
    }

    el.ordersFeed.innerHTML = orders.map(renderOrderCard).join('') + (state.hasMore ? '<button class="secondary-btn" type="button" data-action="load-more">Daha fazla yükle</button>' : '');
  }

  function renderOrderCard(order) {
    var items = order.order_items || [];
    var shipment = getLatestShipment(order);
    var payment = getLatestPayment(order);
    var active = order.id === state.selectedId ? ' style="outline:2px solid rgba(184,149,108,.42);"' : '';
    var thumbs = items.slice(0, 4).map(function (item) {
      var img = item.image || '/assets/logo-mark-beige.png';
      return '<div class="product-thumb"><img src="' + esc(img) + '" alt="' + esc(item.product_name || 'Ürün') + '" loading="lazy"></div>';
    }).join('');
    if (items.length > 4) thumbs += '<div class="product-more">+' + (items.length - 4) + '</div>';

    return '<article class="order-card" data-order-id="' + esc(order.id) + '"' + active + '>' +
      '<div class="order-card-top"><div><div class="order-number"><strong>' + esc(order.order_number || order.id) + '</strong><span class="' + statusClass(order.status) + '">' + esc(statusLabel(order.status)) + '</span></div>' +
      '<div class="order-meta"><span>' + esc(dateTime(order.created_at)) + '</span><span>Ödeme: ' + esc(payment ? statusLabel(payment.status) : order.payment_status || '—') + '</span><span>Kargo: ' + esc(shipment ? statusLabel(shipment.status) : order.fulfillment_status || '—') + '</span></div></div>' +
      '<button class="secondary-btn" type="button" data-action="select-order" data-id="' + esc(order.id) + '">Detay</button></div>' +
      '<div class="order-card-body"><div class="customer-block"><div class="customer-name">' + esc((order.customer_first_name || '') + ' ' + (order.customer_last_name || '')) + '</div>' +
      '<div class="customer-line">' + esc(order.customer_email || '') + ' · ' + esc(order.customer_phone || '') + '</div>' +
      '<div class="address-line">' + esc([order.district, order.city].filter(Boolean).join(' / ')) + '</div><div class="product-strip">' + thumbs + '</div></div>' +
      '<div class="order-total"><strong>' + esc(money(order.total_amount, order.currency)) + '</strong><span>' + esc(items.length) + ' ürün satırı</span></div></div>' +
      '<div class="order-actions"><div class="order-actions-left"><span class="meta-pill">' + esc(order.invoice_type || 'Bireysel') + '</span>' + (shipment && shipment.tracking_number ? '<span class="meta-pill">Takip: ' + esc(shipment.tracking_number) + '</span>' : '') + '</div>' +
      '<button class="primary-btn" type="button" data-action="select-order" data-id="' + esc(order.id) + '">Operasyon Aç</button></div></article>';
  }

  function renderDrawer() {
    var order = getSelectedOrder();
    if (!order) {
      el.drawer.innerHTML = '<div class="drawer-empty"><h3 class="empty-title">Sipariş seç</h3><p>Detay, kargo ve durum güncellemesi için soldaki listeden bir sipariş aç.</p></div>';
      return;
    }
    var shipment = getLatestShipment(order) || {};
    var payment = getLatestPayment(order) || {};
    el.drawer.innerHTML = '<div class="drawer-head"><div><span class="kicker">Order Desk</span><h2>' + esc(order.order_number || order.id) + '</h2><p>' + esc(dateTime(order.created_at)) + ' · ' + esc((order.customer_first_name || '') + ' ' + (order.customer_last_name || '')) + '</p></div><span class="' + statusClass(order.status) + '">' + esc(statusLabel(order.status)) + '</span></div>' +
      '<div class="drawer-body">' +
      renderDetailPanel(order, payment, shipment) +
      renderItemsPanel(order) +
      renderTimelinePanel(order) +
      renderUpdatePanel(order, shipment) +
      '</div>';
  }

  function renderDetailPanel(order, payment, shipment) {
    return '<section class="detail-panel"><div class="panel-title"><strong>Müşteri ve ödeme</strong></div><div class="detail-grid">' +
      detailCell('Müşteri', ((order.customer_first_name || '') + ' ' + (order.customer_last_name || '')).trim() || '—') +
      detailCell('E-posta', order.customer_email || '—') +
      detailCell('Telefon', order.customer_phone || '—') +
      detailCell('Toplam', money(order.total_amount, order.currency)) +
      detailCell('Ödeme', payment.status || order.payment_status || '—') +
      detailCell('Kargo', shipment.status || order.fulfillment_status || '—') +
      '</div><div class="detail-cell" style="margin-top:10px;"><span>Adres</span><strong>' + esc([order.address_line, order.district, order.city, order.postal_code].filter(Boolean).join(', ') || '—') + '</strong></div>' +
      (order.cargo_note ? '<div class="detail-cell" style="margin-top:10px;"><span>Kargo Notu</span><strong>' + esc(order.cargo_note) + '</strong></div>' : '') + '</section>';
  }

  function detailCell(label, value) {
    return '<div class="detail-cell"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  function renderItemsPanel(order) {
    var items = order.order_items || [];
    return '<section class="detail-panel"><div class="panel-title"><strong>Ürünler</strong><span class="meta-pill">' + esc(items.length) + ' satır</span></div><div class="items-list">' +
      (items.length ? items.map(function (item) {
        var img = item.image || '/assets/logo-mark-beige.png';
        return '<div class="item-row"><img src="' + esc(img) + '" alt="' + esc(item.product_name || 'Ürün') + '" loading="lazy"><div><strong>' + esc(item.product_name || 'Ürün') + '</strong><br><span>' + esc(item.brand || '') + ' · ' + esc(item.quantity || 1) + ' adet · ' + esc(money(item.unit_price, order.currency)) + '</span></div><div class="item-price">' + esc(money(item.line_total, order.currency)) + '</div></div>';
      }).join('') : '<div class="empty-state">Ürün satırı bulunamadı.</div>') + '</div></section>';
  }

  function renderTimelinePanel(order) {
    var events = order.status_events || [];
    return '<section class="detail-panel"><div class="panel-title"><strong>Durum geçmişi</strong></div><div class="timeline">' +
      (events.length ? events.map(function (event) {
        return '<div class="timeline-item"><strong>' + esc(statusLabel(event.status)) + ' · ' + esc(event.source || 'system') + '</strong><span>' + esc(event.message || '') + '</span><span>' + esc(dateTime(event.created_at)) + '</span></div>';
      }).join('') : '<div class="empty-state">Durum geçmişi henüz yok.</div>') + '</div></section>';
  }

  function renderUpdatePanel(order, shipment) {
    var options = STATUS_OPTIONS.filter(function (option) { return option[0] !== 'all'; }).map(function (option) {
      return '<option value="' + esc(option[0]) + '"' + (option[0] === order.status ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
    }).join('');
    return '<section class="detail-panel"><div class="panel-title"><strong>Operasyon güncelle</strong><span class="kbd">PATCH /api/admin/orders</span></div>' +
      '<form class="update-form" id="orderUpdateForm" data-order-id="' + esc(order.id) + '">' +
      '<div class="field"><label>Yeni durum</label><select name="status">' + options + '</select></div>' +
      '<div class="field"><label>Kargo firması</label><input name="carrier" type="text" placeholder="Yurtiçi, MNG, Aras..." value="' + esc(shipment.carrier || '') + '"></div>' +
      '<div class="field"><label>Takip numarası</label><input name="tracking_number" type="text" placeholder="Takip kodu" value="' + esc(shipment.tracking_number || '') + '"></div>' +
      '<div class="field"><label>Takip linki</label><input name="tracking_url" type="url" placeholder="https://..." value="' + esc(shipment.tracking_url || '') + '"></div>' +
      '<div class="field"><label>Admin mesajı</label><textarea name="message" placeholder="Bu mesaj durum geçmişine yazılır; müşteri bildirimi seçilirse e-postaya da eklenir."></textarea></div>' +
      '<label class="check-row"><input name="notify_customer" type="checkbox"> Müşteriye bilgilendirme e-postası gönder</label>' +
      '<div class="form-actions"><span class="meta-pill">' + esc(order.customer_email || '') + '</span><button class="primary-btn" type="submit"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? 'Kaydediliyor...' : 'Güncelle') + '</button></div>' +
      '</form></section>';
  }

  function render() {
    if (!el.appView || el.appView.classList.contains('is-hidden')) return;
    renderStats();
    renderFilterControls();
    renderOrders();
    renderDrawer();
  }

  function showLogin(message) {
    if (el.loginView) el.loginView.classList.remove('is-hidden');
    if (el.appView) el.appView.classList.add('is-hidden');
    if (el.loginError) el.loginError.textContent = message || '';
    if (el.tokenInput) el.tokenInput.focus();
  }

  function showApp() {
    if (el.loginView) el.loginView.classList.add('is-hidden');
    if (el.appView) el.appView.classList.remove('is-hidden');
  }

  function bindEvents() {
    el.loginBtn.addEventListener('click', function () {
      var token = (el.tokenInput.value || '').trim();
      if (!token) {
        el.loginError.textContent = 'Admin token gerekli.';
        return;
      }
      setToken(token);
      loadOrders(false);
    });
    el.tokenInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') el.loginBtn.click();
    });
    el.logoutBtn.addEventListener('click', function () {
      clearToken();
      state.orders = [];
      state.selectedId = '';
      showLogin('Çıkış yapıldı.');
    });
    el.refreshBtn.addEventListener('click', function () { state.filters.offset = 0; loadOrders(false); });
    el.applyFiltersBtn.addEventListener('click', function () {
      state.filters.status = el.statusFilter.value || 'all';
      state.filters.email = (el.emailFilter.value || '').trim();
      state.filters.orderNumber = (el.orderNumberFilter.value || '').trim();
      state.filters.offset = 0;
      loadOrders(false);
    });
    el.clearFiltersBtn.addEventListener('click', function () {
      state.filters = { status: 'all', email: '', orderNumber: '', query: '', limit: 30, offset: 0 };
      loadOrders(false);
    });
    el.searchInput.addEventListener('input', function () {
      state.filters.query = el.searchInput.value || '';
      renderOrders();
    });
    el.sidebarNav.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-status-nav]');
      if (!btn) return;
      state.filters.status = btn.getAttribute('data-status-nav') || 'all';
      state.filters.offset = 0;
      loadOrders(false);
    });
    el.ordersFeed.addEventListener('click', function (event) {
      var loadMore = event.target.closest('[data-action="load-more"]');
      if (loadMore) {
        loadOrders(true);
        return;
      }
      var select = event.target.closest('[data-action="select-order"]');
      if (!select) return;
      state.selectedId = select.getAttribute('data-id') || '';
      renderOrders();
      renderDrawer();
      if (window.matchMedia('(max-width: 1180px)').matches) el.drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    el.drawer.addEventListener('submit', function (event) {
      var form = event.target.closest('#orderUpdateForm');
      if (!form) return;
      event.preventDefault();
      var data = new FormData(form);
      updateOrder({
        order_id: form.getAttribute('data-order-id'),
        status: data.get('status'),
        carrier: data.get('carrier'),
        tracking_number: data.get('tracking_number'),
        tracking_url: data.get('tracking_url'),
        message: data.get('message'),
        notify_customer: data.get('notify_customer') === 'on'
      });
    });
  }

  function cacheElements() {
    el.loginView = qs('loginView');
    el.appView = qs('appView');
    el.tokenInput = qs('tokenInput');
    el.loginBtn = qs('loginBtn');
    el.logoutBtn = qs('logoutBtn');
    el.loginError = qs('loginError');
    el.statsGrid = qs('statsGrid');
    el.heroPanel = qs('heroPanel');
    el.sidebarMetrics = qs('sidebarMetrics');
    el.sidebarNav = qs('sidebarNav');
    el.ordersFeed = qs('ordersFeed');
    el.drawer = qs('orderDrawer');
    el.resultPill = qs('resultPill');
    el.syncChip = qs('syncChip');
    el.searchInput = qs('searchInput');
    el.statusFilter = qs('statusFilter');
    el.emailFilter = qs('emailFilter');
    el.orderNumberFilter = qs('orderNumberFilter');
    el.applyFiltersBtn = qs('applyFiltersBtn');
    el.clearFiltersBtn = qs('clearFiltersBtn');
    el.refreshBtn = qs('refreshBtn');
    el.toastStack = qs('toastStack');
  }

  function init() {
    cacheElements();
    bindEvents();
    renderFilterControls();
    if (getToken()) loadOrders(false);
    else showLogin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
