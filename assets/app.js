(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const cfg = window.COSMOSKIN_CONFIG || {};
  const VAT = Number(cfg.vatRate ?? 0.20);
  const FREE_SHIPPING = Number(cfg.freeShippingThreshold ?? 2500);
  const SHIPPING_FEE = Number(cfg.shippingFee ?? 119);
  const state = {
    cart: JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'),
    favorites: [],
    consent: JSON.parse(localStorage.getItem('cosmoskin_consent') || 'null')
  };
  const FAVORITES_KEY = 'cosmoskin_favorites';
  const LEGACY_FAVORITES_KEY = 'cosmoskin_favorites_v1';
  let favoriteAccountSyncReady = false;

  const SHARED_HEADER_HTML = `
    <header class="header" data-cosmoskin-header="shared">
      <a class="brand" href="/index.html" aria-label="Cosmoskin anasayfa">
        <img class="brand-logo" src="/assets/logo-mark.png" alt="Cosmoskin logo"/>
        <span class="brand-word">COSMOSKIN</span>
      </a>
      <nav class="site-nav" aria-label="Ana gezinme">
        <div class="nav-shell">
          <form class="site-search-form" role="search" autocomplete="off">
            <div class="site-search" aria-label="Site içi arama">
              <span class="site-search-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24"><path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm8 2-3.6-3.6" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>
              </span>
              <input class="site-search-input" type="search" name="q" placeholder="Ürün, marka veya içerik ara" aria-label="Ürün, marka veya içerik ara" value="${escapeHtml(new URLSearchParams(window.location.search).get('q') || '')}"/>
              <button class="site-search-clear" type="button" aria-label="Aramayı temizle">Sil</button>
            </div>
            <div class="site-search-results" hidden></div>
          </form>
          <ul class="nav">
            <li class="categories-wrap">
              <button class="linkish categories-trigger" aria-expanded="false">Kategoriler</button>
              <div class="mega mega--categories mega--discovery">
                <div><h4>Ürün Tipi</h4><a href="/collections/cleanse.html">Temizleyiciler<span>Jel, köpük ve günlük arındırma ürünleri</span></a><a href="/collections/hydrate.html">Tonik &amp; Essence<span>Nem katmanını destekleyen hafif dokular</span></a><a href="/collections/treat.html">Serum &amp; Ampul<span>Leke, ışıltı ve hedef bakım odaklı serumlar</span></a><a href="/collections/care.html">Nemlendiriciler<span>Krem, göz çevresi ve destek bakım ürünleri</span></a><a href="/collections/protect.html">Güneş Koruyucular<span>Günlük şehir kullanımına uygun SPF seçkileri</span></a><a href="/collections/masks.html">Maskeler<span>Sheet mask ve destek bakım editleri</span></a></div>
                <div><h4>Cilt Tipi</h4><a href="/collections/hydrate.html">Kuru Cilt<span>Nem ve konfor odaklı hafif katmanlar</span></a><a href="/collections/protect.html">Yağlı Cilt<span>Dengeli, hafif ve parlama hissini azaltan seçimler</span></a><a href="/collections/routine.html">Karma Cilt<span>Günlük denge için sabah-akşam akışlar</span></a><a href="/collections/care.html">Hassas Cilt<span>Bariyer dostu ve yatıştırıcı destek bakım</span></a><a href="/collections/routine.html">Normal Cilt<span>Sade ve dengeli bakım başlangıçları</span></a></div>
                <div><h4>Cilt Problemleri</h4><a href="/collections/hydrate.html">Nemsizlik<span>Su tutmaya yardımcı, dolgunluk hissi veren seçimler</span></a><a href="/collections/care.html">Hassasiyet &amp; Kızarıklık<span>Yatıştırıcı ve bariyer dostu bakım önerileri</span></a><a href="/collections/treat.html">Leke Görünümü<span>Daha eşit ve aydınlık görünüm odaklı serumlar</span></a><a href="/collections/blemish.html">Akne Eğilimi<span>Gözenek ve sebum dengesini hedefleyen bakım</span></a><a href="/collections/protect.html">Gözenek &amp; Sebum<span>Hafif SPF ve günlük denge seçkileri</span></a><a href="/collections/care.html">Bariyer Desteği<span>Konforu artıran krem ve essence katmanları</span></a></div>
                <div><h4>Öne Çıkan İçerikler</h4><a href="/collections/hydrate.html">DIVE-IN Serum<span>Günlük nem ve dolgun görünüm desteği</span></a><a href="/collections/treat.html">Niacinamide<span>Ton eşitsizliği ve görünüm dengesi</span></a><a href="/collections/care.html">Centella Asiatica<span>Yatıştırıcı ve hassasiyet odaklı bakım</span></a><a href="/collections/treat.html">Salicylic Acid<span>Akne eğilimi ve gözenek görünümüne destek</span></a><a href="/collections/treat.html">Vitamin C<span>Daha aydınlık ve canlı görünüm için</span></a><a href="/collections/protect.html">Rice Extract<span>Işıltı hissini destekleyen hafif seçkiler</span></a></div>
                <div class="mega-side mega-side--finder"><small>Kişisel keşif</small><strong>Cildin için doğru<br/>ürünü daha hızlı bul.</strong><p>Ürün tipi, cilt tipi, problem ve içerik katmanlarını tek yerde toplayan net keşif akışı.</p><div class="mega-side__pills"><span>Cilt tipini seç</span><span>Problemini seç</span><span>Rutini keşfet</span></div><a class="btn btn-secondary" href="/index.html#routineLanding">Rutin Oluştur</a></div>
              </div>
            </li>
            <li class="brands-wrap">
              <button class="linkish brands-trigger" aria-expanded="false">Markalar</button>
              <div class="mega brands-mega">
                <div><h4>Seçili Markalar</h4><a href="/brands/anua.html">Anua<span>Heartleaf ile hassas ve yatıştırıcı günlük bakım seçkisi</span></a><a href="/brands/cosrx.html">COSRX<span>Essence, bariyer desteği ve bakım ikonları</span></a><a href="/brands/beauty-of-joseon.html">Beauty of Joseon<span>Rahat dokulu SPF ve glow odaklı serumlar</span></a><a href="/brands/round-lab.html">Round Lab<span>Nazik temizleyiciler ve günlük denge ürünleri</span></a><a href="/brands/torriden.html">Torriden<span>Nem odaklı serum ve SPF seçkileri</span></a><a href="/brands/skin1004.html">SKIN1004<span>Centella odaklı serum ve yatıştırıcı bakım</span></a></div>
                <div><h4>K-Beauty Editi</h4><a href="/brands/by-wishtrend.html">By Wishtrend<span>Vitamin C ve aktif içerik odaklı profesyonel seçki</span></a><a href="/brands/dr-jart.html">Dr. Jart+<span>Seramid ve bariyer odaklı dermatoloji tasarım markası</span></a><a href="/brands/goodal.html">Goodal<span>Yeşil mandalin Vitamin C ile parlaklık odağı</span></a><a href="/brands/im-from.html">I'm From<span>Pirinç ve doğal içerikli sade K-beauty seçkisi</span></a><a href="/brands/innisfree.html">Innisfree<span>Jeju adası kaynaklı doğal içerikli cilt bakımı</span></a><a href="/brands/isntree.html">Isntree<span>Hyaluronik asit odaklı dermatoloji dostu ürünler</span></a></div>
                <div><h4>Özel Seçki</h4><a href="/brands/laneige.html">Laneige<span>Su bazlı nem teknolojisi ve uyku maskesi ikonu</span></a><a href="/brands/medicube.html">Medicube<span>Gözenek ve akne odaklı aktif içerik seçkisi</span></a><a href="/brands/mediheal.html">Mediheal<span>Sheet mask ve profesyonel nem yoğunlaşması</span></a><a href="/brands/some-by-mi.html">Some By Mi<span>AHA BHA Miracle serisi ile akne ve gözenek bakımı</span></a></div>
                <div class="mega-side"><small>Markalar</small><strong>Rafine seçki,<br/>tek bakışta net.</strong><p>Marka bazlı gezinme ile ürünü daha hızlı bulmanızı sağlayan sade yapı.</p><a class="btn btn-secondary" href="/contact.html">Marka Talebi</a></div>
              </div>
            </li>
            <li><a href="/collections/routine.html">Rutinler</a></li>
            <li><a href="/contact.html">Destek</a></li>
          </ul>
        </div>
      </nav>
      <div class="header-tools">
        <button class="tool-btn mobile-toggle" id="mobileToggle" aria-label="Menüyü aç">
          <svg fill="none" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round" stroke-width="1.8"></path></svg>
        </button>
        <button class="tool-btn" id="accountBtn" aria-label="Hesap">
          <svg fill="none" viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 1 1 14 0" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>
        </button>
        <button class="tool-btn" id="cartBtn" aria-label="Sepet">
          <svg fill="none" viewBox="0 0 24 24"><path d="M3 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L21 8H7" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path><circle cx="10" cy="19" r="1.4" stroke-width="1.8"></circle><circle cx="18" cy="19" r="1.4" stroke-width="1.8"></circle></svg>
          <span class="cart-count">0</span>
        </button>
      </div>
    </header>`;

  const SHARED_MOBILE_NAV_HTML = `
    <div class="mobile-nav" id="mobileNav">
      <form class="site-search-form site-search-form--mobile" role="search" autocomplete="off">
        <div class="site-search" aria-label="Mobil ürün arama">
          <span class="site-search-icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24"><path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm8 2-3.6-3.6" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>
          </span>
          <input class="site-search-input" type="search" name="q" placeholder="Ürün, marka veya içerik ara" aria-label="Mobil ürün arama" value="${escapeHtml(new URLSearchParams(window.location.search).get('q') || '')}"/>
          <button class="site-search-clear" type="button" aria-label="Aramayı temizle">Sil</button>
        </div>
        <div class="site-search-results" hidden></div>
      </form>
      <a href="/index.html#collections">Kategoriler</a>
      <a href="/index.html#brands">Markalar</a>
      <a href="/collections/routine.html">Rutinler</a>
      <a href="/contact.html">Destek Merkezi</a>
    </div>`;

  const SHARED_FOOTER_HTML = `
    <footer class="footer" data-cosmoskin-footer="shared">
      <div class="container footer-grid">
        <div>
          <a class="brand footer-brandlock" href="/index.html"><img class="brand-logo" src="/assets/logo-mark-light.png" alt="Cosmoskin logo"><span class="brand-word">COSMOSKIN</span></a>
          <p class="footer-copy">Cosmoskin, orijinal Kore cilt bakım ürünlerini seçilmiş markalar, şeffaf fiyatlama ve güvenli alışveriş deneyimiyle sunar.</p>
        </div>
        <div class="footer-col"><h5>Ürünler</h5><a href="/collections/cleanse.html">Temizle</a><a href="/collections/hydrate.html">Nemlendir</a><a href="/collections/treat.html">Hedef Bakım</a><a href="/collections/protect.html">Koru</a></div>
        <div class="footer-col"><h5>Kurumsal</h5><a href="/index.html#brands">Markalar</a><a href="/collections/routine.html">Rutinler</a><a href="/contact.html">Destek</a><a href="mailto:partnership@cosmoskin.com.tr">İş Ortaklığı</a></div>
        <div class="footer-col"><h5>Yasal</h5><a href="/teslimat-kargo.html">Teslimat &amp; Kargo</a><a href="/iade-degisim.html">İade &amp; Değişim</a><a href="/mesafeli-satis.html">Mesafeli Satış</a><a href="/on-bilgilendirme.html">Ön Bilgilendirme</a><button class="open-legal" type="button">KVKK Aydınlatma Metni</button><button id="openCookiePrefs" type="button">Çerez Tercihleri</button><a href="mailto:destek@cosmoskin.com.tr">Veri Talepleri</a></div>
        <div class="footer-col"><h5>İletişim</h5><a href="mailto:destek@cosmoskin.com.tr">destek@cosmoskin.com.tr</a><a href="/contact.html">Destek Merkezi</a><a href="https://instagram.com/cosmoskin.tr" target="_blank" rel="noopener">Instagram</a><span>İstanbul, Türkiye</span></div>
      </div>
      <div class="container footer-trustbar">
        <div class="footer-payment-block">
          <span class="footer-meta-label">Ödeme Yöntemleri</span>
          <div class="payment-logos" aria-label="Desteklenen ödeme yöntemleri">
            <span class="payment-logo payment-logo--visa" aria-label="Visa">
              <svg viewBox="0 0 96 34" role="img" aria-hidden="true"><path d="M18.6 25.8 22.7 8h6.5l-4.1 17.8h-6.5Zm30.9-17.4a15.5 15.5 0 0 0-5.8-1c-6.4 0-10.9 3.2-10.9 7.8 0 3.4 3.2 5.3 5.7 6.4 2.6 1.2 3.4 1.9 3.4 3 0 1.7-2.1 2.4-4 2.4-2.7 0-4.2-.4-6.4-1.3l-.9-.4-.9 5.6a21.8 21.8 0 0 0 7.6 1.3c6.8 0 11.2-3.2 11.3-8.2 0-2.7-1.7-4.9-5.4-6.5-2.3-1.1-3.7-1.8-3.7-3 0-1 .9-2.1 3.1-2.1a11 11 0 0 1 4.8.9l.6.3.9-5.2Zm8.6 11 2.6-6.9 1.5 6.9h-4.1Zm8 6.4h6l-5.3-17.8h-5.5a3 3 0 0 0-2.8 1.8l-7.1 16h6.8l1-2.8h8.3l.6 2.8ZM13.2 8 6.8 20.1 6.1 16.6A14.1 14.1 0 0 0 .3 9.2l5.9 22.3h6.9L23.3 8h-6.8Z" fill="#1A1F71"></path><path d="M6.5 8.1h10.8c-.5-.1-1-.1-1.6-.1-3.6 0-7 2-8.6 5.2L6.5 8.1Z" fill="#F7B600"></path></svg>
            </span>
            <span class="payment-logo" aria-label="Mastercard">
              <svg viewBox="0 0 84 56" role="img" aria-hidden="true"><circle cx="31" cy="28" r="16.5" fill="#EB001B"></circle><circle cx="53" cy="28" r="16.5" fill="#F79E1B"></circle><path d="M42 13.5a16.5 16.5 0 0 0 0 29 16.5 16.5 0 0 0 0-29Z" fill="#FF5F00"></path></svg>
            </span>
            <span class="payment-logo payment-logo--amex" aria-label="American Express">
              <svg viewBox="0 0 94 56" role="img" aria-hidden="true"><rect x="6" y="8" width="82" height="40" rx="8" fill="#006FCF"></rect><path d="M22 19h10.8l1.7 3.8L36.1 19H72v18H36.1l-1.7-3.7-1.6 3.7H22V19Zm3.5 2.9v11.2h4.6v-2.3h3.4l1 2.3h5l-5.1-11.2h-4.9l-4.9 11.2h3.9l1-2.3h2.2v2.3h4.2V21.9h-10.4Zm6.7 5.7 1.2-2.8 1.2 2.8h-2.4Zm8.6-5.7v11.2h9.8v-2.8h-5.7v-1.4h5.6v-2.7h-5.6v-1.4h5.7v-2.9h-9.8Zm11.4 0v11.2h4.1v-6.5l2.9 6.5h2.8l2.9-6.5v6.5H69V21.9h-5.4l-2.7 5.9-2.6-5.9h-5.1Zm18.6 0v11.2H80v-2.8h-5.7v-1.4h5.5v-2.7h-5.5v-1.4H80v-2.9h-9.2Z" fill="#fff"></path></svg>
            </span>
          </div>
          <p class="footer-meta-copy">Visa, Mastercard ve American Express ile güvenli ödeme deneyimi.</p>
        </div>
        <div class="footer-security-block">
          <span class="footer-meta-label">Güvenlik &amp; Sipariş Detayları</span>
          <div class="footer-badges">
            <span>256-bit SSL koruması</span>
            <span>Güvenli sanal POS</span>
            <span>KDV dahil fiyatlandırma</span>
            <span>Sipariş e-posta bilgilendirmesi</span>
            <span>Teslimat &amp; iade sayfaları</span>
            <span>Mesafeli satış &amp; ön bilgilendirme</span>
          </div>
          <p class="footer-meta-copy">Ödeme adımında bilgileriniz şifreli bağlantı üzerinden işlenir; sipariş, teslimat ve iade akışı yasal metinlerle birlikte açık şekilde sunulur.</p>
        </div>
      </div>
      <div class="footer-bottom"><span>&copy; 2026 Cosmoskin</span><span>Seçilmiş K-Beauty</span></div>
    </footer>`;

  const SHARED_BACKDROP_HTML = '<div class="backdrop" id="backdrop"></div>';
  const SHARED_CART_DRAWER_HTML = '<aside class="drawer" id="cartDrawer"><div class="drawer-head"><div class="drawer-title">Sepet</div><button class="icon-close close-any" type="button">×</button></div><div class="cart-items" id="cartItems"></div><div class="cart-summary"><div class="sum-row"><span>Ürün Toplamı (KDV dahil)</span><strong id="cartSubtotal">₺0</strong></div><div class="sum-row"><span>Dahil olan KDV</span><strong id="cartVat">₺0</strong></div><div class="sum-row"><span>Kargo</span><strong id="cartShipping">₺0</strong></div><div class="sum-row total"><span>Ödenecek Toplam</span><strong id="cartTotal">₺0</strong></div><div class="shipping-progress" id="shippingProgress"><div class="shipping-progress-bar"><span id="shippingProgressFill"></span></div><div class="shipping-progress-text" id="shippingProgressText">Kargo avantajı hesaplanıyor...</div></div><a class="btn btn-primary" href="/checkout.html">Ödemeye Geç</a><div class="account-mini">2.500 TL ve üzeri siparişlerde kargo ücretsizdir. Tüm fiyatlara KDV dahildir.</div></div></aside>';
  const SHARED_ACCOUNT_DRAWER_HTML = '<aside class="drawer" id="accountDrawer"><div class="drawer-head"><div class="drawer-title">Hesap</div><button class="icon-close close-any" type="button">×</button></div><div class="account-state" id="accountState"></div><div class="account-actions" id="accountActions"><button class="btn btn-primary" data-open-auth="" data-auth-tab="loginPanel" type="button">Giriş Yap</button><button class="btn btn-secondary" data-open-auth="" data-auth-tab="registerPanel" type="button">Kayıt Ol</button></div><div class="account-mini">Sipariş geçmişinizi, kayıtlı adreslerinizi ve üyelik tercihlerinizi tek ekranda yönetin.</div></aside>';
  const SHARED_ACCOUNT_MODAL_HTML = '<div class="modal" id="accountModal"><div class="modal-card"><div class="modal-head"><div><h2>Cosmoskin hesabı</h2><div class="account-mini">Daha hızlı ödeme ve sipariş takibi için hesabınızı oluşturun.</div></div><button class="icon-close close-any" type="button">×</button></div><div class="tab-row"><button class="tab-btn active" data-tab="loginPanel" type="button">Giriş Yap</button><button class="tab-btn" data-tab="registerPanel" type="button">Hesap Oluştur</button></div><div class="tab-panel active" id="loginPanel"><form class="form-grid compact" id="loginForm"><div class="field full"><label>E-posta</label><input id="loginEmail" type="email" placeholder="ornek@eposta.com" required/></div><div class="field full"><label>Şifre</label><div class="password-wrap"><input id="loginPassword" type="password" placeholder="Şifreniz" required/><button class="password-toggle" type="button" data-toggle-password="loginPassword" aria-label="Şifreyi göster">Göster</button></div></div><div class="field full form-inline"><label class="checkline"><input type="checkbox"/> Beni hatırla</label><a href="/auth/reset.html" data-forgot-password="">Şifremi unuttum</a></div><div class="field full"><button class="btn btn-primary" type="submit">Giriş Yap</button><div class="form-status" id="loginStatus"></div></div></form></div><div class="tab-panel" id="registerPanel"><form class="form-grid compact" id="registerForm"><div class="field"><label>Ad</label><input id="registerFirstName" type="text" required/></div><div class="field"><label>Soyad</label><input id="registerLastName" type="text" required/></div><div class="field full"><label>E-posta</label><input id="registerEmail" type="email" placeholder="ornek@eposta.com" required/></div><div class="field full"><label>Şifre</label><div class="password-wrap"><input id="registerPassword" type="password" placeholder="En az 8 karakter" minlength="8" required/><button class="password-toggle" type="button" data-toggle-password="registerPassword" aria-label="Şifreyi göster">Göster</button></div><div class="password-meter" id="passwordMeter" aria-hidden="true"><div class="password-meter-bar"><span id="passwordMeterFill"></span></div><div class="password-meter-meta"><span id="passwordStrengthText">Şifre güvenliği</span></div></div><ul class="password-rules" id="passwordRules"><li data-rule="length">En az 8 karakter</li><li data-rule="upper">En az 1 büyük harf</li><li data-rule="lower">En az 1 küçük harf</li><li data-rule="number">En az 1 rakam</li></ul></div><div class="field full"><label class="checkline"><input type="checkbox" required/> Kampanya ve sipariş bilgilendirmelerini kabul ediyorum.</label></div><div class="field full"><button class="btn btn-primary" type="submit">Hesap Oluştur</button><div class="form-status" id="registerStatus"></div></div></form></div></div></div>';
  const SHARED_COOKIE_PREFS_HTML = '<div class="modal" id="cookiePreferences"><div class="modal-card"><div class="modal-head"><div><h2>Çerez tercihleri</h2><div class="account-mini">Zorunlu çerezler sepet, güvenlik ve oturum işlevleri için her zaman aktiftir.</div></div><button class="icon-close close-any" type="button">×</button></div><div class="account-state stack"><strong>Zorunlu çerezler</strong><div class="account-mini">Temel site işlevleri ve güvenlik için kullanılır.</div></div><div class="account-state stack"><div class="switch-row"><div><strong>Analitik çerezler</strong><div class="account-mini">Anonim kullanım verileri ile deneyimi iyileştirmemize yardımcı olur.</div></div><label class="checkline"><input id="prefAnalytics" type="checkbox"/> Etkinleştir</label></div></div><div class="modal-actions"><button class="btn btn-primary" id="cookieSavePrefs" type="button">Tercihleri Kaydet</button><button class="btn btn-secondary close-any" type="button">Kapat</button></div></div></div>';
  const SHARED_LEGAL_MODAL_HTML = '<div class="modal" id="legalModal"><div class="modal-card"><div class="modal-head"><div><h2>KVKK Aydınlatma Metni</h2><div class="account-mini">Kişisel verileriniz 6698 sayılı KVKK kapsamında işlenir.</div></div><button class="icon-close close-any" type="button">×</button></div><div class="legal-copy"><p><strong>Veri sorumlusu:</strong> Cosmoskin, üyelik, sipariş, iletişim ve destek süreçleri kapsamında veri sorumlusu olarak hareket eder.</p><p><strong>İşlenen veriler:</strong> İletişim bilgileri, sipariş içeriği, teslimat verileri, destek formu kayıtları ve teknik kullanım verileri.</p><p><strong>İşleme amaçları:</strong> Sipariş yönetimi, üyelik işlemleri, kargo süreçleri, müşteri desteği, mevzuat uyumu ve hizmet geliştirme.</p><p><strong>Başvuru:</strong> Tüm veri talepleriniz için <a href="mailto:destek@cosmoskin.com.tr">destek@cosmoskin.com.tr</a> adresine ulaşabilirsiniz.</p></div></div></div>';
  const SHARED_COOKIE_BANNER_HTML = '<div class="cookie" id="cookieBanner"><div class="cookie-card"><p>Bu site, temel alışveriş işlevleri için zorunlu çerezleri kullanır. Analitik çerezleri etkinleştirerek deneyimin gelişmesine katkı sağlayabilirsiniz.</p><div class="cookie-actions"><button class="btn btn-secondary" id="cookieCustomize" type="button">Tercihleri Yönet</button><button class="btn btn-secondary" id="cookieAcceptEssential" type="button">Sadece Zorunlu</button><button class="btn btn-primary" id="cookieAcceptAll" type="button">Kabul Et</button></div></div></div>';

  function upsertSharedBlock(selector, html, options = {}) {
    const existing = document.querySelector(selector);
    if (existing) {
      existing.outerHTML = html;
      return;
    }
    const parent = options.parent || document.body;
    const position = options.position || 'beforeend';
    parent?.insertAdjacentHTML(position, html);
  }

  function normalizeSharedHeader() {
    const header = document.querySelector('header.header');
    if (!header) return;
    header.outerHTML = SHARED_HEADER_HTML;
  }

  function normalizeSharedMobileNav() {
    if (!document.querySelector('header.header')) return;
    const existing = document.getElementById('mobileNav');
    if (existing) existing.outerHTML = SHARED_MOBILE_NAV_HTML;
    else {
      document.querySelector('header.header')?.insertAdjacentHTML('afterend', SHARED_MOBILE_NAV_HTML);
    }
  }

  function normalizeSharedFooter() {
    const footer = document.querySelector('footer.footer');
    if (!footer) return;
    footer.outerHTML = SHARED_FOOTER_HTML;
  }

  function normalizeSharedShell() {
    normalizeSharedHeader();
    normalizeSharedMobileNav();
    normalizeSharedFooter();
    upsertSharedBlock('#backdrop', SHARED_BACKDROP_HTML);
    upsertSharedBlock('#cartDrawer', SHARED_CART_DRAWER_HTML);
    upsertSharedBlock('#accountDrawer', SHARED_ACCOUNT_DRAWER_HTML);
    upsertSharedBlock('#accountModal', SHARED_ACCOUNT_MODAL_HTML);
    upsertSharedBlock('#cookiePreferences', SHARED_COOKIE_PREFS_HTML);
    upsertSharedBlock('#legalModal', SHARED_LEGAL_MODAL_HTML);
    upsertSharedBlock('#cookieBanner', SHARED_COOKIE_BANNER_HTML);
  }

  normalizeSharedShell();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeSharedShell, { once: true });
  }

  function readFavoriteStorage() {
    try {
      const currentRaw = localStorage.getItem(FAVORITES_KEY);
      const legacyRaw = localStorage.getItem(LEGACY_FAVORITES_KEY);
      let current = [];
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw);
        if (Array.isArray(parsed)) current = parsed;
        else if (parsed && typeof parsed === 'object') current = Object.values(parsed);
      }
      if ((!current || !current.length) && legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) current = legacyParsed;
        else if (legacyParsed && typeof legacyParsed === 'object') current = Object.values(legacyParsed);
      }
      return Array.isArray(current) ? current : [];
    } catch (error) {
      return [];
    }
  }

  state.favorites = readFavoriteStorage();

  function showFavoriteToast(message) {
    if (!message) return;
    let toast = document.querySelector('.favorite-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'favorite-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showFavoriteToast._timer);
    showFavoriteToast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }


  const backdrop = $('#backdrop');
  const cartDrawer = $('#cartDrawer');
  const accountDrawer = $('#accountDrawer');
  const cookieBanner = $('#cookieBanner');
  const prefModal = $('#cookiePreferences');
  const legalModal = $('#legalModal');
  const progress = $('#progress');
  const mobileNav = $('#mobileNav');
  let megaTimer;

  function closeAllMegaMenus(exceptWrap = null) {
    ['.categories-wrap', '.brands-wrap'].forEach((selector) => {
      const wrap = $(selector);
      if (!wrap || wrap === exceptWrap) return;
      wrap.classList.remove('open');
    });
    [
      ['.categories-wrap', '.categories-trigger'],
      ['.brands-wrap', '.brands-trigger']
    ].forEach(([wrapSelector, triggerSelector]) => {
      const wrap = $(wrapSelector);
      const trigger = wrap?.querySelector(triggerSelector);
      if (!trigger) return;
      trigger.setAttribute('aria-expanded', wrap?.classList.contains('open') ? 'true' : 'false');
    });
  }

  function fmt(n) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') {
      return window.COSMOSKIN_FORMAT_PRICE(n);
    }
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0
    }).format(n);
  }

  function totals() {
    const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const vat = Math.round(subtotal * VAT / (1 + VAT));
    const shipping = subtotal >= FREE_SHIPPING || subtotal === 0 ? 0 : SHIPPING_FEE;
    return { subtotal, vat, shipping, total: subtotal + shipping };
  }

  function getProductHelpers() {
    return window.COSMOSKIN_PRODUCT_HELPERS || {};
  }

  function normalizeProductReference(reference) {
    const input = reference && typeof reference === 'object' ? reference : { id: reference };
    const helpers = getProductHelpers();
    const lookup = typeof helpers.getProductByHandle === 'function'
      ? helpers.getProductByHandle(input.slug || input.id || input.favoriteId || input.url || '')
      : null;
    const extractedSlug = typeof helpers.extractSlug === 'function'
      ? (helpers.extractSlug(input.url || '') || helpers.extractSlug(input.slug || input.id || input.favoriteId || ''))
      : '';
    const price = lookup ? Number(lookup.price || 0) : Number(input.price || 0);

    return {
      id: lookup?.id || extractedSlug || String(input.id || '').trim(),
      slug: lookup?.slug || extractedSlug || String(input.slug || input.id || '').trim(),
      name: lookup?.name || input.name || 'Ürün',
      brand: lookup?.brand || input.brand || 'Cosmoskin',
      price: Number.isFinite(price) ? price : 0,
      image: lookup?.image || input.image || '',
      url: lookup?.url || input.url || (extractedSlug ? `/products/${extractedSlug}.html` : ''),
      volume: lookup?.volume || input.volume || ''
    };
  }

  function canonicalizeCartItems(items = []) {
    return (Array.isArray(items) ? items : []).map((item) => {
      const product = normalizeProductReference(item);
      const qty = Math.max(1, Number(item?.qty || 1));
      return product.id ? { ...product, qty } : null;
    }).filter(Boolean);
  }

  function setCartButtonData(button, product) {
    if (!button || !product?.id) return;
    button.dataset.id = product.id;
    button.dataset.slug = product.slug;
    button.dataset.name = product.name;
    button.dataset.brand = product.brand;
    button.dataset.price = String(product.price);
    button.dataset.image = product.image;
    if (product.url) button.dataset.url = product.url;
  }

  function setFavoriteButtonData(button, product) {
    if (!button || !product?.id) return;
    button.dataset.favoriteId = product.id;
    button.dataset.name = product.name;
    button.dataset.brand = product.brand;
    button.dataset.price = String(product.price);
    button.dataset.image = product.image;
    button.dataset.url = product.url;
  }

  function renderProductCard(productInput, options = {}) {
    const raw = productInput && typeof productInput === 'object' ? productInput : { id: productInput };
    const product = normalizeProductReference(raw);
    if (!product?.id) return '';

    const pills = Array.isArray(options.pills)
      ? options.pills.filter(Boolean)
      : Array.isArray(raw.tags)
        ? raw.tags.filter(Boolean)
        : [];
    const filterTokens = Array.from(new Set([
      ...(Array.isArray(options.filterTokens) ? options.filterTokens : []),
      raw.categorySlug,
      raw.brandSlug,
      ...(Array.isArray(raw.concernSlugs) ? raw.concernSlugs : [])
    ].filter(Boolean)));
    const description = typeof options.description === 'string'
      ? options.description
      : String(raw.description || '').trim();
    const metaNote = typeof options.metaNote === 'string'
      ? options.metaNote
      : String(raw.metaNote || raw.volume || '').trim();
    const showFavorite = options.showFavorite !== false;
    const extraActions = options.extraActionsHtml ? `<div class="product-card-extra">${options.extraActionsHtml}</div>` : '';
    const topBadge = options.topBadgeHtml || '';
    const ctaLabel = options.ctaLabel || 'Sepete Ekle';
    const ctaAttributes = options.ctaAttributesHtml || '';
    const cardClasses = ['product-card', options.cardClass].filter(Boolean).join(' ');

    return `
      <article class="${cardClasses}" data-product-id="${escapeHtml(product.id)}" data-filter-item="${escapeHtml(filterTokens.join(' '))}">
        <div class="product-media-wrap">
          <a class="product-media" href="${escapeHtml(product.url)}">
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" width="400" height="400"/>
            <span class="badge">${escapeHtml(product.brand)}</span>
          </a>
          ${showFavorite ? `<button class="favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-brand="${escapeHtml(product.brand)}" data-price="${escapeHtml(String(product.price))}" data-image="${escapeHtml(product.image)}" data-url="${escapeHtml(product.url)}">${favoriteHeartIcon(false)}</button>` : ''}
          ${topBadge}
        </div>
        <div class="product-body">
          <div class="brandline">${escapeHtml(product.brand)}</div>
          <a href="${escapeHtml(product.url)}"><h3>${escapeHtml(product.name)}</h3></a>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          ${pills.length ? `<div class="pills">${pills.slice(0, 4).map((pill) => `<span class="pill">${escapeHtml(pill)}</span>`).join('')}</div>` : ''}
          ${metaNote ? `<div class="meta-note">${escapeHtml(metaNote)}</div>` : ''}
          <div class="price-row">
            <div>
              <div class="price">${escapeHtml(fmt(product.price))}</div>
              <div class="price-note">${escapeHtml(options.priceNote || 'KDV dahil')}</div>
            </div>
            <button class="btn btn-primary" type="button" data-add-cart="" data-id="${escapeHtml(product.id)}" data-slug="${escapeHtml(product.slug || product.id)}" data-name="${escapeHtml(product.name)}" data-brand="${escapeHtml(product.brand)}" data-price="${escapeHtml(String(product.price))}" data-image="${escapeHtml(product.image)}" data-url="${escapeHtml(product.url)}" ${ctaAttributes}>${escapeHtml(ctaLabel)}</button>
          </div>
          ${extraActions}
        </div>
      </article>`;
  }

  function syncProductCard(card) {
    if (!card) return;

    const media = card.querySelector('.product-media');
    const image = media?.querySelector('img') || card.querySelector('img');
    const cartBtn = card.querySelector('[data-add-cart]');
    const favoriteBtn = card.querySelector('.favorite-btn');
    const titleLink = card.querySelector('h3 a, .product-name a');
    const titleHeading = titleLink ? null : card.querySelector('h3, .product-name');
    const brandline = card.querySelector('.brandline');
    const badge = card.querySelector('.badge');
    const priceEls = card.querySelectorAll('.price');

    const product = normalizeProductReference({
      id: cartBtn?.dataset.id || favoriteBtn?.dataset.favoriteId || card.dataset.productId || '',
      slug: cartBtn?.dataset.slug || '',
      url: cartBtn?.dataset.url || favoriteBtn?.dataset.url || media?.getAttribute('href') || '',
      name: cartBtn?.dataset.name || favoriteBtn?.dataset.name || titleLink?.textContent || titleHeading?.textContent || '',
      brand: cartBtn?.dataset.brand || favoriteBtn?.dataset.brand || brandline?.textContent || badge?.textContent || '',
      price: cartBtn?.dataset.price || favoriteBtn?.dataset.price || 0,
      image: cartBtn?.dataset.image || favoriteBtn?.dataset.image || image?.getAttribute('src') || ''
    });

    if (!product.id) return;

    if (media && product.url) media.setAttribute('href', product.url);
    if (image) {
      if (product.image) image.setAttribute('src', product.image);
      image.setAttribute('alt', product.name);
    }
    if (titleLink) {
      titleLink.textContent = product.name;
      if (product.url) titleLink.setAttribute('href', product.url);
    } else if (titleHeading) {
      titleHeading.textContent = product.name;
    }
    if (brandline) brandline.textContent = product.brand;
    if (badge) badge.textContent = product.brand;
    priceEls.forEach((priceEl) => {
      priceEl.textContent = fmt(product.price);
    });
    setCartButtonData(cartBtn, product);
    setFavoriteButtonData(favoriteBtn, product);
  }

  function syncBundleButton(button) {
    if (!button) return;

    let items = [];
    try {
      items = JSON.parse(button.getAttribute('data-bundle-items') || '[]');
    } catch (_error) {
      items = [];
    }
    if (!Array.isArray(items) || !items.length) return;

    const normalizedItems = items.map((item) => {
      const product = normalizeProductReference(item);
      const qty = Math.max(1, Number(item?.qty || 1));
      return product.id ? { id: product.id, name: product.name, brand: product.brand, price: product.price, image: product.image, qty } : null;
    }).filter(Boolean);

    if (!normalizedItems.length) return;

    button.dataset.bundleItems = JSON.stringify(normalizedItems);

    const card = button.closest('.routine-bundle');
    if (!card) return;

    const rows = card.querySelectorAll('.routine-bundle__item');
    normalizedItems.forEach((item, index) => {
      const row = rows[index];
      if (!row) return;
      const nameEl = row.querySelector('strong');
      const priceEl = row.lastElementChild;
      if (nameEl) nameEl.textContent = item.name;
      if (priceEl) priceEl.textContent = fmt(item.price * item.qty);
    });

    const totalEl = card.querySelector('.routine-bundle__price-copy strong');
    if (totalEl) {
      const total = normalizedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
      totalEl.textContent = fmt(total);
    }
  }

  function syncPdpState(root = document) {
    if (!window.location.pathname.includes('/products/')) return;

    const product = normalizeProductReference({
      slug: window.location.pathname,
      url: window.location.pathname
    });
    if (!product.id) return;

    root.querySelectorAll('.pdp-actions [data-add-cart], #mobileStickyAddBtn[data-add-cart]').forEach((button) => {
      setCartButtonData(button, product);
    });
    root.querySelectorAll('.pdp-fav-btn').forEach((button) => {
      setFavoriteButtonData(button, product);
    });
    root.querySelectorAll('.pdp-price, .pdp-detail-card__price').forEach((priceEl) => {
      priceEl.textContent = fmt(product.price);
    });
    const stickyPrice = root.querySelector('.mobile-sticky-pdp__copy strong');
    if (stickyPrice) stickyPrice.textContent = fmt(product.price);
    const stickyBrand = root.querySelector('.mobile-sticky-pdp__copy span');
    if (stickyBrand) stickyBrand.textContent = product.brand;
    const brandEl = root.querySelector('.pdp-brand');
    if (brandEl) brandEl.textContent = product.brand;
    const volumeEl = root.querySelector('.pdp-volume-note');
    if (volumeEl && product.volume) volumeEl.textContent = product.volume;
  }

  function syncProductBindings(root = document) {
    root.querySelectorAll('.product-card').forEach(syncProductCard);
    root.querySelectorAll('[data-add-bundle]').forEach(syncBundleButton);
    if (root === document) syncPdpState(root);
  }

  function openDrawer(drawer) {
    if (!drawer) return;
    drawer.classList.add('open');
    backdrop?.classList.add('show');
  }

  function closeDrawers() {
    [cartDrawer, accountDrawer].forEach((drawer) => drawer?.classList.remove('open'));
    if (!$('.modal.show')) backdrop?.classList.remove('show');
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('show');
    backdrop?.classList.add('show');
  }

  function closeModals() {
    [prefModal, legalModal, $('#accountModal')].forEach((modal) => modal?.classList.remove('show'));
    if (!(cartDrawer?.classList.contains('open')) && !(accountDrawer?.classList.contains('open'))) {
      backdrop?.classList.remove('show');
    }
  }

  backdrop?.addEventListener('click', () => {
    closeDrawers();
    closeModals();
    closeAllMegaMenus();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  });

  $$('.close-any').forEach((btn) => btn.addEventListener('click', () => {
    closeDrawers();
    closeModals();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  }));

  $('#cartBtn')?.addEventListener('click', () => openDrawer(cartDrawer));
  $('#accountBtn')?.addEventListener('click', async () => {
    try {
      const supabaseClient = window.cosmoskinSupabase;
      if (supabaseClient) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          window.location.href = '/account/profile.html';
          return;
        }
      }
    } catch (error) {
      console.warn('account redirect check failed:', error);
    }
    openDrawer(accountDrawer);
  });

  document.addEventListener('cosmoskin:open-auth', (event) => {
    document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: event.detail || {} }));
  });

  $('#mobileToggle')?.addEventListener('click', () => {
    const isOpen = mobileNav?.classList.toggle('open');
    backdrop?.classList.toggle('show', !!isOpen);
    document.body.classList.toggle('modal-open', !!isOpen);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawers();
      closeModals();
      closeAllMegaMenus();
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  });

  function bindMegaMenu(wrapSelector, triggerSelector) {
    const wrap = $(wrapSelector);
    if (!wrap) return;
    const trigger = wrap.querySelector(triggerSelector);
    const panel = wrap.querySelector('.mega');
    let closeTimer;

    const isDesktopMenu = () => window.matchMedia('(hover: hover) and (min-width: 769px)').matches;

    const openMenu = () => {
      clearTimeout(megaTimer);
      clearTimeout(closeTimer);
      closeAllMegaMenus(wrap);
      wrap.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };

    const closeMenu = () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        wrap.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }, 260);
    };

    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !wrap.classList.contains('open');
      closeAllMegaMenus(willOpen ? wrap : null);
      wrap.classList.toggle('open', willOpen);
      trigger?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    wrap.addEventListener('pointerenter', () => {
      if (isDesktopMenu()) openMenu();
    });
    wrap.addEventListener('pointerleave', () => {
      if (isDesktopMenu()) closeMenu();
    });
    panel?.addEventListener('pointerenter', () => {
      if (isDesktopMenu()) openMenu();
    });
  }

  bindMegaMenu('.categories-wrap', '.categories-trigger');
  bindMegaMenu('.brands-wrap', '.brands-trigger');


  document.addEventListener('click', (event) => {
    const legalTrigger = event.target.closest('.open-legal');
    if (legalTrigger) {
      event.preventDefault();
      openModal(legalModal);
      return;
    }
    const cookieTrigger = event.target.closest('#openCookiePrefs');
    if (cookieTrigger) {
      event.preventDefault();
      openModal(prefModal);
      return;
    }
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('/') || href.startsWith(window.location.origin)) {
      closeAllMegaMenus();
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
      if (!cartDrawer?.classList.contains('open') && !accountDrawer?.classList.contains('open') && !document.querySelector('.modal.show')) {
        backdrop?.classList.remove('show');
      }
    }
  });

  // Ürün verileri products-data.js'den; kategori/marka/içerik sabit listesiyle birleştirilir
  const SEARCH_INDEX_STATIC = [
    { label: 'Temizleyiciler', type: 'Kategori', url: '/collections/cleanse.html', keywords: 'cleanser jel kopuk yag bazli makyaj temizleyici arindirici', meta: 'Jel, köpük ve çift temizleme', badge: 'Kategori' },
    { label: 'Tonik & Essence', type: 'Kategori', url: '/collections/hydrate.html', keywords: 'tonik essence esans nem katmanlari hydrate', meta: 'Hafif nem ve hazırlık katmanları', badge: 'Kategori' },
    { label: 'Serum & Ampul', type: 'Kategori', url: '/collections/treat.html', keywords: 'serum ampul hedef bakim leke isilti', meta: 'Leke, ton ve ışıltı odaklı serumlar', badge: 'Kategori' },
    { label: 'Nemlendiriciler', type: 'Kategori', url: '/collections/care.html', keywords: 'nemlendirici krem bariyer goz cevresi care', meta: 'Krem ve destek bakım ürünleri', badge: 'Kategori' },
    { label: 'Güneş Koruyucular', type: 'Kategori', url: '/collections/protect.html', keywords: 'gunes bakimi gunes kremi spf sun sunscreen protect', meta: 'Şehir kullanımına uygun SPF seçkileri', badge: 'Kategori' },
    { label: 'Maskeler', type: 'Kategori', url: '/collections/masks.html', keywords: 'yuz maskesi sheet mask maske care', meta: 'Maskeler ve destek bakım editleri', badge: 'Kategori' },
    { label: 'Kuru Cilt', type: 'Cilt Tipi', url: '/collections/hydrate.html', keywords: 'dry skin kuru cilt nemsizlik barrier', meta: 'Nem ve konfor odaklı seçkiler', badge: 'Cilt Tipi' },
    { label: 'Yağlı Cilt', type: 'Cilt Tipi', url: '/collections/protect.html', keywords: 'oily skin yagli cilt sebum parlama hafif spf', meta: 'Daha hafif ve dengeli seçimler', badge: 'Cilt Tipi' },
    { label: 'Hassas Cilt', type: 'Cilt Tipi', url: '/collections/care.html', keywords: 'sensitive skin hassas cilt centella bariyer', meta: 'Yatıştırıcı ve bariyer dostu bakım', badge: 'Cilt Tipi' },
    { label: 'Karma Cilt', type: 'Cilt Tipi', url: '/collections/routine.html', keywords: 'combination skin karma cilt denge rutin', meta: 'Günlük denge için sabah-akşam akışları', badge: 'Cilt Tipi' },
    { label: 'Nemsizlik', type: 'Cilt Problemi', url: '/collections/hydrate.html', keywords: 'dehydration nemsizlik hyaluronic acid essence dolgunluk', meta: 'Dolgun görünüm ve su tutma desteği', badge: 'Cilt Problemi' },
    { label: 'Leke Görünümü', type: 'Cilt Problemi', url: '/collections/treat.html', keywords: 'tone leke gorunumu vitamin c niacinamide serum brightening', meta: 'Daha eşit ton görünümü için serumlar', badge: 'Cilt Problemi' },
    { label: 'Akne Eğilimi', type: 'Cilt Problemi', url: '/collections/blemish.html', keywords: 'blemish acne akne egilimi salicylic acid pore sivilce gozenek', meta: 'Gözenek ve akne eğilimine uygun bakım', badge: 'Cilt Problemi' },
    { label: 'Niacinamide', type: 'İçerik', url: '/collections/treat.html', keywords: 'niacinamide tone glow leke ingredient niasinamid', meta: 'Ton eşitliği ve görünüm dengesi', badge: 'İçerik' },
    { label: 'Hyaluronik Asit', type: 'İçerik', url: '/collections/hydrate.html', keywords: 'hyaluronic acid hyaluronik nem ingredient dolgunluk', meta: 'Nem ve dolgun görünüm desteği', badge: 'İçerik' },
    { label: 'Centella Asiatica', type: 'İçerik', url: '/collections/care.html', keywords: 'centella asiatica cica hassasiyet ingredient yatistirici', meta: 'Yatıştırıcı ve bariyer dostu bakım', badge: 'İçerik' },
    { label: 'Salicylic Acid', type: 'İçerik', url: '/collections/blemish.html', keywords: 'salicylic acid bha akne gozenek ingredient bha asit', meta: 'Akne eğilimi ve gözenek desteği', badge: 'İçerik' },
    { label: 'Ceramide', type: 'İçerik', url: '/collections/care.html', keywords: 'ceramide seramid bariyer kuru hassas ingredient', meta: 'Bariyer güçlendirici ve nem koruyucu', badge: 'İçerik' },
    { label: 'Vitamin C', type: 'İçerik', url: '/collections/treat.html', keywords: 'vitamin c c vitamini leke brightening isilti ingredient', meta: 'Işıltı ve leke görünümü için', badge: 'İçerik' },
    { label: 'Anua', type: 'Marka', url: '/collections/anua.html', keywords: 'marka anua heartleaf', meta: 'Heartleaf ile hassas ve yatıştırıcı bakım', badge: 'Marka' },
    { label: 'COSRX', type: 'Marka', url: '/collections/cosrx.html', keywords: 'marka cosrx snail essence', meta: 'Essence ve hedef bakım ikonları', badge: 'Marka' },
    { label: 'Beauty of Joseon', type: 'Marka', url: '/collections/beauty-of-joseon.html', keywords: 'marka beauty of joseon boj', meta: 'Glow ve hafif SPF seçkileri', badge: 'Marka' },
    { label: 'Round Lab', type: 'Marka', url: '/collections/round-lab.html', keywords: 'marka round lab dokdo', meta: 'Nazik temizleme ve günlük denge', badge: 'Marka' },
    { label: 'Torriden', type: 'Marka', url: '/collections/torriden.html', keywords: 'marka torriden dive', meta: 'Nem odaklı serum ve SPF', badge: 'Marka' },
    { label: 'SKIN1004', type: 'Marka', url: '/collections/skin1004.html', keywords: 'marka skin1004 centella madagascar', meta: 'Centella odaklı yatıştırıcı bakım', badge: 'Marka' },
    { label: 'By Wishtrend', type: 'Marka', url: '/collections/by-wishtrend.html', keywords: 'marka by wishtrend wishtrend vitamin', meta: 'Vitamin C ve aktif içerik odaklı seçki', badge: 'Marka' },
    { label: 'Dr. Jart+', type: 'Marka', url: '/collections/dr-jart.html', keywords: 'marka dr jart ceramidin ceramide', meta: 'Seramid ve bariyer odaklı bakım', badge: 'Marka' },
    { label: 'Goodal', type: 'Marka', url: '/collections/goodal.html', keywords: 'marka goodal green tangerine vitamin c mandalin', meta: 'Yeşil mandalin Vitamin C odağı', badge: 'Marka' },
    { label: "I'm From", type: 'Marka', url: '/collections/im-from.html', keywords: 'marka im from rice toner pirinc', meta: 'Pirinç ve doğal içerikli K-beauty', badge: 'Marka' },
    { label: 'Innisfree', type: 'Marka', url: '/collections/innisfree.html', keywords: 'marka innisfree jeju volcanic', meta: 'Jeju kaynaklı doğal cilt bakımı', badge: 'Marka' },
    { label: 'Isntree', type: 'Marka', url: '/collections/isntree.html', keywords: 'marka isntree hyaluronic sun', meta: 'Hyaluronik asit odaklı bakım', badge: 'Marka' },
    { label: 'Laneige', type: 'Marka', url: '/collections/laneige.html', keywords: 'marka laneige water sleeping mask', meta: 'Su bazlı nem teknolojisi', badge: 'Marka' },
    { label: 'Medicube', type: 'Marka', url: '/collections/medicube.html', keywords: 'marka medicube zero pore pad', meta: 'Gözenek ve akne odaklı bakım', badge: 'Marka' },
    { label: 'Mediheal', type: 'Marka', url: '/collections/mediheal.html', keywords: 'marka mediheal sheet mask nmf aquaring', meta: 'Sheet mask ve nem yoğunlaşması', badge: 'Marka' },
    { label: 'Some By Mi', type: 'Marka', url: '/collections/some-by-mi.html', keywords: 'marka some by mi aha bha miracle', meta: 'AHA BHA Miracle serisi', badge: 'Marka' },
    { label: 'Rutinler', type: 'Sayfa', url: '/collections/routine.html', keywords: 'rutinler routine cilt bakim rutini sabah aksam', meta: 'Hazır sabah-akşam akışları', badge: 'Sayfa' },
    { label: 'Destek Merkezi', type: 'Sayfa', url: '/contact.html', keywords: 'destek merkez iletisim yardim partnership', meta: 'İletişim ve iş ortaklığı formları', badge: 'Sayfa' }
  ];

  // Tüm ürünleri products-data.js'den al, yoksa boş dizi kullan
  const _productEntries = (window.COSMOSKIN_SEARCH_PRODUCTS || []);
  const SEARCH_INDEX = _productEntries.concat(SEARCH_INDEX_STATIC);

  function normalizeSearchValue(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSearchMatches(query) {
    const normalized = normalizeSearchValue(query);
    if (!normalized) return [];
    return SEARCH_INDEX.map((item) => {
      const haystack = normalizeSearchValue(`${item.label} ${item.type} ${item.keywords || ''}`);
      let score = 0;
      if (normalizeSearchValue(item.label) === normalized) score += 120;
      if (normalizeSearchValue(item.label).startsWith(normalized)) score += 80;
      if (haystack.includes(normalized)) score += 42;
      normalized.split(' ').forEach((token) => {
        if (!token) return;
        if (haystack.includes(token)) score += 14;
      });
      return { ...item, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }

  function renderSearchResults(container, results) {
    if (!container) return;
    if (!results.length) {
      container.innerHTML = '<div class="site-search-empty"><strong>Sonuç bulunamadı.</strong><span>Farklı bir ürün, kategori, içerik veya marka deneyin.</span><a class="site-search-empty__link" href="/collections/routine.html">Rutinleri incele</a></div>';
      container.hidden = false;
      return;
    }
    container.innerHTML = results.map((item) => `
      <a class="site-search-result" href="${item.url}">
        <span class="site-search-result__badge">${item.badge || item.type}</span>
        <div class="site-search-result__body">
          <span class="site-search-result__type">${item.type}</span>
          <strong>${item.label}</strong>
          <span class="site-search-result__meta">${item.meta || ''}</span>
        </div>
        <span class="site-search-result__arrow" aria-hidden="true">→</span>
      </a>`).join('') + '<a class="site-search-results__all" href="/collections/routine.html">Tüm rutinleri görüntüle</a>';
    container.hidden = false;
  }

  function bindSiteSearch() {
    $$('.site-search-form').forEach((form) => {
      if (form.dataset.cosmoskinSearchBound === 'true') return;
      const input = form.querySelector('.site-search-input');
      const clearBtn = form.querySelector('.site-search-clear');
      const resultsBox = form.querySelector('.site-search-results');
      if (!input || !clearBtn || !resultsBox) return;
      form.dataset.cosmoskinSearchBound = 'true';

      const sync = () => {
        const hasValue = !!input.value.trim();
        clearBtn.classList.toggle('is-visible', hasValue);
        if (!hasValue) {
          resultsBox.hidden = true;
          resultsBox.innerHTML = '';
          return;
        }
        renderSearchResults(resultsBox, findSearchMatches(input.value));
      };

      input.addEventListener('input', sync);
      input.addEventListener('focus', sync);
      clearBtn.addEventListener('click', () => {
        input.value = '';
        sync();
        input.focus();
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = input.value.trim();
        if (!query) return;
        window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
      });
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.site-search-form')) return;
      $$('.site-search-results').forEach((box) => {
        box.hidden = true;
      });
    });
  }

  function syncSiteSearchClearButtons() {
    $$('.site-search-form').forEach((form) => {
      if (form.dataset.cosmoskinSearchClearBound === 'true') return;
      const input = form.querySelector('.site-search-input');
      const clearBtn = form.querySelector('.site-search-clear');
      if (!input || !clearBtn) return;
      form.dataset.cosmoskinSearchClearBound = 'true';
      const sync = () => {
        clearBtn.classList.toggle('is-visible', !!input.value.trim());
      };
      input.addEventListener('input', sync);
      clearBtn.addEventListener('click', () => {
        input.value = '';
        sync();
        const res = form.querySelector('.site-search-results');
        if (res) {
          res.hidden = true;
          res.innerHTML = '';
        }
        input.focus();
      });
      sync();
    });
  }

  function initSiteSearchBindings() {
    if (window.__COSMOSKIN_SEARCH_BOUND) {
      syncSiteSearchClearButtons();
      return;
    }
    bindSiteSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteSearchBindings, { once: true });
  } else {
    initSiteSearchBindings();
  }

  function persistCart() {
    localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    renderCart();
    renderCheckout();
  }

  function normalizeFavoriteItem(item) {
    const product = normalizeProductReference(item);
    if (!product?.id) return null;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      price: Number(product.price || 0),
      image: product.image || '',
      url: product.url || ''
    };
  }

  function uniqueFavorites(items = []) {
    const map = new Map();
    items.forEach((item) => {
      const normalized = normalizeFavoriteItem(item);
      if (normalized && !map.has(normalized.id)) {
        map.set(normalized.id, normalized);
      }
    });
    return Array.from(map.values());
  }

  
  function favoriteHeartIcon(active = false) {
    return `<span class="favorite-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  }
function broadcastFavoritesChange() {
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: state.favorites } }));
  }

  async function saveFavoritesToAccount() {
    const client = window.cosmoskinSupabase;
    if (!client || !favoriteAccountSyncReady) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const metadata = user.user_metadata || {};
      const { error } = await client.auth.updateUser({
        data: {
          ...metadata,
          favorites: state.favorites
        }
      });
      if (error) throw error;
    } catch (error) {
      console.warn('Favorites account sync warning:', error);
    }
  }

  function persistFavorites(options = {}) {
    state.favorites = uniqueFavorites(state.favorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
    localStorage.removeItem(LEGACY_FAVORITES_KEY);
    renderFavoriteButtons();
    broadcastFavoritesChange();
    if (!options.skipRemote) {
      saveFavoritesToAccount();
    }
  }

  // External-sync listener: when anything else writes to the favorites store
  // (account/profile.html removing a favorite, or another tab), pull the
  // canonical list back from localStorage, refresh in-memory state, and
  // repaint heart icons. localStorage is the single source of truth; this
  // listener keeps every page in sync without a reload.
  let _externalSyncRunning = false;
  function syncFavoritesFromStorage(reason) {
    if (_externalSyncRunning) return;
    const fresh = uniqueFavorites(readFavoriteStorage());
    const sameLength = fresh.length === state.favorites.length;
    const sameIds = sameLength &&
      fresh.every((item, idx) => item.id === state.favorites[idx]?.id);
    if (sameIds) return; // already in sync, no need to repaint
    _externalSyncRunning = true;
    try {
      state.favorites = fresh;
      renderFavoriteButtons();
    } finally {
      _externalSyncRunning = false;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === FAVORITES_KEY) syncFavoritesFromStorage('storage-event');
  });
  window.addEventListener('cosmoskin:favorites-updated', () => {
    // Defer one tick so persistFavorites' own dispatch settles first; the
    // _externalSyncRunning guard above prevents recursion.
    setTimeout(() => syncFavoritesFromStorage('custom-event'), 0);
  });

  // External-sync listener for cart: account/profile.html's "add to cart from
  // favorites" flow writes localStorage directly, so we re-read here and
  // re-render the cart drawer. Same pattern as the favorites sync above.
  let _cartSyncRunning = false;
  function syncCartFromStorage() {
    if (_cartSyncRunning) return;
    let fresh = [];
    try {
      fresh = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
      if (!Array.isArray(fresh)) fresh = [];
    } catch { fresh = []; }
    fresh = canonicalizeCartItems(fresh);
    const a = JSON.stringify(state.cart);
    const b = JSON.stringify(fresh);
    if (a === b) return;
    _cartSyncRunning = true;
    try {
      state.cart = fresh;
      renderCart();
    } finally {
      _cartSyncRunning = false;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === 'cosmoskin_cart') syncCartFromStorage();
  });
  window.addEventListener('cosmoskin:cart-updated', () => {
    setTimeout(syncCartFromStorage, 0);
  });

  async function hydrateFavoritesFromAccount() {
    const client = window.cosmoskinSupabase;
    if (!client) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      favoriteAccountSyncReady = Boolean(user);
      if (!user) return;
      const remoteFavorites = Array.isArray(user.user_metadata?.favorites) ? user.user_metadata.favorites : [];
      const localFavorites = uniqueFavorites(state.favorites);
      const resolvedFavorites = localFavorites.length ? localFavorites : uniqueFavorites(remoteFavorites);
      const remoteIds = JSON.stringify(uniqueFavorites(remoteFavorites).map((item) => item.id).sort());
      const resolvedIds = JSON.stringify(resolvedFavorites.map((item) => item.id).sort());
      state.favorites = resolvedFavorites;
      persistFavorites({ skipRemote: true });
      if (remoteIds !== resolvedIds) {
        await saveFavoritesToAccount();
      }
    } catch (error) {
      console.warn('Favorites hydrate warning:', error);
    }
  }

  function watchFavoriteAuthState() {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        favoriteAccountSyncReady = Boolean(session?.user);
        await hydrateFavoritesFromAccount();
      }
      if (event === 'SIGNED_OUT') {
        favoriteAccountSyncReady = false;
      }
    });
  }

  function isFavorite(id) {
    return state.favorites.some((item) => item.id === id);
  }

  function toggleFavorite(item) {
    const normalized = normalizeFavoriteItem(item);
    if (!normalized?.id) return;
    if (isFavorite(normalized.id)) {
      state.favorites = state.favorites.filter((entry) => entry.id !== normalized.id);
      showFavoriteToast('Favorilerden çıkarıldı');
    } else {
      state.favorites.unshift(normalized);
      showFavoriteToast('Favorilere eklendi');
    }
    persistFavorites();
  }

  function getProductDataFromButton(btn) {
    if (!btn) return null;
    return normalizeProductReference({
      id: btn.dataset.id,
      slug: btn.dataset.slug,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: btn.dataset.price,
      image: btn.dataset.image,
      url: btn.dataset.url || btn.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
    });
  }

  function ensureFavoriteButtons(root = document) {
    root.querySelectorAll('.product-card').forEach((card) => {
      const media = card.querySelector('.product-media');
      const mediaWrap = card.querySelector('.product-media-wrap');
      const cartBtn = card.querySelector('[data-add-cart]');
      if (!media || !cartBtn || card.querySelector('.favorite-btn')) return;
      const product = getProductDataFromButton(cartBtn);
      if (!product?.id) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'favorite-btn';
      button.setAttribute('aria-label', 'Favorilere ekle');
      button.setAttribute('title', 'Favorilere ekle');
      setFavoriteButtonData(button, product);
      button.innerHTML = favoriteHeartIcon(false);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(getProductDataFromButton(cartBtn));
      });
      (mediaWrap || card).appendChild(button);
    });
  }

  function renderFavoriteButtons(root = document) {
    root.querySelectorAll('.favorite-btn').forEach((button) => {
      if (!button.dataset.favoriteBound) {
        button.dataset.favoriteBound = 'true';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const explicit = button.dataset.favoriteId ? {
            id: button.dataset.favoriteId,
            name: button.dataset.name,
            brand: button.dataset.brand,
            price: Number(button.dataset.price || 0),
            image: button.dataset.image,
            url: button.dataset.url || button.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
          } : null;
          const cardCartBtn = button.closest('.product-card')?.querySelector('[data-add-cart]');
          toggleFavorite(explicit?.id ? explicit : getProductDataFromButton(cardCartBtn));
        });
      }
      const active = isFavorite(button.dataset.favoriteId);
      button.classList.toggle('active', active);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
      button.setAttribute('title', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
      const icon = button.querySelector('.favorite-btn-icon');
      if (icon) icon.innerHTML = favoriteHeartIcon(active).replace('<span class="favorite-btn-icon" aria-hidden="true">','').replace('</span>','');
    });
  }

  function updateQty(id, delta) {
    state.cart = state.cart
      .map((item) => item.id === id ? { ...item, qty: item.qty + delta } : item)
      .filter((item) => item.qty > 0);
    persistCart();
  }

  function removeItem(id) {
    state.cart = state.cart.filter((item) => item.id !== id);
    persistCart();
  }

  function renderCart() {
    const target = $('#cartItems');
    const subtotalEl = $('#cartSubtotal');
    const vatEl = $('#cartVat');
    const shippingEl = $('#cartShipping');
    const totalEl = $('#cartTotal');
    const shippingProgressFill = $('#shippingProgressFill');
    const shippingProgressText = $('#shippingProgressText');
    const qty = state.cart.reduce((a, b) => a + b.qty, 0);

    $$('.cart-count').forEach((el) => {
      el.textContent = qty;
      el.style.display = qty ? 'grid' : 'none';
    });

    const t = totals();
    if (subtotalEl) subtotalEl.textContent = fmt(t.subtotal);
    if (vatEl) vatEl.textContent = fmt(t.vat);
    if (shippingEl) shippingEl.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (totalEl) totalEl.textContent = fmt(t.total);
    if (shippingProgressFill && shippingProgressText) {
      const ratio = Math.max(0, Math.min(100, Math.round((t.subtotal / FREE_SHIPPING) * 100)));
      shippingProgressFill.style.width = `${ratio}%`;
      if (t.subtotal === 0) {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING)} üzeri siparişlerde ücretsiz kargo avantajı uygulanır.`;
      } else if (t.subtotal >= FREE_SHIPPING) {
        shippingProgressText.textContent = 'Siparişiniz ücretsiz kargo avantajına ulaştı.';
      } else {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING - t.subtotal)} daha ekleyerek ücretsiz kargo avantajına ulaşabilirsiniz.`;
      }
    }

    if (!target) return;
    if (!state.cart.length) {
      target.innerHTML = '<div class="account-state"><strong>Sepetiniz şu an boş.</strong><div class="account-mini">Eklediğiniz ürünler burada listelenir.</div></div>';
      return;
    }

    target.innerHTML = state.cart.map((item) => `
      <article class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="account-mini">${item.brand}</div>
          <div class="qty">
            <button type="button" data-dec="${item.id}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-inc="${item.id}">+</button>
            <button type="button" data-remove="${item.id}">Sil</button>
          </div>
        </div>
        <strong>${fmt(item.price * item.qty)}</strong>
      </article>
    `).join('');

    $$('[data-inc]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.inc, 1)));
    $$('[data-dec]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.dec, -1)));
    $$('[data-remove]', target).forEach((btn) => btn.addEventListener('click', () => removeItem(btn.dataset.remove)));
  }

  function bindCartButtons(root = document) {
    root.querySelectorAll('[data-add-cart]').forEach((btn) => {
      if (btn.dataset.cartBound) return;
      btn.dataset.cartBound = 'true';
      btn.addEventListener('click', () => {
        addCartItems([{
          id: btn.dataset.id,
          slug: btn.dataset.slug || btn.dataset.id,
          name: btn.dataset.name,
          brand: btn.dataset.brand,
          price: Number(btn.dataset.price),
          image: btn.dataset.image,
          url: btn.dataset.url || btn.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname,
          qty: 1
        }]);
      });
    });
  }

  function refreshCatalogDrivenState() {
    const nextCart = canonicalizeCartItems(state.cart);
    if (JSON.stringify(nextCart) !== JSON.stringify(state.cart)) {
      state.cart = nextCart;
      localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    }

    const nextFavorites = uniqueFavorites(state.favorites);
    if (JSON.stringify(nextFavorites) !== JSON.stringify(state.favorites)) {
      state.favorites = nextFavorites;
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
      localStorage.removeItem(LEGACY_FAVORITES_KEY);
    }
  }

  function initFavoriteButtons(root = document) {
    syncProductBindings(root);
    ensureFavoriteButtons(root);
    renderFavoriteButtons(root);
  }

  function initCartButtons(root = document) {
    syncProductBindings(root);
    bindCartButtons(root);
  }

  function refreshCommerceUi(root = document) {
    refreshCatalogDrivenState();
    syncProductBindings(root);
    ensureFavoriteButtons(root);
    renderFavoriteButtons(root);
    bindCartButtons(root);
    renderCart();
    renderCheckout();
  }

  function addCartItems(items = [], options = {}) {
    const normalizedItems = canonicalizeCartItems(items);

    if (!normalizedItems.length) return 0;

    normalizedItems.forEach((item) => {
      const found = state.cart.find((entry) => entry.id === item.id);
      if (found) found.qty += item.qty;
      else state.cart.push(item);
    });

    persistCart();
    if (options.openDrawer !== false) openDrawer(cartDrawer);
    return normalizedItems.length;
  }

  document.addEventListener('cosmoskin:add-bundle', (event) => {
    const items = event.detail?.items || [];
    addCartItems(items, { openDrawer: true });
  });

  window.COSMOSKIN_CART_API = {
    addItems: addCartItems,
    getItems: () => state.cart.slice()
  };
  window.COSMOSKIN_RENDER_PRODUCT_CARD = renderProductCard;
  window.initCartButtons = initCartButtons;
  window.initFavoriteButtons = initFavoriteButtons;

  function renderCheckout() {
    const itemsWrap = $('#checkoutItems');
    const sub = $('#checkoutSubtotal');
    const vat = $('#checkoutVat');
    const shipping = $('#checkoutShipping');
    const total = $('#checkoutTotal');
    const summaryField = $('#orderSummaryField');
    if (!itemsWrap) return;

    const t = totals();
    if (sub) sub.textContent = fmt(t.subtotal);
    if (vat) vat.textContent = fmt(t.vat);
    if (shipping) shipping.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (total) total.textContent = fmt(t.total);

    if (!state.cart.length) {
      itemsWrap.innerHTML = '<div class="account-state"><strong>Sepetiniz boş.</strong><div class="account-mini">Ürün eklediğinizde sipariş özeti burada görünür.</div></div>';
      if (summaryField) summaryField.value = '';
      return;
    }

    itemsWrap.innerHTML = state.cart.map((item) => `
      <article class="checkout-item">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="account-mini">${item.brand} · ${item.qty} adet</div>
        </div>
        <strong>${fmt(item.price * item.qty)}</strong>
      </article>
    `).join('');

    if (summaryField) {
      summaryField.value = state.cart.map((item) => `${item.brand} ${item.name} x${item.qty} (${fmt(item.price * item.qty)})`).join(' | ') + ` | Toplam: ${fmt(t.total)}`;
    }
  }

  refreshCommerceUi();
  hydrateFavoritesFromAccount();
  watchFavoriteAuthState();

  document.addEventListener('cosmoskin:products-updated', () => {
    refreshCommerceUi();
  });

  window.addEventListener('load', () => {
    refreshCommerceUi();
    setTimeout(() => {
      refreshCommerceUi();
    }, 120);
  });

  function setConsent(mode) {
    const consent = {
      essential: true,
      analytics: mode === 'all' || (mode === 'custom' && $('#prefAnalytics')?.checked)
    };
    state.consent = consent;
    localStorage.setItem('cosmoskin_consent', JSON.stringify(consent));
    cookieBanner?.classList.remove('show');
    closeModals();
    if (consent.analytics && window.enableAnalytics) window.enableAnalytics();
  }

  $('#cookieAcceptAll')?.addEventListener('click', () => setConsent('all'));
  $('#cookieAcceptEssential')?.addEventListener('click', () => setConsent('essential'));
  $('#cookieSavePrefs')?.addEventListener('click', () => setConsent('custom'));
  $('#cookieCustomize')?.addEventListener('click', () => openModal(prefModal));

  if (!state.consent) cookieBanner?.classList.add('show');
  else if (state.consent.analytics && window.enableAnalytics) window.enableAnalytics();

  $$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    const wrap = btn.closest('.modal-card');
    $$('.tab-btn', wrap).forEach((b) => b.classList.remove('active'));
    $$('.tab-panel', wrap).forEach((panel) => panel.classList.remove('active'));
    btn.classList.add('active');
    wrap.querySelector(`#${btn.dataset.tab}`)?.classList.add('active');
  }));

  $$('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
    const wrap = chip.closest('[data-filter-wrap]');
    if (!wrap) return;
    $$('.filter-chip', wrap).forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const value = chip.dataset.filter;
    wrap.nextElementSibling?.querySelectorAll('[data-filter-item]').forEach((item) => {
      item.style.display = value === 'all' || item.dataset.filterItem.includes(value) ? '' : 'none';
    });
  }));

  function onScroll() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    $$('.reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight - 70) el.classList.add('visible');
    });
  }



  function initHeroParallax() {
    const hero = document.querySelector('[data-hero-parallax]');
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const state = { currentY: 0, targetY: 0, currentX: 0, targetX: 0, ticking: false };
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    function updateTargets() {
      const rect = hero.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      state.targetY = (progress - 0.35) * 42;
    }

    function apply() {
      state.currentY += (state.targetY - state.currentY) * 0.08;
      state.currentX += (state.targetX - state.currentX) * 0.08;

      hero.style.setProperty('--hero-cloud-back-y', `${state.currentY * 1.4}px`);
      hero.style.setProperty('--hero-cloud-front-y', `${state.currentY * 2.1}px`);
      hero.style.setProperty('--hero-showcase-y', `${state.currentY * -0.16}px`);
      hero.style.setProperty('--hero-card-y', `${state.currentY * -0.34}px`);
      hero.style.setProperty('--hero-card-x', `${state.currentX * 6}px`);
      hero.style.setProperty('--hero-card-rotate', `${state.currentX * 0.4}deg`);
      hero.style.setProperty('--hero-product-y', `${state.currentY * -0.22}px`);
      hero.style.setProperty('--hero-product-x', `${state.currentX * 8}px`);
      hero.style.setProperty('--hero-product-scale', `${1 + Math.abs(state.currentY) * 0.0008}`);
      hero.style.setProperty('--hero-orb-y', `${state.currentY * -0.9}px`);
      hero.style.setProperty('--hero-orb-x', `${state.currentX * 12}px`);
      hero.style.setProperty('--hero-note-left-y', `${state.currentY * -0.1}px`);
      hero.style.setProperty('--hero-note-left-x', `${state.currentX * 7}px`);
      hero.style.setProperty('--hero-note-center-y', `${state.currentY * -0.2}px`);
      hero.style.setProperty('--hero-note-right-y', `${state.currentY * -0.14}px`);
      hero.style.setProperty('--hero-note-right-x', `${state.currentX * -7}px`);

      if (Math.abs(state.targetY - state.currentY) > 0.08 || Math.abs(state.targetX - state.currentX) > 0.08) {
        requestAnimationFrame(apply);
      } else {
        state.ticking = false;
      }
    }

    function queue() {
      if (state.ticking) return;
      state.ticking = true;
      requestAnimationFrame(apply);
    }

    function onPointerMove(event) {
      if (window.innerWidth < 900) {
        state.targetX = 0;
        return;
      }
      const rect = hero.getBoundingClientRect();
      const localX = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
      state.targetX = localX;
      queue();
    }

    updateTargets();
    queue();
    window.addEventListener('scroll', () => { updateTargets(); queue(); }, { passive: true });
    window.addEventListener('resize', () => { updateTargets(); queue(); }, { passive: true });
    hero.addEventListener('pointermove', onPointerMove, { passive: true });
    hero.addEventListener('pointerleave', () => { state.targetX = 0; queue(); }, { passive: true });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  initHeroParallax();

  $$('form[data-form-endpoint]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const status = $('.form-status', form);
    const submitButton = form.querySelector('button[type="submit"]');
    const endpoint = form.dataset.formEndpoint;
    const recipient = form.dataset.formRecipient || 'destek';
    const fallbackEmail = recipient === 'partnership' ? 'partnership@cosmoskin.com.tr' : 'destek@cosmoskin.com.tr';

    if (!endpoint) return;

    const formData = new FormData(form);
    formData.set('recipient', recipient);

    if (status) {
      status.textContent = 'Gönderiliyor...';
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.dataset.originalText || submitButton.textContent;
      submitButton.textContent = 'Gönderiliyor...';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const payload = await response.json().catch(() => ({}));
      const ok = response.ok && payload.ok;

      if (status) {
        status.textContent = ok
          ? (payload.referenceCode
              ? `Mesajınız gönderildi. Referans kodunuz: ${payload.referenceCode}. Onay e-postası tarafınıza iletildi.`
              : (payload.message || 'Mesajınız başarıyla gönderildi.'))
          : (payload.message || `Şu anda form kullanılamıyor. Lütfen ${fallbackEmail} üzerinden iletişime geçin.`);
      }

      if (ok) {
        form.reset();
      }
    } catch (error) {
      if (status) {
        status.textContent = `Şu anda form kullanılamıyor. Lütfen ${fallbackEmail} üzerinden iletişime geçin.`;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || 'Gönder';
      }
    }
  }));

  function inferCollectionTheme() {
    const path = window.location.pathname;
    if (path.includes('/collections/cleanse')) return 'cleanse';
    if (path.includes('/collections/hydrate')) return 'hydrate';
    if (path.includes('/collections/treat')) return 'treat';
    if (path.includes('/collections/protect')) return 'protect';
    if (path.includes('/collections/routine')) return 'routine';
    if (path.includes('/collections/care')) return 'care';
    return 'default';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function createSlug(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function inferRoutineStep(product, theme) {
    if (theme === 'cleanse') return '1. adım · Temizleme';
    if (theme === 'hydrate') return '2. adım · Nem desteği';
    if (theme === 'treat') return '2. adım · Hedef bakım';
    if (theme === 'protect') return '3. adım · Günlük koruma';
    if (theme === 'routine') return 'Rutin seçkisi';
    if (theme === 'care') return 'Destek bakım';
    if ((product.tags || []).includes('spf')) return '3. adım · Günlük koruma';
    if ((product.tags || []).includes('serum')) return '2. adım · Serum';
    return 'Seçilmiş ürün';
  }

  function inferSkinFit(product, theme) {
    const name = (product.name || '').toLowerCase();
    const tags = (product.tags || []).join(' ');
    if (theme === 'protect' || name.includes('sun') || tags.includes('spf')) {
      return 'Günlük şehir kullanımı, normal, karma ve hassas ciltler için rahat bir son adım.';
    }
    if (theme === 'cleanse' || name.includes('cleanser')) {
      return 'Gün sonunda kalıntıyı konforlu biçimde uzaklaştırmak isteyen normal, karma ve yağlanmaya meyilli ciltler için uygundur.';
    }
    if (theme === 'hydrate' || tags.includes('hyaluronik') || tags.includes('barrier') || name.includes('snail')) {
      return 'Kuruluk hissi, bariyer desteği veya gün içinde esnek görünüm arayan cilt tipleri için iyi bir katman oluşturur.';
    }
    if (theme === 'treat' || name.includes('vitamin') || name.includes('glow')) {
      return 'Donuk görünüm, ton eşitsizliği veya daha canlı bir cilt görünümü isteyen bakım rutinleri için tasarlanmış bir ara adımdır.';
    }
    return 'Dengeli, sade ve sonuç odaklı bir rutin kurmak isteyen kullanıcılar için seçilmiş bir üründür.';
  }

  function inferUseSteps(product, theme) {
    if (theme === 'protect' || (product.tags || []).includes('spf')) {
      return [
        'Sabah rutininin son adımında kuru cilde eşit şekilde uygula.',
        'Makyaj altına ince katman halinde rahatça yerleşir.',
        'Gün içinde uzun dış mekân planlarında tazeleme düşün.'
      ];
    }
    if (theme === 'cleanse') {
      return [
        'Nemli cilde nazikçe masaj yaparak uygula.',
        'Ilık su ile durula ve cildi germeden temiz bırak.',
        'Ardından tonik, serum veya nem adımına geç.'
      ];
    }
    if (theme === 'hydrate') {
      return [
        'Temizleme sonrası hafif nemli cilde uygula.',
        'Tek başına ya da krem öncesi katman olarak kullan.',
        'Sabah ve akşam rutine kolayca eklenir.'
      ];
    }
    if (theme === 'treat') {
      return [
        'Temizleme sonrası ve krem öncesi ara adım olarak kullan.',
        'İhtiyaca göre tek ürün odaklı sade rutin içinde konumlandır.',
        'Hassasiyet hissedersen kullanım sıklığını kademeli artır.'
      ];
    }
    return [
      'Temizleme sonrası kullanıma uygundur.',
      'Dokuya göre serum, essence veya krem adımında konumlandır.',
      'Düzenli kullanımda rutinin görünümünü daha dengeli hale getirir.'
    ];
  }

  function inferTabContent(product, theme) {
    const summaryIntro = product.description || 'Premium, sade ve günlük rutine kolay entegre olan bir seçki ürünü.';
    const useSteps = inferUseSteps(product, theme);
    const orderCopy = inferRoutineStep(product, theme);
    const skinFit = inferSkinFit(product, theme);

    return {
      overview: {
        title: 'Ürün Bilgileri',
        body: `<p>${escapeHtml(summaryIntro)}</p>
          <ul>
            <li>${escapeHtml(orderCopy)} içinde konumlandırılabilir.</li>
            <li>Günlük kullanım odağında sade ve anlaşılır bir rutin akışına uygundur.</li>
            <li>Hızlı karar vermeyi kolaylaştıran net fayda, temiz görsel ve güven işaretleriyle sunulur.</li>
          </ul>`
      },
      routine: {
        title: 'Nasıl Kullanılır',
        body: `<ul>${useSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
      },
      fit: {
        title: 'Kimler İçin Uygun',
        body: `<p>${escapeHtml(skinFit)}</p>
          <ul>
            <li>İlk alışverişte kafa karıştırmayan, net bir ürün seçimi arayan kullanıcılar için uygundur.</li>
            <li>${escapeHtml((product.meta || 'KDV dahil · Türkiye içi gönderim').replace(/\s+/g, ' ').trim())}</li>
            <li>Rutinini gereksiz kalabalık olmadan kurmak isteyenler için iyi bir eşleşmedir.</li>
          </ul>`
      },
      trust: {
        title: 'Teslimat & Güven',
        body: `<ul>
          <li>Tüm fiyatlar KDV dahil gösterilir.</li>
          <li>${escapeHtml(fmt(FREE_SHIPPING))} ve üzeri siparişlerde ücretsiz kargo avantajı uygulanır.</li>
          <li>Güvenli ödeme, açık fiyatlama ve üyelik üzerinden favori takibi ile desteklenir.</li>
        </ul>`
      }
    };
  }

  function getCollectionProductData(card) {
    const media = card.querySelector('.product-media');
    const cartBtn = card.querySelector('[data-add-cart]');
    const title = card.querySelector('h3');
    const desc = card.querySelector('.product-body p');
    const brand = card.querySelector('.brandline');
    const price = card.querySelector('.price');
    const meta = card.querySelector('.meta-note');
    const img = card.querySelector('img');
    const badge = card.querySelector('.badge');
    const pills = $$('.pill', card).map((pill) => pill.textContent.trim()).filter(Boolean);
    return {
      id: cartBtn?.dataset.id || card.dataset.productId || createSlug(title?.textContent || ''),
      name: cartBtn?.dataset.name || title?.textContent?.trim() || 'Ürün',
      brand: cartBtn?.dataset.brand || brand?.textContent?.trim() || badge?.textContent?.trim() || 'Cosmoskin',
      price: Number(cartBtn?.dataset.price || String(price?.textContent || '0').replace(/[^\d]/g, '')),
      image: cartBtn?.dataset.image || img?.getAttribute('src') || '',
      description: desc?.textContent?.trim() || '',
      meta: meta?.textContent?.trim() || 'KDV dahil · Türkiye içi gönderim',
      url: media?.getAttribute('href') || window.location.pathname,
      tags: pills,
      categoryTheme: inferCollectionTheme()
    };
  }

  function setProductQueryParam(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('product', id);
    else url.searchParams.delete('product');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function attachCollectionDetailExperience() {
    const isCollectionPage = window.location.pathname.includes('/collections/');
    if (!isCollectionPage) return;

    document.body.classList.add('collection-page');

    const grid = document.querySelector('.product-grid');
    if (!grid) return;

    const detailShell = document.createElement('section');
    detailShell.className = 'collection-detail-shell';
    detailShell.hidden = true;
    grid.parentElement.insertBefore(detailShell, grid);

    function renderDetail(product) {
      if (!product?.id) return;
      const theme = inferCollectionTheme();
      const tabs = inferTabContent(product, theme);
      const favoriteActive = isFavorite(product.id);
      const floatingBottom = product.tags?.length ? product.tags.slice(0, 2).join(' · ') : inferRoutineStep(product, theme);
      detailShell.innerHTML = `
        <div class="collection-detail-toolbar">
          <button type="button" class="collection-detail-back">Tüm Ürünlere Dön</button>
          <div class="collection-detail-note">Ürün bilgileri, kullanım sırası ve temel teslimat notları</div>
        </div>
        <div class="collection-detail-grid">
          <div class="collection-detail-media">
            <div class="collection-detail-floating collection-detail-floating--top">${escapeHtml(inferRoutineStep(product, theme))}</div>
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div class="collection-detail-floating collection-detail-floating--bottom"><strong>${escapeHtml(floatingBottom)}</strong></div>
          </div>
          <div class="collection-detail-info">
            <div class="collection-detail-brand">${escapeHtml(product.brand)}</div>
            <h2 class="collection-detail-title">${escapeHtml(product.name)}</h2>
            <p class="collection-detail-summary">${escapeHtml(product.description || 'Seçilmiş ürün bilgisi bu ekranda net ve sade biçimde sunulur.')}</p>
            <div class="collection-detail-pills">
              ${(product.tags?.length ? product.tags : [theme, 'premium']).slice(0, 4).map((tag) => `<span class="collection-detail-pill">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="collection-detail-price-row">
              <div class="collection-detail-price-wrap">
                <div class="price">${fmt(product.price || 0)}</div>
                <div class="price-note">${escapeHtml(product.meta || 'KDV dahil')}</div>
              </div>
              <div class="collection-detail-actions">
                <button class="btn btn-primary" type="button" data-detail-add-cart>Sepete Ekle</button>
                <button class="collection-detail-favorite ${favoriteActive ? 'active' : ''} favorite-btn" type="button" aria-label="${favoriteActive ? 'Favorilerden çıkar' : 'Favorilere ekle'}" aria-pressed="${favoriteActive ? 'true' : 'false'}" data-favorite-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-brand="${escapeHtml(product.brand)}" data-price="${escapeHtml(product.price)}" data-image="${escapeHtml(product.image)}" data-url="${escapeHtml(product.url)}">${favoriteHeartIcon(favoriteActive)}</button>
              </div>
            </div>
            <div class="collection-detail-trust">
              <article><h4>Hızlı Karar</h4><p>Ürün ismi, fayda ve rutin sırası tek bakışta anlaşılır yapıdadır.</p></article>
              <article><h4>Güven İşaretleri</h4><p>Net fiyat, KDV bilgisi ve kargo avantajı kullanıcı tereddüdünü azaltır.</p></article>
              <article><h4>Apple Düzeyi Netlik</h4><p>Tek ürün odağı, sakin tipografi ve boşluk kullanımı satın alma akışını güçlendirir.</p></article>
            </div>
            <div class="collection-detail-tabs">
              <button type="button" class="collection-detail-tab active" data-detail-tab="overview">Ürün Bilgileri</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="routine">Kullanım</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="fit">Cilt Tipi</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="trust">Teslimat & Güven</button>
            </div>
            <div class="collection-detail-panels">
              ${Object.entries(tabs).map(([key, value], index) => `
                <div class="collection-detail-panel ${index === 0 ? 'active' : ''}" data-detail-panel="${key}">
                  <h3>${escapeHtml(value.title)}</h3>
                  ${value.body}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      detailShell.hidden = false;
      document.body.classList.add('collection-has-detail');
      setProductQueryParam(product.id);
      detailShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      renderFavoriteButtons();

      detailShell.querySelector('.collection-detail-back')?.addEventListener('click', () => {
        detailShell.hidden = true;
        detailShell.innerHTML = '';
        document.body.classList.remove('collection-has-detail');
        setProductQueryParam('');
      });

      detailShell.querySelector('[data-detail-add-cart]')?.addEventListener('click', () => {
        const item = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          price: Number(product.price || 0),
          image: product.image,
          qty: 1
        };
        const found = state.cart.find((entry) => entry.id === item.id);
        if (found) found.qty += 1;
        else state.cart.push(item);
        persistCart();
        openDrawer(cartDrawer);
      });

      $$('.collection-detail-tab', detailShell).forEach((tab) => {
        tab.addEventListener('click', () => {
          $$('.collection-detail-tab', detailShell).forEach((btn) => btn.classList.remove('active'));
          $$('.collection-detail-panel', detailShell).forEach((panel) => panel.classList.remove('active'));
          tab.classList.add('active');
          detailShell.querySelector(`[data-detail-panel="${tab.dataset.detailTab}"]`)?.classList.add('active');
        });
      });
    }

    const cards = $$('.product-card', grid);
    cards.forEach((card) => {
      const product = getCollectionProductData(card);
      card.dataset.productId = product.id;
      const media = card.querySelector('.product-media');
      const title = card.querySelector('h3');

      [media, title].forEach((target) => {
        if (!target) return;
        target.style.cursor = 'pointer';
        target.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          renderDetail(getCollectionProductData(card));
        });
      });

      card.addEventListener('click', (event) => {
        if (event.target.closest('button') || event.target.closest('.favorite-btn') || event.target.closest('[data-add-cart]')) return;
        if (event.target.closest('.product-media') || event.target.closest('h3') || event.target.closest('.product-body')) {
          renderDetail(getCollectionProductData(card));
        }
      });
    });

    const selectedId = new URL(window.location.href).searchParams.get('product');
    if (selectedId) {
      const selectedCard = cards.find((card) => card.dataset.productId === selectedId);
      if (selectedCard) renderDetail(getCollectionProductData(selectedCard));
    }

    window.addEventListener('cosmoskin:favorites-updated', () => {
      const currentId = new URL(window.location.href).searchParams.get('product');
      if (!currentId || detailShell.hidden) return;
      const activeCard = cards.find((card) => card.dataset.productId === currentId);
      if (activeCard) renderDetail(getCollectionProductData(activeCard));
    });
  }

  attachCollectionDetailExperience();

  // ---------------------------------------------------------------------------
  // Phase 5 — Akıllı Rutin Seçimi: Gündüz / Akşam mood toggle
  // ---------------------------------------------------------------------------
  // Toggles `data-mood` on the .home-routine section so CSS can swap the
  // background gradient + ink color. Choice is persisted in localStorage so
  // it survives page reloads. Soft, single-line behavior; no animations
  // beyond the CSS `transition`.
  function attachRoutineMoodToggle() {
    const section = document.querySelector('.home-routine');
    if (!section) return;
    const buttons = Array.from(section.querySelectorAll('.home-routine__mood-btn'));
    if (!buttons.length) return;

    const STORAGE_KEY = 'cosmoskin_routine_mood';
    const apply = (mood) => {
      section.dataset.mood = mood;
      buttons.forEach((btn) => {
        const isActive = btn.dataset.mood === mood;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    };

    let initial = 'day';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'day' || stored === 'night') initial = stored;
    } catch (_) { /* localStorage unavailable */ }
    apply(initial);

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.mood;
        if (next !== 'day' && next !== 'night') return;
        apply(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* swallow */ }
      });
    });
  }
  attachRoutineMoodToggle();

})();
