# COSMOSKIN — H1 Supabase Runbook — Return Attachment Storage RLS Ownership Fix

Date: 2026-07-04
Audience: whoever runs this against the live Supabase project (Supabase SQL editor or `psql`).

## Before you start

- This migration only changes three `storage.objects` RLS policy *conditions* on the existing `return-attachments` bucket. It does not touch `storage.buckets`, any table, any CHECK constraint, any function, or any other bucket. No file is deleted and no row is deleted.
- It is safe to run once on production, and safe to re-run — every statement is `DROP POLICY IF EXISTS` immediately followed by `CREATE POLICY` under the same name.
- **Run the entire file as one transaction.** Paste the full contents of `supabase/migrations/20260704_h1_return_attachment_storage_rls.sql` into the SQL editor and execute it in one go (it already contains its own `BEGIN`/`COMMIT`).
- Note the current timestamp before running, in case you need to correlate with Supabase's automated backups.
- Also deploy the `functions/api/returns.js` code change (the file_path ownership guard) as part of the same release — the storage policy and the API-level guard are two independent layers protecting the same gap, and both should ship together even though only the SQL half requires a manual Supabase step.

## Step 1 — Snapshot current policy state (optional but recommended)

```sql
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual ILIKE '%return-attachments%' OR with_check ILIKE '%return-attachments%')
 ORDER BY policyname;
```

Save this output somewhere — it is the exact text needed for the rollback plan (Scenario A) if you ever need to instantly restore today's (insecure) behavior.

## Step 2 — Run the migration

Paste and run the full contents of:

```
supabase/migrations/20260704_h1_return_attachment_storage_rls.sql
```

as a single execution.

Expected result: `COMMIT` with no errors. If any statement errors, the whole transaction rolls back automatically (nothing partially applies) — re-read the error, fix, and re-run the whole file again; do not try to run the remainder of the file starting mid-way.

## Step 3 — Verify the bucket is still private and unchanged

```sql
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets WHERE id = 'return-attachments';
```

Expect: `public = false`, `file_size_limit = 10485760`, `allowed_mime_types` unchanged (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`).

## Step 4 — Verify the old broad policy condition is gone

```sql
SELECT policyname, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (
     qual = 'bucket_id = ''return-attachments''::text AND auth.uid() IS NOT NULL'
     OR with_check = 'bucket_id = ''return-attachments''::text AND auth.uid() IS NOT NULL'
   );
```

Expect: **0 rows**.

## Step 5 — Verify the new scoped policies exist for all three commands

```sql
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual ILIKE '%return-attachments%' OR with_check ILIKE '%return-attachments%')
 ORDER BY policyname;
```

Expect exactly 3 rows:
- `"Customers can upload own return attachments"` — `cmd = INSERT`, `roles = {authenticated}`
- `"Customers can read own return attachments"` — `cmd = SELECT`, `roles = {authenticated}`
- `"Customers can delete own return attachments"` — `cmd = DELETE`, `roles = {authenticated}`

Each row's `qual`/`with_check` must include **both**:
```
bucket_id = 'return-attachments'
```
**and**
```
(storage.foldername(name))[2] = (auth.uid())::text
```

## Step 6 — Verify no other bucket's policies changed

```sql
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname NOT IN (
     'Customers can upload own return attachments',
     'Customers can read own return attachments',
     'Customers can delete own return attachments'
   );
```

Expect: identical to whatever existed before this migration (as of this writing, `review-images` has 0 `storage.objects` policies — confirm it is still 0, and confirm no new/unexpected policy row appears here).

## Step 7 — Confirm no existing legitimate object became inaccessible to its own owner

```sql
SELECT
  name,
  owner,
  (storage.foldername(name))[2] AS path_owner_segment,
  (owner::text = (storage.foldername(name))[2]) AS matches
FROM storage.objects
WHERE bucket_id = 'return-attachments';
```

Every row's `matches` column should be `true`. If any row is `false`, investigate that specific object before relying on this fix in production — it means an object exists whose path doesn't match its own `owner`, which would make it inaccessible to its rightful owner under the new policy (not expected based on pre-migration live sampling, but worth confirming exhaustively, not just on a sample).

## Step 8 — Live smoke test (required before declaring this resolved)

Requires two distinct real or test customer accounts (A and B).

1. As customer A, submit a return request with at least one photo/video attachment via the account dashboard return form (a reason like "Ürün hasarlı geldi" forces an attachment). Confirm the upload succeeds and the return appears normally in customer A's own return history.
2. As customer A (still), confirm the attachment is visible/manageable as expected in the admin returns view (`/admin/returns` or equivalent), i.e. confirm the admin's signed-URL path is unaffected.
3. As customer B, using customer B's own valid access token, attempt to directly call the Supabase Storage REST endpoint for customer A's exact object path from Step 1 (e.g. `GET {SUPABASE_URL}/storage/v1/object/authenticated/return-attachments/customer/{A's uid}/{order_id}/{filename}` with `Authorization: Bearer <B's access token>` and the project's anon key header). Expect a `403`/RLS-denied response.
4. As customer B, attempt to submit a return request whose `attachments[].file_path` references customer A's real object path from Step 1. Expect the API to reject the whole submission with `{"ok":false,"error":"Ek dosyalardan biri bu hesaba ait değil veya geçersiz bir dosya yolu içeriyor. Lütfen dosyaları yeniden yükleyip tekrar deneyin."}` and HTTP `403`, and confirm no new `return_request_attachments` row referencing that path was created for customer B.
5. Confirm customer A's own subsequent return submissions (with a fresh, correctly-owned attachment) still succeed normally after Steps 3–4 — i.e. the fix did not regress the happy path.

## Step 9 — Only after Step 8 passes

Consider this fix live and resolved. No scheduler, cron, or additional infrastructure is involved in this batch.

## Notes on environments where some of this may already exist

- If a target environment's `return-attachments` bucket policies were already fixed by some other means, the `DROP POLICY IF EXISTS` + `CREATE POLICY` pair is a safe no-op re-application (same name, same final condition).
- If a target environment does not yet have the `return-attachments` bucket at all (e.g. a fresh environment), the `CREATE POLICY` statements will still succeed (a storage policy condition is just a string, not a foreign key to `storage.buckets`), but will simply never match any object until the bucket is created — in that case, provision the bucket first (see `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md` item A2 for the bucket-creation SQL, which is intentionally not part of this migration since the bucket already exists in this project's live environment).
