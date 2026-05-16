/*
 * COSMOSKIN — Skin Profile Store
 * Single source-of-truth for Cilt Profilim state.
 *
 * Canonical key: cosmoskin_skin_profile
 * Schema:
 *   {
 *     skinType:       string   // kuru | yagli | karma | hassas | normal
 *     sensitivity:    string   // dusuk | orta | yuksek
 *     primaryGoal:    string   // nem | bariyer | isilti | leke | akne | hassasiyet | gozenek | parlaklik
 *     secondaryGoal:  string   // same vocabulary; may be ''
 *     routineStyle:   string   // minimal | dengeli | kapsamli
 *     updatedAt:      string   // ISO timestamp
 *   }
 *
 * Backward compatibility: on first read, migrate from any of the legacy keys
 *   cosmoskin_routine_profile / cosmoskin_routine_active / cosmoskin_routine_preferences
 *   cosmoskin_routine_skin / cosmoskin_routine_goal
 * The legacy keys are NOT deleted (other modules still write them); the store
 * just projects into the canonical shape so widgets read one consistent value.
 *
 * API:
 *   window.CosmoskinSkinProfile.get()                -> profile object
 *   window.CosmoskinSkinProfile.save(partial)        -> profile object (broadcasts change)
 *   window.CosmoskinSkinProfile.subscribe(fn)        -> unsubscribe function
 *   window.CosmoskinSkinProfile.clear()              -> {}
 */
(function () {
  'use strict';

  var KEY = 'cosmoskin_skin_profile';
  var LEGACY_KEYS = [
    'cosmoskin_routine_active',
    'cosmoskin_routine_profile',
    'cosmoskin_routine_preferences',
    'cosmoskin_pending_routine_preferences'
  ];

  var SKIN_VOCAB = { kuru:1, yagli:1, karma:1, hassas:1, normal:1 };
  var SENS_VOCAB = { dusuk:1, orta:1, yuksek:1 };
  var GOAL_VOCAB = { nem:1, bariyer:1, isilti:1, leke:1, akne:1, hassasiyet:1, gozenek:1, parlaklik:1 };
  var STYLE_VOCAB = { minimal:1, dengeli:1, kapsamli:1 };

  var skinAliases = { dry:'kuru', oily:'yagli', combination:'karma', sensitive:'hassas', normal:'normal' };
  var goalAliases = {
    hydration:'nem', barrier:'bariyer', glow:'isilti', balance:'nem',
    dehydration:'nem', sensitivity:'hassasiyet', tone:'leke', blemish:'akne'
  };

  function readRaw(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function writeRaw(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function pick(value, vocab, fallback) {
    if (!value) return fallback || '';
    var v = String(value).toLowerCase();
    v = skinAliases[v] || goalAliases[v] || v;
    return vocab[v] ? v : (fallback || '');
  }

  function normalize(partial) {
    partial = partial || {};
    var goals = partial.selectedGoals || partial.goals || [];
    if (typeof goals === 'string') goals = goals.split(/[,+]/);
    goals = (Array.isArray(goals) ? goals : []).map(function (g) {
      g = String(g || '').toLowerCase(); return goalAliases[g] || g;
    });
    return {
      skinType:      pick(partial.skinType || partial.selectedSkinType || partial.skin, SKIN_VOCAB, ''),
      sensitivity:   pick(partial.sensitivity || partial.skinSensitivity, SENS_VOCAB, ''),
      primaryGoal:   pick(partial.primaryGoal || goals[0], GOAL_VOCAB, ''),
      secondaryGoal: pick(partial.secondaryGoal || goals[1], GOAL_VOCAB, ''),
      routineStyle:  pick(partial.routineStyle || partial.intensity || partial.style, STYLE_VOCAB, ''),
      updatedAt:     partial.updatedAt || new Date().toISOString()
    };
  }

  function migrateFromLegacy() {
    var current = readRaw(KEY);
    if (current && current.skinType) return current;
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      var legacy = readRaw(LEGACY_KEYS[i]);
      if (legacy) {
        var migrated = normalize(legacy);
        if (migrated.skinType || migrated.primaryGoal) {
          writeRaw(KEY, migrated);
          return migrated;
        }
      }
    }
    return current || {};
  }

  var listeners = [];
  function broadcast(profile) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](profile); } catch (e) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('cosmoskin:skin-profile-change', { detail: profile }));
    } catch (e) {}
  }

  function get() {
    var current = readRaw(KEY);
    if (!current || !current.skinType) return migrateFromLegacy();
    return current;
  }

  function save(partial) {
    var existing = get();
    var merged = normalize(Object.assign({}, existing, partial, { updatedAt: new Date().toISOString() }));
    writeRaw(KEY, merged);
    broadcast(merged);
    return merged;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    broadcast({});
    return {};
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
  }

  // Cross-tab sync via the storage event.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) {
      try { broadcast(JSON.parse(e.newValue)); } catch (err) {}
    }
  });

  window.CosmoskinSkinProfile = {
    get: get,
    save: save,
    clear: clear,
    subscribe: subscribe,
    normalize: normalize,
    KEY: KEY
  };
})();
