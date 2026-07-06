# COSMOSKIN — D3A: Refund Snapshot Persistence — ROLLBACK PLAN

**Date:** 2026-07-06  
**Rollback type:** Git revert + redeploy; optional DB columns left in place

---

## 1. When to rollback

- Checkout failures after snapshot persistence
- Incorrect snapshot values written on new orders
- Refund validation blocks legitimate refunds on snapshot orders
- Admin UI regression blocking refund operations

---

## 2. Rollback steps

### Identify commit

```bash
git log --oneline -5
# Locate D3A refund snapshot persistence commit
```

### Revert application code

```bash
git revert <D3A-commit-sha> --no-edit
```

Or restore files:

```bash
git checkout <pre-D3A-sha> -- \
  functions/api/_lib/order-pricing-snapshot.js \
  functions/api/create-checkout.js \
  functions/api/admin/refunds.js \
  assets/admin-orders.js \
  scripts/validate-d3-refund-snapshot-persistence.mjs \
  tests/local-integration.test.mjs
```

Remove new helper if reverting fully:

```bash
git rm functions/api/_lib/order-pricing-snapshot.js
```

### Verify locally

```bash
node scripts/validate-d2b-refund-discount-proration.mjs
node --test tests/local-integration.test.mjs
```

Post-rollback: new orders stop writing snapshots; D2B reconstruction handles all refunds.

### Redeploy

Redeploy Cloudflare Pages from reverted branch.

### Database (optional)

Migration columns are nullable and harmless. **Recommended:** leave columns in place.

To drop columns (only if necessary):

```sql
-- Optional — not required for app rollback
ALTER TABLE public.order_items
  DROP COLUMN IF EXISTS allocated_order_discount,
  DROP COLUMN IF EXISTS paid_line_total,
  DROP COLUMN IF EXISTS paid_unit_price,
  DROP COLUMN IF EXISTS pricing_snapshot_version;
```

---

## 3. Data considerations

- Orders created under D3A retain snapshot values in DB; reverted app ignores them (D2B path).
- No backfill was run; no data migration to undo.
- Refund records created with `snapshot_backed: true` metadata remain valid audit trail.

---

## 4. Re-apply

When fix is ready:

1. Apply migration if not already applied
2. Deploy D3A branch
3. Run `node scripts/validate-d3-refund-snapshot-persistence.mjs`
