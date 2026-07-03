import { selectRows, updateRows, insertRow, createSignedStorageUrl } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { recordEmailEvent } from '../_lib/email-events.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from '../_lib/order-email.js';

const VALID_STATUS = new Set(['requested','under_review','approved','return_code_shared','waiting_customer_ship','in_transit','received','inspection','refund_pending','refunded','rejected','cancelled','closed']);
const VALID_REFUND = new Set(['not_started','pending','completed','failed']);
function clean(value,max=700){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);}
function inFilter(values = []) { return `in.(${values.filter(Boolean).join(',')})`; }
async function loadOrder(context, id){ const rows=await selectRows(context,'orders',{select:'*',id:`eq.${id}`,limit:'1'}).catch(()=>[]); return rows?.[0]||null; }
function returnNumber(row = {}) { return row.return_number || `CS-RET-${String(row.id || '').replace(/-/g,'').slice(0,10).toUpperCase()}`; }
async function logStatusEvent(context, request, previousStatus, newStatus, note){
  await insertRow(context,'return_status_events',{return_request_id:request.id,old_status:previousStatus||null,new_status:newStatus,event_type:'return_'+newStatus,actor_type:'admin',actor_id:null,note:note||null,metadata:{return_number:returnNumber(request),refund_status:request.refund_status||null}}).catch(()=>null);
  await insertRow(context,'order_status_events',{order_id:request.order_id,status:newStatus,event_type:'return_'+newStatus,previous_status:previousStatus||null,new_status:newStatus,source:'admin',created_by:'admin',message:'İade talebi durumu güncellendi.',note:note||null,metadata:{return_request_id:request.id,return_number:returnNumber(request),refund_status:request.refund_status||null}}).catch(()=>null);
}
async function sendReturnEmail(context, order, type, note=''){
  try{
    const result=await sendCommerceTransactionalEmail(context.env,{order,type,note});
    await recordEmailEvent(context,{order_id:order.id,customer_email:order.customer_email,email_type:type,provider:result.provider||(context.env.BREVO_API_KEY?'brevo':null),status:result.sent?'sent':(result.skipped?'skipped':'failed'),subject:getCommerceEmailSubject(type),provider_message_id:result.provider_message_id||null,error_message:result.reason||result.error||null,metadata:{source:'admin_returns'}});
    return result;
  }catch(error){
    await recordEmailEvent(context,{order_id:order.id,customer_email:order.customer_email,email_type:type,provider:context.env.BREVO_API_KEY?'brevo':null,status:'failed',subject:getCommerceEmailSubject(type),error_message:error.message||'email_failed',metadata:{source:'admin_returns'}});
    return {sent:false,error:'email_failed'};
  }
}
function group(rows = [], key) { return (rows || []).reduce((map,row)=>{ const list = map.get(row[key]) || []; list.push(row); map.set(row[key], list); return map; }, new Map()); }

async function withSignedAttachmentUrls(context, rows = []) {
  return await Promise.all((rows || []).map(async (file) => {
    const bucket = file.storage_bucket || 'return-attachments';
    const path = file.file_path || '';
    if (!path || file.file_url) return file;
    try {
      const signedUrl = await createSignedStorageUrl(context, bucket, path, 60 * 60);
      return { ...file, file_url: signedUrl, file_preview_url: signedUrl, signed_url_expires_in: 3600 };
    } catch (error) {
      return { ...file, file_url: null, file_preview_error: error.message || 'signed_url_failed' };
    }
  }));
}

