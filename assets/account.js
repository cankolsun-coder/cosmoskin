(function () {
  const cfg = window.COSMOSKIN_CONFIG || {};
  const list = document.getElementById('ordersList');
  const state = document.getElementById('ordersState');
  if (!list || !state) return;

  function setState(msg, error) {
    state.textContent = msg;
    state.style.color = error ? '#8a3b2f' : '#5d554e';
  }

  async function init() {
    if (!(window.cosmoskinSupabase || window.supabase?.createClient)) {
      setState('Supabase yapılandırması eksik.', true);
      return;
    }
    const client = window.cosmoskinSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      window.location.href = `/index.html?next=${encodeURIComponent('/account/orders.html')}`;
      return;
    }

    setState('Siparişler yükleniyor...');
    try {
      const res = await fetch(`${cfg.apiBase || '/api'}/get-orders`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Siparişler alınamadı.');
      const orders = data.orders || [];
      if (!orders.length) {
        setState('Henüz tamamlanmış bir siparişiniz yok.');
        list.innerHTML = '';
        return;
      }
      state.textContent = '';
      list.innerHTML = orders.map(order => {
        const items = (order.order_items || []).map(item => `
          <li>${item.brand} ${item.product_name} × ${item.quantity} <strong>${new Intl.NumberFormat('tr-TR', {style:'currency',currency:'TRY', maximumFractionDigits:0}).format(item.line_total || 0)}</strong></li>
        `).join('');
        return `
          <article class="summary-card order-card">
            <div class="sum-row"><span>Sipariş No</span><strong>${order.order_number || order.id}</strong></div>
            <div class="sum-row"><span>Durum</span><strong>${order.status}</strong></div>
            <div class="sum-row"><span>Tarih</span><strong>${new Date(order.created_at).toLocaleString('tr-TR')}</strong></div>
            <div class="sum-row"><span>Toplam</span><strong>${new Intl.NumberFormat('tr-TR', {style:'currency',currency:'TRY', maximumFractionDigits:0}).format(order.total_amount || 0)}</strong></div>
            <ul class="order-items">${items}</ul>
          </article>
        `;
      }).join('');
    } catch (error) {
      setState(error.message || 'Siparişler yüklenemedi.', true);
    }
  }

  init();
})();