# COSMOSKIN — H1 Return Attachment Storage RLS Ownership Fix — REPORT

Date: 2026-07-04
Status: **Implemented, validated locally. Migration not yet run against the live database — see the Supabase runbook for the manual run procedure.**
Source of truth for design decisions: `COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_PLAN_20260704.md`

## 1. What was broken

Live verification (`COSMOSKIN_PREFLIGHT_LIVE_DB_VERIFICATION_20260704.md` §3, re-confirmed during H1 planning) found the `return-attachments` Supabase Storage bucket already exists, is already private, and already has three `storage.objects` RLS policies (INSERT/SELECT/DELETE, role `authenticated`) — but all three check only `auth.uid() IS NOT NULL`, with no ownership predicate. Any signed-in customer could read, delete, or overwrite any other customer's return attachment object, as long as they knew or could guess/enumerate its storage path.

Separately, `functions/api/returns.js` persisted whatever `file_path` string a client included in a return-submission request body into `return_request_attachments`, without verifying that path actually belonged to the authenticated customer.

## 2. What was fixed

### 2a. Storage RLS policy migration

New, additive-only migration: `supabase/migrations/20260704_h1_return_attachment_storage_rls.sql`.

Confirmed by live inspection before writing any SQL: the upload path convention, built client-side in `assets/account-dashboard.js` (`uploadReturnAttachments()`), is `customer/{auth.uid()}/{order_id}/{timestamp}-{index}.{ext}`, and **100% of existing live objects in the bucket already follow this exact shape** (checked directly against `storage.objects.name` and `return_request_attachments.file_path`, both bucket contents and metadata table). This means ownership can be enforced directly from the object path, with no join through `return_request_attachments`/`return_requests`, and no insert-timing problem (a `return_requests` row does not exist yet at the moment of upload).

The migration:
1. Drops exactly the three existing policies by their live names: `"Customers can upload own return attachments"`, `"Customers can read own return attachments"`, `"Customers can delete own return attachments"`.
2. Recreates all three with the **same names** (clean condition swap, not a rename) and the same commands/roles (`INSERT`/`SELECT`/`DELETE`, `authenticated`), adding:
   ```sql
   AND (storage.foldername(name))[1] = 'customer'
   AND (storage.foldername(name))[2] = auth.uid()::text
   ```
   to each policy's condition, so a customer can only insert/read/delete objects under their own `auth.uid()` folder.
3. Does not touch `storage.buckets` — the bucket stays private, same size/MIME config as today.
4. Does not add an UPDATE policy — none exists today (the app uploads with `upsert:false`, never overwrites in place), and adding one would only widen the surface with no functional benefit.
5. Does not touch `review-images` or any other bucket, table, CHECK constraint, or function.

Admin/service-role access is unaffected by design: `functions/api/admin/returns.js` signs attachment URLs via the Supabase Storage REST API using the project's service-role key (`functions/api/_lib/supabase.js`'s `createSignedStorageUrl` → `adminHeaders`), and service-role requests bypass `storage.objects` RLS entirely — no policy for the admin path is added or needed.

### 2b. Minimal file_path ownership guard in `functions/api/returns.js` (required correction)

Two small, local, pure-function helpers were added, plus one guard check in `onRequestPost`:

```46:57:functions/api/returns.js
function isSafeAttachmentPath(value) {
  if (typeof value !== 'string' || !value || value.length > 420) return false;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || value.includes(':')) return false;
  return /^[A-Za-z0-9/_.-]+$/.test(value);
}
// Mirrors the storage RLS ownership predicate (customer/{auth.uid()}/...) so a
// client-supplied file_path can never be persisted against another customer's
// object, even though the upload path itself is otherwise client-constructed.
function isOwnedAttachmentPath(value, userId) {
  return Boolean(userId) && isSafeAttachmentPath(value) && value.startsWith(`customer/${userId}/`);
}
```

