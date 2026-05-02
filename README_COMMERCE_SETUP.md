# Cosmoskin canlı e-commerce kurulum

## 1) Supabase

Authentication > Providers içinde Email aktif olsun.

Authentication > URL Configuration:

- Site URL: `https://www.cosmoskin.com.tr`
- Redirect URLs:
  - `https://www.cosmoskin.com.tr/auth/callback.html`
  - `https://www.cosmoskin.com.tr/auth/reset.html`
  - `http://localhost:3000/auth/callback.html`
  - `http://localhost:3000/auth/reset.html`

SQL Editor içinde önce şu dosyayı çalıştırın:

```sql
supabase/schema.sql
```

`schema.sql` artık Faz 1 commerce tablolarını da içerir:

- `orders`
- `order_items`
- `payments`
- `shipments`
- `order_status_events`
- `user_addresses`

Sadece commerce tablolarını ayrı çalıştırmak gerekirse `supabase/commerce-schema.sql` dosyası da eklendi. Normal kurulumda `schema.sql` yeterlidir.

## 2) assets/site-config.js

Bu dosyada aşağıdaki alanlar doğru olmalı:

- `supabaseUrl`
- `supabaseAnonKey`
- `apiBase: '/api'`

Anon key frontend için kullanılabilir. Service role key frontend dosyalarına koyulmamalıdır.

## 3) Cloudflare Pages environment variables

Cloudflare Pages > Settings > Environment variables içine şunları ekleyin:

- `PUBLIC_SITE_URL=https://www.cosmoskin.com.tr`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `IYZICO_API_KEY=...`
- `IYZICO_SECRET_KEY=...`
- `IYZICO_BASE_URL=https://api.iyzipay.com`
- `ADMIN_TOKEN=...`

Test modunda çalışacaksanız:

- `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com`

## 4) Faz 1 API uçları

- `POST /api/create-checkout`  
  Sepeti doğrular, siparişi `orders` tablosuna yazar, ürünleri `order_items` tablosuna yazar, iyzico checkout formunu başlatır ve payment kaydı oluşturur.

- `POST /api/iyzico-callback`  
  iyzico callback tokenını doğrular, payment kaydını günceller, siparişi `paid` veya `payment_failed` yapar, durum geçmişini `order_status_events` tablosuna yazar.

- `GET /api/get-orders`  
  Giriş yapmış müşterinin kendi siparişlerini, ürünlerini, kargo ve durum geçmişiyle döndürür.

- `GET /api/admin/orders`  
  Admin token ile siparişleri listeler. Header: `x-admin-token: ADMIN_TOKEN_DEGERI`

- `PATCH /api/admin/orders`  
  Admin token ile sipariş durumunu günceller. Header: `x-admin-token: ADMIN_TOKEN_DEGERI`

Örnek PATCH body:

```json
{
  "order_id": "ORDER_UUID",
  "status": "shipped",
  "carrier": "Yurtiçi Kargo",
  "tracking_number": "123456789",
  "tracking_url": "https://..."
}
```

## 5) Test akışı

Deploy sonrası:

1. Sepete ürün ekle.
2. Checkout formunu doldur.
3. `POST /api/create-checkout` yanıtında `ok: true` ve iyzico yönlendirme bilgisi gelmeli.
4. Supabase `orders` içinde sipariş `pending_payment` olarak görünmeli.
5. Supabase `order_items` içinde ürünler görünmeli.
6. Supabase `payments` içinde iyzico tokenı görünmeli.
7. Ödeme başarılı dönünce sipariş `paid`, `payment_status: paid`, `fulfillment_status: preparing` olmalı.
8. `shipments` içinde ilgili sipariş için `preparing` satırı oluşmalı.
9. `order_status_events` içinde ödeme durum geçmişi görünmeli.
10. Müşteri hesabında `/account/orders.html` siparişi göstermeli.

## 6) Önemli not

Bu paket Faz 1 sipariş/ödeme temelini hazırlar. Faz 2’de `/admin/orders` için görsel admin paneli, filtreler, sipariş detay ekranı ve kargo yönetim arayüzü tasarlanmalıdır.
