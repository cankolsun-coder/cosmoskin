import { ApiError } from './api-response.js';
import { eq, inFilter } from './supabase-server.js';

const DEFAULT_TIMEZONE = 'Europe/Istanbul';
const MAX_CART_ITEM_QTY = 10;
const ROUTINE_COMPLETION_POINTS = 10;
const ROUTINE_REWARD_SOURCE_TYPE = 'reward';
const NOTIFICATION_LIMIT = 10;
const RECOMMENDATION_LIMIT = 8;
const RUNNING_OUT_LIMIT = 8;

const ROUTINE_LABELS = {
  cleanser: 'Temizleme',
  essence: 'Essence',
  serum: 'Serum',
  treatment: 'Hedef Bakım',
  moisturizer: 'Nemlendirici',
  sunscreen: 'SPF',
  mask: 'Maske'
};

const PERIOD_LABELS = {
  morning: 'Sabah',
  evening: 'Akşam'
};

export async function buildDashboard(api) {
  const profile = await loadProfile(api);

  const [
    membership,
    routine,
    skinScore,
    routineStreak,
    runningOutSoon,
    points,
    lastOrder
  ] = await Promise.all([
    loadMembership(api),
    loadTodayRoutine(api, { profile }),
    loadSkinScore(api),
    loadRoutineStreak(api, { profile }),
    loadRunningOutSoon(api, { profile }),
    loadPoints(api),
    loadLastOrder(api)
  ]);

  const derivedNotificationsPromise = ensureDerivedNotifications(api, { profile, runningOutSoon, routineStreak }).catch((error) => {
    console.warn('Derived notifications skipped:', error?.message || error);
  });
  const recommendationsPromise = loadPersonalizedRecommendations(api, { profile, runningOutSoon });
  const rewardsPromise = loadRewards(api, { points });
  const [recommendations, rewards] = await Promise.all([
    recommendationsPromise,
    rewardsPromise,
    derivedNotificationsPromise
  ]).then(([recommendationsResult, rewardsResult]) => [recommendationsResult, rewardsResult]);
  const freshNotifications = await loadNotifications(api, { limit: NOTIFICATION_LIMIT });

  return {
    profile,
    membership,
    todayPlan: buildTodayPlan(profile, routine, skinScore, routineStreak, points),
    routine,
    skinScore,
    routineStreak,
    runningOutSoon,
    recommendations,
    points,
    rewards,
    lastOrder,
    notifications: freshNotifications
  };
}