```164:170:functions/api/returns.js
    const rawAttachmentPaths = (Array.isArray(body.attachments) ? body.attachments : [])
      .map((file) => String(file?.file_path || file?.path || '').trim())
      .filter(Boolean);
    if (rawAttachmentPaths.some((filePath) => !isOwnedAttachmentPath(filePath, user.id))) {
      return json({ok:false,error:'Ek dosyalardan biri bu hesaba ait değil veya geçersiz bir dosya yolu içeriyor. Lütfen dosyaları yeniden yükleyip tekrar deneyin.'},{status:403});
    }
```

Behavior:
- **Accepts only** paths starting with `customer/{auth.uid()}/` — the same convention the client already uses and the same predicate the new storage policy enforces, so a legitimate customer's own upload always passes.
- **Rejects** any path that does not start with the caller's own `customer/{auth.uid()}/` prefix, including a path belonging to another customer.
- **Rejects path traversal/malformed paths**: `..`, backslashes, null bytes, a leading `/`, a `:` (drive-letter/URI-scheme style injection), and anything outside a conservative `[A-Za-z0-9/_.-]` character set are all rejected by `isSafeAttachmentPath`.
- **Rejects the entire return-request submission** (HTTP 403, `{ok:false,error:'...'}`) if *any* supplied attachment fails the check — fail-closed, rather than silently dropping the bad entry and letting the request otherwise succeed with an incomplete/misleading attachment list.
- **Never exposes a raw Supabase/storage error**: the check is a pure, local string comparison — it makes no network call, so there is no provider error to leak. The friendly Turkish message is static, not derived from any caught exception.
- **Does not break existing valid uploads**: confirmed live that every existing attachment's path already matches `customer/{auth.uid()}/...` for its own uploader, and the guard only rejects paths that do *not* start with the caller's own prefix — a legitimate customer's own upload flow (`account-dashboard.js`, unmodified) is unaffected.

## 3. Idempotency / re-run safety

- The migration wraps its three `DROP POLICY IF EXISTS` / `CREATE POLICY` pairs in a single `BEGIN…COMMIT`, and is safe to re-run (dropping-then-recreating the same policy name is a no-op if already applied identically).
- The `returns.js` guard is a pure function with no side effects beyond its own request/response — safe under any number of retries.

## 4. Scope confirmation

Nothing outside the storage migration, the `returns.js` guard, the new validator, and the four root-level `COSMOSKIN_H1_*` docs was created or modified for functional purposes. Two existing validator scripts' scope guards were updated (not their assertions about H0/Batch 3's own behavior) because they had previously (correctly, at the time) treated `functions/api/returns.js` as zero-diff-forbidden — see §5.

Confirmed untouched: checkout (`checkout.html`, `assets/checkout.js`, `functions/api/create-checkout.js`), payment RPCs (`functions/api/iyzico-callback.js`, `functions/api/cron/release-expired-inventory.js`), all three H0/H0b/H0c migration files, the loyalty ledger (`functions/api/_lib/loyalty-ledger.js`), order cancellation (`functions/api/_lib/order-cancellation.js`, `functions/api/account/orders/[id]/cancel.js`), coupons (`functions/api/_lib/coupons.js`), account UI design (`assets/account-premium.css`, `assets/account-dashboard.js`), admin RBAC (`functions/api/_lib/admin.js`, `functions/api/_lib/admin-audit.js`), `functions/api/admin/returns.js`, and every other storage bucket (`review-images`, untouched).

## 5. Required updates to two pre-existing validator scope guards

Both `scripts/validate-h0-live-payment-rpc-hotfix.mjs` and `scripts/validate-account-batch-3-order-cancellation.mjs` previously asserted `functions/api/returns.js` must have **zero diff** — a guard written when returns.js genuinely was out of scope for H0 and Batch 3. This request's required correction explicitly puts a minimal, scoped change to that exact file in H1's scope, so leaving the old zero-diff guards in place would make H1 permanently unable to pass its own required test list (H0 and Batch 3 validators are both on the required run list).

