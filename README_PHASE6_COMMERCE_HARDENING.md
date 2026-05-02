# COSMOSKIN Faz 6 — Commerce hardening

Bu paket mevcut kaynak zip üzerinden hazırlanmıştır. Önceki faz zipleri çalışma ortamında erişilebilir olmadığı için Faz 6 güncellemeleri erişilebilir kaynak paket üzerine uygulanmıştır.

## Eklenen sistemler

- Gerçek inventory/stok tablosu ve checkout stok kontrolü
- Kupon/kampanya doğrulama endpointi
- Admin ürün/stok yönetimi ekranı
- Admin sipariş operasyon ekranı
- Admin iade talepleri ekranı
- Hesap tarafında iade talep paneli
- Kargo takip endpointi ve shipment/event tabloları
- Fatura/e-arşiv talep altyapısı
- Sepette tamamlayıcı ürün önerileri
- Son gezilen ürünler
- Ürün karşılaştırma modülü
- Product + Breadcrumb SEO schema markup
- Anasayfa, Rutinler ve Destek sayfasında Phase 6 premium UI düzenlemeleri

## Yeni önemli sayfalar

- `/admin/products.html`
- `/admin/orders.html`
- `/admin/returns.html`
- `/admin/coupons.html`
- `/account/returns.html`

## Yeni API endpointleri

- `GET /api/inventory`
- `POST /api/coupons/validate`
- `GET/PATCH/POST /api/admin/products`
- `GET/PATCH /api/admin/orders`
- `GET/POST /api/returns`
- `GET/PATCH /api/admin/returns`
- `GET /api/shipping/track`
- `POST /api/invoices`

## Deploy öncesi SQL

Supabase SQL Editor içinde şunu çalıştır:

```sql
supabase/schema.sql
```

Sadece Faz 6 tablolarını ayrı çalıştırmak istersen:

```sql
supabase/phase6-commerce-schema.sql
```

## Gerekli environment variables

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
IYZICO_API_KEY=...
IYZICO_SECRET_KEY=...
IYZICO_BASE_URL=https://api.iyzipay.com
PUBLIC_SITE_URL=https://www.cosmoskin.com.tr
ADMIN_TOKEN=...
BREVO_API_KEY=...             # opsiyonel
EARCHIVE_PROVIDER=manual      # gerçek e-arşiv sağlayıcı bağlanınca değiştirilecek
```

## Canlı entegrasyon gerektiren açık noktalar

- Gerçek kargo entegrasyonu için Yurtiçi/MNG/Aras/Sendeo vb. sağlayıcı API bilgileri gerekir.
- Gerçek e-arşiv/e-fatura kesimi için Paraşüt, KolayBi, Logo, Mikro, Uyumsoft vb. sağlayıcı API bilgileri gerekir.
- Bu paket, ilgili tabloları ve talep/track endpointlerini hazırlar; provider secret olmadan gerçek fatura veya kargo gönderisi oluşturmaz.
- Rutin sayfasında ileride özel COSMOSKIN sabah/akşam rutin still-life görseli tasarlanırsa premium algı daha da güçlenir.
