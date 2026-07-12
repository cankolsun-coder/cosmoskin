(function () {
  'use strict';

  const FAVORITES_KEY = 'cosmoskin_favorites';
  const LEGACY_FAVORITES_KEY = 'cosmoskin_favorites_v1';
  const GUEST_MERGE_PREFIX = 'cosmoskin_favorites_guest_merged_for:';
  const METADATA_MIGRATED_PREFIX = 'cosmoskin_favorites_metadata_migrated:';

  let favorites = [];
  let syncReady = false;
  let loggedInUserId = '';
  let hydrating = false;
  const pendingSlugs = new Set();
  const subscribers = new Set();

  function helpers() {
    return window.COSMOSKIN_PRODUCT_HELPERS || {};
  }

  function normalizeSlug(input) {
    const raw = String(input?.slug || input?.id || input?.product_slug || input?.product_id || input?.favoriteId || input?.url || input || '').trim();
    if (!raw) return '';
    const helperSlug = typeof helpers().extractSlug === 'function' ? helpers().extractSlug(raw) : '';
    if (helperSlug) return helperSlug;
    const match = raw.match(/\/products\/([^.?#/]+)\.html/i);
    if (match) return match[1];
    return raw.replace(/\.html(?:[?#].*)?$/i, '').split('/').pop();
  }

  function normalizeItem(item) {
    if (!item) return null;
    const slug = normalizeSlug(item);
    if (!slug) return null;
    const lookup = typeof helpers().getProductByHandle === 'function' ? helpers().getProductByHandle(slug) : null;
    return {
      id: slug,
      slug,
      name: lookup?.name || item.name || item.product_name || 'Ürün',
      brand: lookup?.brand || item.brand || 'COSMOSKIN',
      price: Number(lookup?.price || lookup?.effective_price_try || item.price || 0) || 0,
      image: lookup?.image || item.image || '',
      url: lookup?.url || item.url || `/products/${slug}.html`
    };
  }

  function uniqueItems(items) {
    const map = new Map();
    (items || []).forEach((item) => {
      const normalized = normalizeItem(item);
      if (normalized && !map.has(normalized.id)) map.set(normalized.id, normalized);
    });
    return Array.from(map.values());
  }

  function readStorage() {
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
      return uniqueItems(current);
    } catch (_) {
      return [];
    }
  }

  function persistLocal() {
    favorites = uniqueItems(favorites);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      localStorage.removeItem(LEGACY_FAVORITES_KEY);
    } catch (_) {}
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: favorites.slice() } }));
    subscribers.forEach((fn) => {
      try { fn(favorites.slice()); } catch (_) {}
    });
  }

  function heartIconHtml(active) {
    const fill = active ? 'currentColor' : 'none';
    return '<span class="favorite-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="' + fill + '"/></svg></span>';
  }

  async function getSession() {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.getSession) return null;
    const { data } = await client.auth.getSession();
    return data?.session || null;
  }

  async function apiRequest(method, body) {
    const session = await getSession();
    if (!session?.access_token) return null;
    const res = await fetch('/api/account/favorites', {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Favori senkronizasyonu tamamlanamadı.');
    return data;
  }

  function mapDbRows(rows) {
    return uniqueItems((rows || []).map((row) => ({
      id: row.product_slug || row.product_id,
      slug: row.product_slug || row.product_id,
      name: row.product_name || row.name,
      brand: row.brand,
      price: row.price,
      image: row.image || row.metadata?.url,
      url: row.metadata?.url || (row.product_slug ? `/products/${row.product_slug}.html` : '')
    })));
  }

  async function fetchDbFavorites() {
    const data = await apiRequest('GET');
    if (!data || !Array.isArray(data.favorites)) return [];
    return mapDbRows(data.favorites);
  }

  async function scrubMetadataFavorites() {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.updateUser || !syncReady) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const metadata = user.user_metadata || {};
      if (!Array.isArray(metadata.favorites) || !metadata.favorites.length) return;
      await client.auth.updateUser({ data: { ...metadata, favorites: [] } });
    } catch (_) {}
  }

  async function importMetadataOnce(userId, dbSlugs) {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.getUser) return;
    const migratedKey = METADATA_MIGRATED_PREFIX + userId;
    if (localStorage.getItem(migratedKey)) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      const metadataItems = Array.isArray(user?.user_metadata?.favorites) ? user.user_metadata.favorites : [];
      const imports = metadataItems
        .map((item) => normalizeSlug(item))
        .filter((slug) => slug && !dbSlugs.has(slug));
      if (imports.length) {
        await Promise.all(imports.map((slug) => apiRequest('POST', { product_slug: slug }).catch(() => null)));
      }
      if (metadataItems.length) await scrubMetadataFavorites();
      localStorage.setItem(migratedKey, '1');
    } catch (_) {}
  }

  async function mergeGuestFavoritesOnce(userId, dbSlugs) {
    const mergeKey = GUEST_MERGE_PREFIX + userId;
    if (localStorage.getItem(mergeKey)) return;
    const guestItems = readStorage();
    const imports = guestItems.filter((item) => item.id && !dbSlugs.has(item.id));
    if (imports.length) {
      await Promise.all(imports.map((item) => apiRequest('POST', {
        product_slug: item.id,
        product_name: item.name,
        brand: item.brand,
        price: item.price,
        image: item.image,
        url: item.url
      }).catch(() => null)));
    }
    localStorage.setItem(mergeKey, '1');
  }

  async function hydrateFromAccount() {
    const session = await getSession();
    syncReady = Boolean(session?.user?.id);
    loggedInUserId = session?.user?.id || '';

    if (!syncReady) {
      favorites = readStorage();
      persistLocal();
      notify();
      return favorites.slice();
    }

    if (hydrating) return favorites.slice();
    hydrating = true;
    try {
      let dbFavorites = await fetchDbFavorites();
      const dbSlugs = new Set(dbFavorites.map((item) => item.id));
      await importMetadataOnce(loggedInUserId, dbSlugs);
      dbFavorites = await fetchDbFavorites();
      dbSlugs.clear();
      dbFavorites.forEach((item) => dbSlugs.add(item.id));
      await mergeGuestFavoritesOnce(loggedInUserId, dbSlugs);
      dbFavorites = await fetchDbFavorites();
      favorites = uniqueItems(dbFavorites);
      persistLocal();
      notify();
      return favorites.slice();
    } catch (error) {
      console.warn('Favorites hydrate warning:', error);
      favorites = readStorage();
      persistLocal();
      notify();
      return favorites.slice();
    } finally {
      hydrating = false;
    }
  }

  async function addFavorite(item) {
    const normalized = normalizeItem(item);
    if (!normalized?.id) return false;
    if (pendingSlugs.has(normalized.id)) return isFavorite(normalized.id);
    if (isFavorite(normalized.id)) return true;

    pendingSlugs.add(normalized.id);
    const previous = favorites.slice();
    favorites = [normalized, ...favorites.filter((entry) => entry.id !== normalized.id)];
    persistLocal();
    notify();

    try {
      if (syncReady) await apiRequest('POST', {
        product_slug: normalized.id,
        product_name: normalized.name,
        brand: normalized.brand,
        price: normalized.price,
        image: normalized.image,
        url: normalized.url
      });
      return true;
    } catch (error) {
      favorites = previous;
      persistLocal();
      notify();
      throw error;
    } finally {
      pendingSlugs.delete(normalized.id);
    }
  }

  async function removeFavorite(itemOrSlug) {
    const normalized = typeof itemOrSlug === 'string' ? normalizeItem({ id: itemOrSlug, slug: itemOrSlug }) : normalizeItem(itemOrSlug);
    if (!normalized?.id) return false;
    if (pendingSlugs.has(normalized.id)) return !isFavorite(normalized.id);
    if (!isFavorite(normalized.id)) return true;

    pendingSlugs.add(normalized.id);
    const previous = favorites.slice();
    favorites = favorites.filter((entry) => entry.id !== normalized.id);
    persistLocal();
    notify();

    try {
      if (syncReady) {
        await apiRequest('DELETE', { product_slug: normalized.id });
        await scrubMetadataFavorites();
      }
      return true;
    } catch (error) {
      favorites = previous;
      persistLocal();
      notify();
      throw error;
    } finally {
      pendingSlugs.delete(normalized.id);
    }
  }

  async function toggleFavorite(item) {
    const normalized = normalizeItem(item);
    if (!normalized?.id) return false;
    if (isFavorite(normalized.id)) {
      await removeFavorite(normalized);
      return false;
    }
    await addFavorite(normalized);
    return true;
  }

  function isFavorite(slug) {
    const id = normalizeSlug(slug);
    return favorites.some((item) => item.id === id);
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function initAuthWatch() {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        syncReady = Boolean(session?.user?.id);
        loggedInUserId = session?.user?.id || '';
        await hydrateFromAccount();
      }
      if (event === 'SIGNED_OUT') {
        syncReady = false;
        loggedInUserId = '';
        favorites = readStorage();
        persistLocal();
        notify();
      }
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== FAVORITES_KEY || syncReady) return;
    favorites = readStorage();
    notify();
  });

  favorites = readStorage();
  initAuthWatch();
  hydrateFromAccount().catch(() => {});

  window.COSMOSKINFavorites = {
    KEY: FAVORITES_KEY,
    get: () => favorites.slice(),
    getSlugs: () => favorites.map((item) => item.id),
    isFavorite,
    isLoggedIn: () => syncReady,
    load: hydrateFromAccount,
    add: addFavorite,
    remove: removeFavorite,
    toggle: toggleFavorite,
    subscribe,
    heartIconHtml,
    normalizeSlug,
    normalizeItem,
    readStorage,
    persistLocal,
    uniqueItems,
    mapDbRows
  };
})();