Resolution, matching the precedent already established in `validate-account-batch-3-order-cancellation.mjs` for `functions/api/iyzico-callback.js`/`admin/**` at Batch 4 (documented in-file: "no longer zero-diff-forbidden as of Batch 4... this validator now asserts the underlying behavioral invariants stayed intact instead of requiring zero diff"):

- **`scripts/validate-h0-live-payment-rpc-hotfix.mjs`**: removed `functions/api/returns.js` from its `forbiddenPaths` zero-diff list (added a comment documenting why/when). `functions/api/admin/returns.js` remains in that list unchanged, since H1 does not touch it. Also widened the pre-existing `storageOrRlsTouched` filename-pattern guard (which would otherwise false-positive on the new H1 migration/validator filenames, since they contain the words "storage"/"rls") to explicitly recognize the known H1 filenames as legitimate, separately-validated changes, while still catching any *other* unexpected RLS/storage/RBAC-named file.
- **`scripts/validate-account-batch-3-order-cancellation.mjs`**: removed `functions/api/returns.js` from its `forbiddenPaths` zero-diff list (added a comment documenting why/when). No replacement behavioral-invariant assertion was needed, since this validator never asserted any Batch-3-specific behavior lived inside `returns.js`'s content — it was included purely as a generic "don't touch adjacent flows" guard. The new invariants for `returns.js`'s content (ownership guard present, rejects on mismatch, no raw-error leakage, friendly Turkish copy, existing upload path unbroken) are now owned and asserted by H1's own validator, `scripts/validate-h1-return-attachment-storage-rls.mjs`.

Neither change altered any assertion about H0's or Batch 3's *own* payment/cancellation behavior — both validators still fully re-verify their original invariants, and both still passed unchanged before this correction was needed (confirmed by running them both before and after this edit).

## 6. Tests run

```
node scripts/validate-h1-return-attachment-storage-rls.mjs   → PASS
node scripts/validate-h0-live-payment-rpc-hotfix.mjs          → PASS
node scripts/validate-account-batch-1-safe-fixes.mjs          → PASS
node scripts/validate-account-batch-3-order-cancellation.mjs  → PASS
node scripts/validate-account-batch-4-loyalty-ledger.mjs      → PASS
node scripts/validate-account-ui-polish.mjs                   → PASS
node scripts/validate-production-launch-readiness.mjs         → PASS (19 critical pages, 37 product pages, 29 migrations)
node --test tests/local-integration.test.mjs                  → PASS (20/20 tests)
node --check functions/api/returns.js                         → PASS
```

All green. `scripts/validate-h1-return-attachment-storage-rls.mjs` itself chains and re-runs H0 and Batch 1/3/4/UI validators, so a single invocation of the H1 validator alone already re-verifies the entire required suite (confirmed by also running each one individually, per above).

## 7. What H1 explicitly did not do (by design)

- Did not touch checkout, payment RPCs, H0/H0b/H0c functions, the loyalty ledger, order cancellation, coupons, account UI design, or the admin RBAC default — all confirmed untouched (§4).
- Did not modify `functions/api/admin/returns.js` — it already signs URLs correctly via service role and needed no change.
- Did not add a live Storage existence/HEAD check for uploaded objects (a heavier, network-calling verification) — the guard is deliberately a minimal, local, string-based check, per the request's "minimal" framing and the "do not expose raw Supabase/storage errors" requirement (a local check cannot leak a provider error by construction).
- Did not add an UPDATE policy to the storage migration — none exists today and none is needed.
- Did not change `storage.buckets` (public/private flag, size limit, MIME allowlist) — all already correct.
- Did not run any SQL against the live database. See the runbook for the manual execution procedure.

## 8. Next step

This fix is code-complete and fully validated locally. It must be run manually against the live Supabase project per `COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_SUPABASE_RUNBOOK_20260704.md` before the fix takes effect in production. No further batches were started.
