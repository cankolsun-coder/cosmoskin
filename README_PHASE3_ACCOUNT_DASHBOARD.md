# COSMOSKIN Phase 3 — Account Dashboard

Bu faz, müşteri hesap ekranını gerçek e-ticaret operasyonuna uygun hale getirir.

## Eklenen / Güncellenen Dosyalar

- `account/profile.html`
  - Inline CSS/JS kaldırıldı.
  - Gerçek hesap dashboard layout'u eklendi.
  - Genel bakış, siparişler, favoriler, adresler, cilt profili, bildirimler, güvenlik ve hesap bilgileri tek panelde toplandı.

- `account/orders.html`
  - Yeni hesap panelindeki Siparişlerim sekmesine yönlendirilir.

- `assets/account-dashboard.js`
  - Supabase oturum kontrolü.
  - `/api/account/summary` üzerinden gerçek hesap verisi.
  - Profil güncelleme.
  - Cilt profili ve iletişim tercihleri güncelleme.
  - Şifre güncelleme; min 8 karakter, büyük harf, küçük harf ve rakam kontrolü.
  - Adres ekleme/düzenleme/silme/varsayılan yapma.
  - Favorileri DB + localStorage senkronizasyonu.
  - Favoriden sepete ekleme.
  - Sipariş tekrar sepete ekleme.
  - Bildirimleri okundu yapma.

- `assets/style.css`
  - Senior UI seviyesinde yeni account dashboard stilleri.
  - Responsive desktop/tablet/mobile düzeni.

- `functions/api/account/summary.js`
  - Kullanıcı bilgisi, siparişler, sipariş ürünleri, kargo, durum geçmişi, adresler, favoriler ve bildirimleri tek response içinde döndürür.

- `functions/api/account/addresses.js`
  - `GET`, `POST`, `PATCH`, `DELETE` adres yönetimi.

- `functions/api/account/favorites.js`
  - `GET`, `POST`, `DELETE` favori yönetimi.

- `functions/api/account/notifications.js`
  - `GET`, `PATCH` bildirim yönetimi.

- `functions/api/_lib/account.js`
  - Ortak auth, ürün çözümleme ve sanitize helperları.

- `functions/api/_lib/supabase.js`
  - `deleteRows` helperı eklendi.

- `supabase/schema.sql`
  - `user_favorites` tablosu eklendi.
  - `notifications` tablosu eklendi.
  - `user_addresses.metadata` eklendi.
  - RLS policy'leri eklendi.

- `supabase/commerce-schema.sql`
  - Phase 3 tabloları ayrıca commerce kurulum dosyasına eklendi.

## Gerekli SQL

Canlı Supabase tarafında `supabase/schema.sql` yeniden çalıştırılmalı. Daha minimal kurulum istenirse `supabase/commerce-schema.sql` de Phase 3 tablolarını içerir.

## Gerekli Environment Variables

Phase 1 ve Phase 2 ile aynı:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PUBLIC_SITE_URL=https://www.cosmoskin.com.tr
ADMIN_TOKEN=...
```

## Kontrol Edilenler

- Yeni JS dosyalarında syntax kontrolü yapıldı.
- Tüm `assets` ve `functions` JS dosyalarında `node --check` çalıştırıldı.
- `account/profile.html` içinde duplicate ID yok.
- `account/profile.html` içinde inline CSS/JS ve `onclick` yok.
- Yeni profil sayfasındaki stylesheet/script referansları dosya içinde mevcut.
