# COSMOSKIN Account Runtime Hotfix — 2026-07-03

## Amaç
Bu hotfix, canlı testte görülen Hesabım runtime hatalarını ve account/admin iade ek dosya görünürlüğü problemlerini düzeltir. Header/footer yeniden tasarlanmadı; yalnızca Hesabım header hizası, account içerik CSS'i ve kritik API/JS akışları hedeflendi.

## Uygulanan düzeltmeler

### Favoriler UUID/slug hatası
- Hesabım > Favoriler ekranında favoriden çıkarma sırasında ürün slug'ının UUID gibi gönderilmesi engellendi.
- `functions/api/account/favorites.js` artık UUID olmayan `id` değerini ürün slug'ı olarak ele alıyor.
- Hesabım favori listesi localStorage ve Supabase kaynaklarını birleştirerek render ediyor.
- Favori sayacı aynı birleşik kaynak üzerinden hesaplanıyor.

### İade ek dosyaları
- `return_requests` kaydına `requested_attachments` ve `attachment_count` snapshot alanları yazılıyor.
- Account summary artık `return_request_items`, `return_request_attachments` ve `return_status_events` tablolarını da okuyor.
- Admin iade API'si child tablo yoksa `requested_attachments` snapshot'ını fallback olarak kullanıyor ve bu dosyalar için signed preview URL üretmeye çalışıyor.
- Eski orphan Storage dosyaları otomatik eşleşmez; yeni taleplerde attachment tablosu/snapshot üzerinden görünürlük sağlanır.

### Destek formu
- `Cannot read properties of undefined (reading 'trim')` hatası düzeltildi.
- Contact/support API artık `full_name`, `subject`, `order_number`, `order_email` alanlarını güvenli şekilde destekliyor.
- Account destek kategorisi `return_request` ile hizalandı.

### Bildirim tercihleri / COSMOSKIN Journal
- `campaign_emails` schema cache hatası için migration eklendi.
- Migration production'da henüz çalışmadıysa API teknik Supabase hatasını kullanıcıya yansıtmak yerine profil opt-in alanlarına güvenli fallback yapar.

### Hesabım tasarım ve layout polish
- Hesabım header logo/wordmark ölçüleri anasayfa header guardrail'ına yaklaştırıldı.
- Başlıklardaki otomatik focus/blue outline davranışı kaldırıldı; erişilebilir ama marka diliyle uyumlu focus state bırakıldı.
- Genel bakış, yardım kartı, favoriler kartları, sipariş özet kutuları, güvenlik satırları, Club ve kupon alanlarında overflow/üst üste binme riskleri için CSS guardrail eklendi.
- Yardım kartındaki koyu zeminde okunmayan başlık gold tonla güçlendirildi.

### Kuponlar
- Yeni hesaplar için WELCOME10 account kupon ekranında manuel kopyalanabilir avantaj olarak gösterilir.
- Gerçek kupon geçerliliği checkout/server kupon validasyonu tarafından doğrulanmaya devam eder.

### Şifre sıfırlama
- Reset redirect URL'i kullanıcının mevcut domain/origin bilgisini öncelikli kullanacak şekilde düzeltildi.
- Supabase Auth > URL Configuration içinde `https://cosmoskin.com.tr/auth/reset.html` ve `https://www.cosmoskin.com.tr/auth/reset.html` allowlist kontrolü hâlâ manuel gereklidir.

## Supabase migration
Production'da şu migration çalıştırılmalı:

```text
supabase/migrations/20260703_account_runtime_hotfixes.sql
```

Bu migration şunları ekler:
- `return_requests.requested_attachments`
- `return_requests.attachment_count`
- `return_requests.user_id`
- `return_requests.requested_items`
- `notification_preferences.campaign_emails` ve ilgili tercih kolonları
- `profiles.birthday`
- `profiles.birth_date_locked`

## Manuel production kontrolleri
1. Cloudflare deploy sonrası cache temizle.
2. Supabase migration çalıştır.
3. `return-attachments` bucket ve RLS/policy ayarlarını doğrula.
4. Yeni bir iade talebi açıp fotoğraf ekle.
5. Hesabım > İade Taleplerim'de ek dosya sayısını kontrol et.
6. Admin > İade Talepleri'nde thumbnail/signed preview kontrol et.
7. Hesabım > Favoriler'de favoriden çıkarma test et.
8. Contact/Destek formundan genel mesaj gönder.
9. COSMOSKIN Journal bildirimi kaydet.
10. Şifre sıfırlama maili için Supabase Auth SMTP ve redirect allowlist kontrol et.

## Testler
- `node --check functions/api/account/favorites.js`
- `node --check functions/api/account/support-requests.js`
- `node --check functions/api/contact.js`
- `node --check functions/api/returns.js`
- `node --check functions/api/admin/returns.js`
- `node --check functions/api/account/summary.js`
- `node --check functions/api/account/notifications.js`
- `node --check assets/account-dashboard.js`
- `node scripts/validate-account-runtime-hotfix.mjs`
- `node scripts/validate-cosmoskin-icons.mjs`
- `node scripts/validate-pdp-routine-intelligence.mjs`
- `node scripts/validate-legal-commerce-readiness.mjs`
- `node scripts/validate-checkout-payment-email-e2e.mjs`
- `node scripts/validate-production-launch-readiness.mjs`
- `node scripts/validate-customer-returns-account-pdp-polish.mjs`
- `node scripts/validate-header-ticker-parity.mjs`
- `node scripts/validate-return-attachment-persistence.mjs`
- `node --test tests/local-integration.test.mjs`

Sonuç: mevcut local integration testleri 20/20 geçti.

## Kalan riskler
- Daha önce oluşturulmuş iade kayıtlarında attachment child row veya snapshot yoksa eski dosyalar otomatik geri bağlanamaz.
- Şifre sıfırlama maili Supabase Auth SMTP/redirect ayarına bağlıdır; kod düzelse bile Supabase ayarı eksikse mail gelmez.
- WELCOME10 ekran gösterimi checkout kupon validasyonundan bağımsızdır; kuponun gerçekten uygulanması için kupon verisi/API tarafı aktif olmalıdır.
