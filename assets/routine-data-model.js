(function () {
  'use strict';

  var DRAFT_KEY = 'cosmoskin_routine_draft_v2';
  var LEGACY_DRAFT_KEYS = [
    'cosmoskin_pending_routine_preferences',
    'cosmoskin_last_routine',
    'cosmoskin_saved_routine',
    'cosmoskin_routine_active',
    'cosmoskin_routine_preferences'
  ];
  var ROUTINE_VERSION = '2026-07-routine-data-v1';

  var skinMap = {
    dry: 'kuru', kuru: 'kuru', 'kuru cilt': 'kuru', kuru_cilt: 'kuru',
    oily: 'yagli', yagli: 'yagli', yağlı: 'yagli', 'yağlı cilt': 'yagli', yagli_cilt: 'yagli',
    combination: 'karma', combo: 'karma', karma: 'karma', 'karma cilt': 'karma', karma_cilt: 'karma',
    normal: 'normal', 'normal cilt': 'normal', normal_cilt: 'normal',
    sensitive: 'hassas', hassas: 'hassas', 'hassas cilt': 'hassas', hassas_cilt: 'hassas'
  };
  var sensitivityMap = {
    low: 'dusuk', dusuk: 'dusuk', düşük: 'dusuk', 'düşük': 'dusuk',
    medium: 'orta', med: 'orta', orta: 'orta', normal: 'orta',
    high: 'yuksek', yuksek: 'yuksek', yüksek: 'yuksek', 'yüksek': 'yuksek'
  };
  var goalMap = {
    hydration: 'nem', nem: 'nem', 'nem desteği': 'nem', nem_destegi: 'nem', nem_desteği: 'nem',
    barrier: 'bariyer', bariyer: 'bariyer', 'bariyer desteği': 'bariyer', 'cilt konforu': 'bariyer',
    radiance: 'isilti', glow: 'isilti', isilti: 'isilti', ışılti: 'isilti', ışıltı: 'isilti', parlaklik: 'isilti', parlaklık: 'isilti',
    spot: 'leke', tone: 'leke', leke: 'leke', 'leke görünümü': 'leke', 'ton eşitsizliği': 'leke',
    acne: 'akne', akne: 'akne', blemish: 'akne', 'akne eğilimi': 'akne', 'sivilceye eğilim': 'akne',
    sensitivity: 'hassasiyet', hassasiyet: 'hassasiyet', sensitive: 'hassasiyet',
    pore: 'gozenek', pores: 'gozenek', gozenek: 'gozenek', gözenek: 'gozenek', 'gözenek görünümü ve sebum': 'gozenek'
  };
  var styleMap = {
    minimal: 'minimal', baslangic: 'minimal', başlangıç: 'minimal', simple: 'minimal',
    balanced: 'dengeli', balance: 'dengeli', dengeli: 'dengeli', orta: 'dengeli', medium: 'dengeli', tam: 'dengeli',
    advanced: 'kapsamli', kapsamli: 'kapsamli', kapsamlı: 'kapsamli', gelismis: 'kapsamli', gelişmiş: 'kapsamli'
  };
  var budgetMap = {
    basic: 'baslangic', başlangıç: 'baslangic', baslangic: 'baslangic', ekonomik: 'baslangic',
    balanced: 'dengeli', dengeli: 'dengeli', orta: 'dengeli',
    premium: 'premium', ileri: 'premium'
  };

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
  }
  function removeJSON(key) {
    try { localStorage.removeItem(key); } catch (error) {}
  }
  function clean(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 240);
  }
  function normToken(value, map, fallback) {
    var raw = clean(value, 120).toLocaleLowerCase('tr-TR').replace(/[\s-]+/g, '_');
    var spaced = clean(value, 120).toLocaleLowerCase('tr-TR');
    return map[raw] || map[spaced] || fallback || '';
  }
  function unique(values) {
    var out = [];
    (Array.isArray(values) ? values : [values]).forEach(function (value) {
      if (value == null || value === '') return;
      var v = clean(value, 120);
      if (v && out.indexOf(v) === -1) out.push(v);
    });
    return out;
  }
  function normalizeGoals(value, fallback) {
    var values = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[,+]/) : []);
    values = values.concat(Array.isArray(fallback) ? fallback : []);
    var mapped = values.map(function (goal) { return normToken(goal, goalMap, clean(goal, 80)); }).filter(Boolean);
    return unique(mapped);
  }
  function safeArray(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
  function nowISO() { return new Date().toISOString(); }

  function normalizeProduct(item, period, index) {
    if (!item) return null;
    if (typeof item === 'string') return { slug: item, id: item, routine_step: '', period: period || '', sort_order: index || 0 };
    var slug = item.slug || item.product_slug || item.productSlug || item.id || '';
    return {
      id: item.id || slug,
      slug: slug,
      product_slug: slug,
      name: item.name || item.product_name || item.title || '',
      brand: item.brand || 'COSMOSKIN',
      category: item.category || '',
      routine_step: item.routine_step || item.routineStep || item.step || item.label || '',
      period: item.period || item.am_pm || item.usageTime || period || '',
      price: Number(item.price || item.unit_price || 0) || 0,
      image: item.image || item.image_url || '',
      url: item.url || item.product_url || (slug ? '/products/' + slug + '.html' : ''),
      stock: item.stock_status || item.stockStatus || item.stock || '',
      sort_order: Number(item.sort_order != null ? item.sort_order : (index != null ? index : 0)) || 0
    };
  }

  function normalizeStep(item, period, index) {
    var product = item && item.product ? item.product : item;
    var p = normalizeProduct(product, period, index);
    return {
      id: item && (item.id || item.key) || (period || 'step') + '-' + (index || 0),
      label: clean(item && (item.label || item.step || item.routine_step) || (p && p.routine_step) || '', 120),
      routine_step: clean(item && (item.routine_step || item.routineStep) || (p && p.routine_step) || '', 120),
      period: period || (item && item.period) || '',
      description: clean(item && item.description || '', 240),
      product: p,
      sort_order: Number(item && item.sort_order != null ? item.sort_order : (index != null ? index : 0)) || 0
    };
  }

  function normalizeSteps(value, period) {
    return safeArray(value).map(function (item, index) { return normalizeStep(item, period, index); }).filter(function (step) {
      return Boolean(step.product && (step.product.slug || step.product.name)) || Boolean(step.label);
    });
  }

  function normalizeSkinProfile(input, options) {
    input = input || {};
    options = options || {};
    var goals = normalizeGoals(input.secondary_goals || input.secondaryGoals || input.concerns || input.skin_concerns || input.skinGoals || input.selectedGoals || input.goals, []);
    var primary = normToken(input.primary_goal || input.primaryGoal || input.routine_goal || input.routineGoal || goals[0], goalMap, goals[0] || '');
    goals = unique([primary].concat(goals)).filter(Boolean);
    var secondary = goals.filter(function (g) { return g !== primary; });
    var profile = {
      skin_type: normToken(input.skin_type || input.skinType || input.selectedSkinType || input.skin, skinMap, clean(input.skin_type || input.skinType || input.selectedSkinType || input.skin, 80)),
      sensitivity: normToken(input.sensitivity || input.skin_sensitivity || input.skinSensitivity || input.sensitivity_status, sensitivityMap, ''),
      primary_goal: primary,
      secondary_goals: secondary,
      routine_style: normToken(input.routine_style || input.routineStyle || input.routine_preference || input.intensity || input.preference || input.style, styleMap, clean(input.routine_style || input.routineStyle || input.intensity || input.preference || '', 80)),
      budget_band: normToken(input.budget_band || input.budgetBand || input.budget, budgetMap, clean(input.budget_band || input.budgetBand || input.budget || '', 80)),
      avoid_ingredients: unique(input.avoid_ingredients || input.avoidIngredients || input.avoid || input.avoided_ingredients || []),
      preferred_texture: clean(input.preferred_texture || input.preferredTexture || input.texture || '', 80),
      spf_habit: clean(input.spf_habit || input.spfHabit || input.spf || '', 80),
      answers: input.answers && typeof input.answers === 'object' ? input.answers : {},
      source_channel: clean(input.source_channel || input.sourceChannel || input.source || options.source_channel || options.source || 'smart-routine', 80),
      updated_at: input.updated_at || input.updatedAt || nowISO()
    };
    if (!profile.sensitivity && profile.skin_type === 'hassas') profile.sensitivity = 'orta';
    if (!profile.routine_style) profile.routine_style = 'dengeli';
    if (!profile.budget_band) profile.budget_band = 'dengeli';
    return profile;
  }

  function buildRoutineKey(profile, source) {
    var parts = [source || 'smart', profile.primary_goal || 'routine', profile.skin_type || 'skin', profile.routine_style || 'balanced'];
    return parts.map(function (part) { return clean(part, 60).toLowerCase().replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, '-').replace(/^-|-$/g, ''); }).join('-');
  }

  function collectProducts(morning, evening, weekly, recommended) {
    var seen = {};
    var out = [];
    function addProduct(product, period) {
      product = normalizeProduct(product, period, out.length);
      if (!product || !(product.slug || product.name)) return;
      var key = product.slug || product.name;
      if (seen[key]) return;
      seen[key] = true;
      out.push(product);
    }
    [morning, evening, weekly].forEach(function (steps, blockIndex) {
      var period = blockIndex === 0 ? 'morning' : blockIndex === 1 ? 'evening' : 'weekly';
      safeArray(steps).forEach(function (step) { addProduct(step && step.product ? step.product : step, period); });
    });
    safeArray(recommended).forEach(function (product) { addProduct(product, product && product.period); });
    return out;
  }

  function normalizeRoutineResult(input, options) {
    input = input || {};
    options = options || {};
    var rawResult = input.result && typeof input.result === 'object' ? input.result : input;
    var profile = normalizeSkinProfile(input.skin_profile_snapshot || input.skinProfileSnapshot || rawResult.skin_profile_snapshot || rawResult.profile || rawResult.preferences || input.profile || input, options);
    var morning = normalizeSteps(input.morning_steps || input.morningSteps || rawResult.morning_steps || rawResult.morning || rawResult.dayRoutine || input.dayRoutine, 'morning');
    var evening = normalizeSteps(input.evening_steps || input.eveningSteps || rawResult.evening_steps || rawResult.evening || rawResult.nightRoutine || input.nightRoutine, 'evening');
    var weekly = normalizeSteps(input.weekly_steps || input.weeklySteps || rawResult.weekly_steps || rawResult.weekly || [], 'weekly');
    var recommended = collectProducts(morning, evening, weekly, input.recommended_products || input.recommendedProducts || rawResult.recommended_products || rawResult.products || rawResult.uniqueProductSlugs || []);
    var score = Number(input.routine_score != null ? input.routine_score : (input.routineScore != null ? input.routineScore : (rawResult.routine_score != null ? rawResult.routine_score : (rawResult.score != null ? rawResult.score : (rawResult.matchScore != null ? rawResult.matchScore : (input.matchScore != null ? input.matchScore : 0))))));
    if (!Number.isFinite(score) || score <= 0) score = Math.min(98, Math.max(72, 70 + recommended.length * 4));
    var title = clean(input.routine_title || input.routineTitle || rawResult.routine_title || rawResult.title || rawResult.name || '', 140);
    if (!title) title = profile.primary_goal ? 'COSMOSKIN ' + profile.primary_goal + ' odaklı Akıllı Rutin' : 'COSMOSKIN Akıllı Rutin';
    var source = clean(input.source_channel || input.sourceChannel || rawResult.source_channel || rawResult.source || options.source_channel || options.source || 'smart-routine', 80);
    var payload = {
      routine_key: clean(input.routine_key || input.routineKey || rawResult.routine_key || rawResult.key || buildRoutineKey(profile, source), 120),
      routine_title: title,
      routine_score: Math.round(score),
      routine_version: clean(input.routine_version || input.routineVersion || rawResult.routine_version || ROUTINE_VERSION, 80),
      skin_profile_snapshot: profile,
      morning_steps: morning,
      evening_steps: evening,
      weekly_steps: weekly,
      recommended_products: recommended,
      alternative_products: safeArray(input.alternative_products || input.alternativeProducts || rawResult.alternative_products || rawResult.alternatives),
      conflict_warnings: unique(input.conflict_warnings || input.conflictWarnings || rawResult.conflict_warnings || rawResult.warnings || []),
      source_channel: source,
      is_active: input.is_active !== false,
      updated_at: input.updated_at || input.updatedAt || nowISO(),
      result: Object.assign({}, rawResult, {
        routine_score: Math.round(score),
        routine_version: input.routine_version || input.routineVersion || rawResult.routine_version || ROUTINE_VERSION,
        skin_profile_snapshot: profile,
        morning_steps: morning,
        evening_steps: evening,
        weekly_steps: weekly,
        recommended_products: recommended,
        source_channel: source,
        summary: clean(rawResult.summary || title + ' hesabınıza kaydedildi.', 240)
      })
    };
    return payload;
  }

  function buildDraft(input, options) {
    options = options || {};
    if (input && input.routine_result && input.skin_profile) {
      var existingRoutine = normalizeRoutineResult(input.routine_result, { source: input.source_channel || options.source || options.source_channel || input.routine_result.source_channel });
      var existingProfile = normalizeSkinProfile(input.skin_profile || existingRoutine.skin_profile_snapshot, { source: input.source_channel || existingRoutine.source_channel });
      existingRoutine.skin_profile_snapshot = existingProfile;
      return {
        version: input.version || ROUTINE_VERSION,
        status: options.status || input.status || 'pending',
        source_channel: existingRoutine.source_channel,
        created_at: input.created_at || options.created_at || nowISO(),
        updated_at: nowISO(),
        skin_profile: existingProfile,
        routine_result: existingRoutine
      };
    }
    var routine = normalizeRoutineResult(input, options);
    return {
      version: ROUTINE_VERSION,
      status: options.status || 'pending',
      source_channel: routine.source_channel,
      created_at: options.created_at || nowISO(),
      updated_at: nowISO(),
      skin_profile: routine.skin_profile_snapshot,
      routine_result: routine
    };
  }

  function saveDraft(input, options) {
    var draft = buildDraft(input, options);
    writeJSON(DRAFT_KEY, draft);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (error) {}
    if (window.COSMOSKINSkinProfile && typeof window.COSMOSKINSkinProfile.save === 'function') {
      try {
        window.COSMOSKINSkinProfile.save({
          skinType: draft.skin_profile.skin_type,
          sensitivity: draft.skin_profile.sensitivity,
          primaryGoal: draft.skin_profile.primary_goal,
          secondaryGoal: draft.skin_profile.secondary_goals[0] || '',
          routineStyle: draft.skin_profile.routine_style,
          updatedAt: draft.skin_profile.updated_at
        });
      } catch (error) {}
    }
    try { window.dispatchEvent(new CustomEvent('cosmoskin:routine-draft-saved', { detail: draft })); } catch (error) {}
    return draft;
  }

  function getDraft(includeLegacy) {
    var draft = readJSON(DRAFT_KEY, null);
    if (!draft) {
      try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (error) { draft = null; }
    }
    if (draft && draft.routine_result) return draft;
    if (includeLegacy !== false) {
      for (var i = 0; i < LEGACY_DRAFT_KEYS.length; i += 1) {
        var legacy = readJSON(LEGACY_DRAFT_KEYS[i], null);
        if (legacy) return saveDraft(legacy, { source: legacy.source || 'legacy-local-draft' });
      }
    }
    return null;
  }

  function clearDraft() {
    removeJSON(DRAFT_KEY);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (error) {}
  }

  function markDraftSynced(saved) {
    var draft = getDraft(false);
    if (!draft) return null;
    draft.status = 'synced';
    draft.synced_at = nowISO();
    draft.remote_skin_profile_id = saved && saved.skin_profile && saved.skin_profile.id || draft.remote_skin_profile_id || null;
    draft.remote_routine_result_id = saved && saved.routine_result && saved.routine_result.id || draft.remote_routine_result_id || null;
    writeJSON(DRAFT_KEY, draft);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (error) {}
    return draft;
  }

  async function getSession() {
    var client = window.cosmoskinSupabase;
    if (!client && window.supabase && window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.supabaseUrl && window.COSMOSKIN_CONFIG.supabaseAnonKey) {
      try { client = window.cosmoskinSupabase = window.supabase.createClient(window.COSMOSKIN_CONFIG.supabaseUrl, window.COSMOSKIN_CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); } catch (error) {}
    }
    if (!client || !client.auth || typeof client.auth.getSession !== 'function') return null;
    try {
      var result = await client.auth.getSession();
      return result && result.data && result.data.session || null;
    } catch (error) { return null; }
  }

  function apiBase() {
    return String(window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase || '/api').replace(/\/$/, '');
  }

  async function apiFetch(path, token, body) {
    var res = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || 'Rutin verisi kaydedilemedi.');
    return data;
  }

  async function saveToAccount(input, session) {
    session = session || await getSession();
    if (!session || !session.access_token) {
      var draft = saveDraft(input, { status: 'pending-auth', source: input && input.source_channel || input && input.source || 'smart-routine' });
      return { ok: false, needsAuth: true, draft: draft };
    }
    var draft = input && input.routine_result ? input : buildDraft(input, { status: 'saving', source: input && input.source_channel || input && input.source || 'smart-routine' });
    var skinPayload = draft.skin_profile || normalizeSkinProfile(draft, { source: draft.source_channel });
    var routinePayload = draft.routine_result || normalizeRoutineResult(draft, { source: draft.source_channel });
    var skinRes = await apiFetch('/account/skin-profile', session.access_token, skinPayload);
    if (skinRes && skinRes.skin_profile && skinRes.skin_profile.id) routinePayload.skin_profile_id = skinRes.skin_profile.id;
    var routineRes = await apiFetch('/account/routine-results', session.access_token, routinePayload);
    var saved = { ok: true, skin_profile: skinRes.skin_profile || null, routine_result: routineRes.routine_result || routineRes.routine || null };
    markDraftSynced(saved);
    clearDraft();
    try { window.dispatchEvent(new CustomEvent('cosmoskin:routine-synced', { detail: saved })); } catch (error) {}
    return saved;
  }

  async function syncPendingDraft(session) {
    var draft = getDraft(false);
    if (!draft || draft.status === 'synced') return { ok: true, skipped: true };
    return await saveToAccount(draft, session);
  }

  function homeStateToDraft(state) {
    state = state || {};
    return buildDraft({
      selectedGoals: state.selectedGoals || [],
      selectedSkinType: state.selectedSkinType || state.skinType || 'karma',
      sensitivity: state.sensitivity || 'orta',
      routine_style: state.preference || state.intensity || 'dengeli',
      dayRoutine: state.dayRoutine || [],
      nightRoutine: state.nightRoutine || [],
      recommended_products: state.recommended_products || [],
      totalPrice: state.totalPrice,
      routine_score: state.matchScore,
      source_channel: state.source_channel || state.source || 'home-smart-routine',
      updated_at: nowISO()
    }, { source: state.source_channel || state.source || 'home-smart-routine' });
  }

  window.COSMOSKINRoutineData = {
    DRAFT_KEY: DRAFT_KEY,
    ROUTINE_VERSION: ROUTINE_VERSION,
    normalizeSkinProfile: normalizeSkinProfile,
    normalizeRoutineResult: normalizeRoutineResult,
    buildDraft: buildDraft,
    homeStateToDraft: homeStateToDraft,
    saveDraft: saveDraft,
    getDraft: getDraft,
    clearDraft: clearDraft,
    markDraftSynced: markDraftSynced,
    getSession: getSession,
    saveToAccount: saveToAccount,
    syncPendingDraft: syncPendingDraft
  };
})();
