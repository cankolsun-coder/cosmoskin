import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../../../_lib/admin-audit.js';
import { insertRow, selectRows } from '../../../_lib/supabase.js';
import { json } from '../../../_lib/response.js';
import { dhlConfigured } from '../../../_lib/shipping-providers.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'returns:update');
    const returnId = context.params?.id;
    const body = await readJsonBody(context).catch(() => ({}));
    const ret = (await selectRows(context, 'return_requests', { select: '*', id: `eq.${returnId}`, limit: '1' }))?.[0];
    if (!ret) return json({ ok: false, error: 'İade talebi bulunamadı.' }, { status: 404 });
    if (dhlConfigured(context.env)) {
      return json({ ok: false, code: 'DHL_RETURN_API_NOT_IMPLEMENTED', error: 'DHL iade API aktivasyonu provider dokümanı ve credential doğrulaması sonrası yapılmalıdır.' }, { status: 501 });
    }
    const shipment = await insertRow(context, 'shipments', {
      order_id: ret.order_id,
      provider: 'manual', carrier: body.carrier || 'DHL', carrier_name: body.carrier_name || 'DHL', tracking_number: body.tracking_number || null,
      tracking_url: body.tracking_url || null, status: 'return_label_pending', direction: 'return', label_format: 'PDF', provider_payload: { mode: 'manual_return_fallback', return_request_id: returnId }
    });
    await recordAdminActivity(context, { action: 'returns.create_manual_dhl_return', resource_type: 'return_requests', resource_id: returnId, after_data: shipment });
    return json({ ok: true, mode: 'manual_fallback', shipment });
  } catch (error) { return adminError(error, 'DHL iade gönderisi oluşturulamadı.'); }
}
