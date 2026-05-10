(function () {
  'use strict';
  var form = document.getElementById('orderTrackingForm');
  var status = document.getElementById('trackingStatus');
  var result = document.getElementById('trackingResult');
  if (!form || !status || !result) return;
  var labels = { pending: 'Sipariş alındı', pending_payment: 'Ödeme bekleniyor', confirmed: 'Sipariş alındı', paid: 'Ödeme onaylandı', preparing: 'Hazırlanıyor', packed: 'Paketlendi', shipped: 'Kargoya verildi', delivered: 'Teslim edildi', cancelled: 'İptal edildi', payment_failed: 'Ödeme başarısız', refunded: 'İade edildi', returned: 'İade alındı', unfulfilled: 'Hazırlık bekliyor', failed: 'Başarısız' };
  function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function label(value) { return labels[value] || value || 'İşleniyor'; }
  function date(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(value)); } catch (_) { return value; } }
  function money(value, currency) { try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(value || 0)); } catch (_) { return Number(value || 0).toFixed(2) + ' ' + (currency || 'TRY'); } }
  function setStatus(message, error) { status.textContent = message || ''; status.classList.toggle('is-error', Boolean(error)); }
  function render(order) {
    var shipment = order.shipment || {};
    var items = order.items || [];
    result.hidden = false;
    result.innerHTML = '<div class="tracking-summary">' +
      '<div class="tracking-summary-row"><span>Sipariş</span><strong>' + esc(order.order_number) + '</strong></div>' +
      '<div class="tracking-summary-row"><span>Durum</span><strong>' + esc(label(order.status || order.fulfillment_status)) + '</strong></div>' +
      '<div class="tracking-summary-row"><span>Ödeme</span><strong>' + esc(label(order.payment_status)) + '</strong></div>' +
      '<div class="tracking-summary-row"><span>Tarih</span><strong>' + esc(date(order.created_at)) + '</strong></div>' +
      '<div class="tracking-summary-row"><span>Toplam</span><strong>' + esc(money(order.total_amount, order.currency)) + '</strong></div>' +
      (shipment.tracking_number ? '<div class="tracking-summary-row"><span>Takip No</span><strong>' + esc(shipment.tracking_number) + '</strong></div>' : '') +
      (shipment.carrier ? '<div class="tracking-summary-row"><span>Kargo</span><strong>' + esc(shipment.carrier) + '</strong></div>' : '') +
      (shipment.tracking_url ? '<a class="tracking-btn" href="' + esc(shipment.tracking_url) + '" target="_blank" rel="noopener">Kargoyu Takip Et</a>' : '<div class="tracking-note">Kargo takip bağlantısı oluştuğunda burada görünecek.</div>') +
      '</div>' +
      '<div class="tracking-items">' + (items.length ? items.map(function (item) {
        return '<article class="tracking-item"><img src="' + esc(item.image || '/assets/logo-mark-beige.png') + '" alt="' + esc(item.product_name || 'Ürün') + '"><div><span>' + esc(item.brand || '') + '</span><strong>' + esc(item.product_name || 'Ürün') + '</strong></div><b>x' + esc(item.quantity || 1) + '</b></article>';
      }).join('') : '<p class="tracking-note">Ürün bilgisi bulunamadı.</p>') + '</div>';
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    result.hidden = true;
    var fd = new FormData(form);
    var payload = { order_number: (fd.get('order_number') || '').trim(), email: (fd.get('email') || '').trim().toLowerCase() };
    if (!payload.order_number || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) { setStatus('Sipariş numarası ve geçerli e-posta adresi gerekli.', true); return; }
    setStatus('Sipariş bilgisi kontrol ediliyor...', false);
    try {
      var res = await fetch('/api/order-tracking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Sipariş bulunamadı.');
      setStatus('Sipariş bilgisi bulundu.', false);
      render(data.order || {});
    } catch (error) {
      setStatus(error.message || 'Sipariş takibi alınamadı.', true);
    }
  });
}());
