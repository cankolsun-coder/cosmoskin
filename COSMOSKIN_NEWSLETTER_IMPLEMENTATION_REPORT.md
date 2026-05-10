# Footer Newsletter / COSMOSKIN Journal

## 1. Newsletter form behavior

Footer newsletter forms now submit to the real backend endpoint `/api/newsletter/subscribe`. The frontend validates email format, disables the button while loading, prevents double submit, and renders inline status text with `aria-live="polite"`.

User-facing states:

- Success: `COSMOSKIN Journal’a kaydoldun. İlk notumuz e-posta kutuna geliyor.`
- Already subscribed: `Bu e-posta adresi COSMOSKIN Journal listesinde zaten kayıtlı.`
- Invalid email: `Lütfen geçerli bir e-posta adresi gir.`
- Server error: `Şu anda kaydını tamamlayamadık. Lütfen biraz sonra tekrar dene.`

The previous local-only/fake success behavior was removed from `assets/cosmoskin-newsletter.js` and `assets/mobile-redesign.js`.

## 2. API endpoint

Created Cloudflare Pages Function:

```text
functions/api/newsletter/subscribe.js
```

Route:

```text
POST /api/newsletter/subscribe
```

Expected payload:

```json
{
  "email": "customer@example.com",
  "source": "footer"
}
```

Behavior:

- Trims and lowercases email.
- Validates email format.
- Applies a basic in-memory abuse guard per IP/email.
- Checks for an existing subscriber.
- Inserts new subscribers into Supabase.
- Sends a Brevo transactional welcome email.
- Sets `welcome_sent_at` and `last_email_sent_at` only after Brevo confirms delivery request acceptance.
- Returns `already_subscribed: true` for duplicate email without inserting another row or resending the welcome email.

## 3. Subscriber database schema

Created migration:

```text
supabase/migrations/20260510_newsletter_subscribers.sql
```

Table:

```text
newsletter_subscribers
```

Fields:

- `id uuid primary key default gen_random_uuid()`
- `email text not null`
- `source text default 'footer'`
- `status text default 'subscribed'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `confirmed_at timestamptz null`
- `welcome_sent_at timestamptz null`
- `last_email_sent_at timestamptz null`

Uniqueness:

```sql
create unique index if not exists newsletter_subscribers_email_lower_unique
on public.newsletter_subscribers (lower(trim(email)));
```

RLS is enabled and no public frontend policy is created. The endpoint uses the Supabase service role key server-side.

## 4. Welcome email sender

Sender is enforced server-side:

```text
From name: COSMOSKIN Journal
From email: newsletter@cosmoskin.com.tr
```

If `BREVO_SENDER_EMAIL` is not exactly `newsletter@cosmoskin.com.tr`, the endpoint returns a server configuration error and does not fake success.

## 5. Welcome email subject

```text
COSMOSKIN Journal’a hoş geldin
```

## 6. Email template files/functions

Created helper:

```text
functions/api/_lib/newsletter-email.js
```

Function:

```js
renderNewsletterWelcomeEmail({ email, env })
```

It returns:

- `subject`
- `html`
- `text`

The HTML email is premium/minimal, cream/stone/black themed, mobile-friendly, and does not depend on heavy images. The plain-text version is included.

## 7. Brevo env requirements

Required Cloudflare environment variables / secrets:

```text
BREVO_API_KEY
BREVO_SENDER_EMAIL=newsletter@cosmoskin.com.tr
BREVO_SENDER_NAME=COSMOSKIN Journal
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`wrangler.toml` comments were updated to document the sender variables.

## 8. Duplicate subscription behavior

Duplicate email flow:

- Existing subscriber is detected by normalized lowercase email.
- No duplicate row is inserted.
- Welcome email is not resent by default.
- API returns `already_subscribed: true`.
- Frontend shows: `Bu e-posta adresi COSMOSKIN Journal listesinde zaten kayıtlı.`

## 9. Accessibility

- Desktop footer form keeps an accessible label.
- Mobile footer form now has a visible email label plus accessible `name="email"` input.
- Status text uses `aria-live="polite"`.
- No `alert()` popups are used.
- Submit button is disabled while loading.

## 10. Tests performed

Static and unit checks performed:

- `node --check assets/cosmoskin-newsletter.js`
- `node --check assets/mobile-redesign.js`
- `node --check functions/api/newsletter/subscribe.js`
- `node --check functions/api/_lib/newsletter-email.js`
- Mocked endpoint unit test for:
  - invalid email
  - valid new email signup
  - duplicate email
  - missing/misconfigured sender env
- Static scan confirmed:
  - all footer newsletter forms point to `/api/newsletter/subscribe`
  - old fake local success copy removed
  - no frontend API keys were added

Real Brevo sending was not performed because the production `BREVO_API_KEY` is not available in this environment.

Manual production test after deploying env vars:

```bash
curl -X POST https://www.cosmoskin.com.tr/api/newsletter/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","source":"footer"}'
```

## 11. Remaining risks

1. Supabase migration must be applied before production signup works.
2. Cloudflare Pages environment variables must be configured exactly as listed.
3. Brevo sender `newsletter@cosmoskin.com.tr` must be verified/authenticated in Brevo, SPF/DKIM/DMARC included.
4. A complete unsubscribe management route is not present yet. The welcome email deliberately does not include a broken unsubscribe link; it documents the absence inside the footer copy.
5. Full live email deliverability can only be verified after deploy with real Brevo credentials.
