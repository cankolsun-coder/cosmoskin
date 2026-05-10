import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { insertRow, updateRows } from '../../../_lib/supabase.js';

const VALID_STATUS = new Set(['pending_payment','paid','preparing','shipped','delivered','cancelled','payment_failed','refunded','partially_refunded']);
const VALID_FULFILLMENT = new Set(['not_started','unfulfilled','preparing','packed','shipped','delivered','cancelled','returned']);

export async function onRequestPatch(context) {
  try {
    assertAdmin(context);
    const id = context.params?.id || '';
    const body = await readJsonBody(context);
    const payload = { updated_at: new Date().toISOString() };
    if (body.status) {
      if (!VALID_STATUS.has(body.status)) return json({ ok: false, error: 'status geçersiz.' }, { status: 400 });
      payload.status = body.status;
    }
    if (body.fulfillment_status) {
      if (!VALID_FULFILLMENT.has(body.fulfillment_status)) return json({ ok: false, error: 'fulfillment_status geçersiz.' }, { status: 400 });
      payload.fulfillment_status = body.fulfillment_status;
    }
    await updateRows(context, 'orders', { id }, payload);
    await insertRow(context, 'order_status_events', { order_id: id, status: body.status || body.fulfillment_status || 'updated', source: 'admin', message: body.message || 'Admin panelinden durum güncellendi.' }).catch(() => null);
    return json({ ok: true, message: 'Sipariş durumu güncellendi.' });
  } catch (error) {
    return adminError(error, 'Sipariş durumu güncellenemedi.');
  }
}
