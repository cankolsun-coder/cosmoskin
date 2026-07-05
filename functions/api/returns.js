import { getUserFromAccessToken, insertRow, insertRows, selectRows } from './_lib/supabase.js';
import { recordCrmEvent } from './_lib/crm-events.js';
import { json } from './_lib/response.js';
import { recordEmailEvent } from './_lib/email-events.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from './_lib/order-email.js';
import { assertRateLimit } from './_lib/security.js';
import { signReturnAttachments } from './_lib/return-attachments.js';

export const RETURN_CLAIM_STATUSES = [
  'requested', 'under_review', 'approved', 'return_code_shared', 'waiting_customer_ship',
  'in_transit', 'received', 'inspection', 'refund_pending', 'refunded'
];
export const RETURN_WINDOW_DAYS = 14;

const NON_RETURNABLE_ORDER_STATUSES = new Set([
  'pending', 'pending_payment', 'pending_bank_transfer', 'payment_failed', 'cancelled', 'preparing', 'packed'
]);
const RETURN_REASONS = new Set(['Vazgeçtim','Yanlış ürün gönderildi','Ürün hasarlı geldi','Eksik ürün gönderildi','Ürün beklentimi karşılamadı','Diğer']);
const ATTACHMENT_REQUIRED_REASONS = new Set(['Yanlış ürün gönderildi','Ürün hasarlı geldi','Eksik ürün gönderildi']);
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','video/mp4']);
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const ERR_NOT_DELIVERED = 'Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz.';
const ERR_WINDOW_EXPIRED = 'İade süresi dolmuştur.';
const ERR_QUANTITY_EXCEEDED = 'Bu ürün için iade adedi satın aldığınız miktarı aşamaz.';
const ERR_ACTIVE_RETURN = 'Bu ürün için daha önce iade talebi oluşturulmuş.';

function tokenFromReq(req){ return (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,''); }
function clean(value, max = 500){ return String(value || '').replace(/\s+/g,' ').trim().slice(0, max); }
function inFilter(values = []) { return `in.(${values.filter(Boolean).join(',')})`; }
function lower(value){ return String(value || '').trim().toLowerCase(); }
function bool(value){ return value === true || value === 'true' || value === '1' || value === 'on'; }
function orderNumber(order = {}) { return order.order_number || order.id || 'COSMOSKIN'; }
function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate() + days); return d; }

/** Canonical delivery timestamp — order.delivered_at or shipment delivered_at only. */
export function resolveDeliveryTimestamp(order = {}, shipmentRows = []) {
  const orderTs = order.delivered_at || null;
  if (orderTs) return orderTs;
  for (const row of shipmentRows || []) {
    if (row?.delivered_at) return row.delivered_at;
  }
  for (const row of shipmentRows || []) {
    if (lower(row?.status) === 'delivered') return row.updated_at || row.created_at || null;
  }
  return null;
}

export function isDeliveredForReturn(order = {}, deliveryAt = null) {
  if (!deliveryAt) return false;
  const status = lower(order.status);
  if (NON_RETURNABLE_ORDER_STATUSES.has(status)) return false;
  if (status === 'shipped' && !order.delivered_at) {
    // Shipped without order.delivered_at is allowed only when a shipment delivery timestamp exists.
    return Boolean(deliveryAt);
  }
  return true;
}

export function withinReturnWindow(deliveryAt) {
  if (!deliveryAt) return false;
  const end = addDays(deliveryAt, RETURN_WINDOW_DAYS);
  return Date.now() <= end.getTime();
}

export function returnWindowEndsAt(deliveryAt) {
  if (!deliveryAt) return null;
  return addDays(deliveryAt, RETURN_WINDOW_DAYS).toISOString();
}

async function loadShipmentRows(context, orderId) {
  if (!orderId) return [];
  return await selectRows(context, 'shipments', {
    select: 'id,order_id,status,delivered_at,created_at,updated_at',
    order_id: `eq.${orderId}`,
    order: 'created_at.desc',
    limit: '5'
  }).catch(() => []);
}

async function resolveOrderDelivery(context, order) {
  const shipments = await loadShipmentRows(context, order.id);
  const deliveryAt = resolveDeliveryTimestamp(order, shipments);
  return { deliveryAt, shipments };
}

