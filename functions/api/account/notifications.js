import { handleApi, methodNotAllowed, ok } from '../_lib/api-response.js';
import { requireAccount } from '../_lib/supabase-server.js';
import { ensureDerivedNotifications, loadNotifications } from '../_lib/account-core.js';

export async function onRequestGet(context) {
  return handleApi(async () => {
    const api = await requireAccount(context);
    const url = new URL(context.request.url);
    await ensureDerivedNotifications(api);
    return ok(await loadNotifications(api, { limit: Number(url.searchParams.get('limit') || 10) }));
  });
}

export function onRequestPost() {
  return methodNotAllowed(['GET']);
}
