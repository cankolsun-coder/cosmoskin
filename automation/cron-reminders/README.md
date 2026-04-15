# COSMOSKIN Reminder Cron Worker

Bu worker, Cloudflare Cron Trigger ile günlük çalışır ve Supabase Auth içindeki kullanıcı metadata tercihlerini okuyarak Brevo üzerinden rutin / yeniden sipariş hatırlatma e-postaları gönderir.

## Gerekli Secret / Variable

Secrets:
- BREVO_API_KEY
- CONTACT_FROM_EMAIL
- SUPABASE_SERVICE_ROLE_KEY
- REMINDER_CRON_SECRET

Plaintext variables:
- SUPABASE_URL
- PUBLIC_SITE_URL
- CONTACT_TO_EMAIL
- CRON_BATCH_LIMIT (opsiyonel, varsayılan 200)
- BREVO_SENDER_NAME (opsiyonel)

## Deploy

```bash
cd automation/cron-reminders
npx wrangler deploy
```

## Manual test

```bash
curl -X POST "https://<worker-subdomain>/run?secret=<REMINDER_CRON_SECRET>"
```

## Default schedule

`0 8 * * *` → her gün 08:00 UTC.
Türkiye saati için Cloudflare cron UTC çalıştığı için mevsime göre saati ayarlayabilirsin.
