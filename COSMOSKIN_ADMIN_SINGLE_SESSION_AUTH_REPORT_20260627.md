# COSMOSKIN Admin Single Session Auth Report — 2026-06-27

## Amaç
Admin panelinde token/session yönetimi tek merkeze bağlandı. Admin kullanıcısı raw `ADMIN_TOKEN` değerini yalnızca bir kez girer; frontend bu değeri sadece `/api/admin/session` endpointine gönderir ve sonrasında kısa ömürlü imzalı session token ile çalışır.

## Değiştirilen ana dosyalar
- `assets/admin-runtime.js`
  - Tek kaynak admin runtime olarak genişletildi.
  - `window.COSMOSKIN_ADMIN` API eklendi:
    - `login(rawToken)`
    - `logout()`
    - `getSessionToken()`
    - `isAuthenticated()`
    - `authFetch(url, options)`
    - `requireAuth(options)`
  - Canonical session key: `cosmoskin_admin_session_token`
  - Canonical expiry key: `cosmoskin_admin_session_expires_at`
  - Eski admin token/session key’leri temizlenir ve kullanılmaz.
  - Tek login modalı eklendi; admin sayfalarındaki eski ayrı token inputları görünmez yapılır.
  - Tüm `/api/admin/*` ve `/api/reviews/admin*` istekleri imzalı session token ile gönderilir.
  - `401/403` durumlarında oturum temizlenir ve tek login ekranı gösterilir.
  - Admin topbar’a merkezi `Çıkış Yap` aksiyonu enjekte edilir.

- `assets/admin-runtime.css`
  - Merkezi admin login modalı ve güvenli oturum UI stilleri eklendi.
  - Eski ayrı token inputları erişilebilir biçimde görsel olarak gizlenir.

- `functions/api/_lib/admin.js`
  - Signed session doğrulama için `ADMIN_SESSION_SECRET` zorunlu hale getirildi.
  - `ADMIN_TOKEN` artık session imza secret fallback’i olarak kullanılmaz.
  - Raw `ADMIN_TOKEN` yalnızca `/api/admin/session` akışında kullanılır.
  - `ADMIN_ALLOW_LEGACY_TOKEN=false` varsayılan davranışı korunur.
  - Eksik session secret durumunda güvenli konfigürasyon hatası döndürülür.

- `functions/api/admin/session.js`
  - Mevcut signed-session endpoint akışı korundu.

- `assets/admin-dashboard.js`
- `assets/admin-inventory.js`
- `assets/admin-products.js`
- `assets/admin-customers.js`
- `assets/admin-coupons.js`
- `assets/admin-phase2-console.js`
- `assets/admin-phase3.js`
- `assets/admin-orders.js`
- `assets/admin-orders-phase6.js`
- `assets/admin-returns.js`
- `admin/reviews/index.html`
  - Admin session key kullanımı `cosmoskin_admin_session_token` standardına alındı.
  - Eski raw token/localStorage anahtarları kaldırıldı veya etkisizleştirildi.
  - Eski scriptler global runtime intercept ve canonical signed session ile uyumlu hale getirildi.

## Güvenlik notları
- Gerçek admin token dosyalara yazılmadı.
- Frontend tarafına açık admin token env değişkeni kullanılmadı.
- Raw admin token frontend build içine gömülmedi.
- Raw admin token localStorage/sessionStorage’da saklanmamalıdır; runtime raw değeri sadece session exchange için kullanır.
- Cloudflare Access ayrı güvenlik katmanı olarak kalır; API auth yine signed session ile korunur.

## Gerekli Cloudflare Pages environment variables
Production ortamında şu değişkenler olmalı:

```text
ADMIN_TOKEN=<new-long-random-raw-token>
ADMIN_SESSION_SECRET=<separate-long-random-secret>
ADMIN_ALLOW_LEGACY_TOKEN=false
```

Opsiyonel:

```text
ADMIN_SESSION_TTL_SECONDS=1800
REQUIRE_CLOUDFLARE_ACCESS=true
```

> `ADMIN_TOKEN` veya `ADMIN_SESSION_SECRET` değiştirildiğinde Cloudflare Pages üzerinden redeploy / retry deployment yapılmalıdır.

## Test sonuçları
Çalıştırılan kontroller:

```text
node --check functions/api/_lib/admin.js
node --check functions/api/admin/session.js
node --check assets/admin-runtime.js
node --check assets/admin-inventory.js
node --check assets/admin-dashboard.js
node --check assets/admin-products.js
node --check assets/admin-customers.js
node --check assets/admin-coupons.js
node --check assets/admin-phase2-console.js
node --check assets/admin-phase3.js
node --check assets/admin-orders.js
node --check assets/admin-orders-phase6.js
node --check assets/admin-returns.js
```

Backend session entegrasyon testi:

```text
Valid raw ADMIN_TOKEN -> signed v1 session oluşturdu.
Signed session -> assertAdmin geçti.
ADMIN_ALLOW_LEGACY_TOKEN=false iken raw token admin endpointinde reddedildi.
ADMIN_SESSION_SECRET eksik olduğunda güvenli konfigürasyon hatası üretildi.
```

Static secret scan:

```text
eski paylaşılan raw token değeri: bulunmadı
frontend-exposed admin token env değişkeni: bulunmadı
eski admin token/session key stringleri: bulunmadı
```

## Post-deploy kontrol adımları
1. Cloudflare Pages → Settings → Variables and Secrets → Production içinde `ADMIN_TOKEN`, `ADMIN_SESSION_SECRET`, `ADMIN_ALLOW_LEGACY_TOKEN=false` değerlerini kontrol et.
2. Değişiklik sonrası Cloudflare Pages → Deployments → Retry deployment yap.
3. Tarayıcıda admin için eski session kalıntısını temizlemek gerekirse:

```js
sessionStorage.clear();
location.reload();
```

4. `/admin/` veya herhangi bir `/admin/*` sayfasını aç.
5. Cloudflare Access kodundan geç.
6. COSMOSKIN admin login modalına raw `ADMIN_TOKEN` gir.
7. Sayfa yenilendikten sonra şunları tek tek aç:
   - `/admin/index.html`
   - `/admin/orders/`
   - `/admin/inventory.html`
   - `/admin/products.html`
   - `/admin/customers.html`
   - `/admin/reviews/`
   - `/admin/coupons.html`
   - `/admin/returns.html`
   - `/admin/shipments.html`
   - `/admin/email-logs.html`
   - `/admin/invoices.html`
   - `/admin/suppliers.html`
   - `/admin/compliance.html`
   - `/admin/admin-users.html`
8. Token tekrar sorulmamalı; sayfalar aynı signed session ile çalışmalı.
9. `Çıkış Yap` sonrası admin verileri kapanmalı ve tekrar login istenmeli.

## Kapsam dışı bırakılanlar
- Site tasarımı, müşteri tarafı, checkout, sepet, ürün sayfaları ve yasal sayfalar değiştirilmedi.
- Cloudflare Access policy ayarları kod içinden değiştirilemez; panelden korunmaya devam eder.
