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

      const moneyFmt = new Intl.NumberFormat('tr-TR', {
        style: 'currency', currency: 'TRY', maximumFractionDigits: 0
      });
      const statusLabels = {
        paid: 'Odendi',
        pending_payment: 'Odeme Bekleniyor',
        payment_failed: 'Odeme Basarisiz',
        failed: 'Basarisiz'
      };

      // Lookup table for product slug → URL when the order row predates the
      // schema change (older rows may not store `product_slug`).
      const productById = new Map();
      (window.COSMOSKIN_PRODUCTS || []).forEach((p) => productById.set(p.id, p));

      const escapeHtml = (str) => String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const itemRow = (item) => {
        const slug = item.product_slug || item.product_id || '';
        const fallback = productById.get(slug);
        const url = item.product_url || fallback?.url || (slug ? `/products/${encodeURIComponent(slug)}.html` : '');
        const image = item.image || fallback?.image || '';
        const name = item.product_name || fallback?.name || 'Ürün';
        const brand = item.brand || fallback?.brand || '';
        const qty = Number(item.quantity || 0) || 1;
        const lineTotal = moneyFmt.format(item.line_total || 0);

        const imgTag = image
          ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" width="56" height="56" />`
          : `<span class="order-item__placeholder" aria-hidden="true">◈</span>`;

        const media = url
          ? `<a class="order-item__media" href="${escapeHtml(url)}" aria-label="${escapeHtml(name)} ürün sayfası">${imgTag}</a>`
          : `<span class="order-item__media">${imgTag}</span>`;

        const heading = url
          ? `<a class="order-item__name" href="${escapeHtml(url)}">${escapeHtml(name)}</a>`
          : `<span class="order-item__name">${escapeHtml(name)}</span>`;

        return `
          <li class="order-item">
            ${media}
            <div class="order-item__body">
              ${brand ? `<span class="order-item__brand">${escapeHtml(brand)}</span>` : ''}
              ${heading}
              <span class="order-item__meta">Adet: ${qty}</span>
            </div>
            <strong class="order-item__total">${lineTotal}</strong>
          </li>
        `;
      };

      list.innerHTML = orders.map(order => {
        const items = (order.order_items || []).map(itemRow).join('');
        return `
          <article class="summary-card order-card">
            <div class="sum-row"><span>Sipariş No</span><strong>${escapeHtml(order.order_number || order.id)}</strong></div>
            <div class="sum-row"><span>Durum</span><strong>${escapeHtml(statusLabels[order.status] || order.status)}</strong></div>
            <div class="sum-row"><span>Tarih</span><strong>${new Date(order.created_at).toLocaleString('tr-TR')}</strong></div>
            <div class="sum-row"><span>Toplam</span><strong>${moneyFmt.format(order.total_amount || 0)}</strong></div>
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
