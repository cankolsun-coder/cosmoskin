import { assertAdmin, adminError, readJsonBody } from '../../_lib/admin.js';
import { requireAdminPermission, recordAdminActivity } from '../../_lib/admin-audit.js';
import { insertRow } from '../../_lib/supabase.js';
import { json } from '../../_lib/response.js';

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  return code || `CS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'coupons:issue');
    const body = await readJsonBody(context);
    const userId = String(body.user_id || '').trim() || null;
    const email = String(body.email || '').trim().toLowerCase() || null;
    if (!userId && !email) return json({ ok: false, error: 'Kupon için kullanıcı veya e-posta gerekli.' }, { status: 400 });
    const reason = String(body.reason || '').trim();
    if (reason.length < 5) return json({ ok: false, error: 'Kupon verme sebebi zorunludur.' }, { status: 400 });
    const coupon = await insertRow(context, 'customer_coupons', {
      user_id: userId,
      email,
      code: normalizeCode(body.code),
      source: 'admin',
      status: 'available',
      min_subtotal: Number(body.min_subtotal || 0),
      discount_type: String(body.discount_type || 'fixed'),
      discount_value: Number(body.discount_value || 0),
      expires_at: body.expires_at || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      metadata: { reason, campaign_source: body.campaign_source || null }
    });
    await recordAdminActivity(context, { action: 'coupons.issue_customer_coupon', resource_type: 'customer_coupons', resource_id: coupon?.id, after_data: coupon, metadata: { reason } });
    return json({ ok: true, coupon });
  } catch (error) { return adminError(error, 'Müşteri kuponu oluşturulamadı.'); }
}
