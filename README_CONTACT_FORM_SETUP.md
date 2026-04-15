# Contact Form Setup (Cloudflare Pages)

Bu projede contact formları Cloudflare Pages Functions üzerinden `/api/contact` endpoint'ine bağlandı.

## Gerekli Environment Variables
Cloudflare Pages > Settings > Environment Variables bölümüne şunları ekleyin:

- `BREVO_API_KEY`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`
- `PARTNERSHIP_TO_EMAIL`

## Önerilen değerler
- `CONTACT_FROM_EMAIL = newsletter@cosmoskin.com.tr`
- `CONTACT_TO_EMAIL = destek@cosmoskin.com.tr`
- `PARTNERSHIP_TO_EMAIL = partnership@cosmoskin.com.tr`

## Notlar
- `CONTACT_FROM_EMAIL` Brevo içinde doğrulanmış bir sender olmalıdır.
- Form endpoint dosyası: `functions/api/contact.js`
- Frontend submit akışı: `assets/app.js`
- Contact sayfası: `contact.html`