export async function loadProfile(api) {
  const row = await api.userDb.maybeSingle('profiles', {
    select: 'user_id,email,first_name,last_name,avatar_url,phone,birthdate,gender,locale,timezone,created_at,updated_at',
    user_id: eq(api.user.id)
  });

  const meta = api.user.user_metadata || {};
  const firstName = row?.first_name || meta.first_name || meta.firstName || '';
  const lastName = row?.last_name || meta.last_name || meta.lastName || '';
  const email = row?.email || api.user.email || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0] || 'COSMOSKIN Üyesi';
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toLocaleUpperCase('tr-TR')
    || email.slice(0, 1).toLocaleUpperCase('tr-TR')
    || 'C';

  if (!row && email) {
    await api.adminDb.insert('profiles', {
      user_id: api.user.id,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
      avatar_url: meta.avatar_url || null,
      phone: meta.phone || null,
      birthdate: meta.birthdate || null,
      gender: normalizeGender(meta.gender),
      locale: 'tr-TR',
      timezone: DEFAULT_TIMEZONE
    }, { returning: false }).catch((error) => {
      console.warn('Profile bootstrap skipped:', error?.message || error);
    });
  }

  return {
    userId: api.user.id,
    email,
    firstName,
    lastName,
    fullName,
    initials,
    avatarUrl: row?.avatar_url || meta.avatar_url || null,
    phone: row?.phone || meta.phone || null,
    birthdate: row?.birthdate || meta.birthdate || null,
    gender: row?.gender || normalizeGender(meta.gender),
    locale: row?.locale || 'tr-TR',
    timezone: row?.timezone || DEFAULT_TIMEZONE,
    createdAt: row?.created_at || api.user.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

export async function loadMembership(api) {
  const account = await api.userDb.maybeSingle('loyalty_accounts', {
    select: 'user_id,current_points,pending_points,lifetime_points,lifetime_spend,tier_id,updated_at',
    user_id: eq(api.user.id)
  });

  let tier = null;
  if (account?.tier_id) {
    tier = await api.adminDb.maybeSingle('membership_tiers', {
      select: 'id,slug,label_tr,min_lifetime_spend,points_multiplier,benefits,sort_order',
      id: eq(account.tier_id)
    });
  }
  if (!tier) {
    tier = await api.adminDb.maybeSingle('membership_tiers', {
      select: 'id,slug,label_tr,min_lifetime_spend,points_multiplier,benefits,sort_order',
      slug: eq('member')
    });
  }

  return {
    tier: serializeTier(tier),
    currentPoints: Number(account?.current_points || 0),
    pendingPoints: Number(account?.pending_points || 0),
    lifetimePoints: Number(account?.lifetime_points || 0),
    lifetimeSpend: Number(account?.lifetime_spend || 0),
    updatedAt: account?.updated_at || null
  };
}

export async function loadPoints(api) {
  const [account, ledger] = await Promise.all([
    api.userDb.maybeSingle('loyalty_accounts', {
      select: 'current_points,pending_points,lifetime_points,lifetime_spend,tier_id,updated_at',
      user_id: eq(api.user.id)
    }),
    api.userDb.select('loyalty_ledger', {
      select: 'id,points,type,status,source_type,source_id,event_key,idempotency_key,description_tr,available_at,expires_at,created_at',
      user_id: eq(api.user.id),
      order: 'created_at.desc',
      limit: 12
    })
  ]);

  let tier = null;
  if (account?.tier_id) {
    tier = await api.adminDb.maybeSingle('membership_tiers', {
      select: 'id,slug,label_tr,points_multiplier,min_lifetime_spend,benefits',
      id: eq(account.tier_id)
    });
  }

  return {
    currentPoints: Number(account?.current_points || 0),
    pendingPoints: Number(account?.pending_points || 0),
    lifetimePoints: Number(account?.lifetime_points || 0),
    lifetimeSpend: Number(account?.lifetime_spend || 0),
    membershipTier: serializeTier(tier),
    recentTransactions: (ledger || []).map((item) => ({
      id: item.id,
      points: Number(item.points || 0),
      type: item.type,
      status: item.status,
      sourceType: item.source_type,
      sourceId: item.source_id,
      eventKey: item.event_key || item.idempotency_key,
      description: item.description_tr || defaultLedgerDescription(item),
      availableAt: item.available_at,
      expiresAt: item.expires_at,
      createdAt: item.created_at
    }))
  };
}

export async function loadRewards(api, { points = null } = {}) {
  const pointsData = points || await loadPoints(api);
  const [rewards, redemptions] = await Promise.all([
    api.adminDb.select('rewards', {
      select: 'id,slug,title_tr,required_points,discount_type,discount_value,is_active,starts_at,ends_at,metadata',
      is_active: 'eq.true',
      order: 'required_points.asc'
    }),
    api.userDb.select('reward_redemptions', {
      select: 'id,reward_id,status,coupon_code,points_spent,created_at',
      user_id: eq(api.user.id),
      status: 'in.(created,used)',
      order: 'created_at.desc',
      limit: 50
    })
  ]);

  const now = Date.now();
  const claimedRewardIds = new Set((redemptions || [])
    .filter((item) => item.status === 'created')
    .map((item) => item.reward_id));

  const items = (rewards || [])
    .filter((reward) => (!reward.starts_at || Date.parse(reward.starts_at) <= now) && (!reward.ends_at || Date.parse(reward.ends_at) > now))
    .map((reward) => {
      const requiredPoints = Number(reward.required_points || 0);
      const available = pointsData.currentPoints >= requiredPoints && !claimedRewardIds.has(reward.id);
      return {
        id: reward.id,
        slug: reward.slug,
        title: reward.title_tr,
        requiredPoints,
        discountType: reward.discount_type,
        discountValue: Number(reward.discount_value || 0),
        available,
        alreadyClaimed: claimedRewardIds.has(reward.id),
        pointsRemaining: Math.max(0, requiredPoints - pointsData.currentPoints),
        metadata: reward.metadata || {}
      };
    });

  const nextReward = items.find((item) => !item.available && !item.alreadyClaimed) || items[0] || null;
  return {
    currentPoints: pointsData.currentPoints,
    nextReward: nextReward ? {
      id: nextReward.id,
      title: nextReward.title,
      requiredPoints: nextReward.requiredPoints,
      pointsRemaining: nextReward.pointsRemaining,
      progressPercent: nextReward.requiredPoints > 0
        ? Math.min(100, Math.floor((pointsData.currentPoints / nextReward.requiredPoints) * 100))
        : 0
    } : null,
    items
  };
}

export async function claimReward(api, payload = {}) {
  const reward = await resolveReward(api, payload);
  if (!reward) throw new ApiError('REWARD_NOT_FOUND', 'Ödül bulunamadı.', 404);
  if (!reward.is_active) throw new ApiError('REWARD_INACTIVE', 'Bu ödül şu anda aktif değil.', 409);
  if (reward.starts_at && Date.parse(reward.starts_at) > Date.now()) throw new ApiError('REWARD_NOT_STARTED', 'Bu ödül henüz başlamadı.', 409);
  if (reward.ends_at && Date.parse(reward.ends_at) <= Date.now()) throw new ApiError('REWARD_EXPIRED', 'Bu ödülün süresi doldu.', 409);

  const account = await api.userDb.maybeSingle('loyalty_accounts', {
    select: 'current_points',
    user_id: eq(api.user.id)
  });
  const requiredPoints = Number(reward.required_points || 0);
  if (Number(account?.current_points || 0) < requiredPoints) {
    throw new ApiError('INSUFFICIENT_POINTS', 'Bu ödül için yeterli puanın yok.', 409);
  }

  const eventKey = `reward_claim:${api.user.id}:${reward.id}`;
  const existingLedger = await api.adminDb.maybeSingle('loyalty_ledger', {
    select: 'id',
    user_id: eq(api.user.id),
    event_key: eq(eventKey)
  });
  if (existingLedger) throw new ApiError('DUPLICATE_REWARD_CLAIM', 'Bu ödül daha önce talep edilmiş.', 409);

  const existingRedemption = await api.adminDb.maybeSingle('reward_redemptions', {
    select: 'id,coupon_code,status,created_at',
    user_id: eq(api.user.id),
    reward_id: eq(reward.id),
    status: 'eq.created'
  });
  if (existingRedemption) {
    throw new ApiError('DUPLICATE_REWARD_CLAIM', 'Bu ödül için aktif bir kuponun zaten var.', 409, existingRedemption);
  }

  const couponCode = createCouponCode(reward);
  const redemption = await api.adminDb.insert('reward_redemptions', {
    user_id: api.user.id,
    reward_id: reward.id,
    points_spent: requiredPoints,
    coupon_code: couponCode,
    status: 'created'
  });

  const ledger = await insertLoyaltyLedgerOnce(api, {
      user_id: api.user.id,
      points: -requiredPoints,
      type: 'redeem',
      status: 'available',
      source_type: 'reward',
      source_id: redemption.id,
      event_key: eventKey,
      idempotency_key: eventKey,
      description_tr: `${reward.title_tr} ödülü talep edildi`,
      available_at: new Date().toISOString()
    });

  if (!ledger) {
    await api.adminDb.update('reward_redemptions', { id: eq(redemption.id) }, { status: 'cancelled' }, { returning: false }).catch(() => {});
    throw new ApiError('DUPLICATE_REWARD_CLAIM', 'Bu ödül daha önce talep edilmiş.', 409);
  }

  await api.adminDb.rpc('recalculate_loyalty_account', { p_user_id: api.user.id }).catch(() => {});
  return {
    redemption: {
      id: redemption.id,
      rewardId: reward.id,
      title: reward.title_tr,
      couponCode,
      pointsSpent: requiredPoints,
      status: 'created'
    },
    points: await loadPoints(api)
  };
}

export async function loadNotifications(api, { limit = NOTIFICATION_LIMIT } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || NOTIFICATION_LIMIT), 1), 50);
  const [items, unreadCount] = await Promise.all([
    api.userDb.select('notifications', {
      select: 'id,type,title,body,action_label,action_url,source_type,source_id,metadata,read_status,is_read,read_at,expires_at,created_at',
      user_id: eq(api.user.id),
      order: 'created_at.desc',
      limit: safeLimit
    }),
    api.userDb.count('notifications', {
      user_id: eq(api.user.id),
      is_read: 'eq.false'
    })
  ]);

  return {
    unreadCount,
    items: (items || []).map(serializeNotification)
  };
}

export async function markNotificationsRead(api, payload = {}) {
  const now = new Date().toISOString();
  const patch = {
    read_status: 'read',
    is_read: true,
    read_at: now,
    read_by_user_id: api.user.id,
    read_source: 'api'
  };

  if (payload.readAll === true) {
    await api.adminDb.update('notifications', {
      user_id: eq(api.user.id),
      is_read: 'eq.false'
    }, patch, { returning: false });
  } else {
    const ids = Array.isArray(payload.notificationIds)
      ? payload.notificationIds
      : [payload.notificationId || payload.id].filter(Boolean);
    if (!ids.length) throw new ApiError('NOTIFICATION_ID_REQUIRED', 'Okundu işaretlenecek bildirim bulunamadı.', 400);
    await api.adminDb.update('notifications', {
      user_id: eq(api.user.id),
      id: inFilter(ids)
    }, patch, { returning: false });
  }

  return loadNotifications(api, { limit: payload.limit || NOTIFICATION_LIMIT });
}

