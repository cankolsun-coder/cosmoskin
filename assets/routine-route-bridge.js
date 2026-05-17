(function () {
  'use strict';

  var ROUTINE_TARGET_ROUTE = '/account/routines/';
  var PENDING_KEY = 'cosmoskin_pending_routine_preferences';
  var ROUTINE_PATHS = [
    '/account/routines',
    '/account/routines/',
    '/account/routines.html',
    '/account/routine-profile',
    '/account/routine-profile/',
    '/account/routine-profile.html',
    '/account/routine-favorites',
    '/account/routine-favorites/',
    '/account/routine-favorites.html',
    '/account/routine-history',
    '/account/routine-history/',
    '/account/routine-history.html',
    '/account/routine-compare',
    '/account/routine-compare/',
    '/account/routine-compare.html',
    '/collections/routine',
    '/collections/routine.html',
    '/routine.html',
    '/rutinler',
    '/rutinler.html'
  ];

  function cleanPath(path) { return String(path || '').replace(/\/$/, ''); }
  function isRoutinePath(path) {
    var raw = String(path || '');
    return ROUTINE_PATHS.indexOf(raw) !== -1 || ROUTINE_PATHS.indexOf(cleanPath(raw)) !== -1;
  }
  function isCurrentRoutinePage() { return isRoutinePath(window.location.pathname); }

  function accountRouteFor(url) {
    var path = cleanPath(url.pathname);
    var requestedView = url.searchParams.get('tab') || url.searchParams.get('view');
    if (/routine-profile/.test(path) || requestedView === 'profile') return '/account/routine-profile/';
    if (/routine-favorites/.test(path) || requestedView === 'favorites') return '/account/routine-favorites/';
    if (/routine-history/.test(path) || requestedView === 'history') return '/account/routine-history/';
    if (/routine-compare/.test(path) || requestedView === 'compare') return '/account/routine-compare/';
    if (requestedView === 'recommendations') return '/account/routines/?tab=recommendations';
    return ROUTINE_TARGET_ROUTE;
  }

  function normalizeTarget(rawHref) {
    var url;
    try { url = new URL(rawHref || ROUTINE_TARGET_ROUTE, window.location.origin); }
    catch (e) { url = new URL(ROUTINE_TARGET_ROUTE, window.location.origin); }
    if (!isRoutinePath(url.pathname)) return null;
    var target = accountRouteFor(url);
    return target + (url.hash || '');
  }

  function readJSON(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function preserveHomeSmartRoutineSelection() {
    var existing = readJSON(PENDING_KEY, null) || {};
    var selectedGoals = [];
    var selectedSkinType = existing.selectedSkinType || existing.skinType || 'karma';
    var habit = existing.habit || existing.period || 'Sabah & Akşam';

    document.querySelectorAll('[data-sr-goal].is-active, [data-sr-goal][aria-pressed="true"], [data-routine-goal].is-active, [data-routine-goal][aria-pressed="true"]').forEach(function (el) {
      var value = el.getAttribute('data-sr-goal') || el.getAttribute('data-routine-goal');
      if (value && selectedGoals.indexOf(value) === -1) selectedGoals.push(value);
    });

    var skinActive = document.querySelector('[data-sr-skin].is-active, [data-sr-skin][aria-pressed="true"], [data-routine-skin].is-active, [data-routine-skin][aria-pressed="true"]');
    if (skinActive) selectedSkinType = skinActive.getAttribute('data-sr-skin') || skinActive.getAttribute('data-routine-skin') || selectedSkinType;

    var periodActive = document.querySelector('[data-sr-period].is-active, [data-sr-period][aria-pressed="true"], [data-routine-period].is-active, [data-routine-period][aria-pressed="true"]');
    if (periodActive) habit = periodActive.textContent && /akşam/i.test(periodActive.textContent) && !/sabah/i.test(periodActive.textContent) ? 'Sadece Akşam' : (/sabah/i.test(periodActive.textContent) && !/akşam/i.test(periodActive.textContent) ? 'Sadece Sabah' : 'Sabah & Akşam');

    if (!selectedGoals.length && Array.isArray(existing.selectedGoals)) selectedGoals = existing.selectedGoals;
    if (!selectedGoals.length) selectedGoals = ['nem', 'isilti'];

    writeJSON(PENDING_KEY, Object.assign({}, existing, {
      selectedGoals: selectedGoals,
      selectedSkinType: selectedSkinType,
      habit: habit,
      source: 'home-route-bridge',
      updatedAt: new Date().toISOString()
    }));
  }

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var target = normalizeTarget(anchor.getAttribute('href'));
    if (!target) return;
    if (isCurrentRoutinePage()) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    preserveHomeSmartRoutineSelection();
    event.preventDefault();
    window.location.assign(target);
  }, true);
})();
