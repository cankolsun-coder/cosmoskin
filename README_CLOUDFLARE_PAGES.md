Cloudflare Pages kurulum notları:
- Framework preset: None
- Build command: npm install
- Build output directory: .
- Environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - PUBLIC_SITE_URL
  - IYZICO_API_KEY (opsiyonel)
  - IYZICO_SECRET_KEY (opsiyonel)

Not: Iyzico değişkenleri ekli değilse ödeme endpoint'i 503 döner, ama site ve auth çalışır.


## Güncel not
- Bu sürüm npm bağımlılığı olmadan çalışır.
- Cloudflare Pages için **Build command boş** bırakılmalı.
- Build output directory: `.`
