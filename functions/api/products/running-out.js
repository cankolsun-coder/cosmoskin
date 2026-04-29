import { handleApi, methodNotAllowed, ok } from '../_lib/api-response.js';
import { requireAccount } from '../_lib/supabase-server.js';
import { loadRunningOutSoon } from '../_lib/account-core.js';

export async function onRequestGet(context) {
  return handleApi(async () => {
    const api = await requireAccount(context);
    const url = new URL(context.request.url);
    return ok(await loadRunningOutSoon(api, { limit: Number(url.searchParams.get('limit') || 8) }));
  });
}

export function onRequestPost() {
  return methodNotAllowed(['GET']);
}
