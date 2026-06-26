import { assertAdmin, adminError } from '../../../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../../../_lib/admin-audit.js';
import { selectRows } from '../../../_lib/supabase.js';
import { json } from '../../../_lib/response.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'shipments:create');
    const shipment = (await selectRows(context, 'shipments', { select: '*', id: `eq.${context.params?.id}`, limit: '1' }))?.[0];
    if (!shipment) return json({ ok: false, error: 'Gönderi bulunamadı.' }, { status: 404 });
    await recordAdminActivity(context, { action: 'shipments.sync_requested', resource_type: 'shipments', resource_id: shipment.id, metadata: { provider: shipment.provider || shipment.carrier } });
    return json({ ok: true, synced: false, message: 'Manuel DHL akışı aktif. Otomatik durum senkronizasyonu DHL API/webhook aktivasyonu sonrası yapılır.', shipment });
  } catch (error) { return adminError(error, 'Gönderi senkronizasyonu tamamlanamadı.'); }
}
