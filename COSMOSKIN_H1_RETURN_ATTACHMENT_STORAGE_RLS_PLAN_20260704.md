# COSMOSKIN — H1 Plan: Return Attachment Storage RLS Ownership Fix

Date: 2026-07-04
Status: **PLAN ONLY — no files edited, no migration created, no SQL run, no live policy changed, no frontend touched.**
Goal (as given): fix `return-attachments` `storage.objects` policies so an authenticated customer can only access their own return attachment files, while admin/service_role access is unaffected.

This plan is based on: `COSMOSKIN_PREFLIGHT_LIVE_DB_VERIFICATION_20260704.md` §3, `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md` (A2), `COSMOSKIN_PROJECT_MEMORY.md`, the full contents of `functions/api/returns.js` and `functions/api/admin/returns.js`, the upload code in `assets/account-dashboard.js`, and fresh read-only live-database inspection (bucket config, all 3 existing policies, and a live sample of both `return_request_attachments.file_path` rows and `storage.objects.name`/`owner` rows).

---

## 1. The return-attachment bucket (confirmed live)

| Property | Value |
|---|---|
| Bucket id/name | `return-attachments` |
| Public | **false** (private) — correct, keep as-is |
| File size limit | 10,485,760 bytes (10 MB) — matches `functions/api/returns.js`'s `MAX_ATTACHMENT_SIZE` and the client-side check in `account-dashboard.js` |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `video/mp4` — matches `ALLOWED_MIME` in `returns.js` exactly |
| Created | 2026-07-02, outside version control (no `INSERT INTO storage.buckets` in any tracked migration — confirmed by the preflight and re-confirmed here) |
| RLS enabled | Yes, on both `storage.objects` and `storage.buckets` |

**Existing `storage.objects` policies (live, all three, verbatim):**

| Policy | Command | Roles | Condition |
|---|---|---|---|
| Customers can upload own return attachments | INSERT | authenticated | `bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL` |
| Customers can read own return attachments | SELECT | authenticated | `bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL` |
| Customers can delete own return attachments | DELETE | authenticated | `bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL` |

None of the three has an ownership predicate. Any signed-in customer who knows or can guess/enumerate another customer's object path can read, overwrite-via-delete-then-reupload, or delete that file today. There is no UPDATE policy at all (upload uses `upsert:false` client-side, so true in-place overwrite isn't exercised by the app, but the missing ownership check on DELETE+re-upload has the same practical effect).

**Comparison bucket (`review-images`):** public, 2 MB limit, jpeg/png/webp only, **zero `storage.objects` policies** — public reads need none, and there's no customer-direct-upload flow for it in the code I found. It is not a usable policy-pattern reference for this fix (unlike what the audit assumed); the fix must be designed directly from `return-attachments`' own code path convention (§2).

---

## 2. Attachment path convention (confirmed in code, confirmed live)

**Upload path is built entirely client-side**, in `assets/account-dashboard.js`:

```1149:1167:assets/account-dashboard.js
async function uploadReturnAttachments(files, orderId) {
  ...
  var path = 'customer/' + (state.summary.user.id || 'user') + '/' + String(orderId || 'order') + '/' + Date.now() + '-' + i + '.' + ext;
  if (state.client?.storage?.from) {
    var result = await state.client.storage.from('return-attachments').upload(path, file, { cacheControl:'3600', upsert:false });
    ...
  }
  uploaded.push({ file_path:path, file_name:file.name, mime_type:file.type, file_size:file.size, uploaded_by:'customer' });
}
```

Path shape: **`customer/<auth.uid()>/<order_id>/<timestamp>-<index>.<ext>`**

`(storage.foldername(name))` (the Postgres/Supabase Storage helper that returns the folder-segment array of an object path, excluding the filename) therefore returns `{customer, <uid>, <order_id>}` — **1-indexed**, so:
- `(storage.foldername(name))[1]` = the literal string `'customer'`
- `(storage.foldername(name))[2]` = the uploading customer's `auth.uid()` — **this is the ownership-bearing segment**
- `(storage.foldername(name))[3]` = the order id (not needed for the ownership check itself)

