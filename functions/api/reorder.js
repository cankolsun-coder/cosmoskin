import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

class ApiError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function json(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function ok(data = null, extra = {}) {
  return json({ ok: true, success: true, data, ...extra });
}

function fail(error) {
  const err = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', error?.message || 'İşlem şu anda tamamlanamadı.', 500);
  if (err.status >= 500) console.error('COSMOSKIN API error:', error);
  const body = { ok: false, success: false, error: { code: err.code, message: err.message } };
  if (err.details && err.status < 500) body.error.details = err.details;
  return json(body, { status: err.status });
}

function methodNotAllowed(allowed = ['GET']) {
  return fail(new ApiError('METHOD_NOT_ALLOWED', 'Bu endpoint için HTTP metodu desteklenmiyor.', 405, { allowed }));
}

async function handleApi(fn) {
  try { return await fn(); } catch (error) { return fail(error); }
}

async function parseJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new ApiError('INVALID_JSON', 'Geçersiz JSON gövdesi.', 400); }
}

function getSupabase(env = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError('SERVICE_NOT_CONFIGURED', 'Supabase sunucu yapılandırması eksik.', 503);
  }
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return supabase;
}

function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new ApiError('UNAUTHORIZED', 'Oturum gerekli.', 401);
  return token;
}

async function requireAccount(context) {
  const supabase = getSupabase(context.env || {});
  const token = getBearerToken(context.request);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new ApiError('UNAUTHORIZED', 'Geçersiz oturum.', 401);
  return { supabase, user: data.user };
}

async function safeResult(promise, fallback = null, label = 'Supabase query') {
  const { data, error, count } = await promise;
  if (error) {
    console.warn(label + ' skipped:', error.message || error);
    return { data: fallback, count: 0, error };
  }
  return { data: data ?? fallback, count: count ?? 0, error: null };
}

function fullNameFrom(user, profile = {}) {
  const meta = user?.user_metadata || {};
  const first = profile.first_name || meta.first_name || meta.firstName || '';
  const last = profile.last_name || meta.last_name || meta.lastName || '';
  return [first, last].filter(Boolean).join(' ') || profile.full_name || meta.name || user?.email?.split('@')[0] || 'COSMOSKIN Üyesi';
}

function normalizeNotification(row = {}) {
  const read = Boolean(row.is_read || row.read_at || row.read_status === 'read');
  return {
    id: row.id,
    type: row.type || row.category || 'activity',
    category: row.category || row.type || 'activity',
    title: row.title || 'Bildirim',
    body: row.body || row.message || '',
    message: row.message || row.body || '',
    action_label: row.action_label || row.actionLabel || 'Görüntüle',
    actionLabel: row.action_label || row.actionLabel || 'Görüntüle',
    action_url: row.action_url || row.actionUrl || '#',
    actionUrl: row.action_url || row.actionUrl || '#',
    source_type: row.source_type || null,
    source_id: row.source_id || null,
    metadata: row.metadata || {},
    read,
    is_read: read,
    read_at: row.read_at || null,
    created_at: row.created_at || null
  };
}

async function readNotifications(supabase, user, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 100);
  const primary = await safeResult(
    supabase.from('notifications').select('id,type,title,body,action_label,action_url,source_type,source_id,metadata,read_status,is_read,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(safeLimit),
    [], 'notifications'
  );
  let rows = primary.data || [];
  if (primary.error) {
    const fallback = await safeResult(
      supabase.from('account_activity').select('id,type,category,title,body,message,action_url,action_label,metadata,is_read,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(safeLimit),
      [], 'account_activity notifications fallback'
    );
    rows = fallback.data || [];
  }
  const items = rows.map(normalizeNotification);
  let unreadCount = items.filter((item) => !item.is_read).length;
  if (!primary.error) {
    const unread = await safeResult(supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false), [], 'notifications unread count');
    if (!unread.error) unreadCount = unread.count || 0;
  }
  return { items, notifications: items, unreadCount, totalCount: items.length };
}

