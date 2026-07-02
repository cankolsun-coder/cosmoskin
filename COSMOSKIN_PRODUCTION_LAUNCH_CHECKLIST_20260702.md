# COSMOSKIN Production Launch Checklist — 2026-07-02

Bu checklist production ortamında manuel olarak tamamlanmalıdır. Bu paket üzerinde production deploy, production Supabase mutation, gerçek ödeme veya gerçek müşteri/sipariş verisi oluşturulmadı.

## 1. Cloudflare Pages
- [ ] Cloudflare Pages project doğru repo/branch veya ZIP artifact ile bağlı.
- [ ] Production branch doğru seçili.
- [ ] Build komutu gerekmiyorsa static deploy ayarı net.
- [ ] `functions/api/*` Pages Functions olarak deploy ediliyor.
- [ ] `_headers` production’da uygulanıyor.
- [ ] `_redirects` production’da uygulanıyor.
- [ ] `/api/*` route’ları statik HTML fallback’e düşmüyor.
- [ ] Rollback için bir önceki deployment erişilebilir.

## 2. Domain, DNS ve SSL
- [ ] `cosmoskin.com.tr` Cloudflare Pages custom domain’e bağlı.
- [ ] `www.cosmoskin.com.tr` Cloudflare Pages custom domain’e bağlı.
- [ ] Root/www canonical kararı net: mevcut dosyalar `https://www.cosmoskin.com.tr` kullanıyor.
- [ ] HTTP → HTTPS yönlendirmesi aktif.
- [ ] SSL/TLS modu Full veya Full Strict olarak doğrulandı.
- [ ] Mixed content uyarısı yok.
- [ ] `robots.txt` production domain sitemap’ini gösteriyor.
- [ ] `sitemap.xml` Search Console’a gönderildi.

## 3. Environment variables
- [ ] `PUBLIC_SITE_URL=https://www.cosmoskin.com.tr`
- [ ] `SITE_URL=https://www.cosmoskin.com.tr`
- [ ] `SUPABASE_URL` girildi.
- [ ] `SUPABASE_ANON_KEY` girildi.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` yalnızca server/functions env tarafına girildi.
- [ ] `BREVO_API_KEY` girildi.
- [ ] `ORDER_FROM_EMAIL=siparis@cosmoskin.com.tr`
- [ ] `CONTACT_FROM_EMAIL=destek@cosmoskin.com.tr`
- [ ] `NEWSLETTER_FROM_EMAIL=newsletter@cosmoskin.com.tr`
- [ ] `ADMIN_SESSION_SECRET` production için güçlü değerle girildi.
- [ ] `ADMIN_ALLOW_LEGACY_TOKEN=false`
- [ ] `TURNSTILE_SECRET_KEY` ve `TURNSTILE_SITE_KEY` girildi, kullanılıyorsa.
- [ ] İyzico aktifse `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` production/test ayrımıyla girildi.

## 4. Supabase production
- [ ] Production Supabase project doğru.
- [ ] Migrationlar sırasıyla uygulandı.
- [ ] `20260702_routine_data_sync.sql` uygulandı.
- [ ] `payment_bank_accounts` tablosu production’da var.
- [ ] En az bir aktif ve geçerli banka hesabı var.
- [ ] `customer_skin_profiles` rutin kolonları var.
- [ ] `customer_routine_results` rutin kolonları var.
- [ ] `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory` RPC’leri var ve service role ile çalışıyor.
- [ ] Order/legal consent snapshot alanları production schema ile uyumlu.
- [ ] RLS/policy ayarları production’da doğrulandı.

## 5. Payment
- [ ] Havale/EFT aktif banka hesabı checkout’ta runtime API’den geliyor.
- [ ] Banka bilgisi kopyalama butonları çalışıyor.
- [ ] Aktif banka hesabı yoksa Havale/EFT siparişi güvenli şekilde bloklanıyor.
- [ ] Hardcoded IBAN fallback yok.
- [ ] Kart ödeme/iyzico production hazır değilse kullanıcı ölü akışa sokulmuyor.
- [ ] İyzico hazırsa success/fail callback URL’leri doğru.

## 6. Email
- [ ] Brevo sender/domain doğrulandı.
- [ ] `siparis@cosmoskin.com.tr` gönderici adresi doğrulandı.
- [ ] Sipariş e-postaları gerçek test siparişiyle staging’de alındı.
- [ ] Bank transfer e-postasında banka bilgileri runtime payload’dan geliyor.
- [ ] Banka hesabı yoksa e-postada fake IBAN basılmıyor.
- [ ] Shipment e-postası fake takip numarası basmıyor.
- [ ] Password reset e-postası Supabase auth ayarlarıyla çalışıyor.

## 7. Legal and commerce
- [ ] Ön Bilgilendirme ve Mesafeli Satış checkout’ta ayrı ve linkli.
- [ ] KVKK Aydınlatma ayrı bilgilendirme olarak duruyor.
- [ ] Pazarlama/ticari ileti izni sipariş için zorunlu değil.
- [ ] Çerez panelinde zorunlu/analitik/işlevsel/pazarlama ayrımı çalışıyor.
- [ ] Footer legal linklerinde 404 yok.
- [ ] ETBİS linki/ibaresi production’da doğru.
- [ ] Nihai yasal metinler avukat/mali müşavir tarafından kontrol edildi.

## 8. Smoke tests before launch
- [ ] Ana sayfa açılıyor.
- [ ] PLP açılıyor.
- [ ] En az 5 PDP açılıyor.
- [ ] Sepete ürün ekleniyor.
- [ ] Checkout form validation çalışıyor.
- [ ] Yasal onaysız sipariş oluşmuyor.
- [ ] Havale/EFT test siparişi staging’de çalışıyor.
- [ ] Hesabım > Siparişlerim görünümü çalışıyor.
- [ ] Akıllı Rutin wizard çalışıyor.
- [ ] PDP Routine Intelligence kartı çalışıyor.
- [ ] Mobil 390px/360px kritik akışlar taşmıyor.
- [ ] Console’da launch-blocker hata yok.

## 9. First 24 hours monitoring
- [ ] Cloudflare Functions error logları izleniyor.
- [ ] Supabase API/RLS/order insert hataları izleniyor.
- [ ] Brevo delivery/bounce logları izleniyor.
- [ ] Checkout abandonment ve ödeme hataları izleniyor.
- [ ] Bank transfer pending siparişleri düzenli kontrol ediliyor.
- [ ] Search Console coverage ve sitemap submission kontrol ediliyor.
- [ ] Rollback planı ve sorumlu kişi hazır.
