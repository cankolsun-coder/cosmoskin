import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { insertRow, selectRows, updateRows } from '../../../_lib/supabase.js';
import { sendOrderStatusEmail } from '../../../_lib/order-email.js';

const CARRIERS = new Set(['Yurtiçi Kargo','Aras Kargo','MNG Kargo','Sürat Kargo','Hepsijet','Kolay Gelsin','UPS','DHL','Other']);

function trackingUrl(carrier, number, manual) {
  if (manual) return manual;
  const n = encodeURIComponent(String(number || '').trim());
  if (!n) return null;
  if (carrier === 'Yurtiçi Kargo') return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`;
  if (carrier === 'Aras Kargo') return `https://www.araskargo.com.tr/tracking?code=${n}`;
  if (carrier === 'UPS') return `https://www.ups.com/track?tracknum=${n}`;
  if (carrier === 'DHL') return `https://www.dhl.com/tr-tr/home/tracking.html?tracking-id=${n}`;
  return null;
}

export async function onRequestPost(context) {
  try {
    assertAdmin(context);
    const id = context.params?.id || '';
    const body = await readJsonBody(context);
    const carrier = String(body.carrier_name || body.carrier || '').trim();
    const tracking_number = String(body.tracking_number || '').trim();
    if (!CARRIERS.has(carrier)) return json({ ok: false, error: 'Kargo firması geçersiz.' }, { status: 400 });
    if (!tracking_number) return json({ ok: false, error: 'Takip numarası gerekli.' }, { status: 400 });
    const shipment = await insertRow(context, 'shipments', {
      order_id: id,
      carrier,
      carrier_name: carrier,
      tracking_number,
      tracking_url: trackingUrl(carrier, tracking_number, body.tracking_url || ''),
      status: 'shipped',
      shipped_at: body.shipped_at || new Date().toISOString()
    });
    await updateRows(context, 'orders', { id }, { status: 'shipped', fulfillment_status: 'shipped', fulfilled_at: shipment.shipped_at || new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
    await insertRow(context, 'order_status_events', { order_id: id, status: 'shipped', source: 'admin', message: 'Kargo bilgisi kaydedildi.' }).catch(() => null);

    let email = { sent: false, skipped: true, reason: 'not_requested' };
    if (body.notify_customer !== false) {
      const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, limit: '1' }).catch(() => []))?.[0] || null;
      const items = await selectRows(context, 'order_items', { select: '*', order_id: `eq.${id}`, order: 'created_at.asc' }).catch(() => []);
      try {
        email = await sendOrderStatusEmail(context.env, { order, status: 'shipped', shipment, items });
      } catch (error) {
        email = { sent: false, error: error.message };
      }
    }
    return json({ ok: true, shipment, email, message: email.sent || email.skipped ? 'Kargo bilgisi kaydedildi.' : 'Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.' });
  } catch (error) {
    return adminError(error, 'Kargo bilgisi kaydedilemedi.');
  }
}