async function getAuthUser(context, body = {}) {
  const token = body.accessToken || tokenFromReq(context.request);
  return token ? await getUserFromAccessToken(context, token) : null;
}

function returnNumber(row) {
  const seed = String(row?.id || crypto.randomUUID()).replace(/-/g,'').slice(0,10).toUpperCase();
  return `CS-RET-${seed}`;
}

function isSafeAttachmentPath(value) {
  if (typeof value !== 'string' || !value || value.length > 420) return false;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || value.includes(':')) return false;
  return /^[A-Za-z0-9/_.-]+$/.test(value);
}

function isOwnedAttachmentPath(value, userId) {
  return Boolean(userId) && isSafeAttachmentPath(value) && value.startsWith(`customer/${userId}/`);
}

function normalizeAttachments(input = []) {
  return (Array.isArray(input) ? input : []).slice(0, MAX_ATTACHMENTS).map((file) => ({
    file_path: clean(file.file_path || file.path || '', 420),
    file_url: clean(file.file_url || file.url || '', 700),
    file_name: clean(file.file_name || file.name || 'iade-ek-dosyasi', 180),
    mime_type: clean(file.mime_type || file.type || '', 120),
    file_size: Math.max(0, Number(file.file_size || file.size || 0)),
    uploaded_by: clean(file.uploaded_by || 'customer', 40)
  })).filter((file) => file.file_path && ALLOWED_MIME.has(file.mime_type) && file.file_size <= MAX_ATTACHMENT_SIZE);
}

function normalizeItems(input = [], orderItems = []) {
  const byId = new Map((orderItems || []).map((item) => [String(item.id || ''), item]));
  const bySlug = new Map((orderItems || []).map((item) => [String(item.product_slug || item.product_id || ''), item]));
  return (Array.isArray(input) ? input : []).map((raw) => {
    const orderItemId = clean(raw.order_item_id || raw.id || '', 120);
    const slug = clean(raw.product_slug || raw.product_id || '', 180);
    const source = byId.get(orderItemId) || bySlug.get(slug) || null;
    const maxQty = Number(source?.quantity || 0);
    const quantity = Math.max(0, Math.min(maxQty || 0, Number(raw.quantity || 1)));
    const reason = clean(raw.reason || raw.return_reason || '', 120);
    return {
      order_item_id: orderItemId || source?.id || null,
      product_id: clean(source?.product_id || raw.product_id || slug, 180),
      product_slug: clean(source?.product_slug || slug || raw.product_id, 180),
      product_name_snapshot: clean(source?.product_name || raw.product_name || raw.name || 'Ürün', 240),
      sku_snapshot: clean(source?.sku || raw.sku || '', 120),
      quantity,
      reason,
      note: clean(raw.note || raw.customer_note || '', 420),
      unit_price_snapshot: Number(source?.unit_price || raw.unit_price || raw.price || 0),
      refundable_amount: Math.max(0, Number(source?.unit_price || raw.unit_price || raw.price || 0) * quantity),
      condition_status: clean(raw.condition_status || 'customer_declared', 80),
      purchased_quantity: maxQty
    };
  }).filter((item) => item.product_slug && RETURN_REASONS.has(item.reason) && item.quantity > 0);
}