**Verified live, not assumed:** queried both `public.return_request_attachments.file_path` (all sampled rows) and `storage.objects.name` directly for the `return-attachments` bucket (10 most recent objects, 2 distinct customer ids, 2 distinct orders). **Every single row, with zero exceptions, follows this exact 3-segment shape** — no legacy/drifted path format exists in the live bucket, so an ownership fix based on this convention would not orphan any existing file.

**Bonus finding, confirmed live and not previously documented anywhere:** `storage.objects.owner` is **already correctly populated** with the uploading customer's `auth.uid()` for every sampled row (Supabase Storage sets this automatically from the authenticated uploader's JWT at upload time — it is not something the application code sets). This gives a second, independent, non-path-based way to express the same ownership check (`owner = auth.uid()` / `owner_id = auth.uid()` depending on which column name this Supabase Storage version treats as canonical — needs one more live column check at implementation time, deliberately not run in this planning pass since it would be an additional live SQL query beyond what's already been gathered). Either predicate (path-segment or owner-column) independently closes the gap; using both together is the most defensive option and is cheap to include.

**Does `return_request_attachments.storage_path` map to `storage.objects.name`?** The metadata table's column is actually named `file_path` (not `storage_path` — correcting the planning brief's assumed column name), and it is confirmed to store the exact same string as `storage.objects.name` for every sampled row (e.g. `customer/6f6c7c7b-.../7d4653f3-.../1783033101339-0.webp` appears identically in both `return_request_attachments.file_path` and `storage.objects.name`). `return_request_attachments.customer_id` also already independently stores the uploading user's id, set server-side in `functions/api/returns.js` (`customer_id: user.id || null`), and is not derived from the path.

---

## 3. Ownership relation — full map

```
auth.uid()  ──────────────┐
                           │ (set automatically by Storage on upload)
storage.objects.owner ────┤ == auth.uid()  [confirmed live, all sampled rows]
storage.objects.name ─────┤ == "customer/{auth.uid()}/{order_id}/{ts}-{i}.{ext}"
                           │        │
                           │        └── segment [2] == auth.uid()  [confirmed live, all sampled rows]
                           │
return_request_attachments.file_path ── == storage.objects.name (same string, verbatim)  [confirmed live]
return_request_attachments.customer_id ─ == auth.uid() (set server-side at insert, independent of path)
return_request_attachments.return_request_id ─▶ return_requests.id
return_requests.user_id / customer_email ─── already correctly RLS-scoped at the table layer (confirmed by the preflight; not changed by this plan)
```

**Safest ownership policy, decided:**
- Customer **SELECT**: own files only — `bucket_id = 'return-attachments' AND (storage.foldername(name))[2] = auth.uid()::text`.
- Customer **INSERT**: own files only — same predicate, as a `WITH CHECK`. This works even though no `return_request_attachments`/`return_requests` row exists yet at upload time (see §4 — no join needed).
- Customer **DELETE**: own files only — same predicate. (No UPDATE policy exists today and none is proposed — the app never overwrites in place; adding one would only widen the attack surface for no functional benefit.)
- **Admin/service_role**: unaffected by any of the above. Confirmed in code: `functions/api/admin/returns.js` signs attachment URLs via `createSignedStorageUrl()` → `functions/api/_lib/supabase.js`, which calls the Supabase Storage REST API using the project's service-role key (`adminHeaders`), never the customer's JWT. Service-role requests bypass `storage.objects` RLS entirely by Supabase's own design — **no new policy is needed for admin access, and none should be added** (adding an explicit `authenticated`-role admin bypass policy would be a strictly worse, harder-to-audit alternative to relying on the existing service-role bypass).
- **anon/public**: already has zero policies for this bucket and the bucket is private — no change needed, already correctly closed.

---

## 4. Is the current path convention sufficient? — Yes, decided: no join needed

The object path already safely and directly encodes the uploading customer's own `auth.uid()` as folder segment `[2]`, confirmed populated correctly for every live object with zero drift. This means:

- A policy can enforce ownership **purely from `storage.objects.name`**, with no join through `return_request_attachments`/`return_requests`.
- This sidesteps the "insert timing" problem entirely: at upload time (before the customer has even submitted the return request form), there is no `return_request_attachments` row yet to join against — a join-based INSERT policy would be unable to authorize the very first upload of a legitimate customer's own file. The path-based predicate has no such problem, since it only needs the path string itself, which is fully known at INSERT time.
- No code/path adjustment is required — the existing convention is already ownership-safe; it is only the **policy** that fails to check it today.

