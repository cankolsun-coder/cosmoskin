-- COSMOSKIN H1 — Return attachment Storage RLS ownership fix.
--
-- Live verification (COSMOSKIN_PREFLIGHT_LIVE_DB_VERIFICATION_20260704.md §3, re-confirmed
-- during H1 planning) found that the `return-attachments` storage bucket already exists,
-- is already private, and already has three storage.objects policies (INSERT/SELECT/DELETE,
-- role `authenticated`) — but all three check only `auth.uid() IS NOT NULL`, with no
-- ownership predicate. Any signed-in customer could therefore read, delete, or overwrite
-- any other customer's return attachment object, as long as they knew or could
-- guess/enumerate its storage path.
--
-- Path convention (confirmed in assets/account-dashboard.js's uploadReturnAttachments(),
-- and confirmed live against every existing object in the bucket, with zero drift):
--   customer/{auth.uid()}/{order_id}/{timestamp}-{index}.{ext}
-- `(storage.foldername(name))[1]` is always the literal 'customer', and
-- `(storage.foldername(name))[2]` is always the uploading customer's own auth.uid() —
-- confirmed live for every object already in the bucket, set independently of any
-- return_request_attachments row. This lets the ownership check be enforced directly
-- from storage.objects.name, without any join through return_request_attachments/
-- return_requests, and without any insert-timing problem (a return_request row does not
-- exist yet at the moment of upload).
--
-- Scope: this file DROPs and recreates exactly the three named return-attachments
-- policies on storage.objects. It does not touch storage.buckets (bucket stays private,
-- same size/MIME config), any other bucket's policies (review-images untouched), any
-- table (return_requests / return_request_attachments schemas and their own RLS are
-- untouched), any CHECK constraint, or any H0/H0b/H0c function. No files are deleted —
-- this only changes who may read/insert/delete going forward.
--
-- Policy names are reused verbatim from the live policies (DROP POLICY IF EXISTS +
-- CREATE POLICY with the same name), so this is a clean condition swap, not a rename,
-- and the statement is idempotent/safe to re-run if partially applied.
--
-- Service-role/admin access is unaffected: functions/api/admin/returns.js signs
-- attachment URLs via the Supabase Storage REST API using the service-role key
-- (functions/api/_lib/supabase.js: createSignedStorageUrl -> adminHeaders), and
-- service-role requests bypass storage.objects RLS entirely by Supabase's own design.
-- No policy for the service_role/admin path is added or needed here.
--
-- No UPDATE policy exists today and none is added by this migration — the app never
-- overwrites an uploaded attachment in place (client uses upsert:false), so adding one
-- would only widen the surface with no functional benefit.

BEGIN;

DROP POLICY IF EXISTS "Customers can upload own return attachments" ON storage.objects;
DROP POLICY IF EXISTS "Customers can read own return attachments" ON storage.objects;
DROP POLICY IF EXISTS "Customers can delete own return attachments" ON storage.objects;

CREATE POLICY "Customers can upload own return attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Customers can read own return attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Customers can delete own return attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'return-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'customer'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

COMMIT;
