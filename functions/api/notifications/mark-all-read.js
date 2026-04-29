import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  try {
    const supabase = getSupabase(request, env);
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return json({ error: 'Oturum gerekli.' }, 401);
    }

    const { error } = await supabase
      .from('account_activity')
      .update({ read_at: new Date().toISOString(), is_read: true })
      .eq('user_id', userData.user.id)
      .is('read_at', null);

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'Mark all read endpoint error.' }, 500);
  }
}