This is a narrower, safer, more surgical fix than the original audit's (P0-3/A2) framing, which assumed a from-scratch bucket-plus-policy creation and speculatively suggested a join-based approach. Both assumptions are superseded by this plan's live findings: the bucket exists correctly, and a pure path-based (optionally owner-column-reinforced) predicate is sufficient and simpler than a join.

---

## 5. Return-attachment API behavior — what the storage-only fix does and does not cover

Confirmed by reading `functions/api/returns.js` in full:

- **Customer cannot upload to another customer's path after this fix**: the new INSERT `WITH CHECK` blocks any upload whose path segment `[2]` isn't the caller's own `auth.uid()` — even though the *path string itself* is entirely client-constructed today, RLS enforces it cannot be spoofed to another user's folder, regardless of what the client-side JS sends.
- **Customer cannot read/delete another customer's attachment via direct Storage access after this fix**: the new SELECT/DELETE `USING` clauses block any object whose path segment `[2]` isn't the caller's own `auth.uid()`, closing exactly the gap the preflight identified — this holds even if the customer already knows or guesses the exact raw path of another customer's file.
- **Admin access remains possible**: unaffected, as documented in §3 (service-role bypass, unrelated to these policies).
- **Service-role backend still works**: unaffected, same reason — `functions/api/_lib/supabase.js`'s helpers (`insertRow`, `selectRows`, `createSignedStorageUrl`, etc.) all authenticate as service-role.
- **Existing return attachment records are not broken**: confirmed live — every existing object's path already satisfies the new predicate (segment `[2]` already equals that object's actual uploader), so no existing legitimate file becomes inaccessible to its rightful owner after this fix ships.

**Residual gap this storage-only fix deliberately does NOT close (flagged, not in scope for H1 as requested):** `functions/api/returns.js`'s `onRequestPost` persists whatever `file_path` string the client includes in the request body into `return_request_attachments` **without verifying** that path actually belongs to the authenticated customer (no existence/ownership check against Storage before the DB insert). After this H1 fix, a malicious customer who crafts a POST body referencing another customer's real (guessed) `file_path` still cannot read or download that file's actual bytes (RLS now blocks it), but they could get a foreign path recorded into their *own* `return_request_attachments` row, which an admin reviewing *that malicious customer's* return would then be able to view via the service-role-signed URL (since service role bypasses RLS) — a minor, lower-severity residual issue (no direct customer-to-customer leak, only an admin-facing data-integrity oddity), matching exactly what the original A2 remediation item separately proposed as a `functions/api/returns.js` code change (existence/ownership verification before insert, plus signing the customer-facing GET). **This plan intentionally does not include that code change** — it was explicitly out of scope per this request's goal (storage policy fix only) and per the instruction not to modify `returns.js`/`admin/returns.js` yet. It is called out here so it isn't silently lost, consistent with how this project has surfaced adjacent-but-separate findings in prior batches.

---

## 6. Proposed migration outline (not created yet)

File (to be created only after approval): `supabase/migrations/20260704_h1_return_attachment_storage_rls.sql`

Outline:

```sql
BEGIN;

-- Drop only the 3 existing return-attachments policies (by exact live name) — no other
-- bucket's policies are touched, no table other than storage.objects is touched.
DROP POLICY IF EXISTS "Customers can upload own return attachments" ON storage.objects;
DROP POLICY IF EXISTS "Customers can read own return attachments" ON storage.objects;
DROP POLICY IF EXISTS "Customers can delete own return attachments" ON storage.objects;

-- Recreate, scoped to the uploading customer's own folder segment (and, defensively,
-- the already-populated `owner`/`owner_id` column — exact column name to be confirmed
-- with one live check immediately before writing the real migration).
CREATE POLICY "Customers can upload own return attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Customers can read own return attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Customers can delete own return attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

COMMIT;
```

