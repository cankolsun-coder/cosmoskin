import { assertAdmin, adminError } from '../../../_lib/admin.js';
import { requireAdminPermission } from '../../../_lib/admin-audit.js';
import { selectRows } from '../../../_lib/supabase.js';
import { json } from '../../../_lib/response.js';

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'shipments:create');
    const shipment = (await selectRows(context, 'shipments', { select: '*', id: `eq.${context.params?.id}`, limit: '1' }))?.[0];
    if (!shipment) return json({ ok: false, error: 'Gönderi bulunamadı.' }, { status: 404 });
    if (!shipment.label_url) return json({ ok: false, code: 'LABEL_NOT_AVAILABLE', error: 'Etiket henüz DHL API üzerinden üretilmemiş. Manuel gönderi akışında DHL panelinden etiket alınmalıdır.' }, { status: 409 });
    return json({ ok: true, labelUrl: shipment.label_url, labelFormat: shipment.label_format || 'PDF' });
  } catch (error) { return adminError(error, 'Gönderi etiketi alınamadı.'); }
}
