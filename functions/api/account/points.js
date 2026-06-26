import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const rows = await selectRows(context, 'loyalty_points_ledger', {
    select: '*',
    user_id: `eq.${auth.user.id}`,
    order: 'created_at.desc',
    limit: '100'
  }).catch(() => []);
  const balance = (rows || []).filter((row) => !row.expires_at || new Date(row.expires_at) > new Date()).reduce((sum, row) => sum + Number(row.points_delta || 0), 0);
  return json({ ok: true, balance, ledger: rows || [] });
}
