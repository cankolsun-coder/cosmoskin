
import { selectRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
export async function onRequestGet(context){
  try{
    const url=new URL(context.request.url); const slugs=url.searchParams.get('slugs');
    const params={select:'product_slug,sku,stock_qty,reserved_qty,low_stock_threshold,status,updated_at',order:'product_slug.asc'};
    if(slugs) params.product_slug=`in.(${slugs.split(',').map(s=>s.trim()).filter(Boolean).join(',')})`;
    const rows=await selectRows(context,'inventory',params);
    return json({ok:true,inventory:rows||[]});
  }catch(error){return json({ok:false,error:error.message||'Stok bilgisi alınamadı.'},{status:500});}
}