export async function ensureDerivedNotifications(api, { profile = null, runningOutSoon = null, routineStreak = null } = {}) {
  const [orders, ledger, runningOut, streak] = await Promise.all([
    api.adminDb.select('orders', {
      select: 'id,order_number,status,shipped_at,created_at',
      user_id: eq(api.user.id),
      status: 'eq.shipped',
      order: 'shipped_at.desc.nullslast,created_at.desc',
      limit: 5
    }),
    api.adminDb.select('loyalty_ledger', {
      select: 'id,points,type,status,source_type,source_id,created_at',
      user_id: eq(api.user.id),
      type: 'eq.earn',
      status: 'eq.available',
      points: 'gt.0',
      order: 'created_at.desc',
      limit: 5
    }),
    runningOutSoon ? Promise.resolve({ ...runningOutSoon, items: (runningOutSoon.items || []).slice(0, 5) }) : loadRunningOutSoon(api, { profile, limit: 5, skipDerivedNotifications: true }),
    routineStreak ? Promise.resolve({
      current_streak: routineStreak.current,
      best_streak: routineStreak.best,
      week_start_date: routineStreak.weekStartDate,
      last_completed_date: routineStreak.lastCompletedDate
    }) : api.adminDb.maybeSingle('routine_streaks', {
      select: 'current_streak,best_streak,week_start_date,last_completed_date',
      user_id: eq(api.user.id)
    })
  ]);

  const candidates = [];
  for (const order of orders || []) {
    candidates.push({
      type: 'order_shipped',
      title: 'Siparişin kargoya verildi',
      body: `${order.order_number || 'Siparişin'} yolda. Takip detaylarını siparişlerinde görebilirsin.`,
      action_label: 'Siparişi Gör',
      action_url: '/account/profile.html?tab=orders',
      source_type: 'order',
      source_id: `${order.id}:shipped`,
      metadata: { orderId: order.id, orderNumber: order.order_number }
    });
  }
  for (const item of ledger || []) {
    candidates.push({
      type: 'points_earned',
      title: 'Yeni puan kazandın',
      body: `${Number(item.points || 0)} puan hesabına eklendi.`,
      action_label: 'Puanlarımı Gör',
      action_url: '/account/profile.html?tab=points',
      source_type: 'loyalty_ledger',
      source_id: item.id,
      metadata: { points: Number(item.points || 0), sourceType: item.source_type, sourceId: item.source_id }
    });
  }
  for (const item of runningOut.items || []) {
    candidates.push({
      type: 'product_depletion',
      title: `${item.product.routineCategory === 'sunscreen' ? 'SPF ürünün' : 'Ürünün'} yakında bitebilir`,
      body: `${item.product.name} için tahmini ${item.estimatedDaysLeft} gün kaldı.`,
      action_label: 'Yeniden Sipariş Ver',
      action_url: '/account/profile.html?tab=overview',
      source_type: 'inventory',
      source_id: item.inventoryId,
      metadata: { productId: item.product.id, estimatedDaysLeft: item.estimatedDaysLeft }
    });
  }
  if (streak?.current_streak && [3, 5, 7, 14, 30].includes(Number(streak.current_streak))) {
    candidates.push({
      type: 'routine_streak',
      title: 'Rutin serin devam ediyor',
      body: `${streak.current_streak} günlük rutin serini koruyorsun.`,
      action_label: 'Rutine Devam Et',
      action_url: '/account/profile.html?tab=routines',
      source_type: 'routine_streak',
      source_id: `${api.user.id}:${streak.current_streak}:${streak.last_completed_date || streak.week_start_date || ''}`,
      metadata: { currentStreak: Number(streak.current_streak || 0) }
    });
  }

  await insertMissingNotifications(api, candidates);
}

export async function loadTodayRoutine(api, { profile = null } = {}) {
  const resolvedProfile = profile || await loadProfile(api);
  const timezone = resolvedProfile.timezone || DEFAULT_TIMEZONE;
  const today = getLocalDate(timezone);
  const routine = await api.userDb.maybeSingle('routines', {
    select: 'id,name,status,source,created_at,updated_at',
    user_id: eq(api.user.id),
    status: 'eq.active',
    order: 'created_at.desc'
  });

  if (!routine) {
    return {
      date: today,
      timezone,
      routine: null,
      periods: emptyRoutinePeriods(),
      completion: { completedRequired: 0, totalRequired: 0, status: 'empty' }
    };
  }

  const steps = await api.userDb.select('routine_steps', {
    select: 'id,routine_id,period,step_order,routine_category,product_id,custom_product_name,is_required,frequency_rule',
    routine_id: eq(routine.id),
    order: 'period.asc,step_order.asc'
  });
  const periodCompletionDates = {
    morning: getCompletionDateForPeriod('morning', timezone),
    evening: getCompletionDateForPeriod('evening', timezone)
  };
  const completionDates = Array.from(new Set(Object.values(periodCompletionDates)));
  const completions = await api.userDb.select('routine_completions', {
    select: 'routine_step_id,status,period,completion_date,completed_at',
    user_id: eq(api.user.id),
    routine_id: eq(routine.id),
    completion_date: inFilter(completionDates)
  });
  const productMap = await loadProductsMap(api, (steps || []).map((step) => step.product_id));
  const completionMap = new Map((completions || [])
    .filter((item) => item.completion_date === periodCompletionDates[item.period])
    .map((item) => [item.routine_step_id, item]));
  const serializedSteps = (steps || []).map((step) => serializeRoutineStep(step, productMap.get(step.product_id), completionMap.get(step.id), periodCompletionDates[step.period]));

  const periods = ['morning', 'evening'].map((period) => ({
    key: period,
    label: PERIOD_LABELS[period],
    steps: serializedSteps.filter((step) => step.period === period)
  }));
  const required = serializedSteps.filter((step) => step.isRequired);
  const completedRequired = required.filter((step) => step.status === 'completed' || step.status === 'skipped').length;

  return {
    date: today,
    timezone,
    routine: {
      id: routine.id,
      name: routine.name,
      source: routine.source,
      status: routine.status
    },
    periods,
    completion: {
      completedRequired,
      totalRequired: required.length,
      status: required.length === 0 ? 'empty' : completedRequired === required.length ? 'complete' : completedRequired > 0 ? 'partial' : 'missing'
    }
  };
}

export async function completeRoutineStep(api, payload = {}) {
  const stepId = payload.stepId || payload.routineStepId;
  if (!stepId) throw new ApiError('STEP_ID_REQUIRED', 'Rutin adımı gerekli.', 400);

  const step = await loadOwnedRoutineStep(api, stepId);
  const profile = await loadProfile(api);
  const completionDate = getCompletionDateForPeriod(step.period, profile.timezone || DEFAULT_TIMEZONE);
  const existing = await findRoutineCompletions(api, [step.id], completionDate);
  if (existing.has(step.id)) {
    throw new ApiError('ROUTINE_STEP_ALREADY_COMPLETED', 'Bu rutin adımı bugün zaten tamamlandı.', 409);
  }
  await insertRoutineCompletions(api, [{
    user_id: api.user.id,
    routine_id: step.routine_id,
    routine_step_id: step.id,
    completion_date: completionDate,
    period: step.period,
    status: payload.status === 'skipped' ? 'skipped' : 'completed',
    completed_at: new Date().toISOString()
  }]);

  await api.adminDb.rpc('recalculate_routine_streak', { p_user_id: api.user.id, p_anchor_date: completionDate }).catch(() => {});
  return {
    routine: await loadTodayRoutine(api, { profile }),
    routineStreak: await loadRoutineStreak(api, { profile })
  };
}

export async function completeRoutine(api, payload = {}) {
  const profile = await loadProfile(api);
  const timezone = profile.timezone || DEFAULT_TIMEZONE;
  const todayRoutine = await loadTodayRoutine(api, { profile });
  if (!todayRoutine.routine?.id) throw new ApiError('ROUTINE_NOT_FOUND', 'Aktif rutin bulunamadı.', 404);

  const targetPeriod = payload.period && ['morning', 'evening'].includes(payload.period) ? payload.period : null;
  const requiredSteps = todayRoutine.periods
    .flatMap((period) => period.steps)
    .filter((step) => step.isRequired && (!targetPeriod || step.period === targetPeriod));
  if (!requiredSteps.length) throw new ApiError('ROUTINE_REQUIRED_STEPS_EMPTY', 'Tamamlanacak zorunlu rutin adımı bulunamadı.', 409);

  const now = new Date();
  const rows = requiredSteps.map((step) => ({
    user_id: api.user.id,
    routine_id: todayRoutine.routine.id,
    routine_step_id: step.id,
    completion_date: getCompletionDateForPeriod(step.period, timezone, now),
    period: step.period,
    status: 'completed',
    completed_at: now.toISOString()
  }));
  const existing = await findRoutineCompletions(api, rows.map((row) => row.routine_step_id), null, rows);
  const missingRows = rows.filter((row) => !existing.has(`${row.routine_step_id}:${row.completion_date}`));
  if (!missingRows.length) {
    throw new ApiError('ROUTINE_ALREADY_COMPLETED', 'Bu rutin bugün zaten tamamlandı.', 409);
  }
  await insertRoutineCompletions(api, missingRows);

  const anchorDate = targetPeriod
    ? getCompletionDateForPeriod(targetPeriod, timezone, now)
    : getLocalDate(timezone, now);
  await api.adminDb.rpc('recalculate_routine_streak', { p_user_id: api.user.id, p_anchor_date: anchorDate }).catch(() => {});
  const award = await awardRoutineCompletionIfEligible(api, todayRoutine.routine.id, anchorDate);
  await ensureDerivedNotifications(api);

  return {
    routine: await loadTodayRoutine(api, { profile }),
    routineStreak: await loadRoutineStreak(api, { profile }),
    pointsAward: award,
    points: await loadPoints(api)
  };
}