async function readActivity(supabase, user, { limit = 50, type = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 100);
  let query = supabase.from('account_activity').select('id,type,category,title,body,message,action_url,action_label,metadata,is_read,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(safeLimit);
  if (type && type !== 'all') query = query.eq('type', type);
  const result = await safeResult(query, [], 'account_activity');
  if (result.error) return readNotifications(supabase, user, safeLimit);
  const activities = (result.data || []).map(normalizeNotification);
  return { activities, notifications: activities, unreadCount: activities.filter((item) => !item.is_read).length, totalCount: activities.length };
}

async function markRead(supabase, user, ids = []) {
  const now = new Date().toISOString();
  const list = Array.from(new Set(ids.filter(Boolean).map(String)));
  if (!list.length) throw new ApiError('NOTIFICATION_ID_REQUIRED', 'Okundu işaretlenecek bildirim bulunamadı.', 400);
  const primary = await safeResult(
    supabase.from('notifications').update({ is_read: true, read_status: 'read', read_at: now, read_by_user_id: user.id, read_source: 'api' }).eq('user_id', user.id).in('id', list).select('*'),
    [], 'notifications mark read'
  );
  if (primary.error) await safeResult(supabase.from('account_activity').update({ is_read: true, read_at: now }).eq('user_id', user.id).in('id', list).select('*'), [], 'account_activity mark read fallback');
  return readNotifications(supabase, user, 50);
}

async function markAllRead(supabase, user) {
  const now = new Date().toISOString();
  const primary = await safeResult(
    supabase.from('notifications').update({ is_read: true, read_status: 'read', read_at: now, read_by_user_id: user.id, read_source: 'api' }).eq('user_id', user.id).eq('is_read', false).select('id'),
    [], 'notifications mark all read'
  );
  if (primary.error) await safeResult(supabase.from('account_activity').update({ is_read: true, read_at: now }).eq('user_id', user.id).is('read_at', null).select('id'), [], 'account_activity mark all read fallback');
  return readNotifications(supabase, user, 50);
}

async function getProfile(supabase, user) {
  const result = await safeResult(supabase.from('profiles').select('user_id,email,first_name,last_name,avatar_url,phone,birthdate,gender,locale,timezone,created_at,updated_at').eq('user_id', user.id).maybeSingle(), null, 'profile');
  const row = result.data || {};
  const full_name = fullNameFrom(user, row);
  return { ...row, user_id: user.id, userId: user.id, email: row.email || user.email || '', full_name, fullName: full_name, name: full_name, initials: full_name.split(/\s+/).map((part) => part[0]).filter(Boolean).join('').slice(0, 2).toLocaleUpperCase('tr-TR') || 'C' };
}

async function getPoints(supabase, user) {
  const result = await safeResult(supabase.from('loyalty_accounts').select('current_points,pending_points,lifetime_points,lifetime_spend,tier_id,updated_at').eq('user_id', user.id).maybeSingle(), null, 'loyalty account');
  const row = result.data || {};
  const balance = Number(row.current_points || 0);
  return { balance, points: balance, total: balance, currentPoints: balance, pendingPoints: Number(row.pending_points || 0), lifetimePoints: Number(row.lifetime_points || 0), lifetimeSpend: Number(row.lifetime_spend || 0), updatedAt: row.updated_at || null };
}

async function getRoutineStreak(supabase, user) {
  const result = await safeResult(supabase.from('routine_streaks').select('current_streak,best_streak,weekly_completed_days,week_start_date,last_completed_date,updated_at').eq('user_id', user.id).maybeSingle(), null, 'routine streak');
  const row = result.data || {};
  return { current: Number(row.current_streak || row.weekly_completed_days || 0), best: Number(row.best_streak || 0), target: 7, days_completed: Number(row.weekly_completed_days || row.current_streak || 0), weekStartDate: row.week_start_date || null, lastCompletedDate: row.last_completed_date || null };
}

function todayDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()); }

