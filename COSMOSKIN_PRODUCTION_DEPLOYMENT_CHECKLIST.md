# COSMOSKIN Production Deployment Checklist

Generated: 2026-06-16T11:44:51+00:00

This checklist is intentionally conservative. A failed critical gate means **no real order traffic**.

## Required environment variables

Server-only secrets must be configured with Cloudflare Pages secrets, never committed:

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`, `ADMIN_TOKEN`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`.

Operational variables: `PUBLIC_SITE_URL`, `SITE_URL`, `SUPABASE_TIMEOUT_MS`, `IYZICO_TIMEOUT_MS`, `ADMIN_SESSION_TTL_SECONDS`, `ADMIN_ALLOW_LEGACY_TOKEN=false`, `REQUIRE_CLOUDFLARE_ACCESS=true`, `EFT_RESERVATION_MINUTES`, `CRON_BATCH_LIMIT` and configured Brevo/email variables where those features are enabled.

Example secret command:

```bash
wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name cosmoskin
wrangler pages secret put IYZICO_SECRET_KEY --project-name cosmoskin
wrangler pages secret put ADMIN_SESSION_SECRET --project-name cosmoskin
wrangler pages secret put CRON_SECRET --project-name cosmoskin
```

## Exact deployment order

1. **Backup current production state.** Export Supabase schema/data for orders, payments, inventory, reservations, bank accounts, coupons and RLS policies. Record current Cloudflare deployment ID.
2. **Configure environment variables and secrets.** Compare Cloudflare variables with `.env.example`; keep `ADMIN_ALLOW_LEGACY_TOKEN=false` and `REQUIRE_CLOUDFLARE_ACCESS=true`.
3. **Apply Supabase migrations in order.** On an existing environment, apply only migrations not already recorded; never replay a migration blindly.
4. **Run verification SQL.** Execute `supabase/verification/20260616_prelaunch_verification.sql` and save its output.
5. **Run inventory reconciliation.** Start in check mode: `node scripts/reconcile-inventory.mjs --check`; review all missing/duplicate/negative/inconsistent rows before any seed mode.
6. **Configure one active bank account.** Insert via protected admin API or SQL with bank name, account holder, valid Turkish IBAN, `TRY`, active status and deterministic sort order. Never commit a real IBAN.
7. **Configure iyzico sandbox first.** Set sandbox base URL/key/secret and callback URL; do not switch to production before all callback gates pass.
8. **Configure protected EFT expiry cron.** Use `CRON_SECRET`; schedule `/api/cron/release-expired-eft`; verify paid orders are excluded.
9. **Configure Cloudflare Access/MFA.** Protect `/admin/*` and `/api/admin/*`; require organization identity plus MFA. Preserve only explicitly required service-token paths.
10. **Deploy Cloudflare Functions and static assets.** Deploy the validated final ZIP/repository revision as a single release.
11. **Purge required caches.** Purge HTML, JS/CSS changed files and inventory-related cache keys; inventory/checkout/payment APIs must remain `no-store`.
12. **Run post-deployment smoke tests.** Homepage, search, PDP, cart, checkout, Smart Routine, account, admin, legal and payment result pages.
13. **Run stock-one concurrency test.** Use an isolated staging slug only.
14. **Run iyzico callback tests.** Success, failure, cancelled, invalid, mismatch and duplicate callbacks.
15. **Verify reservation conversion and release.** Inspect `inventory_reservations`, `product_inventory`, `payments`, `orders` and event tables.
16. **Verify order visibility.** Confirm the same test order in admin, account and order tracking with privacy-safe errors.
17. **Rollback immediately if a release gate fails.** Disable order CTA/traffic, restore prior Cloudflare deployment and use the documented recovery procedure rather than destructive ad-hoc SQL.

## Migration order

