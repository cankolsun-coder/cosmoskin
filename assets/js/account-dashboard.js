/*
  COSMOSKIN Account Dashboard Frontend
  File: assets/js/account-dashboard.js

  Purpose:
  - Fetch authenticated account dashboard data from Cloudflare Functions.
  - Bind API values into HTML elements using data-bind attributes.
  - Handle CTA clicks using data-action attributes.
  - Keep frontend compatible with SQL + Functions structure.
*/

(() => {
  'use strict';

  if (window.__cosmoskinAccountDashboardLoaded) return;
  window.__cosmoskinAccountDashboardLoaded = true;

  const API = {
    dashboard: '/api/account/dashboard',
    todayRoutine: '/api/routines/today',
    completeStep: '/api/routines/complete-step',
    completeRoutine: '/api/routines/complete-routine',
    runningOutProducts: '/api/products/running-out',
    recommendations: '/api/recommendations/personalized',
    lastOrder: '/api/orders/last',
    points: '/api/points',
    rewards: '/api/rewards',
    reorder: '/api/reorder',
    wishlistToggle: '/api/wishlist/toggle',
    notifications: '/api/notifications',
    markAllNotificationsRead: '/api/notifications/mark-all-read'
  };

  const state = {
    dashboard: null,
    activeRoutineMode: 'morning',
    isLoading: false,
    eventsBound: false,
    routineModeBound: false,
    notificationPanelOpen: false,
    notifications: []
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccountDashboard, { once: true });
  } else {
    initAccountDashboard();
  }

  async function initAccountDashboard() {
    setPageLoading(true);
    ensureNotificationPanel();
    attachActionHandlers();
    attachRoutineModeHandlers();

    try {
      const dashboard = await requestJSON(API.dashboard);
      state.dashboard = normalizeDashboard(dashboard);

      bindDashboard(state.dashboard);
      renderTodayRoutine(state.dashboard.todayRoutine);
      renderRunningOutProducts(state.dashboard.runningOutProducts);
      renderRecommendations(state.dashboard.personalizedRecommendations);
      renderLastOrder(state.dashboard.lastOrder);
      renderRewards(state.dashboard.rewards || state.dashboard.points);

      await refreshNotifications();

      document.documentElement.classList.add('account-dashboard-ready');
    } catch (error) {
      console.error('[COSMOSKIN] Account dashboard failed:', error);
      showDashboardError('Hesap bilgilerin yüklenirken bir sorun oluştu.');
    } finally {
      setPageLoading(false);
    }
  }

  function normalizeDashboard(payload) {
    const data = payload?.data || payload || {};

    return {
      profile: data.profile || data.user || {},
      points: data.points || data.loyalty || {},
      skinScore: data.skinScore || data.skin_score || data.skinScores || {},
      skinBalanceLabel: data.skinBalanceLabel || data.skin_balance_label || null,
      routineStreak: data.routineStreak || data.routine_streak || data.streak || {},
      todayRoutine: data.todayRoutine || data.today_routine || data.routine || {},
      runningOutProducts: data.runningOutProducts || data.running_out_products || [],
      personalizedRecommendations: data.personalizedRecommendations || data.personalized_recommendations || data.recommendations || [],
      lastOrder: data.lastOrder || data.last_order || null,
      rewards: data.rewards || null,
      notifications: data.notifications || []
    };
  }

  function bindDashboard(data) {
    const profileName = data.profile?.full_name || data.profile?.name || data.profile?.display_name || 'COSMOSKIN Üyesi';
    const profileEmail = data.profile?.email || '';
    const pointsBalance = numberFormat(data.points?.balance ?? data.points?.points ?? data.points?.total ?? 0);
    const skinScoreValue = clampScore(data.skinScore?.overall_score ?? data.skinScore?.overall ?? data.skinScore?.score ?? 0);
    const balanceLabel = data.skinBalanceLabel || getSkinBalanceLabel(skinScoreValue);
    const streakText = formatRoutineStreak(data.routineStreak);

    bindText('profileName', profileName);
    bindText('profileEmail', profileEmail);
    bindText('pointsBalance', pointsBalance);
    bindText('skinScore', `${skinScoreValue}`);
    bindText('skinBalanceLabel', balanceLabel);
    bindText('routineStreak', streakText);

    bindText('moistureStatus', getMetricLabel(data.skinScore?.moisture_score, 'Nem'));
    bindText('barrierStatus', getMetricLabel(data.skinScore?.barrier_score, 'Bariyer'));
    bindText('spfStatus', getMetricLabel(data.skinScore?.spf_score, 'SPF'));

    updateGauge(skinScoreValue);
    updateNotificationBadge(data.notifications);
  }

  function bindText(key, value) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => {
      if (el.dataset.suffix) {
        el.textContent = `${value}${el.dataset.suffix}`;
      } else {
        el.textContent = value ?? '';
      }
    });
  }

  function renderTodayRoutine(routine) {
    const container = document.querySelector('[data-render="todayRoutine"]');
    if (!container || !routine) return;

    const steps = Array.isArray(routine.steps) ? routine.steps : [];
    if (!steps.length) return;

    container.innerHTML = steps.map((step, index) => {
      const completed = Boolean(step.completed || step.is_completed || step.completed_at);
      const active = !completed && index === steps.findIndex((item) => !(item.completed || item.is_completed || item.completed_at));
      const stepNumber = completed ? '✓' : index + 1;

      return `
        <div class="step ${completed ? 'done' : ''} ${active ? 'active' : ''}" data-routine-step-id="${escapeAttr(step.id || step.step_id || '')}">
          ${productPlaceholderSVG(step.category || step.type || step.name)}
          <div class="step-dot">${stepNumber}</div>
          <b>${escapeHTML(step.title || step.name || 'Rutin Adımı')}</b>
          <span>${completed ? 'Tamamlandı' : active ? 'Sıradaki adım' : 'Eksik'}</span>
        </div>
      `;
    }).join('');
  }

  function renderRunningOutProducts(products) {
    const container = document.querySelector('[data-render="runningOutProducts"]');
    if (!container || !Array.isArray(products) || !products.length) return;

    container.innerHTML = products.map((product) => {
      const remaining = Number(product.remaining_percent ?? product.remainingPercentage ?? product.remaining ?? 0);
      const usedPercent = clamp(100 - remaining, 0, 100);

      return `
        <article class="product-card" data-product-id="${escapeAttr(product.product_id || product.id || '')}">
          <div class="p-img">${productPlaceholderSVG(product.category || product.name)}</div>
          <small>${escapeHTML(product.brand || '')}</small>
          <h3>${escapeHTML(product.name || product.product_name || 'Ürün')}</h3>
          <small>${escapeHTML(product.remaining_text || estimateRemainingText(product))}</small>
          <div class="bar"><i style="width:${usedPercent}%"></i></div>
          <small>${usedPercent}% kullanıldı</small>
          <button class="mini-btn" data-action="reorder-product" data-product-id="${escapeAttr(product.product_id || product.id || '')}">Yeniden Sipariş Ver</button>
          <button class="mini-btn" data-action="suggest-alternative" data-product-id="${escapeAttr(product.product_id || product.id || '')}">Alternatif Öner</button>
        </article>
      `;
    }).join('');
  }

  function renderRecommendations(products) {
    const container = document.querySelector('[data-render="personalizedRecommendations"]');
    if (!container || !Array.isArray(products) || !products.length) return;

    container.innerHTML = products.map((product) => `
      <article class="product-card" data-product-id="${escapeAttr(product.product_id || product.id || '')}">
        <button class="heart" data-action="toggle-wishlist" data-product-id="${escapeAttr(product.product_id || product.id || '')}" aria-label="Favorilere ekle">♡</button>
        <div class="p-img">${productPlaceholderSVG(product.category || product.name)}</div>
        <small>${escapeHTML(product.brand || product.name || 'Önerilen Ürün')}</small>
        <h3>${escapeHTML(product.reason || product.recommendation_reason || 'Cilt rutininle uyumlu.')}</h3>
        <b>${product.points ? `+${escapeHTML(product.points)} puan` : 'Önerildi'}</b>
        <button class="mini-btn" data-action="add-to-cart" data-product-id="${escapeAttr(product.product_id || product.id || '')}">Sepete Ekle</button>
      </article>
    `).join('');
  }

  function renderLastOrder(order) {
    if (!order) return;

    bindText('lastOrderDate', order.created_at ? formatDate(order.created_at) : order.date || '');
    bindText('lastOrderSummary', `${order.item_count || order.items?.length || 0} ürün · ${moneyFormat(order.total_amount || order.total || 0)}`);

    const container = document.querySelector('[data-render="lastOrderProducts"]');
    if (!container || !Array.isArray(order.items)) return;

    container.innerHTML = order.items.slice(0, 3).map((item) => `
      <div class="thumb" title="${escapeAttr(item.name || item.product_name || 'Ürün')}">
        ${productPlaceholderSVG(item.category || item.name, 'small')}
      </div>
    `).join('');
  }

  function renderRewards(rewards) {
    if (!rewards) return;

    const current = Number(rewards.balance ?? rewards.points ?? rewards.total ?? 0);
    const nextTarget = Number(rewards.next_target ?? rewards.nextTarget ?? 1500);
    const remaining = Math.max(nextTarget - current, 0);
    const progress = nextTarget > 0 ? clamp((current / nextTarget) * 100, 0, 100) : 0;

    bindText('rewardRemaining', `${numberFormat(remaining)} puan kaldı`);

    document.querySelectorAll('[data-bind-style="rewardProgress"]').forEach((el) => {
      el.style.width = `${progress}%`;
    });
  }

  function attachActionHandlers() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    document.addEventListener('click', async (event) => {
      if (state.notificationPanelOpen && !event.target.closest('[data-notification-panel]') && !event.target.closest('[data-action="notifications"]')) {
        closeNotificationPanel();
      }

      const trigger = event.target.closest('[data-action]');
      if (!trigger) return;

      const action = trigger.dataset.action;
      const productId = trigger.dataset.productId;
      const stepId = trigger.closest('[data-routine-step-id]')?.dataset.routineStepId || trigger.dataset.stepId;
      const shouldShowLoading = !['notifications', 'close-notifications'].includes(action);

      try {
        if (shouldShowLoading) setButtonLoading(trigger, true);

        switch (action) {
          case 'continue-routine':
            scrollToRoutine();
            break;

          case 'complete-step':
            await completeStep(stepId);
            break;

          case 'complete-routine':
            await completeRoutine();
            break;

          case 'renew-product':
          case 'reorder-product':
          case 'reorder-last-order':
            await reorder(productId);
            break;

          case 'add-to-cart':
            await addToCart(productId);
            break;

          case 'toggle-wishlist':
            await toggleWishlist(productId, trigger);
            break;

          case 'notifications':
            event.preventDefault();
            await toggleNotificationPanel();
            break;

          case 'close-notifications':
            event.preventDefault();
            closeNotificationPanel();
            break;

          case 'mark-all-notifications-read':
            event.preventDefault();
            await markAllNotificationsRead();
            break;

          case 'logout':
            event.preventDefault();
            await logout();
            break;

          case 'view-rewards':
            await openRewards();
            break;

          case 'suggest-alternative':
            await openAlternatives(productId);
            break;

          case 'improve-score':
            scrollToRoutine();
            break;

          default:
            console.warn(`[COSMOSKIN] Unknown dashboard action: ${action}`);
        }
      } catch (error) {
        console.error(`[COSMOSKIN] Action failed: ${action}`, error);
        toast('İşlem tamamlanamadı. Lütfen tekrar dene.');
      } finally {
        if (shouldShowLoading) setButtonLoading(trigger, false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNotificationPanel();
    });
  }

  function attachRoutineModeHandlers() {
    if (state.routineModeBound) return;
    state.routineModeBound = true;

    document.querySelectorAll('[data-routine-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.routineMode;
        state.activeRoutineMode = mode;

        document.querySelectorAll('[data-routine-mode]').forEach((item) => {
          item.classList.toggle('active', item === button);
        });

        const routineCard = document.querySelector('[data-section="routineCard"]');
        if (routineCard) {
          routineCard.dataset.mode = mode;
        }
      });
    });
  }

  async function completeStep(stepId) {
    if (!stepId) {
      toast('Tamamlanacak rutin adımı bulunamadı.');
      return;
    }

    await requestJSON(API.completeStep, {
      method: 'POST',
      body: JSON.stringify({ step_id: stepId })
    });

    await refreshDashboard();
    toast('Rutin adımı tamamlandı.');
  }

  async function completeRoutine() {
    await requestJSON(API.completeRoutine, {
      method: 'POST',
      body: JSON.stringify({ routine_mode: state.activeRoutineMode })
    });

    await refreshDashboard();
    toast('Rutin tamamlandı.');
  }

  async function reorder(productId) {
    const body = productId ? { product_id: productId } : {};
    await requestJSON(API.reorder, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    toast('Ürünler sepete eklendi.');
  }

  async function addToCart(productId) {
    if (!productId) {
      toast('Ürün bilgisi bulunamadı.');
      return;
    }

    // Current backend package may not include a dedicated cart endpoint.
    // Product-based reorder endpoint is used as a compatible fallback.
    await requestJSON(API.reorder, {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: 1 })
    });

    toast('Ürün sepete eklendi.');
  }

  async function logout() {
    try {
      if (window.cosmoskinSupabase?.auth?.signOut) {
        const { error } = await window.cosmoskinSupabase.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      console.warn('[COSMOSKIN] Supabase sign out failed, clearing local session fallback.', error);
    }

    try {
      Object.keys(window.localStorage || {}).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          window.localStorage.removeItem(key);
        }
      });
      window.sessionStorage?.removeItem('cosmoskin_return_to');
    } catch (error) {
      console.warn('[COSMOSKIN] Local sign out cleanup failed.', error);
    }

    window.location.href = '/';
  }

  async function toggleWishlist(productId, trigger) {
    if (!productId) {
      toast('Ürün bilgisi bulunamadı.');
      return;
    }

    const response = await requestJSON(API.wishlistToggle, {
      method: 'POST',
      body: JSON.stringify({ product_id: productId })
    });

    const active = Boolean(response?.is_favorited ?? response?.favorited ?? response?.data?.is_favorited);
    trigger.textContent = active ? '♥' : '♡';
    trigger.classList.toggle('is-active', active);
  }

  async function openRewards() {
    await requestJSON(API.rewards);
    window.location.href = '/account/rewards.html';
  }

  async function openAlternatives(productId) {
    if (productId) {
      window.location.href = `/search.html?q=${encodeURIComponent(productId)}`;
    } else {
      window.location.href = '/search.html';
    }
  }

  async function refreshDashboard() {
    const dashboard = await requestJSON(API.dashboard);
    state.dashboard = normalizeDashboard(dashboard);
    bindDashboard(state.dashboard);
    renderTodayRoutine(state.dashboard.todayRoutine);
    renderRunningOutProducts(state.dashboard.runningOutProducts);
    renderRecommendations(state.dashboard.personalizedRecommendations);
    await refreshNotifications();
  }

  async function refreshNotifications() {
    const payload = await requestJSON(API.notifications).catch((error) => {
      console.warn('[COSMOSKIN] Notification refresh failed:', error);
      return null;
    });
    updateNotificationBadge(payload);
  }

  async function requestJSON(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const text = await response.text();
    const payload = text ? safeJSON(text) : null;

    if (!response.ok) {
      const message = payload?.error || payload?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  function safeJSON(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function scrollToRoutine() {
    const routine = document.querySelector('[data-section="routineCard"]') || document.querySelector('.routine-steps');
    if (routine) {
      routine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateGauge(score) {
    document.querySelectorAll('[data-score]').forEach((el) => {
      el.dataset.score = String(score);
    });

    document.querySelectorAll('.arc').forEach((arc) => {
      arc.style.setProperty('--score-progress', `${score}%`);
    });
  }

  function updateNotificationBadge(payload) {
    const data = payload?.data || payload || {};
    const notifications = extractNotifications(payload);
    const unreadCount = Number.isFinite(Number(data.unreadCount))
      ? Number(data.unreadCount)
      : notifications.filter((item) => !item.read_at && !item.is_read && !item.read).length;

    state.notifications = notifications;

    document.querySelectorAll('[data-bind="notificationCount"], [data-notification-badge], .bell .badge').forEach((el) => {
      el.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      el.hidden = unreadCount === 0;
    });

    renderNotificationPanel(notifications, unreadCount);
  }

  function extractNotifications(payload) {
    const data = payload?.data || payload || {};
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(data.notifications)) return data.notifications;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.activities)) return data.activities;
    return [];
  }

  function ensureNotificationPanel() {
    const bell = document.querySelector('[data-action="notifications"]');
    if (!bell) return null;

    let panel = document.querySelector('[data-notification-panel]');
    if (!panel) {
      const wrapper = bell.closest('.notification-wrap') || bell.parentElement;
      panel = document.createElement('div');
      panel.className = 'notification-panel';
      panel.dataset.notificationPanel = '';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="notification-panel-head">
          <b>Bildirimler</b>
          <button type="button" data-action="close-notifications" aria-label="Bildirimleri kapat">×</button>
        </div>
        <div class="notification-panel-actions">
          <button type="button" data-action="mark-all-notifications-read">Tümünü okundu yap</button>
        </div>
        <div class="notification-list" data-notification-list></div>
        <div class="notification-empty" data-notification-empty>Henüz bildirim yok.</div>
      `;
      wrapper.appendChild(panel);
    }

    bell.setAttribute('aria-haspopup', 'dialog');
    bell.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    return panel;
  }

  function renderNotificationPanel(notifications = state.notifications, unreadCount = null) {
    const panel = ensureNotificationPanel();
    if (!panel) return;

    const list = panel.querySelector('[data-notification-list]');
    const empty = panel.querySelector('[data-notification-empty]');
    const markAll = panel.querySelector('[data-action="mark-all-notifications-read"]');
    const items = Array.isArray(notifications) ? notifications.slice(0, 8) : [];
    const count = Number.isFinite(Number(unreadCount))
      ? Number(unreadCount)
      : items.filter((item) => !item.read_at && !item.is_read && !item.read).length;

    if (markAll) markAll.disabled = count === 0;
    if (empty) empty.hidden = items.length > 0;
    if (!list) return;

    list.innerHTML = items.map((item) => {
      const title = item.title || 'Bildirim';
      const body = item.body || item.message || '';
      const isUnread = !item.read_at && !item.is_read && !item.read;
      const date = item.created_at ? formatDate(item.created_at) : '';
      return `
        <article class="notification-item ${isUnread ? 'is-unread' : ''}">
          <b>${escapeHTML(title)}</b>
          ${body ? `<p>${escapeHTML(body)}</p>` : ''}
          ${date ? `<span>${escapeHTML(date)}</span>` : ''}
        </article>
      `;
    }).join('');
  }

  async function toggleNotificationPanel() {
    const panel = ensureNotificationPanel();
    if (!panel) {
      window.location.href = '/account/activity.html';
      return;
    }

    if (panel.hidden) {
      await refreshNotifications();
      openNotificationPanel();
    } else {
      closeNotificationPanel();
    }
  }

  function openNotificationPanel() {
    const panel = ensureNotificationPanel();
    const bell = document.querySelector('[data-action="notifications"]');
    if (!panel) return;
    panel.hidden = false;
    state.notificationPanelOpen = true;
    bell?.setAttribute('aria-expanded', 'true');
  }

  function closeNotificationPanel() {
    const panel = document.querySelector('[data-notification-panel]');
    const bell = document.querySelector('[data-action="notifications"]');
    if (panel) panel.hidden = true;
    state.notificationPanelOpen = false;
    bell?.setAttribute('aria-expanded', 'false');
  }

  async function markAllNotificationsRead() {
    await requestJSON(API.markAllNotificationsRead, { method: 'POST', body: JSON.stringify({}) }).catch((error) => {
      console.warn('[COSMOSKIN] Mark all notifications read failed:', error);
      throw error;
    });
    await refreshNotifications();
    toast('Bildirimler okundu olarak işaretlendi.');
  }

  function setPageLoading(isLoading) {
    state.isLoading = isLoading;
    document.documentElement.classList.toggle('account-dashboard-loading', isLoading);
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.classList.add('is-loading');
      button.textContent = 'İşleniyor...';
    } else {
      button.disabled = false;
      button.classList.remove('is-loading');
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function showDashboardError(message) {
    const target = document.querySelector('[data-dashboard-error]');
    if (target) {
      target.textContent = message;
      target.hidden = false;
      return;
    }

    toast(message);
  }

  function toast(message) {
    let el = document.querySelector('.cosmoskin-toast');

    if (!el) {
      el = document.createElement('div');
      el.className = 'cosmoskin-toast';
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.classList.add('is-visible');

    window.clearTimeout(el._hideTimer);
    el._hideTimer = window.setTimeout(() => {
      el.classList.remove('is-visible');
    }, 2800);
  }

  function getSkinBalanceLabel(score) {
    if (score >= 85) return 'Çok İyi';
    if (score >= 70) return 'Dengede';
    if (score >= 50) return 'Destek Gerekli';
    return 'Rutin Gerekli';
  }

  function getMetricLabel(score, fallback) {
    if (score === undefined || score === null) return fallback;
    const value = Number(score);

    if (value >= 80) return 'Dengede';
    if (value >= 60) return 'İyi';
    if (value >= 40) return 'Destek Gerekli';
    return 'Eksik';
  }

  function formatRoutineStreak(streak) {
    if (typeof streak === 'string') return streak;

    const current = streak?.current ?? streak?.days_completed ?? streak?.completed ?? 0;
    const target = streak?.target ?? streak?.weekly_target ?? 7;

    return `${current}/${target} gün`;
  }

  function estimateRemainingText(product) {
    const days = product.days_left ?? product.remaining_days ?? product.estimated_days_left;

    if (days === undefined || days === null) return 'Yakında bitecek';
    return `${days} gün içinde bitecek`;
  }

  function productPlaceholderSVG(type, size = 'default') {
    const isSmall = size === 'small';
    const width = isSmall ? 30 : 54;
    const height = isSmall ? 44 : 84;
    const label = String(type || '').toLowerCase();

    if (label.includes('cream') || label.includes('krem')) {
      return `<svg width="${width}" height="${height}" viewBox="0 0 54 84" aria-hidden="true"><rect x="8" y="32" width="38" height="34" rx="9" fill="#fff7ef" stroke="#d8c8ba"/><rect x="11" y="22" width="32" height="13" rx="3" fill="#171412"/><rect x="15" y="44" width="24" height="10" fill="#d5aa77"/></svg>`;
    }

    if (label.includes('serum') || label.includes('ampoule')) {
      return `<svg width="${width}" height="${height}" viewBox="0 0 54 84" aria-hidden="true"><rect x="22" y="3" width="10" height="17" rx="4" fill="#ece3db"/><rect x="15" y="19" width="24" height="55" rx="7" fill="#d3eeee" stroke="#a7cccc"/><rect x="19" y="41" width="16" height="14" fill="#fffaf5"/></svg>`;
    }

    if (label.includes('spf') || label.includes('sun') || label.includes('güneş')) {
      return `<svg width="${width}" height="${height}" viewBox="0 0 54 84" aria-hidden="true"><path d="M15 12h24l-5 62H20z" fill="#f5eee7" stroke="#d8c8ba"/><rect x="19" y="38" width="16" height="14" fill="#171412"/></svg>`;
    }

    return `<svg width="${width}" height="${height}" viewBox="0 0 54 84" aria-hidden="true"><rect x="18" y="8" width="18" height="64" rx="5" fill="#f3e9df" stroke="#d8c8ba"/><rect x="21" y="35" width="12" height="15" fill="#171412"/></svg>`;
  }

  function clampScore(value) {
    return Math.round(clamp(Number(value) || 0, 0, 100));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function numberFormat(value) {
    return new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
  }

  function moneyFormat(value) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(value));
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHTML(value).replaceAll('`', '&#096;');
  }
})();