export async function loadRoutineStreak(api, { profile = null } = {}) {
  const resolvedProfile = profile || await loadProfile(api);
  const today = getLocalDate(resolvedProfile.timezone || DEFAULT_TIMEZONE);
  const row = await api.userDb.maybeSingle('routine_streaks', {
    select: 'current_streak,best_streak,weekly_completed_days,week_start_date,last_completed_date,updated_at',
    user_id: eq(api.user.id)
  });
  const weekStart = row?.week_start_date || startOfWeekDate(today);
  return {
    current: Number(row?.current_streak || 0),
    best: Number(row?.best_streak || 0),
    weeklyCompletedDays: Number(row?.weekly_completed_days || 0),
    target: 7,
    weekStartDate: weekStart,
    lastCompletedDate: row?.last_completed_date || null,
    weeklyDots: buildWeeklyDots(weekStart, Number(row?.weekly_completed_days || 0)),
    updatedAt: row?.updated_at || null
  };
}

export async function loadSkinScore(api) {
  const row = await api.userDb.maybeSingle('skin_scores', {
    select: 'id,overall_score,moisture_score,barrier_score,spf_score,source,calculation_context,calculated_at',
    user_id: eq(api.user.id),
    order: 'calculated_at.desc'
  });
  if (!row) {
    return {
      score: null,
      maxScore: 100,
      source: null,
      calculatedAt: null,
      breakdown: [
        { key: 'moisture', label: 'Nem', score: null },
        { key: 'barrier', label: 'Bariyer', score: null },
        { key: 'spf', label: 'SPF', score: null }
      ]
    };
  }
  return {
    id: row.id,
    score: Number(row.overall_score || 0),
    maxScore: 100,
    source: row.source,
    calculatedAt: row.calculated_at,
    breakdown: [
      { key: 'moisture', label: 'Nem', score: Number(row.moisture_score || 0) },
      { key: 'barrier', label: 'Bariyer', score: Number(row.barrier_score || 0) },
      { key: 'spf', label: 'SPF', score: Number(row.spf_score || 0) }
    ],
    context: row.calculation_context || {}
  };
}

export async function loadRunningOutSoon(api, { profile = null, limit = RUNNING_OUT_LIMIT, skipDerivedNotifications = false } = {}) {
  const resolvedProfile = profile || await loadProfile(api);
  const today = getLocalDate(resolvedProfile.timezone || DEFAULT_TIMEZONE);
  const preferences = await api.userDb.maybeSingle('notification_preferences', {
    select: 'depletion_lead_days,low_stock_alerts,restock_reminders',
    user_id: eq(api.user.id)
  });
  const leadDays = Number(preferences?.depletion_lead_days || 5);
  const inventoryRows = await api.userDb.select('user_product_inventory', {
    select: 'id,product_id,quantity_purchased,started_at,estimated_empty_at,usage_percent,status,daily_usage_amount,updated_at',
    user_id: eq(api.user.id),
    status: 'eq.active',
    order: 'estimated_empty_at.asc.nullslast,updated_at.desc',
    limit: 100
  });
  const productMap = await loadProductsMap(api, (inventoryRows || []).map((row) => row.product_id));
  const defaults = await api.adminDb.select('product_usage_defaults', {
    select: 'routine_category,default_total_days,low_stock_percent_threshold'
  });
  const defaultMap = new Map((defaults || []).map((item) => [item.routine_category, item]));
  const calculated = (inventoryRows || [])
    .map((row) => calculateInventoryDepletion(row, productMap.get(row.product_id), defaultMap, today))
    .filter(Boolean)
    .filter((item) => item.estimatedDaysLeft <= leadDays || item.usagePercentage >= item.lowStockPercentThreshold)
    .sort((a, b) => a.estimatedDaysLeft - b.estimatedDaysLeft || b.usagePercentage - a.usagePercentage)
    .slice(0, Math.min(Number(limit || RUNNING_OUT_LIMIT), 20));

  return {
    thresholdDays: leadDays,
    items: calculated,
    generatedNotifications: skipDerivedNotifications ? false : undefined
  };
}

export async function reorder(api, payload = {}) {
  if (payload.orderId) return reorderOrder(api, payload.orderId);
  if (payload.inventoryId) return reorderInventoryProduct(api, payload.inventoryId, payload.quantity || 1);
  if (payload.productId || payload.productSlug || payload.slug) {
    const product = await resolveProduct(api, { productId: payload.productId, productSlug: payload.productSlug || payload.slug });
    const cart = await addProductToCart(api, product, Number(payload.quantity || 1), payload.source || 'manual_reorder');
    return { cart, skippedItems: [], inventory: null };
  }
  throw new ApiError('REORDER_TARGET_REQUIRED', 'Yeniden sipariş için ürün, envanter veya sipariş bilgisi gerekli.', 400);
}

export async function loadLastOrder(api) {
  const order = await api.userDb.maybeSingle('orders', {
    select: 'id,order_number,status,currency,total_amount,subtotal_amount,created_at',
    user_id: eq(api.user.id),
    order: 'created_at.desc'
  });
  if (!order) return null;

  const items = await api.userDb.select('order_items', {
    select: 'id,product_uuid,product_id,product_slug,product_name,brand,image,quantity,line_total',
    order_id: eq(order.id),
    order: 'created_at.asc'
  });
  const productMap = await loadProductsByOrderItems(api, items || []);
  const serializedItems = (items || []).map((item) => {
    const product = item.product_uuid ? productMap.get(item.product_uuid) : productMap.get(item.product_slug || item.product_id);
    return {
      orderItemId: item.id,
      productId: product?.id || item.product_uuid || null,
      slug: product?.slug || item.product_slug || item.product_id,
      brand: product?.brand || item.brand,
      name: product?.name || item.product_name,
      imageUrl: product?.imageUrl || item.image,
      quantity: Number(item.quantity || 1),
      lineTotal: Number(item.line_total || 0),
      reorderable: product ? product.reorderable : true
    };
  });

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    date: order.created_at,
    itemCount: serializedItems.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: Number(order.total_amount || 0),
    subtotalPrice: Number(order.subtotal_amount || 0),
    currency: order.currency || 'TRY',
    thumbnails: serializedItems.slice(0, 4).map((item) => ({ productId: item.productId, imageUrl: item.imageUrl, name: item.name })),
    items: serializedItems
  };
}

