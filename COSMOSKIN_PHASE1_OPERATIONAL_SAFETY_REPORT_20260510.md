# COSMOSKIN Phase 1 — Operasyonel E-Ticaret Güvenliği Uygulama Raporu

Tarih: 10 Mayıs 2026  
Kapsam: Kargo mail otomasyonu, email log sistemi, sipariş yaşam döngüsü, ödeme güvenliği, stok rezervasyonu, cart/checkout stok kontrolü, admin sipariş operasyonları ve müşteri sipariş takibi.

## A) Genel Sonuç

Phase 1 kapsamında proje gerçek e-ticaret operasyon akışına daha güvenli hazırlanacak şekilde güncellendi. Mevcut Cloudflare Pages Functions, Supabase REST, Brevo ve Iyzico mimarisi korunarak minimum-riskli genişletmeler yapıldı. Tasarım dili, mevcut premium COSMOSKIN çizgisi ve admin panel görsel dili bozulmadan korundu.

Canlı provider anahtarları bu çalışma ortamında bulunmadığı için Brevo/Iyzico/Supabase canlı gönderim veya canlı ödeme doğrulaması yapılmadı. Kod yapısı ve endpoint akışları üretim env değişkenleriyle çalışacak şekilde hazırlandı; canlı doğrulama için manuel checklist aşağıdadır.

## B) Kargo Mail Otomasyonu

- Admin panelden kargo/takip bilgisi kaydedildiğinde müşteri maili varsayılan olarak gönderilecek şekilde düzenlendi.
- Admin ancak açıkça “Müşteriye e-posta gönderme” seçeneğini işaretlerse gönderim baskılanır.
- Kargo mail subject’i: `Siparişin kargoya verildi`.
- HTML ve plain-text fallback içeren premium COSMOSKIN mail şablonu eklendi.
- Mail içeriğinde sipariş numarası, kargo firması, takip numarası, takip linki ve destek e-postası yer alır.
- Brevo yapılandırması eksikse veya gönderim başarısızsa kargo bilgisi yine kaydedilir; sistem sahte başarı üretmez.
- Kullanıcıya dönen admin mesajları:
  - `Kargo bilgisi kaydedildi.`
  - `Kargo bilgisi kaydedildi ve müşteriye e-posta gönderildi.`
  - `Kargo bilgisi kaydedildi ancak e-posta gönderilemedi.`

## C) Email Log Sistemi

- `email_events` tablosu için migration eklendi.
- Yeni yardımcı dosya: `functions/api/_lib/email-events.js`.
- Mail gönderim denemeleri şu bilgilerle loglanır:
  - sipariş id
  - alıcı e-posta
  - email type
  - provider
  - status
  - subject
  - provider message id
  - hata mesajı
  - metadata
  - sent_at / created_at
- Admin sipariş detayında email geçmişi gösterilecek şekilde panel genişletildi.
- Güvenli resend kontrolleri eklendi:
  - Kargo e-postasını tekrar gönder
  - Ödeme onayını tekrar gönder
  - Sipariş onayını tekrar gönder

## D) Sipariş Yaşam Döngüsü

Desteklenen sipariş statüleri:

- pending
- confirmed
- preparing
- packed
- shipped
- delivered
- cancelled
- return_requested
- returned
- refunded

Desteklenen ödeme statüleri:

- pending
- authorized
- paid
- failed
- refunded
- partially_refunded
- cancelled

Desteklenen fulfillment statüleri:

- unfulfilled
- preparing
- packed
- shipped
- delivered
- failed
- returned

Admin sipariş paneli şu operasyonları destekleyecek şekilde güncellendi:

- ödeme paid işaretleme
- hazırlığa alma
- paketlendi işaretleme
- kargo bilgisi ekleme
- shipped/delivered işaretleme
- sipariş iptali
- admin notu ve timeline kaydı
- email geçmişi görüntüleme

Her kritik admin/payment/stock olayı `order_status_events` üzerinden kayıt altına alınır.

## E) Ödeme Güvenliği

