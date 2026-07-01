# COSMOSKIN Checkout Professional Hotfix V6 — 2026-07-01

## Scope

Bu hotfix yalnızca `checkout.html` ve checkout akışına bağlı `assets/checkout-flow.css` / `assets/checkout-flow.js` kapsamındadır.

Header, kayan duyuru barı ve footer görsel tasarımı değiştirilmedi. Checkout sayfasında yalnızca mevcut checkout asset versiyonları güncellendi ve duplicate checkout-script riskleri azaltıldı.

## Tasarım hedefi

Checkout ekranı premium kozmetik e-ticaret standardına yaklaştırıldı:

- daha net checkout adımları
- daha profesyonel teslimat/fatura/ödeme kartları
- güçlü ama sade sipariş özeti
- premium sticky summary
- mobilde okunabilir ve dokunulabilir form yapısı
- sepet boş / hata / kupon / kargo / yasal onay durumları daha anlaşılır hale getirildi
- butonlar daha net CTA hiyerarşisine alındı
- ödeme yöntemi alanı kartlı ödeme / Havale-EFT ayrımıyla daha dürüst gösterildi

## Değişen dosyalar

### `checkout.html`

- `checkout-flow.css` cache versiyonu `20260701-checkout-professional-v6` olarak güncellendi.
- `checkout-flow.js` cache versiyonu `20260701-checkout-professional-v6` olarak güncellendi.
- Checkout sonunda tekrar yüklenen duplicate `site-config.js` ve duplicate `bottom-nav.js` kaldırıldı.
- `site-chrome.js` korunarak header/footer davranışı bozulmadı.
- Header/footer HTML görsel yapısı değiştirilmedi.

### `assets/checkout-flow.css`

- Checkout ekranına özel scoped profesyonel tasarım katmanı eklendi.
- Kart radius, gölge, form input, stepper, payment options, bank transfer panel, sipariş özeti ve mobil görünüm iyileştirildi.
- Header/footer CSS kurallarına müdahale edilmedi.
- Mobilde checkout summary, trust strip, payment cards ve form alanları yeniden optimize edildi.
- Bottom nav ile checkout CTA çakışma riski azaltıldı.

### `assets/checkout-flow.js`

- Stepper label ve açıklamaları profesyonelleştirildi.
- Teslimat alanında opsiyonel `Kargo Notu` eklendi ve checkout payload içinde `cargo_note` olarak gönderilecek hale getirildi.
- Teslimat, kargo, fatura, ödeme ve summary render yapıları daha düzenli HTML çıktısı üretir hale getirildi.
- Kargo ücretsiz sepet ilerleme barı checkout ve summary alanına eklendi.
- Sipariş özeti içinde “Sepeti Düzenle” yönlendirmesi eklendi.
- Kupon alanı daha net uyarı/manuel uygulama metniyle güncellendi.
- Kartlı ödeme, Havale/EFT ve banka bilgileri alanları daha profesyonel kart yapısına alındı.
- Havale/EFT notları daha açık hale getirildi.
- Ödeme sağlayıcısı/kart saklama metinleri dürüstleştirildi.
- Mobile summary toggle için `aria-expanded` durumu güncellendi.

## Fonksiyonel kontroller

- Checkout adımları: Teslimat → Ödeme → Kontrol → Tamamlandı.
- Boş sepet checkout’u engeller.
- Teslimat zorunlu alanları korunur.
- Telefon/e-posta/posta kodu doğrulaması korunur.
- Kurumsal fatura doğrulamaları korunur.
- Kartlı ödeme kapalıysa Havale/EFT önerisi korunur.
- Havale/EFT banka konfigürasyonu yoksa sipariş oluşturulmaz.
- Kupon backend validate akışı korunur.
- Checkout payload backend’e frontend total ile birlikte gider ancak backend doğrulama mantığı korunur.
- Idempotency key mantığı korunur.

## Header / Footer Koruma

- Header görsel tasarımı değiştirildi mi? Hayır.
- Kayan duyuru barı görsel tasarımı değiştirildi mi? Hayır.
- Footer görsel tasarımı değiştirildi mi? Hayır.
- Checkout içeriği, ana iskeletin altında yeniden düzenlendi.

## Testler

Çalıştırılan kontroller:

```bash
node --check assets/checkout-flow.js
python3 CSS brace balance check
python3 -m http.server 7778 --directory .
curl /checkout.html -> HTTP 200
zip -T cosmoskin_CHECKOUT_PROFESSIONAL_HOTFIX_V6_20260701.zip
```

Geçti:

- JS syntax check
- CSS brace balance
- Checkout HTML HTTP 200 static check
- Zip integrity

## Staging QA önerisi

Staging deploy sonrası şu akışlar gerçek tarayıcıda kontrol edilmeli:

1. Sepet boşken `/checkout.html`
2. Sepete ürün ekleyip checkout açma
3. Teslimat alanlarını eksik bırakıp validation kontrolü
4. Geçerli teslimat + fatura bilgileriyle ödeme adımına geçiş
5. Kartlı ödeme env yoksa doğru uyarı
6. Havale/EFT seçimi
7. Yasal onaylar eksikken ilerleme engeli
8. Yasal onaylar tamken review adımı
9. Kupon kodu: geçerli/geçersiz/deprecated senaryolar
10. Havale/EFT sipariş oluşturma
11. Mobil 390px ve 430px görünüm
12. Header/footer/kayan duyuru barı aynı kalmış mı kontrolü

## Not

Bu paket sadece checkout ekranını profesyonelleştirmek için hazırlandı. Account V5 düzeltmeleri korunmuştur.
