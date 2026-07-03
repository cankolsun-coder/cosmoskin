# COSMOSKIN — Batch 1 Safe Functional Fixes

Use the Claude audit file as context:

```text
@docs/audits/claude-account-audit-20260703.md
```

Implement **Batch 1 only**.

Do **not** implement all audit phases.
Do **not** touch order cancellation.
Do **not** touch loyalty ledger / points earning writer.
Do **not** consolidate account CSS.
Do **not** redesign the header.
Do **not** change checkout/payment flow.
Do **not** change return request flow.
Do **not** change Smart Routine sync.
Do **not** change PDP.
Do **not** modify global footer.

---

## Batch 1 scope

### 1. Create or update project memory

Create or update:

```text
COSMOSKIN_PROJECT_MEMORY.md
```

Document:

```text
- working account flows
- current account APIs
- Supabase table dependencies
- fragile areas
- files that should not be touched casually
- validation commands
- current behavior that must be preserved
```

Add this warning:

```text
Before modifying account-dashboard.js, account-premium.css, account APIs, checkout, returns, favorites, notifications, loyalty or header-related CSS, read COSMOSKIN_PROJECT_MEMORY.md first and preserve listed working behavior.
```

---

### 2. Fix broken coupon href

If the Coupons tab has:

```text
/ödeme ekranı.html
```

replace the href with:

```text
/checkout.html
```

But customer-facing copy must say:

```text
Ödeme Ekranı
ödeme ekranında
ödeme adımı
```

Never show `Checkout` to the customer.

---

### 3. Remove customer-facing “Koşullu” from the Coupons tab

Do not use:

```text
Koşullu
KOŞULLU AVANTAJLAR
```

Preferred behavior:

```text
- Hide unavailable BIRTHDAY10 if not eligible.
- Or show a neutral non-coupon informational empty state without the word “Koşullu”.
```

Do not replace it with another confusing badge.

---

### 4. Fix WELCOME10 display logic

WELCOME10 should be active only if the customer has no successful paid/completed order.

Successful orders include:

```text
paid
payment_confirmed
processing
preparing
shipped
delivered
completed
```

These must **not** burn WELCOME10:

```text
pending
payment_pending
bank_transfer_pending
failed
cancelled
expired
```

WELCOME10 must not be auto-applied.
It is manually entered on the payment screen.

Customer-facing copy example:

```text
Yeni hesaplara özel. Uygun ilk siparişte ödeme ekranında manuel olarak kullanılabilir; kullanım koşulları sipariş sırasında doğrulanır.
```

---

### 5. Fix BIRTHDAY10 display logic

BIRTHDAY10 must not appear for every account.

Show BIRTHDAY10 as active only when:

```text
- birthday exists
- current date is inside the allowed birthday window
- coupon was not already used this year, if coupon usage data exists
```

If birthday is missing, do not show BIRTHDAY10 as an active coupon.

Do not use the `Koşullu` badge.

If the customer is not eligible, use a clean empty state or a subtle profile reminder only, without showing a copyable coupon code.

---

### 6. Fix birthday save/update logic

Required business rule:

```text
- If birthday is empty, user can add it.
- After adding it, user gets one self-service correction.
- After one correction, lock it.
- Future changes require support/admin.
```

Enforce this in backend, not only frontend.

Use or add these fields if needed:

```text
profiles.birthday
profiles.birthday_change_count
profiles.birthday_last_changed_at
profiles.birth_date_locked
```

Important correction to the Claude audit:

```text
Do not lock birthday immediately after the first save.
The user must have one correction right after first save.
```

User-facing copy example:

```text
Doğum tarihi bir kez düzeltilebilir. Sonraki değişiklikler için destek ekibiyle iletişime geçebilirsiniz.
```

Do not show raw Supabase errors.

---

### 7. Create the missing notification_preferences table

Do not add only `ALTER TABLE IF EXISTS`.

Create a real table with:

```text
notification_preferences:
- id
- user_id
- email
- order_updates
- cargo_updates
- campaign_emails
- sms_notifications
- stock_notifications
- routine_reminders
- newsletter
- created_at
- updated_at
```

Use:

```sql
CREATE TABLE IF NOT EXISTS public.notification_preferences (...)
```

Add RLS:

```text
- enable RLS
- user can select own row
- user can insert own row
- user can update own row
```

Use `auth.uid()` and/or email matching according to the existing auth pattern in the project.

Migration must be backward-compatible.
Do not drop tables.
Do not rewrite old migrations.
Create a new migration.

Suggested migration name:

```text
supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql
```

---

### 8. Fix notification preferences API

Make sure toggles persist after refresh.

Fields:

```text
order_updates
cargo_updates
campaign_emails
sms_notifications
stock_notifications
routine_reminders
newsletter
```

Rules:

```text
- notification_preferences should be the source of truth.
- Do not show raw Supabase errors to customers.
- Save response should clearly indicate success/failure.
- If a fallback is still used, it must target real existing columns only.
```

Customer-facing messages:

```text
Bildirim tercihleriniz kaydedildi.
Tercihleriniz şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.
```

---

### 9. Fix marketing_sms_opt_in fallback mismatch

If `profiles.marketing_sms_opt_in` does not exist:

```text
- either add it safely in the new migration,
- or remove the fallback usage and rely on notification_preferences.
```

Prefer the cleaner stable path:

```text
notification_preferences is the source of truth.
```

Do not keep a fallback that writes to a nonexistent column.

---

### 10. Keep existing working flows untouched

Do not change:

```text
- return request creation
- return attachments
- admin returns
- checkout/payment
- bank transfer
- Smart Routine sync
- favorites logic, unless required only for coupon count display
- PDP
- legal pages
- global header/footer
```

---

## Files likely to change

Expected:

```text
assets/account-dashboard.js
functions/api/account/profile.js
functions/api/account/notifications.js
supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql
COSMOSKIN_PROJECT_MEMORY.md
scripts/validate-account-batch-1-safe-fixes.mjs
COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_REPORT_YYYYMMDD.md
COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_CHANGED_FILES_YYYYMMDD.txt
COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_SUPABASE_NOTES_YYYYMMDD.md
```

Avoid touching:

```text
assets/account-premium.css
account/profile.html
checkout files
return files
admin files
PDP files
header/footer files
```

unless absolutely necessary.

---

## Add validation script

Create:

```text
scripts/validate-account-batch-1-safe-fixes.mjs
```

It should fail if:

```text
- customer-facing Checkout remains in account/coupon areas
- /ödeme ekranı.html remains
- Koşullu remains in account coupon render
- BIRTHDAY10 is shown unconditionally
- notification_preferences CREATE TABLE migration is missing
- birthday_change_count or birthday lock/update logic is missing
- raw Supabase schema cache error can surface to customer
- COSMOSKIN_PROJECT_MEMORY.md is missing
```

---

## Tests to run

Run:

```bash
node --check assets/account-dashboard.js
node --check functions/api/account/profile.js
node --check functions/api/account/notifications.js
node scripts/validate-account-batch-1-safe-fixes.mjs
```

Also run existing validations if present:

```bash
node scripts/validate-account-runtime-hotfix.mjs
node scripts/validate-account-experience-final-polish.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

If a script does not exist, report it. Do not fake success.

---

## Deliverables

Create:

```text
COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_REPORT_YYYYMMDD.md
COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_CHANGED_FILES_YYYYMMDD.txt
COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_SUPABASE_NOTES_YYYYMMDD.md
```

Return:

```text
- changed files
- tests run
- test results
- Supabase migration to run in production
- any risk left
```

Stop after Batch 1.
Do not continue to Batch 2.
