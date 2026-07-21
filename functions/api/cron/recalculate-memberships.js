import { json } from '../_lib/response.js';
import { rpc, selectRows } from '../_lib/supabase.js';

function assertCron(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('x-cron-secret') || new URL(context.request.url).searchParams.get('secret') || '');
  if (!expected || supplied !== expected) {
    const error = new Error('Cron yetkisi geçersiz.');
    error.status = 401;
    throw error;
  }
}

export async function onRequestPost(context) {
  try {
    assertCron(context);
    const limit = Math.min(500, Math.max(1, Number(context.env.CRON_BATCH_LIMIT || 100)));
    const profiles = await selectRows(context, 'profiles', { select: 'id', limit: String(limit) });
    let recalculated = 0;
    for (const profile of profiles || []) {
      if (!profile.id) continue;
      await rpc(context, 'recalculate_customer_membership', { p_user_id: profile.id }).catch(() => null);
      recalculated += 1;
    }
    return json({ ok: true, recalculated });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Cron çalışmadı.' }, { status: error.status || 500 });
  }
}
