(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

  var statusLabels = {
    pending: 'Sipariş Alındı', pending_payment: 'Ödeme Bekleniyor', pending_bank_transfer: 'Havale/EFT Bekleniyor', confirmed: 'Ödeme Onaylandı', paid: 'Ödeme Alındı', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoya Verildi', delivered: 'Teslim Edildi', cancelled: 'İptal Edildi', payment_failed: 'Ödeme Başarısız', refunded: 'İade Edildi', partially_refunded: 'Kısmi İade', return_requested: 'İade Talebi', returned: 'İade Alındı', awaiting_transfer: 'Havale/EFT Bekleniyor'
  };
  var shipmentLabels = {
    not_started: 'Hazırlık bekliyor', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoda', delivered: 'Teslim edildi', cancelled: 'İptal edildi', returned: 'İade sürecinde'
  };
  var paymentLabels = {
    pending: 'Beklemede', authorized: 'Yetkilendirildi', initiated: 'Başlatıldı', awaiting_transfer: 'Havale/EFT bekleniyor', paid: 'Ödendi', failed: 'Başarısız', refunded: 'İade edildi', partially_refunded: 'Kısmi iade', cancelled: 'İptal edildi'
  };

  function $(selector, root) { return (root || document).querySelector(selector); }
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
      return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: withTime ? 'short' : undefined, timeZone: 'Europe/Istanbul' }).format(new Date(value));
    } catch (_) { return String(value).slice(0, 10); }
  }
  function setState(title, body, error) {
    var state = $('#orderDetailState');
    var content = $('#orderDetailContent');
    if (state) {
      state.hidden = false;
      state.classList.toggle('is-error', Boolean(error));
      state.innerHTML = '<strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(body || '') + '</p>' + (error ? '<a class="btn btn-secondary" href="/account/profile.html?tab=orders">Siparişlerime Dön</a>' : '');
    }
    if (content) content.hidden = true;
  }
  function showContent() {
    var state = $('#orderDetailState');
    var content = $('#orderDetailContent');
    if (state) state.hidden = true;
    if (content) content.hidden = false;
  }
  function getApiBase() { return (cfg.apiBase || '/api').replace(/\/$/, ''); }
  function getProduct(handle, name) {
    var helpers = window.COSMOSKIN_PRODUCT_HELPERS || {};
    if (typeof helpers.getProductByHandle === 'function') return helpers.getProductByHandle(handle) || helpers.getProductByHandle(name);
    var raw = String(handle || '').replace(/^.*\/products\//, '').replace(/\.html.*$/, '');
    return (window.COSMOSKIN_PRODUCTS || []).find(function (p) { return p.slug === raw || p.id === raw || p.name === name || p.url === handle; }) || null;
  }
  function resolveItem(item) {
    var product = getProduct(item.product_slug || item.product_id || item.product_url || '', item.product_name || '');
    var slug = product?.slug || item.product_slug || item.product_id || '';
    return Object.assign({}, item, {
      product_slug: slug,
      product_name: product?.name || item.product_name || 'Ürün',
      brand: product?.brand || item.brand || 'COSMOSKIN',
      image: product?.image || item.image || '',
      product_url: product?.url || item.product_url || (slug ? '/products/' + slug + '.html' : '#')
    });
  }
  function getPrimaryShipment(order) {
    var shipments = Array.isArray(order.shipments) ? order.shipments.slice() : [];
    return shipments.sort(function (a, b) { return new Date(b.updated_at || b.created_at || b.shipped_at || 0) - new Date(a.updated_at || a.created_at || a.shipped_at || 0); })[0] || {};
  }
  function getOrderProgress(order) {
    var shipment = getPrimaryShipment(order);
    var status = String(order.status || '').toLowerCase();
    var payment = String(order.payment_status || '').toLowerCase();
    var fulfillment = String(order.fulfillment_status || '').toLowerCase();
    var ship = String(shipment.status || '').toLowerCase();
    var cancelled = ['cancelled', 'payment_failed', 'failed', 'refunded', 'partially_refunded'].includes(status) || ['cancelled', 'returned'].includes(fulfillment) || ['cancelled', 'returned'].includes(ship);
    var current = 0;
    if (['confirmed', 'paid', 'preparing', 'packed', 'shipped', 'delivered'].includes(status) || payment === 'paid' || order.paid_at) current = 1;
    if (['preparing', 'packed', 'shipped', 'delivered'].includes(status) || ['preparing', 'packed'].includes(fulfillment)) current = 2;
    if (['shipped', 'delivered'].includes(status) || fulfillment === 'shipped' || ship === 'shipped' || shipment.tracking_number || order.fulfilled_at) current = 3;
    if (status === 'delivered' || fulfillment === 'delivered' || ship === 'delivered' || order.delivered_at || shipment.delivered_at) current = 4;
    return [
      { label: 'Sipariş alındı', date: order.created_at },
      { label: 'Ödeme onaylandı', date: order.paid_at },
      { label: 'Hazırlanıyor', date: current >= 2 ? order.fulfilled_at : '' },
      { label: 'Kargoda', date: shipment.shipped_at || order.fulfilled_at },
      { label: 'Teslim edildi', date: shipment.delivered_at || order.delivered_at }
    ].map(function (step, index) {
      return Object.assign({}, step, { done: !cancelled && index <= current, current: !cancelled && index === current, problem: cancelled && index === current, muted: index > current });
    });
  }
  function renderProgress(order) {
    return '<div class="cs-detail-card-head"><span>Canlı Durum</span><h2>Sipariş Takip Akışı</h2></div><div class="cs-order-progress is-detail">' + getOrderProgress(order).map(function (step) {
      return '<div class="cs-order-step ' + (step.done ? 'is-done ' : '') + (step.current ? 'is-current ' : '') + (step.problem ? 'is-problem ' : '') + (step.muted ? 'is-muted' : '') + '"><span></span><strong>' + escapeHtml(step.label) + '</strong><small>' + escapeHtml(formatDate(step.date, true)) + '</small></div>';
    }).join('') + '</div>';
  }
  function renderItems(order) {
    var items = (order.order_items || []).map(resolveItem);
    return '<div class="cs-detail-card-head"><span>Ürünler</span><h2>Siparişteki Ürünler</h2></div><div class="cs-detail-items">' + (items.length ? items.map(function (item) {
      var image = item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.product_name) + '" loading="lazy">' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5zM8 8a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
      return '<a class="cs-detail-item" href="' + escapeHtml(item.product_url) + '"><span class="cs-order-thumb">' + image + '</span><span><small>' + escapeHtml(item.brand) + '</small><strong>' + escapeHtml(item.product_name) + '</strong><em>Adet: ' + escapeHtml(item.quantity || 1) + ' · Birim: ' + escapeHtml(formatMoney(item.unit_price || 0)) + '</em></span><b>' + escapeHtml(formatMoney(item.line_total || 0)) + '</b></a>';
    }).join('') : '<p class="account-mini">Ürün detayı bulunamadı.</p>') + '</div>';
  }
  function isCustomerVisibleEvent(event) {
    if (!event) return false;
    var key = String(event.status || event.event_type || '').toLowerCase().trim();
    if (!key) return false;
    var hidden = {
      stock_reserved: 1,
      stock_released: 1,
      payment_authorized: 1,
      payment_duplicate_ignored: 1,
      order_processing_review_required: 1,
      inventory_reconciliation_required: 1,
      payment_callback_error: 1,
      mark_payment_paid: 1,
      mark_preparing: 1,
      mark_packed: 1,
      mark_shipped: 1,
      mark_delivered: 1,
      cancel_order: 1,
      status_updated: 1,
      updated: 1,
      shipment_created: 1,
      shipment_updated: 1
    };
    if (hidden[key]) return false;
    if (String(event.source || '').toLowerCase() === 'inventory') return false;
    return true;
  }
  function renderTimeline(order) {
    var shipment = getPrimaryShipment(order);
    var events = Array.isArray(order.status_events) ? order.status_events.slice() : [];
    events = events.filter(isCustomerVisibleEvent);
    // Deduplicate consecutive same status labels
    var deduped = [];
    events.forEach(function (event) {
      var label = statusLabels[event.status] || shipmentLabels[event.status] || '';
      if (!label) return; // skip unlabeled/raw snake_case leftovers
      var prev = deduped[deduped.length - 1];
      if (prev && prev._label === label && String(prev.message || '') === String(event.message || '')) return;
      event = Object.assign({}, event, { _label: label });
      deduped.push(event);
    });
    events = deduped;
    if (!events.length) {
      events = [{ status: 'received', _label: 'Sipariş Alındı', message: 'Siparişiniz oluşturuldu.', created_at: order.created_at }, order.paid_at ? { status: 'paid', _label: statusLabels.paid, message: 'Ödeme onaylandı.', created_at: order.paid_at } : null, shipment.tracking_number ? { status: 'shipped', _label: statusLabels.shipped, message: 'Kargo takip numarası oluşturuldu.', created_at: shipment.shipped_at || shipment.created_at } : null, order.delivered_at || shipment.delivered_at ? { status: 'delivered', _label: statusLabels.delivered, message: 'Teslimat tamamlandı.', created_at: order.delivered_at || shipment.delivered_at } : null].filter(Boolean);
    }
    return '<div class="cs-detail-card-head"><span>Sipariş Geçmişi</span><h2>Durum Hareketleri</h2></div><div class="cs-timeline cs-timeline--detail">' + events.map(function (event) {
      return '<div class="cs-timeline-item"><strong>' + escapeHtml(event._label || statusLabels[event.status] || shipmentLabels[event.status] || 'Durum') + '</strong><time>' + escapeHtml(formatDate(event.created_at, true)) + '</time>' + (event.message ? '<p>' + escapeHtml(event.message) + '</p>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function renderSummary(order) {
    var invoice = (order.invoices || []).find(function (item) { return item && item.pdf_url; });
    var latestReturn = (order.return_requests || [])[0];
    return '<div class="cs-detail-card-head"><span>Özet</span><h2>Ödeme Kırılımı</h2></div><div class="cs-detail-summary"><div><span>Ara Toplam</span><strong>' + escapeHtml(formatMoney(order.subtotal_amount || 0)) + '</strong></div><div><span>KDV</span><strong>' + escapeHtml(formatMoney(order.vat_amount || 0)) + '</strong></div><div><span>Kargo</span><strong>' + escapeHtml(formatMoney(order.shipping_amount || 0)) + '</strong></div><div><span>İndirim</span><strong>-' + escapeHtml(formatMoney(order.discount_amount || 0)) + '</strong></div><div class="is-total"><span>Toplam</span><strong>' + escapeHtml(formatMoney(order.total_amount || 0)) + '</strong></div><div><span>Ödeme</span><strong>' + escapeHtml(paymentLabels[order.payment_status] || order.payment_status || '—') + '</strong></div>' + (latestReturn ? '<div><span>İade Talebi</span><strong>' + escapeHtml(latestReturn.status || 'requested') + ' / ' + escapeHtml(latestReturn.refund_status || 'not_started') + '</strong></div>' : '') + '</div>' + (invoice ? '<a class="btn btn-primary cs-detail-track" href="' + escapeHtml(invoice.pdf_url) + '" target="_blank" rel="noopener">Faturayı Görüntüle</a>' : '<p class="account-mini">Fatura bağlantısı yalnızca fatura kaydı oluştuğunda gösterilir.</p>');
  }
  function renderShipping(order) {
    var shipment = getPrimaryShipment(order);
    return '<div class="cs-detail-card-head"><span>Kargo</span><h2>Teslimat Takibi</h2></div><div class="cs-detail-summary"><div><span>Durum</span><strong>' + escapeHtml(shipmentLabels[shipment.status] || shipment.status || 'Hazırlık bekliyor') + '</strong></div>' + (shipment.carrier ? '<div><span>Firma</span><strong>' + escapeHtml(shipment.carrier) + '</strong></div>' : '') + (shipment.tracking_number ? '<div><span>Takip No</span><strong>' + escapeHtml(shipment.tracking_number) + '</strong></div>' : '') + (shipment.shipped_at ? '<div><span>Kargoya Verildi</span><strong>' + escapeHtml(formatDate(shipment.shipped_at, true)) + '</strong></div>' : '') + (shipment.delivered_at ? '<div><span>Teslim</span><strong>' + escapeHtml(formatDate(shipment.delivered_at, true)) + '</strong></div>' : '') + '</div>' + (shipment.tracking_url ? '<a class="btn btn-primary cs-detail-track" href="' + escapeHtml(shipment.tracking_url) + '" target="_blank" rel="noopener">Kargoyu Takip Et</a>' : '<p class="account-mini">Kargo takip linki oluştuğunda burada görünür.</p>');
  }
  function renderAddress(order) {
    var name = [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ');
    var city = [order.district, order.city, order.postal_code].filter(Boolean).join(' / ');
    return '<div class="cs-detail-card-head"><span>Teslimat</span><h2>Adres Bilgisi</h2></div><div class="cs-detail-address"><strong>' + escapeHtml(name || order.customer_email || 'Müşteri') + '</strong><p>' + escapeHtml(order.customer_phone || '') + '</p><p>' + escapeHtml(order.address_line || 'Adres bilgisi yok') + '</p><p>' + escapeHtml(city || '—') + '</p>' + (order.cargo_note ? '<p><b>Kargo Notu:</b> ' + escapeHtml(order.cargo_note) + '</p>' : '') + '</div>';
  }
  function render(order) {
    var title = $('#detailTitle');
    var sub = $('#detailSubtitle');
    var statusClass = order.status || order.fulfillment_status || '';
    if (title) title.innerHTML = 'Sipariş <span>' + escapeHtml(order.order_number || order.id) + '</span>';
    if (sub) sub.innerHTML = '<span class="cs-status-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabels[order.status] || order.status || 'İşleniyor') + '</span> <span>' + escapeHtml(formatDate(order.created_at, true)) + '</span>';
    $('#detailProgressCard').innerHTML = renderProgress(order);
    $('#detailItemsCard').innerHTML = renderItems(order);
    $('#detailTimelineCard').innerHTML = renderTimeline(order);
    $('#detailSummaryCard').innerHTML = renderSummary(order);
    $('#detailShippingCard').innerHTML = renderShipping(order);
    $('#detailAddressCard').innerHTML = renderAddress(order);
    showContent();
  }
  async function init() {
    try {
      if (!window.supabase?.createClient || !cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Supabase ayarları eksik.');
      var client = window.cosmoskinSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      var sessionResult = await client.auth.getSession();
      var session = sessionResult?.data?.session || null;
      if (!session?.access_token) {
        window.location.href = '/index.html?next=' + encodeURIComponent('/account/order-detail.html' + window.location.search);
        return;
      }
      await (window.COSMOSKIN_PRODUCTS_READY || Promise.resolve());
      var params = new URLSearchParams(window.location.search);
      var id = params.get('id') || params.get('order') || '';
      if (!id) throw new Error('Sipariş kimliği bulunamadı.');
      var res = await fetch(getApiBase() + '/get-orders?limit=50', { headers: { Authorization: 'Bearer ' + session.access_token } });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Sipariş alınamadı.');
      var order = (data.orders || []).find(function (item) { return String(item.id) === String(id) || String(item.order_number) === String(id); });
      if (!order) throw new Error('Bu sipariş hesabınızda bulunamadı.');
      render(order);
    } catch (error) {
      setState('Sipariş detayı açılamadı', error.message || 'Bilinmeyen hata', true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
