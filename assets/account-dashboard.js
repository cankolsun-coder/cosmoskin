(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var state = {
    client: null,
    session: null,
    summary: null,
    activeTab: 'overview',
    editingAddress: null,
    syncingFavorites: false
  };

  var statusLabels = {
    pending_payment: 'Ödeme Bekleniyor',
    paid: 'Ödeme Alındı',
    preparing: 'Hazırlanıyor',
    shipped: 'Kargoya Verildi',
    delivered: 'Teslim Edildi',
    cancelled: 'İptal Edildi',
    payment_failed: 'Ödeme Başarısız',
    refunded: 'İade Edildi',
    partially_refunded: 'Kısmi İade'
  };

  var shipmentLabels = {
    not_started: 'Hazırlık bekliyor',
    preparing: 'Hazırlanıyor',
    packed: 'Paketlendi',
    shipped: 'Kargoda',
    delivered: 'Teslim edildi',
    cancelled: 'İptal edildi',
    returned: 'İade sürecinde'
  };

  var moneyFmt = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0
  });

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
        dateStyle: 'medium',
        timeStyle: withTime ? 'short' : undefined,
        timeZone: 'Europe/Istanbul'
      }).format(new Date(value));
    } catch (_) {
      return String(value).slice(0, 10);
    }
  }

  function initials(user) {
    var name = (user && (user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '))) || user?.email || 'CS';
    var letters = String(name).trim().split(/\s+/).map(function (part) { return part.charAt(0); }).join('').slice(0, 2);
    return letters.toLocaleUpperCase('tr-TR') || 'CS';
  }

  function showToast(message) {
    var toast = $('#accountToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
  }

  function setLoading(isLoading) {
    var app = $('#accountApp');
    var loading = $('#accountLoading');
    var layout = $('#accountLayout');
    if (app) app.dataset.state = isLoading ? 'loading' : 'ready';
    if (loading) loading.hidden = !isLoading;
    if (layout) layout.hidden = isLoading;
  }

  function getApiBase() {
    return (cfg.apiBase || '/api').replace(/\/$/, '');
  }

  async function apiFetch(path, options) {
    options = options || {};
    if (!state.session?.access_token) throw new Error('Oturum bulunamadı.');
    var headers = Object.assign({
      'content-type': 'application/json',
      authorization: 'Bearer ' + state.session.access_token
    }, options.headers || {});
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

  function normalizeFavorite(item) {
    var slug = item?.product_slug || item?.product_id || item?.slug || item?.id || item?.url || '';
    var product = getProductByHandle(slug) || getProductByHandle(item?.metadata?.url || '');
    var resolvedSlug = product?.slug || item?.product_slug || item?.product_id || item?.slug || item?.id || '';
    if (!resolvedSlug) return null;
    return {
      id: item?.id || resolvedSlug,
      product_id: product?.id || resolvedSlug,
      product_slug: resolvedSlug,
      product_name: product?.name || item?.product_name || item?.name || 'Ürün',
      brand: product?.brand || item?.brand || 'COSMOSKIN',
      price: Number(product?.price || item?.price || 0),
      image: product?.image || item?.image || '',
      url: product?.url || item?.metadata?.url || item?.url || ('/products/' + resolvedSlug + '.html')
    };
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
        return apiFetch('/account/favorites', {
          method: 'POST',
          body: {
            product_id: item.product_id,
            product_slug: item.product_slug,
            product_name: item.product_name,
            brand: item.brand,
            image: item.image,
            price: item.price,
            url: item.url,
            source: 'local-storage-migration'
          }
        }).catch(function () { return null; });
      }));
      return true;
    } finally {
      state.syncingFavorites = false;
    }
  }

  function writeLocalFavorites(favorites) {
    var normalized = (favorites || []).map(normalizeFavorite).filter(Boolean).map(function (item) {
      return {
        id: item.product_slug,
        slug: item.product_slug,
        name: item.product_name,
        brand: item.brand,
        price: item.price,
        image: item.image,
        url: item.url
      };
    });
    localStorage.setItem('cosmoskin_favorites', JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: normalized } }));
  }

  function addProductToCart(item) {
    var fav = normalizeFavorite(item);
    if (!fav) return showToast('Ürün bilgisi bulunamadı.');
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); } catch (_) { cart = []; }
    if (!Array.isArray(cart)) cart = [];
    var existing = cart.find(function (entry) { return entry.id === fav.product_slug || entry.slug === fav.product_slug; });
    if (existing) existing.qty = Math.max(1, Number(existing.qty || 1)) + 1;
    else cart.push({
      id: fav.product_slug,
      slug: fav.product_slug,
      name: fav.product_name,
      brand: fav.brand,
      price: Number(fav.price || 0),
      image: fav.image,
      url: fav.url,
      qty: 1
    });
    localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: cart } }));
    showToast('Ürün sepetinize eklendi.');
  }

  function getDisplayName(user) {
    return user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'COSMOSKIN Üyesi';
  }

  function setText(id, value) {
    var el = $('#' + id);
    if (el) el.textContent = value;
  }

  function renderShell() {
    var data = state.summary || {};
    var user = data.user || {};
    var stats = data.stats || {};
    var name = getDisplayName(user);
    setText('accountName', name);
    setText('accountEmail', user.email || '—');
    setText('accountAvatar', initials(user));
    setText('accountMemberSince', user.created_at ? ('Üyelik: ' + formatDate(user.created_at)) : 'COSMOSKIN hesabı');
    setText('heroTier', stats.tier?.label || 'Essential Üye');
    setText('heroTierHint', stats.tier?.next ? (stats.tier.next + ' seviyesine ilerliyorsunuz.') : 'En üst üyelik seviyesindesiniz.');
    var progress = $('#tierProgress');
    if (progress) progress.style.width = Math.max(0, Math.min(100, Number(stats.tier?.progress || 0))) + '%';
    setText('ordersBadge', String(stats.order_count || 0));
    setText('favoritesBadge', String(stats.favorites_count || 0));
    setText('addressesBadge', String(stats.addresses_count || 0));
    setText('notificationsBadge', String(stats.unread_notifications || 0));
  }

  function renderStats() {
    var stats = state.summary?.stats || {};
    var cells = [
      { label: 'Toplam Sipariş', value: stats.order_count || 0, hint: 'Hesabına bağlı sipariş sayısı' },
      { label: 'Aktif Sipariş', value: stats.active_order_count || 0, hint: 'Hazırlanan veya kargodaki sipariş' },
      { label: 'Toplam Harcama', value: formatMoney(stats.total_spent || 0), hint: 'Ödemesi alınmış sipariş toplamı' },
      { label: 'Favori Ürün', value: stats.favorites_count || 0, hint: 'Kayıtlı alışveriş listen' }
    ];
    var el = $('#statGrid');
    if (!el) return;
    el.innerHTML = cells.map(function (cell) {
      return '<article class="cs-stat"><small>' + escapeHtml(cell.label) + '</small><strong>' + escapeHtml(cell.value) + '</strong><span>' + escapeHtml(cell.hint) + '</span></article>';
    }).join('');
  }

  function emptyState(title, body, cta, href) {
    return '<div class="cs-empty"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(body) + '</p>' + (cta ? '<a class="btn btn-secondary" href="' + escapeHtml(href || '/collections/routine.html') + '">' + escapeHtml(cta) + '</a>' : '') + '</div>';
  }

  function renderLatestOrder() {
    var slot = $('#latestOrderSlot');
    if (!slot) return;
    var order = (state.summary?.orders || [])[0];
    if (!order) {
      slot.innerHTML = emptyState('Henüz sipariş yok', 'İlk rutin seçkini oluşturduğunda sipariş durumunu burada takip edeceksin.', 'Alışverişe Başla', '/collections/routine.html');
      return;
    }
    slot.innerHTML = renderOrderCard(order, true);
  }

  function renderRoutineSlot() {
    var slot = $('#routineSlot');
    if (!slot) return;
    var user = state.summary?.user || {};
    var concerns = Array.isArray(user.skin_concerns) ? user.skin_concerns : [];
    if (!user.skin_type && !concerns.length && !user.routine_goal) {
      slot.innerHTML = emptyState('Cilt profilin tamamlanmadı', 'Cilt tipini ve hedeflerini kaydederek daha iyi ürün önerileri alabilirsin.', 'Profili Tamamla', '#skin');
      return;
    }
    slot.innerHTML = '<div class="cs-routine-summary"><p><strong>Cilt Tipi:</strong> ' + escapeHtml(user.skin_type || 'Belirtilmedi') + '</p><p><strong>Hedef:</strong> ' + escapeHtml(user.routine_goal || 'Belirtilmedi') + '</p><p><strong>Odaklar:</strong> ' + escapeHtml(concerns.join(', ') || 'Belirtilmedi') + '</p></div>';
  }

  function renderFavoritePreview() {
    var slot = $('#favoritePreviewSlot');
    if (!slot) return;
    var favorites = (state.summary?.favorites || []).map(normalizeFavorite).filter(Boolean);
    if (!favorites.length) {
      slot.innerHTML = emptyState('Favori listen boş', 'Beğendiğin ürünleri kalp simgesiyle kaydedebilirsin.', 'Ürün Keşfet', '/collections/routine.html');
      return;
    }
    slot.innerHTML = favorites.slice(0, 3).map(function (item) {
      return '<a class="cs-rec-card" href="' + escapeHtml(item.url) + '"><small>' + escapeHtml(item.brand) + '</small><strong>' + escapeHtml(item.product_name) + '</strong><span>' + escapeHtml(formatMoney(item.price)) + '</span></a>';
    }).join('');
  }

  function orderItemCount(order) {
    return (order.order_items || []).reduce(function (sum, item) {
      return sum + (Number(item.quantity || 0) || 1);
    }, 0);
  }

  function getPrimaryShipment(order) {
    var shipments = Array.isArray(order?.shipments) ? order.shipments.slice() : [];
    if (order?.latest_shipment) shipments.unshift(order.latest_shipment);
    return shipments.filter(Boolean).sort(function (a, b) {
      return new Date(b.updated_at || b.created_at || b.shipped_at || 0) - new Date(a.updated_at || a.created_at || a.shipped_at || 0);
    })[0] || {};
  }

  function getShipmentLabel(shipment) {
    if (!shipment || !shipment.status) return 'Kargo hazırlanıyor';
    return shipmentLabels[shipment.status] || shipment.status;
  }

  function getPaymentLabel(status) {
    var labels = {
      pending: 'Beklemede',
      initiated: 'Başlatıldı',
      paid: 'Ödendi',
      failed: 'Başarısız',
      refunded: 'İade edildi',
      partially_refunded: 'Kısmi iade'
    };
    return labels[status] || status || '—';
  }

  function getFulfillmentLabel(status) {
    var labels = {
      not_started: 'Hazırlık bekliyor',
      preparing: 'Hazırlanıyor',
      packed: 'Paketlendi',
      shipped: 'Kargoda',
      delivered: 'Teslim edildi',
      cancelled: 'İptal edildi',
      returned: 'İade sürecinde'
    };
    return labels[status] || status || '—';
  }

  function getOrderProgress(order) {
    var shipment = getPrimaryShipment(order);
    var status = String(order?.status || '').toLowerCase();
    var payment = String(order?.payment_status || '').toLowerCase();
    var fulfillment = String(order?.fulfillment_status || '').toLowerCase();
    var ship = String(shipment?.status || '').toLowerCase();
    var cancelled = ['cancelled', 'payment_failed', 'failed', 'refunded', 'partially_refunded'].includes(status) || ['cancelled', 'returned'].includes(fulfillment) || ['cancelled', 'returned'].includes(ship);
    var current = 0;
    if (['paid', 'preparing', 'shipped', 'delivered'].includes(status) || ['paid'].includes(payment) || order?.paid_at) current = 1;
    if (['preparing', 'shipped', 'delivered'].includes(status) || ['preparing', 'packed'].includes(fulfillment)) current = 2;
    if (['shipped', 'delivered'].includes(status) || ['shipped'].includes(fulfillment) || ship === 'shipped' || shipment?.tracking_number || order?.fulfilled_at) current = 3;
    if (status === 'delivered' || fulfillment === 'delivered' || ship === 'delivered' || order?.delivered_at || shipment?.delivered_at) current = 4;
    return [
      { key: 'received', label: 'Sipariş alındı', date: order?.created_at },
      { key: 'paid', label: 'Ödeme onaylandı', date: order?.paid_at, muted: current < 1 },
      { key: 'preparing', label: 'Hazırlanıyor', date: order?.fulfilled_at && current >= 2 ? order.fulfilled_at : '', muted: current < 2 },
      { key: 'shipped', label: 'Kargoda', date: shipment?.shipped_at || order?.fulfilled_at, muted: current < 3 },
      { key: 'delivered', label: 'Teslim edildi', date: shipment?.delivered_at || order?.delivered_at, muted: current < 4 }
    ].map(function (step, index) {
      return Object.assign({}, step, {
        done: !cancelled && index <= current,
        current: !cancelled && index === current,
        problem: cancelled && index === current
      });
    });
  }

  function renderOrderProgress(order, compact) {
    var steps = getOrderProgress(order);
    return '<div class="cs-order-progress ' + (compact ? 'is-compact' : '') + '">' + steps.map(function (step) {
      return '<div class="cs-order-step ' + (step.done ? 'is-done ' : '') + (step.current ? 'is-current ' : '') + (step.problem ? 'is-problem ' : '') + (step.muted ? 'is-muted' : '') + '"><span></span><strong>' + escapeHtml(step.label) + '</strong>' + (!compact && step.date ? '<small>' + escapeHtml(formatDate(step.date, true)) + '</small>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function renderOrderEvents(order) {
    var events = Array.isArray(order?.status_events) ? order.status_events.slice() : [];
    if (!events.length) {
      var shipment = getPrimaryShipment(order);
      events = [
        { status: 'received', message: 'Siparişiniz COSMOSKIN operasyon akışına alındı.', created_at: order?.created_at },
        order?.paid_at ? { status: 'paid', message: 'Ödeme onayı tamamlandı.', created_at: order.paid_at } : null,
        shipment?.tracking_number ? { status: 'shipped', message: (shipment.carrier ? shipment.carrier + ' ile ' : '') + 'kargo takip numarası oluşturuldu.', created_at: shipment.shipped_at || shipment.created_at } : null,
        order?.delivered_at || shipment?.delivered_at ? { status: 'delivered', message: 'Sipariş teslim edildi.', created_at: order.delivered_at || shipment.delivered_at } : null
      ].filter(Boolean);
    }
    return events.slice(-5).map(function (event) {
      return '<div class="cs-timeline-item"><strong>' + escapeHtml(statusLabels[event.status] || shipmentLabels[event.status] || event.status || 'Durum') + '</strong><time>' + escapeHtml(formatDate(event.created_at, true)) + '</time>' + (event.message ? '<p>' + escapeHtml(event.message) + '</p>' : '') + '</div>';
    }).join('');
  }

  function renderOrderItem(item, compact) {
    var url = item.product_url || (item.product_slug ? '/products/' + item.product_slug + '.html' : '#');
    var image = item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.product_name) + '" loading="lazy">' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5zM8 8a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    var unit = Number(item.unit_price || 0) ? '<small>Birim: ' + escapeHtml(formatMoney(item.unit_price)) + '</small>' : '';
    return '<a class="cs-order-product" href="' + escapeHtml(url) + '"><span class="cs-order-thumb">' + image + '</span><span class="cs-order-product-copy"><span>' + escapeHtml(item.brand || 'COSMOSKIN') + '</span><strong>' + escapeHtml(item.product_name || 'Ürün') + '</strong><small>Adet: ' + escapeHtml(item.quantity || 1) + '</small>' + (!compact ? unit : '') + '</span><b class="cs-order-total">' + escapeHtml(formatMoney(item.line_total || 0)) + '</b></a>';
  }

  function renderOrderCard(order, compact) {
    var shipment = getPrimaryShipment(order);
    var items = (order.order_items || []).slice(0, compact ? 2 : 99).map(function (item) { return renderOrderItem(item, compact); }).join('');
    var hiddenCount = Math.max(0, (order.order_items || []).length - (compact ? 2 : 99));
    var detailHref = '/account/order-detail.html?id=' + encodeURIComponent(order.id || order.order_number || '');
    var statusClass = order.status || order.fulfillment_status || shipment.status || '';
    var address = [order.district, order.city].filter(Boolean).join(' / ');
    var events = renderOrderEvents(order);
    return '<article class="cs-order-card cs-order-card--rich ' + (compact ? 'is-compact' : '') + '">' +
      '<div class="cs-order-card-head"><div><small>Sipariş No</small><strong>' + escapeHtml(order.order_number || order.id) + '</strong><time>' + escapeHtml(formatDate(order.created_at, true)) + '</time></div><div class="cs-order-head-actions"><span class="cs-status-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabels[order.status] || getFulfillmentLabel(order.fulfillment_status) || 'İşleniyor') + '</span><a class="cs-mini-btn" href="' + escapeHtml(detailHref) + '">Detayı Gör</a></div></div>' +
      renderOrderProgress(order, compact) +
      '<div class="cs-order-body"><div class="cs-order-items">' + (items || '<p class="account-mini">Ürün detayı bulunamadı.</p>') + (hiddenCount ? '<p class="account-mini">+' + hiddenCount + ' ürün daha sipariş detayında.</p>' : '') + '</div>' +
      '<aside class="cs-order-side"><div><span>Ürün</span><strong>' + escapeHtml(orderItemCount(order)) + ' adet</strong></div><div><span>Toplam</span><strong>' + escapeHtml(formatMoney(order.total_amount || 0)) + '</strong></div><div><span>Ödeme</span><strong>' + escapeHtml(getPaymentLabel(order.payment_status)) + '</strong></div><div><span>Kargo</span><strong>' + escapeHtml(getShipmentLabel(shipment)) + '</strong></div>' + (address ? '<div><span>Teslimat</span><strong>' + escapeHtml(address) + '</strong></div>' : '') + (shipment.carrier ? '<div><span>Firma</span><strong>' + escapeHtml(shipment.carrier) + '</strong></div>' : '') + (shipment.tracking_number ? '<div><span>Takip No</span><strong>' + escapeHtml(shipment.tracking_number) + '</strong></div>' : '') + '<div class="cs-order-actions">' + (shipment.tracking_url ? '<a class="cs-mini-btn dark" href="' + escapeHtml(shipment.tracking_url) + '" target="_blank" rel="noopener">Kargoyu Takip Et</a>' : '') + '<a class="cs-mini-btn" href="' + escapeHtml(detailHref) + '">Sipariş Detayı</a>' + (!compact ? '<button class="cs-mini-btn" type="button" data-repeat-order="' + escapeHtml(order.id) + '">Tekrar Sipariş Ver</button>' : '') + '</div>' + (!compact ? '<div class="cs-timeline">' + events + '</div>' : '') + '</aside></div></article>';
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
    if (filter === 'delivered') orders = orders.filter(function (order) {
      var shipment = getPrimaryShipment(order);
      return order.status === 'delivered' || order.fulfillment_status === 'delivered' || shipment.status === 'delivered';
    });
    if (filter === 'problem') orders = orders.filter(function (order) {
      var shipment = getPrimaryShipment(order);
      return ['cancelled', 'payment_failed', 'failed', 'refunded', 'partially_refunded'].includes(order.status) || ['cancelled', 'returned'].includes(order.fulfillment_status) || ['cancelled', 'returned'].includes(shipment.status);
    });
    if (!orders.length) {
      list.innerHTML = emptyState('Sipariş bulunamadı', 'Bu filtrede gösterilecek sipariş yok.', 'Ürünleri İncele', '/collections/routine.html');
      return;
    }
    list.innerHTML = orders.map(function (order) { return renderOrderCard(order, false); }).join('');
  }

  function renderFavorites() {
    var grid = $('#favoritesGrid');
    if (!grid) return;
    var favorites = (state.summary?.favorites || []).map(normalizeFavorite).filter(Boolean);
    if (!favorites.length) {
      grid.innerHTML = emptyState('Favori listen boş', 'Ürünleri favorileyerek daha sonra hızlıca sepete ekleyebilirsin.', 'Ürün Keşfet', '/collections/routine.html');
      return;
    }
    grid.innerHTML = favorites.map(function (item) {
      var img = item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.product_name) + '" loading="lazy">' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5zM8 8a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
      return '<article class="cs-fav-card"><a class="cs-fav-media" href="' + escapeHtml(item.url) + '">' + img + '</a><div class="cs-fav-body"><small>' + escapeHtml(item.brand) + '</small><h3>' + escapeHtml(item.product_name) + '</h3><strong class="cs-fav-price">' + escapeHtml(formatMoney(item.price)) + '</strong><div class="cs-fav-actions"><button class="cs-mini-btn" type="button" data-add-fav-cart="' + escapeHtml(item.product_slug) + '">Sepete Ekle</button><a class="cs-mini-btn" href="' + escapeHtml(item.url) + '">Ürünü Gör</a><button class="cs-mini-btn danger" type="button" data-remove-favorite="' + escapeHtml(item.product_slug) + '">Kaldır</button></div></div></article>';
    }).join('');
  }

  function normalizeAddress(row) {
    return {
      id: row.id,
      title: row.title || 'Adresim',
      first_name: row.recipient_first_name || row.first_name || '',
      last_name: row.recipient_last_name || row.last_name || '',
      phone: row.phone || '',
      city: row.city || '',
      district: row.district || '',
      postal_code: row.postal_code || '',
      address_line: row.address_line || '',
      address_type: row.address_type || row.type || 'shipping',
      is_default: Boolean(row.is_default)
    };
  }

  function renderAddresses() {
    var grid = $('#addressesGrid');
    if (!grid) return;
    var addresses = (state.summary?.addresses || []).map(normalizeAddress);
    if (!addresses.length) {
      grid.innerHTML = emptyState('Kayıtlı adres yok', 'Teslimat ve fatura adreslerini kaydederek checkout akışını hızlandırabilirsin.', null);
      return;
    }
    grid.innerHTML = addresses.map(function (addr) {
      return '<article class="cs-address-card ' + (addr.is_default ? 'is-default' : '') + '"><span class="tag">' + (addr.is_default ? 'Varsayılan' : escapeHtml(addr.address_type)) + '</span><h3>' + escapeHtml(addr.title) + '</h3><p><strong>' + escapeHtml([addr.first_name, addr.last_name].filter(Boolean).join(' ')) + '</strong><br>' + escapeHtml(addr.phone) + '<br>' + escapeHtml(addr.address_line) + '<br>' + escapeHtml([addr.district, addr.city, addr.postal_code].filter(Boolean).join(' / ')) + '</p><div class="cs-address-actions"><button class="cs-mini-btn" type="button" data-edit-address="' + escapeHtml(addr.id) + '">Düzenle</button>' + (!addr.is_default ? '<button class="cs-mini-btn" type="button" data-default-address="' + escapeHtml(addr.id) + '">Varsayılan Yap</button>' : '') + '<button class="cs-mini-btn danger" type="button" data-delete-address="' + escapeHtml(addr.id) + '">Sil</button></div></article>';
    }).join('');
  }

  function renderNotifications() {
    var list = $('#notificationsList');
    if (!list) return;
    var notifications = state.summary?.notifications || [];
    if (!notifications.length) {
      list.innerHTML = emptyState('Bildirim yok', 'Sipariş ve kargo güncellemeleri burada görünür.', null);
      return;
    }
    list.innerHTML = notifications.map(function (n) {
      return '<article class="cs-notification ' + (!n.is_read ? 'is-unread' : '') + '"><div><small>' + escapeHtml(n.type || 'system') + '</small><strong>' + escapeHtml(n.title || 'Bildirim') + '</strong><p>' + escapeHtml(n.body || '') + '</p><p>' + escapeHtml(formatDate(n.created_at, true)) + '</p></div>' + (!n.is_read && /^[0-9a-f-]{16,}$/i.test(String(n.id || '')) ? '<button class="cs-mini-btn" type="button" data-read-notification="' + escapeHtml(n.id) + '">Okundu</button>' : '') + '</article>';
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
      skinForm.elements.routine_goal.value = user.routine_goal || '';
      var concerns = new Set(Array.isArray(user.skin_concerns) ? user.skin_concerns : []);
      $$('input[name="skin_concerns"]', skinForm).forEach(function (input) { input.checked = concerns.has(input.value); });
      var comm = user.communication || {};
      var reminders = user.routine_reminders || {};
      if (skinForm.elements.routineEmails) skinForm.elements.routineEmails.checked = reminders.routineEmails !== false;
      if (skinForm.elements.restockEmails) skinForm.elements.restockEmails.checked = Boolean(reminders.restockEmails || comm.restockEmails);
      if (skinForm.elements.lowStockAlerts) skinForm.elements.lowStockAlerts.checked = Boolean(reminders.lowStockAlerts || comm.lowStockAlerts);
    }
  }

  function renderRecommendations() {
    var slot = $('#recommendationSlot');
    if (!slot) return;
    var user = state.summary?.user || {};
    var products = window.COSMOSKIN_PRODUCTS || [];
    var concerns = Array.isArray(user.skin_concerns) ? user.skin_concerns.join(' ').toLocaleLowerCase('tr-TR') : '';
    var goal = String(user.routine_goal || '').toLocaleLowerCase('tr-TR');
    var terms = (concerns + ' ' + goal + ' ' + String(user.skin_type || '').toLocaleLowerCase('tr-TR')).trim();
    var scored = products.map(function (p) {
      var hay = [p.name, p.brand, p.category, (p.keywords || []).join(' ')].join(' ').toLocaleLowerCase('tr-TR');
      var score = 0;
      terms.split(/\s+/).forEach(function (term) { if (term.length > 3 && hay.indexOf(term) >= 0) score += 1; });
      if (/nem|hyaluronic|nemsizlik/.test(terms) && /hyaluronic|nem|dive/i.test(hay)) score += 4;
      if (/bariyer|hassas|kızarıklık/.test(terms) && /centella|ceramide|cica|bariyer/i.test(hay)) score += 4;
      if (/ışıltı|leke|ton/.test(terms) && /vitamin|niacinamide|glow|rice/i.test(hay)) score += 4;
      return { product: p, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    if (!scored.length) scored = products.slice(0, 3).map(function (p) { return { product: p, score: 0 }; });
    slot.innerHTML = '<span class="section-kicker">Önerilen Seçki</span><div class="cs-rec-row">' + scored.map(function (x) {
      var p = x.product;
      return '<a class="cs-rec-card" href="' + escapeHtml(p.url) + '"><small>' + escapeHtml(p.brand || p.category || 'COSMOSKIN') + '</small><strong>' + escapeHtml(p.name) + '</strong><span>' + escapeHtml(formatMoney(p.price)) + '</span></a>';
    }).join('') + '</div>';
  }

  function renderAll() {
    renderShell();
    renderStats();
    renderLatestOrder();
    renderRoutineSlot();
    renderFavoritePreview();
    renderOrders();
    renderFavorites();
    renderAddresses();
    renderNotifications();
    renderForms();
    renderRecommendations();
    writeLocalFavorites(state.summary?.favorites || []);
  }

  function switchTab(tab) {
    if (!tab) return;
    state.activeTab = tab;
    $$('#accountNav button').forEach(function (btn) { btn.classList.toggle('is-active', btn.dataset.tab === tab); });
    $$('.cs-panel').forEach(function (panel) { panel.classList.toggle('is-active', panel.dataset.panel === tab); });
    var url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  async function loadSummary(options) {
    options = options || {};
    var data = await apiFetch('/account/summary');
    state.summary = data;
    if (!options.skipFavoriteSync) {
      var changed = await syncLocalFavoritesToRemote();
      if (changed) {
        data = await apiFetch('/account/summary');
        state.summary = data;
      }
    }
    renderAll();
  }

  async function saveProfile() {
    var form = $('#profileForm');
    if (!form) return;
    var first = form.elements.first_name.value.trim();
    var last = form.elements.last_name.value.trim();
    var phone = form.elements.phone.value.trim();
    var current = state.summary?.user || {};
    var payload = {
      first_name: first,
      last_name: last,
      full_name: [first, last].filter(Boolean).join(' '),
      name: [first, last].filter(Boolean).join(' '),
      phone: phone,
      skin_type: current.skin_type || '',
      skin_concerns: current.skin_concerns || [],
      routine_goal: current.routine_goal || '',
      comm_prefs: current.communication || {},
      routine_reminders: current.routine_reminders || {}
    };
    var res = await state.client.auth.updateUser({ data: payload });
    if (res.error) throw res.error;
    await loadSummary({ skipFavoriteSync: true });
    showToast('Hesap bilgileriniz güncellendi.');
  }

  async function saveSkin() {
    var form = $('#skinForm');
    if (!form) return;
    var current = state.summary?.user || {};
    var firstName = current.first_name || '';
    var lastName = current.last_name || '';
    var concerns = $$('input[name="skin_concerns"]', form).filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
    var routineReminders = {
      routineEmails: Boolean(form.elements.routineEmails?.checked),
      restockEmails: Boolean(form.elements.restockEmails?.checked),
      lowStockAlerts: Boolean(form.elements.lowStockAlerts?.checked)
    };
    var payload = {
      first_name: firstName,
      last_name: lastName,
      full_name: current.full_name || [firstName, lastName].filter(Boolean).join(' '),
      phone: current.phone || '',
      skin_type: form.elements.skin_type.value,
      skin_concerns: concerns,
      routine_goal: form.elements.routine_goal.value,
      routine_reminders: routineReminders,
      comm_prefs: Object.assign({}, current.communication || {}, routineReminders)
    };
    var res = await state.client.auth.updateUser({ data: payload });
    if (res.error) throw res.error;
    await loadSummary({ skipFavoriteSync: true });
    showToast('Cilt profiliniz güncellendi.');
  }

  function openAddressModal(address) {
    var modal = $('#addressModal');
    var form = $('#addressForm');
    var title = $('#addressModalTitle');
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
    form.elements.postal_code.value = address?.postal_code || '';
    form.elements.address_line.value = address?.address_line || '';
    form.elements.is_default.checked = Boolean(address?.is_default);
    if (title) title.textContent = address ? 'Adresi Düzenle' : 'Yeni Adres';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeAddressModal() {
    var modal = $('#addressModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function saveAddress(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var id = form.elements.id.value.trim();
    var payload = {
      id: id || undefined,
      title: form.elements.title.value.trim(),
      address_type: form.elements.address_type.value,
      first_name: form.elements.first_name.value.trim(),
      last_name: form.elements.last_name.value.trim(),
      phone: form.elements.phone.value.trim(),
      city: form.elements.city.value.trim(),
      district: form.elements.district.value.trim(),
      postal_code: form.elements.postal_code.value.trim(),
      address_line: form.elements.address_line.value.trim(),
      is_default: Boolean(form.elements.is_default.checked)
    };
    await apiFetch('/account/addresses', { method: id ? 'PATCH' : 'POST', body: payload });
    closeAddressModal();
    await loadSummary({ skipFavoriteSync: true });
    showToast(id ? 'Adres güncellendi.' : 'Adres kaydedildi.');
  }

  async function deleteAddress(id) {
    if (!id) return;
    await apiFetch('/account/addresses?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await loadSummary({ skipFavoriteSync: true });
    showToast('Adres silindi.');
  }

  async function setDefaultAddress(id) {
    var address = (state.summary?.addresses || []).map(normalizeAddress).find(function (item) { return item.id === id; });
    if (!address) return;
    await apiFetch('/account/addresses', { method: 'PATCH', body: Object.assign({}, address, { is_default: true }) });
    await loadSummary({ skipFavoriteSync: true });
    showToast('Varsayılan adres güncellendi.');
  }

  async function removeFavorite(slug) {
    await apiFetch('/account/favorites?product_slug=' + encodeURIComponent(slug), { method: 'DELETE' });
    await loadSummary({ skipFavoriteSync: true });
    showToast('Ürün favorilerden kaldırıldı.');
  }

  function repeatOrder(orderId) {
    var order = (state.summary?.orders || []).find(function (item) { return item.id === orderId; });
    if (!order) return;
    (order.order_items || []).forEach(function (item) { addProductToCart(item); });
    showToast('Siparişteki ürünler sepete eklendi.');
  }

  function passwordIsValid(password) {
    return password.length >= 8 && /[A-ZÇĞİÖŞÜ]/.test(password) && /[a-zçğıöşü]/.test(password) && /\d/.test(password);
  }

  async function updatePassword(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var password = form.elements.password.value;
    var confirm = form.elements.password_confirm.value;
    if (password !== confirm) return showToast('Şifreler eşleşmiyor.');
    if (!passwordIsValid(password)) return showToast('Şifre en az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam içermeli.');
    var res = await state.client.auth.updateUser({ password: password });
    if (res.error) throw res.error;
    form.reset();
    showToast('Şifreniz güncellendi.');
  }

  async function markNotification(id) {
    await apiFetch('/account/notifications', { method: 'PATCH', body: { id: id, is_read: true } });
    await loadSummary({ skipFavoriteSync: true });
  }

  async function markAllNotifications() {
    await apiFetch('/account/notifications', { method: 'PATCH', body: { mark_all_read: true } }).catch(function () { return null; });
    if (state.summary?.notifications) {
      state.summary.notifications = state.summary.notifications.map(function (n) { return Object.assign({}, n, { is_read: true }); });
      if (state.summary.stats) state.summary.stats.unread_notifications = 0;
      renderShell();
      renderNotifications();
    }
    showToast('Bildirimler okundu olarak işaretlendi.');
  }

  function bindEvents() {
    $('#accountNav')?.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-tab]');
      if (btn) switchTab(btn.dataset.tab);
    });
    document.addEventListener('click', function (event) {
      var hashTab = event.target.closest('a[href^="#"]');
      if (hashTab) {
        var candidate = hashTab.getAttribute('href').replace('#', '');
        if (candidate && $('[data-panel="' + candidate + '"]')) {
          event.preventDefault();
          switchTab(candidate);
        }
      }
      var switcher = event.target.closest('[data-switch-tab]');
      if (switcher) {
        event.preventDefault();
        switchTab(switcher.dataset.switchTab);
      }
      var editAddress = event.target.closest('[data-edit-address]');
      if (editAddress) {
        var address = (state.summary?.addresses || []).map(normalizeAddress).find(function (item) { return item.id === editAddress.dataset.editAddress; });
        openAddressModal(address);
      }
      var defaultAddress = event.target.closest('[data-default-address]');
      if (defaultAddress) setDefaultAddress(defaultAddress.dataset.defaultAddress).catch(handleError);
      var deleteAddr = event.target.closest('[data-delete-address]');
      if (deleteAddr) deleteAddress(deleteAddr.dataset.deleteAddress).catch(handleError);
      var removeFav = event.target.closest('[data-remove-favorite]');
      if (removeFav) removeFavorite(removeFav.dataset.removeFavorite).catch(handleError);
      var addFav = event.target.closest('[data-add-fav-cart]');
      if (addFav) {
        var fav = (state.summary?.favorites || []).find(function (item) { return item.product_slug === addFav.dataset.addFavCart; });
        addProductToCart(fav);
      }
      var repeat = event.target.closest('[data-repeat-order]');
      if (repeat) repeatOrder(repeat.dataset.repeatOrder);
      var read = event.target.closest('[data-read-notification]');
      if (read) markNotification(read.dataset.readNotification).catch(handleError);
    });
    $('#orderFilter')?.addEventListener('change', renderOrders);
    $('#addAddressBtn')?.addEventListener('click', function () { openAddressModal(null); });
    $('#closeAddressModal')?.addEventListener('click', closeAddressModal);
    $('#cancelAddressBtn')?.addEventListener('click', closeAddressModal);
    $('#addressModal')?.addEventListener('click', function (event) { if (event.target.id === 'addressModal') closeAddressModal(); });
    $('#addressForm')?.addEventListener('submit', function (event) { saveAddress(event).catch(handleError); });
    $('#saveProfileBtn')?.addEventListener('click', function () { saveProfile().catch(handleError); });
    $('#saveSkinBtn')?.addEventListener('click', function () { saveSkin().catch(handleError); });
    $('#passwordForm')?.addEventListener('submit', function (event) { updatePassword(event).catch(handleError); });
    $('#markAllNotificationsBtn')?.addEventListener('click', function () { markAllNotifications().catch(handleError); });
    $('#logoutBtn')?.addEventListener('click', async function () {
      await state.client.auth.signOut();
      window.location.href = '/index.html';
    });
  }

  function handleError(error) {
    console.error(error);
    showToast(error?.message || 'İşlem tamamlanamadı.');
  }

  async function init() {
    try {
      if (!window.supabase?.createClient || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        throw new Error('Supabase ayarları eksik.');
      }
      state.client = window.cosmoskinSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      var sessionResult = await state.client.auth.getSession();
      state.session = sessionResult?.data?.session || null;
      if (!state.session?.access_token) {
        window.location.href = '/index.html?next=' + encodeURIComponent('/account/profile.html');
        return;
      }
      var url = new URL(window.location.href);
      state.activeTab = url.searchParams.get('tab') || (window.location.hash || '').replace('#', '') || 'overview';
      bindEvents();
      await (window.COSMOSKIN_PRODUCTS_READY || Promise.resolve());
      await loadSummary();
      switchTab(state.activeTab);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      var layout = $('#accountLayout');
      if (layout) layout.hidden = true;
      var loading = $('#accountLoading');
      if (loading) {
        loading.hidden = false;
        loading.innerHTML = '<div class="cs-loading-card"><strong>Hesap yüklenemedi</strong><p>' + escapeHtml(error.message || 'Bilinmeyen hata') + '</p><a class="btn btn-secondary" href="/index.html">Ana Sayfaya Dön</a></div>';
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
