(function () {
  'use strict';

  var TOKEN_KEY = 'cosmoskin_admin_token';
  var API_BASE = '/api/admin/orders';
  var STATUS_OPTIONS = [
    ['all', 'Tüm durumlar'],
    ['pending', 'Sipariş Alındı'],
    ['confirmed', 'Onaylandı'],
    ['preparing', 'Hazırlanıyor'],
    ['packed', 'Paketlendi'],
    ['shipped', 'Kargoya Verildi'],
    ['delivered', 'Teslim Edildi'],
    ['cancelled', 'İptal'],
    ['return_requested', 'İade Talebi'],
    ['returned', 'İade Alındı'],
    ['refunded', 'İade Edildi'],
    ['pending_payment', 'Ödeme Bekliyor'],
    ['paid', 'Ödendi'],
    ['payment_failed', 'Ödeme Başarısız'],
    ['partially_refunded', 'Kısmi İade']
  ];

  var STATUS_LABELS = {
    pending: 'Sipariş Alındı',
    confirmed: 'Onaylandı',
    preparing: 'Hazırlanıyor',
    packed: 'Paketlendi',
    shipped: 'Kargoya Verildi',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal',
    return_requested: 'İade Talebi',
    returned: 'İade Alındı',
    refunded: 'İade Edildi',
    pending_payment: 'Ödeme Bekliyor',
    paid: 'Ödendi',
    payment_failed: 'Ödeme Başarısız',
    partially_refunded: 'Kısmi İade',
    authorized: 'Ödeme Yetkilendirildi',
    initiated: 'Ödeme Başlatıldı',
    failed: 'Başarısız',
    unfulfilled: 'Hazırlık Bekliyor',
    not_started: 'Hazırlık Bekliyor',
    shipment_created: 'Kargo Bilgisi',
    shipment_updated: 'Kargo Güncellendi',
    stock_reserved: 'Stok Rezerve',
    payment_success: 'Ödeme Başarılı',
    order_created: 'Sipariş Oluştu'
  };

  var EMAIL_LABELS = {
    order_created: 'Sipariş onayı',
    payment_success: 'Ödeme onayı',
    payment_failed: 'Ödeme başarısız',
    shipment_created: 'Kargo e-postası',
    shipment_updated: 'Kargo güncellemesi',
    shipment_delivered: 'Teslim bildirimi',
    restock_alert: 'Stok bildirimi',
    refund_created: 'İade bildirimi',
    return_request_received: 'İade talebi',
    review_request: 'Yorum isteği'
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
      var notify = data.notification || data.email || {};
      if (notify && notify.error) {
        toast('Sipariş güncellendi', data.message || 'Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.', 'error');
      } else {
        toast('Sipariş güncellendi', data.message || 'Durum ve operasyon bilgileri kaydedildi.', 'success');
      }
      await loadOrders(false);
    } catch (error) {
      toast('Güncelleme başarısız', error.message || 'Bilinmeyen hata.', 'error');
    } finally {
      state.saving = false;
      renderDrawer();
    }
  }


  async function resendEmail(orderId, emailType) {
    if (!orderId || !emailType) return;
    try {
      var response = await fetch(API_BASE + '/' + encodeURIComponent(orderId) + '/emails', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ email_type: emailType })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || 'E-posta tekrar gönderilemedi.');
      toast('E-posta işlemi', data.message || 'E-posta tekrar gönderildi.', data.email && data.email.sent ? 'success' : 'error');
      await loadOrders(false);
    } catch (error) {
      toast('E-posta işlemi başarısız', error.message || 'Bilinmeyen hata.', 'error');
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
      ['Ödenmiş Ciro', money(summary.paidRevenue || 0, 'TRY'), 'Onaylanan / hazırlanıyor / kargoda / teslim edilen'],
      ['Hazırlanacak', Number(summary.confirmed || 0) + Number(summary.paid || 0) + Number(summary.preparing || 0), 'Ödeme sonrası operasyon kuyruğu'],
      ['Kargo Süreci', Number(summary.shipped || 0) + Number(summary.delivered || 0), 'Kargoda ve teslim edilen siparişler']
    ];
    el.statsGrid.innerHTML = cards.map(function (card) {
      return '<article class="stat-card"><p class="stat-label">' + esc(card[0]) + '</p><div class="stat-value">' + esc(card[1]) + '</div><p class="stat-copy">' + esc(card[2]) + '</p></article>';
    }).join('');

    el.heroPanel.innerHTML = [
      ['Bekleyen ödeme', Number(summary.pending || 0) + Number(summary.pending_payment || 0)],
      ['Kargoya hazır', Number(summary.confirmed || 0) + Number(summary.paid || 0) + Number(summary.preparing || 0) + Number(summary.packed || 0)],
      ['Başarısız ödeme', summary.payment_failed || 0]
    ].map(function (row) {
      return '<div class="hero-row"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
    }).join('');

    el.sidebarMetrics.innerHTML = [
      ['Sipariş alındı', Number(summary.pending || 0) + Number(summary.pending_payment || 0)],
      ['Hazırlanıyor', Number(summary.confirmed || 0) + Number(summary.preparing || 0)],
      ['Paket/Kargo', Number(summary.packed || 0) + Number(summary.shipped || 0)],
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
      renderEmailPanel(order) +
      renderUpdatePanel(order, shipment) +
      '</div>';
  }

  function renderDetailPanel(order, payment, shipment) {
    var deliveryAddress = [order.address_line, order.district, order.city, order.postal_code].filter(Boolean).join(', ') || '—';
    var billingAddress = [order.billing_address_line || order.address_line, order.billing_district || order.district, order.billing_city || order.city, order.billing_postal_code || order.postal_code].filter(Boolean).join(', ') || deliveryAddress;
    return '<section class="detail-panel"><div class="panel-title"><strong>Müşteri, ödeme ve adres</strong></div><div class="detail-grid">' +
      detailCell('Müşteri', ((order.customer_first_name || '') + ' ' + (order.customer_last_name || '')).trim() || '—') +
      detailCell('E-posta', order.customer_email || '—') +
      detailCell('Telefon', order.customer_phone || '—') +
      detailCell('Toplam', money(order.total_amount, order.currency)) +
      detailCell('Sipariş Durumu', statusLabel(order.status)) +
      detailCell('Ödeme', statusLabel(payment.status || order.payment_status || '—')) +
      detailCell('Operasyon', statusLabel(order.fulfillment_status || shipment.status || '—')) +
      detailCell('Kargo', shipment.tracking_number ? ((shipment.carrier || shipment.carrier_name || 'Kargo') + ' · ' + shipment.tracking_number) : statusLabel(shipment.status || order.fulfillment_status || '—')) +
      '</div><div class="detail-cell" style="margin-top:10px;"><span>Teslimat Adresi</span><strong>' + esc(deliveryAddress) + '</strong></div>' +
      '<div class="detail-cell" style="margin-top:10px;"><span>Fatura Adresi</span><strong>' + esc(billingAddress) + '</strong></div>' +
      (shipment.tracking_url ? '<div class="detail-cell" style="margin-top:10px;"><span>Takip Bağlantısı</span><strong><a href="' + esc(shipment.tracking_url) + '" target="_blank" rel="noopener">Kargoyu Takip Et</a></strong></div>' : '') +
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
        var label = statusLabel(event.new_status || event.status || event.event_type);
        var actor = event.created_by || event.source || 'system';
        var note = event.note || event.message || '';
        var transition = event.previous_status && event.new_status ? ' · ' + statusLabel(event.previous_status) + ' → ' + statusLabel(event.new_status) : '';
        return '<div class="timeline-item"><strong>' + esc(label) + ' · ' + esc(actor) + esc(transition) + '</strong><span>' + esc(note) + '</span><span>' + esc(dateTime(event.created_at)) + '</span></div>';
      }).join('') : '<div class="empty-state">Durum geçmişi henüz yok.</div>') + '</div></section>';
  }

  function renderEmailPanel(order) {
    var emails = order.email_events || [];
    var shipment = getLatestShipment(order);
    var safeResend = '<div class="email-actions">' +
      (shipment && order.customer_email ? '<button class="secondary-btn" type="button" data-action="resend-email" data-id="' + esc(order.id) + '" data-email-type="shipment_created">Kargo e-postasını tekrar gönder</button>' : '') +
      (order.customer_email ? '<button class="secondary-btn" type="button" data-action="resend-email" data-id="' + esc(order.id) + '" data-email-type="payment_success">Ödeme onayını tekrar gönder</button>' : '') +
      (order.customer_email ? '<button class="secondary-btn" type="button" data-action="resend-email" data-id="' + esc(order.id) + '" data-email-type="order_created">Sipariş onayını tekrar gönder</button>' : '') +
      '</div>';
    return '<section class="detail-panel"><div class="panel-title"><strong>E-posta geçmişi</strong><span class="meta-pill">' + esc(emails.length) + ' kayıt</span></div>' + safeResend + '<div class="timeline email-timeline">' +
      (emails.length ? emails.map(function (event) {
        var status = event.status || 'pending';
        var failed = status === 'failed';
        return '<div class="timeline-item"><strong>' + esc(EMAIL_LABELS[event.email_type] || event.email_type || 'E-posta') + ' · ' + esc(statusLabel(status)) + '</strong><span>' + esc(event.customer_email || '') + (event.provider ? ' · ' + esc(event.provider) : '') + '</span>' + (failed && event.error_message ? '<span>' + esc(event.error_message) + '</span>' : '') + '<span>' + esc(dateTime(event.sent_at || event.created_at)) + '</span></div>';
      }).join('') : '<div class="empty-state">E-posta kaydı henüz yok.</div>') + '</div></section>';
  }

  function renderUpdatePanel(order, shipment) {
    var options = STATUS_OPTIONS.filter(function (option) { return option[0] !== 'all'; }).map(function (option) {
      return '<option value="' + esc(option[0]) + '"' + (option[0] === order.status ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
    }).join('');
    return '<section class="detail-panel"><div class="panel-title"><strong>Operasyon güncelle</strong><span class="kbd">PATCH /api/admin/orders</span></div>' +
      '<form class="update-form" id="orderUpdateForm" data-order-id="' + esc(order.id) + '">' +
      '<div class="field"><label>Hızlı aksiyon</label><select name="action"><option value="">Manuel durum seç</option><option value="mark_payment_paid">Ödemeyi ödendi işaretle</option><option value="mark_preparing">Hazırlanıyor işaretle</option><option value="mark_packed">Paketlendi işaretle</option><option value="mark_shipped">Kargoya verildi işaretle</option><option value="mark_delivered">Teslim edildi işaretle</option><option value="cancel_order">Siparişi iptal et</option></select></div>' +
      '<div class="field"><label>Yeni durum</label><select name="status">' + options + '</select></div>' +
      '<div class="field"><label>Kargo firması</label><input name="carrier" type="text" placeholder="Yurtiçi, MNG, Aras..." value="' + esc(shipment.carrier || '') + '"></div>' +
      '<div class="field"><label>Takip numarası</label><input name="tracking_number" type="text" placeholder="Takip kodu" value="' + esc(shipment.tracking_number || '') + '"></div>' +
      '<div class="field"><label>Takip linki</label><input name="tracking_url" type="url" placeholder="https://..." value="' + esc(shipment.tracking_url || '') + '"></div>' +
      '<div class="field"><label>Admin notu</label><textarea name="message" placeholder="Bu not durum geçmişine yazılır. Kargo bilgisi kaydedilirse müşteri e-postası varsayılan olarak gönderilir."></textarea></div>' +
      '<label class="check-row"><input name="suppress_customer_email" type="checkbox"> Müşteriye e-posta gönderme</label>' +
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
    el.drawer.addEventListener('click', function (event) {
      var resend = event.target.closest('[data-action="resend-email"]');
      if (!resend) return;
      resendEmail(resend.getAttribute('data-id') || '', resend.getAttribute('data-email-type') || 'shipment_created');
    });
    el.drawer.addEventListener('submit', function (event) {
      var form = event.target.closest('#orderUpdateForm');
      if (!form) return;
      event.preventDefault();
      var data = new FormData(form);
      updateOrder({
        order_id: form.getAttribute('data-order-id'),
        action: data.get('action'),
        status: data.get('status'),
        carrier: data.get('carrier'),
        tracking_number: data.get('tracking_number'),
        tracking_url: data.get('tracking_url'),
        message: data.get('message'),
        suppress_customer_email: data.get('suppress_customer_email') === 'on'
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
