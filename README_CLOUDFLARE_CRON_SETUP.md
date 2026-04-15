# Cloudflare Cron kurulumu

Bu repo şu an Cloudflare Pages + Functions yapısını kullanıyor. Native Cron Trigger ise ayrı bir Worker üzerinde çalışacak şekilde `automation/cron-reminders` altında eklendi.

## Neden ayrı Worker?

Pages Functions ile sitenin API katmanı ayrı kalırken, zamanlanmış işler için bağımsız Worker deploy etmek daha temiz ve güvenlidir.

## Kurulum sırası

1. `automation/cron-reminders/wrangler.jsonc` dosyasını kontrol et
2. Aşağıdaki secret ve variable'ları Worker'a ekle:
   - BREVO_API_KEY
   - CONTACT_FROM_EMAIL
   - SUPABASE_SERVICE_ROLE_KEY
   - REMINDER_CRON_SECRET
   - SUPABASE_URL
   - PUBLIC_SITE_URL
   - CONTACT_TO_EMAIL
3. `npx wrangler deploy` ile worker'ı deploy et
4. Cloudflare dashboard içinde Worker > Settings > Triggers kısmında cron'un göründüğünü doğrula
5. `POST /run?secret=...` ile manuel test yap

## Önerilen cron

- `0 8 * * *` → günlük sabah toplu kontrol

## Notlar

- Worker günlük taramada sadece metadata içinde reminder tercihi açık kullanıcıları işler.
- Aynı kullanıcının aynı tipte e-postayı her gün tekrar almaması için `lastRoutineSentAt` ve `lastRestockSentAt` alanları auth user metadata içine yazılır.
- Batch sınırı için `CRON_BATCH_LIMIT` kullanılabilir.
