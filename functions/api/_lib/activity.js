export async function createAccountActivity(supabase, {
  userId,
  type = 'activity',
  title,
  body = null,
  actionUrl = null,
  actionLabel = 'Görüntüle',
  metadata = {}
}) {
  if (!supabase || !userId || !title) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase.rpc('create_account_activity', {
    p_user_id: userId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_action_url: actionUrl,
    p_action_label: actionLabel,
    p_metadata: metadata
  });

  // Activity logging must never break checkout/routine/reward flows.
  if (error) {
    console.warn('[COSMOSKIN] createAccountActivity failed:', error.message);
  }

  return { data, error };
}

export function orderActivityPayload(order = {}) {
  const orderId = order.id || order.order_id || order.number || order.order_number || '';
  const total = order.total_amount || order.total || order.amount;

  return {
    type: 'order',
    title: 'Siparişin alındı',
    body: total ? `Siparişin başarıyla oluşturuldu. Toplam: ${total}` : 'Siparişin başarıyla oluşturuldu.',
    actionUrl: `/account/order-detail.html?id=${encodeURIComponent(orderId)}`,
    actionLabel: 'Siparişi Gör',
    metadata: { order_id: orderId, source: 'backend_helper' }
  };
}

export function routineActivityPayload(mode = 'rutin') {
  return {
    type: 'routine',
    title: 'Rutin tamamlandı',
    body: `Bugünkü ${mode} rutinin tamamlandı. Cilt bakım serin güncellendi.`,
    actionUrl: '/account/routines.html',
    actionLabel: 'Rutini Gör',
    metadata: { mode, source: 'backend_helper' }
  };
}

export function rewardActivityPayload(amount, reason = 'Puan hareketi') {
  return {
    type: 'reward',
    title: Number(amount) >= 0 ? 'Puan kazandın' : 'Puan kullandın',
    body: amount !== undefined && amount !== null ? `${reason} (${amount} puan)` : reason,
    actionUrl: '/account/rewards.html',
    actionLabel: 'Puanları Gör',
    metadata: { amount, reason, source: 'backend_helper' }
  };
}

export function offerActivityPayload() {
  return {
    type: 'offer',
    title: 'Kişisel teklifin hazır',
    body: 'Sık kullandığın ürünlere ve benzerlerine özel avantajlar seni bekliyor.',
    actionUrl: '/account/personal-offers.html',
    actionLabel: 'Teklifleri Gör',
    metadata: { source: 'backend_helper' }
  };
}
