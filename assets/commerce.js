(function () {
  const cfg = window.COSMOSKIN_CONFIG || {};
  const form = document.getElementById('checkoutForm');
  const checkoutStatus = document.getElementById('checkoutStatus');
  const checkoutSubmit = document.getElementById('checkoutSubmit');
  if (!form) return;

  function setStatus(message, isError) {
    if (!checkoutStatus) return;
    checkoutStatus.textContent = message || '';
    checkoutStatus.style.color = isError ? '#8a3b2f' : '#5d554e';
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
    } catch {
      return [];
    }
  }

  async function getClient() {
    if (window.cosmoskinSupabase) return window.cosmoskinSupabase;
    return null;
  }

  async function prefillUser() {
    const client = await getClient();
    if (!client) return;

    const { data: { session } } = await client.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const emailInput = form.querySelector('input[name="email"]');
    const firstInput = form.querySelector('input[name="first_name"]');
    const lastInput = form.querySelector('input[name="last_name"]');

    if (emailInput && !emailInput.value) emailInput.value = user.email || '';
    if (firstInput && !firstInput.value) firstInput.value = user.user_metadata?.first_name || '';
    if (lastInput && !lastInput.value) lastInput.value = user.user_metadata?.last_name || '';
  }

  prefillUser();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cart = getCart();

    if (!cart.length) {
      setStatus('Sepetiniz boş. Ödeme başlatılamaz.', true);
      return;
    }

    const client = await getClient();
    if (!client) {
      setStatus('Üyelik sistemi hazır değil. assets/site-config.js içindeki Supabase bilgilerini tamamlayın.', true);
      return;
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      setStatus('Ödemeye geçmek için önce giriş yapmanız gerekiyor.', true);
      document.dispatchEvent(new CustomEvent('cosmoskin:open-auth', { detail: { tab: 'loginPanel' } }));
      return;
    }

    checkoutSubmit?.setAttribute('disabled', 'disabled');
    setStatus('Güvenli ödeme sayfası hazırlanıyor...');

    const fd = new FormData(form);
    const payload = {
      accessToken: session.access_token,
      cart,
      customer: Object.fromEntries(fd.entries())
    };

    try {
      const res = await fetch(`${cfg.apiBase || '/api'}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Ödeme başlatılamadı.');

      if (data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
        return;
      }

      throw new Error('iyzico ödeme sayfası URL bilgisi alınamadı.');
    } catch (err) {
      setStatus(err.message || 'Ödeme başlatılamadı.', true);
      checkoutSubmit?.removeAttribute('disabled');
    }
  });
})();
