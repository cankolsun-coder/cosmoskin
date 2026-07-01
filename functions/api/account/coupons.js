import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows } from '../_lib/supabase.js';
import { approvedCouponCodes, DEPRECATED_COUPONS, publicCouponRow, validateCouponEligibility } from '../_lib/coupons.js';

function codeOf(row = {}) {
  return String(row.code || row.coupon_code || '').trim().toUpperCase();
}

function normalizeStoredCoupon(row = {}) {
  const code = codeOf(row);
  return {
    ...row,
    code,
    coupon_code: code,
    status: String(row.status || row.usage_status || 'available').toLowerCase(),
    manual_apply_required: true,
    copyable: ['available', 'active'].includes(String(row.status || row.usage_status || 'available').toLowerCase())
  };
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;

    const [storedRows, redemptionRows, activeCoupons] = await Promise.all([
      selectRows(context, 'customer_coupons', {
        select: '*',
        user_id: `eq.${auth.user.id}`,
        order: 'created_at.desc',
        limit: '100'
      }).catch(() => []),
      selectRows(context, 'coupon_redemptions', {
        select: '*',
        user_id: `eq.${auth.user.id}`,
        order: 'created_at.desc',
        limit: '100'
      }).catch(() => []),
      selectRows(context, 'coupons', {
        select: '*',
        is_active: 'eq.true',
        limit: '100'
      }).catch(() => [])
    ]);

    const rows = [];
    const seen = new Set();
    for (const row of storedRows || []) {
      const code = codeOf(row);
      if (!code || DEPRECATED_COUPONS.has(code)) continue;
      const normalized = normalizeStoredCoupon(row);
      rows.push(normalized);
      seen.add(`${code}:${normalized.status}`);
    }

    for (const redemption of redemptionRows || []) {
      const code = codeOf(redemption);
      if (!code || DEPRECATED_COUPONS.has(code)) continue;
      const status = String(redemption.status || 'used').toLowerCase();
      if (!['used', 'expired', 'released', 'reversed'].includes(status)) continue;
      const key = `${code}:${status}:${redemption.order_id || ''}`;
      if (seen.has(key)) continue;
      rows.push({
        id: redemption.id,
        code,
        coupon_code: code,
        status,
        used_at: redemption.created_at,
        order_id: redemption.order_id,
        discount_amount: redemption.discount_amount,
        title: `${code} kuponu`,
        description: status === 'used' ? 'Bu kupon bir siparişte kullanıldı.' : 'Bu kupon artık aktif değildir.',
        manual_apply_required: true,
        copyable: false,
        source: 'redemption_history'
      });
      seen.add(key);
    }

    const activeByCode = new Set((activeCoupons || []).map(codeOf).filter(Boolean));
    for (const code of approvedCouponCodes()) {
      if (!activeByCode.has(code) || DEPRECATED_COUPONS.has(code)) continue;
      const alreadyAvailable = rows.some((row) => codeOf(row) === code && ['available', 'active'].includes(String(row.status || '').toLowerCase()));
      if (alreadyAvailable) continue;
      const result = await validateCouponEligibility(context, { code, subtotal: 0, user: auth.user, customerEmail: auth.user.email });
      if (result.eligible || ['BIRTHDAY_NOT_ELIGIBLE', 'ACCOUNT_TOO_NEW', 'TIER_NOT_ELIGIBLE'].includes(result.reasonCode)) {
        const publicRow = publicCouponRow(result);
        if (!result.eligible) publicRow.copyable = false;
        rows.push(publicRow);
      }
    }

    return json({ ok: true, coupons: rows }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('account coupons failed:', error);
    return json({ ok: false, error: error.message || 'Kuponlar alınamadı.' }, { status: 500 });
  }
}