- Checkout sırasında sipariş önce `pending` ve ödeme `pending` olarak oluşturulur.
- Iyzico ödeme formu başlatıldığında sipariş ödeme durumu `authorized` seviyesine taşınır.
- Ödeme sadece Iyzico callback içinde server-side payment detail doğrulamasından sonra `paid` olur.
- Frontend redirect tek başına ödeme başarısı kabul edilmez.
- `payment_events` migration eklendi.
- Aynı ödeme callback’i tekrar gelirse stok ikinci kez düşmez.
- Başarılı ödeme sonrası:
  - order status `confirmed`
  - payment_status `paid`
  - fulfillment_status `preparing`
  - stok rezervasyonu kalıcı stok düşümüne çevrilir
  - payment success mail denemesi loglanır
- Başarısız ödeme sonrası:
  - payment_status `failed`
  - fulfillment_status `failed`
  - aktif stok rezervasyonu serbest bırakılır
  - payment failed mail denemesi loglanır
- Gerçek Iyzico refund API entegrasyonu bu fazda fake edilmedi; ileride ayrı refund endpoint’iyle bağlanmalı.

## F) Stok ve Rezervasyon

- `inventory_reservations` tablosu için migration eklendi.
- Checkout öncesinde stok final kontrolü korunur.
- Checkout ödeme başlatılmadan önce 15 dakikalık rezervasyon oluşturulur.
- Rezervasyon sırasında `stock_reserved` artar.
- Ödeme başarılı olursa:
  - rezervasyon `converted` olur
  - `stock_on_hand` kalıcı düşer
  - `stock_reserved` azalır
  - `inventory_movements` kaydı oluşur
- Ödeme başarısız olursa:
  - rezervasyon `released` olur
  - `stock_reserved` azalır
  - hareket geçmişi yazılır
- Admin manuel stok güncellemelerinde mevcut movement audit yapısı korunur.
- Ürün 0 stoktan pozitif stoğa dönerse mevcut restock alert yolu korunur.

## G) Cart / Checkout Stok Kontrolü

- Mevcut public inventory API yapısı korunarak server-side checkout doğrulaması güçlendirildi.
- Stok yetersizse checkout ödeme akışına geçmez.
- Sepet miktarı mevcut stoktan fazlaysa hata döner.
- Kullanıcı mesajları stok durumuna göre korunur/güçlendirilir:
  - `Bu ürün şu anda stokta yok. Favorilerine ekleyerek tekrar geldiğinde haber alabilirsin.`
  - `Bu ürün için şu anda yalnızca {available_stock} adet satın alınabilir.`
  - `Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.`
- PDP inventory client yüklenmesi eksik kalan Isntree ürün sayfasına eklendi.

## H) Customer Order Tracking

- Yeni guest tracking sayfası eklendi: `/order-tracking.html`.
- Yeni API endpoint’i eklendi: `/api/order-tracking`.
- Müşteri sipariş numarası + e-posta girerek sadece kendisiyle eşleşen siparişi görüntüleyebilir.
- API adres, telefon veya başka müşteri verisi döndürmez.
- Dönen bilgiler:
  - sipariş numarası
  - order/payment/fulfillment status
  - ürünler
  - toplam tutar
  - kargo firması
  - takip numarası
  - takip linki

## I) API Endpointleri

Yeni/güncellenen endpointler:

- `GET /api/admin/orders`
- `PATCH /api/admin/orders`
- `GET /api/admin/orders/:id`
- `POST /api/admin/orders/:id/shipments`
- `POST /api/admin/orders/:id/emails`
- `POST /api/create-checkout`
- `POST /api/iyzico-callback`
- `POST /api/order-tracking`

Admin endpointleri `ADMIN_TOKEN` koruması ile çalışır. Customer/guest endpointleri başka müşterinin siparişini döndürmeyecek şekilde order number + email eşleşmesi ister.

## J) Veritabanı Migration’ları

Eklenen migration:

- `supabase/migrations/20260510_phase1_operational_safety.sql`

Kapsam:

- `email_events`
- `payment_events`
- `inventory_reservations`
- `order_status_events` genişletmeleri
- `orders` operasyon kolonları
- `shipments` kargo/takip kolonları
- `inventory_movements` reason genişletmesi
- ilgili indexler

Bu migration production Supabase üzerinde manuel olarak çalıştırılmalıdır.

## K) Değişen Dosyalar

