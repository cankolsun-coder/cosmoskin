COSMOSKIN Full Account + Activity Deploy Build

Bu zip, en son gönderilen canlı cosmoskin zip baz alınarak hazırlandı.

Korunanlar:
- /rutinler.html dosyasına dokunulmadı.
- Herkese açık sayfalar korunur.

Eklenen / güncellenen kullanıcıya özel sayfalar:
- /account/profile.html
- /account/orders.html
- /account/order-detail.html
- /account/routines.html
- /account/rewards.html
- /account/personal-offers.html
- /account/activity.html
- /cart.html

Eklenen backend / SQL:
- /functions/api/activity/index.js
- /functions/api/notifications/index.js
- /functions/api/notifications/mark-read.js
- /functions/api/notifications/mark-all-read.js
- /functions/api/activity/create/index.js
- /functions/api/_lib/activity.js
- /database/activity-notifications.sql
- /database/activity-event-system.sql

Supabase SQL sırası:
1. database/schema.sql (eğer daha önce çalıştırmadıysan)
2. database/rls.sql (eğer daha önce çalıştırmadıysan)
3. database/activity-notifications.sql
4. database/activity-event-system.sql

Cloudflare env kontrol:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Test URLleri:
- /account/profile.html
- /account/orders.html
- /account/routines.html
- /account/rewards.html
- /account/personal-offers.html
- /account/activity.html
- /cart.html
- /api/activity
- /api/notifications
