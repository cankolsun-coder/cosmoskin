import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows } from '../_lib/supabase.js';
import { getLoyaltyBalance } from '../_lib/loyalty-ledger.js';

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const rows = await selectRows(context, 'loyalty_points_ledger', {
    select: '*',
    user_id: `eq.${auth.user.id}`,
    order: 'created_at.desc',
    limit: '100'
  }).catch(() => []);
  // Balance MUST come from the ledger via status = available only — never a
  // raw sum of points_delta across all rows, which would double-count
  // pending and reversed points as if they were spendable today.
  const ledgerBalance = await getLoyaltyBalance(context, auth.user.id);
  return json({
    ok: true,
    balance: ledgerBalance.available_points,
    pending: ledgerBalance.pending_points,
    reversed: ledgerBalance.reversed_points,
    ledger: rows || []
  });
}
