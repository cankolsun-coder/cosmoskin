(function () {
  'use strict';
  var ROUTINE_FILE_ROUTE = '/collections/routine.html';
  var ROUTINE_CLEAN_ROUTE = '/collections/routine';
  var ROUTINE_TARGET_ROUTE = ROUTINE_CLEAN_ROUTE;
  var PENDING_KEY = 'cosmoskin_pending_routine_preferences';

  function isRoutinePath(path) {
    return path === ROUTINE_CLEAN_ROUTE || path === ROUTINE_FILE_ROUTE || path === '/rutinler' || path === '/rutinler.html' || path === '/routine.html';
  }

  function normalizeTarget(rawHref) {
    var url;
    try { url = new URL(rawHref || ROUTINE_TARGET_ROUTE, window.location.origin); }
    catch (e) { url = new URL(ROUTINE_TARGET_ROUTE, window.location.origin); }
    if (!isRoutinePath(url.pathname.replace(/\/$/, ''))) return null;
    return ROUTINE_TARGET_ROUTE + (url.search || '') + (url.hash || '');
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

    var currentPath = window.location.pathname.replace(/\/$/, '');
    if (currentPath === ROUTINE_CLEAN_ROUTE || currentPath === ROUTINE_FILE_ROUTE) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    preserveHomeSmartRoutineSelection();
    event.preventDefault();
    window.location.assign(target);
  }, true);
})();
