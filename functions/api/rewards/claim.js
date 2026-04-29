import { handleApi, methodNotAllowed, ok, parseJson } from '../_lib/api-response.js';
import { requireAccount } from '../_lib/supabase-server.js';
import { claimReward } from '../_lib/account-core.js';

export async function onRequestPost(context) {
  return handleApi(async () => {
    const api = await requireAccount(context);
    const payload = await parseJson(context.request);
    return ok(await claimReward(api, payload));
  });
}

export function onRequestGet() {
  return methodNotAllowed(['POST']);
}
