import { handleApi, methodNotAllowed, ok } from '../_lib/api-response.js';
import { requireAccount } from '../_lib/supabase-server.js';
import { loadProfile, loadRoutineStreak, loadTodayRoutine } from '../_lib/account-core.js';

export async function onRequestGet(context) {
  return handleApi(async () => {
    const api = await requireAccount(context);
    const profile = await loadProfile(api);
    const [routine, routineStreak] = await Promise.all([
      loadTodayRoutine(api, { profile }),
      loadRoutineStreak(api, { profile })
    ]);
    return ok({ routine, routineStreak });
  });
}

export function onRequestPost() {
  return methodNotAllowed(['GET']);
}
