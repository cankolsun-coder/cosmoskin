# COSMOSKIN Legal & Commerce Readiness Audit — 2026-07-02

## Kapsam
Bu çalışma `cosmoskin-18-pdp-routine-intelligence-20260702.zip` üzerine uygulanmıştır. Amaç; yasal sayfalar, checkout onayları, KVKK/çerez izinleri, ticari elektronik ileti, ETBİS, Havale/EFT, e-posta/banka fallback güvenliği ve e-ticaret operasyon metinlerini canlıya daha hazır ve tutarlı hale getirmektir.

Bu çalışma hukuki danışmanlık değildir. Nihai yasal metinlerin, satıcı adresi/telefon gösterimi ve cayma hakkı istisnaları dahil olmak üzere avukat/mali müşavir tarafından ayrıca onaylanması gerekir.

## Bilerek dokunulmayan alanlar
- Header/footer görsel tasarımı yeniden tasarlanmadı.
- Checkout UI redesign yapılmadı; yalnızca consent/kayıt ve çerez davranışı iyileştirildi.
- PDP routine intelligence, Akıllı Rutin Merkezi, Hesabım dashboard, ürün grid ve Premium SVG Icon System bozulmadı.
- Supabase tablo drop/yeniden tasarım yapılmadı.
- Ürün, stok, yorum, INCI veya banka bilgisi fake şekilde üretilmedi.

## Yasal sayfa envanteri
Aşağıdaki kritik sayfalar dosya olarak mevcut ve validation kapsamında kontrol edildi:

- `legal/on-bilgilendirme-formu.html`
- `legal/mesafeli-satis-sozlesmesi.html`
- `legal/iade-ve-cayma-politikasi.html`
- `legal/teslimat-ve-kargo.html`
- `legal/kvkk-aydinlatma-metni.html`
- `legal/gizlilik-ve-guvenlik-politikasi.html`
- `legal/cerez-politikasi.html`
- `legal/acik-riza-metni.html`
- `legal/ticari-elektronik-ileti-izni.html`
- `legal/uyelik-sozlesmesi.html`
- `legal/cosmoskin-club-kurallari.html`
- `legal/veri-sahibi-basvuru-formu.html`

Root eski yasal URL’leri canonical `/legal/...` sayfalarına redirect edilmeye devam ediyor. Sitemap canonical legal URL’leri içeriyor.

## Uygulanan güvenli düzeltmeler

### 1. Çerez paneli genişletildi
Önceki panel yalnızca zorunlu + analitik ayrımı gösteriyordu. Panel artık şu kategorileri ayrı gösterir:

- Zorunlu çerezler
- Analitik çerezler
- İşlevsel çerezler
- Pazarlama çerezleri

`index.html` içindeki Google consent akışı ve `assets/app.js` içindeki genel çerez akışı `analytics`, `functional`, `marketing`, `essential`, `version`, `updatedAt` alanlarıyla hizalandı.

### 2. Çerez tercihleri iki storage anahtarında uyumlu tutuldu
Eski yapı iki farklı anahtar kullanıyordu:

- `cosmoskin_cookie_prefs_v1`
- `cosmoskin_consent`

Yeni akış ikisini de aynı normalize edilmiş consent objesiyle güncelliyor. Böylece ana sayfa analytics consent script’i ile genel site cookie banner script’i ayrışmıyor.

### 3. Google consent mode daha net hale getirildi
`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` durumları ayrı yönetiliyor. Pazarlama çerezleri açık değilse reklam/pazarlama consent değerleri `denied` kalır.

### 4. Legal document version standardı güncellendi
Önceki bazı akışlarda `checkout-20260622` ve `checkout-20260626` karışık kullanılıyordu. Yeni runtime standardı:

- `legal-20260702`

Güncellenen yerler:

- `assets/checkout-flow.js`
- `functions/api/create-checkout.js`
- `functions/api/_lib/legal-documents.js`
- `functions/api/newsletter/subscribe.js`
- `functions/api/auth/register.js`
- HTML `data-legal-version` markerları

### 5. Legal snapshot registry genişletildi
`functions/api/_lib/legal-documents.js` içinde legal snapshot standardı `legal-20260702` olarak hizalandı. Ayrıca Çerez Politikası ve Açık Rıza Metni registry’ye eklendi.

### 6. Havale/EFT runtime hardcoded fallback kapatıldı
`functions/api/_lib/bank-accounts.js` içinde runtime fallback banka hesabı kullanımı kaldırıldı. DB sorgusu başarısız olursa artık güvenli şekilde boş liste döner.