function aggregateItemsByLine(items = []) {
  const map = new Map();
  for (const item of items) {
    const key = String(item.order_item_id || item.product_slug || '');
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.refundable_amount = Math.max(0, existing.unit_price_snapshot * existing.quantity);
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

export function buildClaimedQuantityMap(returnItems = [], returnRequestsById = new Map()) {
  const claimed = new Map();
  for (const row of returnItems || []) {
    const parent = returnRequestsById.get(row.return_request_id);
    if (!parent || !RETURN_CLAIM_STATUSES.includes(String(parent.status || ''))) continue;
    const key = String(row.order_item_id || row.product_slug || '');
    if (!key) continue;
    claimed.set(key, (claimed.get(key) || 0) + Number(row.quantity || 0));
  }
  return claimed;
}

export function validateCumulativeReturnQuantities(items = [], claimedMap = new Map()) {
  for (const item of items) {
    const key = String(item.order_item_id || item.product_slug || '');
    const purchased = Number(item.purchased_quantity || 0);
    const requested = Number(item.quantity || 0);
    const claimed = Number(claimedMap.get(key) || 0);
    if (requested <= 0) return { ok: false, error: ERR_QUANTITY_EXCEEDED, item };
    if (purchased <= 0) return { ok: false, error: ERR_QUANTITY_EXCEEDED, item };
    if (claimed + requested > purchased) return { ok: false, error: ERR_QUANTITY_EXCEEDED, item };
  }
  return { ok: true };
}

async function loadClaimedQuantitiesForOrder(context, orderId) {
  const requests = await selectRows(context, 'return_requests', {
    select: 'id,status',
    order_id: `eq.${orderId}`,
    status: inFilter(RETURN_CLAIM_STATUSES),
    limit: '100'
  }).catch(() => []);
  const requestMap = new Map((requests || []).map((row) => [row.id, row]));
  const ids = [...requestMap.keys()];
  if (!ids.length) return new Map();
  const itemRows = await selectRows(context, 'return_request_items', {
    select: 'return_request_id,order_item_id,product_slug,quantity',
    return_request_id: inFilter(ids),
    limit: '500'
  }).catch(() => []);
  return buildClaimedQuantityMap(itemRows, requestMap);
}

function hygienePayload(body = {}) {
  return {
    hygiene_confirmed: bool(body.hygiene_confirmed),
    unused_confirmed: bool(body.unused_confirmed),
    seal_intact_confirmed: bool(body.seal_intact_confirmed),
    resaleable_confirmed: bool(body.resaleable_confirmed),
    return_terms_confirmed: bool(body.return_terms_confirmed)
  };
}

function requiresHygiene(items = []) {
  return items.some((item) => ['Vazgeçtim','Ürün beklentimi karşılamadı'].includes(item.reason));
}

function requiresAttachment(items = []) { return items.some((item) => ATTACHMENT_REQUIRED_REASONS.has(item.reason)); }

async function sendAndLog(context, order, emailType, note = '', toOverride = '') {
  try {
    const result = await sendCommerceTransactionalEmail(context.env, { order, type: emailType, note, to: toOverride || undefined, subject: toOverride ? `${getCommerceEmailSubject(emailType)} | ${orderNumber(order)}` : undefined });
    await recordEmailEvent(context, {
      order_id: order.id,
      customer_email: toOverride || order.customer_email,
      email_type: emailType,
      provider: result.provider || (context.env.BREVO_API_KEY ? 'brevo' : null),
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      subject: getCommerceEmailSubject(emailType),
      provider_message_id: result.provider_message_id || null,
      error_message: result.reason || result.error || null,
      metadata: { source: 'returns_api', to_override: Boolean(toOverride) }
    });
    return result;
  } catch (error) {
    await recordEmailEvent(context, { order_id: order.id, customer_email: toOverride || order.customer_email, email_type: emailType, provider: context.env.BREVO_API_KEY ? 'brevo' : null, status: 'failed', subject: getCommerceEmailSubject(emailType), error_message: error.message || 'email_failed', metadata: { source: 'returns_api' } });
    return { sent: false, error: 'email_failed' };
  }
}

export async function onRequestGet(context){
  try{
    const user = await getAuthUser(context);
    if(!user) return json({ok:false,error:'Oturum gerekli.'},{status:401});
    const url = new URL(context.request.url);
    const scope = url.searchParams.get('scope') || '';
    if (scope === 'eligible-orders') {
      const orders = await selectRows(context,'orders',{select:'id,order_number,status,payment_status,fulfillment_status,total_amount,currency,customer_email,delivered_at,created_at,updated_at',or:`(user_id.eq.${user.id},customer_email.eq.${lower(user.email)})`,order:'created_at.desc',limit:'30'}).catch(()=>[]);
      const ids = (orders || []).map((o)=>o.id).filter(Boolean);
      let items = [];
      if (ids.length) items = await selectRows(context,'order_items',{select:'id,order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total',order_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[]);
      const grouped = new Map();
      (items || []).forEach((item)=>{ const list = grouped.get(item.order_id) || []; list.push(item); grouped.set(item.order_id, list); });
      const enriched = await Promise.all((orders || []).map(async (order) => {
        const { deliveryAt } = await resolveOrderDelivery(context, order);
        const eligible = isDeliveredForReturn(order, deliveryAt) && withinReturnWindow(deliveryAt);
        return {
          ...order,
          is_return_eligible: eligible,
          return_window_ends_at: returnWindowEndsAt(deliveryAt),
          delivery_resolved_at: deliveryAt,
          order_items: grouped.get(order.id) || []
        };
      }));
      return json({ ok:true, orders: enriched });
    }
    const rows = await selectRows(context,'return_requests',{select:'*',customer_email:`eq.${lower(user.email)}`,order:'created_at.desc'}).catch(()=>[]);
    const ids = (rows || []).map((row)=>row.id).filter(Boolean);
    let items = [], attachments = [], events = [];
    if (ids.length) {
      [items, attachments, events] = await Promise.all([
        selectRows(context,'return_request_items',{select:'*',return_request_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[]),
        selectRows(context,'return_request_attachments',{select:'*',return_request_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[]),
        selectRows(context,'return_status_events',{select:'*',return_request_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[])
      ]);
    }
    const group = (rows, key) => (rows || []).reduce((map,row)=>{ const list = map.get(row[key]) || []; list.push(row); map.set(row[key], list); return map; }, new Map());
    const gi = group(items,'return_request_id'), ga = group(attachments,'return_request_id'), ge = group(events,'return_request_id');
    const returnsWithSignedAttachments = await Promise.all((rows||[]).map(async (row)=>({
      ...row,
      items:gi.get(row.id)||[],
      attachments: await signReturnAttachments(context, ga.get(row.id)||[]),
      status_events:ge.get(row.id)||[]
    })));
    return json({ok:true,returns:returnsWithSignedAttachments});
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
    if(!orderId) return json({ok:false,error:'Sipariş seçimi gerekli.'},{status:400});

    const orders = await selectRows(context,'orders',{select:'*',id:`eq.${orderId}`,limit:'1'}).catch(()=>[]);
    const order = orders?.[0] || null;
    if(!order || lower(order.customer_email) !== lower(user.email)) return json({ok:false,error:'Sipariş bulunamadı.'},{status:404});

    const { deliveryAt } = await resolveOrderDelivery(context, order);
    if(!isDeliveredForReturn(order, deliveryAt)) return json({ok:false,error:ERR_NOT_DELIVERED},{status:400});
    if(!withinReturnWindow(deliveryAt)) return json({ok:false,error:ERR_WINDOW_EXPIRED},{status:400});

    const orderItems = await selectRows(context,'order_items',{select:'id,order_id,product_id,product_slug,product_name,brand,sku,image,unit_price,quantity,line_total',order_id:`eq.${order.id}`,order:'created_at.asc'}).catch(()=>[]);
    let items = aggregateItemsByLine(normalizeItems(body.items, orderItems));
    if(!items.length) return json({ok:false,error:'İade etmek istediğiniz ürünleri ve iade sebebini seçin.'},{status:400});

    const claimedMap = await loadClaimedQuantitiesForOrder(context, order.id);
    const qtyCheck = validateCumulativeReturnQuantities(items, claimedMap);
    if (!qtyCheck.ok) {
      const activeSlugBlock = items.find((item) => {
        const key = String(item.order_item_id || item.product_slug || '');
        return (claimedMap.get(key) || 0) > 0;
      });
      if (activeSlugBlock && qtyCheck.error === ERR_QUANTITY_EXCEEDED) {
        return json({ ok:false, error: ERR_ACTIVE_RETURN }, { status:409 });
      }
      return json({ ok:false, error: qtyCheck.error || ERR_QUANTITY_EXCEEDED }, { status:400 });
    }

    const hygiene = hygienePayload(body);
    if(requiresHygiene(items) && !(hygiene.hygiene_confirmed && hygiene.unused_confirmed && hygiene.seal_intact_confirmed && hygiene.resaleable_confirmed && hygiene.return_terms_confirmed)) return json({ok:false,error:'Kozmetik/hijyen iade koşulları için gerekli onayları tamamlayın.'},{status:400});
    const rawAttachmentPaths = (Array.isArray(body.attachments) ? body.attachments : [])
      .map((file) => String(file?.file_path || file?.path || '').trim())
      .filter(Boolean);
    if (rawAttachmentPaths.some((filePath) => !isOwnedAttachmentPath(filePath, user.id))) {
      return json({ok:false,error:'Ek dosyalardan biri bu hesaba ait değil veya geçersiz bir dosya yolu içeriyor. Lütfen dosyaları yeniden yükleyip tekrar deneyin.'},{status:403});
    }
    const attachments = normalizeAttachments(body.attachments);
    if(requiresAttachment(items) && !attachments.length) return json({ok:false,error:'Hasarlı, yanlış veya eksik ürün taleplerinde fotoğraf/video eklenmelidir.'},{status:400});

    const created = await insertRow(context,'return_requests',{
      order_id: order.id,
      user_id: user.id || null,
      customer_email: lower(user.email || order.customer_email || ''),
      reason: items.length === 1 ? items[0].reason : 'Çoklu ürün iadesi',
      status:'requested',
      customer_note: clean(body.customer_note || body.note, 900),
      refund_status:'not_started',
      requested_items: items,
      requested_attachments: attachments,
      attachment_count: attachments.length,
      return_number: body.return_number || null,
      delivered_at: deliveryAt,
      requested_at: new Date().toISOString(),
      return_window_ends_at: returnWindowEndsAt(deliveryAt),
      is_within_return_window: true,
      ...hygiene
    });
    const returnNo = created?.return_number || returnNumber(created);
    const itemRows = items.map((item)=>({
      return_request_id: created.id,
      order_item_id: item.order_item_id,
      product_id: item.product_id,
      product_slug: item.product_slug,
      product_name_snapshot: item.product_name_snapshot,
      sku_snapshot: item.sku_snapshot,
      quantity: item.quantity,
      reason: item.reason,
      note: item.note,
      unit_price_snapshot: item.unit_price_snapshot,
      refundable_amount: item.refundable_amount,
      condition_status: item.condition_status
    }));
    if (itemRows.length) {
      await insertRows(context,'return_request_items',itemRows);
    }
    const attachmentRows = attachments.map((file)=>({
      return_request_id: created.id,
      order_id: order.id,
      customer_id: user.id || null,
      file_path: file.file_path,
      file_url: file.file_url || null,
      file_name: file.file_name,
      mime_type: file.mime_type,
      file_size: file.file_size,
      storage_bucket: file.storage_bucket || 'return-attachments',
      uploaded_by: file.uploaded_by
    }));
    if (attachmentRows.length) {
      await insertRows(context,'return_request_attachments',attachmentRows);
    }
    await insertRow(context,'return_status_events',{return_request_id:created.id,old_status:null,new_status:'requested',event_type:'return_requested',actor_type:'customer',actor_id:user.id||null,note:'Müşteri iade talebi oluşturdu.',metadata:{return_number:returnNo,attachment_count:attachments.length}}).catch(()=>null);
    await recordCrmEvent(context, { event_type: 'return_requested', email: lower(user.email || order.customer_email || ''), order_id: order.id, metadata: { return_request_id: created?.id || null, return_number:returnNo, items:items.length } }).catch(()=>null);
    await insertRow(context,'order_status_events',{order_id:order.id,status:'return_requested',event_type:'return_requested',previous_status:order.status||null,new_status:'return_requested',source:'customer',created_by:'customer',message:'Müşteri iade talebi oluşturdu.',note:items.map((item)=>item.reason).join(', '),metadata:{return_request_id:created?.id||null,return_number:returnNo,items:items.length,attachments:attachments.length}}).catch(()=>null);
    const customerEmail = await sendAndLog(context, order, 'return_request_received', `${returnNo} numaralı iade talebi alındı.`);
    const supportEmail = await sendAndLog(context, order, 'return_request_received', `Yeni iade talebi oluşturuldu: ${returnNo}. Müşteri: ${user.email}. Ürünler: ${items.map((item)=>item.product_name_snapshot).join(', ')}.`, 'destek@cosmoskin.com.tr');
    return json({ok:true,returnRequest:{...created,return_number:returnNo,items,attachments},email:customerEmail,supportEmail,message:'İade talebiniz alındı. Talebiniz COSMOSKIN ekibi tarafından incelenecektir.'});
  }catch(error){
    return json({ok:false,error:error.message||'İade talebi oluşturulamadı.'},{status:500});
  }
}
