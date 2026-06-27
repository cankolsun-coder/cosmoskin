# COSMOSKIN Phase 2 — Admin Sipariş Yönetimi

Bu faz, Phase 1 sipariş/ödeme temelinin üzerine admin operasyon panelini ekler.

## Yeni dosyalar

- `admin/orders/index.html` — Sipariş yönetim paneli
- `admin/orders.html` — `/admin/orders/` adresine yönlendirme
- `assets/admin-orders.css` — Admin sipariş paneli stilleri
- `assets/admin-orders.js` — Admin sipariş paneli frontend mantığı
- `functions/api/_lib/order-email.js` — Sipariş durum e-postası helper'ı

## Güncellenen dosya

- `functions/api/admin/orders.js`

## Admin panel adresi

```text
https://www.cosmoskin.com.tr/admin/orders/
```

Panel, Cloudflare Pages environment variable olarak tanımlanan `ADMIN_TOKEN` değerini yalnızca `/api/admin/session` üzerinden kısa ömürlü imzalı admin session’a çevirerek giriş yapar. Sayfalar arası geçişte tekrar token istenmez.

## API

### Siparişleri listele

```http
GET /api/admin/orders
x-admin-token: SIGNED_ADMIN_SESSION_TOKEN
```

Desteklenen query parametreleri:

```text
status=pending_payment|paid|preparing|shipped|delivered|cancelled|payment_failed|refunded|partially_refunded
email=musteri@email.com
order_number=CS-...
limit=30
offset=0
```

### Sipariş durumunu güncelle

```http
PATCH /api/admin/orders
x-admin-token: SIGNED_ADMIN_SESSION_TOKEN
content-type: application/json
```

Örnek body:

```json
{
  "order_id": "ORDER_UUID",
  "status": "shipped",
  "carrier": "Yurtiçi Kargo",
  "tracking_number": "123456789",
  "tracking_url": "https://...",
  "message": "Siparişiniz kargoya teslim edildi.",
  "notify_customer": true
}
```

## Müşteri e-postası

`notify_customer: true` seçilirse Brevo Transactional Email üzerinden durum e-postası gönderilir.

Gerekli env:

```text
BREVO_API_KEY=...
CONTACT_FROM_EMAIL=destek@cosmoskin.com.tr
BREVO_SENDER_NAME=COSMOSKIN
PUBLIC_SITE_URL=https://www.cosmoskin.com.tr
```

`BREVO_API_KEY` yoksa sipariş güncellenir, yalnızca e-posta gönderimi atlanır.

## Kontrol listesi

- `ADMIN_TOKEN`, `ADMIN_SESSION_SECRET` ve `ADMIN_ALLOW_LEGACY_TOKEN=false` Cloudflare Pages içinde tanımlı olmalı.
- Phase 1 SQL şeması Supabase SQL Editor'da çalıştırılmış olmalı.
- `/admin/orders/` paneline tek kez admin token ile giriş yapılmalı; diğer admin sayfalarında tekrar token sorulmamalı.
- Test sipariş için durum `preparing`, `shipped`, `delivered` olarak güncellenmeli.
- Kargo takip numarası girilip kaydedilmeli.
- `notify_customer` seçeneği Brevo env hazırsa test edilmeli.