`functions/api/payment/bank-accounts.js` de fallback banka hesabı göstermiyor; banka hesabı okunamazsa `configured: false` döndürüyor.

`functions/api/_lib/order-email.js` içinde banka hesabı yoksa hardcoded IBAN basmak yerine güvenli uyarı bloğu gösteriliyor.

Bu, önceki “payment_bank_accounts boşsa checkout bloklansın” güvenlik kararını güçlendirir.

### 7. Telefon numarası public legal kopyalardan kaldırıldı
`0531 217 32 00` public yasal HTML kopyalarından kaldırıldı. Destek kanalı olarak `destek@cosmoskin.com.tr` kullanıldı.

Not: Bazı yasal sayfalarda satıcı adresi hâlâ yer alıyor; bu, ön bilgilendirme/sözleşme tarafında hukuki zorunluluk riski nedeniyle kaldırılmadı. Bu nokta avukat/mali müşavir kontrolü gerektirir.

### 8. İade operasyon adresi public kopyadan yumuşatıldı
İade operasyon adresi açık şekilde gösterilmek yerine, iade talebi onaylandıktan sonra DHL iade kodu ve gönderim adımlarının paylaşılacağı belirtildi.

### 9. Footer newsletter izin dili netleştirildi
Footer newsletter mikro metni “formu göndererek ticari e-posta almak için açık izin verildiği” şeklinde daha net hale getirildi. Ticari elektronik ileti izni ve KVKK linkleri korunuyor.

### 10. Validation script eklendi
Yeni script:

- `scripts/validate-legal-commerce-readiness.mjs`

Kontrol ettiği ana başlıklar:

- kritik legal sayfalar var mı?
- checkout zorunlu yasal onayları linkli mi?
- pazarlama izni zorunlu checkout şartı yapılmış mı?
- cookie kategorileri mevcut mu?
- legal redirects mevcut mu?
- hardcoded EFT fallback account runtime’da kaldı mı?
- eski COSMOSKIN Club seviye isimleri kaldı mı?
- public telefon/TCKN/placeholder/fake veri kaldı mı?
- riskli medikal iddia markerları var mı?
- legal document registry güncel mi?

## Checkout onay audit’i
Checkout tarafında zorunlu onaylar ayrı tutuluyor:

- Ön Bilgilendirme Formu
- Mesafeli Satış Sözleşmesi
- KVKK Aydınlatma Metni bilgilendirmesi

Ticari elektronik ileti izni ayrı ve zorunlu olmayan checkbox olarak kalıyor. Frontend state, API customer payload ve order metadata alanları uyumlu.

## Consent / KVKK / çerez audit’i
- Aydınlatma ve açık rıza aynı checkbox içine gömülmedi.
- Pazarlama izni siparişin zorunlu şartı yapılmadı.
- Cookie paneli zorunlu/analitik/işlevsel/pazarlama ayrımına çekildi.
- Akıllı Rutin cilt profili tıbbi teşhis gibi sunulmuyor.

## Ticari elektronik ileti audit’i
- Newsletter izni ayrı akışta yönetiliyor.
- Checkout pazarlama izni ayrı checkbox.
- Hesabım notification preferences önceki fazdaki standartları koruyor.
- İYS entegrasyonu bu fazda yapılmadı; raporda risk olarak bırakıldı.

## ETBİS audit’i
Footer ve legal trust alanlarında ETBİS bağlantısı mevcut. Link gerçek görünmektedir; canlıya almadan önce ETBİS portalında site kaydının üretim domainiyle doğrulanması önerilir.

## İade/kargo/teslimat audit’i
- 2.500 TL ücretsiz kargo metinleri korunuyor.
- Checkout shipping fee önceki test standardı olan 89 TL ile uyumlu kalıyor.
- Teslimat/kargo metinleri DHL ve 1-2 iş günü hazırlama dilini koruyor.
- İade adresi public gösterimden çıkarıldı; iade kodu/süreç dili korundu.

## Ödeme/Havale-EFT audit’i
- Runtime hardcoded banka fallback kaldırıldı.
- Aktif banka hesabı okunamazsa ödeme tarafı fail-closed davranır.
- Static ödeme sayfasındaki banka bilgileri gerçek operasyon bilgisi olarak duruyor; canlı operasyonla DB `payment_bank_accounts` birebir kontrol edilmelidir.

## COSMOSKIN Club audit’i
- Essential / Signature / Elite seviye isimleri korunuyor.
- Validation script `Select` ve `Silver` eski seviye isimlerini scoped public/runtime dosyalarda fail kriteri yapıyor.
- Puan sistemi metinleri ayrı hukuki/operasyonel kontrol gerektirir.

