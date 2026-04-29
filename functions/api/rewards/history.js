import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function json(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function emptyHistory() {
  return { items: [], history: [], totalCount: 0 };
}

function getSupabase(env = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function getBearerToken(request) {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function normalizeLedgerItem(row = {}) {
  const amount = Number(row.points_delta ?? row.points ?? row.amount ?? 0);
  return {
    id: row.id || row.created_at || crypto.randomUUID(),
    label: row.label || row.description || row.reason || row.type || 'Puan hareketi',
    description: row.description || row.reason || row.label || 'Puan hareketi',
    amount,
    points: amount,
    created_at: row.created_at || null
  };
}

async function readHistory(supabase, userId) {
  const tables = [
    ['points_ledger', 'id,type,reason,description,points_delta,points,amount,created_at'],
    ['loyalty_points_history', 'id,label,description,points_delta,points,amount,created_at']
  ];

  for (const [table, select] of tables) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25);

    if (!error) {
      const items = (data || []).map(normalizeLedgerItem);
      return { items, history: items, totalCount: items.length };
    }

    console.warn(`Rewards history ${table} lookup skipped:`, error.message || error);
  }

  return emptyHistory();
}

export function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet(context) {
  try {
    const supabase = getSupabase(context.env || {});
    const token = getBearerToken(context.request);
    if (!supabase || !token) return json({ ok: true, success: true, data: emptyHistory(), ...emptyHistory() });

    const { data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user?.id) return json({ ok: true, success: true, data: emptyHistory(), ...emptyHistory() });

    const history = await readHistory(supabase, user.id);
    return json({ ok: true, success: true, data: history, ...history });
  } catch (error) {
    console.warn('Rewards history failed safely:', error?.message || error);
    return json({ ok: true, success: true, data: emptyHistory(), ...emptyHistory() });
  }
}

export function onRequestPost() {
  return json({
    ok: false,
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Bu endpoint için HTTP metodu desteklenmiyor.'
    }
  }, { status: 405 });
}
