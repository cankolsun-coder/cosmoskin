from pathlib import Path
import re
root = Path('/mnt/data/checkout_v6')
html_path = root/'checkout.html'
js_path = root/'assets/checkout-flow.js'
css_path = root/'assets/checkout-flow.css'
html = html_path.read_text()
html = html.replace('/assets/checkout-flow.css?v=20260517-checkout-authfix','/assets/checkout-flow.css?v=20260701-checkout-professional-v6')
html = html.replace('/assets/checkout-flow.js?v=20260616-stockfix','/assets/checkout-flow.js?v=20260701-checkout-professional-v6')
html = html.replace('<script src="/assets/site-config.js"></script><script src="/assets/site-chrome.js"></script><script src="/assets/bottom-nav.js"></script>', '<script src="/assets/site-chrome.js?v=20260701-checkout-professional-v6"></script>')
html_path.write_text(html)
js = js_path.read_text()
js = js.replace("  var STEP_LABELS = {\n    delivery: 'Teslimat',\n    payment: 'Ödeme',\n    review: 'Kontrol Et',\n    success: 'Tamamlandı'\n  };", "  var STEP_LABELS = {\n    delivery: 'Teslimat',\n    payment: 'Ödeme',\n    review: 'Kontrol',\n    success: 'Tamamlandı'\n  };\n  var STEP_SUBTITLES = {\n    delivery: 'Adres & fatura',\n    payment: 'Yöntem & onay',\n    review: 'Son kontrol',\n    success: 'Sipariş sonucu'\n  };")
js = js.replace("var deliveryFields = ['firstName', 'lastName', 'email', 'phone', 'country', 'address', 'city', 'district', 'postalCode'];", "var deliveryFields = ['firstName', 'lastName', 'email', 'phone', 'country', 'address', 'city', 'district', 'postalCode', 'deliveryNote'];")
js = js.replace("      postalCode: data.postalCode\n    };", "      postalCode: data.postalCode,\n      deliveryNote: data.deliveryNote || ''\n    };")
js = js.replace("      cargo_note: '',", "      cargo_note: state.delivery.deliveryNote || state.delivery.note || '',")
js = js.replace("return '<button class=\"cs-checkout-step ' + (complete ? 'is-complete ' : '') + (active ? 'is-active' : '') + '\" type=\"button\" data-step-nav=\"' + esc(step) + '\"><span>' + (complete ? '✓' : index + 1) + '</span>' + esc(STEP_LABELS[step]) + '</button>';", "return '<button class=\"cs-checkout-step ' + (complete ? 'is-complete ' : '') + (active ? 'is-active' : '') + '\" type=\"button\" data-step-nav=\"' + esc(step) + '\" aria-current=\"' + (active ? 'step' : 'false') + '\"><span>' + (complete ? '✓' : index + 1) + '</span><strong>' + esc(STEP_LABELS[step]) + '</strong><small>' + esc(STEP_SUBTITLES[step] || '') + '</small></button>';" )
# Add helper functions after shippingInfo
helper = r'''
  function checkoutBadge(text, tone) {
    return '<span class="cs-checkout-badge ' + (tone ? 'is-' + tone : '') + '">' + esc(text) + '</span>';
  }
  function compactAddress() {
    var bits = [state.delivery.address, [state.delivery.district, state.delivery.city].filter(Boolean).join(' / '), state.delivery.postalCode].filter(Boolean);
    return bits.join(' · ');
  }
  function shippingProgressHtml(t) {
    t = t || totals();
    var remaining = Math.max(0, FREE_SHIPPING - Number(t.discounted || 0));
    var pct = FREE_SHIPPING ? Math.max(0, Math.min(100, Math.round((Number(t.discounted || 0) / FREE_SHIPPING) * 100))) : 0;
    var copy = remaining > 0 ? 'Ücretsiz kargo için ' + money(remaining) + ' kaldı.' : 'Kargo avantajı sepetine uygulandı.';
    return '<div class="cs-checkout-free-shipping"><div class="cs-checkout-free-shipping__bar"><span style="width:' + pct + '%"></span></div><p>' + esc(copy) + '</p></div>';
  }
  function miniTrustRow() {
    return '<div class="cs-checkout-mini-trust"><span>' + icon('lock') + ' Güvenli ödeme</span><span>' + icon('check') + ' KDV dahil fiyat</span><span>' + icon('return') + ' 14 gün cayma hakkı</span></div>';
  }
'''
js = js.replace("  function orderNumberFallback() {", helper + "\n  function orderNumberFallback() {")
# Replace functions
new_render_delivery = r'''  function renderDelivery() {
    var d = state.delivery || {};
    var inv = state.invoice || {};
    var same = inv.sameAsDelivery !== false;
    var individual = inv.type !== 'corporate';
    return '<form id="csCheckoutDeliveryForm" novalidate>' +
      '<section class="cs-checkout-card cs-checkout-card--delivery"><div class="cs-checkout-auth" id="csCheckoutAuthGate"><div><strong>Hesabın varsa teslimat ve fatura bilgilerin otomatik gelir.</strong><span>Misafir ödeme açık; giriş yapmak zorunlu değildir.</span></div><div class="cs-checkout-auth-actions"><button class="cs-checkout-secondary" data-open-auth data-auth-tab="loginPanel" type="button">Giriş Yap</button><button class="cs-checkout-secondary" data-open-auth data-auth-tab="registerPanel" type="button">Kayıt Ol</button></div></div><div class="cs-checkout-account-summary" id="csCheckoutAccountSummary" hidden></div>' +
      '<div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Teslimat</span><h2>Teslimat Bilgileri</h2><p>Sipariş ve kargo bildirimleri için alıcı bilgilerini eksiksiz doldurun.</p></div>' + checkoutBadge('Güvenli bilgi girişi', 'secure') + '</div>' +
      '<div class="cs-checkout-form-grid cs-checkout-form-grid--delivery">' +
      input('firstName', 'Ad', d.firstName, { autocomplete: 'given-name', placeholder: 'Adınız' }) +
      input('lastName', 'Soyad', d.lastName, { autocomplete: 'family-name', placeholder: 'Soyadınız' }) +
      input('email', 'E-posta', d.email, { type: 'email', autocomplete: 'email', full: true, placeholder: 'ornek@mail.com' }) +
      input('phone', 'Telefon', d.phone, { autocomplete: 'tel', inputmode: 'tel', placeholder: '5XX XXX XX XX' }) +
      input('country', 'Ülke', d.country || 'Türkiye', { autocomplete: 'country-name' }) +
      textarea('address', 'Açık Adres', d.address) +
      input('city', 'İl', d.city, { autocomplete: 'address-level1', placeholder: 'İstanbul' }) +
      input('district', 'İlçe', d.district, { autocomplete: 'address-level2', placeholder: 'Maltepe' }) +
      input('postalCode', 'Posta Kodu', d.postalCode, { inputmode: 'numeric', maxlength: 5, placeholder: '34840' }) +
      textarea('deliveryNote', 'Kargo Notu (Opsiyonel)', d.deliveryNote || d.note || '') +
      '</div></section>' +
      savedAddressesHtml() +
      '<section class="cs-checkout-card cs-checkout-card--shipping"><div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Kargo</span><h2>Kargo Yöntemi</h2><p>Kargo bedeli sepet tutarına göre sipariş özetinde otomatik hesaplanır.</p></div>' + checkoutBadge('DHL teslimat', 'delivery') + '</div>' + shippingOptionsHtml() + '</section>' +
      '<section class="cs-checkout-card cs-checkout-card--invoice"><div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Fatura</span><h2>Fatura Bilgileri</h2><p>Faturan sipariş bilgilerindeki e-posta adresine iletilir. Kurumsal fatura için vergi bilgilerini eksiksiz girin.</p></div></div>' +
      '<input type="hidden" name="invoiceType" value="' + (individual ? 'individual' : 'corporate') + '">' +
      '<div class="cs-checkout-segment" role="group" aria-label="Fatura tipi"><button type="button" class="' + (individual ? 'is-active' : '') + '" data-invoice-type="individual">Bireysel</button><button type="button" class="' + (!individual ? 'is-active' : '') + '" data-invoice-type="corporate">Kurumsal</button></div>' +
      '<div class="cs-checkout-inline-note">Kartlı bireysel ödemede T.C. kimlik numarası ödeme sağlayıcı/fatura süreci için gerekebilir. Bu bilgi müşteriye açık şekilde gösterilmez.</div>' +
      '<label class="cs-checkout-checkbox cs-checkout-checkbox--boxed"><input type="checkbox" name="invoiceSame" ' + (same ? 'checked' : '') + '><span>Fatura adresim teslimat adresimle aynı</span></label>' +
      '<div class="cs-checkout-form-grid">' + invoiceFieldsHtml(individual, same) + '</div></section>' +
      '</form>';
  }
'''
js = re.sub(r"  function renderDelivery\(\) \{.*?\n  function shippingOptionsHtml\(\)", new_render_delivery + "\n  function shippingOptionsHtml()", js, flags=re.S)
new_shipping = r'''  function shippingOptionsHtml() {
    var t = totals();
    state.shippingMethod = 'standard';
    var standard = t.discounted >= FREE_SHIPPING ? 0 : STANDARD_SHIPPING;
    return '<div class="cs-checkout-shipping-wrap">' + shippingProgressHtml(t) + '<div class="cs-checkout-option-grid">' +
      optionHtml('standard', 'Standart Kargo', 'Tahmini teslimat: 2-4 iş günü · DHL teslimat ağı', standard) +
      '</div><p class="cs-checkout-note">Siparişler ödeme onayından sonra hazırlık sürecine alınır. Kargo süreci e-posta ile paylaşılır.</p></div>';
  }
  function optionHtml(value, title, desc, fee) {
    return '<button class="cs-checkout-option ' + (state.shippingMethod === value ? 'is-selected' : '') + '" type="button" data-shipping="' + value + '"><span class="cs-checkout-radio"></span><span><strong>' + title + '</strong><span>' + desc + '</span></span><em>' + (fee ? money(fee) : 'Ücretsiz') + '</em></button>';
  }
'''
js = re.sub(r"  function shippingOptionsHtml\(\) \{.*?\n  function invoiceFieldsHtml\(", new_shipping + "\n  function invoiceFieldsHtml(", js, flags=re.S)
new_payment = r'''  function renderPayment() {
    var ship = shippingInfo();
    return '<section class="cs-checkout-card cs-checkout-card--payment"><div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Ödeme</span><h2>Ödeme Bilgileri</h2><p>Ödeme yönteminizi seçin. Kart bilgileriniz COSMOSKIN tarafından alınmaz veya saklanmaz.</p></div>' + checkoutBadge('KDV dahil toplam', 'secure') + '</div>' +
      '<div class="cs-checkout-review-list cs-checkout-review-list--compact"><div class="cs-checkout-review-card cs-checkout-review-card--summary"><header><h3>Teslimat Adresi</h3><button class="cs-checkout-edit" type="button" data-go-step="delivery">Düzenle</button></header><p><strong>' + esc((state.delivery.firstName || '') + ' ' + (state.delivery.lastName || '')) + '</strong><br>' + esc(compactAddress() || 'Adres bilgisi eksik') + '<br>' + esc(state.delivery.phone || '') + '</p></div>' +
      '<div class="cs-checkout-review-card cs-checkout-review-card--summary"><header><h3>Kargo Yöntemi</h3><button class="cs-checkout-edit" type="button" data-go-step="delivery">Düzenle</button></header><p><strong>' + esc(ship.title) + '</strong><br>Tahmini teslimat: ' + esc(ship.estimate) + '<br>' + (ship.fee ? money(ship.fee) : 'Ücretsiz') + '</p></div></div>' +
      '<form id="csCheckoutPaymentForm" novalidate>' +
      '<div class="cs-checkout-payment-panel"><div class="cs-checkout-method-head"><h3>Ödeme yöntemi seç</h3><p>Kartlı ödeme hazır değilse Havale/EFT ile sipariş oluşturabilirsin.</p></div><div class="cs-checkout-option-grid cs-checkout-option-grid--payments">' +
      paymentOptionHtml('card', 'Kart ile Ödeme', CARD_PAYMENTS_ENABLED ? '3D Secure doğrulamasıyla güvenli ödeme' : 'Kredi kartı ödeme altyapısı yapılandırılıyor. Lütfen Havale/EFT kullanın.', CARD_PAYMENTS_ENABLED ? 'Kredi kartı' : 'Yakında', { disabled: !CARD_PAYMENTS_ENABLED, icon: 'card' }) +
      paymentOptionHtml('bank_transfer', 'Havale / EFT', 'Sipariş oluşturulur, ödeme onayı sonrası hazırlanır', 'Ödeme bekleniyor', { icon: 'bank' }) +
      '</div>' + paymentMethodPanelHtml() + '</div>' +
      '<div class="cs-checkout-legal-panel"><div class="cs-checkout-method-head"><h3>Yasal Onaylar</h3><p>Devam etmek için zorunlu bilgilendirme ve sözleşme onaylarını tamamlayın.</p></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="legalPreInformation" ' + (state.legal.preInformation ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalPreInformation-error"><span><a href="/legal/on-bilgilendirme-formu.html" data-legal-document="on-bilgilendirme-formu" data-legal-version="legal-20260702">Ön Bilgilendirme Formu</a>’nu okudum ve kabul ediyorum.</span></label><div class="cs-checkout-error" id="cs-legalPreInformation-error"></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="legalDistanceSales" ' + (state.legal.distanceSales ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalDistanceSales-error"><span><a href="/legal/mesafeli-satis-sozlesmesi.html" data-legal-document="mesafeli-satis-sozlesmesi" data-legal-version="legal-20260702">Mesafeli Satış Sözleşmesi</a>’ni okudum ve kabul ediyorum.</span></label><div class="cs-checkout-error" id="cs-legalDistanceSales-error"></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="legalPrivacy" ' + (state.legal.privacy ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalPrivacy-error"><span><a href="/legal/kvkk-aydinlatma-metni.html" data-legal-document="kvkk-aydinlatma-metni" data-legal-version="legal-20260702">KVKK Aydınlatma Metni</a> kapsamında kişisel verilerimin işlenmesine ilişkin bilgilendirildim.</span></label><div class="cs-checkout-error" id="cs-legalPrivacy-error"></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="marketingEmailOptIn" ' + (state.legal.marketing ? 'checked' : '') + ' aria-invalid="false"><span>COSMOSKIN tarafından kampanya, indirim, ürün önerileri ve bilgilendirme amaçlı ticari elektronik ileti gönderilmesini kabul ediyorum. <a href="/legal/ticari-elektronik-ileti-izni.html" data-legal-document="ticari-elektronik-ileti-izni" data-legal-version="legal-20260702">Detaylar</a>.</span></label></div>' +
      '</form><div id="csIyzicoHost"></div></section>';
  }
  function paymentOptionHtml(value, title, desc, meta, options) {
    options = options || {};
    var disabled = Boolean(options.disabled);
    var iconName = options.icon || (value === 'bank_transfer' ? 'bank' : 'card');
    return '<button class="cs-checkout-payment-option ' + (state.paymentMethod === value ? 'is-selected ' : '') + (disabled ? 'is-disabled' : '') + '" type="button" data-payment-method="' + value + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '><span class="cs-checkout-payment-icon">' + icon(iconName) + '</span><span><strong>' + title + '</strong><span>' + desc + '</span></span><em>' + meta + '</em></button>';
  }
  function paymentMethodPanelHtml() {
    if (state.paymentMethod === 'bank_transfer') return bankPanelHtml();
    return '<div class="cs-checkout-secure-transition" role="status">' +
      '<span class="cs-checkout-secure-transition__icon">' + icon('lock') + '</span>' +
      '<div><h3>Güvenli kart ödemesi</h3><p>Kart bilgileriniz COSMOSKIN tarafından alınmaz veya saklanmaz. Siparişinizi onayladığınızda ödeme, güvenli ödeme sağlayıcısı üzerinden tamamlanır.</p></div>' +
      '</div><div class="cs-card-icons" role="img" aria-label="Visa, Mastercard, Troy ve iyzico desteklenir"><img src="/assets/img/payments/visa.svg" alt="Visa"><img src="/assets/img/payments/mastercard.svg" alt="Mastercard"><img src="/assets/img/payments/troy.svg" alt="Troy"><img src="/assets/img/payments/iyzico-monochrome.svg" alt="iyzico ile Öde"></div>';
  }
  function bankPanelHtml() {
    var bank = bankConfig();
    var accounts = bank.accounts || [];
    var accountCards = accounts.map(function (account, index) {
      var lines = [['Banka Adı', account.bankName], ['Alıcı Ünvanı', account.accountName], ['IBAN', account.iban], ['Şube', account.branch || 'Maltepe Çarşı']];
      return '<article class="cs-checkout-bank-account" data-bank-index="' + index + '"><h4>' + esc(account.bankName) + '</h4>' + lines.map(function (line) { return '<div class="cs-checkout-bank-line"><span>' + esc(line[0]) + '</span><strong>' + esc(line[1]) + '</strong>' + (line[0] === 'IBAN' ? '<button class="cs-checkout-secondary" data-copy-iban type="button">Kopyala</button>' : '<i></i>') + '</div>'; }).join('') + '</article>';
    }).join('');
    return '<div class="cs-checkout-bank-panel"><div class="cs-checkout-method-head"><h3>Havale / EFT ile ödeme</h3><p>Sipariş numaranız ödeme açıklamasında yer almalıdır. Onay sonrası hazırlık süreci başlar.</p></div>' +
      (!bank.configured ? '<p class="cs-checkout-status is-error">' + esc(liveBankAccountError || 'Havale/EFT ödeme bilgileri henüz kullanıma hazır değil. Bu yöntemle sipariş oluşturulamaz.') + '</p>' : '<div class="cs-checkout-bank-accounts">' + accountCards + '</div>') +
      '<div class="cs-checkout-bank-notes"><span>Ödeme açıklaması sipariş oluşturulduktan sonra görünür.</span><span>24 saat içinde tamamlanmayan havale siparişleri iptal edilebilir.</span></div></div>';
  }
'''
js = re.sub(r"  function renderPayment\(\) \{.*?\n  function renderReview\(\)", new_payment + "\n  function renderReview()", js, flags=re.S)
new_summary = r'''  function renderSummary() {
    var host = byId('csCheckoutSummaryCard');
    var action = byId('csCheckoutAction');
    if (!host) return;
    var successOrder = state.step === 'success' ? (state.order || readJSON(ORDER_KEY, null) || {}) : null;
    var summaryItems = successOrder ? normalizedOrderItems(successOrder) : cart.items.map(normalizedOrderItem);
    var t = successOrder ? normalizedOrderTotals(successOrder) : totals();
    if (!summaryItems.length && state.step !== 'success') {
      host.innerHTML = '<div class="cs-checkout-summary-head"><div><span class="cs-checkout-summary-kicker">Sepet</span><h2>Sipariş Özeti</h2></div><span class="cs-checkout-secure">KDV dahil</span></div><div class="cs-checkout-empty-inline cs-checkout-empty-inline--summary"><strong>Sepetinde ürün bulunmuyor.</strong><span>Ürün eklediğinde ürünler, kargo, KDV ve toplam bilgileri burada görünür.</span></div>';
      if (action) {
        action.textContent = 'Ödeme adımına geçilemez';
        action.disabled = true;
        action.setAttribute('aria-busy', 'false');
      }
      var emptyNote = byId('csCheckoutActionNote');
      if (emptyNote) emptyNote.textContent = 'Ödeme adımına geçmek için sepetine ürün eklemelisin.';
      return;
    }
    host.innerHTML = '<div class="cs-checkout-summary-head"><div><span class="cs-checkout-summary-kicker">Sepet Detayı</span><h2>Sipariş Özeti</h2></div><a class="cs-checkout-summary-edit" href="/cart.html">Sepeti Düzenle</a></div>' +
      '<div class="cs-checkout-summary-items">' + (summaryItems.length ? summaryItems.map(function (item) {
        return '<article class="cs-checkout-item"><a href="' + esc(item.url) + '"><img src="' + esc(item.image || '/assets/img/brand/cosmoskin-wordmark.svg') + '" alt="' + esc(item.name) + '" loading="lazy"></a><div><strong>' + esc(item.brand) + '<br>' + esc(item.name) + '</strong><span>' + esc(item.size || 'KDV dahil') + '</span><span>Adet: ' + item.qty + '</span></div><b>' + money(item.line_total || (item.price * item.qty)) + '</b></article>';
      }).join('') : '<p class="cs-checkout-note">Sipariş ürünleri kaydedildi.</p>') + '</div>' +
      (state.step === 'success' ? '' : shippingProgressHtml(t)) +
      '<div class="cs-checkout-totals">' +
      totalRow('Ara Toplam', money(t.subtotal)) +
      (t.discount ? totalRow('İndirim', '-' + money(t.discount)) : '') +
      totalRow('Kargo', t.shipping ? money(t.shipping) : 'Ücretsiz') +
      totalRow('Dahil olan KDV', money(t.vat)) +
      totalRow('Toplam', money(t.total), true) +
      '</div>' +
      (state.step === 'success' ? '<p class="cs-checkout-note cs-checkout-summary-success-note">Sipariş özeti, sepet temizlendikten sonra oluşturulan sipariş verisinden gösterilir.</p>' : '<div class="cs-checkout-discount"><label class="cs-checkout-label" for="csCouponInput">İndirim Kodu</label><div class="cs-checkout-discount-row"><input class="cs-checkout-input" id="csCouponInput" value="' + esc(state.coupon.code || '') + '" placeholder="Örn. WELCOME10" autocomplete="off"><button class="cs-checkout-secondary" id="csCouponApply" type="button">Uygula</button>' + (state.coupon && state.coupon.code ? '<button class="cs-checkout-coupon-clear" id="csCouponClear" type="button" data-clear-checkout-coupon>Kuponu Kaldır</button>' : '') + '</div>' + (state.coupon && state.coupon.code && t.discount ? '<p class="cs-checkout-coupon-applied"><strong>' + esc(state.coupon.code) + '</strong> uygulandı' + (state.coupon.label ? ' · ' + esc(state.coupon.label) : '') + '.</p>' : '<p class="cs-checkout-coupon-hint">Kuponlar otomatik uygulanmaz; geçerli kodu sepet/checkout adımında manuel girmen gerekir.</p>') + '</div>') + miniTrustRow();
    if (!action) return;
    var label = state.step === 'delivery' ? 'Ödeme Adımına Geç' : state.step === 'payment' ? 'Siparişi Kontrol Et' : state.step === 'review' ? (state.paymentMethod === 'bank_transfer' ? 'Siparişi Oluştur' : 'Siparişi Onayla ve Güvenli Ödemeye Geç') : 'Alışverişe Devam Et';
    action.textContent = submitLocked ? (state.paymentMethod === 'bank_transfer' ? 'Sipariş oluşturuluyor…' : 'Güvenli ödeme hazırlanıyor…') : label;
    action.disabled = submitLocked || (!summaryItems.length && state.step !== 'success') || (state.paymentMethod === 'bank_transfer' && state.step !== 'delivery' && state.step !== 'success' && !bankConfig().configured);
    action.setAttribute('aria-busy', submitLocked ? 'true' : 'false');
    var note = byId('csCheckoutActionNote');
    if (note) note.textContent = state.step === 'success'
      ? 'Siparişin oluşturuldu. Siparişlerim alanından takip edebilirsin.'
      : state.step === 'review' && state.paymentMethod === 'bank_transfer'
        ? 'Havale/EFT siparişleri ödeme bekleniyor durumuyla oluşturulur.'
        : state.step === 'review'
          ? 'Onayladıktan sonra güvenli ödeme sağlayıcısına yönlendirilebilirsiniz.'
          : inventoryWarning || 'Ödeme bilgileriniz güvenli bağlantı üzerinden işlenir.';
  }
'''
js = re.sub(r"  function renderSummary\(\) \{.*?\n  function totalRow", new_summary + "\n  function totalRow", js, flags=re.S)
# Update renderTrust and icon paths
js = js.replace("      box: '<path d=\"M4 8 12 4l8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8\"></path>'", "      box: '<path d=\"M4 8 12 4l8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8\"></path>',\n      card: '<rect x=\"3.5\" y=\"6\" width=\"17\" height=\"12\" rx=\"2\"></rect><path d=\"M3.5 10h17M7 14h3\"></path>',\n      bank: '<path d=\"M4 9h16L12 4 4 9Zm2 0v9M10 9v9M14 9v9M18 9v9M4 18h16\"></path>'")
js = re.sub(r"  function renderTrust\(\) \{.*?\n  function render\(options\)", r'''  function renderTrust() {
    var host = byId('csCheckoutTrust');
    if (!host) return;
    host.innerHTML = [
      ['check', 'Orijinal ürün seçkisi'],
      ['truck', 'DHL teslimat süreci'],
      ['return', '14 gün cayma hakkı'],
      ['lock', 'Güvenli ödeme altyapısı']
    ].map(function (item) {
      return '<div class="cs-checkout-trust-item"><span class="cs-checkout-trust-icon">' + icon(item[0]) + '</span><span>' + item[1] + '</span></div>';
    }).join('');
  }

  function render(options)''', js, flags=re.S)
