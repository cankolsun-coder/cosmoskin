# COSMOSKIN Email Rendering Hotfix — 2026-06-29

## Root cause

1. Transactional order emails were using the normal storefront product image URL for the Beauty of Joseon Relief Sun product:

`/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp`

Older sent emails and Gmail image proxy could keep showing the previously cached broken/cyan version because the URL did not change. Updating the image content at the same URL is not enough for Gmail because Gmail proxies and caches remote images.

2. The order payload may also contain the old product image path from cart/order data. Therefore email rendering must not blindly trust `item.image` for known-bad legacy product image URLs.

3. Gmail may show a small `...` trimmed-content control when multiple emails in the same conversation contain repeated sections. This is Gmail-side trimming, not literal template text. The template now includes a status-specific visible line and unique outbound headers to reduce Gmail conversation trimming.

## Fixes applied

- Added cache-busted email-only product image:
  - `/assets/img/email/products/beauty-of-joseon-relief-sun-spf50-email-v3.png`
- Added email image override logic in:
  - `functions/api/_lib/order-email.js`
  - `functions/api/_lib/restock-email.js`
- Added new email-safe status icons:
  - `status-truck-v2.png`
  - `status-package-v2.png`
  - `status-check-v2.png`
  - `status-bank-v2.png`
  - `status-reminder-v2.png`
  - `status-cancel-v2.png`
  - `status-delivered-v2.png`
- Changed product image rendering in order emails to use fixed email-safe square cells.
- Added `Durum güncellemesi: ...` status line to reduce Gmail trimmed-content behavior.
- Added Brevo custom headers for email type/order reference.
- Regenerated all `email-previews/*.html` files.

## Important deployment note

Old emails already delivered to Gmail will not change. Only newly sent emails after deployment will use the new image URL and new status icons.

After deployment, send fresh test emails from admin actions:
- Siparişiniz hazırlanıyor
- Siparişiniz kargoya verildi
- Siparişiniz teslim edildi
- Havale/EFT ödeme bekleniyor

Confirm the product image URL in the received Gmail email contains:

`/assets/img/email/products/beauty-of-joseon-relief-sun-spf50-email-v3.png`
