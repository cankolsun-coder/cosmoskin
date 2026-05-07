(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var state = {
    client: null,
    session: null,
    summary: null,
    returns: [],
    activeTab: 'overview',
    syncingFavorites: false,
    editingAddress: null,
    creatingReturnFor: null
  };

  var statusLabels = {
    pending_payment: 'Ödeme Bekleniyor',
    pending: 'Beklemede',
    paid: 'Ödeme Alındı',
    preparing: 'Hazırlanıyor',
    shipped: 'Kargoya Verildi',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal Edildi',
    payment_failed: 'Ödeme Başarısız',
    failed: 'Başarısız',
    refunded: 'İade Edildi',
    partially_refunded: 'Kısmi İade',
    requested: 'Talep Alındı',
    under_review: 'İncelemede',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
    received: 'Depoya Ulaştı'
  };

  var shipmentLabels = {
    not_started: 'Hazırlık Bekliyor',
    preparing: 'Hazırlanıyor',
    packed: 'Paketlendi',
    shipped: 'Kargoda',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal Edildi',
    returned: 'İade Sürecinde'
  };

  var moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') return window.COSMOSKIN_FORMAT_PRICE(value);
    return moneyFmt.format(Number(value || 0));
  }

  function formatDate(value, withTime) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: withTime ? '2-digit' : undefined,
        minute: withTime ? '2-digit' : undefined,
        timeZone: 'Europe/Istanbul'
      }).format(new Date(value));
    } catch (_) {
      return String(value).slice(0, 10);
    }
  }

  function plural(value, singular, pluralText) {
    return Number(value) === 1 ? singular : (pluralText || singular);
  }

  function showToast(message) {
    var toast = $('#accountToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2800);
  }

  function setLoading(isLoading) {
    var app = $('#accountApp');
    var loading = $('#accountLoading');
    var layout = $('#accountLayout');
    if (app) app.dataset.state = isLoading ? 'loading' : 'ready';
    if (loading) loading.hidden = !isLoading;
    if (layout) layout.hidden = isLoading;
  }

  function getApiBase() { return (cfg.apiBase || '/api').replace(/\/$/, ''); }

  async function apiFetch(path, options) {
    options = options || {};
    if (!state.session?.access_token) throw new Error('Oturum bulunamadı.');
    var headers = Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + state.session.access_token }, options.headers || {});
    var res = await fetch(getApiBase() + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || 'İşlem tamamlanamadı.');
    return data;
  }

  function getProductByHandle(handle) {
    var helpers = window.COSMOSKIN_PRODUCT_HELPERS || {};
    if (typeof helpers.getProductByHandle === 'function') return helpers.getProductByHandle(handle);
    var raw = String(handle || '').replace(/^.*\/products\//, '').replace(/\.html.*$/, '');
    return (window.COSMOSKIN_PRODUCTS || []).find(function (product) {
      return product.slug === raw || product.id === raw || product.url === handle;
    }) || null;
  }

  function normalizeProduct(product) {
    if (!product) return null;
    return {
      id: product.id || product.slug,
      product_id: product.id || product.slug,
      product_slug: product.slug || product.id,
      product_name: product.name || product.product_name || 'Ürün',
      brand: product.brand || 'COSMOSKIN',
      price: Number(product.price || 0),
      image: product.image || '',
      url: product.url || ('/products/' + (product.slug || product.id) + '.html'),
      rating: Number(product.rating || product.avgRating || product.avg_rating || 0),
      reviewCount: Number(product.reviewCount || product.review_count || product.reviewsCount || product.approved_count || 0),
      category: product.category || ''
    };
  }

  function normalizeFavorite(item) {
    var slug = item?.product_slug || item?.product_id || item?.slug || item?.id || item?.url || '';
    var product = getProductByHandle(slug) || getProductByHandle(item?.metadata?.url || item?.url || '');
    var resolvedSlug = product?.slug || item?.product_slug || item?.product_id || item?.slug || item?.id || '';
    if (!resolvedSlug) return null;
    var normalized = normalizeProduct(product) || {};
    return Object.assign(normalized, {
      id: item?.id || resolvedSlug,
      product_id: normalized.product_id || resolvedSlug,
      product_slug: resolvedSlug,
      product_name: normalized.product_name || item?.product_name || item?.name || 'Ürün',
      brand: normalized.brand || item?.brand || 'COSMOSKIN',
      price: Number(normalized.price || item?.price || 0),
      image: normalized.image || item?.image || '',
      url: normalized.url || item?.metadata?.url || item?.url || ('/products/' + resolvedSlug + '.html')
    });
  }

  function readLocalFavorites() {
    var keys = ['cosmoskin_favorites', 'cosmoskin_favorites_v1'];
    for (var i = 0; i < keys.length; i += 1) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        var values = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
        var normalized = values.map(normalizeFavorite).filter(Boolean);
        if (normalized.length) return normalized;
      } catch (_) {}
    }
    return [];
  }

  async function syncLocalFavoritesToRemote() {
    if (state.syncingFavorites) return false;
    var local = readLocalFavorites();
    if (!local.length) return false;
    var remote = state.summary?.favorites || [];
    var remoteSlugs = new Set(remote.map(function (item) { return item.product_slug; }));
    var missing = local.filter(function (item) { return item.product_slug && !remoteSlugs.has(item.product_slug); });
    if (!missing.length) return false;
    state.syncingFavorites = true;
    try {
      await Promise.all(missing.slice(0, 24).map(function (item) {
        return apiFetch('/account/favorites', { method: 'POST', body: item }).catch(function () { return null; });
      }));
      return true;
    } finally { state.syncingFavorites = false; }
  }

  function writeLocalFavorites(favorites) {
    var normalized = (favorites || []).map(normalizeFavorite).filter(Boolean).map(function (item) {
      return { id: item.product_slug, slug: item.product_slug, name: item.product_name, brand: item.brand, price: item.price, image: item.image, url: item.url };
    });
    localStorage.setItem('cosmoskin_favorites', JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: normalized } }));
  }

  function addProductToCart(item) {
    var fav = normalizeFavorite(item) || normalizeProduct(item);
    if (!fav || !fav.product_slug) return showToast('Ürün bilgisi bulunamadı.');
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); } catch (_) { cart = []; }
    if (!Array.isArray(cart)) cart = [];
    var existing = cart.find(function (entry) { return entry.id === fav.product_slug || entry.slug === fav.product_slug; });
    if (existing) existing.qty = Math.max(1, Number(existing.qty || 1)) + 1;
    else cart.push({ id: fav.product_slug, slug: fav.product_slug, name: fav.product_name, brand: fav.brand, price: Number(fav.price || 0), image: fav.image, url: fav.url, qty: 1 });
    localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: cart } }));
    showToast('Ürün sepetinize eklendi.');
  }

  function getDisplayName(user) {
    return user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'COSMOSKIN Üyesi';
  }

  function getFirstName(user) {
    return user?.first_name || String(getDisplayName(user)).split(/\s+/)[0] || '';
  }

  function initials(user) {
    var name = (user && (user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '))) || user?.email || 'CS';
    var letters = String(name).trim().split(/\s+/).map(function (part) { return part.charAt(0); }).join('').slice(0, 2);
    return letters.toLocaleUpperCase('tr-TR') || 'CS';
  }

  function setText(id, value) {
    var el = $('#' + id);
    if (el) el.textContent = value;
  }

  function getLoyalty() {
    var stats = state.summary?.stats || {};
    var tier = stats.tier || { label: 'Essential Üye', progress: 0, next: 'Select Üye' };
    var points = Number(stats.current_points ?? stats.points ?? stats.reward_points ?? stats.total_spent ?? 0);
    var nextThreshold = Number(stats.next_tier_threshold || (tier.next === 'Signature Üye' ? 15000 : tier.next === 'Select Üye' ? 6000 : Math.max(points, 1)));
    var progress = Number(tier.progress || (nextThreshold ? Math.round((points / nextThreshold) * 100) : 100));
    progress = Math.max(0, Math.min(100, progress));
    var remaining = Math.max(0, nextThreshold - points);
    return { label: tier.label || 'Essential Üye', next: tier.next || '', points: Math.round(points), threshold: Math.round(nextThreshold), remaining: Math.round(remaining), progress: progress };
  }

  function renderShell() {
    var data = state.summary || {};
    var user = data.user || {};
    var stats = data.stats || {};
    var name = getDisplayName(user);
    var first = getFirstName(user);
    var loyalty = getLoyalty();
    setText('accountGreeting', first ? ('Merhaba ' + first + ',') : 'Merhaba,');
    setText('accountName', name);
    setText('accountEmail', user.email || '—');
    setText('accountAvatar', initials(user));
    setText('accountMemberSince', user.created_at ? ('Üyelik: ' + formatDate(user.created_at)) : 'COSMOSKIN hesabı');
    setText('activeOrderChip', (stats.active_order_count || 0) + ' ' + plural(stats.active_order_count || 0, 'aktif sipariş'));
    var prefCount = (stats.favorites_count || 0) + (stats.addresses_count || 0) + ((user.skin_type || user.routine_goal) ? 1 : 0);
    setText('savedPrefsChip', prefCount + ' kayıtlı tercih');
    setText('heroTier', loyalty.label);
    setText('heroPoints', loyalty.threshold ? (loyalty.points.toLocaleString('tr-TR') + ' / ' + loyalty.threshold.toLocaleString('tr-TR') + ' puan') : 'Puan bilgisi hazırlanıyor');
    setText('heroRemaining', loyalty.next ? ('Kalan: ' + loyalty.remaining.toLocaleString('tr-TR') + ' puan') : 'En üst seviye');
    setText('heroTierHint', loyalty.next ? ('Bir sonraki seviye: ' + loyalty.next) : 'Tüm üyelik avantajları hesabınıza tanımlı.');
    var progress = $('#tierProgress');
    if (progress) progress.style.width = loyalty.progress + '%';
    setText('ordersBadge', String(stats.order_count || 0));
    setText('favoritesBadge', String(stats.favorites_count || 0));
    setText('addressesBadge', String(stats.addresses_count || 0));
    setText('returnsBadge', String((state.returns || []).length));
    setText('notificationsBadge', String(stats.unread_notifications || 0));
  }

  function iconSvg(name) {
    var map = {
      bag: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7L6 8Zm4 0a2 2 0 0 1 4 0"/></svg>',
      truck: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 7h11v8H3zM14 10h3l3 3v2h-6zM7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
      heart: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z"/></svg>',
      pin: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z"/><path d="M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"/></svg>',
      shield: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 20 7v6c0 4.5-3.3 7-8 8-4.7-1-8-3.5-8-8V7l8-4Z"/><path d="m8.8 12 2 2 4.6-5"/></svg>',
      drop: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/></svg>',
      bell: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 9a6 6 0 1 0-12 0c0 7-2 7-2 7h16s-2 0-2-7ZM10 20h4"/></svg>',
      card: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 10h18M7 15h4"/></svg>',
      return: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M5 12h10a5 5 0 1 1 0 10h-1"/></svg>',
      sparkle: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z"/></svg>'
    };
    return map[name] || map.sparkle;
  }

  function renderStats() {
    var stats = state.summary?.stats || {};
    var loyalty = getLoyalty();
    var cells = [
      { icon: 'bag', label: 'Toplam Sipariş', value: stats.order_count || 0, hint: 'Tüm zamanların toplamı' },
      { icon: 'truck', label: 'Aktif Sipariş', value: stats.active_order_count || 0, hint: 'Devam eden sipariş' },
      { icon: 'sparkle', label: 'Kazanılan Puan', value: loyalty.points.toLocaleString('tr-TR'), hint: 'Hesap geçmişine göre' },
      { icon: 'heart', label: 'Favoriler', value: stats.favorites_count || 0, hint: 'Kaydettiğiniz ürünler' },
      { icon: 'pin', label: 'Kayıtlı Adres', value: stats.addresses_count || 0, hint: 'Teslimat adresi' }
    ];
    var el = $('#statGrid');
    if (!el) return;
    el.innerHTML = cells.map(function (cell) {
      return '<article class="cs-stat"><span class="cs-stat-icon">' + iconSvg(cell.icon) + '</span><div><small>' + escapeHtml(cell.label) + '</small><strong>' + escapeHtml(cell.value) + '</strong><em>' + escapeHtml(cell.hint) + '</em></div></article>';
    }).join('');
  }

  function emptyState(title, body, cta, href, tab) {
    var attr = tab ? ' data-tab-link="' + escapeHtml(tab) + '"' : '';
    return '<div class="cs-empty"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(body) + '</p>' + (cta ? '<a class="cs-pill-btn" href="' + escapeHtml(href || '/allproducts.html') + '"' + attr + '>' + escapeHtml(cta) + '</a>' : '') + '</div>';
  }

  function orderItemCount(order) {
    return (order.order_items || []).reduce(function (sum, item) { return sum + (Number(item.quantity || 0) || 1); }, 0);
  }

  function getPrimaryShipment(order) {
    var shipments = Array.isArray(order?.shipments) ? order.shipments.slice() : [];
    if (order?.latest_shipment) shipments.unshift(order.latest_shipment);
    return shipments.filter(Boolean).sort(function (a, b) { return new Date(b.updated_at || b.created_at || b.shipped_at || 0) - new Date(a.updated_at || a.created_at || a.shipped_at || 0); })[0] || {};
  }

  function getShipmentLabel(shipment) { return shipmentLabels[shipment?.status] || shipment?.status || 'Hazırlık Bekliyor'; }
  function getPaymentLabel(status) { return statusLabels[status] || status || '—'; }
  function getFulfillmentLabel(status) { return shipmentLabels[status] || statusLabels[status] || status || 'İşleniyor'; }

  function getOrderProgress(order) {
    var shipment = getPrimaryShipment(order);
    var status = String(order?.status || '').toLowerCase();
    var payment = String(order?.payment_status || '').toLowerCase();
    var fulfillment = String(order?.fulfillment_status || '').toLowerCase();
    var ship = String(shipment?.status || '').toLowerCase();
    var cancelled = ['cancelled', 'payment_failed', 'failed', 'refunded', 'partially_refunded'].includes(status) || ['cancelled', 'returned'].includes(fulfillment) || ['cancelled', 'returned'].includes(ship);
    var current = 0;
    if (['paid', 'preparing', 'shipped', 'delivered'].includes(status) || payment === 'paid' || order?.paid_at) current = 1;
    if (['preparing', 'shipped', 'delivered'].includes(status) || ['preparing', 'packed'].includes(fulfillment)) current = 2;
    if (['shipped', 'delivered'].includes(status) || fulfillment === 'shipped' || ship === 'shipped' || shipment?.tracking_number || order?.fulfilled_at) current = 3;
    if (status === 'delivered' || fulfillment === 'delivered' || ship === 'delivered' || order?.delivered_at || shipment?.delivered_at) current = 4;
    return [
      { label: 'Sipariş Alındı', date: order?.created_at },
      { label: 'Hazırlanıyor', date: order?.paid_at, muted: current < 1 },
      { label: 'Kargoya Verildi', date: shipment?.shipped_at || order?.fulfilled_at, muted: current < 3 },
      { label: 'Teslim Edildi', date: shipment?.delivered_at || order?.delivered_at, muted: current < 4 }
    ].map(function (step, index) { return Object.assign({}, step, { done: !cancelled && index <= Math.min(current, 3), current: !cancelled && index === Math.min(current, 3), problem: cancelled && index === Math.min(current, 3) }); });
  }

  function renderOrderProgress(order, compact) {
    return '<div class="cs-order-progress ' + (compact ? 'is-compact' : '') + '">' + getOrderProgress(order).map(function (step) {
      return '<div class="cs-order-step ' + (step.done ? 'is-done ' : '') + (step.current ? 'is-current ' : '') + (step.problem ? 'is-problem ' : '') + (step.muted ? 'is-muted' : '') + '"><span></span><strong>' + escapeHtml(step.label) + '</strong>' + (!compact && step.date ? '<small>' + escapeHtml(formatDate(step.date, true)) + '</small>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function renderOrderItem(item, compact) {
    var product = getProductByHandle(item.product_slug || item.product_id || item.product_url || '') || {};
    var url = item.product_url || product.url || (item.product_slug ? '/products/' + item.product_slug + '.html' : '#');
    var image = item.image || product.image || '';
    var name = item.product_name || product.name || 'Ürün';
    var brand = item.brand || product.brand || '';
    var img = image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" loading="lazy">' : iconSvg('bag');
    return '<a class="cs-order-product" href="' + escapeHtml(url) + '"><span class="cs-order-thumb">' + img + '</span><span class="cs-order-product-copy"><span>' + escapeHtml(brand || 'COSMOSKIN') + '</span><strong>' + escapeHtml(name) + '</strong><small>Adet: ' + escapeHtml(item.quantity || 1) + '</small>' + (!compact && item.unit_price ? '<small>Birim: ' + escapeHtml(formatMoney(item.unit_price)) + '</small>' : '') + '</span><b class="cs-order-total">' + escapeHtml(formatMoney(item.line_total || item.price || 0)) + '</b></a>';
  }

  function canReturnOrder(order) {
    var status = String(order?.status || order?.fulfillment_status || '').toLowerCase();
    var deliveredDate = order?.delivered_at || getPrimaryShipment(order)?.delivered_at;
    if (!(status === 'delivered' || deliveredDate)) return false;
    if (!deliveredDate) return true;
    var days = (Date.now() - new Date(deliveredDate).getTime()) / 86400000;
    return days <= 14;
  }

  function renderOrderCard(order, compact) {
    var shipment = getPrimaryShipment(order);
    var items = (order.order_items || []).slice(0, compact ? 1 : 99).map(function (item) { return renderOrderItem(item, compact); }).join('');
    var detailHref = '/account/order-detail.html?id=' + encodeURIComponent(order.id || order.order_number || '');
    var statusClass = order.status || order.fulfillment_status || shipment.status || '';
    var statusText = statusLabels[order.status] || getFulfillmentLabel(order.fulfillment_status) || getShipmentLabel(shipment);
    var trackingHref = shipment.tracking_url || detailHref;
    var returnBtn = canReturnOrder(order) ? '<button class="cs-mini-btn" type="button" data-return-order="' + escapeHtml(order.id) + '">İade Talebi Oluştur</button>' : '';
    return '<article class="cs-order-card cs-order-card--rich ' + (compact ? 'is-compact' : '') + '">' +
      '<div class="cs-order-card-head"><div><small>' + (compact ? 'SON SİPARİŞ' : 'SİPARİŞ NO') + '</small><strong>' + escapeHtml(order.order_number || order.id) + '</strong><time>' + escapeHtml(formatDate(order.created_at, true)) + ' · ' + escapeHtml(orderItemCount(order)) + ' ürün</time></div><div class="cs-order-head-actions"><span class="cs-status-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusText) + '</span></div></div>' +
      renderOrderProgress(order, compact) +
      '<div class="cs-order-body"><div class="cs-order-items">' + (items || '<p class="account-mini">Ürün detayı bulunamadı.</p>') + '</div>' +
      '<aside class="cs-order-side"><div><span>Toplam</span><strong>' + escapeHtml(formatMoney(order.total_amount || 0)) + '</strong></div><div><span>Kargo</span><strong>' + escapeHtml(getShipmentLabel(shipment)) + '</strong></div>' + (shipment.carrier ? '<div><span>Firma</span><strong>' + escapeHtml(shipment.carrier) + '</strong></div>' : '') + (shipment.tracking_number ? '<div><span>Takip No</span><strong>' + escapeHtml(shipment.tracking_number) + '</strong></div>' : '') + '<div class="cs-order-actions"><a class="cs-mini-btn dark" href="' + escapeHtml(trackingHref) + '"' + (shipment.tracking_url ? ' target="_blank" rel="noopener"' : '') + '>Siparişi Takip Et</a><button class="cs-mini-btn" type="button" data-repeat-order="' + escapeHtml(order.id) + '">Tekrar Satın Al</button><button class="cs-mini-btn" type="button" data-invoice-order="' + escapeHtml(order.id) + '">Faturayı Görüntüle</button><a class="cs-mini-btn" href="' + escapeHtml(detailHref) + '">Detayı Gör</a>' + returnBtn + '</div></aside></div></article>';
  }

  function renderLatestOrder() {
    var slot = $('#latestOrderSlot');
    if (!slot) return;
    var order = (state.summary?.orders || [])[0];
    slot.innerHTML = order ? renderOrderCard(order, true) : emptyState('Henüz siparişiniz yok.', 'İlk seçkini oluşturduğunda sipariş takibi burada görünecek.', 'Seçkiyi Keşfet', '/allproducts.html');
  }

  function renderRoutineSlot() {
    var slot = $('#routineSlot');
    if (!slot) return;
    var user = state.summary?.user || {};
    var concerns = Array.isArray(user.skin_concerns) ? user.skin_concerns : [];
    if (!user.skin_type && !concerns.length && !user.routine_goal) {
      slot.innerHTML = emptyState('Cilt rutininizi oluşturun.', 'Cilt tipini ve hedeflerini kaydederek ürün önerilerini kişiselleştir.', 'Rutin Oluştur', '/account/profile.html?tab=skin', 'skin');
      return;
    }
    var products = getRecommendedProducts().slice(0, 3);
    slot.innerHTML = '<div class="cs-routine-summary"><dl><div><dt>Cilt Tipi:</dt><dd>' + escapeHtml(user.skin_type || 'Belirtilmedi') + '</dd></div><div><dt>Hedef:</dt><dd>' + escapeHtml(user.routine_goal || 'Belirtilmedi') + '</dd></div><div><dt>Odak:</dt><dd>' + escapeHtml(concerns.slice(0, 2).join(', ') || 'Nemsizlik') + '</dd></div><div><dt>Durum:</dt><dd>%75 tamamlandı</dd></div><div><dt>Eksik Adım:</dt><dd>SPF</dd></div></dl><div class="cs-routine-thumbs">' + products.map(function (p) { return '<a href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.product_name) + '" loading="lazy"></a>'; }).join('') + '</div><div class="cs-card-actions"><a class="cs-mini-btn dark" href="/collections/routine.html">Rutini Gör</a><button class="cs-mini-btn" type="button" data-add-routine-cart>Eksikleri Sepete Ekle</button></div></div>';
  }

  function renderSecurityOverview() {
    var slot = $('#securityOverviewSlot');
    if (!slot) return;
    var user = state.summary?.user || {};
    var comm = user.communication || {};
    var rows = [
      { ok: Boolean(user.email), text: user.email ? 'E-posta doğrulandı' : 'E-posta bilgisi bekleniyor' },
      { ok: Boolean(user.phone), text: user.phone ? 'Telefon kayıtlı' : 'Telefon eklenebilir' },
      { warn: true, text: 'Şifre güncelleme önerilir' },
      { ok: true, text: (comm.orderUpdates === false ? 'Sipariş bildirimleri kapalı' : 'KVKK ve iletişim tercihleri güncel') }
    ];
    slot.innerHTML = '<div class="cs-security-list">' + rows.map(function (row) { return '<span class="' + (row.ok ? 'is-ok' : row.warn ? 'is-warn' : '') + '">' + (row.ok ? '✓' : row.warn ? '!' : '•') + '</span><p>' + escapeHtml(row.text) + '</p>'; }).join('') + '</div><a class="cs-mini-btn full" href="/account/profile.html?tab=security" data-tab-link="security">Ayarları Yönet</a>';
  }

  function renderQuickAccess() {
    var slot = $('#quickAccessSlot');
    if (!slot) return;
    var stats = state.summary?.stats || {};
    var items = [
      { icon: 'pin', title: 'Kayıtlı Adreslerim', sub: (stats.addresses_count || 0) + ' adres kayıtlı', tab: 'addresses' },
      { icon: 'bell', title: 'Bildirim Tercihlerim', sub: 'E-posta & SMS', tab: 'notifications' },
      { icon: 'sparkle', title: 'Son Görüntülenenler', sub: 'Katalog geçmişi', href: '/allproducts.html' },
      { icon: 'return', title: 'İade Taleplerim', sub: (state.returns || []).length + ' açık talep', tab: 'returns' }
    ];
    slot.innerHTML = items.map(function (item) {
      var href = item.href || ('/account/profile.html?tab=' + item.tab);
      var attr = item.tab ? ' data-tab-link="' + escapeHtml(item.tab) + '"' : '';
      return '<a class="cs-quick-tile" href="' + escapeHtml(href) + '"' + attr + '>' + iconSvg(item.icon) + '<span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.sub) + '</small></span></a>';
    }).join('');
  }

  function getRecommendedProducts() {
    var user = state.summary?.user || {};
    var favorites = (state.summary?.favorites || []).map(normalizeFavorite).filter(Boolean);
    var favoriteSlugs = new Set(favorites.map(function (f) { return f.product_slug; }));
    var products = (window.COSMOSKIN_PRODUCTS || []).map(normalizeProduct).filter(Boolean).filter(function (p) { return p.product_slug && !favoriteSlugs.has(p.product_slug); });
    var concerns = Array.isArray(user.skin_concerns) ? user.skin_concerns.join(' ').toLocaleLowerCase('tr-TR') : '';
    var terms = (concerns + ' ' + String(user.routine_goal || '') + ' ' + String(user.skin_type || '')).toLocaleLowerCase('tr-TR');
    var scored = products.map(function (p) {
      var hay = [p.product_name, p.brand, p.category, (getProductByHandle(p.product_slug)?.keywords || []).join(' ')].join(' ').toLocaleLowerCase('tr-TR');
      var score = 1;
      if (/nem|hyaluronic|kuru|nemsizlik/.test(terms) && /hyaluronic|nem|dive|toner|cream/.test(hay)) score += 5;
      if (/bariyer|hassas|kızarıklık|hassasiyet/.test(terms) && /centella|ceramide|cica|bariyer|snail/.test(hay)) score += 5;
      if (/ışıltı|leke|ton/.test(terms) && /vitamin|niacinamide|glow|rice|arbutin/.test(hay)) score += 5;
      if (/spf|güneş|koru/.test(hay)) score += 1;
      return { product: p, score: score };
    }).sort(function (a, b) { return b.score - a.score || a.product.price - b.product.price; });
    return scored.map(function (x) { return x.product; }).slice(0, 6);
  }

  function renderStars(product) {
    var rating = Number(product.rating || 0);
    var count = Number(product.reviewCount || 0);
    if (!(rating > 0 && count > 0)) return '<span class="cs-rating-empty" aria-hidden="true"></span>';
    return '<span class="cs-rec-rating"><b>★</b> ' + escapeHtml(rating.toFixed(1)) + ' <em>(' + escapeHtml(count.toLocaleString('tr-TR')) + ')</em></span>';
  }

  function productCard(product) {
    var img = product.image ? '<img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.product_name) + '" loading="lazy">' : iconSvg('bag');
    return '<article class="cs-product-mini"><a class="cs-product-mini__media" href="' + escapeHtml(product.url) + '">' + img + '</a><div><small>' + escapeHtml(product.brand) + '</small><a href="' + escapeHtml(product.url) + '"><strong>' + escapeHtml(product.product_name) + '</strong></a><p>' + escapeHtml(product.category || 'Seçilmiş K-Beauty') + '</p>' + renderStars(product) + '<div class="cs-product-mini__bottom"><b>' + escapeHtml(formatMoney(product.price)) + '</b><button class="cs-mini-btn dark" type="button" data-add-product-cart="' + escapeHtml(product.product_slug) + '">Sepete Ekle</button><button class="cs-heart-btn" type="button" data-add-favorite="' + escapeHtml(product.product_slug) + '" aria-label="Favorilere ekle">♡</button></div></div></article>';
  }

  function renderRecommendations() {
    var slot = $('#recommendationSlot');
    if (!slot) return;
    var products = getRecommendedProducts().slice(0, 3);
    slot.innerHTML = products.length ? '<div class="cs-product-mini-row">' + products.map(productCard).join('') + '</div>' : emptyState('Öneri hazırlanıyor.', 'Ürün kataloğu yüklendiğinde kişisel öneriler burada görünür.', 'Ürünleri Keşfet', '/allproducts.html');
  }

  function renderOrders() {
    var list = $('#ordersList');
    if (!list) return;
    var orders = (state.summary?.orders || []).slice();
    var filter = $('#orderFilter')?.value || 'all';
    if (filter === 'active') orders = orders.filter(function (order) {
      var shipment = getPrimaryShipment(order);
      return ['paid', 'preparing', 'shipped'].includes(order.status) || ['preparing', 'packed', 'shipped'].includes(order.fulfillment_status) || ['preparing', 'packed', 'shipped'].includes(shipment.status);
    });
    if (filter === 'delivered') orders = orders.filter(function (order) { var shipment = getPrimaryShipment(order); return order.status === 'delivered' || order.fulfillment_status === 'delivered' || shipment.status === 'delivered'; });
    if (filter === 'problem') orders = orders.filter(function (order) { var shipment = getPrimaryShipment(order); return ['cancelled', 'payment_failed', 'failed', 'refunded', 'partially_refunded'].includes(order.status) || ['cancelled', 'returned'].includes(order.fulfillment_status) || ['cancelled', 'returned'].includes(shipment.status); });
    list.innerHTML = orders.length ? orders.map(function (order) { return renderOrderCard(order, false); }).join('') : emptyState('Henüz siparişiniz yok.', 'Sipariş verdiğinizde tüm geçmişiniz ve kargo takip bilgileri burada görünür.', 'Seçkiyi Keşfet', '/allproducts.html');
  }

  function renderFavorites() {
    var grid = $('#favoritesGrid');
    if (!grid) return;
    var favorites = (state.summary?.favorites || []).map(normalizeFavorite).filter(Boolean);
    var sort = $('#favoritesSort')?.value || 'newest';
    if (sort === 'price-asc') favorites.sort(function (a, b) { return Number(a.price || 0) - Number(b.price || 0); });
    if (sort === 'price-desc') favorites.sort(function (a, b) { return Number(b.price || 0) - Number(a.price || 0); });
    if (!favorites.length) {
      grid.innerHTML = emptyState('Henüz favori ürün eklemediniz.', 'Beğendiğin ürünleri kalp simgesiyle kaydet; buradan hızlıca sepete ekleyebilirsin.', 'Ürünleri Keşfet', '/allproducts.html');
      return;
    }
    grid.innerHTML = favorites.map(function (item) {
      var img = item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.product_name) + '" loading="lazy">' : iconSvg('heart');
      return '<article class="cs-fav-card"><a class="cs-fav-media" href="' + escapeHtml(item.url) + '">' + img + '</a><div class="cs-fav-body"><small>' + escapeHtml(item.brand) + '</small><a href="' + escapeHtml(item.url) + '"><h3>' + escapeHtml(item.product_name) + '</h3></a>' + renderStars(item) + '<strong class="cs-fav-price">' + escapeHtml(formatMoney(item.price)) + '</strong><div class="cs-fav-actions"><button class="cs-mini-btn dark" type="button" data-add-fav-cart="' + escapeHtml(item.product_slug) + '">Sepete Ekle</button><a class="cs-mini-btn" href="' + escapeHtml(item.url) + '">Ürünü Gör</a><button class="cs-mini-btn danger" type="button" data-remove-favorite="' + escapeHtml(item.product_slug) + '">Kaldır</button></div></div></article>';
    }).join('');
  }

  function normalizeAddress(row) {
    row = row || {};
    return { id: row.id, title: row.title || 'Adresim', first_name: row.recipient_first_name || row.first_name || '', last_name: row.recipient_last_name || row.last_name || '', phone: row.phone || '', city: row.city || '', district: row.district || '', postal_code: row.postal_code || '', neighborhood: row.metadata?.neighborhood || row.neighborhood || '', address_line: row.address_line || '', address_type: row.address_type || row.type || 'shipping', is_default: Boolean(row.is_default) };
  }

  function renderAddresses() {
    var grid = $('#addressesGrid');
    if (!grid) return;
    var addresses = (state.summary?.addresses || []).map(normalizeAddress);
    if (!addresses.length) { grid.innerHTML = '<div class="cs-empty"><strong>Henüz kayıtlı adresiniz yok.</strong><p>Teslimat ve fatura adreslerini kaydederek ödeme adımını hızlandırabilirsin.</p><button class="cs-pill-btn cs-pill-btn--dark" id="emptyAddAddress" type="button">ADRES EKLE</button></div>'; return; }
    grid.innerHTML = addresses.map(function (addr) {
      return '<article class="cs-address-card ' + (addr.is_default ? 'is-default' : '') + '"><span class="tag">' + (addr.is_default ? 'Varsayılan' : escapeHtml(addr.address_type === 'billing' ? 'Fatura' : addr.address_type === 'both' ? 'Teslimat + Fatura' : 'Teslimat')) + '</span><h3>' + escapeHtml(addr.title) + '</h3><p><strong>' + escapeHtml([addr.first_name, addr.last_name].filter(Boolean).join(' ')) + '</strong><br>' + escapeHtml(addr.phone) + '<br>' + escapeHtml(addr.address_line) + '<br>' + escapeHtml([addr.neighborhood, addr.district, addr.city, addr.postal_code].filter(Boolean).join(' / ')) + '</p><div class="cs-address-actions"><button class="cs-mini-btn" type="button" data-edit-address="' + escapeHtml(addr.id) + '">Düzenle</button>' + (!addr.is_default ? '<button class="cs-mini-btn" type="button" data-default-address="' + escapeHtml(addr.id) + '">Varsayılan Yap</button>' : '') + '<button class="cs-mini-btn danger" type="button" data-delete-address="' + escapeHtml(addr.id) + '">Sil</button></div></article>';
    }).join('');
  }

  function renderPayments() {
    var slot = $('#paymentsSlot');
    if (!slot) return;
    slot.innerHTML = '<div class="cs-truthful-state">' + iconSvg('card') + '<div><strong>Kayıtlı ödeme yöntemi bulunmuyor.</strong><p>Ödeme bilgileriniz güvenli ödeme sağlayıcısı üzerinden işlenir. COSMOSKIN kart numaranızı hesap sayfanızda saklamaz veya göstermez.</p><a class="cs-pill-btn cs-pill-btn--dark" href="/checkout.html">Ödeme Sayfasına Git</a></div></div>';
  }

  function renderReturns() {
    var slot = $('#returnsSlot');
    if (!slot) return;
    var returns = state.returns || [];
    var eligible = (state.summary?.orders || []).filter(canReturnOrder);
    var listHtml = returns.length ? returns.map(function (r) {
      return '<article class="cs-return-card"><span class="cs-status-pill ' + escapeHtml(r.status || 'requested') + '">' + escapeHtml(statusLabels[r.status] || r.status || 'Talep Alındı') + '</span><h3>' + escapeHtml(r.reason || 'İade talebi') + '</h3><p>' + escapeHtml(r.note || 'Talebiniz inceleniyor.') + '</p><small>' + escapeHtml(formatDate(r.created_at, true)) + '</small></article>';
    }).join('') : emptyState('Henüz iade talebiniz yok.', 'İade veya değişim talepleriniz burada takip edilir.', null);
    var eligibleHtml = eligible.length ? eligible.map(function (order) {
      return '<article class="cs-return-eligible"><div><small>UYGUN SİPARİŞ</small><strong>' + escapeHtml(order.order_number || order.id) + '</strong><span>' + escapeHtml(formatDate(order.delivered_at || getPrimaryShipment(order).delivered_at || order.created_at)) + ' · ' + escapeHtml(formatMoney(order.total_amount || 0)) + '</span></div><button class="cs-mini-btn dark" type="button" data-return-order="' + escapeHtml(order.id) + '">İade Talebi Oluştur</button></article>';
    }).join('') : '<div class="cs-empty compact"><strong>İade talebi oluşturulabilecek sipariş yok.</strong><p>Teslim edilen ve iade süresi içindeki siparişler burada görünür.</p></div>';
    slot.innerHTML = '<div><h3 class="cs-subtitle">Mevcut Talepler</h3>' + listHtml + '</div><div><h3 class="cs-subtitle">İade Uygunluğu</h3>' + eligibleHtml + '</div>';
  }

  function renderNotifications() {
    var list = $('#notificationsList');
    if (!list) return;
    var notifications = state.summary?.notifications || [];
    if (!notifications.length) { list.innerHTML = emptyState('Bildirim yok.', 'Sipariş ve kargo güncellemeleri burada görünür.', null); return; }
    list.innerHTML = notifications.map(function (n) {
      return '<article class="cs-notification ' + (!n.is_read ? 'is-unread' : '') + '"><div><small>' + escapeHtml(n.type || 'system') + '</small><strong>' + escapeHtml(n.title || 'Bildirim') + '</strong><p>' + escapeHtml(n.body || '') + '</p><time>' + escapeHtml(formatDate(n.created_at, true)) + '</time></div>' + (!n.is_read && /^[0-9a-f-]{16,}$/i.test(String(n.id || '')) ? '<button class="cs-mini-btn" type="button" data-read-notification="' + escapeHtml(n.id) + '">Okundu</button>' : '') + '</article>';
    }).join('');
  }

  function renderForms() {
    var user = state.summary?.user || {};
    var profileForm = $('#profileForm');
    if (profileForm) {
      profileForm.elements.first_name.value = user.first_name || '';
      profileForm.elements.last_name.value = user.last_name || '';
      profileForm.elements.email.value = user.email || '';
      profileForm.elements.phone.value = user.phone || '';
    }
    var skinForm = $('#skinForm');
    if (skinForm) {
      skinForm.elements.skin_type.value = user.skin_type || '';
      if (skinForm.elements.skin_sensitivity) skinForm.elements.skin_sensitivity.value = user.skin_sensitivity || '';
      skinForm.elements.routine_goal.value = user.routine_goal || '';
      var concerns = new Set(Array.isArray(user.skin_concerns) ? user.skin_concerns : []);
      $$('input[name="skin_concerns"]', skinForm).forEach(function (input) { input.checked = concerns.has(input.value); });
    }
    var prefForm = $('#notificationPrefsForm');
    if (prefForm) {
      var comm = user.communication || {};
      prefForm.elements.orderUpdates.checked = comm.orderUpdates !== false;
      prefForm.elements.campaignEmails.checked = Boolean(comm.campaignEmails || comm.marketingEmails);
      prefForm.elements.smsNotifications.checked = Boolean(comm.smsNotifications || comm.sms);
      prefForm.elements.restockAlerts.checked = Boolean(comm.restockAlerts || comm.restockEmails);
      prefForm.elements.routineReminders.checked = Boolean((user.routine_reminders || {}).routineReminders || comm.routineReminders);
    }
  }

  function renderRoutinePlan() {
    var slot = $('#routinePlanSlot');
    if (!slot) return;
    var products = getRecommendedProducts().slice(0, 4);
    slot.innerHTML = '<article class="cs-card cs-card-full"><div class="cs-card-head"><span>ÖNERİLEN RUTİN AKIŞI</span><a href="/collections/routine.html">Rutinleri Gör</a></div><div class="cs-routine-plan-grid">' + ['Temizle', 'Nemlendir', 'Hedef Bakım', 'Koru'].map(function (step, index) {
      var p = products[index];
      return '<div class="cs-routine-step"><small>' + escapeHtml(step) + '</small>' + (p ? '<a href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.product_name) + '" loading="lazy"><strong>' + escapeHtml(p.product_name) + '</strong><span>' + escapeHtml(p.brand) + '</span></a>' : '<p>Ürün seçimi hazırlanıyor.</p>') + '</div>';
    }).join('') + '</div></article>';
  }

  function renderLoyaltyDetail() {
    var slot = $('#loyaltyDetailSlot');
    if (!slot) return;
    var loyalty = getLoyalty();
    var tiers = [
      { title: 'Essential Üye', body: 'Hesap, favori, adres ve rutin kayıtları.' },
      { title: 'Select Üye', body: 'Seçili kampanyalara erken erişim ve rutin önerileri.' },
      { title: 'Signature Üye', body: 'Öncelikli destek ve kişiselleştirilmiş bakım avantajları.' }
    ];
    slot.innerHTML = '<article class="cs-loyalty-summary"><strong>' + escapeHtml(loyalty.label) + '</strong><p>' + (loyalty.next ? escapeHtml(loyalty.next + ' için ' + loyalty.remaining.toLocaleString('tr-TR') + ' puan kaldı.') : 'En üst seviyedesiniz.') + '</p><div class="cs-loyalty-progress"><span style="width:' + escapeHtml(loyalty.progress) + '%"></span></div></article><div class="cs-tier-list">' + tiers.map(function (tier) { return '<article class="cs-tier-card ' + (tier.title === loyalty.label ? 'is-active' : '') + '"><h3>' + escapeHtml(tier.title) + '</h3><p>' + escapeHtml(tier.body) + '</p></article>'; }).join('') + '</div>';
  }

  function renderAll() {
    renderShell(); renderStats(); renderLatestOrder(); renderRoutineSlot(); renderSecurityOverview(); renderQuickAccess(); renderRecommendations(); renderOrders(); renderFavorites(); renderAddresses(); renderPayments(); renderReturns(); renderNotifications(); renderForms(); renderRoutinePlan(); renderLoyaltyDetail(); writeLocalFavorites(state.summary?.favorites || []);
  }

  function switchTab(tab, push) {
    if (!tab || !$('[data-panel="' + tab + '"]')) tab = 'overview';
    state.activeTab = tab;
    $$('#accountNav [data-tab]').forEach(function (link) { link.classList.toggle('is-active', link.dataset.tab === tab); });
    $$('.cs-panel').forEach(function (panel) { panel.classList.toggle('is-active', panel.dataset.panel === tab); });
    var url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    if (push) history.pushState({ tab: tab }, '', url.pathname + url.search);
    else history.replaceState({ tab: tab }, '', url.pathname + url.search);
    var heading = $('[data-panel="' + tab + '"] h2');
    if (heading) heading.setAttribute('tabindex', '-1');
  }

  async function loadSummary(options) {
    options = options || {};
    var data = await apiFetch('/account/summary');
    state.summary = data;
    if (!options.skipFavoriteSync) {
      var changed = await syncLocalFavoritesToRemote();
      if (changed) state.summary = await apiFetch('/account/summary');
    }
    try {
      var returnsData = await apiFetch('/returns');
      state.returns = returnsData.returns || [];
    } catch (_) { state.returns = []; }
    renderAll();
  }

  async function saveProfile() {
    var form = $('#profileForm');
    if (!form) return;
    var first = form.elements.first_name.value.trim();
    var last = form.elements.last_name.value.trim();
    var phone = form.elements.phone.value.trim();
    var current = state.summary?.user || {};
    var payload = { first_name: first, last_name: last, full_name: [first, last].filter(Boolean).join(' '), name: [first, last].filter(Boolean).join(' '), phone: phone, skin_type: current.skin_type || '', skin_sensitivity: current.skin_sensitivity || '', skin_concerns: current.skin_concerns || [], routine_goal: current.routine_goal || '', comm_prefs: current.communication || {}, routine_reminders: current.routine_reminders || {} };
    var res = await state.client.auth.updateUser({ data: payload });
    if (res.error) throw res.error;
    await loadSummary({ skipFavoriteSync: true });
    showToast('Hesap bilgileriniz güncellendi.');
  }

  async function saveSkin() {
    var form = $('#skinForm');
    if (!form) return;
    var current = state.summary?.user || {};
    var payload = { first_name: current.first_name || '', last_name: current.last_name || '', full_name: current.full_name || '', phone: current.phone || '', skin_type: form.elements.skin_type.value, skin_sensitivity: form.elements.skin_sensitivity?.value || '', routine_goal: form.elements.routine_goal.value, skin_concerns: $$('input[name="skin_concerns"]:checked', form).map(function (input) { return input.value; }), comm_prefs: current.communication || {}, routine_reminders: current.routine_reminders || {} };
    var res = await state.client.auth.updateUser({ data: payload });
    if (res.error) throw res.error;
    await loadSummary({ skipFavoriteSync: true });
    showToast('Cilt profiliniz güncellendi.');
  }

  async function saveNotificationPreferences() {
    var form = $('#notificationPrefsForm');
    if (!form) return;
    var current = state.summary?.user || {};
    var comm = {
      orderUpdates: Boolean(form.elements.orderUpdates.checked),
      campaignEmails: Boolean(form.elements.campaignEmails.checked),
      smsNotifications: Boolean(form.elements.smsNotifications.checked),
      restockAlerts: Boolean(form.elements.restockAlerts.checked),
      routineReminders: Boolean(form.elements.routineReminders.checked)
    };
    var payload = { first_name: current.first_name || '', last_name: current.last_name || '', full_name: current.full_name || '', phone: current.phone || '', skin_type: current.skin_type || '', skin_sensitivity: current.skin_sensitivity || '', skin_concerns: current.skin_concerns || [], routine_goal: current.routine_goal || '', comm_prefs: comm, routine_reminders: Object.assign({}, current.routine_reminders || {}, { routineReminders: comm.routineReminders }) };
    var res = await state.client.auth.updateUser({ data: payload });
    if (res.error) throw res.error;
    await loadSummary({ skipFavoriteSync: true });
    showToast('Bildirim tercihleriniz kaydedildi.');
  }

  function formatPhone(value) { return String(value || '').replace(/\D/g, '').replace(/^(90)?(5\d{2})(\d{3})(\d{2})(\d{2})$/, '0$2 $3 $4 $5'); }

  function openAddressModal(address) {
    var modal = $('#addressModal'); var form = $('#addressForm'); var title = $('#addressModalTitle');
    state.editingAddress = address || null;
    if (!modal || !form) return;
    form.reset();
    form.elements.id.value = address?.id || '';
    form.elements.title.value = address?.title || '';
    form.elements.address_type.value = address?.address_type || 'shipping';
    form.elements.first_name.value = address?.first_name || '';
    form.elements.last_name.value = address?.last_name || '';
    form.elements.phone.value = address?.phone || '';
    form.elements.city.value = address?.city || '';
    form.elements.district.value = address?.district || '';
    if (form.elements.neighborhood) form.elements.neighborhood.value = address?.neighborhood || '';
    form.elements.postal_code.value = address?.postal_code || '';
    form.elements.address_line.value = address?.address_line || '';
    form.elements.is_default.checked = Boolean(address?.is_default);
    if (title) title.textContent = address ? 'Adresi Düzenle' : 'Yeni Adres';
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) { var modal = $(id); if (modal) { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); } }

  async function saveAddress(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var id = form.elements.id.value.trim();
    var phone = formatPhone(form.elements.phone.value.trim());
    var payload = { id: id || undefined, title: form.elements.title.value.trim(), address_type: form.elements.address_type.value, first_name: form.elements.first_name.value.trim(), last_name: form.elements.last_name.value.trim(), phone: phone, city: form.elements.city.value.trim(), district: form.elements.district.value.trim(), postal_code: form.elements.postal_code.value.trim(), address_line: form.elements.address_line.value.trim(), is_default: Boolean(form.elements.is_default.checked), metadata: { neighborhood: form.elements.neighborhood?.value?.trim() || '' } };
    await apiFetch('/account/addresses', { method: id ? 'PATCH' : 'POST', body: payload });
    closeModal('#addressModal'); await loadSummary({ skipFavoriteSync: true }); showToast(id ? 'Adres güncellendi.' : 'Adres kaydedildi.');
  }

  async function deleteAddress(id) { if (!id) return; await apiFetch('/account/addresses?id=' + encodeURIComponent(id), { method: 'DELETE' }); await loadSummary({ skipFavoriteSync: true }); showToast('Adres silindi.'); }
  async function setDefaultAddress(id) { var address = (state.summary?.addresses || []).map(normalizeAddress).find(function (item) { return item.id === id; }); if (!address) return; await apiFetch('/account/addresses', { method: 'PATCH', body: Object.assign({}, address, { is_default: true }) }); await loadSummary({ skipFavoriteSync: true }); showToast('Varsayılan adres güncellendi.'); }
  async function removeFavorite(slug) { await apiFetch('/account/favorites?product_slug=' + encodeURIComponent(slug), { method: 'DELETE' }); await loadSummary({ skipFavoriteSync: true }); showToast('Ürün favorilerden kaldırıldı.'); }

  async function addFavorite(slug) {
    var product = normalizeProduct(getProductByHandle(slug));
    if (!product) return showToast('Ürün bilgisi bulunamadı.');
    await apiFetch('/account/favorites', { method: 'POST', body: product });
    await loadSummary({ skipFavoriteSync: true });
    showToast('Ürün favorilerinize eklendi.');
  }

  function repeatOrder(orderId) { var order = (state.summary?.orders || []).find(function (item) { return item.id === orderId; }); if (!order) return; (order.order_items || []).forEach(function (item) { addProductToCart(item); }); showToast('Siparişteki ürünler sepete eklendi.'); }

  async function requestInvoice(orderId) {
    await apiFetch('/invoices', { method: 'POST', body: { accessToken: state.session.access_token, order_id: orderId } });
    showToast('Fatura talebiniz sıraya alındı.');
  }

  function openReturnModal(orderId) {
    var order = (state.summary?.orders || []).find(function (item) { return item.id === orderId; });
    if (!order) return;
    if (!canReturnOrder(order)) return showToast('Bu sipariş için iade süresi dolmuş olabilir.');
    var modal = $('#returnModal'); var form = $('#returnForm');
    if (!modal || !form) return;
    state.creatingReturnFor = order;
    form.reset(); form.elements.order_id.value = order.id; form.elements.order_number.value = order.order_number || order.id;
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
  }

  async function submitReturn(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var orderId = form.elements.order_id.value;
    var order = (state.summary?.orders || []).find(function (item) { return item.id === orderId; });
    if (!order || !canReturnOrder(order)) return showToast('Bu sipariş için iade süresi dolmuş olabilir.');
    await apiFetch('/returns', { method: 'POST', body: { accessToken: state.session.access_token, order_id: orderId, reason: form.elements.reason.value, note: form.elements.note.value, items: (order.order_items || []).map(function (item) { return { product_slug: item.product_slug, quantity: item.quantity || 1 }; }) } });
    closeModal('#returnModal'); await loadSummary({ skipFavoriteSync: true }); showToast('İade talebi oluşturuldu.');
  }

  function passwordIsValid(password) { return password.length >= 8 && /[A-ZÇĞİÖŞÜ]/.test(password) && /[a-zçğıöşü]/.test(password) && /\d/.test(password); }
  async function updatePassword(event) { event.preventDefault(); var form = event.currentTarget; var password = form.elements.password.value; var confirm = form.elements.password_confirm.value; if (password !== confirm) return showToast('Şifreler eşleşmiyor.'); if (!passwordIsValid(password)) return showToast('Şifre en az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam içermeli.'); var res = await state.client.auth.updateUser({ password: password }); if (res.error) throw res.error; form.reset(); showToast('Şifreniz güncellendi.'); }
  async function markNotification(id) { await apiFetch('/account/notifications', { method: 'PATCH', body: { id: id, is_read: true } }); await loadSummary({ skipFavoriteSync: true }); }
  async function markAllNotifications() { await apiFetch('/account/notifications', { method: 'PATCH', body: { mark_all_read: true } }).catch(function () { return null; }); if (state.summary?.notifications) { state.summary.notifications = state.summary.notifications.map(function (n) { return Object.assign({}, n, { is_read: true }); }); if (state.summary.stats) state.summary.stats.unread_notifications = 0; renderShell(); renderNotifications(); } showToast('Bildirimler okundu olarak işaretlendi.'); }

  function bindEvents() {
    $('#accountNav')?.addEventListener('click', function (event) { var link = event.target.closest('[data-tab]'); if (link) { event.preventDefault(); switchTab(link.dataset.tab, true); } });
    document.addEventListener('click', function (event) {
      var tabLink = event.target.closest('[data-tab-link]'); if (tabLink) { event.preventDefault(); switchTab(tabLink.dataset.tabLink, true); }
      var emptyAddress = event.target.closest('#emptyAddAddress'); if (emptyAddress) openAddressModal(null);
      var editAddress = event.target.closest('[data-edit-address]'); if (editAddress) { var address = (state.summary?.addresses || []).map(normalizeAddress).find(function (item) { return item.id === editAddress.dataset.editAddress; }); openAddressModal(address); }
      var defaultAddress = event.target.closest('[data-default-address]'); if (defaultAddress) setDefaultAddress(defaultAddress.dataset.defaultAddress).catch(handleError);
      var deleteAddr = event.target.closest('[data-delete-address]'); if (deleteAddr) deleteAddress(deleteAddr.dataset.deleteAddress).catch(handleError);
      var removeFav = event.target.closest('[data-remove-favorite]'); if (removeFav) removeFavorite(removeFav.dataset.removeFavorite).catch(handleError);
      var addFav = event.target.closest('[data-add-fav-cart]'); if (addFav) { var fav = (state.summary?.favorites || []).find(function (item) { return item.product_slug === addFav.dataset.addFavCart; }); addProductToCart(fav); }
      var addProduct = event.target.closest('[data-add-product-cart]'); if (addProduct) addProductToCart(getProductByHandle(addProduct.dataset.addProductCart));
      var addFavoriteBtn = event.target.closest('[data-add-favorite]'); if (addFavoriteBtn) addFavorite(addFavoriteBtn.dataset.addFavorite).catch(handleError);
      var repeat = event.target.closest('[data-repeat-order]'); if (repeat) repeatOrder(repeat.dataset.repeatOrder);
      var invoice = event.target.closest('[data-invoice-order]'); if (invoice) requestInvoice(invoice.dataset.invoiceOrder).catch(handleError);
      var returnOrder = event.target.closest('[data-return-order]'); if (returnOrder) openReturnModal(returnOrder.dataset.returnOrder);
      var addRoutine = event.target.closest('[data-add-routine-cart]'); if (addRoutine) { getRecommendedProducts().slice(0, 2).forEach(addProductToCart); }
      var read = event.target.closest('[data-read-notification]'); if (read) markNotification(read.dataset.readNotification).catch(handleError);
    });
    $('#orderFilter')?.addEventListener('change', renderOrders);
    $('#favoritesSort')?.addEventListener('change', renderFavorites);
    $('#addAddressBtn')?.addEventListener('click', function () { openAddressModal(null); });
    $('#closeAddressModal')?.addEventListener('click', function () { closeModal('#addressModal'); });
    $('#cancelAddressBtn')?.addEventListener('click', function () { closeModal('#addressModal'); });
    $('#addressModal')?.addEventListener('click', function (event) { if (event.target.id === 'addressModal') closeModal('#addressModal'); });
    $('#addressForm')?.addEventListener('submit', function (event) { saveAddress(event).catch(handleError); });
    $('#closeReturnModal')?.addEventListener('click', function () { closeModal('#returnModal'); });
    $('#cancelReturnBtn')?.addEventListener('click', function () { closeModal('#returnModal'); });
    $('#returnModal')?.addEventListener('click', function (event) { if (event.target.id === 'returnModal') closeModal('#returnModal'); });
    $('#returnForm')?.addEventListener('submit', function (event) { submitReturn(event).catch(handleError); });
    $('#saveProfileBtn')?.addEventListener('click', function () { saveProfile().catch(handleError); });
    $('#saveSkinBtn')?.addEventListener('click', function () { saveSkin().catch(handleError); });
    $('#saveNotificationsBtn')?.addEventListener('click', function () { saveNotificationPreferences().catch(handleError); });
    $('#passwordForm')?.addEventListener('submit', function (event) { updatePassword(event).catch(handleError); });
    $('#markAllNotificationsBtn')?.addEventListener('click', function () { markAllNotifications().catch(handleError); });
    function logout() { return state.client.auth.signOut().finally(function () { window.location.href = '/index.html'; }); }
    $('#logoutBtn')?.addEventListener('click', logout);
    $('#logoutInlineBtn')?.addEventListener('click', logout);
    window.addEventListener('popstate', function () { var url = new URL(window.location.href); switchTab(url.searchParams.get('tab') || 'overview', false); });
  }

  function handleError(error) { console.error(error); showToast(error?.message || 'İşlem tamamlanamadı.'); }

  async function init() {
    try {
      if (!window.supabase?.createClient || !cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Supabase ayarları eksik.');
      state.client = window.cosmoskinSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      var sessionResult = await state.client.auth.getSession();
      state.session = sessionResult?.data?.session || null;
      if (!state.session?.access_token) { if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) { setLoading(false); return; } window.location.href = '/index.html?next=' + encodeURIComponent('/account/profile.html' + window.location.search); return; }
      var url = new URL(window.location.href);
      state.activeTab = url.searchParams.get('tab') || (window.location.hash || '').replace('#', '') || 'overview';
      bindEvents();
      await (window.COSMOSKIN_PRODUCTS_READY || Promise.resolve());
      await loadSummary();
      switchTab(state.activeTab, false);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      var layout = $('#accountLayout'); if (layout) layout.hidden = true;
      var loading = $('#accountLoading');
      if (loading) loading.hidden = false;
      if (loading) loading.innerHTML = '<div class="cs-loading-card is-error"><strong>Bilgiler şu anda yüklenemedi.</strong><p>' + escapeHtml(error.message || 'Bilinmeyen hata') + '</p><button class="cs-pill-btn cs-pill-btn--dark" onclick="window.location.reload()" type="button">TEKRAR DENE</button></div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
