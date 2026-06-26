import { assertAdmin, adminError, readJsonBody } from '../../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../../_lib/admin-audit.js';
import { insertRow, selectRows } from '../../_lib/supabase.js';
import { json } from '../../_lib/response.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'loyalty:adjust');
    const body = await readJsonBody(context);
    const userId = String(body.user_id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const points = Number.parseInt(body.points_delta, 10);
    const reason = String(body.reason || '').trim();
    if ((!userId && !email) || !Number.isFinite(points) || points === 0 || reason.length < 5) {
      return json({ ok: false, error: 'Kullanıcı/e-posta, puan değişimi ve en az 5 karakterlik sebep zorunludur.' }, { status: 400 });
    }
    const rows = userId ? await selectRows(context, 'loyalty_points_ledger', { select: 'points_delta', user_id: `eq.${userId}`, limit: '500' }).catch(() => []) : [];
    const current = (rows || []).reduce((sum, row) => sum + Number(row.points_delta || 0), 0);
    const ledger = await insertRow(context, 'loyalty_points_ledger', {
      user_id: userId || null,
      email: email || null,
      event_type: 'admin_adjustment',
      points_delta: points,
      balance_after: userId ? current + points : null,
      source: 'admin',
      metadata: { reason }
    });
    await recordAdminActivity(context, { action: 'loyalty.adjust_points', resource_type: 'loyalty_points_ledger', resource_id: ledger?.id, after_data: ledger, metadata: { reason, points_delta: points } });
    return json({ ok: true, ledger });
  } catch (error) { return adminError(error, 'Puan ayarlaması tamamlanamadı.'); }
}
