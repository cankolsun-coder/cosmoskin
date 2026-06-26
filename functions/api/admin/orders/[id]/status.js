import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { insertRow, selectRows, updateRows } from '../../../_lib/supabase.js';
import { convertInventoryReservations, releaseInventoryReservations } from '../../../_lib/inventory.js';

const VALID_STATUS = new Set(['pending_payment','pending_bank_transfer','paid','preparing','shipped','delivered','cancelled','payment_failed','refunded','partially_refunded']);
const VALID_FULFILLMENT = new Set(['not_started','unfulfilled','preparing','packed','shipped','delivered','cancelled','returned']);

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
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
    const current = (await selectRows(context, 'orders', { select: 'id,status,payment_status', id: `eq.${id}`, limit: '1' }).catch(() => []))?.[0];
    if (!current) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    if (body.status === 'cancelled' && ['paid', 'refunded', 'partially_refunded'].includes(String(current.payment_status || ''))) {
      return json({ ok: false, error: 'Ödemesi alınmış sipariş doğrudan iptal edilemez. Kontrollü iade akışını kullanın.' }, { status: 409 });
    }
    if (body.status === 'cancelled') {
      await releaseInventoryReservations(context, id, 'admin_cancelled');
      payload.payment_status = current.payment_status === 'paid' ? current.payment_status : 'failed';
      payload.fulfillment_status = 'cancelled';
    } else if (body.status === 'paid') {
      await convertInventoryReservations(context, id);
      payload.payment_status = 'paid';
      payload.fulfillment_status = payload.fulfillment_status || 'preparing';
    }
    await updateRows(context, 'orders', { id }, payload);
    await insertRow(context, 'order_status_events', { order_id: id, status: body.status || body.fulfillment_status || 'updated', source: 'admin', message: body.message || 'Admin panelinden durum güncellendi.' }).catch(() => null);
    return json({ ok: true, message: 'Sipariş durumu güncellendi.' });
  } catch (error) {
    return adminError(error, 'Sipariş durumu güncellenemedi.');
  }
}