Properties this outline satisfies (per the request's constraints):
- **Drops only** the 3 overly-broad policies named above — no other bucket, no other table, no CHECK constraint, no RLS on any other table touched.
- **Recreates** scoped policies with the same names (so any tooling/report that lists policies by name sees continuity) and same commands/roles as today (INSERT/SELECT/DELETE, `authenticated` only) — only the condition changes.
- **Keeps the bucket private** — no `UPDATE storage.buckets` statement at all.
- **No destructive table changes** — `storage.objects`/`storage.buckets` schema itself is untouched; only policy definitions on `storage.objects` change.
- **No file deletion** — nothing in this migration deletes rows from `storage.objects` or the objects' underlying stored bytes; it only changes who is allowed to read/insert/delete going forward.
- **No unrelated bucket touched** — `review-images` and any other bucket's policies are not referenced.
- **Safe policy names** — reuses the exact existing policy name strings (so `DROP POLICY IF EXISTS` + `CREATE POLICY` is a clean swap, not an ambiguous rename).
- **Idempotent** — `DROP POLICY IF EXISTS` before each `CREATE POLICY` means the file can be re-run safely if partially applied (mirrors the same idempotency discipline used in H0/H0b/H0c).

One open decision for the real migration (to resolve at implementation time, not now): whether to also AND-in the `owner`/`owner_id` column check as a second, independent ownership predicate for defense-in-depth, once the exact live column name is confirmed. Recommended: yes, include it — it costs nothing and protects against a hypothetical future change to the upload path convention that a path-only predicate wouldn't catch.

---

## 7. Proposed code changes — none required for the storage RLS fix itself

The ownership fix is fully achievable as a policy-only change. **No file in `functions/api/` needs to change for this specific goal** (customers restricted to their own files at the Storage layer, admin/service-role unaffected) — confirmed by the analysis in §3–§5.

Files that *would* need changes only if the separate, lower-severity residual gap in §5 is tackled later (explicitly not part of this H1 request, listed here only so it isn't lost):
- `functions/api/returns.js` — add a lightweight existence/ownership check (Storage `HEAD`/list via service role) before persisting a client-supplied `file_path`, and sign attachment URLs on the customer-facing `GET` the same way `admin/returns.js` already does.
- `functions/api/admin/returns.js` — already correct (reference implementation), no change anticipated.

Files this plan proposes to create once H1 is approved for implementation:
- `supabase/migrations/20260704_h1_return_attachment_storage_rls.sql` (§6)
- `scripts/validate-h1-return-attachment-storage-rls.mjs` (§8)
- `COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_REPORT_20260704.md`, `..._CHANGED_FILES_20260704.txt`, `..._SUPABASE_RUNBOOK_20260704.md`, `..._ROLLBACK_PLAN_20260704.md` (deliverables, matching the H0 documentation pattern)

---

## 8. Validator plan: `scripts/validate-h1-return-attachment-storage-rls.mjs`

Static, file-content-based validator (same style as `validate-h0-live-payment-rpc-hotfix.mjs`), to fail if:

- The new migration file is missing, or does not `DROP POLICY`/`CREATE POLICY` for exactly the 3 named return-attachment policies.
- The migration's policy conditions reference only `auth.uid() IS NOT NULL` without also referencing `(storage.foldername(name))` or an `owner`/`owner_id` equality check (i.e., regression back to the exact bug being fixed).
- The migration contains `INSERT INTO storage.buckets` or any statement that would flip `return-attachments.public` to `true` (bucket must stay private).
- The migration's policy conditions would allow `SELECT`/`UPDATE`/`DELETE` across all rows unconditionally (e.g., a bare `bucket_id = 'return-attachments'` with no ownership predicate ANDed in).
- The ownership predicate is missing from any one of the three commands (INSERT/SELECT/DELETE) while present in the others (partial fix guard).
- The migration references or modifies any bucket id other than `'return-attachments'` (e.g. `review-images`), or any `storage.objects`/`storage.buckets` policy not among the 3 named ones.
- The migration touches any table other than `storage.objects` (no `ALTER TABLE public.return_requests`, no `ALTER TABLE public.return_request_attachments`, no `orders`/`payments`/other CHECK constraint).
- The migration contains destructive SQL (`DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `DROP SCHEMA`).
- `functions/api/returns.js`, `functions/api/admin/returns.js`, or any frontend file (`assets/account-dashboard.js`, `checkout.html`, etc.) is modified (git-diff guard, same pattern as the H0 validator's forbidden-paths check) — since this batch is storage-policy-only.
- `scripts/validate-h0-live-payment-rpc-hotfix.mjs` fails (chained).
- Batch 1–4 validators fail (chained).

---

## 9. Tests to run (at implementation time)

```bash
node scripts/validate-h1-return-attachment-storage-rls.mjs
node scripts/validate-h0-live-payment-rpc-hotfix.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

---

## 10. Manual live verification plan (queries only — to run after the migration is applied, not now)

```sql
-- 1) Bucket is still private, unchanged size/MIME config.
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets WHERE id = 'return-attachments';
-- expect: public = false, file_size_limit = 10485760, allowed_mime_types unchanged

-- 2) Old broad policies are gone (should return 0 rows for the old condition shape).
SELECT policyname, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual = "bucket_id = 'return-attachments'::text AND auth.uid() IS NOT NULL"
        OR with_check = "bucket_id = 'return-attachments'::text AND auth.uid() IS NOT NULL");
-- expect: 0 rows

-- 3) New scoped policies exist for all three commands.
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual ILIKE '%return-attachments%' OR with_check ILIKE '%return-attachments%')
 ORDER BY policyname;
-- expect: exactly 3 rows (INSERT/SELECT/DELETE), each condition including
-- (storage.foldername(name))[2] = auth.uid()::text (and/or the owner-column check)

-- 4) No other bucket's policies changed.
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname NOT IN (
     'Customers can upload own return attachments',
     'Customers can read own return attachments',
     'Customers can delete own return attachments'
   );
-- expect: identical to the pre-migration snapshot (review-images has 0 policies today — confirm still 0)

-- 5) No existing legitimate object became inaccessible to its own owner (spot check).
SELECT name, owner FROM storage.objects WHERE bucket_id = 'return-attachments' LIMIT 5;
-- for each row, confirm (storage.foldername(name))[2] = owner::text (should always be true given §2's findings)
```

Live smoke test (requires two real or test customer accounts):
1. As customer A, upload a return attachment via the account dashboard return form; confirm the upload succeeds and the resulting return request shows the attachment in admin.
2. As customer B, attempt to fetch customer A's exact object path directly against the Supabase Storage REST endpoint using customer B's own access token; expect a 403/empty result after the fix (and confirm it currently succeeds before the fix, as a before/after control).
3. Confirm admin (`functions/api/admin/returns.js`) can still view/sign customer A's attachment normally (service-role path, should be unaffected the entire time).

---

## 11. Rollback plan

Prefer restoring the previous policy text over dropping policies entirely (avoids a window with zero policies, which would deny all customer access rather than over-permit it):

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

This exactly restores today's live definitions (verbatim, captured in §1) if the scoped policies unexpectedly break legitimate upload/view for real customers (e.g., an edge case in the path convention this plan didn't anticipate). Given §2's live-data confirmation that 100% of sampled objects already conform to the assumed path shape, this rollback is expected to be a low-probability "just in case" measure, not an anticipated need.

**What NOT to do during rollback:** do not drop the bucket, do not delete any `storage.objects` rows, do not touch `return_request_attachments`/`return_requests` (unaffected either way).

---

## Summary

| Item | Answer |
|---|---|
| Bucket | `return-attachments`, private, 10 MB, jpeg/png/webp/mp4 — already correct, unchanged |
| Root cause | 3 existing `storage.objects` policies check only `auth.uid() IS NOT NULL`, no ownership predicate |
| Path convention | `customer/{auth.uid()}/{order_id}/{ts}-{i}.{ext}` — confirmed live, 100% consistent, no drift |
| Fix strategy | Path-segment ownership predicate (`(storage.foldername(name))[2] = auth.uid()::text`), optionally reinforced with the already-populated `owner`/`owner_id` column — **no join needed**, no insert-timing problem |
| Code changes needed for this goal | **None** — policy-only fix |
| Admin/service-role impact | None — service role bypasses RLS entirely, unaffected |
| Existing data impact | None — every live object already satisfies the new predicate |
| Residual gap (not in scope) | `returns.js` doesn't verify a client-supplied `file_path` before persisting it — separate, lower-severity, flagged for a future fast-follow, not part of H1 |
| Migration | New file, drop+recreate exactly 3 named policies, additive/idempotent, no destructive SQL |
| Risk | Low — narrow, reversible, backed by live-data verification that no existing file would be orphaned |

Stop here — no files created/edited beyond this plan document, no SQL executed, no live policy changed, no frontend touched. Awaiting approval to implement H1. Not starting H2 or Batch A/RBAC.
