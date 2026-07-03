import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { insertRow, selectRows, updateRows } from '../../../_lib/supabase.js';
import { convertInventoryReservations, releaseInventoryReservations } from '../../../_lib/inventory.js';
import { awardOrderPoints, promoteOrderPoints, reverseOrderPoints } from '../../../_lib/loyalty-ledger.js';

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
    const current = (await selectRows(context, 'orders', { select: 'id,status,payment_status,fulfillment_status,payment_method', id: `eq.${id}`, limit: '1' }).catch(() => []))?.[0];
    if (!current) return json({ ok: false, error: 'Sipariş bulunamadı.' }, { status: 404 });
    const nextStatus = payload.status || current.status || '';
    const nextFulfillment = payload.fulfillment_status || current.fulfillment_status || '';
    const publishAsFulfilled = ['shipped', 'delivered'].includes(String(nextStatus)) || ['shipped', 'delivered'].includes(String(nextFulfillment));
    if (current.status === 'cancelled' && publishAsFulfilled) {
      return json({ ok: false, error: 'İptal edilmiş sipariş kargoya verildi veya teslim edildi durumuna alınamaz.' }, { status: 409 });
    }
    if ((current.payment_status === 'failed' || current.status === 'payment_failed') && publishAsFulfilled) {
      return json({ ok: false, error: 'Ödemesi başarısız sipariş kargoya verildi veya teslim edildi durumuna alınamaz.' }, { status: 409 });
    }
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

    // Minimal loyalty hooks, gated on actual before/after transitions.
    // Idempotent and non-throwing — cannot block or alter this response.
    const finalPayment = payload.payment_status || current.payment_status;
    const finalStatus = payload.status || current.status;
    const finalFulfillment = payload.fulfillment_status || current.fulfillment_status;
    if (finalPayment === 'paid' && current.payment_status !== 'paid') {
      await awardOrderPoints(context, id);
    }
    if ((finalStatus === 'delivered' || finalFulfillment === 'delivered') && current.status !== 'delivered' && current.fulfillment_status !== 'delivered') {
      await promoteOrderPoints(context, id);
    }
    const wasSettled = ['cancelled', 'refunded', 'partially_refunded'].includes(current.status) || ['refunded', 'partially_refunded'].includes(current.payment_status) || current.fulfillment_status === 'returned';
    const isSettled = ['cancelled', 'refunded', 'partially_refunded'].includes(finalStatus) || ['refunded', 'partially_refunded'].includes(finalPayment) || finalFulfillment === 'returned';
    if (isSettled && !wasSettled) {
      await reverseOrderPoints(context, id, { reason: body.message || null, source: 'admin', ratio: 1 });
    }

    return json({ ok: true, message: 'Sipariş durumu güncellendi.' });
  } catch (error) {
    return adminError(error, 'Sipariş durumu güncellenemedi.');
  }
}
