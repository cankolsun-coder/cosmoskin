import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError } from '../_lib/admin.js';
function clean(v,m=120){return String(v||'').trim().slice(0,m);} 
export async function onRequestGet(context){try{assertAdmin(context);const url=new URL(context.request.url);const params={select:'*',order:'created_at.desc',limit:String(Math.min(150,Math.max(1,Number(url.searchParams.get('limit')||100))))};const status=clean(url.searchParams.get('status'),40);const orderId=clean(url.searchParams.get('order_id'),120);if(status&&status!=='all')params.status=`eq.${status}`;if(orderId)params.order_id=`eq.${orderId}`;const shipments=await selectRows(context,'shipments',params).catch(()=>[]);return json({ok:true,shipments:shipments||[]});}catch(error){return adminError(error,'Kargo kayıtları alınamadı.');}}