async function getTodayRoutine(supabase, user) {
  const routineResult = await safeResult(supabase.from('routines').select('id,name,status,source,created_at').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(), null, 'active routine');
  const routine = routineResult.data;
  if (!routine?.id) return { date: todayDate(), routine: null, steps: [], periods: [], completion: { completedRequired: 0, totalRequired: 0, status: 'empty' } };
  const stepsResult = await safeResult(supabase.from('routine_steps').select('id,routine_id,period,step_order,routine_category,product_id,custom_product_name,is_required').eq('routine_id', routine.id).order('period', { ascending: true }).order('step_order', { ascending: true }), [], 'routine steps');
  const completionResult = await safeResult(supabase.from('routine_completions').select('routine_step_id,status,period,completion_date,completed_at').eq('user_id', user.id).eq('routine_id', routine.id).eq('completion_date', todayDate()), [], 'routine completions');
  const completed = new Map((completionResult.data || []).map((item) => [item.routine_step_id, item]));
  const steps = (stepsResult.data || []).map((step) => {
    const done = completed.get(step.id);
    return { id: step.id, step_id: step.id, title: step.custom_product_name || step.routine_category || 'Rutin Adımı', name: step.custom_product_name || step.routine_category || 'Rutin Adımı', category: step.routine_category || '', period: step.period || 'morning', isRequired: step.is_required !== false, completed: Boolean(done), is_completed: Boolean(done), completed_at: done?.completed_at || null, status: done?.status || 'pending' };
  });
  const required = steps.filter((step) => step.isRequired);
  const completedRequired = required.filter((step) => step.completed).length;
  return { date: todayDate(), routine, steps, periods: ['morning', 'evening'].map((period) => ({ key: period, label: period === 'morning' ? 'Sabah' : 'Akşam', steps: steps.filter((step) => step.period === period) })), completion: { completedRequired, totalRequired: required.length, status: required.length && completedRequired >= required.length ? 'complete' : completedRequired ? 'partial' : 'missing' } };
}

