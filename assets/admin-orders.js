(function () {
  'use strict';

  var TOKEN_KEY = 'cosmoskin_admin_token_session';
  var OLD_TOKEN_KEY = 'cosmoskin_admin_token';
  var API_ORDERS = '/api/admin/orders';

  var ORDER_STATUSES = [
    ['all', 'Tümü'], ['pending', 'Bekliyor'], ['confirmed', 'Onaylandı'], ['preparing', 'Hazırlanıyor'],
    ['packed', 'Paketlendi'], ['shipped', 'Kargoya Verildi'], ['delivered', 'Teslim Edildi'], ['cancelled', 'İptal Edildi'],
    ['return_requested', 'İade Talebi'], ['returned', 'İade Edildi'], ['refunded', 'Refund Tamamlandı'],
    ['pending_payment', 'Ödeme Bekliyor'], ['paid', 'Ödendi'], ['payment_failed', 'Ödeme Başarısız'], ['partially_refunded', 'Kısmi İade']
  ];
  var PAYMENT_STATUSES = [
    ['all', 'Tümü'], ['pending', 'Bekliyor'], ['authorized', 'Provizyon Alındı'], ['paid', 'Ödendi'],
    ['failed', 'Başarısız'], ['refunded', 'İade Edildi'], ['partially_refunded', 'Kısmi İade'], ['cancelled', 'İptal Edildi']
  ];
  var FULFILLMENT_STATUSES = [
    ['all', 'Tümü'], ['unfulfilled', 'Hazırlanmadı'], ['not_started', 'Hazırlanmadı'], ['preparing', 'Hazırlanıyor'],
    ['packed', 'Paketlendi'], ['shipped', 'Kargoda'], ['delivered', 'Teslim Edildi'], ['failed', 'Başarısız'], ['returned', 'Geri Döndü'], ['cancelled', 'İptal Edildi']
  ];
  var INVOICE_STATUSES = [['all', 'Tümü'], ['none', 'Fatura Yok'], ['pending', 'Bekliyor'], ['issued', 'Oluşturuldu'], ['failed', 'Başarısız'], ['cancelled', 'İptal Edildi']];
  var RETURN_STATUSES = [['all', 'Tümü'], ['none', 'İade Yok'], ['requested', 'Talep Alındı'], ['under_review', 'İncelemede'], ['approved', 'Onaylandı'], ['rejected', 'Reddedildi'], ['received', 'Ürün Teslim Alındı'], ['refunded', 'Refund Tamamlandı'], ['closed', 'Kapandı']];
  var EMAIL_STATUSES = [['all', 'Tümü'], ['failed', 'Hatalı'], ['sent', 'Gönderildi'], ['pending', 'Bekliyor'], ['skipped', 'Atlandı']];
  var SORT_OPTIONS = [['newest', 'En yeni'], ['oldest', 'En eski'], ['amount_desc', 'Tutar yüksekten düşüğe'], ['amount_asc', 'Tutar düşükten yükseğe']];

  var STATUS_COPY = {
    order: {
      pending: 'Bekliyor', confirmed: 'Onaylandı', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoya Verildi', delivered: 'Teslim Edildi', cancelled: 'İptal Edildi', return_requested: 'İade Talebi', returned: 'İade Edildi', refunded: 'Refund Tamamlandı', pending_payment: 'Ödeme Bekliyor', paid: 'Ödendi', payment_failed: 'Ödeme Başarısız', partially_refunded: 'Kısmi İade'
    },
    payment: {
      pending: 'Bekliyor', authorized: 'Provizyon Alındı', paid: 'Ödendi', failed: 'Başarısız', refunded: 'İade Edildi', partially_refunded: 'Kısmi İade', cancelled: 'İptal Edildi', initiated: 'Başlatıldı', initialize_failed: 'Başlatılamadı'
    },
    fulfillment: {
      unfulfilled: 'Hazırlanmadı', not_started: 'Hazırlanmadı', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoda', delivered: 'Teslim Edildi', failed: 'Başarısız', returned: 'Geri Döndü', cancelled: 'İptal Edildi'
    },
    invoice: { none: 'Fatura Yok', pending: 'Bekliyor', issued: 'Oluşturuldu', failed: 'Başarısız', cancelled: 'İptal Edildi' },
    return: { none: 'İade Yok', requested: 'Talep Alındı', under_review: 'İncelemede', approved: 'Onaylandı', rejected: 'Reddedildi', received: 'Ürün Teslim Alındı', refunded: 'Refund Tamamlandı', closed: 'Kapandı' },
    refund: { not_started: 'Başlamadı', pending: 'Bekliyor', completed: 'Tamamlandı', failed: 'Başarısız', cancelled: 'İptal Edildi' },
    email: { pending: 'Bekliyor', sent: 'Gönderildi', failed: 'Başarısız', skipped: 'Atlandı' }
  };

  var TABS = [
    ['all', 'Tümü'], ['new', 'Yeni Siparişler'], ['prepare', 'Hazırlanacaklar'], ['packed', 'Paketlendi'],
    ['shipped', 'Kargoda'], ['delivered', 'Teslim Edildi'], ['returns', 'İade / Refund'], ['issues', 'Sorunlu Siparişler']
  ];
  var DETAIL_TABS = [
    ['summary', 'Özet'], ['items', 'Ürünler'], ['shipment', 'Kargo'], ['payment', 'Ödeme'], ['invoice', 'Fatura'], ['returns', 'İade / Refund'], ['emails', 'E-postalar'], ['history', 'Geçmiş'], ['notes', 'Notlar']
  ];
  var CARRIERS = ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo', 'Hepsijet', 'Kolay Gelsin', 'UPS', 'DHL', 'Other'];

  var state = {
    orders: [],
    summary: {},
    selectedOrder: null,
    activeTab: 'all',
    detailTab: 'summary',
    loading: false,
    saving: false,
    hasMore: false,
    offset: 0,
    limit: 100,
    lastLoadedAt: null,
    filters: defaultFilters(),
    hasUnsavedChanges: false,
    confirmResolver: null,
    lastFocusedElement: null
  };

  var el = {};

  function defaultFilters() {
    return { query: '', dateFrom: '', dateTo: '', orderStatus: 'all', paymentStatus: 'all', fulfillmentStatus: 'all', carrier: '', invoiceStatus: 'all', returnStatus: 'all', emailStatus: 'all', minTotal: '', maxTotal: '', sort: 'newest' };
  }
  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function attr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function safeText(value, fallback) {
    var text = String(value == null ? '' : value).trim();
    return text || fallback || '—';
  }
  function getSessionToken() {
    try { return window.sessionStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
  }
  function setSessionToken(token) {
    try { window.sessionStorage.setItem(TOKEN_KEY, token); } catch (error) { /* noop */ }
  }
  function clearSessionToken() {
    try { window.sessionStorage.removeItem(TOKEN_KEY); } catch (error) { /* noop */ }
    try { window.localStorage.removeItem(OLD_TOKEN_KEY); } catch (error) { /* noop */ }
  }
  function migrateLegacyToken() {
    if (getSessionToken()) return;
    try {
      var legacy = window.localStorage.getItem(OLD_TOKEN_KEY);
      if (legacy) {
        window.sessionStorage.setItem(TOKEN_KEY, legacy);
        window.localStorage.removeItem(OLD_TOKEN_KEY);
      }
    } catch (error) { /* noop */ }
  }
  function formatDate(value, includeTime) {
    if (!value) return '—';
    try {
      var date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return new Intl.DateTimeFormat('tr-TR', includeTime === false ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    } catch (error) { return String(value || '—'); }
  }
  function formatMoney(value, currency) {
    var amount = Number(value || 0);
    try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(amount); }
    catch (error) { return amount.toFixed(2) + ' ' + (currency || 'TRY'); }
  }
  function orderAge(value) {
    if (!value) return '—';
    var ms = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    var hours = Math.floor(ms / 36e5);
    if (hours < 1) return '1 saatten az';
    if (hours < 24) return hours + ' saat';
    return Math.floor(hours / 24) + ' gün';
  }
  function normalizeStatus(kind, status) {
    var value = String(status || '').trim();
    return value || 'none';
  }
  function statusLabel(kind, status) {
    var value = normalizeStatus(kind, status);
    return (STATUS_COPY[kind] && STATUS_COPY[kind][value]) || value || '—';
  }
  function badgeTone(kind, status) {
    var value = normalizeStatus(kind, status);
    if (value === 'none' || value === 'not_started' || value === 'unfulfilled') return 'neutral';
    if (['paid', 'authorized', 'confirmed', 'delivered', 'issued', 'sent', 'approved', 'completed'].indexOf(value) >= 0) return 'ok';
    if (['pending', 'pending_payment', 'preparing', 'packed', 'requested', 'under_review', 'partially_refunded'].indexOf(value) >= 0) return 'warn';
    if (['failed', 'payment_failed', 'cancelled', 'rejected', 'skipped', 'initialize_failed'].indexOf(value) >= 0) return 'danger';
    if (['shipped', 'shipment_created', 'shipment_updated'].indexOf(value) >= 0) return 'info';
    if (['return_requested', 'returned', 'refunded', 'received', 'closed'].indexOf(value) >= 0) return 'violet';
    return 'neutral';
  }
  function renderBadge(kind, status) {
    var value = normalizeStatus(kind, status);
    return '<span class="cs-badge ' + badgeTone(kind, value) + '">' + escapeHtml(statusLabel(kind, value)) + '</span>';
  }
  function showToast(title, message, type) {
    if (!el.toastStack) return;
    var node = document.createElement('div');
    node.className = 'cs-toast' + (type ? ' is-' + type : '');
    node.innerHTML = '<strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(message || '') + '</span>';
    el.toastStack.appendChild(node);
    window.setTimeout(function () { if (node.parentNode) node.remove(); }, 5200);
  }
  async function adminFetch(url, options) {
    var token = getSessionToken();
    var init = options || {};
    var headers = Object.assign({}, init.headers || {}, { 'x-admin-token': token });
    if (init.body && !headers['content-type'] && !(init.body instanceof FormData)) headers['content-type'] = 'application/json';
    var response;
    try { response = await fetch(url, Object.assign({}, init, { headers: headers })); }
    catch (error) { throw new Error('Ağ bağlantısı kurulamadı. Lütfen tekrar deneyin.'); }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || data.ok === false) {
      if (response.status === 401) throw Object.assign(new Error('Admin oturumu geçersiz. Lütfen token ile tekrar giriş yapın.'), { status: 401 });
      if (response.status === 403) throw new Error('Bu işlem için yetki bulunamadı.');
      if (response.status === 404) throw new Error('Kayıt bulunamadı.');
      if (response.status >= 500) throw new Error('Sunucu işlemi tamamlayamadı. Detaylar backend loglarında kontrol edilmeli.');
      throw new Error(data.error || data.message || 'İşlem tamamlanamadı.');
    }
    return data;
  }
  function optionsHtml(options, selected) {
    return options.map(function (pair) {
      return '<option value="' + attr(pair[0]) + '"' + (String(pair[0]) === String(selected || '') ? ' selected' : '') + '>' + escapeHtml(pair[1]) + '</option>';
    }).join('');
  }
  function valueFrom(id) { return byId(id) ? byId(id).value.trim() : ''; }

  function cacheElements() {
    el.loginView = byId('loginView');
    el.appView = byId('appView');
    el.tokenInput = byId('tokenInput');
    el.loginBtn = byId('loginBtn');
    el.loginError = byId('loginError');
    el.refreshBtn = byId('refreshBtn');
    el.logoutBtn = byId('logoutBtn');
    el.syncChip = byId('syncChip');
    el.summaryGrid = byId('summaryGrid');
    el.primaryTabs = byId('primaryTabs');
    el.searchInput = byId('searchInput');
    el.filtersPanel = byId('filtersPanel');
    el.filterToggle = byId('filterToggle');
    el.ordersTableBody = byId('ordersTableBody');
    el.ordersCards = byId('ordersCards');
    el.emptyState = byId('emptyState');
    el.resultPill = byId('resultPill');
    el.loadMoreBtn = byId('loadMoreBtn');
    el.detailShell = byId('detailShell');
    el.detailContent = byId('detailContent');
    el.confirmModal = byId('confirmModal');
    el.toastStack = byId('toastStack');
  }

  function showLogin(message, isError) {
    el.loginView.classList.remove('is-hidden');
    el.appView.classList.add('is-hidden');
    el.loginError.textContent = message || 'Token yalnızca bu tarayıcı oturumunda saklanır.';
    el.loginError.classList.toggle('is-error', Boolean(isError));
  }
  function showApp() {
    el.loginView.classList.add('is-hidden');
    el.appView.classList.remove('is-hidden');
  }
  async function login() {
    var token = (el.tokenInput.value || '').trim();
    if (!token) return showLogin('Admin token gerekli.', true);
    setSessionToken(token);
    showApp();
    await loadOrders(false);
  }
  function logout() {
    clearSessionToken();
    state.orders = [];
    state.selectedOrder = null;
    closeDetail(true);
    showLogin('Çıkış yapıldı. Yeni işlem için admin token girin.', false);
  }

  function collectFilters() {
    state.filters = {
      query: valueFrom('searchInput'),
      dateFrom: valueFrom('dateFromFilter'),
      dateTo: valueFrom('dateToFilter'),
      orderStatus: valueFrom('orderStatusFilter') || 'all',
      paymentStatus: valueFrom('paymentStatusFilter') || 'all',
      fulfillmentStatus: valueFrom('fulfillmentStatusFilter') || 'all',
      carrier: valueFrom('carrierFilter'),
      invoiceStatus: valueFrom('invoiceStatusFilter') || 'all',
      returnStatus: valueFrom('returnStatusFilter') || 'all',
      emailStatus: valueFrom('emailStatusFilter') || 'all',
      minTotal: valueFrom('minTotalFilter'),
      maxTotal: valueFrom('maxTotalFilter'),
      sort: valueFrom('sortFilter') || 'newest'
    };
  }
  function resetFilters() {
    state.filters = defaultFilters();
    var map = {
      searchInput: '', dateFromFilter: '', dateToFilter: '', carrierFilter: '', minTotalFilter: '', maxTotalFilter: '',
      orderStatusFilter: 'all', paymentStatusFilter: 'all', fulfillmentStatusFilter: 'all', invoiceStatusFilter: 'all', returnStatusFilter: 'all', emailStatusFilter: 'all', sortFilter: 'newest'
    };
    Object.keys(map).forEach(function (id) { if (byId(id)) byId(id).value = map[id]; });
  }
  function initFilterOptions() {
    byId('orderStatusFilter').innerHTML = optionsHtml(ORDER_STATUSES, 'all');
    byId('paymentStatusFilter').innerHTML = optionsHtml(PAYMENT_STATUSES, 'all');
    byId('fulfillmentStatusFilter').innerHTML = optionsHtml(FULFILLMENT_STATUSES, 'all');
    byId('invoiceStatusFilter').innerHTML = optionsHtml(INVOICE_STATUSES, 'all');
    byId('returnStatusFilter').innerHTML = optionsHtml(RETURN_STATUSES, 'all');
    byId('emailStatusFilter').innerHTML = optionsHtml(EMAIL_STATUSES, 'all');
    byId('sortFilter').innerHTML = optionsHtml(SORT_OPTIONS, 'newest');
  }

  function buildListQuery(loadMore) {
    var params = new URLSearchParams();
    params.set('limit', String(state.limit));
    params.set('offset', String(loadMore ? state.offset : 0));
    var query = state.filters.query || '';
    if (state.filters.orderStatus !== 'all') params.set('status', state.filters.orderStatus);
    if (/@/.test(query)) params.set('email', query);
    if (/^(CS|cs|#)/.test(query)) params.set('order_number', query.replace(/^#/, ''));
    return params.toString();
  }
  async function loadOrders(loadMore) {
    if (!getSessionToken()) return showLogin('Admin token gerekli.', true);
    state.loading = true;
    renderLoading();
    try {
      var data = await adminFetch(API_ORDERS + '?' + buildListQuery(loadMore), { method: 'GET' });
      var incoming = Array.isArray(data.orders) ? data.orders : [];
      state.orders = loadMore ? state.orders.concat(incoming) : incoming;
      state.summary = data.summary || {};
      state.hasMore = Boolean(data.pagination && data.pagination.hasMore);
      state.offset = loadMore ? state.offset + incoming.length : incoming.length;
      state.lastLoadedAt = new Date();
      showApp();
      render();
    } catch (error) {
      if (error.status === 401) {
        clearSessionToken();
        showLogin(error.message, true);
      } else {
        showToast('Siparişler yüklenemedi', error.message, 'error');
        render();
      }
    } finally {
      state.loading = false;
      render();
    }
  }
  async function loadOrderDetail(orderId, keepTab) {
    if (!orderId) return;
    try {
      var data = await adminFetch(API_ORDERS + '/' + encodeURIComponent(orderId), { method: 'GET' });
      state.selectedOrder = data.order || null;
      if (!keepTab) state.detailTab = 'summary';
      state.hasUnsavedChanges = false;
      renderDetail();
      openDetailShell();
      state.orders = state.orders.map(function (order) { return order.id === orderId && data.order ? data.order : order; });
      render();
    } catch (error) { showToast('Sipariş detayı alınamadı', error.message, 'error'); }
  }
  function renderLoading() {
    if (!el.ordersTableBody) return;
    el.ordersTableBody.innerHTML = Array.from({ length: 6 }).map(function () { return '<tr><td colspan="10"><div class="cs-skeleton-row"></div></td></tr>'; }).join('');
    el.ordersCards.innerHTML = Array.from({ length: 3 }).map(function () { return '<div class="cs-skeleton-row"></div>'; }).join('');
  }

  function latest(arr) { return Array.isArray(arr) && arr.length ? arr[0] : null; }
  function itemsOf(order) { return Array.isArray(order.items) ? order.items : (Array.isArray(order.order_items) ? order.order_items : []); }
  function latestShipment(order) { return latest(order.shipments); }
  function latestInvoice(order) { return latest(order.invoices); }
  function latestReturn(order) { return latest(order.return_requests); }
  function latestRefund(order) { return latest(order.refunds); }
  function hasFailedEmail(order) { return (order.email_events || []).some(function (event) { return event.status === 'failed'; }); }
  function shipmentStatus(order) { return (latestShipment(order) && latestShipment(order).status) || order.fulfillment_status || 'none'; }
  function invoiceStatus(order) { return (latestInvoice(order) && latestInvoice(order).invoice_status) || 'none'; }
  function returnStatus(order) { return (latestReturn(order) && latestReturn(order).status) || (latestRefund(order) && latestRefund(order).status === 'completed' ? 'refunded' : 'none'); }
  function customerName(order) { return safeText([order.customer_first_name, order.customer_last_name].filter(Boolean).join(' '), 'İsimsiz müşteri'); }
  function trackingSummary(order) {
    var shipment = latestShipment(order);
    if (!shipment) return 'Kargo yok';
    var carrier = shipment.carrier_name || shipment.carrier || 'Kargo';
    return carrier + (shipment.tracking_number ? ' · ' + shipment.tracking_number : '');
  }
  function orderSearchText(order) {
    var itemText = itemsOf(order).map(function (item) { return [item.product_name, item.brand, item.sku, item.product_slug].join(' '); }).join(' ');
    var shipment = latestShipment(order) || {};
    return [order.order_number, order.customer_email, customerName(order), order.customer_phone, order.city, order.district, shipment.tracking_number, shipment.carrier, shipment.carrier_name, itemText].join(' ').toLowerCase();
  }
  function inTab(order, tab) {
    var status = order.status || '';
    var payment = order.payment_status || '';
    var fulfillment = order.fulfillment_status || '';
    var sStatus = shipmentStatus(order);
    var rStatus = returnStatus(order);
    if (tab === 'all') return true;
    if (tab === 'new') return ['pending', 'confirmed', 'paid', 'pending_payment'].indexOf(status) >= 0 || (payment === 'paid' && ['unfulfilled', 'not_started', '', null].indexOf(fulfillment) >= 0);
    if (tab === 'prepare') return payment === 'paid' && ['unfulfilled', 'not_started', 'preparing', ''].indexOf(fulfillment) >= 0 && ['cancelled', 'delivered'].indexOf(status) < 0;
    if (tab === 'packed') return status === 'packed' || fulfillment === 'packed';
    if (tab === 'shipped') return status === 'shipped' || fulfillment === 'shipped' || sStatus === 'shipped';
    if (tab === 'delivered') return status === 'delivered' || fulfillment === 'delivered' || sStatus === 'delivered';
    if (tab === 'returns') return rStatus !== 'none' || ['return_requested', 'returned', 'refunded', 'partially_refunded'].indexOf(status) >= 0 || (order.refunds || []).length > 0;
    if (tab === 'issues') return payment === 'failed' || status === 'payment_failed' || status === 'cancelled' || fulfillment === 'failed' || sStatus === 'failed' || hasFailedEmail(order) || invoiceStatus(order) === 'failed';
    return true;
  }
  function filteredOrders(ignoreTab) {
    var filters = state.filters;
    var rows = state.orders.slice().filter(function (order) {
      if (!ignoreTab && !inTab(order, state.activeTab)) return false;
      if (filters.query && orderSearchText(order).indexOf(filters.query.toLowerCase()) < 0) return false;
      if (filters.orderStatus !== 'all' && order.status !== filters.orderStatus) return false;
      if (filters.paymentStatus !== 'all' && order.payment_status !== filters.paymentStatus) return false;
      if (filters.fulfillmentStatus !== 'all' && order.fulfillment_status !== filters.fulfillmentStatus) return false;
      if (filters.carrier) {
        var shipment = latestShipment(order) || {};
        var carrier = String(shipment.carrier_name || shipment.carrier || '').toLowerCase();
        if (carrier.indexOf(filters.carrier.toLowerCase()) < 0) return false;
      }
      if (filters.invoiceStatus !== 'all' && invoiceStatus(order) !== filters.invoiceStatus) return false;
      if (filters.returnStatus !== 'all' && returnStatus(order) !== filters.returnStatus) return false;
      if (filters.emailStatus !== 'all') {
        var emails = order.email_events || [];
        if (filters.emailStatus === 'failed' && !hasFailedEmail(order)) return false;
        if (filters.emailStatus !== 'failed' && !emails.some(function (event) { return event.status === filters.emailStatus; })) return false;
      }
      if (filters.dateFrom && new Date(order.created_at) < new Date(filters.dateFrom + 'T00:00:00')) return false;
      if (filters.dateTo && new Date(order.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      var total = Number(order.total_amount || 0);
      if (filters.minTotal && total < Number(filters.minTotal)) return false;
      if (filters.maxTotal && total > Number(filters.maxTotal)) return false;
      return true;
    });
    rows.sort(function (a, b) {
      if (filters.sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (filters.sort === 'amount_desc') return Number(b.total_amount || 0) - Number(a.total_amount || 0);
      if (filters.sort === 'amount_asc') return Number(a.total_amount || 0) - Number(b.total_amount || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return rows;
  }
  function tabCounts() {
    return TABS.reduce(function (acc, tab) {
      acc[tab[0]] = state.orders.filter(function (order) { return inTab(order, tab[0]); }).length;
      return acc;
    }, {});
  }
  function summaryStats() {
    return {
      newOrders: state.orders.filter(function (o) { return inTab(o, 'new'); }).length,
      prepare: state.orders.filter(function (o) { return inTab(o, 'prepare'); }).length,
      packed: state.orders.filter(function (o) { return inTab(o, 'packed'); }).length,
      shipped: state.orders.filter(function (o) { return inTab(o, 'shipped'); }).length,
      delivered: state.orders.filter(function (o) { return inTab(o, 'delivered'); }).length,
      returns: state.orders.filter(function (o) { return inTab(o, 'returns'); }).length,
      paymentFailed: state.orders.filter(function (o) { return o.payment_status === 'failed' || o.status === 'payment_failed'; }).length,
      emailFailed: state.orders.filter(hasFailedEmail).length
    };
  }

  function render() {
    renderSummary();
    renderTabs();
    renderOrderList();
    if (el.syncChip) el.syncChip.textContent = state.lastLoadedAt ? 'Son senkron: ' + formatDate(state.lastLoadedAt) : 'Henüz senkron yok';
    if (el.loadMoreBtn) el.loadMoreBtn.classList.toggle('is-hidden', !state.hasMore);
  }
  function renderSummary() {
    var s = summaryStats();
    var cards = [
      ['Yeni siparişler', s.newOrders, 'İlk operasyon aksiyonu bekleyen kayıtlar'],
      ['Hazırlanacak', s.prepare, 'Ödemesi alınmış hazırlık kuyruğu'],
      ['Paketlendi', s.packed, 'Kargoya teslim öncesi bekleyenler'],
      ['Kargoda', s.shipped, 'Takip bilgisi olan gönderiler'],
      ['Teslim edildi', s.delivered, 'Son yüklenen kayıtlar içinde tamamlananlar'],
      ['İade bekleyen', s.returns, 'İade veya refund süreci bulunanlar'],
      ['Ödeme hatası', s.paymentFailed, 'Müdahale gerektiren ödeme kayıtları', s.paymentFailed ? 'is-alert' : ''],
      ['E-posta hatası', s.emailFailed, 'Başarısız transactional e-postalar', s.emailFailed ? 'is-alert' : '']
    ];
    el.summaryGrid.innerHTML = cards.map(function (card) {
      return '<article class="cs-summary-card ' + (card[3] || '') + '"><span>' + escapeHtml(card[0]) + '</span><strong>' + escapeHtml(card[1]) + '</strong><small>' + escapeHtml(card[2]) + '</small></article>';
    }).join('');
  }
  function renderTabs() {
    var counts = tabCounts();
    el.primaryTabs.innerHTML = TABS.map(function (tab) {
      var active = state.activeTab === tab[0];
      return '<button class="cs-tab' + (active ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + String(active) + '" data-primary-tab="' + attr(tab[0]) + '">' + escapeHtml(tab[1]) + '<span class="cs-tab-count">' + escapeHtml(counts[tab[0]] || 0) + '</span></button>';
    }).join('');
  }
  function renderOrderList() {
    if (state.loading) return;
    var rows = filteredOrders(false);
    el.resultPill.textContent = rows.length + ' kayıt · son yüklenen veri üzerinden';
    if (!rows.length) {
      el.ordersTableBody.innerHTML = '';
      el.ordersCards.innerHTML = '';
      el.emptyState.classList.remove('is-hidden');
      el.emptyState.innerHTML = '<h3>Kayıt bulunamadı</h3><p>Seçili sekme veya filtrelerle eşleşen sipariş yok. Filtreleri temizleyip tekrar deneyin.</p>';
      return;
    }
    el.emptyState.classList.add('is-hidden');
    el.ordersTableBody.innerHTML = rows.map(renderOrderRow).join('');
    el.ordersCards.innerHTML = rows.map(renderOrderCard).join('');
  }
  function renderOrderRow(order) {
    var shipment = latestShipment(order);
    var selected = state.selectedOrder && state.selectedOrder.id === order.id;
    var invoice = latestInvoice(order);
    var returnReq = latestReturn(order);
    return '<tr data-open-order="' + attr(order.id) + '" tabindex="0" class="' + (selected ? 'is-selected' : '') + '">' +
      '<td><div class="cs-order-number"><strong>' + escapeHtml(order.order_number || order.id) + '</strong><small>' + escapeHtml(orderAge(order.created_at)) + ' önce</small></div></td>' +
      '<td>' + escapeHtml(formatDate(order.created_at)) + '</td>' +
      '<td><div class="cs-customer"><strong>' + escapeHtml(customerName(order)) + '</strong><small>' + escapeHtml(order.customer_email || 'E-posta yok') + '</small></div></td>' +
      '<td class="cs-money">' + escapeHtml(formatMoney(order.total_amount, order.currency)) + '</td>' +
      '<td>' + renderBadge('payment', order.payment_status || (order.status === 'paid' ? 'paid' : 'pending')) + '</td>' +
      '<td><div class="cs-cell-stack">' + renderBadge('fulfillment', order.fulfillment_status || order.status || 'none') + renderBadge('order', order.status || 'pending') + '</div></td>' +
      '<td><div class="cs-cell-stack">' + renderBadge('fulfillment', shipmentStatus(order)) + '<small class="cs-muted">' + escapeHtml(trackingSummary(order)) + '</small></div></td>' +
      '<td><div class="cs-cell-stack">' + renderBadge('invoice', invoiceStatus(order)) + '<small class="cs-muted">' + escapeHtml(invoice && invoice.pdf_url ? 'PDF mevcut' : 'PDF yok') + '</small></div></td>' +
      '<td><div class="cs-cell-stack">' + renderBadge('return', returnStatus(order)) + '<div class="cs-indicators">' + indicator(Boolean(shipment), 'ok', 'Kargo') + indicator(Boolean(invoice), 'warn', 'Fatura') + indicator(Boolean(returnReq), 'warn', 'İade') + indicator(hasFailedEmail(order), 'danger', 'E-posta hatası') + '</div></div></td>' +
      '<td><button class="cs-btn cs-btn-sm cs-btn-dark" type="button" data-open-order="' + attr(order.id) + '">Detayı Aç</button></td>' +
      '</tr>';
  }
  function indicator(show, tone, title) {
    if (!show) return '';
    return '<span class="cs-dot ' + tone + '" title="' + attr(title) + '" aria-label="' + attr(title) + '"></span>';
  }
  function renderOrderCard(order) {
    return '<article class="cs-order-card" data-open-order="' + attr(order.id) + '" tabindex="0">' +
      '<div class="cs-order-card-head"><div><h3>' + escapeHtml(order.order_number || order.id) + '</h3><p>' + escapeHtml(formatDate(order.created_at)) + ' · ' + escapeHtml(customerName(order)) + '</p></div><strong class="cs-money">' + escapeHtml(formatMoney(order.total_amount, order.currency)) + '</strong></div>' +
      '<div class="cs-order-card-grid"><div><span>Ödeme</span>' + renderBadge('payment', order.payment_status || 'pending') + '</div><div><span>Operasyon</span>' + renderBadge('fulfillment', order.fulfillment_status || order.status || 'none') + '</div><div><span>Kargo</span><p>' + escapeHtml(trackingSummary(order)) + '</p></div><div><span>Fatura / İade</span>' + renderBadge('invoice', invoiceStatus(order)) + ' ' + renderBadge('return', returnStatus(order)) + '</div></div>' +
      '<button class="cs-btn cs-btn-dark" type="button" data-open-order="' + attr(order.id) + '">Detayı Aç</button>' +
      '</article>';
  }

  function openDetailShell() {
    el.detailShell.classList.add('is-open');
    el.detailShell.setAttribute('aria-hidden', 'false');
    var drawer = el.detailShell.querySelector('.cs-detail-drawer');
    if (drawer) drawer.focus();
    document.body.style.overflow = 'hidden';
  }
  async function closeDetail(force) {
    if (!force && state.hasUnsavedChanges) {
      var ok = await openConfirmModal('Kaydedilmemiş değişiklikler var', 'Paneli kapatırsanız form değişiklikleri kaybolabilir. Devam etmek istiyor musunuz?', 'Kapat');
      if (!ok) return;
    }
    el.detailShell.classList.remove('is-open');
    el.detailShell.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.hasUnsavedChanges = false;
    if (state.lastFocusedElement && state.lastFocusedElement.focus) state.lastFocusedElement.focus();
  }
  function renderDetail() {
    var order = state.selectedOrder;
    if (!order) {
      el.detailContent.innerHTML = '<div class="cs-detail-body"><div class="cs-state-box"><h3>Sipariş seçilmedi</h3><p>Listeden bir sipariş açın.</p></div></div>';
      return;
    }
    el.detailContent.innerHTML = renderDetailHeader(order) + renderDetailTabs() + '<div class="cs-detail-body">' + renderDetailBody(order) + '</div>';
  }
  function renderDetailHeader(order) {
    return '<header class="cs-detail-head">' +
      '<div class="cs-detail-title-row"><div><p class="cs-kicker">Sipariş Detayı</p><h2 id="detailTitle">' + escapeHtml(order.order_number || order.id) + '</h2><div class="cs-detail-meta">' + renderBadge('order', order.status || 'pending') + renderBadge('payment', order.payment_status || 'pending') + renderBadge('fulfillment', order.fulfillment_status || 'none') + '<span class="cs-chip">' + escapeHtml(formatMoney(order.total_amount, order.currency)) + '</span><span class="cs-chip cs-unsaved' + (state.hasUnsavedChanges ? ' is-visible' : '') + '" id="unsavedChip">Kaydedilmedi</span></div></div>' +
      '<div class="cs-action-row"><button class="cs-btn cs-btn-sm" type="button" data-copy="' + attr(order.order_number || order.id) + '">Sipariş No Kopyala</button><button class="cs-btn cs-btn-sm" type="button" data-refresh-detail="' + attr(order.id) + '">Detayı Yenile</button><button class="cs-btn cs-btn-sm cs-btn-ghost" type="button" data-close-detail>Kapat</button></div></div>' +
      '</header>';
  }
  function renderDetailTabs() {
    return '<nav class="cs-detail-tabs" role="tablist" aria-label="Sipariş detay sekmeleri">' + DETAIL_TABS.map(function (tab) {
      return '<button class="cs-detail-tab" type="button" role="tab" aria-selected="' + String(state.detailTab === tab[0]) + '" data-detail-tab="' + attr(tab[0]) + '">' + escapeHtml(tab[1]) + '</button>';
    }).join('') + '</nav>';
  }
  function renderDetailBody(order) {
    if (state.detailTab === 'items') return renderItemsTab(order);
    if (state.detailTab === 'shipment') return renderShipmentTab(order);
    if (state.detailTab === 'payment') return renderPaymentTab(order);
    if (state.detailTab === 'invoice') return renderInvoiceTab(order);
    if (state.detailTab === 'returns') return renderReturnTab(order);
    if (state.detailTab === 'emails') return renderEmailsTab(order);
    if (state.detailTab === 'history') return renderHistoryTab(order);
    if (state.detailTab === 'notes') return renderNotesTab(order);
    return renderSummaryTab(order);
  }
  function renderSummaryTab(order) {
    var shipment = latestShipment(order);
    var invoice = latestInvoice(order);
    var returnReq = latestReturn(order);
    return '<section class="cs-detail-card"><h3>Operasyon Özeti</h3><div class="cs-grid-3">' +
      infoCell('Müşteri', customerName(order) + '\n' + safeText(order.customer_email, 'E-posta yok')) +
      infoCell('Telefon', safeText(order.customer_phone, 'Telefon yok')) +
      infoCell('Sipariş yaşı', orderAge(order.created_at)) +
      infoCell('Teslimat adresi', compactAddress(order, 'delivery')) +
      infoCell('Fatura adresi', compactAddress(order, 'billing')) +
      infoCell('Sipariş tarihi', formatDate(order.created_at)) +
      infoCell('Kargo', shipment ? trackingSummary(order) : 'Kargo bilgisi yok') +
      infoCell('Fatura', invoice ? statusLabel('invoice', invoice.invoice_status) : 'Fatura kaydı yok') +
      infoCell('İade / Refund', returnReq ? statusLabel('return', returnReq.status) : 'İade talebi yok') +
      '</div><div class="cs-action-row"><button class="cs-btn cs-btn-dark" type="button" data-detail-tab="shipment">Kargo ekle/güncelle</button><button class="cs-btn" type="button" data-detail-tab="emails">E-posta geçmişi</button><button class="cs-btn" type="button" data-detail-tab="invoice">Fatura kaydı</button><button class="cs-btn" type="button" data-detail-tab="returns">İade talebi</button></div></section>' +
      renderStatusUpdateForm(order);
  }
  function compactAddress(order, type) {
    if (type === 'billing') {
      return [order.billing_address_line, order.billing_district, order.billing_city, order.billing_postal_code].filter(Boolean).join(', ') || compactAddress(order, 'delivery');
    }
    return [order.address_line, order.district, order.city, order.postal_code].filter(Boolean).join(', ') || 'Adres yok';
  }
  function infoCell(label, value) {
    return '<div class="cs-info-cell"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value).replace(/\n/g, '<br>') + '</strong></div>';
  }
  function renderStatusUpdateForm(order) {
    return '<details class="cs-op-form"><summary>Durumu güncelle</summary><form id="statusUpdateForm" data-order-id="' + attr(order.id) + '"><div class="cs-form-grid">' +
      '<label>Sipariş durumu<select name="status">' + optionsHtml(ORDER_STATUSES.filter(notAll), order.status || 'pending') + '</select></label>' +
      '<label>Ödeme durumu<select name="payment_status">' + optionsHtml(PAYMENT_STATUSES.filter(notAll), order.payment_status || 'pending') + '</select></label>' +
      '<label>Operasyon durumu<select name="fulfillment_status">' + optionsHtml(FULFILLMENT_STATUSES.filter(notAll), order.fulfillment_status || 'unfulfilled') + '</select></label>' +
      '<label class="span-2">Operasyon notu<textarea name="message" placeholder="Bu not order_status_events geçmişine yazılır."></textarea></label>' +
      '</div><div class="cs-warning">Manuel ödeme düzeltmeleri ödeme sağlayıcısından gerçek zamanlı doğrulama yapmaz; yalnızca operasyonel düzeltme kaydı oluşturur.</div><div class="cs-form-actions"><span class="cs-muted">Riskli durumlar onay modalı ile korunur.</span><button class="cs-btn cs-btn-dark" type="submit">Durumu Kaydet</button></div></form></details>';
  }
  function notAll(pair) { return pair[0] !== 'all' && pair[0] !== 'none'; }
  function renderItemsTab(order) {
    var items = itemsOf(order);
    if (!items.length) return emptyDetail('Ürün kaydı yok', 'Bu sipariş için order_items verisi bulunamadı. Layout kırılmadan kontrollü boş durum gösteriliyor.');
    return '<section class="cs-detail-card"><h3>Ürünler</h3><div class="cs-items-list">' + items.map(function (item) {
      var img = item.image ? '<img src="' + attr(item.image) + '" alt="" loading="lazy" />' : '<img alt="" />';
      var link = item.product_slug ? '<a class="cs-link-btn" href="/products/' + attr(item.product_slug) + '.html" target="_blank" rel="noopener">Ürün sayfası</a>' : '<span>Ürün linki yok</span>';
      return '<article class="cs-item-row">' + img + '<div><strong>' + escapeHtml(item.product_name || 'Ürün adı yok') + '</strong><span>' + escapeHtml(item.brand || 'Marka yok') + ' · SKU: ' + escapeHtml(item.sku || '—') + ' · Adet: ' + escapeHtml(item.quantity || 1) + '</span>' + link + '</div><div class="cs-money">' + escapeHtml(formatMoney(item.line_total || Number(item.unit_price || 0) * Number(item.quantity || 1), order.currency)) + '</div></article>';
    }).join('') + '</div></section>';
  }
  function renderShipmentTab(order) {
    var shipment = latestShipment(order);
    return '<section class="cs-detail-card"><h3>Kargo</h3><div class="cs-grid-2">' +
      infoCell('Kargo firması', shipment ? safeText(shipment.carrier_name || shipment.carrier, '—') : 'Kargo kaydı yok') +
      infoCell('Takip no', shipment ? safeText(shipment.tracking_number, 'Takip no yok') : '—') +
      infoCell('Kargo durumu', statusLabel('fulfillment', shipmentStatus(order))) +
      infoCell('Tarih', shipment ? (formatDate(shipment.shipped_at) + (shipment.delivered_at ? ' / Teslim: ' + formatDate(shipment.delivered_at) : '')) : '—') +
      '</div>' + (shipment && shipment.tracking_url ? '<a class="cs-btn cs-btn-dark" href="' + attr(shipment.tracking_url) + '" target="_blank" rel="noopener">Kargo Takip Linkini Aç</a>' : '<p>Güvenilir takip URL yok; kırık link oluşturulmadı.</p>') + '</section>' +
      '<section class="cs-detail-card"><h3>Kargo işlemleri</h3><form id="shipmentForm" data-order-id="' + attr(order.id) + '"><div class="cs-form-grid">' +
      '<label>Kargo firması<select name="carrier_name"><option value="">Seçiniz</option>' + CARRIERS.map(function (c) { return '<option value="' + attr(c) + '"' + (shipment && (shipment.carrier_name || shipment.carrier) === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Takip numarası<input name="tracking_number" value="' + attr(shipment && shipment.tracking_number || '') + '" placeholder="Takip no" /></label>' +
      '<label class="span-2">Takip URL<input name="tracking_url" type="url" value="' + attr(shipment && shipment.tracking_url || '') + '" placeholder="https://" /></label>' +
      '<label>Kargo durumu<select name="shipment_status"><option value="shipped">Kargoda</option><option value="delivered">Teslim Edildi</option><option value="failed">Başarısız</option><option value="returned">Geri Döndü</option></select></label>' +
      '<label>Gönderim tarihi<input name="shipped_at" type="datetime-local" /></label>' +
      '<label class="span-2">Operasyon notu<textarea name="message" placeholder="Kargo hareket notu"></textarea></label>' +
      '<label class="cs-check span-2"><input type="checkbox" name="suppress_customer_email" /> Müşteriye e-posta gönderme</label>' +
      '</div><div class="cs-form-actions"><span class="cs-muted">Kargo bilgisi kaydedildiğinde müşteri e-postası varsayılan olarak açıktır.</span><button class="cs-btn cs-btn-dark" type="submit">Kargo Bilgisini Kaydet</button></div></form><div class="cs-action-row"><button class="cs-btn" type="button" data-order-action="mark_shipped">Kargoya verildi işaretle</button><button class="cs-btn cs-btn-danger" type="button" data-order-action="mark_delivered">Teslim edildi işaretle</button><button class="cs-btn" type="button" data-resend-email="shipment_created">Kargo e-postasını tekrar gönder</button></div></section>' + renderShipmentEvents(order);
  }
  function renderShipmentEvents(order) {
    var events = order.shipment_events || [];
    if (!events.length) return '';
    return '<section class="cs-detail-card"><h3>Kargo hareketleri</h3><div class="cs-timeline">' + events.map(function (event) {
      return '<div class="cs-timeline-item"><strong>' + escapeHtml(statusLabel('fulfillment', event.status || event.event_type)) + '</strong><span>' + escapeHtml(formatDate(event.occurred_at || event.created_at)) + ' · ' + escapeHtml(event.note || 'Kargo hareketi') + '</span></div>';
    }).join('') + '</div></section>';
  }
  function renderPaymentTab(order) {
    var payments = order.payments || [];
    return '<section class="cs-detail-card"><h3>Ödeme</h3><div class="cs-grid-2">' +
      infoCell('Ödeme durumu', statusLabel('payment', order.payment_status || 'pending')) + infoCell('Ödenme zamanı', formatDate(order.paid_at)) + infoCell('Tutar', formatMoney(order.total_amount, order.currency)) + infoCell('Sağlayıcı', payments[0] ? safeText(payments[0].provider, 'Sağlayıcı yok') : 'Kayıt yok') +
      '</div><div class="cs-warning">Bu işlem ödeme sağlayıcısından gerçek zamanlı ödeme doğrulaması yapmaz. Operasyonel düzeltme kaydı oluşturur.</div><div class="cs-action-row"><button class="cs-btn cs-btn-dark" type="button" data-order-action="mark_payment_paid">Ödemeyi manuel ödendi işaretle</button><button class="cs-btn cs-btn-danger" type="button" data-payment-failed>Ödemeyi başarısız işaretle</button></div></section>' +
      '<section class="cs-detail-card"><h3>Ödeme kayıtları</h3>' + (payments.length ? '<div class="cs-record-list">' + payments.map(function (p) { return '<article class="cs-record"><div class="cs-record-head"><strong>' + escapeHtml(p.provider || 'Ödeme') + '</strong>' + renderBadge('payment', p.status || 'pending') + '</div><small>Ref: ' + escapeHtml(p.provider_payment_id || p.provider_reference || '—') + ' · ' + escapeHtml(formatDate(p.created_at)) + '</small></article>'; }).join('') + '</div>' : '<p>Ödeme olay kaydı bulunamadı.</p>') + '</section>';
  }
  function renderInvoiceTab(order) {
    var invoices = order.invoices || [];
    return '<section class="cs-detail-card"><h3>Fatura</h3>' + (invoices.length ? '<div class="cs-record-list">' + invoices.map(function (inv) { return '<article class="cs-record"><div class="cs-record-head"><strong>' + escapeHtml(inv.invoice_number || 'Fatura kaydı') + '</strong>' + renderBadge('invoice', inv.invoice_status || 'pending') + '</div><small>' + escapeHtml(inv.invoice_type || 'manual') + ' · ' + escapeHtml(inv.provider || 'Sağlayıcı yok') + ' · Ref: ' + escapeHtml(inv.provider_reference || '—') + ' · ' + escapeHtml(formatDate(inv.issued_at || inv.created_at)) + '</small>' + (inv.pdf_url ? '<a class="cs-btn cs-btn-sm cs-btn-dark" href="' + attr(inv.pdf_url) + '" target="_blank" rel="noopener">PDF Aç</a>' : '') + (inv.error_message ? '<div class="cs-error-box">' + escapeHtml(inv.error_message) + '</div>' : '') + '</article>'; }).join('') + '</div>' : '<p>Fatura kaydı yok.</p>') + '</section>' +
      '<details class="cs-op-form"><summary>Fatura Kaydı Ekle</summary><form id="invoiceCreateForm" data-order-id="' + attr(order.id) + '"><div class="cs-warning">Fatura sağlayıcı entegrasyonu yapılandırılmadan resmi e-Fatura/e-Arşiv oluşturulmaz.</div><div class="cs-form-grid">' +
      '<label>Fatura tipi<select name="invoice_type"><option value="e_arsiv">e-Arşiv</option><option value="e_fatura">e-Fatura</option><option value="manual">Manuel</option></select></label><label>Durum<select name="invoice_status"><option value="pending">Bekliyor</option><option value="issued">Oluşturuldu</option><option value="failed">Başarısız</option><option value="cancelled">İptal Edildi</option></select></label>' +
      '<label>Fatura No<input name="invoice_number" placeholder="FTR-..." /></label><label>PDF URL<input name="pdf_url" type="url" placeholder="https://" /></label><label>Sağlayıcı<input name="provider" placeholder="manual / Paraşüt / Mikro" /></label><label>Sağlayıcı Referansı<input name="provider_reference" placeholder="Opsiyonel" /></label><label class="span-2">Not<textarea name="note" placeholder="Operasyon notu"></textarea></label></div><div class="cs-form-actions"><span class="cs-muted">Sahte resmi fatura başarı durumu üretilmez.</span><button class="cs-btn cs-btn-dark" type="submit">Fatura Kaydı Ekle</button></div></form></details>';
  }
  function renderReturnTab(order) {
    var returns = order.return_requests || [];
    var refunds = order.refunds || [];
    return '<section class="cs-detail-card"><h3>İade / Refund</h3>' + (returns.length ? '<div class="cs-record-list">' + returns.map(renderReturnRecord).join('') + '</div>' : '<p>Bu sipariş için iade talebi bulunmuyor.</p>') + '</section>' +
      '<section class="cs-detail-card"><h3>Refund kayıtları</h3>' + (refunds.length ? '<div class="cs-record-list">' + refunds.map(function (r) { return '<article class="cs-record"><div class="cs-record-head"><strong>' + escapeHtml(formatMoney(r.amount, r.currency || order.currency)) + '</strong>' + renderBadge('refund', r.status || 'pending') + '</div><small>' + escapeHtml(r.provider || 'manual') + ' · Ref: ' + escapeHtml(r.provider_reference || '—') + ' · ' + escapeHtml(formatDate(r.completed_at || r.created_at)) + '</small>' + (r.error_message ? '<div class="cs-error-box">' + escapeHtml(r.error_message) + '</div>' : '') + '</article>'; }).join('') + '</div>' : '<p>Refund kaydı bulunmuyor.</p>') + '</section>' +
      '<details class="cs-op-form"><summary>Refund kaydı oluştur</summary><form id="refundCreateForm" data-order-id="' + attr(order.id) + '"><div class="cs-warning">Bu işlem gerçek Iyzico refund API çağrısı yapmaz; yalnızca operasyonel kayıt oluşturur.</div><div class="cs-form-grid"><label>İade talebi<select name="return_request_id"><option value="">Seçiniz</option>' + returns.map(function (r) { return '<option value="' + attr(r.id) + '">' + escapeHtml(r.reason || r.id) + '</option>'; }).join('') + '</select></label><label>Tutar<input name="amount" type="number" min="0" step="0.01" value="' + attr(order.total_amount || '') + '" /></label><label>Para birimi<input name="currency" value="' + attr(order.currency || 'TRY') + '" /></label><label>Durum<select name="status"><option value="pending">Bekliyor</option><option value="completed">Tamamlandı</option><option value="failed">Başarısız</option><option value="cancelled">İptal Edildi</option></select></label><label>Sağlayıcı referansı<input name="provider_reference" placeholder="Opsiyonel" /></label><label class="span-2">Not<textarea name="note" placeholder="Refund operasyon notu"></textarea></label></div><div class="cs-form-actions"><span class="cs-muted">Tamamlandı seçilirse refund completed e-postası backend tarafından denenebilir.</span><button class="cs-btn cs-btn-dark" type="submit">Refund Kaydı Oluştur</button></div></form></details>';
  }
  function renderReturnRecord(r) {
    return '<article class="cs-record"><div class="cs-record-head"><strong>' + escapeHtml(r.reason || 'İade talebi') + '</strong>' + renderBadge('return', r.status || 'requested') + '</div><small>' + escapeHtml(r.customer_note || 'Müşteri notu yok') + '</small><form class="returnUpdateForm" data-return-id="' + attr(r.id) + '"><div class="cs-form-grid"><label>İade durumu<select name="status">' + optionsHtml(RETURN_STATUSES.filter(notAll), r.status || 'requested') + '</select></label><label>Refund durumu<select name="refund_status"><option value="not_started"' + (r.refund_status === 'not_started' ? ' selected' : '') + '>Başlamadı</option><option value="pending"' + (r.refund_status === 'pending' ? ' selected' : '') + '>Bekliyor</option><option value="completed"' + (r.refund_status === 'completed' ? ' selected' : '') + '>Tamamlandı</option><option value="failed"' + (r.refund_status === 'failed' ? ' selected' : '') + '>Başarısız</option></select></label><label class="span-2">Admin notu<textarea name="admin_note">' + escapeHtml(r.admin_note || '') + '</textarea></label></div><div class="cs-action-row"><button class="cs-btn cs-btn-dark" type="submit">İade Sürecini Güncelle</button><button class="cs-btn" type="button" data-return-action="under_review" data-return-id="' + attr(r.id) + '">İncelemeye al</button><button class="cs-btn" type="button" data-return-action="approved" data-return-id="' + attr(r.id) + '">İadeyi onayla</button><button class="cs-btn cs-btn-danger" type="button" data-return-action="rejected" data-return-id="' + attr(r.id) + '">İadeyi reddet</button><button class="cs-btn" type="button" data-return-action="received" data-return-id="' + attr(r.id) + '">Ürün teslim alındı</button><button class="cs-btn cs-btn-danger" type="button" data-return-action="closed" data-return-id="' + attr(r.id) + '">Süreci kapat</button></div></form></article>';
  }
  function renderEmailsTab(order) {
    var emails = (order.email_events || []).slice().sort(function (a, b) {
      if (a.status === 'failed' && b.status !== 'failed') return -1;
      if (a.status !== 'failed' && b.status === 'failed') return 1;
      return new Date(b.sent_at || b.created_at) - new Date(a.sent_at || a.created_at);
    });
    var buttons = [['order_created', 'Sipariş onayını tekrar gönder'], ['payment_success', 'Ödeme onayını tekrar gönder'], ['shipment_created', 'Kargo e-postasını tekrar gönder'], ['shipment_delivered', 'Teslimat e-postasını tekrar gönder']];
    return '<section class="cs-detail-card"><h3>E-posta aksiyonları</h3><div class="cs-action-row">' + buttons.map(function (b) { return '<button class="cs-btn" type="button" data-resend-email="' + attr(b[0]) + '">' + escapeHtml(b[1]) + '</button>'; }).join('') + '</div></section>' +
      '<section class="cs-detail-card"><h3>E-posta geçmişi</h3>' + (emails.length ? '<div class="cs-record-list">' + emails.map(function (event) { return '<article class="cs-record ' + (event.status === 'failed' ? 'cs-error-priority' : '') + '"><div class="cs-record-head"><strong>' + escapeHtml(emailLabel(event.email_type)) + '</strong>' + renderBadge('email', event.status || 'pending') + '</div><small>' + escapeHtml(formatDate(event.sent_at || event.created_at)) + ' · ' + escapeHtml(event.customer_email || 'alıcı yok') + ' · ' + escapeHtml(event.provider || 'provider yok') + '</small><small>' + escapeHtml(event.subject || 'Konu yok') + (event.provider_message_id ? ' · ID: ' + escapeHtml(event.provider_message_id) : '') + '</small>' + (event.error_message ? '<div class="cs-error-box">' + escapeHtml(event.error_message) + '</div>' : '') + '</article>'; }).join('') + '</div>' : '<p>E-posta geçmişi bulunmuyor.</p>') + '</section>';
  }
  function emailLabel(type) {
    var map = { order_created: 'Sipariş onayı', payment_success: 'Ödeme onayı', payment_failed: 'Ödeme başarısız', shipment_created: 'Kargo e-postası', shipment_updated: 'Kargo güncellemesi', shipment_delivered: 'Teslimat e-postası', return_request_received: 'İade talebi', return_approved: 'İade onayı', return_rejected: 'İade reddi', refund_completed: 'Refund tamamlandı', review_request: 'Yorum isteği' };
    return map[type] || type || 'E-posta';
  }
  function renderHistoryTab(order) {
    var events = [];
    (order.status_events || []).forEach(function (event) { events.push({ date: event.created_at, title: event.message || event.event_type || event.status, meta: 'Sipariş · ' + safeText(event.source, 'admin'), note: event.note || event.status }); });
    (order.shipment_events || []).forEach(function (event) { events.push({ date: event.occurred_at || event.created_at, title: event.event_type || event.status, meta: 'Kargo', note: event.note || event.status }); });
    (order.email_events || []).forEach(function (event) { events.push({ date: event.sent_at || event.created_at, title: emailLabel(event.email_type), meta: 'E-posta · ' + statusLabel('email', event.status), note: event.error_message || event.subject || '' }); });
    (order.return_requests || []).forEach(function (event) { events.push({ date: event.updated_at || event.created_at, title: 'İade talebi', meta: statusLabel('return', event.status), note: event.admin_note || event.customer_note || event.reason || '' }); });
    (order.refunds || []).forEach(function (event) { events.push({ date: event.completed_at || event.updated_at || event.created_at, title: 'Refund kaydı', meta: statusLabel('refund', event.status), note: formatMoney(event.amount, event.currency || order.currency) }); });
    events.sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });
    if (!events.length) return emptyDetail('Geçmiş kaydı yok', 'Bu sipariş için zaman çizelgesi oluşturacak operasyon kaydı bulunamadı.');
    return '<section class="cs-detail-card"><h3>Operasyon geçmişi</h3><div class="cs-timeline">' + events.map(function (event) { return '<div class="cs-timeline-item"><strong>' + escapeHtml(event.title || 'Kayıt') + '</strong><span>' + escapeHtml(formatDate(event.date)) + ' · ' + escapeHtml(event.meta || '') + '</span>' + (event.note ? '<span>' + escapeHtml(event.note) + '</span>' : '') + '</div>'; }).join('') + '</div></section>';
  }
  function renderNotesTab(order) {
    var notes = [
      ['Müşteri notu', order.customer_note || order.note || 'Müşteri notu yok.'],
      ['Teslimat / kargo notu', order.cargo_note || 'Teslimat notu yok.'],
      ['İade admin notları', (order.return_requests || []).map(function (r) { return r.admin_note; }).filter(Boolean).join('\n') || 'İade admin notu yok.']
    ];
    return '<section class="cs-detail-card"><h3>Notlar</h3><div class="cs-record-list">' + notes.map(function (n) { return '<article class="cs-record"><strong>' + escapeHtml(n[0]) + '</strong><small>' + escapeHtml(n[1]).replace(/\n/g, '<br>') + '</small></article>'; }).join('') + '</div></section>' +
      '<section class="cs-detail-card cs-disabled-note"><h3>Admin notu ekle</h3><p>Mevcut backend şemasında sipariş seviyesinde ayrı admin note endpoint’i görünmediği için bu alan bilinçli olarak pasif bırakıldı. İade notları iade formu üzerinden kaydedilebilir.</p><button class="cs-btn" type="button" disabled>Backend desteği gerekli</button></section>';
  }
  function emptyDetail(title, text) { return '<section class="cs-state-box"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text) + '</p></section>'; }

  async function updateOrder(payload, confirmTitle, confirmBody) {
    if (confirmTitle) {
      var ok = await openConfirmModal(confirmTitle, confirmBody || 'Bu işlem sipariş operasyon kayıtlarını değiştirebilir. Devam etmek istiyor musunuz?', 'Onayla');
      if (!ok) return;
    }
    state.saving = true;
    try {
      var data = await adminFetch(API_ORDERS, { method: 'PATCH', body: JSON.stringify(payload) });
      state.hasUnsavedChanges = false;
      showToast('Sipariş güncellendi', data.message || 'Operasyon bilgileri kaydedildi.', data.email && data.email.sent === false ? 'warn' : 'success');
      await loadOrderDetail(payload.id || payload.order_id, true);
      await loadOrders(false);
    } catch (error) { showToast('Güncelleme başarısız', error.message, 'error'); }
    finally { state.saving = false; }
  }
  async function createInvoice(orderId, form) {
    var fd = new FormData(form);
    var payload = { order_id: orderId, invoice_type: fd.get('invoice_type'), invoice_status: fd.get('invoice_status'), invoice_number: fd.get('invoice_number'), pdf_url: fd.get('pdf_url'), provider: fd.get('provider'), provider_reference: fd.get('provider_reference'), note: fd.get('note') };
    var ok = await openConfirmModal('Fatura kaydı oluşturulsun mu?', 'Bu işlem resmi e-Fatura/e-Arşiv üretmez; yalnızca operasyonel fatura kaydı oluşturur.', 'Kaydı Oluştur');
    if (!ok) return;
    try {
      var data = await adminFetch('/api/admin/invoices', { method: 'POST', body: JSON.stringify(payload) });
      state.hasUnsavedChanges = false;
      showToast('Fatura kaydı', data.message || 'Fatura kaydı oluşturuldu.', 'success');
      await loadOrderDetail(orderId, true);
      await loadOrders(false);
    } catch (error) { showToast('Fatura kaydı başarısız', error.message, 'error'); }
  }
  async function createRefund(orderId, form) {
    var fd = new FormData(form);
    var payload = { order_id: orderId, return_request_id: fd.get('return_request_id'), amount: fd.get('amount'), currency: fd.get('currency') || 'TRY', status: fd.get('status'), provider: 'manual', provider_reference: fd.get('provider_reference'), note: fd.get('note') };
    var ok = await openConfirmModal('Refund kaydı oluşturulsun mu?', 'Bu işlem gerçek Iyzico refund API çağrısı yapmaz; yalnızca operasyonel kayıt oluşturur.', 'Refund Kaydı Oluştur');
    if (!ok) return;
    try {
      var data = await adminFetch('/api/admin/refunds', { method: 'POST', body: JSON.stringify(payload) });
      state.hasUnsavedChanges = false;
      showToast('Refund kaydı', data.message || 'Refund kaydı oluşturuldu.', payload.status === 'completed' ? 'warn' : 'success');
      await loadOrderDetail(orderId, true);
      await loadOrders(false);
    } catch (error) { showToast('Refund kaydı başarısız', error.message, 'error'); }
  }
  async function updateReturn(returnId, payload, needsConfirm) {
    var ok = true;
    if (needsConfirm) ok = await openConfirmModal('İade işlemini onayla', 'Bu işlem iade durumunu değiştirebilir ve bazı durumlarda müşteriye e-posta gönderilmesine neden olabilir.', 'Onayla');
    if (!ok) return;
    try {
      var data = await adminFetch('/api/admin/returns', { method: 'PATCH', body: JSON.stringify(Object.assign({ id: returnId }, payload)) });
      state.hasUnsavedChanges = false;
      showToast('İade süreci güncellendi', data.message || 'İade talebi kaydedildi.', data.email && data.email.sent === false ? 'warn' : 'success');
      if (state.selectedOrder) await loadOrderDetail(state.selectedOrder.id, true);
      await loadOrders(false);
    } catch (error) { showToast('İade güncellenemedi', error.message, 'error'); }
  }
  async function resendEmail(orderId, type) {
    var ok = await openConfirmModal('E-posta tekrar gönderilsin mi?', 'Bu işlem müşteriye e-posta gönderilmesine neden olabilir. Devam etmek istiyor musunuz?', 'Tekrar Gönder');
    if (!ok) return;
    try {
      var data = await adminFetch(API_ORDERS + '/' + encodeURIComponent(orderId) + '/emails', { method: 'POST', body: JSON.stringify({ email_type: type }) });
      showToast('E-posta işlemi', data.message || 'E-posta tekrar gönderildi.', data.email && data.email.sent ? 'success' : 'warn');
      await loadOrderDetail(orderId, true);
      await loadOrders(false);
    } catch (error) { showToast('E-posta gönderilemedi', error.message, 'error'); }
  }
  function openConfirmModal(title, body, acceptText) {
    return new Promise(function (resolve) {
      state.confirmResolver = resolve;
      var modal = el.confirmModal;
      byId('confirmTitle').textContent = title || 'İşlemi onayla';
      byId('confirmBody').textContent = body || 'Devam etmek istiyor musunuz?';
      var accept = modal.querySelector('[data-confirm-accept]');
      if (accept) accept.textContent = acceptText || 'Onayla';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      var card = modal.querySelector('.cs-confirm-card');
      if (card) card.focus();
    });
  }
  function closeConfirmModal(result) {
    el.confirmModal.classList.remove('is-open');
    el.confirmModal.setAttribute('aria-hidden', 'true');
    if (state.confirmResolver) state.confirmResolver(Boolean(result));
    state.confirmResolver = null;
  }
  function copyText(text) {
    var value = String(text || '').trim();
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { showToast('Kopyalandı', value, 'success'); }).catch(function () { fallbackCopy(value); });
    } else fallbackCopy(value);
  }
  function fallbackCopy(value) {
    var input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); showToast('Kopyalandı', value, 'success'); }
    catch (error) { showToast('Kopyalanamadı', 'Tarayıcı kopyalama izni vermedi.', 'error'); }
    input.remove();
  }

  function onClick(event) {
    var target = event.target;
    if (target.closest('#loginBtn')) { login().catch(function (error) { showLogin(error.message, true); }); return; }
    if (target.closest('#logoutBtn')) { logout(); return; }
    if (target.closest('#refreshBtn')) { collectFilters(); loadOrders(false); return; }
    if (target.closest('#applyFiltersBtn')) { collectFilters(); state.offset = 0; loadOrders(false); return; }
    if (target.closest('#clearFiltersBtn')) { resetFilters(); loadOrders(false); return; }
    if (target.closest('#loadMoreBtn')) { collectFilters(); loadOrders(true); return; }
    if (target.closest('#filterToggle')) {
      el.filtersPanel.classList.toggle('is-open');
      el.filterToggle.setAttribute('aria-expanded', String(el.filtersPanel.classList.contains('is-open')));
      return;
    }
    var primary = target.closest('[data-primary-tab]');
    if (primary) { state.activeTab = primary.getAttribute('data-primary-tab'); render(); return; }
    var open = target.closest('[data-open-order]');
    if (open) {
      state.lastFocusedElement = open;
      loadOrderDetail(open.getAttribute('data-open-order'), false);
      return;
    }
    if (target.closest('[data-close-detail]')) { closeDetail(false); return; }
    var tab = target.closest('[data-detail-tab]');
    if (tab) { state.detailTab = tab.getAttribute('data-detail-tab'); state.hasUnsavedChanges = false; renderDetail(); return; }
    var refreshDetail = target.closest('[data-refresh-detail]');
    if (refreshDetail) { loadOrderDetail(refreshDetail.getAttribute('data-refresh-detail'), true); return; }
    var copy = target.closest('[data-copy]');
    if (copy) { copyText(copy.getAttribute('data-copy')); return; }
    var orderAction = target.closest('[data-order-action]');
    if (orderAction && state.selectedOrder) { handleOrderAction(orderAction.getAttribute('data-order-action')); return; }
    if (target.closest('[data-payment-failed]') && state.selectedOrder) {
      updateOrder({ id: state.selectedOrder.id, status: 'payment_failed', payment_status: 'failed', message: 'Admin panelinden ödeme başarısız olarak işaretlendi.' }, 'Ödeme başarısız işaretlensin mi?', 'Bu işlem gerçek ödeme sağlayıcı doğrulaması yapmaz; operasyonel düzeltme kaydı oluşturur.');
      return;
    }
    var resend = target.closest('[data-resend-email]');
    if (resend && state.selectedOrder) { resendEmail(state.selectedOrder.id, resend.getAttribute('data-resend-email')); return; }
    var returnAction = target.closest('[data-return-action]');
    if (returnAction) { updateReturn(returnAction.getAttribute('data-return-id'), { status: returnAction.getAttribute('data-return-action') }, true); return; }
    if (target.closest('[data-confirm-cancel]')) { closeConfirmModal(false); return; }
    if (target.closest('[data-confirm-accept]')) { closeConfirmModal(true); }
  }
  function handleOrderAction(action) {
    var orderId = state.selectedOrder.id;
    if (action === 'mark_shipped') updateOrder({ id: orderId, action: 'mark_shipped', message: 'Admin panelinden kargoya verildi olarak işaretlendi.' }, 'Kargoya verildi olarak işaretlensin mi?', 'Kargo bilgisi yoksa yalnızca sipariş operasyon durumu güncellenir.');
    if (action === 'mark_delivered') updateOrder({ id: orderId, action: 'mark_delivered', message: 'Admin panelinden teslim edildi olarak işaretlendi.' }, 'Teslim edildi olarak işaretlensin mi?', 'Bu işlem müşteriye teslimat e-postası gönderilmesine neden olabilir.');
    if (action === 'mark_payment_paid') updateOrder({ id: orderId, action: 'mark_payment_paid', message: 'Admin panelinden ödeme manuel olarak ödendi işaretlendi.' }, 'Ödeme manuel ödendi işaretlensin mi?', 'Bu işlem ödeme sağlayıcısından gerçek zamanlı doğrulama yapmaz; operasyonel düzeltme kaydı oluşturur.');
  }
  function onSubmit(event) {
    var form = event.target;
    if (!form) return;
    if (form.id === 'statusUpdateForm') {
      event.preventDefault();
      var fd = new FormData(form);
      var payload = { id: form.getAttribute('data-order-id'), status: fd.get('status'), payment_status: fd.get('payment_status'), fulfillment_status: fd.get('fulfillment_status'), message: fd.get('message') };
      var risky = ['cancelled', 'delivered', 'payment_failed'].indexOf(payload.status) >= 0 || ['paid', 'failed'].indexOf(payload.payment_status) >= 0;
      updateOrder(payload, risky ? 'Durum değişikliği onaylansın mı?' : null, risky ? 'Bu işlem sipariş, ödeme veya operasyon durumunu değiştirecek.' : null);
    }
    if (form.id === 'shipmentForm') {
      event.preventDefault();
      var sd = new FormData(form);
      var shipmentStatus = sd.get('shipment_status') || 'shipped';
      var orderStatusForShipment = shipmentStatus === 'delivered' ? 'delivered' : (shipmentStatus === 'shipped' ? 'shipped' : undefined);
      var payload2 = { id: form.getAttribute('data-order-id'), carrier_name: sd.get('carrier_name'), carrier: sd.get('carrier_name'), tracking_number: sd.get('tracking_number'), tracking_url: sd.get('tracking_url'), shipment_status: shipmentStatus, status: orderStatusForShipment, fulfillment_status: shipmentStatus, shipped_at: sd.get('shipped_at') || undefined, message: sd.get('message') || 'Kargo bilgisi kaydedildi.', suppress_customer_email: Boolean(sd.get('suppress_customer_email')) };
      updateOrder(payload2, 'Kargo bilgisi kaydedilsin mi?', payload2.suppress_customer_email ? 'Müşteriye e-posta gönderilmeden kargo bilgisi güncellenecek.' : 'Bu işlem müşteriye kargo e-postası gönderilmesine neden olabilir.');
    }
    if (form.id === 'invoiceCreateForm') { event.preventDefault(); createInvoice(form.getAttribute('data-order-id'), form); }
    if (form.id === 'refundCreateForm') { event.preventDefault(); createRefund(form.getAttribute('data-order-id'), form); }
    if (form.classList.contains('returnUpdateForm')) {
      event.preventDefault();
      var rd = new FormData(form);
      updateReturn(form.getAttribute('data-return-id'), { status: rd.get('status'), refund_status: rd.get('refund_status'), admin_note: rd.get('admin_note') }, true);
    }
  }
  function onInput(event) {
    if (event.target && event.target.closest('.cs-detail-drawer form')) {
      state.hasUnsavedChanges = true;
      var chip = byId('unsavedChip');
      if (chip) chip.classList.add('is-visible');
    }
  }
  function onKeydown(event) {
    if (event.key === 'Escape') {
      if (el.confirmModal && el.confirmModal.classList.contains('is-open')) closeConfirmModal(false);
      else if (el.detailShell && el.detailShell.classList.contains('is-open')) closeDetail(false);
    }
    var row = event.target && event.target.closest('[data-open-order]');
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      loadOrderDetail(row.getAttribute('data-open-order'), false);
    }
  }

  function init() {
    cacheElements();
    initFilterOptions();
    migrateLegacyToken();
    var token = getSessionToken();
    if (token && el.tokenInput) el.tokenInput.value = token;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('keydown', onKeydown);
    if (token) { showApp(); loadOrders(false); }
    else showLogin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
