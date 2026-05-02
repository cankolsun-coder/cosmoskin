# COSMOSKIN Final Phase 5.1 + 5.2 + 6

Bu paket `cosmoskin_phase5_deploy_ready.zip` taban alınarak üretildi.

## Eklenenler
- Phase 5.1: review hardening, `review-images` bucket/policies, status-based moderation, verified purchase flags, rejected audit trail, image storage delete support.
- Phase 5.2: PDP rehber blokları, karşılaştırma, son gezilenler, tamamlayıcı ürün önerileri, review login/helpful UX düzeltmeleri.
- Phase 6: inventory, coupons, admin products, admin orders endpoint, shipping tracking, invoices, returns panel, SEO Product/Breadcrumb schema.

## Deploy öncesi SQL
Supabase SQL Editor’da önce `supabase/schema.sql` çalıştırılabilir. İstersen ayrı ayrı:
1. `supabase/phase51_reviews_hardening.sql`
2. `supabase/phase6-commerce-schema.sql`
3. `supabase/phase6-inventory-seed.sql`

## Gerçek provider gereken alanlar
Kargo API ve e-arşiv/e-fatura sağlayıcısı için gerçek provider credentials gerekir. Bu paket altyapıyı ve bekleyen kayıt sistemini hazırlar.
