# Cosmoskin canlı e-commerce kurulum

## 1) Supabase
- Authentication > Providers > Email etkin olsun
- Authentication > URL Configuration
  - Site URL: `https://www.cosmoskin.com.tr`
  - Redirect URLs:
    - `https://www.cosmoskin.com.tr/auth/callback.html`
    - `https://www.cosmoskin.com.tr/auth/reset.html`
    - `http://localhost:3000/auth/callback.html`
    - `http://localhost:3000/auth/reset.html`
- SQL Editor içinde `supabase/schema.sql` dosyasını çalıştırın

## 2) assets/site-config.js
Bu dosyada aşağıdaki alanları doldurun:
- `supabaseUrl`
- `supabaseAnonKey`

## 3) Netlify environment variables
Site settings > Environment variables içine şunları ekleyin:
- `PUBLIC_SITE_URL=https://www.cosmoskin.com.tr`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `IYZICO_API_KEY=...`
- `IYZICO_SECRET_KEY=...`
- `IYZICO_BASE_URL=https://api.iyzipay.com`

Test modunda çalışacaksanız `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com` kullanın.

## 4) Netlify build
Bu proje statik publish + Netlify Functions kullanır.
Deploy sonrası:
- kayıt ol
- mail doğrula
- giriş yap
- sepete ürün ekle
- checkout formunu doldur
- iyzico ödeme sayfasına yönlen

## 5) Not
Bu paket canlıya hazır iskelet içerir. Gerçek çalışması için yukarıdaki secret/key değerleri sizin hesaplarınızla girilmelidir.