async function getLastOrder(supabase, user) {
  const orderResult = await safeResult(supabase.from('orders').select('id,order_number,status,total_amount,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(), null, 'last order');
  const order = orderResult.data;
  if (!order?.id) return null;
  const itemsResult = await safeResult(supabase.from('order_items').select('order_id,product_id,product_slug,product_name,brand,image,quantity,line_total').eq('order_id', order.id).limit(8), [], 'last order items');
  const items = itemsResult.data || [];
  return { ...order, items, item_count: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0), total: Number(order.total_amount || 0) };
}

async function getRewards(supabase, user, pointsData = null) {
  const points = pointsData || await getPoints(supabase, user);
  const rewardsResult = await safeResult(supabase.from('rewards').select('id,slug,title_tr,required_points,discount_type,discount_value,is_active,metadata').eq('is_active', true).order('required_points', { ascending: true }).limit(20), [], 'rewards');
  const items = (rewardsResult.data || []).map((reward) => {
    const requiredPoints = Number(reward.required_points || 0);
    return { id: reward.id, slug: reward.slug, title: reward.title_tr || reward.slug || 'Ödül', requiredPoints, available: points.currentPoints >= requiredPoints, pointsRemaining: Math.max(0, requiredPoints - points.currentPoints), discountType: reward.discount_type || null, discountValue: Number(reward.discount_value || 0), metadata: reward.metadata || {} };
  });
  const nextReward = items.find((item) => !item.available) || items[0] || null;
  return { balance: points.currentPoints, points: points.currentPoints, currentPoints: points.currentPoints, nextTarget: nextReward?.requiredPoints || 1500, nextReward, items };
}

async function getRunningOutProducts() { return []; }

async function getRecommendations(supabase, user, limit = 8) {
  const result = await safeResult(supabase.from('product_recommendations').select('id,product_id,reason,score,metadata,created_at').eq('user_id', user.id).order('score', { ascending: false }).limit(Math.min(Number(limit || 8), 20)), [], 'product recommendations');
  return (result.data || []).map((item) => ({ id: item.product_id || item.id, product_id: item.product_id || item.id, reason: item.reason || 'Cilt rutininle uyumlu.', points: item.metadata?.points || null }));
}

async function buildDashboard(supabase, user) {
  const [profile, points, routineStreak, todayRoutine, lastOrder, notificationData, recommendations] = await Promise.all([getProfile(supabase, user), getPoints(supabase, user), getRoutineStreak(supabase, user), getTodayRoutine(supabase, user), getLastOrder(supabase, user), readNotifications(supabase, user, 10), getRecommendations(supabase, user, 8)]);
  const rewards = await getRewards(supabase, user, points);
  return { profile, points, loyalty: points, skinScore: { overall_score: 92, moisture_score: 84, barrier_score: 88, spf_score: 58 }, skinBalanceLabel: 'Çok İyi', routineStreak, todayRoutine, today_routine: todayRoutine, routine: todayRoutine, runningOutProducts: await getRunningOutProducts(), personalizedRecommendations: recommendations, recommendations, lastOrder, rewards, notifications: notificationData.items, notificationSummary: { unreadCount: notificationData.unreadCount, totalCount: notificationData.totalCount } };
}

async function completeStep(supabase, user, payload = {}) {
  const stepId = payload.stepId || payload.step_id || payload.routineStepId || payload.routine_step_id;
  if (!stepId) return { skipped: true, message: 'Rutin adımı bulunamadı.' };
  const stepResult = await safeResult(supabase.from('routine_steps').select('id,routine_id,period,is_required,routines!inner(user_id)').eq('id', stepId).eq('routines.user_id', user.id).maybeSingle(), null, 'routine step ownership');
  const step = stepResult.data;
  if (!step?.id) return { skipped: true, message: 'Rutin adımı bulunamadı.' };
  await safeResult(supabase.from('routine_completions').upsert({ user_id: user.id, routine_id: step.routine_id, routine_step_id: step.id, completion_date: todayDate(), period: step.period || 'morning', status: payload.status === 'skipped' ? 'skipped' : 'completed', completed_at: new Date().toISOString() }, { onConflict: 'user_id,routine_step_id,completion_date' }).select('id'), [], 'complete routine step');
  return { routine: await getTodayRoutine(supabase, user), routineStreak: await getRoutineStreak(supabase, user) };
}

async function completeRoutine(supabase, user, payload = {}) {
  const routine = await getTodayRoutine(supabase, user);
  const targetPeriod = payload.period || payload.routine_mode || payload.routineMode || null;
  const steps = (routine.steps || []).filter((step) => step.isRequired && (!targetPeriod || step.period === targetPeriod));
  if (!steps.length || !routine.routine?.id) return { routine, routineStreak: await getRoutineStreak(supabase, user), pointsAward: null };
  const rows = steps.map((step) => ({ user_id: user.id, routine_id: routine.routine.id, routine_step_id: step.id, completion_date: todayDate(), period: step.period || targetPeriod || 'morning', status: 'completed', completed_at: new Date().toISOString() }));
  await safeResult(supabase.from('routine_completions').upsert(rows, { onConflict: 'user_id,routine_step_id,completion_date' }).select('id'), [], 'complete routine');
  return { routine: await getTodayRoutine(supabase, user), routineStreak: await getRoutineStreak(supabase, user), pointsAward: null, points: await getPoints(supabase, user) };
}

async function createActivity(supabase, user, payload = {}) {
  const activity = { user_id: user.id, type: payload.type || 'activity', category: payload.category || payload.type || 'activity', title: payload.title || 'Hesap aktivitesi', body: payload.body || payload.message || null, message: payload.message || payload.body || null, action_url: payload.action_url || payload.actionUrl || null, action_label: payload.action_label || payload.actionLabel || 'Görüntüle', metadata: payload.metadata || {} };
  const rpc = await safeResult(supabase.rpc('create_account_activity', { p_user_id: user.id, p_type: activity.type, p_title: activity.title, p_body: activity.body, p_action_url: activity.action_url, p_action_label: activity.action_label, p_metadata: activity.metadata }), null, 'create activity rpc');
  if (!rpc.error && rpc.data) return { id: rpc.data };
  const inserted = await safeResult(supabase.from('account_activity').insert(activity).select('id').single(), null, 'create activity insert');
  if (inserted.error) throw new ApiError('ACTIVITY_CREATE_FAILED', inserted.error.message || 'Aktivite oluşturulamadı.', 500);
  return { id: inserted.data?.id || null };
}

async function toggleWishlist(supabase, user, payload = {}) {
  const productId = String(payload.product_id || payload.productId || payload.id || '').trim();
  if (!productId) throw new ApiError('PRODUCT_ID_REQUIRED', 'Ürün bilgisi gerekli.', 400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return { product_id: productId, is_favorited: true, localOnly: true };
  const existing = await safeResult(supabase.from('wishlists').select('id').eq('user_id', user.id).eq('product_id', productId).maybeSingle(), null, 'wishlist lookup');
  if (existing.data?.id) { await safeResult(supabase.from('wishlists').delete().eq('id', existing.data.id), [], 'wishlist delete'); return { product_id: productId, is_favorited: false }; }
  const inserted = await safeResult(supabase.from('wishlists').insert({ user_id: user.id, product_id: productId }).select('id').single(), null, 'wishlist insert');
  if (inserted.error) return { product_id: productId, is_favorited: true, localOnly: true };
  return { product_id: productId, is_favorited: true };
}

async function reorderItems(supabase, user, payload = {}) {
  const productId = payload.product_id || payload.productId || payload.id || null;
  if (productId) return { items: [{ product_id: productId, quantity: Math.max(1, Number(payload.quantity || 1)) }], source: 'product' };
  const lastOrder = await getLastOrder(supabase, user);
  return { items: lastOrder?.items || [], source: 'last_order', orderId: lastOrder?.id || null };
}

async function claimReward(supabase, user, payload = {}) {
  const rewardId = payload.reward_id || payload.rewardId || payload.id || null;
  if (!rewardId) throw new ApiError('REWARD_ID_REQUIRED', 'Ödül bilgisi gerekli.', 400);
  const points = await getPoints(supabase, user);
  const rewardResult = await safeResult(supabase.from('rewards').select('id,slug,title_tr,required_points,is_active').eq('id', rewardId).maybeSingle(), null, 'reward lookup');
  const reward = rewardResult.data;
  if (!reward?.id) throw new ApiError('REWARD_NOT_FOUND', 'Ödül bulunamadı.', 404);
  const requiredPoints = Number(reward.required_points || 0);
  if (points.currentPoints < requiredPoints) throw new ApiError('INSUFFICIENT_POINTS', 'Bu ödül için yeterli puanın yok.', 409);
  const couponCode = 'COSMO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  await safeResult(supabase.from('reward_redemptions').insert({ user_id: user.id, reward_id: reward.id, points_spent: requiredPoints, coupon_code: couponCode, status: 'created' }).select('id').single(), null, 'reward redemption');
  return { redemption: { rewardId: reward.id, title: reward.title_tr || reward.slug, couponCode, pointsSpent: requiredPoints, status: 'created' }, points: await getPoints(supabase, user) };
}

export async function onRequestOptions() { return new Response(null, { headers: corsHeaders }); }

export async function onRequestPost(context) { return handleApi(async () => { const { supabase, user } = await requireAccount(context); const payload = await parseJson(context.request); return ok(await reorderItems(supabase, user, payload)); }); }
export function onRequestGet() { return methodNotAllowed(['POST']); }
