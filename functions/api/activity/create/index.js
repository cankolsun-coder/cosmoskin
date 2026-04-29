import { createClient } from '@supabase/supabase-js';
import { createAccountActivity } from '../../../_lib/activity.js';

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

    const body = await request.json().catch(() => ({}));

    const payload = {
      userId: userData.user.id,
      type: body.type || 'activity',
      title: body.title || 'Hesap aktivitesi',
      body: body.body || body.message || null,
      actionUrl: body.action_url || body.actionUrl || null,
      actionLabel: body.action_label || body.actionLabel || 'Görüntüle',
      metadata: body.metadata || {}
    };

    const { data, error } = await createAccountActivity(supabase, payload);

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, id: data });
  } catch (error) {
    return json({ error: error.message || 'Create activity endpoint error.' }, 500);
  }
}
