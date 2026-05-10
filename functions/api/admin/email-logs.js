import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';
function clean(v,m=200){return String(v||'').trim().slice(0,m);} 
export async function onRequestGet(context){try{assertAdmin(context);const url=new URL(context.request.url);const params={select:'*',order:'created_at.desc',limit:String(Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||100))))};const status=clean(url.searchParams.get('status'),40);const type=clean(url.searchParams.get('type'),80);const email=clean(url.searchParams.get('email'),160);if(status&&status!=='all')params.status=`eq.${status}`;if(type&&type!=='all')params.email_type=`eq.${type}`;if(email)params.customer_email=`ilike.*${email.replace(/[%*]/g,'')}*`;const logs=await selectRows(context,'email_events',params).catch(()=>[]);return json({ok:true,logs:logs||[]});}catch(error){return adminError(error,'E-posta logları alınamadı.');}}