export async function loadPersonalizedRecommendations(api, { profile = null, runningOutSoon = null, limit = RECOMMENDATION_LIMIT } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || RECOMMENDATION_LIMIT), 1), 20);
  await generateRecommendations(api, { profile, runningOutSoon, limit: safeLimit });
  const rows = await api.userDb.select('product_recommendations', {
    select: 'id,product_id,reason_type,reason_code,reason_text_tr,points_benefit,source,score,source_context,status,expires_at,created_at',
    user_id: eq(api.user.id),
    status: 'eq.active',
    order: 'score.desc,created_at.desc',
    limit: safeLimit
  });
  const productMap = await loadProductsMap(api, (rows || []).map((row) => row.product_id));
  const recommendationProductIds = (rows || []).map((row) => row.product_id);
  const wishlist = recommendationProductIds.length
    ? await api.userDb.select('wishlists', {
      select: 'product_id',
      user_id: eq(api.user.id),
      product_id: inFilter(recommendationProductIds)
    })
    : [];
  const wishlistSet = new Set((wishlist || []).map((item) => item.product_id));
  return {
    items: (rows || [])
      .map((row) => ({ row, product: productMap.get(row.product_id) }))
      .filter((entry) => entry.product)
      .map(({ row, product }) => ({
        id: row.id,
        reasonType: row.reason_type,
        reasonCode: row.reason_code,
        reasonText: row.reason_text_tr,
        pointsBenefit: Number(row.points_benefit || 0),
        source: row.source,
        score: Number(row.score || 0),
        sourceContext: row.source_context || {},
        isWishlisted: wishlistSet.has(row.product_id),
        product,
        createdAt: row.created_at,
        expiresAt: row.expires_at
      }))
  };
}

export async function toggleWishlist(api, payload = {}) {
  const product = await resolveProduct(api, { productId: payload.productId, productSlug: payload.productSlug || payload.slug });
  const existing = await api.userDb.maybeSingle('wishlists', {
    select: 'id',
    user_id: eq(api.user.id),
    product_id: eq(product.id)
  });
  if (existing) {
    await api.userDb.delete('wishlists', { id: eq(existing.id) });
    return { product, isWishlisted: false };
  }
  await api.userDb.insert('wishlists', { user_id: api.user.id, product_id: product.id }, { returning: false });
  return { product, isWishlisted: true };
}

async function generateRecommendations(api, { profile = null, runningOutSoon = null, limit = RECOMMENDATION_LIMIT } = {}) {
  const [skinProfile, routine, lastOrder, activeRecommendations, cart] = await Promise.all([
    api.userDb.maybeSingle('skin_profiles', {
      select: 'skin_type,concerns,sensitivities,goals',
      user_id: eq(api.user.id)
    }),
    loadTodayRoutine(api, { profile: profile || await loadProfile(api) }),
    loadLastOrder(api),
    api.adminDb.select('product_recommendations', {
      select: 'product_id,status,created_at',
      user_id: eq(api.user.id),
      status: 'in.(active,dismissed,purchased)',
      order: 'created_at.desc',
      limit: 50
    }),
    loadActiveCart(api)
  ]);

  const existingProductIds = new Set((activeRecommendations || []).filter((item) => item.status === 'active').map((item) => item.product_id));
  const recentlyDismissed = new Set((activeRecommendations || [])
    .filter((item) => item.status !== 'active' && Date.now() - Date.parse(item.created_at || 0) < 30 * 86400000)
    .map((item) => item.product_id));
  const cartProductIds = new Set((cart?.items || []).map((item) => item.productId));
  const ownedProductIds = new Set((lastOrder?.items || []).map((item) => item.productId).filter(Boolean));
  const runningOut = runningOutSoon || await loadRunningOutSoon(api, { limit: RUNNING_OUT_LIMIT });
  const runningOutProductIds = new Set((runningOut.items || []).map((item) => item.product.id));
  const routineCategories = new Set(routine.periods.flatMap((period) => period.steps.map((step) => step.routineCategory)));
  const missingCategories = ['cleanser', 'essence', 'serum', 'moisturizer', 'sunscreen'].filter((category) => !routineCategories.has(category));
  const concerns = new Set([...(skinProfile?.concerns || []), ...(skinProfile?.goals || [])].filter(Boolean));

  const products = await api.adminDb.select('products', {
    select: 'id,slug,brand_id,name,category_slug,image_url,product_url,price,concern_slugs,routine_category,is_active,is_reorderable,stock_status',
    is_active: 'eq.true',
    order: 'updated_at.desc',
    limit: 120
  });
  const brandMap = await loadBrandsMap(api, (products || []).map((product) => product.brand_id));
  const candidates = [];

  for (const item of runningOut.items || []) {
    const alternatives = (products || [])
      .filter((product) => product.routine_category === item.product.routineCategory && product.id !== item.product.id)
      .filter((product) => isProductOrderable(product) && !cartProductIds.has(product.id) && !recentlyDismissed.has(product.id));
    for (const product of alternatives.slice(0, 2)) {
      candidates.push(buildRecommendationCandidate(product, brandMap, {
        reasonType: 'running_out_alternative',
        reasonCode: `alternative:${item.inventoryId}`,
        reasonText: `${item.product.name} yakında bitebilir; aynı adım için iyi bir alternatif.`,
        source: 'inventory',
        score: 95 - Math.min(20, Number(item.estimatedDaysLeft || 0)),
        context: { inventoryId: item.inventoryId, originalProductId: item.product.id }
      }));
    }
  }

  for (const category of missingCategories) {
    const matches = (products || [])
      .filter((product) => product.routine_category === category)
      .filter((product) => isProductOrderable(product) && !cartProductIds.has(product.id) && !recentlyDismissed.has(product.id))
      .sort((a, b) => concernScore(b, concerns) - concernScore(a, concerns));
    for (const product of matches.slice(0, 2)) {
      candidates.push(buildRecommendationCandidate(product, brandMap, {
        reasonType: 'missing_routine_step',
        reasonCode: `missing_${category}`,
        reasonText: `${ROUTINE_LABELS[category] || 'Rutin'} adımını tamamlamak için önerildi.`,
        source: 'routine',
        score: 88 + concernScore(product, concerns),
        context: { missingCategory: category }
      }));
    }
  }

  for (const product of products || []) {
    if (!isProductOrderable(product)) continue;
    if (!concernScore(product, concerns)) continue;
    if (cartProductIds.has(product.id) || recentlyDismissed.has(product.id)) continue;
    if (ownedProductIds.has(product.id) && !runningOutProductIds.has(product.id)) continue;
    candidates.push(buildRecommendationCandidate(product, brandMap, {
      reasonType: 'skin_concern_match',
      reasonCode: 'skin_concern_overlap',
      reasonText: 'Cilt önceliklerin ve mevcut rutininle uyumlu.',
      source: 'skin_profile',
      score: 80 + concernScore(product, concerns),
      context: { concerns: Array.from(concerns) }
    }));
  }

  const tier = await loadMembership(api);
  const unique = new Map();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (unique.has(candidate.product_id)) continue;
    if (existingProductIds.has(candidate.product_id)) continue;
    candidate.points_benefit = estimatePoints(candidate.price, tier.tier?.pointsMultiplier || 1);
    unique.set(candidate.product_id, candidate);
    if (unique.size >= limit) break;
  }

  const rows = Array.from(unique.values()).map((candidate) => ({
    user_id: api.user.id,
    product_id: candidate.product_id,
    reason_type: candidate.reason_type,
    reason_code: candidate.reason_code,
    reason_text_tr: candidate.reason_text_tr,
    points_benefit: candidate.points_benefit,
    source: candidate.source,
    score: candidate.score,
    source_context: candidate.source_context,
    status: 'active',
    expires_at: addDaysIso(14)
  }));
  if (rows.length) await api.adminDb.insertMany('product_recommendations', rows, { returning: false });
}