# Update summary toggle aria-expanded in click handler
js = js.replace("if (summary) summary.classList.toggle('is-collapsed');", "if (summary) { var collapsed = summary.classList.toggle('is-collapsed'); var toggle = byId('csCheckoutSummaryToggle'); if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true'); }")
js_path.write_text(js)
css_append = r'''

/* COSMOSKIN checkout professional hotfix v6 - scoped to checkout only. Header/footer visuals are intentionally untouched. */
:root {
  --cs-checkout-radius-lg: 28px;
  --cs-checkout-radius-md: 20px;
  --cs-checkout-glass: rgba(255, 253, 249, .92);
  --cs-checkout-cream-2: #f4ebdf;
  --cs-checkout-warm-line: rgba(55, 42, 31, .11);
  --cs-checkout-warm-shadow: 0 26px 80px rgba(38, 29, 21, .095);
}
body.checkout-premium-page {
  background:
    radial-gradient(circle at 6% 6%, rgba(255,255,255,.9) 0 9%, transparent 28%),
    radial-gradient(circle at 88% 12%, rgba(214,190,160,.24) 0 12%, transparent 31%),
    linear-gradient(180deg, #fffdf8 0%, #f8efe5 48%, #fffaf4 100%);
}
.cs-checkout-page { position: relative; overflow: clip; }
.cs-checkout-page::before,
.cs-checkout-page::after {
  content: "";
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(2px);
  opacity: .75;
}
.cs-checkout-page::before { width: 320px; height: 320px; left: -150px; top: 130px; background: rgba(232,214,190,.28); }
.cs-checkout-page::after { width: 260px; height: 260px; right: -130px; top: 44px; background: rgba(255,255,255,.72); }
.cs-checkout-shell { position: relative; z-index: 1; width: min(100% - 56px, 1240px); padding: 48px 0 82px; }
.cs-checkout-topline {
  margin-bottom: 28px;
  padding: 0 2px;
}
.cs-checkout-title h1 { letter-spacing: -.035em; font-size: clamp(44px, 5.5vw, 72px); }
.cs-checkout-title p { max-width: 720px; font-weight: 600; }
.cs-checkout-secure { border-radius: 999px; background: rgba(255,255,255,.82); box-shadow: 0 10px 30px rgba(31,23,17,.06); }
.cs-checkout-stepper {
  position: relative;
  padding: 16px;
  border: 1px solid var(--cs-checkout-warm-line);
  border-radius: var(--cs-checkout-radius-lg);
  background: rgba(255,253,249,.68);
  box-shadow: 0 14px 42px rgba(31,23,17,.055);
  backdrop-filter: blur(10px);
}
.cs-checkout-step { min-height: 66px; gap: 6px; border-radius: 18px; cursor: default; }
.cs-checkout-step[data-step-nav="delivery"],
.cs-checkout-step[data-step-nav="payment"],
.cs-checkout-step[data-step-nav="review"] { cursor: pointer; }
.cs-checkout-step::before { top: 31px; left: calc(-50% + 40px); width: calc(100% - 80px); background: rgba(38,29,21,.14); }
.cs-checkout-step span { width: 42px; height: 42px; background: #f4eadf; box-shadow: inset 0 0 0 4px rgba(255,255,255,.58); }
.cs-checkout-step strong { color: inherit; font-size: 13px; letter-spacing: .01em; }
.cs-checkout-step small { color: #8a7c70; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.cs-checkout-step.is-active { background: rgba(255,255,255,.76); box-shadow: inset 0 0 0 1px rgba(34,25,18,.06); }
.cs-checkout-step.is-active span,
.cs-checkout-step.is-complete span { background: #14100d; }
.cs-checkout-grid { grid-template-columns: minmax(0, 1fr) minmax(360px, 420px); gap: 34px; }
.cs-checkout-card,
.cs-checkout-summary-card,
.cs-checkout-trust-strip {
  border-color: var(--cs-checkout-warm-line);
  border-radius: var(--cs-checkout-radius-lg);
  background: var(--cs-checkout-glass);
  box-shadow: var(--cs-checkout-warm-shadow);
  backdrop-filter: blur(12px);
}
.cs-checkout-card { padding: clamp(22px, 3vw, 34px); }
.cs-checkout-card + .cs-checkout-card { margin-top: 18px; }
.cs-checkout-card-head { align-items: center; margin-bottom: 24px; }
.cs-checkout-card h2, .cs-checkout-summary-card h2 { font-size: clamp(28px, 2.8vw, 38px); letter-spacing: -.025em; }
.cs-checkout-card h3 { font-family: var(--cs-checkout-sans); font-size: 15px; font-weight: 900; letter-spacing: -.01em; }
.cs-checkout-kicker,
.cs-checkout-summary-kicker {
  display: inline-flex;
  margin-bottom: 8px;
  color: var(--cs-checkout-gold);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .18em;
  text-transform: uppercase;
}
.cs-checkout-badge {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(158,116,72,.18);
  border-radius: 999px;
  background: #fffaf4;
  color: #8b6239;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}
.cs-checkout-badge.is-secure { color: #315b42; border-color: rgba(45,107,73,.18); background: rgba(244,250,246,.75); }
.cs-checkout-badge.is-delivery { color: #8b6239; }
.cs-checkout-auth,
.cs-checkout-account-summary {
  border-radius: 22px;
  padding: 16px 18px;
  background: linear-gradient(135deg, rgba(246,235,222,.84), rgba(255,255,255,.68));
}
.cs-checkout-form-grid { gap: 18px; }
.cs-checkout-field label, .cs-checkout-label { color: #3d342d; font-size: 11px; letter-spacing: .065em; text-transform: uppercase; }
.cs-checkout-input,
.cs-checkout-select,
.cs-checkout-textarea {
  border-radius: 16px;
  border-color: rgba(55,42,31,.14);
  background: rgba(255,255,255,.86);
  min-height: 54px;
  padding-left: 16px;
  padding-right: 16px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.72);
}
.cs-checkout-textarea { min-height: 112px; padding-top: 15px; }
.cs-checkout-input::placeholder, .cs-checkout-textarea::placeholder { color: #b0a59c; }
.cs-checkout-input:focus, .cs-checkout-select:focus, .cs-checkout-textarea:focus { box-shadow: 0 0 0 4px rgba(154,112,64,.10), inset 0 1px 0 rgba(255,255,255,.85); }
.cs-checkout-error { font-size: 11px; font-weight: 850; }
.cs-checkout-inline-note {
  margin: 14px 0;
  padding: 12px 14px;
  border: 1px solid rgba(154,112,64,.13);
  border-radius: 18px;
  background: rgba(246,238,228,.68);
  color: #75675c;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.55;
}
.cs-checkout-checkbox--boxed { margin: 0 0 16px; padding: 14px; border: 1px solid var(--cs-checkout-warm-line); border-radius: 18px; background: rgba(255,255,255,.66); }
.cs-checkout-segment { border-radius: 18px; padding: 5px; background: rgba(255,255,255,.72); }
.cs-checkout-segment button { min-height: 44px; border-radius: 14px; }
.cs-checkout-segment button.is-active { background: #15110d; color: #fff; box-shadow: 0 12px 26px rgba(21,17,13,.13); }
.cs-checkout-free-shipping { display: grid; gap: 8px; margin: 0 0 16px; }
.cs-checkout-free-shipping__bar { height: 8px; overflow: hidden; border-radius: 999px; background: #eadfd2; }
.cs-checkout-free-shipping__bar span { display: block; height: 100%; border-radius: inherit; background: #15110d; transition: width .25s ease; }
.cs-checkout-free-shipping p { margin: 0; color: #6e6258; font-size: 12px; font-weight: 800; }
.cs-checkout-option,
.cs-checkout-payment-option {
  min-height: 82px;
  border-radius: 22px;
  border-color: rgba(55,42,31,.12);
  background: rgba(255,255,255,.72);
  padding: 16px;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease, transform .18s ease;
}
.cs-checkout-option:hover,
.cs-checkout-payment-option:hover { transform: translateY(-1px); border-color: rgba(21,17,13,.28); background: #fffdf9; }
.cs-checkout-option.is-selected,
.cs-checkout-payment-option.is-selected { border-color: rgba(21,17,13,.42); background: #fffaf4; box-shadow: 0 16px 36px rgba(31,23,17,.07), inset 0 0 0 1px rgba(21,17,13,.04); }
.cs-checkout-radio { width: 22px; height: 22px; border-color: rgba(21,17,13,.32); }
.cs-checkout-payment-icon { display: grid !important; place-items: center; width: 44px; height: 44px; margin-top: 0 !important; border: 1px solid var(--cs-checkout-warm-line); border-radius: 16px; background: #f5ecdf; color: #15110d !important; }
.cs-checkout-payment-option { grid-template-columns: 44px minmax(0,1fr) auto; }
.cs-checkout-payment-option .cs-checkout-radio { display: none; }
.cs-checkout-method-head { display: grid; gap: 5px; }
.cs-checkout-method-head h3 { margin: 0; color: var(--cs-checkout-ink); font-family: var(--cs-checkout-sans); font-size: 15px; font-weight: 950; }
.cs-checkout-method-head p { margin: 0; color: var(--cs-checkout-muted); font-size: 12px; line-height: 1.55; }
.cs-checkout-payment-panel,
.cs-checkout-bank-panel,
.cs-checkout-legal-panel { border-radius: 24px; padding: 20px; background: rgba(255,255,255,.66); }
.cs-checkout-secure-transition { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 14px; align-items: start; padding: 16px; border: 1px solid rgba(45,107,73,.16); border-radius: 22px; background: rgba(246,251,247,.76); }
.cs-checkout-secure-transition__icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 16px; background: #fff; color: #315b42; }
.cs-card-icons img { height: 30px; width: 50px; border-radius: 10px; }
.cs-checkout-bank-notes { display: grid; gap: 8px; padding: 14px; border-radius: 18px; background: rgba(246,238,228,.7); color: #6f6257; font-size: 12px; font-weight: 750; }
.cs-checkout-summary { top: 112px; gap: 14px; }
.cs-checkout-summary-card { padding: 24px; }
.cs-checkout-summary-head { align-items: center; padding-bottom: 16px; }
.cs-checkout-summary-head h2 { font-size: 30px; }
.cs-checkout-summary-edit { color: var(--cs-checkout-gold); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; text-decoration: underline; text-underline-offset: 4px; }
.cs-checkout-summary-items { max-height: 360px; overflow: auto; padding-right: 4px; }
.cs-checkout-item { grid-template-columns: 68px minmax(0,1fr) auto; }
.cs-checkout-item img { width: 68px; height: 78px; border-radius: 18px; background: #f2eadf; }
.cs-checkout-item strong { font-size: 12px; }
.cs-checkout-totals { margin-top: 8px; }
.cs-checkout-total-row { padding: 10px 0; }
.cs-checkout-total-row.is-total { font-family: var(--cs-checkout-sans); font-size: 16px; font-weight: 950; }
.cs-checkout-total-row.is-total strong { font-size: 24px; font-weight: 950; letter-spacing: -.02em; }
.cs-checkout-discount { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--cs-checkout-warm-line); }
.cs-checkout-discount-row { grid-template-columns: minmax(0,1fr) auto; }
.cs-checkout-discount-row .cs-checkout-secondary { min-width: 96px; }
.cs-checkout-coupon-clear { grid-column: 1 / -1; justify-self: start; border: 0; background: transparent; color: var(--cs-checkout-danger); font-size: 12px; font-weight: 900; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.cs-checkout-coupon-hint,
.cs-checkout-coupon-applied { margin: 0; color: #74675d; font-size: 12px; line-height: 1.5; }
.cs-checkout-coupon-applied { color: var(--cs-checkout-ok); font-weight: 800; }
.cs-checkout-primary { min-height: 60px; border-radius: 999px; font-family: var(--cs-checkout-sans); font-size: 14px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.cs-checkout-secondary,
.cs-checkout-pill-btn { min-height: 44px; border-radius: 999px; }
.cs-checkout-mini-trust { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin-top: 16px; }
.cs-checkout-mini-trust span { display: grid; justify-items: center; gap: 4px; min-height: 66px; padding: 10px 6px; border: 1px solid var(--cs-checkout-warm-line); border-radius: 16px; background: rgba(255,255,255,.62); color: #554a42; font-size: 10px; font-weight: 850; line-height: 1.25; text-align: center; }
.cs-checkout-mini-trust .cs-checkout-icon { width: 16px; height: 16px; }
.cs-checkout-review-list--compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cs-checkout-review-card { border-radius: 22px; background: rgba(255,255,255,.68); }
.cs-checkout-review-card--summary p strong { color: #15110d; }
.cs-checkout-success { border-radius: 34px; }
.cs-checkout-trust-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); border-radius: 26px; }
.cs-checkout-trust-item { min-height: 74px; padding: 18px; }
.cs-checkout-trust-icon { border-radius: 16px; }
body.checkout-premium-page .bottom-nav { z-index: 42; }
@media (max-width: 1080px) {
  .cs-checkout-grid { grid-template-columns: 1fr; }
  .cs-checkout-summary { position: static; }
  .cs-checkout-summary-items { max-height: none; }
}
@media (max-width: 760px) {
  .cs-checkout-shell { width: min(100% - 28px, 1180px); padding: 30px 0 62px; }
  .cs-checkout-topline { gap: 14px; margin-bottom: 20px; }
  .cs-checkout-title h1 { font-size: 42px; }
  .cs-checkout-stepper { grid-template-columns: repeat(4, minmax(64px, 1fr)); padding: 10px; gap: 4px; overflow-x: auto; }
  .cs-checkout-step { min-width: 70px; min-height: 62px; }
  .cs-checkout-step::before { display: none; }
  .cs-checkout-step span { width: 32px; height: 32px; }
  .cs-checkout-step small { display: none; }
  .cs-checkout-card, .cs-checkout-summary-card { padding: 20px; border-radius: 24px; }
  .cs-checkout-card-head { display: grid; gap: 12px; align-items: start; }
  .cs-checkout-badge { width: max-content; }
  .cs-checkout-payment-option { grid-template-columns: 40px minmax(0, 1fr); }
  .cs-checkout-payment-option em { grid-column: 2; }
  .cs-checkout-payment-icon { width: 40px; height: 40px; }
  .cs-checkout-review-list--compact { grid-template-columns: 1fr; }
  .cs-checkout-discount-row { grid-template-columns: 1fr; }
  .cs-checkout-mini-trust { grid-template-columns: 1fr; }
  .cs-checkout-mini-trust span { min-height: 48px; grid-template-columns: 20px 1fr; justify-items: start; text-align: left; }
  .cs-checkout-trust-strip { grid-template-columns: 1fr; }
  .cs-checkout-summary-toggle { display: flex; border-radius: 999px; }
  .cs-checkout-summary.is-collapsed .cs-checkout-summary-card:first-of-type { display: block; }
}
@media (max-width: 430px) {
  .cs-checkout-title h1 { font-size: 38px; }
  .cs-checkout-secure { white-space: normal; }
  .cs-checkout-summary-head { display: grid; align-items: start; }
  .cs-checkout-item { grid-template-columns: 58px minmax(0,1fr); align-items: start; }
  .cs-checkout-item img { width: 58px; height: 68px; }
  .cs-checkout-item b { grid-column: 2; justify-self: start; }
}
'''
css = css_path.read_text()
if 'checkout professional hotfix v6' not in css:
    css += css_append
css_path.write_text(css)
