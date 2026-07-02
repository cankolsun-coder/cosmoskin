(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var state = {
    client: null,
    session: null,
    summary: null,
    activeTab: 'overview',
    ready: false,
    fatal: null
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
  function showToast(message, type) {
    var t = $('#accountToast');
    if (!t) return;
    t.textContent = message;
    t.dataset.type = type || 'info';
    t.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { t.classList.remove('is-visible'); }, 3200);
  }
  function setLoading(loading) {
    var app = $('#accountApp'); var load = $('#accountLoading'); var layout = $('#accountLayout');
    if (app) app.dataset.state = loading ? 'loading' : 'ready';
    if (load) load.hidden = !loading;
    if (layout) layout.hidden = loading;
  }
  function showFatal(title, message, detail) {
    state.fatal = { title: title, message: message, detail: detail };
    var app = $('#accountApp'); var load = $('#accountLoading'); var layout = $('#accountLayout');
    if (app) app.dataset.state = 'error';
    if (layout) layout.hidden = true;
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
    var layout = $('#accountLayout'); var load = $('#accountLoading'); var nav = $('.cs-account-sidebar'); var content = $('.cs-account-content');
    if (load) load.hidden = true;
    if (layout) layout.hidden = false;
    if (nav) nav.hidden = true;
    if (content) {
      content.innerHTML = '<section class="cs-account-gate">' +
        '<span class="cs-overline">HESABIM</span>' +
        '<h1>Hesabınızı görüntülemek için giriş yapın.</h1>' +
        '<p>' + escapeHtml(message || 'Siparişlerinizi, favorilerinizi, kuponlarınızı ve cilt rutininizi gerçek hesap oturumuyla yönetebilirsiniz.') + '</p>' +
        '<div class="cs-gate-actions"><a class="cs-pill-btn cs-pill-btn--dark" href="/index.html?login=1&next=' + encodeURIComponent('/account/profile.html' + window.location.search) + '">Giriş Yap</a><a class="cs-pill-btn" href="/index.html?register=1">Hesap Oluştur</a><a class="cs-pill-btn" href="/allproducts.html">Alışverişe Dön</a></div>' +
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
    return allProducts().find(function (p) { return p.product_slug === raw || p.id === raw || p.url === handle || p.product_slug === handle; }) || null;
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
      notifications: asArray(data.notifications),
      legal_consents: asArray(data.legal_consents),
      notification_preferences: data.notification_preferences || safeObject(user.communication),
      skin_profile: data.skin_profile || null,
      membership: data.membership || null,
      points: Object.assign({ balance: 0, available: 0, pending: 0, reversed: 0, ledger: [] }, safeObject(data.points))
    });
  }
  function normalizeTierName(value, spendOrPoints) {
    var raw = String(value || '').toLocaleLowerCase('tr-TR');
    if (raw.indexOf('elite') !== -1) return 'Elite Üye';
    if (raw.indexOf('signature') !== -1 || raw.indexOf('select') !== -1 || raw.indexOf('silver') !== -1) return 'Signature Üye';
    if (Number(spendOrPoints || 0) >= 15000) return 'Elite Üye';
    if (Number(spendOrPoints || 0) >= 5000) return 'Signature Üye';
    return 'Essential Üye';
  }
  function loyalty() {
    var summary = state.summary || {};
    var stats = summary.stats || {};
    var membership = summary.membership || {};
    var pointsObj = summary.points || {};
    var spend = Number(membership.rolling_spend_12m || stats.total_spent || 0) || 0;
    var available = Number(pointsObj.available ?? membership.available_points ?? membership.points_balance ?? pointsObj.balance ?? 0) || 0;
    var pending = Number(pointsObj.pending || 0) || 0;
    var label = normalizeTierName(membership.level_code || stats.tier?.label || stats.tier?.key, spend);
    var next = label === 'Essential Üye' ? 'Signature Üye' : label === 'Signature Üye' ? 'Elite Üye' : '';
    var threshold = label === 'Essential Üye' ? 5000 : label === 'Signature Üye' ? 15000 : Math.max(spend, 15000);
    var base = label === 'Signature Üye' ? 5000 : label === 'Elite Üye' ? 15000 : 0;
    var remaining = next ? Math.max(0, threshold - spend) : 0;
    var progress = next ? Math.max(0, Math.min(100, Math.round(((spend - base) / Math.max(1, threshold - base)) * 100))) : 100;
    return { label: label, spend: spend, available: Math.max(0, Math.round(available)), pending: Math.max(0, Math.round(pending)), next: next, threshold: threshold, remaining: remaining, progress: progress };
  }
  function skinProfile() {
    var user = state.summary?.user || {};
    var row = state.summary?.skin_profile || {};
    var concerns = asArray(row.secondary_goals || row.concerns || row.skin_concerns || user.secondary_goals || user.skin_concerns);
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
      var label = step.label || step.routine_step || product.routine_step || prod?.category || 'Rutin adımı';
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
  function paymentPaid(order) {
    var p = String(order?.payment_status || '').toLowerCase(); var s = statusFromOrder(order);
    return ['paid', 'confirmed', 'captured', 'preparing', 'packed', 'shipped', 'delivered', 'completed'].includes(p) || ['paid', 'confirmed', 'preparing', 'packed', 'shipped', 'delivered', 'completed'].includes(s) || Boolean(order?.paid_at);
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
    var s = statusFromOrder(order);
    if (String(order?.payment_status || '').toLowerCase() === 'payment_failed' || s === 'payment_failed') return 'Ödeme Başarısız';
    if (['paid','confirmed'].includes(s)) return 'Hazırlanıyor';
    return statusLabels[s] || statusLabels[order?.fulfillment_status] || shipmentLabels[shipment(order).status] || 'Durum bilgisi bekleniyor';
  }
  function orderProgress(order) {
    var s = statusFromOrder(order); var ship = String(shipment(order).status || '').toLowerCase();
    var current = 1;
    if (paymentPaid(order)) current = 2;
    if (['preparing','packed','shipped','delivered','completed'].includes(s) || ['preparing','packed'].includes(String(order?.fulfillment_status || '').toLowerCase())) current = 3;
    if (['shipped','delivered','completed'].includes(s) || ship === 'shipped' || shipment(order).tracking_number) current = 4;
    if (['delivered','completed'].includes(s) || ship === 'delivered') current = 5;
    var labels = ['Sipariş Alındı', 'Ödeme', 'Hazırlık', 'Kargo', 'Teslim'];
    return '<div class="cs-order-progress">' + labels.map(function (label, i) { return '<div class="cs-order-step ' + (i < current ? 'is-done ' : '') + (i === current - 1 ? 'is-current' : '') + '"><span></span><strong>' + escapeHtml(label) + '</strong></div>'; }).join('') + '</div>';
  }

  function stockInfo(product) {
    product = product || {};
    var raw = String(product.stock || product.stock_status || product.inventory_status || product.status || '').toLowerCase();
    if (['out','out_of_stock','sold_out','unavailable','tükendi','stokta_yok'].includes(raw)) return { sellable: false, label: 'Stok bekleniyor', className: 'is-out' };
    if (['in','in_stock','available','stokta','active','true'].includes(raw)) return { sellable: true, label: 'Stokta', className: 'is-in' };
    return { sellable: true, label: 'Stok kontrolü', className: 'is-unknown' };
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
  function getCoupons() {
    return asArray(state.summary?.coupons).map(function (c) {
      c = safeObject(c);
      var code = String(c.code || c.coupon_code || '').toUpperCase();
      var status = String(c.status || c.usage_status || 'available').toLowerCase();
      return Object.assign({
        code: code,
        status: status,
        title: c.title || (code ? code + ' kuponu' : 'COSMOSKIN avantajı'),
        description: c.description || c.message || 'Sepette uygun koşullarda uygulanabilir.',
        expires_at: c.expires_at || c.ends_at || '',
        scope_label: c.scope_label || (Number(c.min_subtotal ?? c.min_cart_total ?? 0) > 0 ? formatMoney(c.min_subtotal ?? c.min_cart_total ?? 0) + ' ve üzeri alışverişlerde' : 'Uygun ürünlerde geçerli'),
        min_subtotal: Number(c.min_subtotal ?? c.min_cart_total ?? 0),
        max_discount_amount: Number(c.max_discount_amount || c.max_discount || 0) || null,
        copyable: c.copyable !== false && ['available', 'active'].includes(status)
      }, c, { code: code, status: status });
    }).filter(function (c) { return c.code && !deprecatedCoupons.has(c.code); });
  }
  function couponExpired(c) { return c.expires_at ? new Date(c.expires_at).getTime() <= Date.now() : false; }
  function couponUsed(c) { return ['used','redeemed','consumed'].includes(String(c.status || '').toLowerCase()); }
  function activeCoupons() { return getCoupons().filter(function (c) { var st = String(c.status || '').toLowerCase(); return ['available','active'].includes(st) && c.copyable !== false && !couponExpired(c) && !couponUsed(c); }); }
  function usedCoupons() { return getCoupons().filter(couponUsed); }
  function expiredCoupons() { return getCoupons().filter(function (c) { return couponExpired(c) && !couponUsed(c); }); }

  function ensureAccountDom() {
    $('.cs-account-top')?.setAttribute('hidden', '');
    var body = document.body;
    body.classList.add('account-premium-page');
    var nav = $('#accountNav');
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
  function panel(tab, id) { return '<section class="cs-panel" data-panel="' + escapeHtml(tab) + '" id="' + escapeHtml(id) + '"></section>'; }

  function renderAll() {
    renderShell();
    renderOverview(); renderOrders(); renderReturns(); renderFavorites(); renderInvoices();
    renderRoutines(); renderSkinProfile(); renderClub(); renderCoupons(); renderProfile();
    renderAddresses(); renderPayments(); renderNotifications(); renderSecurity(); renderSupport();
  }
  function renderShell() {
    var summary = state.summary || {}; var user = summary.user || {};
    var l = loyalty();
    setText('#accountName', displayName(user));
    setText('#accountEmail', user.email || 'E-posta bilgisi yok');
    setText('#accountAvatar', initials(user));
    setText('#accountMemberSince', user.created_at ? 'Üyelik: ' + formatDate(user.created_at) : 'Üyelik bilgisi mevcut değil');
    setText('#ordersBadge', String(summary.orders.length));
    setText('#returnsBadge', String(summary.returns.length));
    setText('#favoritesBadge', String(summary.favorites.length || summary.stats.favorites_count || 0));
    setText('#addressesBadge', String(summary.addresses.length || summary.stats.addresses_count || 0));
    setText('#routinesBadge', String(summary.routine_results.length));
    setText('#couponsBadge', String(activeCoupons().length));
    setText('#notificationsBadge', String(summary.stats.unread_notifications || 0));
    var help = $('.cs-help-card');
    if (help) {
      help.setAttribute('data-tab-link','support');
      help.setAttribute('href','/account/profile.html?tab=support');
      var helpIcon = $('.cs-help-icon', help);
      if (helpIcon && !helpIcon.innerHTML.trim()) helpIcon.innerHTML = iconSvg('support');
    }
    renderFooterJournal(user);
    document.title = 'Hesabım | ' + (firstName(user) || 'COSMOSKIN');
    if (l.label) document.documentElement.style.setProperty('--cs-account-tier-progress', l.progress + '%');
  }
  function setText(selector, value) { var el = $(selector); if (el) el.textContent = value; }
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
    var user = state.summary.user || {}; var stats = state.summary.stats || {}; var l = loyalty(); var sp = skinProfile(); var latest = state.summary.orders[0];
    el.innerHTML = '<section class="cs-overview-hero-grid">' + welcomeCard(user, stats, l) + clubMiniCard(l) + skinMiniCard(sp) + '</section>' +
      '<section class="cs-overview-main-card"><div class="cs-panel-head cs-panel-head--inside"><div><span>ÖZET</span><h2>Hesap Genel Bakış</h2><p>Siparişlerinizi, adreslerinizi, avantajlarınızı ve bakım tercihlerinizi tek panelden yönetin.</p></div><div class="cs-panel-actions"><a class="cs-pill-btn" data-tab-link="routines" href="/account/profile.html?tab=routines">Rutinlerim</a><a class="cs-pill-btn" data-tab-link="support" href="/account/profile.html?tab=support">Destek Talebi</a></div></div>' +
      '<div class="cs-stat-grid cs-stat-grid--six">' + statCards() + '</div>' +
      '<div class="cs-overview-grid cs-overview-grid--final"><article class="cs-card cs-card-large"><div class="cs-card-head"><span>SON SİPARİŞ</span><a data-tab-link="orders" href="/account/profile.html?tab=orders">Tümünü Gör</a></div>' + (latest ? orderCard(latest, true) : emptyState('Henüz siparişiniz yok.', 'Sipariş verdiğinizde kargo ve ödeme durumunu buradan takip edebilirsiniz.', 'Alışverişe Başla', '/allproducts.html')) + '</article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>CİLT RUTİNİ</span><a data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Güncelle</a></div>' + routineSummary(sp) + '</article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>HESAP GÜVENLİĞİ</span><a data-tab-link="security" href="/account/profile.html?tab=security">Ayarlar</a></div><ul class="cs-security-list">' + securityChecklist().slice(0,4).map(securityRow).join('') + '</ul></article></div>' +
      '<div class="cs-overview-grid cs-overview-grid--secondary"><article class="cs-card"><div class="cs-card-head"><span>KUPONLARIM</span><a data-tab-link="coupons" href="/account/profile.html?tab=coupons">Tümünü Gör</a></div>' + couponMiniCard() + '</article><article class="cs-card"><div class="cs-card-head"><span>ADRES & TESLİMAT</span><a data-tab-link="addresses" href="/account/profile.html?tab=addresses">Adresleri Yönet</a></div>' + deliveryMiniCard() + '</article></div>' +
      '<div class="cs-lower-grid"><article class="cs-card cs-recommend-card"><div class="cs-card-head"><span>SANA ÖZEL ÖNERİLER</span><a href="/allproducts.html">Tümünü Gör</a></div>' + recommendationBlock() + '</article><article class="cs-card"><div class="cs-card-head"><span>HIZLI ERİŞİM</span></div><div class="cs-quick-grid">' + quickCards().join('') + '</div></article></div></section>';
  }
  function welcomeCard(user, stats, l) {
    var sp = skinProfile();
    var greeting = firstName(user) ? 'Merhaba ' + escapeHtml(firstName(user)) + ',' : 'Merhaba,';
    var prefText = hasSkinProfile(sp) ? profilePreferenceCount(sp) + ' kayıtlı bakım tercihi' : 'Cilt profili bekliyor';
    return '<article class="cs-account-welcome-card"><span class="cs-overline">HESABIM</span><h1>' + greeting + '<br>alışverişini ve bakım rutinini tek yerden yönet.</h1><p>Siparişlerin, favorilerin, adreslerin, kuponların ve cilt bakım rutinin gerçek hesap verileriyle burada görünür.</p><div class="cs-hero-chips"><span>' + iconSvg('truck') + '<b>' + activeOrders().length + ' aktif sipariş</b></span><span>' + iconSvg('sparkle') + '<b>' + escapeHtml(prefText) + '</b></span><span>' + iconSvg('pin') + '<b>' + (state.summary.addresses.length || stats.addresses_count || 0) + ' kayıtlı adres</b></span><span>' + iconSvg('ticket') + '<b>' + activeCoupons().length + ' aktif kupon</b></span><span>' + iconSvg('crown') + '<b>' + escapeHtml(l.label.replace(' Üye','')) + '</b></span></div></article>';
  }
  function clubMiniCard(l) {
    return '<article class="cs-loyalty-card cs-loyalty-card--mini"><div aria-hidden="true" class="cs-loyalty-watermark"><img src="/assets/logo-mark.png" alt=""></div><span class="cs-overline">' + iconSvg('crown') + 'COSMOSKIN CLUB</span><h2>' + escapeHtml(l.label) + '</h2><div class="cs-loyalty-progress"><span style="width:' + l.progress + '%"></span></div><div class="cs-loyalty-meta"><strong>' + escapeHtml(formatMoney(l.spend)) + ' / ' + escapeHtml(formatMoney(l.threshold)) + '</strong><span>' + (l.next ? escapeHtml(l.next + ' için kalan: ' + formatMoney(l.remaining)) : 'En üst seviye') + '</span></div><p>Puanlar iade süresi sonrası kullanılabilir hale gelir. 100 P = 1 TL.</p><div class="cs-loyalty-links"><a data-tab-link="club" href="/account/profile.html?tab=club">Avantajlar</a><a data-tab-link="club" href="/account/profile.html?tab=club">Puan Geçmişi</a><a href="/allproducts.html">Alışveriş</a></div></article>';
  }
  function skinMiniCard(sp) {
    if (!hasSkinProfile(sp)) return '<article class="cs-skin-profile-card cs-skin-profile-card--mini"><span class="cs-overline">CİLT PROFİLİM</span><h2>Profilini oluştur</h2><p>Cilt tipini ve bakım hedeflerini kaydedersen rutin önerilerin gerçek profil verilerine göre hazırlanır.</p><div class="cs-skin-profile-actions"><a class="cs-mini-btn dark" href="/routine.html">Rutin Merkezine Git</a><a class="cs-mini-btn" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Profili Düzenle</a></div></article>';
    var tags = profileGoalLabels(sp).slice(0, 3); if (sp.sensitivity) tags.push('Hassasiyet: ' + cleanSensitivity(sp.sensitivity)); if (!tags.length) tags = ['Profil kayıtlı'];
    return '<article class="cs-skin-profile-card cs-skin-profile-card--mini"><span class="cs-overline">CİLT PROFİLİM</span><h2>' + escapeHtml(cleanSkinType(sp.skin_type)) + '</h2><div class="cs-skin-tags">' + tags.slice(0,3).map(function (t) { return '<span>' + escapeHtml(t) + '</span>'; }).join('') + '</div><p>Cilt profilin kayıtlı. Rutin ve ürün önerileri bu bilgilerle güncellenir.</p><p class="cs-skin-profile-stamp">Son güncelleme: ' + escapeHtml(formatDate(sp.updated_at)) + '</p><div class="cs-skin-profile-actions"><a class="cs-mini-btn dark" data-tab-link="routines" href="/account/profile.html?tab=routines">Rutinlerim</a><a class="cs-mini-btn" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Profili Güncelle</a></div></article>';
  }
  function statCards() {
    var s = state.summary.stats; var l = loyalty();
    var cards = [
      { icon:'bag', label:'Toplam Sipariş', value:s.order_count || state.summary.orders.length || 0, hint:'Tüm sipariş geçmişi' },
      { icon:'truck', label:'Aktif Sipariş', value:activeOrders().length, hint:'Devam eden süreç' },
      { icon:'sparkle', label:'Kullanılabilir Puan', value:numberFmt.format(l.available), hint:'100 P = 1 TL' },
      { icon:'heart', label:'Favoriler', value:s.favorites_count || state.summary.favorites.length || 0, hint:'Kaydedilen ürünler' },
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
  function productCard(product, opts) {
    product = normalizeProduct(product) || {}; opts = opts || {};
    var stock = stockInfo(product); var slug = product.product_slug || product.id || '';
    return '<article class="cs-product-mini">' +
      '<a class="cs-product-mini__media" href="' + escapeHtml(product.url || '/allproducts.html') + '"><img src="' + escapeHtml(product.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(product.product_name || 'Ürün') + '" loading="lazy"></a>' +
      '<div><small>' + escapeHtml(product.brand || 'COSMOSKIN') + '</small><a href="' + escapeHtml(product.url || '/allproducts.html') + '"><strong>' + escapeHtml(product.product_name || 'Ürün') + '</strong></a><p>' + escapeHtml(product.category || 'K-Beauty seçkisi') + '</p>' +
      '<div class="cs-product-mini__bottom"><b>' + escapeHtml(formatMoney(product.price || 0)) + '</b><button class="cs-mini-btn dark" type="button" data-add-product-cart="' + escapeHtml(slug) + '" ' + (!stock.sellable ? 'disabled aria-disabled="true"' : '') + '>Sepete Ekle</button>' + (opts.favoriteId ? '<button class="cs-heart-btn is-active" type="button" aria-label="Favoriden çıkar" data-remove-favorite="' + escapeHtml(opts.favoriteId) + '" data-remove-favorite-slug="' + escapeHtml(slug) + '">♥</button>' : '<button class="cs-heart-btn" type="button" aria-label="Favoriye ekle" data-add-favorite="' + escapeHtml(slug) + '">♡</button>') + '</div>' +
      '<em class="cs-stock-dot ' + escapeHtml(stock.className) + '">' + escapeHtml(stock.label) + '</em></div></article>';
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
    return [
      { label:'E-posta doğrulaması', note:(user.email_verified || user.email_confirmed_at || state.session?.user?.email_confirmed_at) ? 'Doğrulandı' : 'Bilgi mevcut değil / doğrulanmadı' },
      { label:'Telefon bilgisi', note:user.phone ? 'Kayıtlı' : 'Telefon eklenmemiş' },
      { label:'Hesap oluşturma', note:user.created_at ? formatDate(user.created_at) : 'Bilgi mevcut değil' },
      { label:'Giriş yöntemi', note:provider || 'Bilgi mevcut değil' },
      { label:'Oturum durumu', note:state.session?.access_token ? 'Aktif oturum' : 'Oturum bulunamadı' },
      { label:'İki adımlı doğrulama', note:'Bu özellik şu anda aktif değil' }
    ];
  }
  function securityRow(item) { return '<li><strong>' + escapeHtml(item.label) + '</strong><span>' + escapeHtml(item.note) + '</span></li>'; }

  function orderCard(order, compact) {
    var firstItem = orderItems(order)[0] || {}; var p = getProductByHandle(firstItem.product_slug || firstItem.product_id || firstItem.product_url) || normalizeProduct(firstItem) || {};
    var ship = shipment(order); var invoiceReady = asArray(order.invoices).some(function (i) { return i.pdf_url; }); var detail = '/account/order-detail.html?id=' + encodeURIComponent(order.id || order.order_number || '');
    var tracking = ship.tracking_number && ship.tracking_url ? '<a class="cs-mini-btn" href="' + escapeHtml(ship.tracking_url) + '" target="_blank" rel="noopener">Kargoyu Takip Et</a>' : '';
    var repeat = ['delivered','shipped','completed'].includes(statusFromOrder(order)) ? '<button class="cs-mini-btn" type="button" data-repeat-order="' + escapeHtml(order.id || '') + '">Tekrar Satın Al</button>' : '';
    return '<article class="cs-order-card cs-order-card--rich ' + (compact ? 'is-compact' : '') + '"><div class="cs-order-card-head"><div><small>' + (compact ? 'SON SİPARİŞ' : 'SİPARİŞ') + '</small><strong>' + escapeHtml(safeOrderNumber(order)) + '</strong><time>' + escapeHtml(formatDate(order.created_at)) + ' · ' + itemCount(order) + ' ürün</time></div><div class="cs-order-head-actions"><span class="cs-status-pill preparing">' + escapeHtml(orderStatusText(order)) + '</span>' + (paymentPaid(order) ? '<span class="cs-status-pill paid">Ödeme alındı</span>' : '') + '</div></div>' + orderProgress(order) + '<div class="cs-order-body"><div class="cs-order-items"><a class="cs-order-product" href="' + escapeHtml(p.url || '/allproducts.html') + '"><span class="cs-order-thumb"><img src="' + escapeHtml(p.image || firstItem.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name || firstItem.product_name || 'Ürün') + '"></span><span class="cs-order-product-copy"><span>' + escapeHtml(p.brand || firstItem.brand || 'COSMOSKIN') + '</span><strong>' + escapeHtml(p.product_name || firstItem.product_name || 'Ürün bilgisi bekleniyor') + '</strong><small>Adet: ' + escapeHtml(firstItem.quantity || 1) + '</small></span><b class="cs-order-total">' + escapeHtml(formatMoney(firstItem.line_total || firstItem.unit_price || p.price || order.total_amount || 0)) + '</b></a></div><aside class="cs-order-side"><div><span>Toplam</span><strong>' + escapeHtml(formatMoney(order.total_amount || firstItem.line_total || p.price || 0)) + '</strong></div><div><span>Kargo Durumu</span><strong>' + escapeHtml(shipmentLabels[ship.status] || 'Bilgi bekleniyor') + '</strong></div><div><span>Kargo Firması</span><strong>' + escapeHtml(ship.carrier || ship.carrier_name || 'Bilgi bekleniyor') + '</strong></div><div><span>Fatura</span><strong>' + (invoiceReady ? 'Hazır' : 'Hazır olduğunda görünür') + '</strong></div></aside></div><div class="cs-order-actions"><a class="cs-mini-btn dark" href="' + escapeHtml(detail) + '">Sipariş Detayı</a><a class="cs-mini-btn" data-tab-link="support" href="/account/profile.html?tab=support">Destek Al</a>' + tracking + repeat + '</div></article>';
  }
  function routineSummary(sp) {
    if (!hasSkinProfile(sp)) return '<div class="cs-routine-overview"><p><strong>Durum:</strong> Cilt profili henüz tamamlanmadı.</p><p>Rutin Merkezi testini tamamladığında kayıtlı rutinin ve önerilerin burada görünür.</p><div class="cs-card-actions"><a class="cs-mini-btn dark" href="/routine.html">Rutin Merkezine Git</a><a class="cs-mini-btn" data-tab-link="skin-profile" href="/account/profile.html?tab=skin-profile">Cilt Profilim</a></div></div>';
    var goals = profileGoalLabels(sp); var products = recommendedProducts(4);
    return '<div class="cs-routine-overview"><p><strong>Cilt Tipi:</strong> ' + escapeHtml(cleanSkinType(sp.skin_type)) + '</p><p><strong>Hedef:</strong> ' + escapeHtml(goals[0] || 'Belirtilmedi') + '</p><p><strong>Odak:</strong> ' + escapeHtml(goals.slice(0,3).join(', ') || 'Profil verilerine göre hazırlanır') + '</p><p><strong>Rutin Stili:</strong> ' + escapeHtml(sp.routine_preference || 'Belirtilmedi') + '</p><div class="cs-routine-thumbs">' + products.map(function (p) { return '<img src="' + escapeHtml(p.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(p.product_name) + '">'; }).join('') + '</div><div class="cs-card-actions"><a class="cs-mini-btn dark" data-tab-link="routines" href="/account/profile.html?tab=routines">Rutinlerim</a><a class="cs-mini-btn" data-add-routine-cart="true" href="/allproducts.html">Önerileri Sepete Ekle</a></div></div>';
  }

  function renderOrders() { var el = $('#ordersPanel'); if (!el) return; var orders = state.summary.orders; el.innerHTML = '<div class="cs-tab-title"><div><h1>Siparişlerim</h1><p>Sipariş durumunu, kargo bilgisini ve ürün detaylarını takip edin.</p></div></div>' + (orders.length ? '<div class="cs-order-list">' + orders.map(function (o) { return orderCard(o, false); }).join('') + '</div>' : emptyState('Henüz siparişiniz yok.', 'Sipariş verdiğinizde durumunu ve teslimat bilgilerini burada takip edebilirsiniz.', 'Alışverişe Başla', '/allproducts.html')); }

  function returnStatusLabel(status) {
    return ({ requested:'İade talebiniz alındı.', under_review:'Talebiniz inceleniyor.', approved:'İade talebiniz onaylandı.', return_code_shared:'İade gönderim kodunuz hazır.', waiting_customer_ship:'Ürününüzü kargoya vermeniz bekleniyor.', in_transit:'İade gönderiniz yolda.', received:'Ürününüz tarafımıza ulaştı.', inspection:'Ürün kontrol ediliyor.', refund_pending:'Ücret iadeniz hazırlanıyor.', refunded:'Ücret iadeniz tamamlandı.', rejected:'İade talebiniz reddedildi.', cancelled:'İade talebiniz iptal edildi.', closed:'İade süreci kapatıldı.' })[String(status || '').toLowerCase()] || 'İade talebi alındı.';
  }
  function deliveredDate(order) { return order && (order.delivered_at || order.fulfilled_at || order.updated_at || order.created_at); }
  function returnWindowEnds(order) { var d = deliveredDate(order); if (!d) return null; var end = new Date(d); end.setDate(end.getDate() + 14); return end; }
  function isDeliveredOrder(order) { var s = String(order?.status || '').toLowerCase(); var f = String(order?.fulfillment_status || '').toLowerCase(); return ['shipped','delivered','completed'].includes(s) || ['shipped','delivered'].includes(f) || Boolean(order?.delivered_at || order?.fulfilled_at); }
  function isReturnEligible(order) { var end = returnWindowEnds(order); return isDeliveredOrder(order) && end && Date.now() <= end.getTime(); }
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
  function returnRequestFormHtml() {
    var orders = returnEligibleOrders();
    if (!orders.length) return '<section class="cs-card cs-return-create-card"><div class="cs-card-head"><span>İADE TALEBİ OLUŞTUR</span></div><div class="cs-return-empty-eligible"><strong>İade edilebilir sipariş bulunmuyor.</strong><p>Sipariş teslim edilmediyse iade talebi oluşturulamaz. Teslim tarihinden itibaren 14 gün geçtikten sonra yasal iade süresi sona erer.</p><a class="cs-mini-btn dark" data-tab-link="orders" href="/account/profile.html?tab=orders">Siparişlerime Git</a></div></section>';
    var orderOptions = orders.map(function(order){ return '<option value="' + escapeHtml(order.id || '') + '">' + escapeHtml(safeOrderNumber(order)) + ' · Son gün: ' + escapeHtml(formatDate(returnWindowEnds(order))) + '</option>'; }).join('');
    var first = orders[0];
    return '<section class="cs-card cs-return-create-card" id="returnCreateCard"><div class="cs-card-head"><span>İADE TALEBİ OLUŞTUR</span><button class="cs-mini-btn" type="button" data-close-return-form>Vazgeç</button></div><form class="cs-form cs-return-form" id="returnRequestForm"><label class="full"><span>Sipariş seçimi</span><select class="cs-input" name="order_id" data-return-order-select>' + orderOptions + '</select></label><div class="full" data-return-order-items>' + orderReturnItemsHtml(first) + '</div><label class="full"><span>Açıklama</span><textarea class="cs-input" name="customer_note" rows="4" maxlength="900" placeholder="Talebinizi değerlendirmemize yardımcı olacak kısa açıklama yazın."></textarea></label><label class="full"><span>Fotoğraf / Video</span><input class="cs-input" name="attachments" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple data-return-attachments><small class="cs-field-help">Hasarlı, yanlış veya eksik ürün taleplerinde fotoğraf/video zorunludur. JPG, PNG, WEBP veya MP4 · en fazla 5 dosya · dosya başına 10 MB.</small></label><div class="cs-return-hygiene-box full"><strong>Kozmetik/hijyen iade koşulları</strong><label><input type="checkbox" name="unused_confirmed"> Ürünün kullanılmadığını onaylıyorum.</label><label><input type="checkbox" name="hygiene_confirmed"> Ürünün ambalajının açılmadığını onaylıyorum.</label><label><input type="checkbox" name="seal_intact_confirmed"> Koruma bandı, mühür veya jelatinin bozulmadığını onaylıyorum.</label><label><input type="checkbox" name="resaleable_confirmed"> Ürünün yeniden satışa uygun durumda olduğunu onaylıyorum.</label><label><input type="checkbox" name="return_terms_confirmed" required> İade koşullarını okuduğumu ve talebin inceleme sonrası sonuçlandırılacağını kabul ediyorum.</label><p>Lütfen fotoğraf/video içinde kimlik, banka kartı, özel belge veya gereksiz kişisel bilgi görünmediğinden emin olun.</p></div><div class="cs-form-status full" id="returnRequestStatus" role="status"></div><button class="cs-pill-btn cs-pill-btn--dark full" type="submit">İade Talebi Oluştur</button></form></section>';
  }

  function renderReturns() {
    var el = $('#returnsPanel'); if (!el) return;
    var rows = asArray(state.summary.returns || []);
    var createOpen = String(new URL(window.location.href).searchParams.get('createReturn') || '') === '1' || el.dataset.returnFormOpen === 'true';
    var cards = rows.length ? '<div class="cs-order-list cs-return-list">' + rows.map(function (r) {
      var items = asArray(r.items || r.requested_items);
      var attachments = asArray(r.attachments);
      return '<article class="cs-card cs-return-card"><div class="cs-card-head"><span>' + escapeHtml(returnStatusLabel(r.status)) + '</span><small>' + escapeHtml(r.return_number || ('CS-RET-' + String(r.id || '').replace(/-/g,'').slice(0,10).toUpperCase())) + '</small></div><h3>' + escapeHtml(r.reason || 'İade talebi') + '</h3><p>' + escapeHtml(r.customer_note || 'Talebiniz COSMOSKIN ekibi tarafından incelenir.') + '</p>' + (items.length ? '<ul class="cs-return-products">' + items.map(function(item){ return '<li>' + escapeHtml(item.product_name_snapshot || item.product_name || item.name || 'Ürün') + ' · ' + escapeHtml(item.quantity || 1) + ' adet</li>'; }).join('') + '</ul>' : '') + '<div class="cs-return-meta"><small>Talep tarihi: ' + escapeHtml(formatDate(r.created_at, true)) + '</small><small>Ek dosya: ' + attachments.length + '</small></div></article>';
    }).join('') + '</div>' : emptyState('Henüz iade talebiniz bulunmuyor.', 'Teslim edilmiş ve iade süresi devam eden siparişleriniz için iade talebi oluşturabilirsiniz.', null);
    el.innerHTML = '<div class="cs-tab-title"><div><h1>İade Taleplerim</h1><p>İade Taleplerim, teslim edilmiş ve iade süresi devam eden siparişleriniz için oluşturduğunuz resmi iade taleplerini gösterir. Genel destek konuları için Destek Taleplerim alanını kullanabilirsiniz.</p></div><button class="cs-pill-btn cs-pill-btn--dark" data-open-return-form type="button">İade Talebi Oluştur</button></div>' + (createOpen ? returnRequestFormHtml() : '') + cards;
  }
  function renderFavorites() {
    var el = $('#favoritesPanel'); if (!el) return;
    var local = [];
    try { local = JSON.parse(localStorage.getItem('cosmoskin_favorites') || '[]'); if (!Array.isArray(local)) local = []; } catch (_) { local = []; }
    var combined = asArray(state.summary.favorites).concat(local.map(function(item){ return { product_slug:item.id || item.slug, product_id:item.id || item.slug, product_name:item.name, name:item.name, brand:item.brand, price:item.price, image:item.image, url:item.url, id:item.favorite_id || item.id }; }));
    var seen = Object.create(null);
    var favs = combined.map(function (f) { var key = f.product_slug || f.product_id || f.id; if (!key || seen[key]) return null; seen[key] = true; var p = getProductByHandle(f.product_slug || f.product_id || f.id) || normalizeProduct(f); return p ? Object.assign({ favorite_id: f.id, product_slug: p.product_slug || f.product_slug || f.product_id }, p) : null; }).filter(Boolean);
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Favorilerim</h1><p>Favorilediğiniz ürünleri tek yerden yönetin. Anasayfa, Favoriler ve Hesabım aynı favori kaynağıyla senkronize edilir.</p></div><a class="cs-pill-btn" href="/allproducts.html">Ürünleri Keşfet</a></div>' + (favs.length ? '<div class="cs-product-mini-row cs-favorites-grid">' + favs.map(function (p) { return productCard(p, { favoriteId: p.favorite_id }); }).join('') + '</div>' : emptyState('Favori ürününüz bulunmuyor.', 'Beğendiğiniz ürünleri favorilere ekleyerek daha sonra kolayca ulaşabilirsiniz.', 'Ürünleri Keşfet', '/allproducts.html'));
  }
  function renderInvoices() {
    var el = $('#invoicesPanel'); if (!el) return; var rows = [];
    state.summary.orders.forEach(function (o) { asArray(o.invoices).forEach(function (i) { rows.push({ order: o, invoice: i }); }); });
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Faturalarım</h1><p>Hazır faturalarınız burada görüntülenir.</p></div></div>' + (rows.length ? '<div class="cs-order-list">' + rows.map(function (r) { return '<article class="cs-return-card"><h3>' + escapeHtml(r.invoice.invoice_number || safeOrderNumber(r.order)) + '</h3><p>' + escapeHtml(formatDate(r.invoice.issued_at || r.invoice.created_at)) + '</p><a class="cs-mini-btn dark" href="' + escapeHtml(r.invoice.pdf_url || '/contact.html') + '">Faturayı Görüntüle</a></article>'; }).join('') + '</div>' : emptyState('Hazır faturanız bulunmuyor.', 'Faturalarınız hazır olduğunda bu alanda görüntülenir.', null));
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
      return '<article class="cs-routine-card ' + (r.is_active || index === 0 ? 'is-active' : '') + '"><div><span class="cs-overline">' + (r.is_active || index === 0 ? 'AKTİF RUTİN' : 'RUTİN SONUCU') + '</span><h3>' + escapeHtml(r.routine_title || 'Kayıtlı Akıllı Rutin') + '</h3><p>' + escapeHtml(r.result?.summary || 'Bu rutin cilt profili, hedef ve ürün adımı verilerine göre kaydedildi.') + '</p><div class="cs-routine-meta"><span>' + escapeHtml(skinType) + '</span><span>' + escapeHtml(primaryGoal) + '</span><span>' + escapeHtml(sensitivity) + '</span></div><small>Son güncelleme: ' + escapeHtml(formatDate(r.updated_at || r.created_at, true)) + '</small></div>' + scoreHtml + '<div class="cs-routine-thumbs">' + products.map(function (p) { var prod = getProductByHandle(p.product_slug || p.slug || p.id) || normalizeProduct(p); return '<img src="' + escapeHtml(prod?.image || '/assets/logo-mark-beige.png') + '" alt="' + escapeHtml(prod?.product_name || 'Ürün') + '">'; }).join('') + '</div><div class="cs-routine-step-grid">' + routineStepsHtml('Sabah', r.morning_steps) + routineStepsHtml('Akşam', r.evening_steps) + (r.weekly_steps.length ? routineStepsHtml('Haftalık', r.weekly_steps) : '') + '</div><div class="cs-card-actions"><a class="cs-mini-btn dark" href="/account/routines/">Rutin Dashboard’u Aç</a><button class="cs-mini-btn" type="button" data-add-saved-routine-cart="' + escapeHtml(r.id || '') + '">Ürünleri Sepete Ekle</button></div></article>';
    }
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Akıllı Rutinim</h1><p>Rutin Merkezi’nde oluşturduğunuz kişisel bakım rotası hesabınızla senkronize edilir.</p></div><a class="cs-pill-btn cs-pill-btn--dark" href="/routine.html">Rutin Merkezine Git</a></div>' + (rows.length ? '<div class="cs-routine-list">' + rows.map(routineCard).join('') + '</div>' : emptyState('Henüz kayıtlı rutininiz yok.', 'Akıllı Rutin Merkezi’ni kullanarak kişisel bakım rotanızı oluşturabilirsiniz.', 'Rutin Merkezine Git', '/routine.html'));
  }
  function renderSkinProfile() {
    var el = $('#skinPanel'); if (!el) return; var sp = skinProfile(); var goals = profileGoalLabels(sp); var products = recommendedProducts(4);
    var productHtml = products.length ? '<div class="cs-product-mini-row">' + products.map(productCard).join('') + '</div>' : emptyState('Profil tamamlanınca öneriler görünür.', 'Rutin Merkezi veya aşağıdaki form ile cilt profilinizi kaydedebilirsiniz.', 'Rutin Merkezine Git', '/routine.html');
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Cilt Profilim</h1><p>Cilt tipi, hassasiyet ve bakım hedefleri hesap verinizle kaydedilir.</p></div><button class="cs-pill-btn cs-pill-btn--dark" type="button" id="saveSkinBtn">Profili Kaydet</button></div>' +
      '<section class="cs-skin-hero"><article><span class="cs-overline">PROFİL DURUMU</span><h2>' + escapeHtml(hasSkinProfile(sp) ? cleanSkinType(sp.skin_type) : 'Profil bekliyor') + '</h2><p>' + escapeHtml(hasSkinProfile(sp) ? (goals.join(', ') || 'Bakım hedefi belirtilmedi') : 'Profilinizi tamamlayarak rutin önerilerini kişiselleştirin.') + '</p><small>Son güncelleme: ' + escapeHtml(formatDate(sp.updated_at)) + '</small></article><article><div class="cs-skin-detail-grid"><div><b>Cilt Tipi</b><span>' + escapeHtml(cleanSkinType(sp.skin_type)) + '</span></div><div><b>Hassasiyet</b><span>' + escapeHtml(cleanSensitivity(sp.sensitivity)) + '</span></div><div><b>Rutin Stili</b><span>' + escapeHtml(sp.routine_preference || 'Belirtilmedi') + '</span></div></div></article></section>' +
      '<form class="cs-form cs-skin-editor" id="skinForm"><label><span>Cilt Tipi</span><select class="cs-input" name="skin_type"><option value="">Seçiniz</option>' + ['Normal cilt','Kuru cilt','Karma cilt','Yağlı cilt','Hassas cilt'].map(function (v) { return '<option value="' + escapeHtml(v) + '" ' + (cleanSkinType(sp.skin_type).toLowerCase() === v.toLowerCase() ? 'selected' : '') + '>' + escapeHtml(v) + '</option>'; }).join('') + '</select></label><label><span>Hassasiyet</span><select class="cs-input" name="skin_sensitivity"><option value="">Seçiniz</option>' + ['Düşük','Orta','Yüksek'].map(function (v) { return '<option value="' + escapeHtml(v) + '" ' + (cleanSensitivity(sp.sensitivity).indexOf(v) === 0 ? 'selected' : '') + '>' + escapeHtml(v) + '</option>'; }).join('') + '</select></label><label><span>Bakım Önceliği</span><select class="cs-input" name="routine_goal"><option value="">Seçiniz</option>' + ['Nem desteği','Cilt konforu ve bariyer görünümü','Aydınlık görünüm','Gözenek görünümü ve sebum dengesi','Hassas ciltlere uygun ürün tercihi'].map(function (v) { return '<option value="' + escapeHtml(v) + '" ' + ((sp.routine_goal === v || goals.includes(v)) ? 'selected' : '') + '>' + escapeHtml(v) + '</option>'; }).join('') + '</select></label><fieldset class="cs-checks cs-care-priority-chips full"><legend>Bakım Öncelikleri</legend>' + ['Nem desteği','Cilt konforu','Leke görünümü','Gözenek görünümü ve sebum','Hassas ciltlere uygun ürün tercihi'].map(function (v) { return '<label><input name="skin_concerns" type="checkbox" value="' + escapeHtml(v) + '" ' + (sp.goals.includes(v) ? 'checked' : '') + '> <span>' + escapeHtml(v) + '</span></label>'; }).join('') + '</fieldset><p class="cs-form-note full">Bu alan kozmetik ürün seçimini kişiselleştirmek içindir; tıbbi teşhis veya tedavi tavsiyesi değildir.</p></form>' +
      '<section class="cs-card cs-skin-products"><div class="cs-card-head"><span>PROFİLE GÖRE ÜRÜNLER</span><a href="/allproducts.html">Tümünü Gör</a></div>' + productHtml + '</section>';
  }
  function renderClub() {
    var el = $('#clubPanel'); if (!el) return; var l = loyalty(); var ledger = asArray(state.summary.points?.ledger);
    var tiers = [
      { key:'essential', name:'Essential', color:'Koyu kahve', range:'Başlangıç seviyesi', benefits:['COSMOSKIN hesabı ile sipariş ve iade takibi','Seçili dönem kampanyalarına erişim','Puanların iade süresi sonrası kullanılabilir hale gelmesi'] },
      { key:'signature', name:'Signature', color:'Gold', range:'5.000 TL+ alışveriş', benefits:['Essential avantajları','Daha güçlü puan ilerlemesi','Özel seçki ve kampanya öncelikleri'] },
      { key:'elite', name:'Elite', color:'Bordo', range:'15.000 TL+ alışveriş', benefits:['Signature avantajları','Premium kampanya ve özel dönem öncelikleri','Elite müşteri deneyimi ve seçki notları'] }
    ];
    var tierCards = tiers.map(function(t){ return '<button class="cs-tier-card cs-tier-card--' + t.key + '" type="button" data-club-tier="' + t.key + '"><span>' + escapeHtml(t.name) + '</span><strong>' + escapeHtml(t.range) + '</strong><small>' + escapeHtml(t.color) + ' seviye</small></button><div class="cs-tier-detail" data-club-tier-detail="' + t.key + '" hidden><h3>' + escapeHtml(t.name) + ' özellikleri</h3><ul>' + t.benefits.map(function(b){ return '<li>' + escapeHtml(b) + '</li>'; }).join('') + '</ul><p>Puanlar nakde çevrilemez; iade/iptal edilen siparişlerde ilgili puanlar geri alınabilir.</p></div>'; }).join('');
    var history = ledger.length ? '<div class="cs-point-history">' + ledger.map(function (p) { return '<div class="cs-point-row"><span><strong>' + escapeHtml(p.reason || p.event_type || 'Puan hareketi') + '</strong><small>' + escapeHtml(formatDate(p.created_at, true)) + '</small></span><b>' + escapeHtml(p.points_delta || p.points || 0) + ' P</b><span>' + escapeHtml(p.status || 'kayıt') + '</span></div>'; }).join('') + '</div>' : emptyState('Puan hareketi bulunmuyor.', 'Siparişler tamamlandığında puan hareketleri burada görünür.', null);
    el.innerHTML = '<div class="cs-tab-title"><div><h1>COSMOSKIN Club</h1><p>Essential, Signature ve Elite seviyelerini, puan geçmişinizi ve seviye avantajlarını takip edin.</p></div></div>' +
      '<section class="cs-loyalty-detail"><article class="cs-loyalty-summary cs-loyalty-summary--club"><strong>' + escapeHtml(l.label) + '</strong><p>Mevcut harcama: ' + escapeHtml(formatMoney(l.spend)) + '. Sonraki seviye: ' + escapeHtml(l.next || 'En üst seviye') + '.</p><div class="cs-loyalty-progress"><span style="width:' + l.progress + '%"></span></div><div class="cs-loyalty-metrics"><span>Kullanılabilir<b>' + escapeHtml(numberFmt.format(l.available)) + ' P</b></span><span>Bekleyen<b>' + escapeHtml(numberFmt.format(l.pending)) + ' P</b></span><span>İade/İptal<b>' + escapeHtml(numberFmt.format(l.reversed)) + ' P</b></span></div></article><div class="cs-tier-grid cs-tier-grid--premium">' + tierCards + '</div><article class="cs-card"><div class="cs-card-head"><span>PUAN GEÇMİŞİ</span></div>' + history + '</article></section>';
  }
  function renderCoupons() {
    var el = $('#couponsPanel'); if (!el) return; var available = activeCoupons(); var used = usedCoupons(); var expired = expiredCoupons(); var locked = state.summary.locked_coupons.filter(function (c) { return c && c.code && !deprecatedCoupons.has(String(c.code).toUpperCase()); });
    function couponRow(c, stateLabel) { c = safeObject(c); var code = String(c.code || c.coupon_code || '').toUpperCase(); return '<article class="cs-coupon-row"><strong>' + escapeHtml(code) + '</strong><div><b>' + escapeHtml(c.title || code) + '</b><p>' + escapeHtml(c.description || c.message || 'Kupon koşullarını sağladığında sepette uygulanabilir.') + '</p><small>' + escapeHtml(c.scope_label || '') + (c.max_discount_amount ? ' · Maks. ' + escapeHtml(formatMoney(c.max_discount_amount)) : '') + '</small></div><em>' + escapeHtml(stateLabel) + '</em>' + (c.copyable !== false && stateLabel === 'Kullanılabilir' ? '<button class="cs-mini-btn dark" type="button" data-copy-coupon="' + escapeHtml(code) + '">Kopyala</button>' : '<span></span>') + '</article>'; }
    var availableHtml = available.length ? available.map(function (c) { return couponRow(c, 'Kullanılabilir'); }).join('') : emptyState('Kullanılabilir kupon bulunmuyor.', 'Uygun kuponlar hesabınızda aktif olduğunda burada görünür.', null);
    var lockedHtml = locked.length ? locked.map(function (c) { return couponRow(Object.assign({}, c, { copyable:false }), 'Kilitli'); }).join('') : emptyState('Kilitli kupon bulunmuyor.', 'Doğum günü veya seviye kuponları uygunluk oluştuğunda aktifleşir.', null);
    var usedHtml = used.length ? used.map(function (c) { return couponRow(c, 'Kullanıldı'); }).join('') : emptyState('Kullanılmış kupon bulunmuyor.', 'Kullanım geçmişi sipariş tamamlandığında burada görünür.', null);
    var expiredHtml = expired.length ? expired.map(function (c) { return couponRow(c, 'Süresi doldu'); }).join('') : emptyState('Süresi dolmuş kupon bulunmuyor.', '', null);
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Kuponlarım</h1><p>Kuponlar kullanım koşullarına göre gösterilir; WELCOME10 ve BIRTHDAY10 otomatik uygulanmaz, manuel kopyalanır.</p></div></div><section class="cs-coupon-hero"><div><span class="cs-overline">AKTİF KUPON</span><h2>' + escapeHtml(available[0]?.code || 'Kupon bulunmuyor') + '</h2><p>' + escapeHtml(available[0]?.description || 'Uygun kampanyalar hesabınızda görünür.') + '</p></div><div class="cs-coupon-actions"><a class="cs-pill-btn" href="/cart.html">Sepete Git</a><a class="cs-pill-btn" href="/checkout.html">Checkout</a></div></section>' +
      '<section class="cs-coupon-tabs" data-coupon-tabs><div class="cs-tabstrip"><button class="is-active" type="button" data-coupon-filter="available">Kullanılabilir</button><button type="button" data-coupon-filter="locked">Kilitli</button><button type="button" data-coupon-filter="used">Kullanılmış</button><button type="button" data-coupon-filter="expired">Süresi Dolan</button></div><div data-coupon-panel="available">' + availableHtml + '</div><div data-coupon-panel="locked" hidden>' + lockedHtml + '</div><div data-coupon-panel="used" hidden>' + usedHtml + '</div><div data-coupon-panel="expired" hidden>' + expiredHtml + '</div></section>';
  }
  function renderProfile() {
    var el = $('#profilePanel'); if (!el) return; var user = state.summary.user || {};
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Hesap Bilgilerim</h1><p>Ad, soyad, telefon ve doğum günü bilgileri gerçek hesap profiline kaydedilir.</p></div><button class="cs-pill-btn cs-pill-btn--dark" id="saveProfileBtn" type="button">Bilgileri Kaydet</button></div>' +
      '<section class="cs-card"><div class="cs-card-head"><span>PROFİL BİLGİLERİ</span></div><form class="cs-form cs-form-compact" id="profileForm"><label><span>Ad</span><input class="cs-input" name="first_name" value="' + escapeHtml(user.first_name || '') + '" autocomplete="given-name"></label><label><span>Soyad</span><input class="cs-input" name="last_name" value="' + escapeHtml(user.last_name || '') + '" autocomplete="family-name"></label><label><span>E-posta</span><input class="cs-input" name="email" type="email" readonly value="' + escapeHtml(user.email || '') + '"></label><label><span>Telefon</span><input class="cs-input" name="phone" value="' + escapeHtml(user.phone || '') + '" autocomplete="tel"></label><label><span>Doğum Tarihi</span><input class="cs-input" name="birthday" type="date" value="' + escapeHtml(user.birthday || '') + '"></label><p class="cs-field-help full">Doğum tarihinizi profilinizde ekleyebilir veya düzeltebilirsiniz. Doğum günü kuponları otomatik uygulanmaz; uygun olduğunda kupon kodu manuel kullanılır.</p></form></section>';
  }
  function renderAddresses() {
    var el = $('#addressesPanel'); if (!el) return; var addresses = state.summary.addresses;
    var cards = addresses.length ? '<div class="cs-address-grid">' + addresses.map(function (a) { var recipient = [a.recipient_first_name || a.first_name, a.recipient_last_name || a.last_name].filter(Boolean).join(' '); var location = [a.neighborhood, a.district, a.city].filter(Boolean).join(' / '); return '<article class="cs-address-card"><div class="cs-address-head"><h3>' + escapeHtml(a.title || 'Adres') + '</h3><span>' + escapeHtml(addressTypeLabel(a.address_type || a.type)) + '</span></div><p>' + escapeHtml([a.address_line || a.address, location, a.postal_code || a.postalCode].filter(Boolean).join(', ')) + '</p><small>' + escapeHtml(recipient || 'Alıcı bilgisi') + (a.phone ? ' · ' + escapeHtml(a.phone) : '') + '</small>' + (a.is_default ? '<em class="cs-address-default">Varsayılan</em>' : '') + '<div class="cs-address-actions"><button class="cs-mini-btn" type="button" data-edit-address="' + escapeHtml(a.id) + '">Düzenle</button>' + (!a.is_default ? '<button class="cs-mini-btn" type="button" data-default-address="' + escapeHtml(a.id) + '">Varsayılan Yap</button>' : '') + '<button class="cs-mini-btn" type="button" data-delete-address="' + escapeHtml(a.id) + '">Sil</button></div></article>'; }).join('') + '</div>' : '<div class="cs-empty"><strong>Kayıtlı adresiniz bulunmuyor.</strong><p>Checkout sırasında hızlı kullanım için teslimat ve fatura adresi ekleyebilirsiniz.</p><button class="cs-pill-btn" type="button" data-open-address-modal>Adres Ekle</button></div>';
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Adreslerim</h1><p>Teslimat ve fatura adreslerinizi yönetin.</p></div><button class="cs-pill-btn" type="button" id="addAddressBtn">Yeni Adres Ekle</button></div>' + cards + addressModalHtml();
  }
  function addressTypeLabel(type) { return type === 'billing' ? 'Fatura' : type === 'both' ? 'Teslimat + Fatura' : 'Teslimat'; }
  function addressModalHtml() {
    return '<div class="cs-address-modal" id="addressModal" hidden><div class="cs-address-modal__card"><form id="addressForm"><input type="hidden" name="id"><div class="cs-card-head"><span>ADRES FORMU</span><button type="button" class="cs-heart-btn" id="addressCancelBtn" aria-label="Kapat">×</button></div><div class="cs-form-grid"><label>Adres Başlığı<input name="title" required placeholder="Ev / İş"></label><label>Adres Tipi<select name="address_type"><option value="shipping">Teslimat</option><option value="billing">Fatura</option><option value="both">Teslimat + Fatura</option></select></label><label>Ad<input name="first_name" required></label><label>Soyad<input name="last_name" required></label><label>Telefon<input name="phone" required></label><label>İl<input name="city" required></label><label>İlçe<input name="district" required></label><label>Mahalle<input name="neighborhood"></label><label>Posta Kodu<input name="postal_code" maxlength="5"></label><label class="span-2">Açık Adres<textarea name="address_line" required></textarea></label><label class="cs-check span-2"><input type="checkbox" name="is_default"> Varsayılan adres yap</label></div><div class="cs-form-actions"><button class="cs-pill-btn" type="button" id="addressCancelBtn2">Vazgeç</button><button class="cs-pill-btn cs-pill-btn--dark" type="submit">Adresi Kaydet</button></div></form></div></div>';
  }
  function renderPayments() {
    var el = $('#paymentsPanel'); if (!el) return;
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Ödeme Tercihlerim</h1><p>Kart bilgileriniz COSMOSKIN tarafından saklanmaz.</p></div></div><section class="cs-card"><div class="cs-card-head"><span>ÖDEME GÜVENLİĞİ</span></div><p class="cs-card-intro">Kart bilgileriniz COSMOSKIN tarafından saklanmaz. Havale/EFT ve kart ödeme seçenekleri ödeme adımında güvenli altyapı üzerinden sunulur.</p><div class="cs-payment-method-grid"><article><strong>Kredi/Banka Kartı</strong><span>Güvenli ödeme sağlayıcısı üzerinden</span></article><article><strong>Havale/EFT</strong><span>Sipariş numarası açıklamasıyla</span></article></div></section>';
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
    function checked(name, fallback) { return (comm[name] === undefined ? fallback : Boolean(comm[name])) ? 'checked' : ''; }
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Bildirim Tercihlerim</h1><p>Sipariş, kargo, kampanya, stok, SMS ve rutin bildirim tercihlerinizi yönetin.</p></div><div class="cs-panel-actions"><button class="cs-pill-btn" id="markAllNotificationsBtn" type="button">Bildirimleri Okundu Yap</button><button class="cs-pill-btn cs-pill-btn--dark" id="saveNotificationsBtn" type="button">Tercihleri Kaydet</button></div></div>' +
      '<form class="cs-toggle-grid" id="notificationPrefsForm">' +
      '<label><input name="order_updates" type="checkbox" ' + checked('order_updates', true) + '> <span>Sipariş güncellemeleri</span><small>Ödeme ve sipariş durumları</small></label>' +
      '<label><input name="cargo_updates" type="checkbox" ' + checked('cargo_updates', true) + '> <span>Kargo güncellemeleri</span><small>Takip ve teslimat bilgileri</small></label>' +
      '<label><input name="campaign_emails" type="checkbox" ' + checked('campaign_emails', Boolean(comm.marketing_email_opt_in)) + '> <span>Kampanya e-postaları</span><small>İndirim ve ürün duyuruları</small></label>' +
      '<label><input name="sms_notifications" type="checkbox" ' + checked('sms_notifications', Boolean(comm.marketing_sms_opt_in || comm.sms_notifications)) + '> <span>SMS bildirimleri</span><small>Sipariş veya izin verilen pazarlama SMS tercihleri</small></label>' +
      '<label><input name="stock_notifications" type="checkbox" ' + checked('stock_notifications', Boolean(comm.stock_alert_opt_in)) + '> <span>Stok bildirimleri</span><small>Favori ürün stok uyarıları</small></label>' +
      '<label><input name="routine_reminders" type="checkbox" ' + checked('routine_reminders', Boolean(comm.routine_reminder_opt_in)) + '> <span>Rutin hatırlatmaları</span><small>Bakım rutinine dair e-posta notları</small></label>' +
      '<label><input name="newsletter" type="checkbox" ' + checked('newsletter', Boolean(comm.newsletter_opt_in)) + '> <span>COSMOSKIN Journal</span><small>Bakım notları ve seçki e-postaları</small></label>' +
      '</form><section class="cs-content-help-card"><div><span class="cs-overline">JOURNAL</span><h3>' + (journalActive ? 'Journal aboneliğiniz aktif.' : 'Journal aboneliğiniz aktif değil.') + '</h3><p>Abonelik tercihiniz güvenli şekilde kaydedilir. İşlem tamamlanamazsa sizi bilgilendiririz.</p></div>' + (journalActive ? '<button class="cs-pill-btn" data-newsletter-unsubscribe type="button">Abonelikten Çık</button>' : '<button class="cs-pill-btn" data-save-notifications type="button">Tercihleri Kaydet</button>') + '</section>' + notificationListHtml();
  }
  function renderSecurity() {
    var el = $('#securityPanel'); if (!el) return; var checklist = securityChecklist().map(securityRow).join('');
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Güvenlik</h1><p>Oturum, şifre ve hesap/veri taleplerinizi güvenli şekilde yönetin.</p></div></div>' +
      '<section class="cs-security-grid"><article class="cs-card"><div class="cs-card-head"><span>HESAP DURUMU</span></div><ul class="cs-security-list">' + checklist + '</ul></article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>ŞİFRE</span></div><form class="cs-form cs-form-compact" id="passwordForm"><label class="full"><span>Yeni Şifre</span><input class="cs-input" name="password" type="password" autocomplete="new-password"></label><label class="full"><span>Yeni Şifre Tekrar</span><input class="cs-input" name="password_confirm" type="password" autocomplete="new-password"></label><p class="cs-field-help full">Şifre en az 8 karakter olmalıdır. Başarı mesajı yalnızca Supabase auth işlemi başarılı olursa gösterilir.</p><button class="cs-pill-btn cs-pill-btn--dark full" type="submit">Şifreyi Güncelle</button></form></article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>AKTİF OTURUMLAR</span></div><p class="cs-card-intro">Aktif oturum yönetimi güvenli oturum altyapısı üzerinden sağlanır. Ayrıntılı cihaz listesi şu anda sunulmamaktadır; çıkış işlemini bu ekrandan yapabilirsiniz.</p><button class="cs-mini-btn" id="logoutInlineBtn" type="button">Bu Oturumdan Çıkış Yap</button></article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>İKİ ADIMLI DOĞRULAMA</span><span class="cs-status-pill muted">Yakında</span></div><p class="cs-card-intro">Bu özellik henüz aktif değildir; çalışır gibi görünen bir anahtar gösterilmez.</p></article>' +
      '<article class="cs-card"><div class="cs-card-head"><span>HESAP / VERİ TALEBİ</span></div><p class="cs-card-intro">Hesap kapatma veya KVKK veri talepleri için destek talebi oluşturabilirsiniz.</p><button class="cs-mini-btn dark" type="button" data-tab-link="support">Destek Talebi Oluştur</button></article></section>';
  }
  function renderSupport() {
    var el = $('#supportPanel'); if (!el) return; var tickets = asArray(state.summary.support_requests); var orders = asArray(state.summary.orders);
    var ticketList = tickets.length ? '<div class="cs-order-list">' + tickets.map(function (t) { return '<article class="cs-card"><div class="cs-card-head"><span>' + escapeHtml(supportCategoryLabel(t.category || 'Destek')) + '</span><span class="cs-status-pill">' + escapeHtml(t.status || 'açık') + '</span></div><h3>' + escapeHtml(t.subject || 'Destek talebi') + '</h3><p>' + escapeHtml(t.message || '') + '</p><small>' + escapeHtml(formatDate(t.created_at, true)) + '</small></article>'; }).join('') + '</div>' : emptyState('Henüz destek talebiniz bulunmuyor.', 'Sipariş, ürün seçimi, kargo, ödeme veya hesap konularında destek talebi oluşturabilirsiniz. Resmi iade süreci için İade Taleplerim alanını kullanın.', null);
    var orderOptions = '<option value="">Sipariş seçmek istemiyorum</option>' + orders.map(function (o) { return '<option value="' + escapeHtml(o.id || '') + '">' + escapeHtml(safeOrderNumber(o)) + '</option>'; }).join('');
    el.innerHTML = '<div class="cs-tab-title"><div><h1>Destek Taleplerim</h1><p>Destek Taleplerim, sipariş, ödeme, kargo, ürün bilgisi veya hesap konularındaki genel destek kayıtlarınızı gösterir. Teslim edilmiş ürünler için resmi iade süreci başlatmak istiyorsanız İade Taleplerim alanını kullanın.</p></div></div>' +
      '<article class="cs-card"><div class="cs-card-head"><span>YENİ DESTEK TALEBİ</span></div><form class="cs-form cs-form-compact" id="supportRequestForm"><label><span>Kategori</span><select class="cs-input" name="category" data-support-category><option value="order">Sipariş desteği</option><option value="product_selection">Ürün seçimi yönlendirmesi</option><option value="shipping">Kargo/teslimat</option><option value="return_request">İade süreci yönlendirmesi</option><option value="payment">Ödeme</option><option value="account">Hesap</option><option value="routine">Rutin Merkezi</option><option value="other">Diğer</option></select></label><label><span>Sipariş</span><select class="cs-input" name="order_id">' + orderOptions + '</select></label><div class="cs-content-help-card full" data-return-support-hint hidden><div><span class="cs-overline">İADE SÜRECİ</span><p>Bu konu resmi iade süreciyle ilgiliyse teslim edilmiş siparişiniz için İade Taleplerim alanından iade talebi oluşturabilirsiniz.</p></div><a class="cs-mini-btn dark" data-tab-link="returns" href="/account/profile.html?tab=returns&createReturn=1">İade Talebi Oluştur</a></div><label class="full"><span>Konu</span><input class="cs-input" name="subject" maxlength="140" required></label><label class="full"><span>Mesaj</span><textarea class="cs-input" name="message" rows="4" required></textarea></label><button class="cs-pill-btn cs-pill-btn--dark full" type="submit">Destek Talebi Oluştur</button></form></article>' + ticketList;
  }
  function supportCategoryLabel(cat) { return ({ order:'Sipariş', product_selection:'Ürün Seçimi', shipping:'Kargo/Teslimat', return_request:'İade Süreci', payment:'Ödeme', account:'Hesap', routine:'Rutin Merkezi', other:'Diğer' })[cat] || cat; }

  function switchTab(tab, push) {
    tab = normalizeTab(tab);
    if (!document.querySelector('[data-panel="' + tab + '"]')) tab = 'overview';
    state.activeTab = tab;
    $$('#accountNav [data-tab]').forEach(function (a) { a.classList.toggle('is-active', a.dataset.tab === tab); });
    $$('.cs-panel').forEach(function (p) { p.classList.toggle('is-active', p.dataset.panel === tab); });
    var url = new URL(window.location.href); url.searchParams.set('tab', tab);
    if (push) history.pushState({ tab: tab }, '', url.pathname + url.search); else history.replaceState({ tab: tab }, '', url.pathname + url.search);
    var h = $('[data-panel="' + tab + '"] h1,[data-panel="' + tab + '"] h2'); if (h) { h.setAttribute('tabindex', '-1'); setTimeout(function(){ h.focus({ preventScroll: true }); }, 0); }
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
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab-link]'); if (tab) { e.preventDefault(); switchTab(tab.dataset.tabLink, true); }
      var add = e.target.closest('[data-add-product-cart]'); if (add) { addToCart(getProductByHandle(add.dataset.addProductCart)); }
      var fav = e.target.closest('[data-add-favorite]'); if (fav) { addFavorite(fav.dataset.addFavorite).catch(handleError); }
      var remFav = e.target.closest('[data-remove-favorite]'); if (remFav) { removeFavorite(remFav.dataset.removeFavorite, remFav.dataset.removeFavoriteSlug).catch(handleError); }
      var couponFilter = e.target.closest('[data-coupon-filter]'); if (couponFilter) { e.preventDefault(); var tabs = couponFilter.closest('[data-coupon-tabs]'); if (tabs) { $$('.cs-tabstrip button', tabs).forEach(function (b) { b.classList.toggle('is-active', b === couponFilter); }); $$('[data-coupon-panel]', tabs).forEach(function (panel) { panel.hidden = panel.dataset.couponPanel !== couponFilter.dataset.couponFilter; }); } }
      var coupon = e.target.closest('[data-copy-coupon]'); if (coupon) { copyCoupon(coupon.dataset.copyCoupon); }
      var routineCart = e.target.closest('[data-add-routine-cart]'); if (routineCart) { e.preventDefault(); var products = recommendedProducts(4); if (!products.length) return showToast('Sepete eklenebilecek profil önerisi bulunmuyor.', 'warning'); products.forEach(addToCart); }
      var savedRoutineCart = e.target.closest('[data-add-saved-routine-cart]'); if (savedRoutineCart) { e.preventDefault(); addSavedRoutineToCart(savedRoutineCart.dataset.addSavedRoutineCart); }
      var repeat = e.target.closest('[data-repeat-order]'); if (repeat) { repeatOrder(repeat.dataset.repeatOrder); }
      var addAddress = e.target.closest('#addAddressBtn,[data-open-address-modal]'); if (addAddress) { e.preventDefault(); openAddressModal(); }
      var editAddress = e.target.closest('[data-edit-address]'); if (editAddress) { e.preventDefault(); openAddressModal(editAddress.dataset.editAddress); }
      var delAddress = e.target.closest('[data-delete-address]'); if (delAddress) { e.preventDefault(); deleteAddress(delAddress.dataset.deleteAddress).catch(handleError); }
      var defAddress = e.target.closest('[data-default-address]'); if (defAddress) { e.preventDefault(); setDefaultAddress(defAddress.dataset.defaultAddress).catch(handleError); }
      if (e.target.closest('#addressCancelBtn') || e.target.closest('#addressCancelBtn2') || e.target.closest('#cancelAddressBtn') || e.target.closest('#closeAddressModal')) { e.preventDefault(); closeAddressModal(); }
      if (e.target.matches('#saveProfileBtn')) saveProfile().catch(handleError);
      if (e.target.matches('#saveSkinBtn')) saveSkin().catch(handleError);
      if (e.target.matches('#saveNotificationsBtn') || e.target.closest('[data-save-notifications]')) saveNotifications().catch(handleError);
      if (e.target.matches('#markAllNotificationsBtn')) markAllNotificationsRead().catch(handleError);
      if (e.target.matches('#logoutBtn') || e.target.matches('#logoutInlineBtn')) logout();
      if (e.target.closest('[data-newsletter-unsubscribe]')) { e.preventDefault(); unsubscribeJournal().catch(handleError); }
      var openReturn = e.target.closest('[data-open-return-form]'); if (openReturn) { e.preventDefault(); var panel = $('#returnsPanel'); if (panel) panel.dataset.returnFormOpen = 'true'; renderReturns(); }
      var closeReturn = e.target.closest('[data-close-return-form]'); if (closeReturn) { e.preventDefault(); var rpanel = $('#returnsPanel'); if (rpanel) rpanel.dataset.returnFormOpen = 'false'; renderReturns(); }
      var clubTier = e.target.closest('[data-club-tier]'); if (clubTier) { e.preventDefault(); var key = clubTier.dataset.clubTier; $$('[data-club-tier-detail]').forEach(function(panel){ panel.hidden = panel.dataset.clubTierDetail !== key || !panel.hidden; }); }
      if (e.target.matches('#addressModal')) { e.preventDefault(); closeAddressModal(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAddressModal(); });
    document.addEventListener('change', function(e){ var sel = e.target.closest('[data-return-order-select]'); if (sel) { var order = state.summary.orders.find(function(o){ return String(o.id) === String(sel.value); }); var target = $('[data-return-order-items]'); if (target && order) target.innerHTML = orderReturnItemsHtml(order); } var cat = e.target.closest('[data-support-category]'); if (cat) { var hint = $('[data-return-support-hint]'); if (hint) hint.hidden = cat.value !== 'return_request'; } });
    document.addEventListener('submit', function (e) {
      if (e.target.matches('#passwordForm')) { e.preventDefault(); updatePassword(e.target).catch(handleError); }
      if (e.target.matches('#addressForm')) { e.preventDefault(); saveAddress(e.target).catch(handleError); }
      if (e.target.matches('#supportRequestForm')) { e.preventDefault(); createSupportRequest(e.target).catch(handleError); }
      if (e.target.matches('#returnRequestForm')) { e.preventDefault(); createReturnRequest(e.target).catch(handleError); }
    });
    window.addEventListener('popstate', function () { switchTab(new URL(window.location.href).searchParams.get('tab') || 'overview', false); });
  }

  function addToCart(product) {
    product = normalizeProduct(product);
    if (!product) return showToast('Ürün bilgisi bulunamadı.', 'warning');
    if (!stockInfo(product).sellable) return showToast('Bu ürün için stok bilgisi doğrulanmadan sepete eklenemez.', 'warning');
    var cart = []; try { cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'); } catch (_) {}
    if (!Array.isArray(cart)) cart = [];
    var existing = cart.find(function (i) { return i.slug === product.product_slug || i.id === product.product_slug; });
    if (existing) existing.qty = Number(existing.qty || 1) + 1; else cart.push({ id: product.product_slug, slug: product.product_slug, name: product.product_name, brand: product.brand, price: product.price, image: product.image, url: product.url, qty: 1 });
    localStorage.setItem('cosmoskin_cart', JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: cart } }));
    showToast('Ürün sepetinize eklendi.');
  }
  async function addFavorite(slug) { if (!slug) return; await apiFetch('/account/favorites', { method:'POST', body:{ product_slug: slug } }); await loadSummary(); switchTab(state.activeTab, false); showToast('Ürün favorilerinize eklendi.'); }
  async function removeFavorite(id, slug) { if (!id && !slug) return; await apiFetch('/account/favorites', { method:'DELETE', body:{ id: id, product_slug: slug } }); await loadSummary(); switchTab(state.activeTab, false); showToast('Ürün favorilerinizden çıkarıldı.'); }
  function repeatOrder(orderId) { var order = state.summary.orders.find(function (o) { return String(o.id) === String(orderId); }); if (!order) return showToast('Sipariş bilgisi bulunamadı.', 'warning'); orderItems(order).forEach(function (item) { var p = getProductByHandle(item.product_slug || item.product_id) || normalizeProduct(item); if (p) addToCart(p); }); }
  function addSavedRoutineToCart(id) { var r = state.summary.routine_results.find(function (item) { return String(item.id || '') === String(id || ''); }); var products = asArray(r?.recommended_products || r?.products || r?.result?.recommended_products || r?.result?.products).map(function (p) { return getProductByHandle(p.product_slug || p.slug || p.id) || normalizeProduct(p); }).filter(Boolean); if (!products.length) return showToast('Bu rutinde sepete eklenebilecek ürün bulunamadı.', 'warning'); products.forEach(addToCart); }
  function copyCoupon(code) { if (!code) return; (navigator.clipboard?.writeText(code) || Promise.reject()).then(function () { showToast('Kupon kodu kopyalandı.'); }).catch(function () { window.prompt('Kupon kodunu kopyalayın:', code); }); }
  function openAddressModal(addressId) { var modal = $('#addressModal'); var form = $('#addressForm'); if (!modal || !form) return; form.reset(); form.elements.id.value = ''; var addr = state.summary.addresses.find(function (a) { return String(a.id) === String(addressId); }); if (addr) { form.elements.id.value = addr.id || ''; form.elements.title.value = addr.title || ''; form.elements.address_type.value = addr.address_type || addr.type || 'shipping'; form.elements.first_name.value = addr.recipient_first_name || addr.first_name || ''; form.elements.last_name.value = addr.recipient_last_name || addr.last_name || ''; form.elements.phone.value = addr.phone || ''; form.elements.city.value = addr.city || ''; form.elements.district.value = addr.district || ''; form.elements.neighborhood.value = addr.neighborhood || ''; form.elements.postal_code.value = addr.postal_code || addr.postalCode || ''; form.elements.address_line.value = addr.address_line || addr.address || ''; form.elements.is_default.checked = Boolean(addr.is_default); } modal.hidden = false; }
  function closeAddressModal() { var modal = $('#addressModal'); if (modal) modal.hidden = true; }
  async function saveAddress(form) { var data = new FormData(form); var payload = { id:data.get('id') || undefined, title:data.get('title'), address_type:data.get('address_type'), first_name:data.get('first_name'), last_name:data.get('last_name'), phone:data.get('phone'), city:data.get('city'), district:data.get('district'), neighborhood:data.get('neighborhood'), postal_code:data.get('postal_code'), address_line:data.get('address_line'), is_default:Boolean(data.get('is_default')) }; await apiFetch('/account/addresses', { method:payload.id ? 'PATCH' : 'POST', body:payload }); closeAddressModal(); await loadSummary(); switchTab('addresses', false); showToast('Adres kaydedildi.'); }
  async function deleteAddress(id) { if (!id || !window.confirm('Adres silinsin mi?')) return; await apiFetch('/account/addresses', { method:'DELETE', body:{ id:id } }); await loadSummary(); switchTab('addresses', false); showToast('Adres silindi.'); }
  async function setDefaultAddress(id) { var addr = state.summary.addresses.find(function (a) { return String(a.id) === String(id); }); if (!addr) return; await apiFetch('/account/addresses', { method:'PATCH', body:Object.assign({}, addr, { id:id, is_default:true }) }); await loadSummary(); switchTab('addresses', false); showToast('Varsayılan adres güncellendi.'); }
  async function saveSkin() { var form = $('#skinForm'); if (!form) return; var concerns = $$('input[name="skin_concerns"]:checked', form).map(function (i) { return i.value; }); var payload = { skin_type:form.elements.skin_type.value, sensitivity:form.elements.skin_sensitivity.value, skin_sensitivity:form.elements.skin_sensitivity.value, primary_goal:form.elements.routine_goal.value, routine_goal:form.elements.routine_goal.value, secondary_goals:concerns.filter(function (item) { return item !== form.elements.routine_goal.value; }), skin_concerns:concerns, routine_style:form.elements.routine_style?.value || '', source_channel:'account-skin-profile', updated_at:new Date().toISOString(), skin_profile_updated_at:new Date().toISOString() }; if (window.COSMOSKINRoutineData && typeof window.COSMOSKINRoutineData.normalizeSkinProfile === 'function') payload = Object.assign(payload, window.COSMOSKINRoutineData.normalizeSkinProfile(payload, { source:'account-skin-profile' })); await apiFetch('/account/skin-profile', { method:'POST', body:payload }); await loadSummary(); switchTab('skin-profile', false); showToast('Cilt profiliniz güncellendi.'); }
  async function saveProfile() { var f = $('#profileForm'); if (!f) return; var payload = { first_name:(f.elements.first_name?.value || '').trim(), last_name:(f.elements.last_name?.value || '').trim(), phone:(f.elements.phone?.value || '').trim(), birthday:f.elements.birthday?.value || undefined }; await apiFetch('/account/profile', { method:'PATCH', body:payload }); await loadSummary(); switchTab('profile', false); showToast('Hesap bilgileriniz güncellendi.'); }
  function checkedFormValue(form, names, fallback) { for (var i = 0; i < names.length; i += 1) { var input = form.elements[names[i]]; if (input) return Boolean(input.checked); } return Boolean(fallback); }
  async function saveNotifications() {
    var f = $('#notificationPrefsForm'); if (!f) return;
    var payload = {
      order_updates: checkedFormValue(f, ['order_updates','orderUpdates'], true),
      cargo_updates: checkedFormValue(f, ['cargo_updates','cargoUpdates'], true),
      campaign_emails: checkedFormValue(f, ['campaign_emails','campaignEmails'], false),
      stock_notifications: checkedFormValue(f, ['stock_notifications','stockNotifications','restockAlerts'], false),
      routine_reminders: checkedFormValue(f, ['routine_reminders','routineReminders'], false),
      newsletter: checkedFormValue(f, ['newsletter','newsletter_opt_in'], false),
      sms_notifications: checkedFormValue(f, ['sms_notifications','smsNotifications'], false)
    };
    await apiFetch('/account/notifications', { method:'PATCH', body:{ preferences:payload } });
    await loadSummary(); switchTab('notifications', false); showToast('Bildirim tercihleriniz güncellendi.');
  }
  async function markAllNotificationsRead() { await apiFetch('/account/notifications', { method:'PATCH', body:{ mark_all_read:true } }); await loadSummary(); switchTab('notifications', false); showToast('Bildirimler okundu olarak işaretlendi.'); }
  async function unsubscribeJournal() { var current = Object.assign({}, safeObject(state.summary?.user?.communication), safeObject(state.summary?.notification_preferences)); var payload = { order_updates:current.order_updates !== false, cargo_updates:current.cargo_updates !== false, campaign_emails:Boolean(current.campaign_emails || current.marketing_email_opt_in), stock_notifications:Boolean(current.stock_notifications || current.stock_alert_opt_in), routine_reminders:Boolean(current.routine_reminders || current.routine_reminder_opt_in), sms_notifications:Boolean(current.sms_notifications || current.marketing_sms_opt_in), newsletter:false }; await apiFetch('/account/notifications', { method:'PATCH', body:{ preferences:payload } }); await loadSummary(); switchTab(state.activeTab, false); showToast('COSMOSKIN Journal aboneliğiniz kapatıldı.'); }
  async function updatePassword(form) { var p = form.elements.password.value; var p2 = form.elements.password_confirm.value; if (p !== p2) return showToast('Şifreler eşleşmiyor.', 'warning'); if (p.length < 8) return showToast('Şifre en az 8 karakter olmalı.', 'warning'); if (!state.client) return showToast('Şifre güncelleme için oturum gerekli.', 'warning'); var res = await state.client.auth.updateUser({ password:p }); if (res.error) throw res.error; form.reset(); showToast('Şifreniz güncellendi.'); }
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
    await loadSummary();
    var panel = $('#returnsPanel'); if (panel) panel.dataset.returnFormOpen = 'false';
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
  async function init() {
    try {
      ensureAccountDom();
      bindEvents();
      await (window.COSMOSKIN_PRODUCTS_READY || Promise.resolve());
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