## Ürün/PDP medikal iddia audit’i
Validation script kamuya açık scoped dosyalarda şu riskli ifadeleri bloklar:

- tedavi eder
- akneyi geçirir / akneyi bitirir
- lekeyi yok eder / lekeyi siler
- hastalığı tespit eder
- klinik olarak kesin
- garantili sonuç
- alerji yapmaz
- yan etkisiz

PDP Routine Intelligence önceki fazdaki kozmetik öneri dilini koruyor.

## E-posta template audit’i
Transactional e-posta render helper’ında banka fallback güvenliği güçlendirildi. Banka hesabı yoksa hardcoded IBAN basılmaz; güvenli uyarı gösterilir. `email-previews/` statik önizleme dosyaları gerçek gönderim kaynağı olmadığı için değiştirilmedi.

## Footer/legal link audit’i
Footer link yapısında görsel redesign yapılmadı. Kritik legal sayfalar dosya olarak mevcut, redirect ve sitemap kontrolleri validation kapsamına alındı.

## SEO/canonical audit’i
Sitemap canonical `/legal/...` URL’leri içeriyor. Root eski yasal sayfalar `_redirects` üzerinden canonical legal sayfalara yönleniyor.

## Supabase/database consent audit’i
Bu fazda destructive DB işlemi yapılmadı. Mevcut `order_legal_consents`, `order_legal_snapshots` ve `consent_records` kayıt akışları korunarak legal version standardı hizalandı.

Geniş kapsamlı “consent ledger” veya tam çerez rıza log tablosu bu fazda yapılmadı; gerekirse ayrı migration fazı olarak planlanmalı.

## Avukat / mali müşavir kontrolü gereken alanlar
- Satıcı adresinin yasal sayfalarda gösterim kapsamı.
- Telefon numarası yerine yalnızca e-posta/KEP gösteriminin yeterliliği.
- Kozmetik ürünlerde cayma hakkı istisnası metninin nihai hukuki dili.
- Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi dinamik sepet snapshot formatı.
- İYS entegrasyonu ve ticari elektronik ileti kayıt süreçleri.
- E-fatura/e-arşiv sürecinin QNB/e-Solution entegrasyonu sonrası metinlere yansıması.

## Çalıştırılan testler

```text
node --check assets/checkout-flow.js
node --check assets/app.js
node --check assets/cosmoskin-newsletter.js
node --check assets/account-dashboard.js
node --check assets/pdp-professional.js
node --check assets/routine-data-model.js
node --check functions/api/create-checkout.js
node --check functions/api/consents.js
node --check functions/api/contact.js
node --check functions/api/brevo-sync.js
node --check functions/api/get-orders.js
node --check functions/api/account/notifications.js
node --check functions/api/account/profile.js
node --check functions/api/account/summary.js
node --check functions/api/newsletter/subscribe.js
node --check functions/api/_lib/bank-accounts.js
node --check functions/api/_lib/order-email.js
node --check functions/api/_lib/legal-documents.js
node --check functions/api/payment/bank-accounts.js
node --check functions/api/auth/register.js
node scripts/validate-cosmoskin-icons.mjs
node scripts/validate-pdp-routine-intelligence.mjs
node scripts/validate-legal-commerce-readiness.mjs
node --test tests/local-integration.test.mjs
```

Sonuç:

```text
COSMOSKIN icon validation passed: 44 SVG files checked, 19 scoped files scanned.
COSMOSKIN PDP routine intelligence validation passed: 37 product pages checked.
COSMOSKIN legal/commerce readiness validation passed: 12 legal pages, 25 scoped files checked.

tests 20
pass 20
fail 0
```

## Kalan riskler
- Nihai hukuki metinler avukat tarafından kontrol edilmedi.
- Tam çerez consent manager / server-side consent ledger ayrı faz gerektirir.
- İYS entegrasyonu yapılmadı.
- E-fatura/e-arşiv entegrasyon metinleri QNB/e-Solution bağlantısı tamamlanınca yeniden kontrol edilmeli.
- Static ödeme sayfasındaki banka bilgileri ile production Supabase `payment_bank_accounts` kayıtları canlıda birebir doğrulanmalı.

## Sıradaki faz önerisi
Sıradaki en mantıklı faz:

**Checkout + Payment + Order Email End-to-End QA**

Bu fazda gerçek sepet → checkout → Havale/EFT → e-posta → admin manuel ödeme onayı → sipariş hazırlanıyor → kargo → teslim edildi akışı uçtan uca test edilmelidir.
