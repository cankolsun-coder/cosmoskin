COSMOSKIN Activity Event System Patch

Bu patch mevcut dosyaları bozmadan activity/event sistemini ekler.

İçerik:
- database/activity-event-system.sql
- functions/api/_lib/activity.js
- functions/api/activity/create/index.js

Kurulum:
1. Zip içeriğini proje köküne kopyala.
2. Supabase SQL Editor'da şunu çalıştır:
   database/activity-event-system.sql
3. Deploy et.
4. Test:
   GET  /api/activity
   GET  /api/notifications
   POST /api/activity/create

Bu SQL güvenli olacak şekilde yazıldı:
- Var olan tabloları silmez.
- account_activity yoksa oluşturur.
- orders / routine_completions / points_transactions / personal_offers gibi tablolar varsa trigger bağlar.
- Bu tablolar yoksa hata vermez, deploy'u bozmaz.

Not:
Triggerlar tablo isimlerini güvenli şekilde kontrol eder. Eğer senin tabloların farklı isimdeyse endpointlerden helper fonksiyonla activity oluşturulabilir:
functions/api/_lib/activity.js
