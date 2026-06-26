import { selectRows, updateRows, insertRow } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { recordEmailEvent } from '../_lib/email-events.js';
import { sendCommerceTransactionalEmail, getCommerceEmailSubject } from '../_lib/order-email.js';

const VALID_STATUS = new Set(['requested','under_review','approved','rejected','received','refunded','closed']);
const VALID_REFUND = new Set(['not_started','pending','completed','failed']);
function clean(value,max=700){return String(value||'').trim().slice(0,max);}
async function loadOrder(context, id){ const rows=await selectRows(context,'orders',{select:'*',id:`eq.${id}`,limit:'1'}).catch(()=>[]); return rows?.[0]||null; }
async function logStatusEvent(context, request, previousStatus, newStatus, note){
  await insertRow(context,'order_status_events',{order_id:request.order_id,status:newStatus,event_type:'return_'+newStatus,previous_status:previousStatus||null,new_status:newStatus,source:'admin',created_by:'admin',message:'İade talebi durumu güncellendi.',note:note||null,metadata:{return_request_id:request.id,refund_status:request.refund_status||null}}).catch(()=>null);
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
export async function onRequestGet(context){
  try{
    await assertAdmin(context); const url=new URL(context.request.url); const params={select:'*',order:'created_at.desc',limit:String(Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||100))))};
    const status=clean(url.searchParams.get('status'),50); const refund=clean(url.searchParams.get('refund_status'),50); const email=clean(url.searchParams.get('email'),120);
    if(status&&status!=='all') params.status=`eq.${status}`; if(refund&&refund!=='all') params.refund_status=`eq.${refund}`; if(email) params.customer_email=`ilike.*${email.replace(/[%*]/g,'')}*`;
    const rows=await selectRows(context,'return_requests',params).catch(()=>[]);
    return json({ok:true,returns:rows||[]});
  }catch(error){ return adminError(error,'İade talepleri alınamadı.'); }
}
export async function onRequestPatch(context){
  try{
    await assertAdmin(context); const body=await readJsonBody(context); const id=clean(body.id,120); if(!id) return json({ok:false,error:'id gerekli.'},{status:400});
    const current=(await selectRows(context,'return_requests',{select:'*',id:`eq.${id}`,limit:'1'}).catch(()=>[]))?.[0]; if(!current) return json({ok:false,error:'İade talebi bulunamadı.'},{status:404});
    const status=clean(body.status,40)||current.status; const refundStatus=clean(body.refund_status,40)||current.refund_status||'not_started';
    if(!VALID_STATUS.has(status)) return json({ok:false,error:'status geçersiz.'},{status:400}); if(!VALID_REFUND.has(refundStatus)) return json({ok:false,error:'refund_status geçersiz.'},{status:400});
    const payload={status,refund_status:refundStatus,admin_note:clean(body.admin_note,1000)||current.admin_note||null,updated_at:new Date().toISOString()};
    await updateRows(context,'return_requests',{id},payload);
    const updated={...current,...payload}; await logStatusEvent(context, updated, current.status, status, payload.admin_note);
    let email=null; const order=await loadOrder(context,current.order_id);
    if(order && status!==current.status){ if(status==='approved') email=await sendReturnEmail(context,order,'return_approved',payload.admin_note||''); if(status==='rejected') email=await sendReturnEmail(context,order,'return_rejected',payload.admin_note||''); }
    return json({ok:true,returnRequest:updated,email,message:'İade talebi güncellendi.'});
  }catch(error){ return adminError(error,'İade talebi güncellenemedi.'); }
}
