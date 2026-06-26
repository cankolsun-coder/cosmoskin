import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../../_lib/admin.js';
import { insertRow, selectRows, updateRows } from '../../../_lib/supabase.js';
import { sendShipmentEmail } from '../../../_lib/order-email.js';
import { recordEmailEvent } from '../../../_lib/email-events.js';

const CARRIERS = new Set(['Yurtiçi Kargo','Aras Kargo','MNG Kargo','Sürat Kargo','Hepsijet','Kolay Gelsin','UPS','DHL eCommerce','DHL','Other']);

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

async function logShipmentEmail(context, order, shipment, result, errorMessage = null) {
  await recordEmailEvent(context, {
    order_id: order?.id || shipment?.order_id || null,
    customer_email: order?.customer_email || 'missing@cosmoskin.local',
    email_type: 'shipment_created',
    provider: result?.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
    status: result?.sent ? 'sent' : (result?.skipped ? 'skipped' : 'failed'),
    subject: 'Siparişin kargoya verildi',
    provider_message_id: result?.provider_message_id || null,
    error_message: errorMessage || result?.reason || result?.error || null,
    metadata: { shipment_id: shipment?.id || null }
  });
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
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
    await insertRow(context, 'order_status_events', {
      order_id: id,
      status: 'shipped',
      event_type: 'shipment_created',
      previous_status: null,
      new_status: 'shipped',
      source: 'admin',
      created_by: 'admin',
      message: 'Kargo bilgisi kaydedildi.',
      note: 'Kargo bilgisi kaydedildi.',
      metadata: { shipment_id: shipment.id, carrier, tracking_number }
    }).catch(() => null);

    let email = { sent: false, skipped: true, reason: 'admin_suppressed' };
    if (body.suppress_customer_email !== true && body.notify_customer !== false) {
      const order = (await selectRows(context, 'orders', { select: '*', id: `eq.${id}`, limit: '1' }).catch(() => []))?.[0] || null;
      try {
        email = await sendShipmentEmail(context.env, { order, shipment });
        await logShipmentEmail(context, order, shipment, email);
      } catch (error) {
        email = { sent: false, error: 'shipment_email_failed' };
        await logShipmentEmail(context, order, shipment, email, error.message || 'shipment_email_failed');
      }
    }
    const message = email.sent ? 'Kargo bilgisi kaydedildi ve müşteriye e-posta gönderildi.' : (body.suppress_customer_email === true || body.notify_customer === false ? 'Kargo bilgisi kaydedildi.' : 'Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.');
    return json({ ok: true, shipment, email, message });
  } catch (error) {
    return adminError(error, 'Kargo bilgisi kaydedilemedi.');
  }
}
