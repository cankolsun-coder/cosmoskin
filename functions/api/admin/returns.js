
import { selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
function assertAdmin(context){const token=context.request.headers.get('x-admin-token')||''; if(!context.env.ADMIN_TOKEN||token!==context.env.ADMIN_TOKEN) throw new Error('Unauthorized');}
export async function onRequestGet(context){try{assertAdmin(context); const rows=await selectRows(context,'return_requests',{select:'*',order:'created_at.desc'}); return json({ok:true,returns:rows||[]});}catch(error){return json({ok:false,error:error.message},{status:error.message==='Unauthorized'?401:500});}}
export async function onRequestPatch(context){try{assertAdmin(context); const body=await context.request.json(); if(!body.id) return json({ok:false,error:'id gerekli.'},{status:400}); await updateRows(context,'return_requests',{id:body.id},{status:body.status||'under_review',admin_note:body.admin_note||null,updated_at:new Date().toISOString()}); return json({ok:true});}catch(error){return json({ok:false,error:error.message},{status:error.message==='Unauthorized'?401:500});}}
