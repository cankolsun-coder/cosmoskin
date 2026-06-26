import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../../../_lib/admin-audit.js';
import { insertRow, selectRows } from '../../../_lib/supabase.js';
import { json } from '../../../_lib/response.js';
import { buildManualShipmentPayload, dhlConfigured } from '../../../_lib/shipping-providers.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'shipments:create');
    const orderId = context.params?.id;
    const body = await readJsonBody(context).catch(() => ({}));
    const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${orderId}`, limit: '1' }))?.[0];
    if (!order) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    if (!['paid','confirmed','awaiting_fulfillment'].includes(String(order.payment_status || '').toLowerCase())) {
      return json({ ok: false, error: 'Ödeme onaylanmadan gönderi oluşturulamaz.' }, { status: 409 });
    }
    if (dhlConfigured(context.env)) {
      return json({ ok: false, code: 'DHL_API_NOT_IMPLEMENTED', error: 'DHL API credentials detected, but provider-specific label creation must be activated after DHL account API documentation is confirmed.' }, { status: 501 });
    }
    const payload = buildManualShipmentPayload({ order, body });
    const shipment = await insertRow(context, 'shipments', { order_id: orderId, ...payload });
    await recordAdminActivity(context, { action: 'shipments.create_manual_dhl', resource_type: 'shipments', resource_id: shipment?.id, after_data: shipment, metadata: { order_id: orderId } });
    return json({ ok: true, mode: 'manual_fallback', shipment });
  } catch (error) { return adminError(error, 'DHL gönderi oluşturma işlemi tamamlanamadı.'); }
}