export async function onRequestGet(context){
  try{
    await assertAdmin(context); const url=new URL(context.request.url); const params={select:'*',order:'created_at.desc',limit:String(Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||100))))};
    const status=clean(url.searchParams.get('status'),50); const refund=clean(url.searchParams.get('refund_status'),50); const email=clean(url.searchParams.get('email'),120);
    if(status&&status!=='all') params.status=`eq.${status}`; if(refund&&refund!=='all') params.refund_status=`eq.${refund}`; if(email) params.customer_email=`ilike.*${email.replace(/[%*]/g,'')}*`;
    const rows=await selectRows(context,'return_requests',params).catch(()=>[]);
    const ids=(rows||[]).map((row)=>row.id).filter(Boolean);
    let items=[],attachments=[],events=[];
    if(ids.length){
      [items,attachments,events]=await Promise.all([
        selectRows(context,'return_request_items',{select:'*',return_request_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[]),
        selectRows(context,'return_request_attachments',{select:'*',return_request_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[]),
        selectRows(context,'return_status_events',{select:'*',return_request_id:inFilter(ids),order:'created_at.asc'}).catch(()=>[])
      ]);
    }
    const childAttachmentRequestIds = new Set((attachments || []).map((file) => file.return_request_id).filter(Boolean));
    const snapshotAttachments = [];
    for (const row of rows || []) {
      if (childAttachmentRequestIds.has(row.id)) continue;
      const snapshot = Array.isArray(row.requested_attachments) ? row.requested_attachments : [];
      for (const file of snapshot) {
        if (!file) continue;
        snapshotAttachments.push({
          ...file,
          return_request_id: row.id,
          storage_bucket: file.storage_bucket || file.bucket || 'return-attachments',
          file_path: file.file_path || file.path || file.storage_path || ''
        });
      }
    }
    attachments = await withSignedAttachmentUrls(context, [...attachments, ...snapshotAttachments]);
    const gi=group(items,'return_request_id'),ga=group(attachments,'return_request_id'),ge=group(events,'return_request_id');
    return json({ok:true,returns:(rows||[]).map((row)=>({
      ...row,
      return_number:returnNumber(row),
      items:gi.get(row.id)|| (Array.isArray(row.requested_items) ? row.requested_items : []),
      attachments:ga.get(row.id)||[],
      status_events:ge.get(row.id)||[],
      attachment_count:Number(row.attachment_count || (ga.get(row.id) || []).length || 0)
    }))});
  }catch(error){ return adminError(error,'İade talepleri alınamadı.'); }
}
export async function onRequestPatch(context){
  try{
    await assertAdmin(context); const body=await readJsonBody(context); const id=clean(body.id,120); if(!id) return json({ok:false,error:'id gerekli.'},{status:400});
    const current=(await selectRows(context,'return_requests',{select:'*',id:`eq.${id}`,limit:'1'}).catch(()=>[]))?.[0]; if(!current) return json({ok:false,error:'İade talebi bulunamadı.'},{status:404});
    const status=clean(body.status,40)||current.status; const refundStatus=clean(body.refund_status,40)||current.refund_status||'not_started';
    if(!VALID_STATUS.has(status)) return json({ok:false,error:'status geçersiz.'},{status:400}); if(!VALID_REFUND.has(refundStatus)) return json({ok:false,error:'refund_status geçersiz.'},{status:400});
    if(status==='rejected' && !clean(body.rejection_reason || body.admin_note,600)) return json({ok:false,error:'Ret nedeni zorunlu.'},{status:400});
    const payload={status,refund_status:refundStatus,admin_note:clean(body.admin_note,1000)||current.admin_note||null,rejection_reason:clean(body.rejection_reason,700)||current.rejection_reason||null,updated_at:new Date().toISOString()};
    if(status==='return_code_shared') payload.return_code_shared_at=new Date().toISOString();
    await updateRows(context,'return_requests',{id},payload);
    const updated={...current,...payload}; await logStatusEvent(context, updated, current.status, status, payload.admin_note || payload.rejection_reason);
    let email=null; const order=await loadOrder(context,current.order_id);
    if(order && status!==current.status){
      if(status==='approved') email=await sendReturnEmail(context,order,'return_approved',payload.admin_note||'');
      if(status==='return_code_shared') email=await sendReturnEmail(context,order,'return_approved','İade gönderim kodunuz hesabınızda görüntülenebilir.');
      if(status==='rejected') email=await sendReturnEmail(context,order,'return_rejected',payload.rejection_reason||payload.admin_note||'');
      if(status==='refunded') email=await sendReturnEmail(context,order,'refund_completed',payload.admin_note||'');
    }
    return json({ok:true,returnRequest:{...updated,return_number:returnNumber(updated)},email,message:'İade talebi güncellendi.'});
  }catch(error){ return adminError(error,'İade talebi güncellenemedi.'); }
}
