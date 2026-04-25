(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const cfg = window.COSMOSKIN_CONFIG || {};
  const VAT = Number(cfg.vatRate ?? 0.20);
  const FREE_SHIPPING = Number(cfg.freeShippingThreshold ?? 2500);
  const SHIPPING_FEE = Number(cfg.shippingFee ?? 119);
  const state = {
    cart: JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'),
    favorites: [],
    consent: JSON.parse(localStorage.getItem('cosmoskin_consent') || 'null')
  };
  const FAVORITES_KEY = 'cosmoskin_favorites';
  const LEGACY_FAVORITES_KEY = 'cosmoskin_favorites_v1';
  let favoriteAccountSyncReady = false;

  function readFavoriteStorage() {
    try {
      const currentRaw = localStorage.getItem(FAVORITES_KEY);
      const legacyRaw = localStorage.getItem(LEGACY_FAVORITES_KEY);
      let current = [];
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw);
        if (Array.isArray(parsed)) current = parsed;
        else if (parsed && typeof parsed === 'object') current = Object.values(parsed);
      }
      if ((!current || !current.length) && legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) current = legacyParsed;
        else if (legacyParsed && typeof legacyParsed === 'object') current = Object.values(legacyParsed);
      }
      return Array.isArray(current) ? current : [];
    } catch (error) {
      return [];
    }
  }

  state.favorites = readFavoriteStorage();

  function showFavoriteToast(message) {
    if (!message) return;
    let toast = document.querySelector('.favorite-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'favorite-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showFavoriteToast._timer);
    showFavoriteToast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }


  const backdrop = $('#backdrop');
  const cartDrawer = $('#cartDrawer');
  const accountDrawer = $('#accountDrawer');
  const cookieBanner = $('#cookieBanner');
  const prefModal = $('#cookiePreferences');
  const legalModal = $('#legalModal');
  const progress = $('#progress');
  const mobileNav = $('#mobileNav');
  let megaTimer;

  function closeAllMegaMenus(exceptWrap = null) {
    ['.categories-wrap', '.brands-wrap'].forEach((selector) => {
      const wrap = $(selector);
      if (!wrap || wrap === exceptWrap) return;
      wrap.classList.remove('open');
    });
    [
      ['.categories-wrap', '.categories-trigger'],
      ['.brands-wrap', '.brands-trigger']
    ].forEach(([wrapSelector, triggerSelector]) => {
      const wrap = $(wrapSelector);
      const trigger = wrap?.querySelector(triggerSelector);
      if (!trigger) return;
      trigger.setAttribute('aria-expanded', wrap?.classList.contains('open') ? 'true' : 'false');
    });
  }

  function fmt(n) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0
    }).format(n);
  }

  function totals() {
    const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const vat = Math.round(subtotal * VAT / (1 + VAT));
    const shipping = subtotal >= FREE_SHIPPING || subtotal === 0 ? 0 : SHIPPING_FEE;
    return { subtotal, vat, shipping, total: subtotal + shipping };
  }

  function openDrawer(drawer) {
    if (!drawer) return;
    drawer.classList.add('open');
    backdrop?.classList.add('show');
  }

  function closeDrawers() {
    [cartDrawer, accountDrawer].forEach((drawer) => drawer?.classList.remove('open'));
    if (!$('.modal.show')) backdrop?.classList.remove('show');
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('show');
    backdrop?.classList.add('show');
  }

  function closeModals() {
    [prefModal, legalModal, $('#accountModal')].forEach((modal) => modal?.classList.remove('show'));
    if (!(cartDrawer?.classList.contains('open')) && !(accountDrawer?.classList.contains('open'))) {
      backdrop?.classList.remove('show');
    }
  }

  backdrop?.addEventListener('click', () => {
    closeDrawers();
    closeModals();
    closeAllMegaMenus();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  });

  $$('.close-any').forEach((btn) => btn.addEventListener('click', () => {
    closeDrawers();
    closeModals();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  }));

  $('#cartBtn')?.addEventListener('click', () => openDrawer(cartDrawer));
  $('#accountBtn')?.addEventListener('click', async () => {
    try {
      const supabaseClient = window.cosmoskinSupabase;
      if (supabaseClient) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          window.location.href = '/account/profile.html';
          return;
        }
      }
    } catch (error) {
      console.warn('account redirect check failed:', error);
    }
    openDrawer(accountDrawer);
  });

  document.addEventListener('cosmoskin:open-auth', (event) => {
    document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: event.detail || {} }));
  });

  $('#mobileToggle')?.addEventListener('click', () => {
    const isOpen = mobileNav?.classList.toggle('open');
    backdrop?.classList.toggle('show', !!isOpen);
    document.body.classList.toggle('modal-open', !!isOpen);
  });

  $$('.open-legal').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(legalModal);
  }));

  $('#openCookiePrefs')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(prefModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawers();
      closeModals();
      closeAllMegaMenus();
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  });

  function bindMegaMenu(wrapSelector, triggerSelector) {
    const wrap = $(wrapSelector);
    if (!wrap) return;
    const trigger = wrap.querySelector(triggerSelector);
    const openMenu = () => {
      clearTimeout(megaTimer);
      closeAllMegaMenus(wrap);
      wrap.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };
    const closeMenu = () => {
      clearTimeout(megaTimer);
      megaTimer = setTimeout(() => {
        wrap.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }, 140);
    };
    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !wrap.classList.contains('open');
      closeAllMegaMenus(willOpen ? wrap : null);
      wrap.classList.toggle('open', willOpen);
      trigger?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    wrap.addEventListener('mouseenter', () => window.innerWidth > 1150 && openMenu());
    wrap.addEventListener('mouseleave', () => window.innerWidth > 1150 && closeMenu());
  }

  bindMegaMenu('.categories-wrap', '.categories-trigger');
  bindMegaMenu('.brands-wrap', '.brands-trigger');


  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('/') || href.startsWith(window.location.origin)) {
      closeAllMegaMenus();
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
      if (!cartDrawer?.classList.contains('open') && !accountDrawer?.classList.contains('open') && !document.querySelector('.modal.show')) {
        backdrop?.classList.remove('show');
      }
    }
  });

  // Ürün verileri products-data.js'den; kategori/marka/içerik sabit listesiyle birleştirilir
  const SEARCH_INDEX_STATIC = [
    { label: 'Temizleyiciler', type: 'Kategori', url: '/collections/cleanse.html', keywords: 'cleanser jel kopuk yag bazli makyaj temizleyici arindirici', meta: 'Jel, köpük ve çift temizleme', badge: 'Kategori' },
    { label: 'Tonik & Essence', type: 'Kategori', url: '/collections/hydrate.html', keywords: 'tonik essence esans nem katmanlari hydrate', meta: 'Hafif nem ve hazırlık katmanları', badge: 'Kategori' },
    { label: 'Serum & Ampul', type: 'Kategori', url: '/collections/treat.html', keywords: 'serum ampul hedef bakim leke isilti', meta: 'Leke, ton ve ışıltı odaklı serumlar', badge: 'Kategori' },
    { label: 'Nemlendiriciler', type: 'Kategori', url: '/collections/care.html', keywords: 'nemlendirici krem bariyer goz cevresi care', meta: 'Krem ve destek bakım ürünleri', badge: 'Kategori' },
    { label: 'Güneş Koruyucular', type: 'Kategori', url: '/collections/protect.html', keywords: 'gunes bakimi gunes kremi spf sun sunscreen protect', meta: 'Şehir kullanımına uygun SPF seçkileri', badge: 'Kategori' },
    { label: 'Maskeler', type: 'Kategori', url: '/collections/masks.html', keywords: 'yuz maskesi sheet mask maske care', meta: 'Maskeler ve destek bakım editleri', badge: 'Kategori' },
    { label: 'Kuru Cilt', type: 'Cilt Tipi', url: '/collections/hydrate.html', keywords: 'dry skin kuru cilt nemsizlik barrier', meta: 'Nem ve konfor odaklı seçkiler', badge: 'Cilt Tipi' },
    { label: 'Yağlı Cilt', type: 'Cilt Tipi', url: '/collections/protect.html', keywords: 'oily skin yagli cilt sebum parlama hafif spf', meta: 'Daha hafif ve dengeli seçimler', badge: 'Cilt Tipi' },
    { label: 'Hassas Cilt', type: 'Cilt Tipi', url: '/collections/care.html', keywords: 'sensitive skin hassas cilt centella bariyer', meta: 'Yatıştırıcı ve bariyer dostu bakım', badge: 'Cilt Tipi' },
    { label: 'Karma Cilt', type: 'Cilt Tipi', url: '/collections/routine.html', keywords: 'combination skin karma cilt denge rutin', meta: 'Günlük denge için sabah-akşam akışları', badge: 'Cilt Tipi' },
    { label: 'Nemsizlik', type: 'Cilt Problemi', url: '/collections/hydrate.html', keywords: 'dehydration nemsizlik hyaluronic acid essence dolgunluk', meta: 'Dolgun görünüm ve su tutma desteği', badge: 'Cilt Problemi' },
    { label: 'Leke Görünümü', type: 'Cilt Problemi', url: '/collections/treat.html', keywords: 'tone leke gorunumu vitamin c niacinamide serum brightening', meta: 'Daha eşit ton görünümü için serumlar', badge: 'Cilt Problemi' },
    { label: 'Akne Eğilimi', type: 'Cilt Problemi', url: '/collections/blemish.html', keywords: 'blemish acne akne egilimi salicylic acid pore sivilce gozenek', meta: 'Gözenek ve akne eğilimine uygun bakım', badge: 'Cilt Problemi' },
    { label: 'Niacinamide', type: 'İçerik', url: '/collections/treat.html', keywords: 'niacinamide tone glow leke ingredient niasinamid', meta: 'Ton eşitliği ve görünüm dengesi', badge: 'İçerik' },
    { label: 'Hyaluronik Asit', type: 'İçerik', url: '/collections/hydrate.html', keywords: 'hyaluronic acid hyaluronik nem ingredient dolgunluk', meta: 'Nem ve dolgun görünüm desteği', badge: 'İçerik' },
    { label: 'Centella Asiatica', type: 'İçerik', url: '/collections/care.html', keywords: 'centella asiatica cica hassasiyet ingredient yatistirici', meta: 'Yatıştırıcı ve bariyer dostu bakım', badge: 'İçerik' },
    { label: 'Salicylic Acid', type: 'İçerik', url: '/collections/blemish.html', keywords: 'salicylic acid bha akne gozenek ingredient bha asit', meta: 'Akne eğilimi ve gözenek desteği', badge: 'İçerik' },
    { label: 'Ceramide', type: 'İçerik', url: '/collections/care.html', keywords: 'ceramide seramid bariyer kuru hassas ingredient', meta: 'Bariyer güçlendirici ve nem koruyucu', badge: 'İçerik' },
    { label: 'Vitamin C', type: 'İçerik', url: '/collections/treat.html', keywords: 'vitamin c c vitamini leke brightening isilti ingredient', meta: 'Işıltı ve leke görünümü için', badge: 'İçerik' },
    { label: 'Anua', type: 'Marka', url: '/collections/anua.html', keywords: 'marka anua heartleaf', meta: 'Heartleaf ile hassas ve yatıştırıcı bakım', badge: 'Marka' },
    { label: 'COSRX', type: 'Marka', url: '/collections/cosrx.html', keywords: 'marka cosrx snail essence', meta: 'Essence ve hedef bakım ikonları', badge: 'Marka' },
    { label: 'Beauty of Joseon', type: 'Marka', url: '/collections/beauty-of-joseon.html', keywords: 'marka beauty of joseon boj', meta: 'Glow ve hafif SPF seçkileri', badge: 'Marka' },
    { label: 'Round Lab', type: 'Marka', url: '/collections/round-lab.html', keywords: 'marka round lab dokdo', meta: 'Nazik temizleme ve günlük denge', badge: 'Marka' },
    { label: 'Torriden', type: 'Marka', url: '/collections/torriden.html', keywords: 'marka torriden dive', meta: 'Nem odaklı serum ve SPF', badge: 'Marka' },
    { label: 'SKIN1004', type: 'Marka', url: '/collections/skin1004.html', keywords: 'marka skin1004 centella madagascar', meta: 'Centella odaklı yatıştırıcı bakım', badge: 'Marka' },
    { label: 'By Wishtrend', type: 'Marka', url: '/collections/by-wishtrend.html', keywords: 'marka by wishtrend wishtrend vitamin', meta: 'Vitamin C ve aktif içerik odaklı seçki', badge: 'Marka' },
    { label: 'Dr. Jart+', type: 'Marka', url: '/collections/dr-jart.html', keywords: 'marka dr jart ceramidin ceramide', meta: 'Seramid ve bariyer odaklı bakım', badge: 'Marka' },
    { label: 'Goodal', type: 'Marka', url: '/collections/goodal.html', keywords: 'marka goodal green tangerine vitamin c mandalin', meta: 'Yeşil mandalin Vitamin C odağı', badge: 'Marka' },
    { label: "I'm From", type: 'Marka', url: '/collections/im-from.html', keywords: 'marka im from rice toner pirinc', meta: 'Pirinç ve doğal içerikli K-beauty', badge: 'Marka' },
    { label: 'Innisfree', type: 'Marka', url: '/collections/innisfree.html', keywords: 'marka innisfree jeju volcanic', meta: 'Jeju kaynaklı doğal cilt bakımı', badge: 'Marka' },
    { label: 'Isntree', type: 'Marka', url: '/collections/isntree.html', keywords: 'marka isntree hyaluronic sun', meta: 'Hyaluronik asit odaklı bakım', badge: 'Marka' },
    { label: 'Laneige', type: 'Marka', url: '/collections/laneige.html', keywords: 'marka laneige water sleeping mask', meta: 'Su bazlı nem teknolojisi', badge: 'Marka' },
    { label: 'Medicube', type: 'Marka', url: '/collections/medicube.html', keywords: 'marka medicube zero pore pad', meta: 'Gözenek ve akne odaklı bakım', badge: 'Marka' },
    { label: 'Mediheal', type: 'Marka', url: '/collections/mediheal.html', keywords: 'marka mediheal sheet mask nmf aquaring', meta: 'Sheet mask ve nem yoğunlaşması', badge: 'Marka' },
    { label: 'Some By Mi', type: 'Marka', url: '/collections/some-by-mi.html', keywords: 'marka some by mi aha bha miracle', meta: 'AHA BHA Miracle serisi', badge: 'Marka' },
    { label: 'Rutinler', type: 'Sayfa', url: '/collections/routine.html', keywords: 'rutinler routine cilt bakim rutini sabah aksam', meta: 'Hazır sabah-akşam akışları', badge: 'Sayfa' },
    { label: 'Destek Merkezi', type: 'Sayfa', url: '/contact.html', keywords: 'destek merkez iletisim yardim partnership', meta: 'İletişim ve iş ortaklığı formları', badge: 'Sayfa' }
  ];

  // Tüm ürünleri products-data.js'den al, yoksa boş dizi kullan
  const _productEntries = (window.COSMOSKIN_SEARCH_PRODUCTS || []);
  const SEARCH_INDEX = _productEntries.concat(SEARCH_INDEX_STATIC);

  function normalizeSearchValue(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSearchMatches(query) {
    const normalized = normalizeSearchValue(query);
    if (!normalized) return [];
    return SEARCH_INDEX.map((item) => {
      const haystack = normalizeSearchValue(`${item.label} ${item.type} ${item.keywords || ''}`);
      let score = 0;
      if (normalizeSearchValue(item.label) === normalized) score += 120;
      if (normalizeSearchValue(item.label).startsWith(normalized)) score += 80;
      if (haystack.includes(normalized)) score += 42;
      normalized.split(' ').forEach((token) => {
        if (!token) return;
        if (haystack.includes(token)) score += 14;
      });
      return { ...item, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }

  function renderSearchResults(container, results) {
    if (!container) return;
    if (!results.length) {
      container.innerHTML = '<div class="site-search-empty"><strong>Sonuç bulunamadı.</strong><span>Farklı bir ürün, kategori, içerik veya marka deneyin.</span><a class="site-search-empty__link" href="/collections/routine.html">Rutinleri incele</a></div>';
      container.hidden = false;
      return;
    }
    container.innerHTML = results.map((item) => `
      <a class="site-search-result" href="${item.url}">
        <span class="site-search-result__badge">${item.badge || item.type}</span>
        <div class="site-search-result__body">
          <span class="site-search-result__type">${item.type}</span>
          <strong>${item.label}</strong>
          <span class="site-search-result__meta">${item.meta || ''}</span>
        </div>
        <span class="site-search-result__arrow" aria-hidden="true">→</span>
      </a>`).join('') + '<a class="site-search-results__all" href="/collections/routine.html">Tüm rutinleri görüntüle</a>';
    container.hidden = false;
  }

  function bindSiteSearch() {
    $$('.site-search-form').forEach((form) => {
      const input = form.querySelector('.site-search-input');
      const clearBtn = form.querySelector('.site-search-clear');
      const resultsBox = form.querySelector('.site-search-results');
      if (!input || !clearBtn || !resultsBox) return;

      const sync = () => {
        const hasValue = !!input.value.trim();
        clearBtn.classList.toggle('is-visible', hasValue);
        if (!hasValue) {
          resultsBox.hidden = true;
          resultsBox.innerHTML = '';
          return;
        }
        renderSearchResults(resultsBox, findSearchMatches(input.value));
      };

      input.addEventListener('input', sync);
      input.addEventListener('focus', sync);
      clearBtn.addEventListener('click', () => {
        input.value = '';
        sync();
        input.focus();
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const matches = findSearchMatches(input.value);
        if (!matches.length) return;
        window.location.href = matches[0].url;
      });
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.site-search-form')) return;
      $$('.site-search-results').forEach((box) => {
        box.hidden = true;
      });
    });
  }

  bindSiteSearch();

  function persistCart() {
    localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    renderCart();
    renderCheckout();
  }

  function normalizeFavoriteItem(item) {
    if (!item?.id) return null;
    return {
      id: String(item.id),
      name: item.name || 'Ürün',
      brand: item.brand || 'Cosmoskin',
      price: Number(item.price || 0),
      image: item.image || '',
      url: item.url || ''
    };
  }

  function uniqueFavorites(items = []) {
    const map = new Map();
    items.forEach((item) => {
      const normalized = normalizeFavoriteItem(item);
      if (normalized && !map.has(normalized.id)) {
        map.set(normalized.id, normalized);
      }
    });
    return Array.from(map.values());
  }

  
  function favoriteHeartIcon(active = false) {
    return `<span class="favorite-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  }
function broadcastFavoritesChange() {
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: state.favorites } }));
  }

  async function saveFavoritesToAccount() {
    const client = window.cosmoskinSupabase;
    if (!client || !favoriteAccountSyncReady) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const metadata = user.user_metadata || {};
      const { error } = await client.auth.updateUser({
        data: {
          ...metadata,
          favorites: state.favorites
        }
      });
      if (error) throw error;
    } catch (error) {
      console.warn('Favorites account sync warning:', error);
    }
  }

  function persistFavorites(options = {}) {
    state.favorites = uniqueFavorites(state.favorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
    localStorage.removeItem(LEGACY_FAVORITES_KEY);
    renderFavoriteButtons();
    broadcastFavoritesChange();
    if (!options.skipRemote) {
      saveFavoritesToAccount();
    }
  }

  async function hydrateFavoritesFromAccount() {
    const client = window.cosmoskinSupabase;
    if (!client) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      favoriteAccountSyncReady = Boolean(user);
      if (!user) return;
      const remoteFavorites = Array.isArray(user.user_metadata?.favorites) ? user.user_metadata.favorites : [];
      const localFavorites = uniqueFavorites(state.favorites);
      const resolvedFavorites = localFavorites.length ? localFavorites : uniqueFavorites(remoteFavorites);
      const remoteIds = JSON.stringify(uniqueFavorites(remoteFavorites).map((item) => item.id).sort());
      const resolvedIds = JSON.stringify(resolvedFavorites.map((item) => item.id).sort());
      state.favorites = resolvedFavorites;
      persistFavorites({ skipRemote: true });
      if (remoteIds !== resolvedIds) {
        await saveFavoritesToAccount();
      }
    } catch (error) {
      console.warn('Favorites hydrate warning:', error);
    }
  }

  function watchFavoriteAuthState() {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        favoriteAccountSyncReady = Boolean(session?.user);
        await hydrateFavoritesFromAccount();
      }
      if (event === 'SIGNED_OUT') {
        favoriteAccountSyncReady = false;
      }
    });
  }

  function isFavorite(id) {
    return state.favorites.some((item) => item.id === id);
  }

  function toggleFavorite(item) {
    const normalized = normalizeFavoriteItem(item);
    if (!normalized?.id) return;
    if (isFavorite(normalized.id)) {
      state.favorites = state.favorites.filter((entry) => entry.id !== normalized.id);
      showFavoriteToast('Favorilerden çıkarıldı');
    } else {
      state.favorites.unshift(normalized);
      showFavoriteToast('Favorilere eklendi');
    }
    persistFavorites();
  }

  function getProductDataFromButton(btn) {
    if (!btn) return null;
    return {
      id: btn.dataset.id,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: Number(btn.dataset.price),
      image: btn.dataset.image,
      url: btn.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
    };
  }

  function ensureFavoriteButtons() {
    $$('.product-card').forEach((card) => {
      const media = card.querySelector('.product-media');
      const mediaWrap = card.querySelector('.product-media-wrap');
      const cartBtn = card.querySelector('[data-add-cart]');
      if (!media || !cartBtn || card.querySelector('.favorite-btn')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'favorite-btn';
      button.setAttribute('aria-label', 'Favorilere ekle');
      button.setAttribute('title', 'Favorilere ekle');
      button.dataset.favoriteId = cartBtn.dataset.id;
      button.dataset.name = cartBtn.dataset.name || '';
      button.dataset.brand = cartBtn.dataset.brand || '';
      button.dataset.price = cartBtn.dataset.price || '';
      button.dataset.image = cartBtn.dataset.image || '';
      button.dataset.url = media.getAttribute('href') || window.location.pathname;
      button.innerHTML = favoriteHeartIcon(false);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(getProductDataFromButton(cartBtn));
      });
      (mediaWrap || card).appendChild(button);
    });
  }

  function renderFavoriteButtons() {
    $$('.favorite-btn').forEach((button) => {
      if (!button.dataset.favoriteBound) {
        button.dataset.favoriteBound = 'true';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const explicit = button.dataset.favoriteId ? {
            id: button.dataset.favoriteId,
            name: button.dataset.name,
            brand: button.dataset.brand,
            price: Number(button.dataset.price || 0),
            image: button.dataset.image,
            url: button.dataset.url || button.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
          } : null;
          const cardCartBtn = button.closest('.product-card')?.querySelector('[data-add-cart]');
          toggleFavorite(explicit?.id ? explicit : getProductDataFromButton(cardCartBtn));
        });
      }
      const active = isFavorite(button.dataset.favoriteId);
      button.classList.toggle('active', active);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
      button.setAttribute('title', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
      const icon = button.querySelector('.favorite-btn-icon');
      if (icon) icon.innerHTML = favoriteHeartIcon(active).replace('<span class="favorite-btn-icon" aria-hidden="true">','').replace('</span>','');
    });
  }

  function updateQty(id, delta) {
    state.cart = state.cart
      .map((item) => item.id === id ? { ...item, qty: item.qty + delta } : item)
      .filter((item) => item.qty > 0);
    persistCart();
  }

  function removeItem(id) {
    state.cart = state.cart.filter((item) => item.id !== id);
    persistCart();
  }

  function renderCart() {
    const target = $('#cartItems');
    const subtotalEl = $('#cartSubtotal');
    const vatEl = $('#cartVat');
    const shippingEl = $('#cartShipping');
    const totalEl = $('#cartTotal');
    const shippingProgressFill = $('#shippingProgressFill');
    const shippingProgressText = $('#shippingProgressText');
    const qty = state.cart.reduce((a, b) => a + b.qty, 0);

    $$('.cart-count').forEach((el) => {
      el.textContent = qty;
      el.style.display = qty ? 'grid' : 'none';
    });

    const t = totals();
    if (subtotalEl) subtotalEl.textContent = fmt(t.subtotal);
    if (vatEl) vatEl.textContent = fmt(t.vat);
    if (shippingEl) shippingEl.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (totalEl) totalEl.textContent = fmt(t.total);
    if (shippingProgressFill && shippingProgressText) {
      const ratio = Math.max(0, Math.min(100, Math.round((t.subtotal / FREE_SHIPPING) * 100)));
      shippingProgressFill.style.width = `${ratio}%`;
      if (t.subtotal === 0) {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING)} üzeri siparişlerde ücretsiz kargo avantajı uygulanır.`;
      } else if (t.subtotal >= FREE_SHIPPING) {
        shippingProgressText.textContent = 'Siparişiniz ücretsiz kargo avantajına ulaştı.';
      } else {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING - t.subtotal)} daha ekleyerek ücretsiz kargo avantajına ulaşabilirsiniz.`;
      }
    }

    if (!target) return;
    if (!state.cart.length) {
      target.innerHTML = '<div class="account-state"><strong>Sepetiniz şu an boş.</strong><div class="account-mini">Eklediğiniz ürünler burada listelenir.</div></div>';
      return;
    }

    target.innerHTML = state.cart.map((item) => `
      <article class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="account-mini">${item.brand}</div>
          <div class="qty">
            <button type="button" data-dec="${item.id}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-inc="${item.id}">+</button>
            <button type="button" data-remove="${item.id}">Sil</button>
          </div>
        </div>
        <strong>${fmt(item.price * item.qty)}</strong>
      </article>
    `).join('');

    $$('[data-inc]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.inc, 1)));
    $$('[data-dec]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.dec, -1)));
    $$('[data-remove]', target).forEach((btn) => btn.addEventListener('click', () => removeItem(btn.dataset.remove)));
  }

  ensureFavoriteButtons();
  renderFavoriteButtons();
  hydrateFavoritesFromAccount();
  watchFavoriteAuthState();

  window.addEventListener('load', () => {
    ensureFavoriteButtons();
    renderFavoriteButtons();
    setTimeout(() => {
      ensureFavoriteButtons();
      renderFavoriteButtons();
    }, 120);
  });

  function addCartItems(items = [], options = {}) {
    const normalizedItems = (Array.isArray(items) ? items : []).filter(Boolean).map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      price: Number(item.price),
      image: item.image,
      qty: Math.max(1, Number(item.qty || 1))
    })).filter((item) => item.id && item.name && Number.isFinite(item.price));

    if (!normalizedItems.length) return 0;

    normalizedItems.forEach((item) => {
      const found = state.cart.find((entry) => entry.id === item.id);
      if (found) found.qty += item.qty;
      else state.cart.push(item);
    });

    persistCart();
    if (options.openDrawer !== false) openDrawer(cartDrawer);
    return normalizedItems.length;
  }

  $$('[data-add-cart]').forEach((btn) => btn.addEventListener('click', () => {
    addCartItems([{
      id: btn.dataset.id,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: Number(btn.dataset.price),
      image: btn.dataset.image,
      qty: 1
    }]);
  }));

  document.addEventListener('cosmoskin:add-bundle', (event) => {
    const items = event.detail?.items || [];
    addCartItems(items, { openDrawer: true });
  });

  window.COSMOSKIN_CART_API = {
    addItems: addCartItems,
    getItems: () => state.cart.slice()
  };

  function renderCheckout() {
    const itemsWrap = $('#checkoutItems');
    const sub = $('#checkoutSubtotal');
    const vat = $('#checkoutVat');
    const shipping = $('#checkoutShipping');
    const total = $('#checkoutTotal');
    const summaryField = $('#orderSummaryField');
    if (!itemsWrap) return;

    const t = totals();
    if (sub) sub.textContent = fmt(t.subtotal);
    if (vat) vat.textContent = fmt(t.vat);
    if (shipping) shipping.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (total) total.textContent = fmt(t.total);

    if (!state.cart.length) {
      itemsWrap.innerHTML = '<div class="account-state"><strong>Sepetiniz boş.</strong><div class="account-mini">Ürün eklediğinizde sipariş özeti burada görünür.</div></div>';
      if (summaryField) summaryField.value = '';
      return;
    }

    itemsWrap.innerHTML = state.cart.map((item) => `
      <article class="checkout-item">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="account-mini">${item.brand} · ${item.qty} adet</div>
        </div>
        <strong>${fmt(item.price * item.qty)}</strong>
      </article>
    `).join('');

    if (summaryField) {
      summaryField.value = state.cart.map((item) => `${item.brand} ${item.name} x${item.qty} (${fmt(item.price * item.qty)})`).join(' | ') + ` | Toplam: ${fmt(t.total)}`;
    }
  }

  renderCart();
  renderCheckout();

  function setConsent(mode) {
    const consent = {
      essential: true,
      analytics: mode === 'all' || (mode === 'custom' && $('#prefAnalytics')?.checked)
    };
    state.consent = consent;
    localStorage.setItem('cosmoskin_consent', JSON.stringify(consent));
    cookieBanner?.classList.remove('show');
    closeModals();
    if (consent.analytics && window.enableAnalytics) window.enableAnalytics();
  }

  $('#cookieAcceptAll')?.addEventListener('click', () => setConsent('all'));
  $('#cookieAcceptEssential')?.addEventListener('click', () => setConsent('essential'));
  $('#cookieSavePrefs')?.addEventListener('click', () => setConsent('custom'));
  $('#cookieCustomize')?.addEventListener('click', () => openModal(prefModal));

  if (!state.consent) cookieBanner?.classList.add('show');
  else if (state.consent.analytics && window.enableAnalytics) window.enableAnalytics();

  $$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    const wrap = btn.closest('.modal-card');
    $$('.tab-btn', wrap).forEach((b) => b.classList.remove('active'));
    $$('.tab-panel', wrap).forEach((panel) => panel.classList.remove('active'));
    btn.classList.add('active');
    wrap.querySelector(`#${btn.dataset.tab}`)?.classList.add('active');
  }));

  $$('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
    const wrap = chip.closest('[data-filter-wrap]');
    if (!wrap) return;
    $$('.filter-chip', wrap).forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const value = chip.dataset.filter;
    wrap.nextElementSibling?.querySelectorAll('[data-filter-item]').forEach((item) => {
      item.style.display = value === 'all' || item.dataset.filterItem.includes(value) ? '' : 'none';
    });
  }));

  function onScroll() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    $$('.reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight - 70) el.classList.add('visible');
    });
  }



  function initHeroParallax() {
    const hero = document.querySelector('[data-hero-parallax]');
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const state = { currentY: 0, targetY: 0, currentX: 0, targetX: 0, ticking: false };
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    function updateTargets() {
      const rect = hero.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      state.targetY = (progress - 0.35) * 42;
    }

    function apply() {
      state.currentY += (state.targetY - state.currentY) * 0.08;
      state.currentX += (state.targetX - state.currentX) * 0.08;

      hero.style.setProperty('--hero-cloud-back-y', `${state.currentY * 1.4}px`);
      hero.style.setProperty('--hero-cloud-front-y', `${state.currentY * 2.1}px`);
      hero.style.setProperty('--hero-showcase-y', `${state.currentY * -0.16}px`);
      hero.style.setProperty('--hero-card-y', `${state.currentY * -0.34}px`);
      hero.style.setProperty('--hero-card-x', `${state.currentX * 6}px`);
      hero.style.setProperty('--hero-card-rotate', `${state.currentX * 0.4}deg`);
      hero.style.setProperty('--hero-product-y', `${state.currentY * -0.22}px`);
      hero.style.setProperty('--hero-product-x', `${state.currentX * 8}px`);
      hero.style.setProperty('--hero-product-scale', `${1 + Math.abs(state.currentY) * 0.0008}`);
      hero.style.setProperty('--hero-orb-y', `${state.currentY * -0.9}px`);
      hero.style.setProperty('--hero-orb-x', `${state.currentX * 12}px`);
      hero.style.setProperty('--hero-note-left-y', `${state.currentY * -0.1}px`);
      hero.style.setProperty('--hero-note-left-x', `${state.currentX * 7}px`);
      hero.style.setProperty('--hero-note-center-y', `${state.currentY * -0.2}px`);
      hero.style.setProperty('--hero-note-right-y', `${state.currentY * -0.14}px`);
      hero.style.setProperty('--hero-note-right-x', `${state.currentX * -7}px`);

      if (Math.abs(state.targetY - state.currentY) > 0.08 || Math.abs(state.targetX - state.currentX) > 0.08) {
        requestAnimationFrame(apply);
      } else {
        state.ticking = false;
      }
    }

    function queue() {
      if (state.ticking) return;
      state.ticking = true;
      requestAnimationFrame(apply);
    }

    function onPointerMove(event) {
      if (window.innerWidth < 900) {
        state.targetX = 0;
        return;
      }
      const rect = hero.getBoundingClientRect();
      const localX = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
      state.targetX = localX;
      queue();
    }

    updateTargets();
    queue();
    window.addEventListener('scroll', () => { updateTargets(); queue(); }, { passive: true });
    window.addEventListener('resize', () => { updateTargets(); queue(); }, { passive: true });
    hero.addEventListener('pointermove', onPointerMove, { passive: true });
    hero.addEventListener('pointerleave', () => { state.targetX = 0; queue(); }, { passive: true });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  initHeroParallax();

  $$('form[data-form-endpoint]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const status = $('.form-status', form);
    const submitButton = form.querySelector('button[type="submit"]');
    const endpoint = form.dataset.formEndpoint;
    const recipient = form.dataset.formRecipient || 'destek';
    const fallbackEmail = recipient === 'partnership' ? 'partnership@cosmoskin.com.tr' : 'destek@cosmoskin.com.tr';

    if (!endpoint) return;

    const formData = new FormData(form);
    formData.set('recipient', recipient);

    if (status) {
      status.textContent = 'Gönderiliyor...';
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.dataset.originalText || submitButton.textContent;
      submitButton.textContent = 'Gönderiliyor...';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const payload = await response.json().catch(() => ({}));
      const ok = response.ok && payload.ok;

      if (status) {
        status.textContent = ok
          ? (payload.referenceCode
              ? `Mesajınız gönderildi. Referans kodunuz: ${payload.referenceCode}. Onay e-postası tarafınıza iletildi.`
              : (payload.message || 'Mesajınız başarıyla gönderildi.'))
          : (payload.message || `Şu anda form kullanılamıyor. Lütfen ${fallbackEmail} üzerinden iletişime geçin.`);
      }

      if (ok) {
        form.reset();
      }
    } catch (error) {
      if (status) {
        status.textContent = `Şu anda form kullanılamıyor. Lütfen ${fallbackEmail} üzerinden iletişime geçin.`;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || 'Gönder';
      }
    }
  }));

  function inferCollectionTheme() {
    const path = window.location.pathname;
    if (path.includes('/collections/cleanse')) return 'cleanse';
    if (path.includes('/collections/hydrate')) return 'hydrate';
    if (path.includes('/collections/treat')) return 'treat';
    if (path.includes('/collections/protect')) return 'protect';
    if (path.includes('/collections/routine')) return 'routine';
    if (path.includes('/collections/care')) return 'care';
    return 'default';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function createSlug(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function inferRoutineStep(product, theme) {
    if (theme === 'cleanse') return '1. adım · Temizleme';
    if (theme === 'hydrate') return '2. adım · Nem desteği';
    if (theme === 'treat') return '2. adım · Hedef bakım';
    if (theme === 'protect') return '3. adım · Günlük koruma';
    if (theme === 'routine') return 'Rutin seçkisi';
    if (theme === 'care') return 'Destek bakım';
    if ((product.tags || []).includes('spf')) return '3. adım · Günlük koruma';
    if ((product.tags || []).includes('serum')) return '2. adım · Serum';
    return 'Seçilmiş ürün';
  }

  function inferSkinFit(product, theme) {
    const name = (product.name || '').toLowerCase();
    const tags = (product.tags || []).join(' ');
    if (theme === 'protect' || name.includes('sun') || tags.includes('spf')) {
      return 'Günlük şehir kullanımı, normal, karma ve hassas ciltler için rahat bir son adım.';
    }
    if (theme === 'cleanse' || name.includes('cleanser')) {
      return 'Gün sonunda kalıntıyı konforlu biçimde uzaklaştırmak isteyen normal, karma ve yağlanmaya meyilli ciltler için uygundur.';
    }
    if (theme === 'hydrate' || tags.includes('hyaluronik') || tags.includes('barrier') || name.includes('snail')) {
      return 'Kuruluk hissi, bariyer desteği veya gün içinde esnek görünüm arayan cilt tipleri için iyi bir katman oluşturur.';
    }
    if (theme === 'treat' || name.includes('vitamin') || name.includes('glow')) {
      return 'Donuk görünüm, ton eşitsizliği veya daha canlı bir cilt görünümü isteyen bakım rutinleri için tasarlanmış bir ara adımdır.';
    }
    return 'Dengeli, sade ve sonuç odaklı bir rutin kurmak isteyen kullanıcılar için seçilmiş bir üründür.';
  }

  function inferUseSteps(product, theme) {
    if (theme === 'protect' || (product.tags || []).includes('spf')) {
      return [
        'Sabah rutininin son adımında kuru cilde eşit şekilde uygula.',
        'Makyaj altına ince katman halinde rahatça yerleşir.',
        'Gün içinde uzun dış mekân planlarında tazeleme düşün.'
      ];
    }
    if (theme === 'cleanse') {
      return [
        'Nemli cilde nazikçe masaj yaparak uygula.',
        'Ilık su ile durula ve cildi germeden temiz bırak.',
        'Ardından tonik, serum veya nem adımına geç.'
      ];
    }
    if (theme === 'hydrate') {
      return [
        'Temizleme sonrası hafif nemli cilde uygula.',
        'Tek başına ya da krem öncesi katman olarak kullan.',
        'Sabah ve akşam rutine kolayca eklenir.'
      ];
    }
    if (theme === 'treat') {
      return [
        'Temizleme sonrası ve krem öncesi ara adım olarak kullan.',
        'İhtiyaca göre tek ürün odaklı sade rutin içinde konumlandır.',
        'Hassasiyet hissedersen kullanım sıklığını kademeli artır.'
      ];
    }
    return [
      'Temizleme sonrası kullanıma uygundur.',
      'Dokuya göre serum, essence veya krem adımında konumlandır.',
      'Düzenli kullanımda rutinin görünümünü daha dengeli hale getirir.'
    ];
  }

  function inferTabContent(product, theme) {
    const summaryIntro = product.description || 'Premium, sade ve günlük rutine kolay entegre olan bir seçki ürünü.';
    const useSteps = inferUseSteps(product, theme);
    const orderCopy = inferRoutineStep(product, theme);
    const skinFit = inferSkinFit(product, theme);

    return {
      overview: {
        title: 'Ürün Bilgileri',
        body: `<p>${escapeHtml(summaryIntro)}</p>
          <ul>
            <li>${escapeHtml(orderCopy)} içinde konumlandırılabilir.</li>
            <li>Günlük kullanım odağında sade ve anlaşılır bir rutin akışına uygundur.</li>
            <li>Hızlı karar vermeyi kolaylaştıran net fayda, temiz görsel ve güven işaretleriyle sunulur.</li>
          </ul>`
      },
      routine: {
        title: 'Nasıl Kullanılır',
        body: `<ul>${useSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
      },
      fit: {
        title: 'Kimler İçin Uygun',
        body: `<p>${escapeHtml(skinFit)}</p>
          <ul>
            <li>İlk alışverişte kafa karıştırmayan, net bir ürün seçimi arayan kullanıcılar için uygundur.</li>
            <li>${escapeHtml((product.meta || 'KDV dahil · Türkiye içi gönderim').replace(/\s+/g, ' ').trim())}</li>
            <li>Rutinini gereksiz kalabalık olmadan kurmak isteyenler için iyi bir eşleşmedir.</li>
          </ul>`
      },
      trust: {
        title: 'Teslimat & Güven',
        body: `<ul>
          <li>Tüm fiyatlar KDV dahil gösterilir.</li>
          <li>${escapeHtml(fmt(FREE_SHIPPING))} ve üzeri siparişlerde ücretsiz kargo avantajı uygulanır.</li>
          <li>Güvenli ödeme, açık fiyatlama ve üyelik üzerinden favori takibi ile desteklenir.</li>
        </ul>`
      }
    };
  }

  function getCollectionProductData(card) {
    const media = card.querySelector('.product-media');
    const cartBtn = card.querySelector('[data-add-cart]');
    const title = card.querySelector('h3');
    const desc = card.querySelector('.product-body p');
    const brand = card.querySelector('.brandline');
    const price = card.querySelector('.price');
    const meta = card.querySelector('.meta-note');
    const img = card.querySelector('img');
    const badge = card.querySelector('.badge');
    const pills = $$('.pill', card).map((pill) => pill.textContent.trim()).filter(Boolean);
    return {
      id: cartBtn?.dataset.id || card.dataset.productId || createSlug(title?.textContent || ''),
      name: cartBtn?.dataset.name || title?.textContent?.trim() || 'Ürün',
      brand: cartBtn?.dataset.brand || brand?.textContent?.trim() || badge?.textContent?.trim() || 'Cosmoskin',
      price: Number(cartBtn?.dataset.price || String(price?.textContent || '0').replace(/[^\d]/g, '')),
      image: cartBtn?.dataset.image || img?.getAttribute('src') || '',
      description: desc?.textContent?.trim() || '',
      meta: meta?.textContent?.trim() || 'KDV dahil · Türkiye içi gönderim',
      url: media?.getAttribute('href') || window.location.pathname,
      tags: pills,
      categoryTheme: inferCollectionTheme()
    };
  }

  function setProductQueryParam(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('product', id);
    else url.searchParams.delete('product');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function attachCollectionDetailExperience() {
    const isCollectionPage = window.location.pathname.includes('/collections/');
    if (!isCollectionPage) return;

    document.body.classList.add('collection-page');

    const grid = document.querySelector('.product-grid');
    if (!grid) return;

    const detailShell = document.createElement('section');
    detailShell.className = 'collection-detail-shell';
    detailShell.hidden = true;
    grid.parentElement.insertBefore(detailShell, grid);

    function renderDetail(product) {
      if (!product?.id) return;
      const theme = inferCollectionTheme();
      const tabs = inferTabContent(product, theme);
      const favoriteActive = isFavorite(product.id);
      const floatingBottom = product.tags?.length ? product.tags.slice(0, 2).join(' · ') : inferRoutineStep(product, theme);
      detailShell.innerHTML = `
        <div class="collection-detail-toolbar">
          <button type="button" class="collection-detail-back">Tüm Ürünlere Dön</button>
          <div class="collection-detail-note">Ürün bilgileri, kullanım sırası ve temel teslimat notları</div>
        </div>
        <div class="collection-detail-grid">
          <div class="collection-detail-media">
            <div class="collection-detail-floating collection-detail-floating--top">${escapeHtml(inferRoutineStep(product, theme))}</div>
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div class="collection-detail-floating collection-detail-floating--bottom"><strong>${escapeHtml(floatingBottom)}</strong></div>
          </div>
          <div class="collection-detail-info">
            <div class="collection-detail-brand">${escapeHtml(product.brand)}</div>
            <h2 class="collection-detail-title">${escapeHtml(product.name)}</h2>
            <p class="collection-detail-summary">${escapeHtml(product.description || 'Seçilmiş ürün bilgisi bu ekranda net ve sade biçimde sunulur.')}</p>
            <div class="collection-detail-pills">
              ${(product.tags?.length ? product.tags : [theme, 'premium']).slice(0, 4).map((tag) => `<span class="collection-detail-pill">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="collection-detail-price-row">
              <div class="collection-detail-price-wrap">
                <div class="price">${fmt(product.price || 0)}</div>
                <div class="price-note">${escapeHtml(product.meta || 'KDV dahil')}</div>
              </div>
              <div class="collection-detail-actions">
                <button class="btn btn-primary" type="button" data-detail-add-cart>Sepete Ekle</button>
                <button class="collection-detail-favorite ${favoriteActive ? 'active' : ''} favorite-btn" type="button" aria-label="${favoriteActive ? 'Favorilerden çıkar' : 'Favorilere ekle'}" aria-pressed="${favoriteActive ? 'true' : 'false'}" data-favorite-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-brand="${escapeHtml(product.brand)}" data-price="${escapeHtml(product.price)}" data-image="${escapeHtml(product.image)}" data-url="${escapeHtml(product.url)}">${favoriteHeartIcon(favoriteActive)}</button>
              </div>
            </div>
            <div class="collection-detail-trust">
              <article><h4>Hızlı Karar</h4><p>Ürün ismi, fayda ve rutin sırası tek bakışta anlaşılır yapıdadır.</p></article>
              <article><h4>Güven İşaretleri</h4><p>Net fiyat, KDV bilgisi ve kargo avantajı kullanıcı tereddüdünü azaltır.</p></article>
              <article><h4>Apple Düzeyi Netlik</h4><p>Tek ürün odağı, sakin tipografi ve boşluk kullanımı satın alma akışını güçlendirir.</p></article>
            </div>
            <div class="collection-detail-tabs">
              <button type="button" class="collection-detail-tab active" data-detail-tab="overview">Ürün Bilgileri</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="routine">Kullanım</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="fit">Cilt Tipi</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="trust">Teslimat & Güven</button>
            </div>
            <div class="collection-detail-panels">
              ${Object.entries(tabs).map(([key, value], index) => `
                <div class="collection-detail-panel ${index === 0 ? 'active' : ''}" data-detail-panel="${key}">
                  <h3>${escapeHtml(value.title)}</h3>
                  ${value.body}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      detailShell.hidden = false;
      document.body.classList.add('collection-has-detail');
      setProductQueryParam(product.id);
      detailShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      renderFavoriteButtons();

      detailShell.querySelector('.collection-detail-back')?.addEventListener('click', () => {
        detailShell.hidden = true;
        detailShell.innerHTML = '';
        document.body.classList.remove('collection-has-detail');
        setProductQueryParam('');
      });

      detailShell.querySelector('[data-detail-add-cart]')?.addEventListener('click', () => {
        const item = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          price: Number(product.price || 0),
          image: product.image,
          qty: 1
        };
        const found = state.cart.find((entry) => entry.id === item.id);
        if (found) found.qty += 1;
        else state.cart.push(item);
        persistCart();
        openDrawer(cartDrawer);
      });

      $$('.collection-detail-tab', detailShell).forEach((tab) => {
        tab.addEventListener('click', () => {
          $$('.collection-detail-tab', detailShell).forEach((btn) => btn.classList.remove('active'));
          $$('.collection-detail-panel', detailShell).forEach((panel) => panel.classList.remove('active'));
          tab.classList.add('active');
          detailShell.querySelector(`[data-detail-panel="${tab.dataset.detailTab}"]`)?.classList.add('active');
        });
      });
    }

    const cards = $$('.product-card', grid);
    cards.forEach((card) => {
      const product = getCollectionProductData(card);
      card.dataset.productId = product.id;
      const media = card.querySelector('.product-media');
      const title = card.querySelector('h3');

      [media, title].forEach((target) => {
        if (!target) return;
        target.style.cursor = 'pointer';
        target.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          renderDetail(getCollectionProductData(card));
        });
      });

      card.addEventListener('click', (event) => {
        if (event.target.closest('button') || event.target.closest('.favorite-btn') || event.target.closest('[data-add-cart]')) return;
        if (event.target.closest('.product-media') || event.target.closest('h3') || event.target.closest('.product-body')) {
          renderDetail(getCollectionProductData(card));
        }
      });
    });

    const selectedId = new URL(window.location.href).searchParams.get('product');
    if (selectedId) {
      const selectedCard = cards.find((card) => card.dataset.productId === selectedId);
      if (selectedCard) renderDetail(getCollectionProductData(selectedCard));
    }

    window.addEventListener('cosmoskin:favorites-updated', () => {
      const currentId = new URL(window.location.href).searchParams.get('product');
      if (!currentId || detailShell.hidden) return;
      const activeCard = cards.find((card) => card.dataset.productId === currentId);
      if (activeCard) renderDetail(getCollectionProductData(activeCard));
    });
  }

  attachCollectionDetailExperience();

})();
