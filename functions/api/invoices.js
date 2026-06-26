import { getUserFromAccessToken, selectRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
function tokenFromReq(req){return (req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');}
function clean(value, max=120){return String(value||'').trim().slice(0,max);}
export async function onRequestGet(context){
  try{
    const token=tokenFromReq(context.request); const user=token?await getUserFromAccessToken(context,token):null;
    if(!user) return json({ok:false,error:'Fatura bilgisi için giriş gerekli.'},{status:401});
    const url=new URL(context.request.url); const orderId=clean(url.searchParams.get('order_id'));
    const orderParams={select:'id,order_number,customer_email,user_id',customer_email:`eq.${String(user.email||'').toLowerCase()}`,order:'created_at.desc',limit:'50'};
    if(orderId) orderParams.id=`eq.${orderId}`;
    const orders=await selectRows(context,'orders',orderParams).catch(()=>[]);
    const ids=(orders||[]).map(o=>o.id).filter(Boolean);
    if(!ids.length) return json({ok:true,invoices:[]});
    const invoices=await selectRows(context,'invoice_records',{select:'id,order_id,invoice_type,invoice_status,invoice_number,provider,provider_reference,pdf_url,issued_at,error_message,metadata,created_at,updated_at',order_id:`in.(${ids.join(',')})`,order:'created_at.desc'}).catch(()=>[]);
    return json({ok:true,invoices:(invoices||[]).map(inv=>({
      ...inv,
      invoice_provider: inv.provider || 'manual',
      invoice_id: inv.provider_reference || null,
      invoice_pdf_url: inv.pdf_url || null,
      invoice_error_message: inv.error_message || null,
      pdf_url: inv.pdf_url || null
    }))});
  }catch(error){ return json({ok:false,error:error.message||'Fatura bilgisi alınamadı.'},{status:500}); }
}
export async function onRequestPost(context){
  return json({ok:false,error:'Fatura/e-Arşiv talebi şu anda admin tarafından manuel kayıt veya gerçek sağlayıcı entegrasyonu ile yönetilir. Sahte fatura oluşturulmaz.'},{status:409});
}