async function reorderInventoryProduct(api, inventoryId, quantity = 1) {
  const inventory = await api.adminDb.maybeSingle('user_product_inventory', {
    select: 'id,user_id,product_id,status',
    id: eq(inventoryId),
    user_id: eq(api.user.id)
  });
  if (!inventory) throw new ApiError('INVENTORY_NOT_FOUND', 'Ürün envanteri bulunamadı.', 404);
  const product = await resolveProduct(api, { productId: inventory.product_id });
  const cart = await addProductToCart(api, product, quantity, 'running_out_reorder');
  await api.adminDb.update('user_product_inventory', { id: eq(inventory.id), user_id: eq(api.user.id) }, { status: 'reordered' }, { returning: false });
  return { cart, skippedItems: [], inventory: { id: inventory.id, status: 'reordered' } };
}

async function reorderOrder(api, orderId) {
  const order = await api.adminDb.maybeSingle('orders', {
    select: 'id,order_number,user_id,status',
    id: eq(orderId),
    user_id: eq(api.user.id)
  });
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 'Sipariş bulunamadı.', 404);
  const items = await api.adminDb.select('order_items', {
    select: 'id,product_uuid,product_id,product_slug,product_name,quantity',
    order_id: eq(order.id)
  });

  const skippedItems = [];
  let cart = await getOrCreateCart(api);
  for (const item of items || []) {
    const product = await resolveProduct(api, {
      productId: item.product_uuid || null,
      productSlug: item.product_slug || item.product_id || null,
      throwIfMissing: false
    });
    if (!product || !product.active || !product.reorderable || ['out_of_stock', 'discontinued'].includes(product.stockStatus)) {
      skippedItems.push({ orderItemId: item.id, productName: item.product_name, reason: product ? product.stockStatus : 'not_found' });
      continue;
    }
    cart = await addProductToCart(api, product, Number(item.quantity || 1), 'order_reorder');
  }
  return { cart, skippedItems, order: { id: order.id, orderNumber: order.order_number } };
}

async function getOrCreateCart(api) {
  let cart = await api.adminDb.maybeSingle('carts', {
    select: 'id,user_id,status,currency,created_at,updated_at',
    user_id: eq(api.user.id),
    status: 'eq.active'
  });
  if (!cart) {
    try {
      cart = await api.adminDb.insert('carts', { user_id: api.user.id, status: 'active', currency: 'TRY' });
    } catch {
      cart = await api.adminDb.maybeSingle('carts', {
        select: 'id,user_id,status,currency,created_at,updated_at',
        user_id: eq(api.user.id),
        status: 'eq.active'
      });
    }
  }
  if (!cart) throw new ApiError('CART_CREATE_FAILED', 'Sepet oluşturulamadı.', 500);
  return serializeCart(api, cart);
}

async function addProductToCart(api, product, quantity = 1, source = 'dashboard') {
  if (!product?.id) throw new ApiError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı.', 404);
  if (!product.active || !product.reorderable || ['out_of_stock', 'discontinued'].includes(product.stockStatus)) {
    throw new ApiError('PRODUCT_NOT_REORDERABLE', 'Bu ürün şu anda sepete eklenemiyor.', 409);
  }
  const cart = await getOrCreateCart(api);
  const safeQuantity = Math.max(1, Math.min(MAX_CART_ITEM_QTY, Number.parseInt(quantity, 10) || 1));
  const existing = await api.adminDb.maybeSingle('cart_items', {
    select: 'id,quantity',
    cart_id: eq(cart.id),
    product_id: eq(product.id)
  });
  if (existing) {
    await api.adminDb.update('cart_items', { id: eq(existing.id) }, {
      quantity: Math.min(MAX_CART_ITEM_QTY, Number(existing.quantity || 0) + safeQuantity),
      unit_price_snapshot: product.price
    }, { returning: false });
  } else {
    try {
      await api.adminDb.insert('cart_items', {
        cart_id: cart.id,
        product_id: product.id,
        quantity: safeQuantity,
        unit_price_snapshot: product.price
      }, { returning: false });
    } catch (error) {
      if (!isDuplicateError(error)) throw error;
      const duplicate = await api.adminDb.maybeSingle('cart_items', {
        select: 'id,quantity',
        cart_id: eq(cart.id),
        product_id: eq(product.id)
      });
      if (!duplicate) throw error;
      await api.adminDb.update('cart_items', { id: eq(duplicate.id) }, {
        quantity: Math.min(MAX_CART_ITEM_QTY, Number(duplicate.quantity || 0) + safeQuantity),
        unit_price_snapshot: product.price
      }, { returning: false });
    }
  }
  const refreshed = await api.adminDb.maybeSingle('carts', {
    select: 'id,user_id,status,currency,created_at,updated_at',
    id: eq(cart.id)
  });
  return serializeCart(api, refreshed, source);
}

async function serializeCart(api, cart, source = null) {
  const items = cart?.id ? await api.adminDb.select('cart_items', {
    select: 'id,product_id,quantity,unit_price_snapshot,created_at,updated_at',
    cart_id: eq(cart.id),
    order: 'created_at.asc'
  }) : [];
  const productMap = await loadProductsMap(api, (items || []).map((item) => item.product_id));
  const lines = (items || []).map((item) => {
    const product = productMap.get(item.product_id);
    const unitPrice = Number(item.unit_price_snapshot || product?.price || 0);
    const quantity = Number(item.quantity || 0);
    return {
      id: item.id,
      productId: item.product_id,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      product
    };
  });
  return {
    id: cart?.id || null,
    status: cart?.status || 'active',
    currency: cart?.currency || 'TRY',
    itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: lines.reduce((sum, item) => sum + item.lineTotal, 0),
    source,
    items: lines,
    legacyCartItems: lines.map((item) => ({
      id: item.product?.slug || item.productId,
      slug: item.product?.slug || item.productId,
      name: item.product?.name || 'Ürün',
      brand: item.product?.brand || 'COSMOSKIN',
      price: item.unitPrice,
      image: item.product?.imageUrl || '',
      url: item.product?.url || '',
      qty: item.quantity
    }))
  };
}

async function resolveReward(api, payload) {
  if (payload.rewardId) {
    return api.adminDb.maybeSingle('rewards', {
      select: 'id,slug,title_tr,required_points,discount_type,discount_value,is_active,starts_at,ends_at,metadata',
      id: eq(payload.rewardId)
    });
  }
  if (payload.slug) {
    return api.adminDb.maybeSingle('rewards', {
      select: 'id,slug,title_tr,required_points,discount_type,discount_value,is_active,starts_at,ends_at,metadata',
      slug: eq(payload.slug)
    });
  }
  throw new ApiError('REWARD_ID_REQUIRED', 'Ödül seçimi gerekli.', 400);
}

async function resolveProduct(api, { productId = null, productSlug = null, throwIfMissing = true } = {}) {
  let row = null;
  if (productId) {
    row = await api.adminDb.maybeSingle('products', {
      select: 'id,slug,brand_id,name,category_slug,image_url,product_url,price,routine_category,is_active,is_reorderable,stock_status,concern_slugs',
      id: eq(productId)
    });
  }
  if (!row && productSlug) {
    row = await api.adminDb.maybeSingle('products', {
      select: 'id,slug,brand_id,name,category_slug,image_url,product_url,price,routine_category,is_active,is_reorderable,stock_status,concern_slugs',
      slug: eq(productSlug)
    });
  }
  if (!row && throwIfMissing) throw new ApiError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı.', 404);
  if (!row) return null;
  const brandMap = await loadBrandsMap(api, [row.brand_id]);
  return serializeProduct(row, brandMap.get(row.brand_id));
}