- `admin/orders/index.html`
- `assets/account-dashboard.js`
- `assets/admin-orders.css`
- `assets/admin-orders.js`
- `assets/order-detail.js`
- `assets/order-tracking.js`
- `functions/api/_lib/email-events.js`
- `functions/api/_lib/inventory.js`
- `functions/api/_lib/order-email.js`
- `functions/api/admin/orders.js`
- `functions/api/admin/orders/[id].js`
- `functions/api/admin/orders/[id]/emails.js`
- `functions/api/admin/orders/[id]/shipments.js`
- `functions/api/create-checkout.js`
- `functions/api/iyzico-callback.js`
- `functions/api/order-tracking.js`
- `order-tracking.html`
- `products/isntree-hyaluronic-acid-watery-sun-gel.html`
- `supabase/migrations/20260510_phase1_operational_safety.sql`
- `COSMOSKIN_PHASE1_OPERATIONAL_SAFETY_REPORT_20260510.md`

## L) Environment Variables

Production için gerekli env değişkenleri:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `ORDER_FROM_EMAIL`
- `CONTACT_FROM_EMAIL`
- `NEWSLETTER_FROM_EMAIL`
- `ADMIN_TOKEN`
- `IYZICO_API_KEY`
- `IYZICO_SECRET_KEY`
- `IYZICO_BASE_URL`
- `SITE_URL`

Not: Bu ZIP içine hiçbir gerçek secret değeri eklenmedi.

## M) Testler

Çalıştırılan teknik kontroller:

- Tüm `functions`, `assets` ve `js` klasörlerindeki JS dosyaları için `node --check`: başarılı.
- `alert(` grep kontrolü: yeni uygulama kodunda alert popup kullanılmadı; sadece mevcut rapor dokümanlarında metin olarak geçti.
- Secret grep kontrolü: gerçek secret değeri bulunmadı; yalnızca env değişken adları ve dokümantasyon örnekleri mevcut.
- Placeholder key grep kontrolü: yeni secret placeholder değeri eklenmedi.
- ZIP integrity testi: teslim edilen ZIP için başarılı çalıştırıldı.

Yapısal/manuel doğrulama notları:

- Supabase/Brevo/Iyzico canlı anahtarları bu ortamda olmadığı için gerçek mail gönderimi ve gerçek ödeme callback testi yapılmadı.
- Canlı test production/staging Cloudflare env değişkenleri ve Supabase migration sonrası yapılmalıdır.

## N) Remaining Risks

- Stok rezervasyon/düşüm akışı REST tabanlıdır; yüksek trafik altında tam atomiklik için Supabase RPC veya DB transaction fonksiyonuna taşınması önerilir.
- Iyzico refund API bu fazda fake edilmedi; iade operasyonu için ayrı, provider doğrulamalı refund endpoint’i gereklidir.
- Kargo firması API entegrasyonu fake edilmedi; takip URL’i adminin girdiği bilgiye veya temel carrier mapping’e dayanır.
- Email deliverability için SPF, DKIM, DMARC ve Brevo sender verification production tarafında kontrol edilmelidir.
- Migration production veritabanında çalıştırılmadan yeni endpointlerin email_events/payment_events/reservations kısımları tam çalışmaz.

## O) Manual Production Checklist

1. Supabase üzerinde `20260510_phase1_operational_safety.sql` migration’ını çalıştır.
2. Cloudflare Pages env değişkenlerinin tamamını gir.
3. Brevo sender doğrulamasını kontrol et.
4. Iyzico test/sandbox callback URL’ini `/api/iyzico-callback` olarak doğrula.
5. Admin panelden bir test siparişine kargo bilgisi ekle.
6. Kargo bilgisi sonrası `email_events` tablosunda kayıt oluştuğunu kontrol et.
7. Brevo açıksa müşteriye kargo maili gittiğini test et.
8. Ödeme başarılı testinde stok düşümünün sadece bir kez olduğunu doğrula.
9. Aynı callback tekrar simüle edildiğinde stok tekrar düşmediğini doğrula.
10. Ödeme başarısız testinde rezervasyonun serbest bırakıldığını doğrula.
11. `/order-tracking.html` üzerinde doğru order number + email ile sipariş gösterimini test et.
12. Yanlış email ile aynı sipariş numarasının dönmediğini doğrula.
13. Mobil 360/390/430 ve desktop 1440 viewport kontrollerini canlı preview üzerinde yap.
14. Newsletter, reviews, favorites ve checkout regresyon testlerini tamamla.

## P) Suggested Commit Message

```txt
feat: harden order, payment, shipment and inventory operations
```
