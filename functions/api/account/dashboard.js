import { handleApi, methodNotAllowed, ok } from '../_lib/api-response.js';
import { requireAccount } from '../_lib/supabase-server.js';
import { buildDashboard } from '../_lib/account-core.js';

export async function onRequestGet(context) {
  return handleApi(async () => {
    const api = await requireAccount(context);
    return ok(await buildDashboard(api));
  });
}

export function onRequestPost() {
  return methodNotAllowed(['GET']);
}
