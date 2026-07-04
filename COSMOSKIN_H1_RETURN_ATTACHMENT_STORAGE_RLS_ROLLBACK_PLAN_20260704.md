# COSMOSKIN — H1 Rollback Plan — Return Attachment Storage RLS Ownership Fix

Date: 2026-07-04

General principle: **prefer restoring the previous policy text over dropping policies entirely.** Dropping all three policies without replacement would deny all customer access (fail-closed on availability) rather than the over-permissive state this fix corrects — restoring the old text is a smaller, more predictable, purely textual change.

## Scenario A — The storage policy change needs to be fully reverted

Restore the exact pre-H1 policy text (verbatim, captured live during H1 planning):

```sql
BEGIN;

DROP POLICY IF EXISTS "Customers can upload own return attachments" ON storage.objects;
DROP POLICY IF EXISTS "Customers can read own return attachments" ON storage.objects;
DROP POLICY IF EXISTS "Customers can delete own return attachments" ON storage.objects;

CREATE POLICY "Customers can upload own return attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Customers can read own return attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Customers can delete own return attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL);

COMMIT;
```

Effect: instantly and completely restores today's live (insecure) behavior — any authenticated customer can again read/insert/delete any object in the bucket. Only use this if the scoped policy is confirmed to be breaking legitimate customer uploads/views in a way that outweighs the security exposure, and only as a temporary measure while investigating.

**Given the live-data verification performed during H1 planning (100% of existing objects already conform to the assumed path shape), this rollback is expected to be a low-probability "just in case" measure, not an anticipated need.**

## Scenario B — Only the SELECT (read) policy needs reverting, upload/delete are fine

```sql
DROP POLICY IF EXISTS "Customers can read own return attachments" ON storage.objects;
CREATE POLICY "Customers can read own return attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL);
```

Re-scope again later:

```sql
DROP POLICY IF EXISTS "Customers can read own return attachments" ON storage.objects;
CREATE POLICY "Customers can read own return attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
```

(The same pattern applies independently to the upload/INSERT or delete/DELETE policy alone, by substituting the relevant policy name and command.)

## Scenario C — The `functions/api/returns.js` file_path ownership guard needs reverting

If the API-level guard is itself the problem (e.g. an unexpected false-positive rejecting legitimate uploads for a path shape this plan didn't anticipate), revert only the two added helper functions and the one guard block in `functions/api/returns.js`:

1. Remove `isSafeAttachmentPath()` and `isOwnedAttachmentPath()`.
2. Remove the `rawAttachmentPaths` / `if (rawAttachmentPaths.some(...))` guard block immediately before `const attachments = normalizeAttachments(body.attachments);`.
3. Leave everything else in the file (order lookup, eligibility, items, hygiene, attachment normalization, insert, email, CRM/event logging) exactly as-is — none of it was touched by this change.

This is a pure code revert (redeploy), independent of the SQL migration — reverting one does not require reverting the other. If both the storage policy fix and the API guard are reverted together, the live system returns to its exact pre-H1 state.

## Scenario D — Full rollback of this hotfix

Run Scenario A (SQL) and Scenario C (code) together. This returns the live database and API behavior to their exact pre-H1 state.

## What NOT to do during rollback

- Do **not** drop the `return-attachments` bucket.
- Do **not** delete any row from `storage.objects` (no file content is ever deleted by any rollback scenario above — only policy *conditions* change).
- Do **not** delete any row from `return_request_attachments` or `return_requests` — they are unaffected by this fix either way and contain production customer/audit data.
- Do **not** revert `functions/api/admin/returns.js` — it was never modified by H1; there is nothing to revert there.
- Do **not** re-widen the two updated validator scope guards (`scripts/validate-h0-live-payment-rpc-hotfix.mjs`, `scripts/validate-account-batch-3-order-cancellation.mjs`) back to zero-diff-forbidding `functions/api/returns.js` unless Scenario C is also being applied — if the code guard stays in place, those validators correctly expect `returns.js` to have a non-empty diff going forward.

## Post-rollback reconciliation

If a rollback is executed after this fix has already been live and processed real customer return-attachment activity:

1. Identify all `return_request_attachments` rows created between the fix's deploy time and the rollback time:
   ```sql
   SELECT id, return_request_id, customer_id, file_path, created_at
     FROM public.return_request_attachments
    WHERE created_at BETWEEN '<fix deploy time>' AND '<rollback time>'
    ORDER BY created_at;
   ```
2. For each, confirm `file_path` still starts with `customer/{customer_id}/` (it always should, since the guard only ever accepted paths matching that shape) — this is a sanity check, not an expected source of problems.
3. No storage object or database row needs any data correction as part of this rollback — reverting only changes future authorization behavior, not past data.