1. `supabase/migrations/20260418_guest_checkout.sql`
2. `supabase/migrations/20260510_newsletter_subscribers.sql`
3. `supabase/migrations/20260510_operations_inventory_orders_shipments.sql`
4. `supabase/migrations/20260510_phase1_operational_safety.sql`
5. `supabase/migrations/20260511_phase2_invoice_returns_refunds.sql`
6. `supabase/migrations/20260511_phase3_compliance_crm_security.sql`
7. `supabase/migrations/20260517_checkout_bank_transfer_statuses.sql`
8. `supabase/migrations/20260616_atomic_inventory_reservation.sql`
9. `supabase/migrations/20260616_inventory_reservation_hardening.sql`
10. `supabase/migrations/20260616_payment_bank_and_callback_hardening.sql`
11. `supabase/migrations/20260616_rls_security_hardening.sql`

For the remediation delta, the critical order is:

1. `20260616_atomic_inventory_reservation.sql`
2. `20260616_inventory_reservation_hardening.sql`
3. `20260616_payment_bank_and_callback_hardening.sql`
4. `20260616_rls_security_hardening.sql`

## Verification commands

```bash
# Static and local integration
python3 /path/to/static_audit.py . --out qa/evidence/final/final-static-audit.json
python3 scripts/run-additional-quality-gates.py . qa/evidence/final/additional-quality-gates.json
node --test tests/local-integration.test.mjs

# Inventory staging checks
node scripts/reconcile-inventory.mjs --check
ALLOW_DESTRUCTIVE_TEST=true TEST_INVENTORY_SLUG=qa-stock-one-product \
  node scripts/test-inventory-concurrency.mjs

# iyzico callback fixtures (set callback URL and sandbox token only in shell)
node scripts/replay-iyzico-callback.mjs scripts/fixtures/iyzico/callback-success.template.json
node scripts/replay-iyzico-callback.mjs scripts/fixtures/iyzico/callback-failure.template.json
node scripts/replay-iyzico-callback.mjs scripts/fixtures/iyzico/callback-duplicate.template.json
node scripts/replay-iyzico-callback.mjs scripts/fixtures/iyzico/callback-invalid.template.json
```

Run `supabase/test/20260616_inventory_test_setup.sql` only in an isolated staging project. Run `supabase/verification/20260616_prelaunch_verification.sql` after migration and after every callback/concurrency scenario.

## Bank-account configuration acceptance

- Exactly one intended default account is active and sorted first.
- `public.is_valid_tr_iban(iban)` returns true.
- Currency is `TRY`; bank name and account holder are non-empty.
- `/api/payment/bank-accounts` returns `configured:true` without exposing secrets.
- Checkout and confirmation show the same normalized snapshot.
- Deactivating all accounts prevents order creation before reservation.

## iyzico acceptance

- Initialization uses sandbox credentials and hosted Checkout Form.
- No raw card number/CVV/expiry enters COSMOSKIN storage or logs.
- Callback token, order, amount, currency and basket match.
- Duplicate success callback does not deduct twice.
- Failed/cancelled callbacks release only eligible reservations.
- Success/failure pages reflect server state and display support next steps.

## Cloudflare Access, cron and cache

- Access application paths: `/admin/*`, `/api/admin/*`.
- Require MFA and approved identity domain/users; verify unauthenticated request is denied before the app.
- Cron request must include the configured secret header expected by `functions/api/cron/release-expired-eft.js`.
- `Cache-Control: no-store` is required for inventory, checkout, payment, admin and tracking responses.
- Purge static HTML/JS/CSS after deployment; do not cache callback or mutation routes.

## Rollback and recovery

1. Stop paid traffic and disable checkout CTA at the edge.
2. Roll back to the recorded Cloudflare deployment.
3. Do **not** drop new tables/functions during an incident.
4. Use `supabase/rollback/20260616_prelaunch_recovery.sql` only after reviewing the comments and current data.
5. Reconcile reservations and stock from order/payment events before reopening checkout.
6. Rotate exposed or uncertain secrets.

## Go / no-go criteria

**Go only when:** migration verification has no critical rows, reconciliation is clean, real PostgreSQL stock-one test yields one success, iyzico sandbox success/failure/duplicate callbacks pass, an active valid bank account is configured, Access/MFA and cron are active, and production smoke tests pass.

**No-go when:** any order can be created without bank details, any inventory operation falls back to read-update, stock can become negative, callback mismatch is accepted, admin paths are reachable without Access, or checkout/payment APIs are cached.
