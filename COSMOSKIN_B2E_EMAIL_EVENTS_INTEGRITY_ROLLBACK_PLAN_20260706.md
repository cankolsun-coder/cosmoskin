# COSMOSKIN B2E — Email Events Type Integrity — Rollback Plan

**Date:** 2026-07-06  
**Batch:** B2E (JS-only audit labeling)

---

## When to rollback

- Unexpected Worker errors tied to `recordEmailEvent()` after deploy.
- Audit inserts failing at scale (unlikely — CHECK already allows the new types).
- Product decision to defer audit labeling fix.

**Note:** Email **sending** is upstream of `recordEmailEvent()`. Rolling back B2E restores old mislabeling behavior but should not stop customer emails from sending.

---

## Rollback steps

### 1. Revert application code

Revert `functions/api/_lib/email-events.js` to pre-B2E:

- Remove `bank_transfer_reminder` and `bank_transfer_not_received_cancelled` from `EMAIL_TYPES`.
- Restore prior `safeEmailType(value, fallback = 'order_created')` behavior.
- Restore prior `recordEmailEvent()` (no skip-on-unknown).

Optional: revert B2 validator section 8 guard and B2E tests/validator if fully undoing the batch.

### 2. Deploy

Redeploy Cloudflare Pages (Functions bundle). No database steps required.

### 3. Verify rollback

- Send a bank-transfer reminder → audit row will again be mislabeled as `order_created` (pre-B2E behavior).
- Run B1/B2 validators if commerce paths were untouched.

---

## Database rollback

**Not required.**

- No migration was applied.
- No live rows were updated in B2E.
- CHECK constraints unchanged.

Historical mislabeled rows created before B2E remain as-is regardless of rollback.

---

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Customer emails stop sending | Low | B2E does not modify send path; rollback same |
| Audit gap for unknown types | Low (post-B2E) | Pre-B2E silently mislabeled as `order_created` — rollback restores that |
| B1/B2 regression | None expected | B2E did not touch commerce-finalization or admin order actions |

---

## Re-apply after rollback

Re-merge B2E branch and redeploy `email-events.js` when ready. No DB prep needed.