async function loadOwnedRoutineStep(api, stepId) {
  const step = await api.userDb.maybeSingle('routine_steps', {
    select: 'id,routine_id,period,step_order,routine_category,product_id,custom_product_name,is_required',
    id: eq(stepId)
  });
  if (!step) throw new ApiError('STEP_NOT_FOUND', 'Rutin adımı bulunamadı.', 404);
  const routine = await api.userDb.maybeSingle('routines', {
    select: 'id,user_id,status',
    id: eq(step.routine_id),
    user_id: eq(api.user.id)
  });
  if (!routine) throw new ApiError('STEP_NOT_FOUND', 'Rutin adımı bulunamadı.', 404);
  if (routine.status !== 'active') throw new ApiError('ROUTINE_INACTIVE', 'Aktif olmayan rutin tamamlanamaz.', 409);
  return step;
}

async function findRoutineCompletions(api, stepIds = [], completionDate = null, rows = null) {
  const ids = Array.from(new Set((stepIds || []).filter(Boolean)));
  if (!ids.length) return new Set();
  const dateFilter = rows ? null : completionDate;
  const existing = await api.adminDb.select('routine_completions', {
    select: 'routine_step_id,completion_date,status',
    user_id: eq(api.user.id),
    routine_step_id: inFilter(ids),
    ...(dateFilter ? { completion_date: eq(dateFilter) } : {})
  });
  const set = new Set();
  for (const item of existing || []) {
    if (completionDate) set.add(item.routine_step_id);
    set.add(`${item.routine_step_id}:${item.completion_date}`);
  }
  return set;
}

async function insertRoutineCompletions(api, rows) {
  if (!rows.length) return;
  try {
    await api.adminDb.insertMany('routine_completions', rows, { returning: false });
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new ApiError('ROUTINE_COMPLETION_DUPLICATE', 'Bu rutin adımı bugün zaten tamamlandı.', 409);
    }
    throw error;
  }
}

async function awardRoutineCompletionIfEligible(api, routineId, completionDate) {
  const steps = await api.adminDb.select('routine_steps', {
    select: 'id',
    routine_id: eq(routineId),
    is_required: 'eq.true'
  });
  const requiredIds = (steps || []).map((step) => step.id);
  if (!requiredIds.length) return { awarded: false, reason: 'no_required_steps' };
  const completions = await api.adminDb.select('routine_completions', {
    select: 'routine_step_id,status',
    user_id: eq(api.user.id),
    routine_id: eq(routineId),
    completion_date: eq(completionDate),
    routine_step_id: inFilter(requiredIds)
  });
  const completeIds = new Set((completions || []).filter((item) => ['completed', 'skipped'].includes(item.status)).map((item) => item.routine_step_id));
  if (!requiredIds.every((id) => completeIds.has(id))) return { awarded: false, reason: 'routine_incomplete' };

  const eventKey = `routine_complete:${api.user.id}:${completionDate}`;
  const ledger = await insertLoyaltyLedgerOnce(api, {
      user_id: api.user.id,
      points: ROUTINE_COMPLETION_POINTS,
      type: 'earn',
      status: 'available',
      source_type: ROUTINE_REWARD_SOURCE_TYPE,
      source_id: eventKey,
      event_key: eventKey,
      idempotency_key: eventKey,
      description_tr: 'Günlük rutin tamamlama puanı',
      available_at: new Date().toISOString(),
      expires_at: addDaysIso(365)
    });
  if (!ledger) return { awarded: false, reason: 'already_awarded' };
  await insertMissingNotifications(api, [{
    type: 'points_earned',
    title: 'Yeni puan kazandın',
    body: `${ROUTINE_COMPLETION_POINTS} rutin puanı hesabına eklendi.`,
    action_label: 'Puanlarımı Gör',
    action_url: '/account/profile.html?tab=points',
    source_type: 'loyalty_ledger',
    source_id: ledger.id,
    metadata: { points: ROUTINE_COMPLETION_POINTS, eventKey }
  }]);
  return { awarded: true, points: ROUTINE_COMPLETION_POINTS, eventKey };
}

async function insertMissingNotifications(api, candidates) {
  const clean = (candidates || []).filter((item) => item?.type && item?.source_type && item?.source_id);
  if (!clean.length) return;
  const sourceIds = clean.map((item) => item.source_id);
  const existing = await api.adminDb.select('notifications', {
    select: 'type,source_type,source_id',
    user_id: eq(api.user.id),
    source_id: inFilter(sourceIds),
    limit: 100
  });
  const existingKeys = new Set((existing || []).map((item) => `${item.type}:${item.source_type}:${item.source_id}`));
  const rows = clean
    .filter((item) => !existingKeys.has(`${item.type}:${item.source_type}:${item.source_id}`))
    .map((item) => ({
      user_id: api.user.id,
      type: item.type,
      title: item.title,
      body: item.body,
      action_label: item.action_label || null,
      action_url: item.action_url || null,
      source_type: item.source_type,
      source_id: item.source_id,
      metadata: item.metadata || {},
      read_status: 'unread',
      is_read: false,
      expires_at: item.expires_at || null
    }));
  if (rows.length) await api.adminDb.insertMany('notifications', rows, { returning: false }).catch((error) => {
    console.warn('Notification insert skipped:', error?.message || error);
  });
}

async function insertLoyaltyLedgerOnce(api, row) {
  const eventKey = row?.event_key || row?.idempotency_key;
  if (!eventKey) throw new ApiError('EVENT_KEY_REQUIRED', 'Puan hareketi için event_key gerekli.', 500);
  const payload = {
    ...row,
    event_key: eventKey,
    idempotency_key: row.idempotency_key || eventKey
  };
  try {
    return await api.adminDb.insertIgnore('loyalty_ledger', payload, 'event_key', { returning: true });
  } catch (error) {
    if (isDuplicateError(error)) return null;
    throw error;
  }
}

async function loadProductsByOrderItems(api, items) {
  const uuidIds = (items || []).map((item) => item.product_uuid).filter(Boolean);
  const slugs = (items || []).map((item) => item.product_slug || item.product_id).filter(Boolean);
  const map = await loadProductsMap(api, uuidIds);
  if (slugs.length) {
    const rows = await api.adminDb.select('products', {
      select: 'id,slug,brand_id,name,category_slug,image_url,product_url,price,routine_category,is_active,is_reorderable,stock_status,concern_slugs',
      slug: inFilter(slugs)
    });
    const brandMap = await loadBrandsMap(api, (rows || []).map((row) => row.brand_id));
    for (const row of rows || []) {
      const product = serializeProduct(row, brandMap.get(row.brand_id));
      map.set(row.slug, product);
      map.set(row.id, product);
    }
  }
  return map;
}

async function loadProductsMap(api, ids = []) {
  const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
  const map = new Map();
  if (!cleanIds.length) return map;
  const rows = await api.adminDb.select('products', {
    select: 'id,slug,brand_id,name,category_slug,image_url,product_url,price,routine_category,is_active,is_reorderable,stock_status,concern_slugs',
    id: inFilter(cleanIds)
  });
  const brandMap = await loadBrandsMap(api, (rows || []).map((row) => row.brand_id));
  for (const row of rows || []) map.set(row.id, serializeProduct(row, brandMap.get(row.brand_id)));
  return map;
}

async function loadBrandsMap(api, ids = []) {
  const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
  const map = new Map();
  if (!cleanIds.length) return map;
  const rows = await api.adminDb.select('brands', {
    select: 'id,slug,name,logo_url',
    id: inFilter(cleanIds)
  });
  for (const row of rows || []) map.set(row.id, row);
  return map;
}

async function loadActiveCart(api) {
  const cart = await api.adminDb.maybeSingle('carts', {
    select: 'id,user_id,status,currency',
    user_id: eq(api.user.id),
    status: 'eq.active'
  });
  if (!cart) return null;
  return serializeCart(api, cart);
}

