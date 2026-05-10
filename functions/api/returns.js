import { getUserFromAccessToken, insertRow, selectRows } from './_lib/supabase.js';
import { recordCrmEvent } from './_lib/crm-events.js';
import { json } from './_lib/response.js';
import { recordEmailEvent } from './_lib/email-events.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from './_lib/order-email.js';
import { assertRateLimit } from './_lib/security.js';

const ACTIVE_RETURN_STATUSES = ['requested','under_review','approved','received'];
const ELIGIBLE_ORDER_STATUSES = new Set(['shipped','delivered']);
const ELIGIBLE_FULFILLMENT = new Set(['shipped','delivered']);
const REASONS = new Set(['Yanlış ürün gönderildi','Ürün hasarlı geldi','Siparişimden vazgeçtim','Diğer']);

function tokenFromReq(req){ return (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,''); }
function clean(value, max = 500){ return String(value || '').trim().slice(0, max); }
function inFilter(values = []) { return `in.(${values.filter(Boolean).join(',')})`; }
function isEligible(order = {}) {
  return ELIGIBLE_ORDER_STATUSES.has(String(order.status || '').toLowerCase()) || ELIGIBLE_FULFILLMENT.has(String(order.fulfillment_status || '').toLowerCase()) || Boolean(order.delivered_at || order.fulfilled_at);
}
async function getAuthUser(context, body = {}) {
  const token = body.accessToken || tokenFromReq(context.request);
  return token ? await getUserFromAccessToken(context, token) : null;
}
async function sendAndLog(context, order, emailType, note = '') {
  try {
    const result = await sendCommerceTransactionalEmail(context.env, { order, type: emailType, note });
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: order.customer_email,
      email_type: emailType,
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject: getCommerceEmailSubject(emailType),
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { source: 'returns_api' }
    });
    return result;
  } catch (error) {
    await recordEmailEvent(context, { order_id: order.id, customer_email: order.customer_email, email_type: emailType, provider: context.env.BREVO_API_KEY ? 'brevo' : null, status: 'failed', subject: getCommerceEmailSubject(emailType), error_message: error.message || 'email_failed', metadata: { source: 'returns_api' } });
    return { sent: false, error: 'email_failed' };
  }
}

export async function onRequestGet(context){
  try{
    const user = await getAuthUser(context);
    if(!user) return json({ok:false,error:'Oturum gerekli.'},{status:401});
    const rows = await selectRows(context,'return_requests',{select:'*',customer_email:`eq.${String(user.email || '').toLowerCase()}`,order:'created_at.desc'}).catch(()=>[]);
    return json({ok:true,returns:rows||[]});
  }catch(error){
    return json({ok:false,error:error.message||'İade talepleri alınamadı.'},{status:500});
  }
}

export async function onRequestPost(context){
  try{
    assertRateLimit(context, 'return-request', 10, 10 * 60 * 1000);
    const body = await context.request.json().catch(()=>({}));
    const user = await getAuthUser(context, body);
    if(!user) return json({ok:false,error:'İade talebi için giriş gerekli.'},{status:401});
    const orderId = clean(body.order_id, 120);
    const reason = clean(body.reason, 120);
    if(!orderId || !reason) return json({ok:false,error:'Sipariş ve iade nedeni gerekli.'},{status:400});
    if(!REASONS.has(reason)) return json({ok:false,error:'İade nedeni geçersiz.'},{status:400});

    const orders = await selectRows(context,'orders',{select:'*',id:`eq.${orderId}`,limit:'1'}).catch(()=>[]);
    const order = orders?.[0] || null;
    if(!order || String(order.customer_email || '').toLowerCase() !== String(user.email || '').toLowerCase()) return json({ok:false,error:'Sipariş bulunamadı.'},{status:404});
    if(!isEligible(order)) return json({ok:false,error:'Bu sipariş için henüz iade talebi oluşturulamaz.'},{status:400});

    const active = await selectRows(context,'return_requests',{select:'id,status',order_id:`eq.${order.id}`,status:inFilter(ACTIVE_RETURN_STATUSES),limit:'1'}).catch(()=>[]);
    if(active?.[0]) return json({ok:false,error:'Bu sipariş için aktif bir iade talebi zaten bulunuyor.'},{status:409});

    const row = await insertRow(context,'return_requests',{
      order_id: order.id,
      user_id: user.id || null,
      customer_email: String(user.email || order.customer_email || '').toLowerCase(),
      reason,
      status:'requested',
      customer_note: clean(body.customer_note || body.note, 700),
      refund_status:'not_started',
      requested_items: Array.isArray(body.items) ? body.items : null
    });
    await recordCrmEvent(context, { event_type: 'return_requested', email: String(user.email || order.customer_email || '').toLowerCase(), order_id: order.id, metadata: { return_request_id: row?.id || null } }).catch(()=>null);
    await insertRow(context,'order_status_events',{order_id:order.id,status:'return_requested',event_type:'return_requested',previous_status:order.status||null,new_status:'return_requested',source:'customer',created_by:'customer',message:'Müşteri iade talebi oluşturdu.',note:reason,metadata:{return_request_id:row?.id||null}}).catch(()=>null);
    const email = await sendAndLog(context, order, 'return_request_received');
    return json({ok:true,returnRequest:row,email,message:'İade talebin alındı. Kozmetik ve kişisel bakım ürünlerinde uygunluk ambalaj, kullanım ve hijyen durumuna göre değerlendirilir.'});
  }catch(error){
    return json({ok:false,error:error.message||'İade talebi oluşturulamadı.'},{status:500});
  }
}
