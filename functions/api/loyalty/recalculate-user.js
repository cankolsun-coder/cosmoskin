import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { rpc } from '../_lib/supabase.js';

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const status = await rpc(context, 'recalculate_customer_membership', { p_user_id: auth.user.id }).catch((error) => {
    error.status = 503;
    throw error;
  });
  return json({ ok: true, membership: status });
}
