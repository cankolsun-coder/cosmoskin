import { json } from '../_lib/response.js';
import { insertRow, selectRows } from '../_lib/supabase.js';

function assertCron(context) {
  const expected = String(context.env.CRON_SECRET || '');
  const supplied = String(context.request.headers.get('x-cron-secret') || new URL(context.request.url).searchParams.get('secret') || '');
  if (!expected || supplied !== expected) throw Object.assign(new Error('Cron yetkisi geçersiz.'), { status: 401 });
}

export async function onRequestPost(context) {
  try {
    assertCron(context);
    const today = new Date();
    const month = String(today.getUTCMonth() + 1).padStart(2, '0');
    const day = String(today.getUTCDate()).padStart(2, '0');
    const year = today.getUTCFullYear();
    const profiles = await selectRows(context, 'profiles', { select: 'id,email,birthday', account_status: 'eq.active', limit: '200' }).catch(() => []);
    let issued = 0;
    for (const p of profiles || []) {
      if (!p.birthday || String(p.birthday).slice(5, 10) !== `${month}-${day}`) continue;
      const benefit = await insertRow(context, 'birthday_benefits', { user_id: p.id, benefit_year: year, points_awarded: 500, expires_at: new Date(Date.now() + 1000*60*60*24*30).toISOString() }).catch(() => null);
      if (!benefit) continue;
      // Double idempotency guard: birthday_benefits has unique(user_id, benefit_year)
      // above, and transaction_reference has its own unique index — a rerun of this
      // cron for the same user/year can never create a second ledger row either way.
      await insertRow(context, 'loyalty_points_ledger', {
        user_id: p.id,
        email: p.email,
        event_type: 'birthday',
        points_delta: 500,
        status: 'available',
        source: 'cron',
        transaction_reference: `birthday:${p.id}:${year}`,
        metadata: { benefit_year: year }
      }).catch(() => null);
      issued += 1;
    }
    return json({ ok: true, issued });
  } catch (error) { return json({ ok: false, error: error.message || 'Birthday cron çalışmadı.' }, { status: error.status || 500 }); }
}
