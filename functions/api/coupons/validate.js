
import { selectRows } from '../_lib/supabase.js';
import { catalog } from '../_lib/catalog.js';
import { json } from '../_lib/response.js';

function money(n){const x=Number(n||0);return Math.round((Number.isFinite(x)?x:0)*100)/100;}
function subtotalFromCart(cart=[]){const map=new Map((Array.isArray(catalog)?catalog:Object.values(catalog||{})).map(p=>[String(p.slug||p.id),p]));return (Array.isArray(cart)?cart:[]).reduce((sum,item)=>{const p=map.get(String(item.slug||item.id||''));const price=Number(p?.price||item.price||0);const qty=Math.max(1,Number(item.qty||item.quantity||1));return sum+price*qty;},0);}
function calc(coupon, subtotal){ if(!coupon) return 0; if(subtotal < Number(coupon.min_subtotal||0)) return 0; if(coupon.type==='free_shipping') return 0; let d=coupon.type==='percent' ? subtotal*Number(coupon.value||0)/100 : Number(coupon.value||0); if(coupon.max_discount) d=Math.min(d,Number(coupon.max_discount)); return money(Math.min(d,subtotal)); }
export async function onRequestPost(context){
  try{
    const body=await context.request.json().catch(()=>({}));
    const code=String(body.code||'').trim().toUpperCase();
    if(!code) return json({ok:false,error:'Kupon kodu gerekli.'},{status:400});
    const rows=await selectRows(context,'coupons',{select:'*',code:`eq.${code}`,is_active:'eq.true',limit:'1'});
    const coupon=Array.isArray(rows)?rows[0]:null;
    if(!coupon) return json({ok:false,error:'Kupon bulunamadı veya aktif değil.'},{status:404});
    const now=Date.now();
    if(coupon.starts_at && new Date(coupon.starts_at).getTime()>now) return json({ok:false,error:'Kupon henüz başlamadı.'},{status:400});
    if(coupon.ends_at && new Date(coupon.ends_at).getTime()<now) return json({ok:false,error:'Kupon süresi doldu.'},{status:400});
    const subtotal=money(body.subtotal || subtotalFromCart(body.cart));
    if(subtotal < Number(coupon.min_subtotal||0)) return json({ok:false,error:`Bu kupon için minimum sepet tutarı ${Number(coupon.min_subtotal).toFixed(0)} TL.`},{status:400});
    const discount=calc(coupon, subtotal);
    return json({ok:true,code:coupon.code,title:coupon.title,type:coupon.type,discountAmount:discount,discountLabel: coupon.type==='free_shipping'?'Ücretsiz kargo':`${discount.toFixed(0)} TL indirim`,minSubtotal:Number(coupon.min_subtotal||0)});
  }catch(error){return json({ok:false,error:error.message||'Kupon doğrulanamadı.'},{status:500});}
}
