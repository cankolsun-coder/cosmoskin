import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { insertRow, selectRows } from '../_lib/supabase.js';
import { getLoyaltyBalance } from '../_lib/loyalty-ledger.js';

const REDEMPTIONS = {
  '1000': { points: 1000, amount: 30, minSubtotal: 350, label: '30 TL indirim' },
  '2500': { points: 2500, amount: 90, minSubtotal: 750, label: '90 TL indirim' },
  '5000': { points: 5000, amount: 200, minSubtotal: 1500, label: '200 TL indirim' },
  '7500': { points: 7500, amount: 0, minSubtotal: 0, label: 'Ücretsiz kargo / mini ürün', type: 'benefit' }
};

function codeFor(points) {
  return `CSCLUB-${points}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function findReplay(context, transactionReference) {
  if (!transactionReference) return null;
  const rows = await selectRows(context, 'loyalty_points_ledger', {
    select: '*',
    transaction_reference: `eq.${transactionReference}`,
    limit: '1'
  }).catch(() => []);
  const row = rows?.[0] || null;
  if (!row) return null;
  const coupon = row.coupon_id
    ? (await selectRows(context, 'customer_coupons', { select: '*', id: `eq.${row.coupon_id}`, limit: '1' }).catch(() => []))?.[0] || null
    : null;
  return { coupon, balance_after: row.balance_after };
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const tier = REDEMPTIONS[String(body.points || body.points_spent || '')];
  if (!tier) return json({ ok: false, error: 'Geçersiz puan kullanım seçeneği.' }, { status: 400 });

  // Optional client-supplied idempotency key: prevents a double-submit
  // (double click / retry) from creating two coupons and double-deducting
  // points for the same logical redemption. Backward compatible — if the
  // caller doesn't send one, behavior is unchanged from before.
  const idempotencyKey = String(body.idempotency_key || '').trim().slice(0, 120);
  const transactionReference = idempotencyKey ? `redeem:${auth.user.id}:${idempotencyKey}` : null;
  if (transactionReference) {
    const replay = await findReplay(context, transactionReference);
    if (replay) return json({ ok: true, coupon: replay.coupon, balance_after: replay.balance_after, replay: true });
  }

  // Redeemable balance MUST come from ledger status = available only.
  // Pending, reversed, cancelled or expired points cannot be redeemed.
  const ledgerBalance = await getLoyaltyBalance(context, auth.user.id);
  const available = ledgerBalance.available_points;
  if (available < tier.points) return json({ ok: false, error: 'Bu kullanım için yeterli puanınız yok.' }, { status: 409 });

  const couponCode = codeFor(tier.points);
  const coupon = await insertRow(context, 'customer_coupons', {
    user_id: auth.user.id,
    email: String(auth.user.email || '').toLowerCase(),
    code: couponCode,
    source: 'loyalty_redemption',
    status: 'available',
    min_subtotal: tier.minSubtotal,
    discount_type: tier.type === 'benefit' ? 'benefit' : 'fixed',
    discount_value: tier.amount,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
    metadata: { label: tier.label, points_spent: tier.points }
  });

  const balanceAfter = available - tier.points;
  let ledgerRow = null;
  try {
    ledgerRow = await insertRow(context, 'loyalty_points_ledger', {
      user_id: auth.user.id,
      email: String(auth.user.email || '').toLowerCase(),
      event_type: 'redemption',
      points_delta: -tier.points,
      balance_after: balanceAfter,
      status: 'available',
      coupon_id: coupon?.id || null,
      source: 'account',
      transaction_reference: transactionReference,
      metadata: { label: tier.label, coupon_code: couponCode }
    });
  } catch (error) {
    // Unique transaction_reference race: another concurrent request already
    // recorded this exact redemption. Return that one instead of a second.
    const replay = await findReplay(context, transactionReference);
    if (replay) return json({ ok: true, coupon: replay.coupon, balance_after: replay.balance_after, replay: true });
    throw error;
  }

  await insertRow(context, 'loyalty_redemptions', {
    user_id: auth.user.id,
    email: String(auth.user.email || '').toLowerCase(),
    points_spent: tier.points,
    benefit_type: tier.label,
    coupon_id: coupon?.id || null,
    status: 'issued',
    metadata: { coupon_code: couponCode, ledger_id: ledgerRow?.id || null }
  });

  return json({ ok: true, coupon, balance_after: balanceAfter });
}
