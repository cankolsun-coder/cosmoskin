import { selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, requireUser } from '../_lib/account.js';

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const rows = await selectRows(context, 'notifications', {
      select: '*',
      user_id: `eq.${auth.user.id}`,
      order: 'created_at.desc',
      limit: '50'
    });
    return json({ ok: true, notifications: rows || [] });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Bildirimler alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const id = cleanString(body.id || body.notification_id || '', 80);
    if (body.mark_all_read) {
      const rows = await selectRows(context, 'notifications', { select: 'id', user_id: `eq.${auth.user.id}`, is_read: 'eq.false', limit: '100' }).catch(() => []);
      for (const row of rows || []) await updateRows(context, 'notifications', { id: row.id }, { is_read: true, read_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (!id) return json({ ok: false, error: 'Bildirim id zorunlu.' }, { status: 400 });
    const rows = await selectRows(context, 'notifications', { select: 'id', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' });
    if (!rows?.[0]) return json({ ok: false, error: 'Bildirim bulunamadı.' }, { status: 404 });
    await updateRows(context, 'notifications', { id }, { is_read: Boolean(body.is_read !== false), read_at: new Date().toISOString() });
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Bildirim güncellenemedi.' }, { status: 500 });
  }
}