function serializeProduct(row, brand = null) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    brand: brand?.name || 'COSMOSKIN',
    brandSlug: brand?.slug || null,
    name: row.name,
    categorySlug: row.category_slug,
    routineCategory: row.routine_category,
    imageUrl: row.image_url,
    url: row.product_url,
    price: Number(row.price || 0),
    concernSlugs: row.concern_slugs || [],
    active: row.is_active === true,
    reorderable: row.is_reorderable === true,
    stockStatus: row.stock_status || 'in_stock'
  };
}

function calculateInventoryDepletion(row, product, defaultMap, today = getLocalDate(DEFAULT_TIMEZONE)) {
  if (!row || !product || row.status !== 'active') return null;
  const defaults = defaultMap.get(product.routineCategory) || {};
  const defaultDays = Math.max(1, Number(defaults.default_total_days || 35));
  const quantity = Math.max(1, Number(row.quantity_purchased || 1));
  const totalDays = defaultDays * quantity;
  const startedAt = normalizeDateOnly(row.started_at) || today;
  const estimatedEmptyAt = normalizeDateOnly(row.estimated_empty_at) || addDaysDateString(startedAt, totalDays);
  const elapsedDays = Math.max(0, dateDiffDays(startedAt, today));
  const calculatedUsage = Math.min(100, Math.max(0, Math.floor((elapsedDays / totalDays) * 100)));
  const usagePercentage = Math.max(Number(row.usage_percent || 0), calculatedUsage);
  const estimatedDaysLeft = Math.max(0, dateDiffDays(today, estimatedEmptyAt));
  const lowStockPercentThreshold = Number(defaults.low_stock_percent_threshold || 75);
  return {
    inventoryId: row.id,
    usagePercentage,
    estimatedDaysLeft,
    estimatedEmptyAt,
    status: row.status,
    lowStockPercentThreshold,
    product
  };
}

function serializeRoutineStep(step, product, completion, completionDate = null) {
  return {
    id: step.id,
    period: step.period,
    order: Number(step.step_order || 0),
    routineCategory: step.routine_category,
    title: ROUTINE_LABELS[step.routine_category] || 'Rutin Adımı',
    isRequired: step.is_required !== false,
    status: completion?.status || 'missing',
    completionDate,
    completedAt: completion?.completed_at || null,
    product: product || (step.custom_product_name ? {
      id: null,
      slug: null,
      brand: null,
      name: step.custom_product_name,
      imageUrl: null,
      url: null,
      price: 0,
      routineCategory: step.routine_category,
      reorderable: false
    } : null),
    frequencyRule: step.frequency_rule || { days: 'daily' }
  };
}

function serializeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    actionLabel: row.action_label,
    actionUrl: row.action_url,
    read: row.is_read === true || row.read_status !== 'unread' || Boolean(row.read_at),
    readStatus: row.read_status,
    readAt: row.read_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function serializeTier(tier) {
  if (!tier) return {
    id: null,
    slug: 'member',
    label: 'Cosmoskin Üyesi',
    pointsMultiplier: 1,
    minLifetimeSpend: 0,
    benefits: {}
  };
  return {
    id: tier.id,
    slug: tier.slug,
    label: tier.label_tr,
    pointsMultiplier: Number(tier.points_multiplier || 1),
    minLifetimeSpend: Number(tier.min_lifetime_spend || 0),
    benefits: tier.benefits || {}
  };
}

function buildTodayPlan(profile, routine, skinScore, streak, points) {
  const hour = Number(getZonedParts(new Date(), profile.timezone || DEFAULT_TIMEZONE).hour || 12);
  const greetingPrefix = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const missing = Math.max(0, routine.completion.totalRequired - routine.completion.completedRequired);
  return {
    greeting: `${greetingPrefix} ${profile.firstName || profile.fullName}`,
    routineStatus: routine.completion.totalRequired === 0
      ? 'Bugün için aktif rutin adımı bulunmuyor.'
      : missing === 0
        ? 'Bugünkü rutin tamamlandı.'
        : `${missing} rutin adımı tamamlanmayı bekliyor.`,
    ctaLabel: 'Rutine Devam Et',
    ctaAction: 'continue_routine',
    stats: [
      { key: 'skin_balance', label: 'Cilt Dengesi', value: skinScore.score == null ? '—' : `${skinScore.score}/100` },
      { key: 'streak', label: 'Rutin Serisi', value: `${streak.current || 0} gün` },
      { key: 'points', label: 'Puan', value: String(points.currentPoints || 0) }
    ]
  };
}

function emptyRoutinePeriods() {
  return ['morning', 'evening'].map((period) => ({ key: period, label: PERIOD_LABELS[period], steps: [] }));
}

function buildWeeklyDots(weekStart, completedDays) {
  const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  return labels.map((label, index) => ({
    date: addDaysDateString(weekStart, index),
    label,
    status: index < completedDays ? 'completed' : 'missing'
  }));
}

function getZonedParts(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function getLocalDate(timezone = DEFAULT_TIMEZONE, date = new Date()) {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCompletionDateForPeriod(period, timezone = DEFAULT_TIMEZONE, date = new Date()) {
  const local = getLocalDate(timezone, date);
  const hour = Number(getZonedParts(date, timezone).hour || 0);
  if (period === 'evening' && hour < 3) return addDaysDateString(local, -1);
  return local;
}

function startOfWeekDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDaysDateString(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function dateDiffDays(fromDateString, toDateString) {
  const from = Date.parse(`${normalizeDateOnly(fromDateString)}T00:00:00Z`);
  const to = Date.parse(`${normalizeDateOnly(toDateString)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / 86400000);
}

function normalizeDateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString();
}

function normalizeGender(value) {
  return ['female', 'male', 'other', 'prefer_not_to_say'].includes(value) ? value : null;
}

function defaultLedgerDescription(item) {
  const points = Number(item.points || 0);
  if (item.type === 'earn') return `${points} puan kazanıldı`;
  if (item.type === 'redeem') return `${Math.abs(points)} puan kullanıldı`;
  if (item.type === 'expire') return `${Math.abs(points)} puan süresi doldu`;
  return 'Puan hareketi';
}

function createCouponCode(reward) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 6);
  return `CS-${String(reward.slug || reward.id).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12)}-${random}`;
}

function estimatePoints(price, multiplier = 1) {
  return Math.max(0, Math.floor((Number(price || 0) / 10) * Number(multiplier || 1)));
}

function isProductOrderable(product) {
  return product?.is_active === true && product?.is_reorderable !== false && !['out_of_stock', 'discontinued'].includes(product.stock_status);
}

function concernScore(product, concerns) {
  if (!concerns?.size) return 0;
  return (product.concern_slugs || []).filter((slug) => concerns.has(slug)).length * 6;
}

function buildRecommendationCandidate(product, brandMap, config) {
  const brand = brandMap.get(product.brand_id);
  return {
    product_id: product.id,
    price: Number(product.price || 0),
    reason_type: config.reasonType,
    reason_code: config.reasonCode,
    reason_text_tr: config.reasonText,
    source: config.source,
    score: Number(config.score || 0),
    source_context: {
      ...(config.context || {}),
      product: {
        slug: product.slug,
        brand: brand?.name || 'COSMOSKIN',
        routineCategory: product.routine_category
      }
    }
  };
}

function isDuplicateError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${JSON.stringify(error?.details || '')}`;
  return /23505|duplicate key|violates unique constraint|loyalty_ledger_event_key_key|routine_completions_user_step_date_key/i.test(text);
}
