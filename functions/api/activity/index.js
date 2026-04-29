import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function getSupabase(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false }
  });
}

function mapActivity(row) {
  return {
    id: row.id,
    type: row.type || row.category || 'activity',
    category: row.category || row.type || 'activity',
    title: row.title || 'Bildirim',
    body: row.body || row.message || '',
    message: row.message || row.body || '',
    action_url: row.action_url || row.url || '#',
    action_label: row.action_label || 'Görüntüle',
    read: Boolean(row.read_at || row.is_read),
    is_read: Boolean(row.read_at || row.is_read),
    read_at: row.read_at || null,
    created_at: row.created_at
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet({ request, env }) {
  try {
    const supabase = getSupabase(request, env);
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return json({ error: 'Oturum gerekli.' }, 401);
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
    const type = url.searchParams.get('type');

    let query = supabase
      .from('account_activity')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type && type !== 'all') {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      return json({ error: error.message }, 500);
    }

    const activities = (data || []).map(mapActivity);

    return json({
      activities,
      unreadCount: activities.filter((item) => !item.is_read).length,
      totalCount: activities.length
    });
  } catch (error) {
    return json({ error: error.message || 'Activity endpoint error.' }, 500);
  }
}
