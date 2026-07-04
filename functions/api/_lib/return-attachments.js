import { createSignedStorageUrl } from './supabase.js';

// H2: shared return-attachment signed-URL helper.
//
// CONTRACT (read before calling this from a new call site):
// - This module NEVER accepts a client-supplied file_path/attachment id. It
//   only ever signs rows that were already fetched from the database by the
//   caller through a query that is itself scoped to an authorized reader:
//     - Customer surfaces (functions/api/account/summary.js,
//       functions/api/returns.js) must only pass rows whose
//       return_request_id was already filtered to the authenticated
//       customer's own return_requests before this module ever sees them.
//     - Admin surfaces must only call this after assertAdmin(context) has
//       already run.
//   Adding a new endpoint that takes an attachment id/path straight from the
//   request and forwards it here would defeat that contract — don't.
// - Signed URLs are short-lived (1 hour default) and generated with the
//   service-role key entirely server-side. The service-role key itself is
//   never returned to any client; only the resulting temporary signed URL
//   (a Supabase Storage domain URL with an expiring token embedded) is.
// - Failures never forward the raw Supabase/Storage error text (see
//   createSignedStorageUrl -> parseSupabaseResponse, which throws messages
//   taken directly from the provider's response body). Only a fixed,
//   generic `preview_error` code is ever returned.

const DEFAULT_EXPIRES_IN = 60 * 60; // 1 hour, matches the existing admin pattern.
const IMAGE_MIME_RE = /^image\//i;
const VIDEO_MIME_RE = /^video\//i;

function previewKindFor(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (IMAGE_MIME_RE.test(value)) return 'image';
  if (VIDEO_MIME_RE.test(value)) return 'video';
  return 'file';
}

// Defense-in-depth only: rows reaching this module are expected to already
// come from trusted, ownership-scoped storage — this just refuses to ask
// Supabase to sign anything that isn't a well-formed object path, mirroring
// the same shape check functions/api/returns.js already applies on write.
function isSafeStoragePath(value) {
  if (typeof value !== 'string' || !value || value.length > 420) return false;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || value.includes(':')) return false;
  return /^[A-Za-z0-9/_.-]+$/.test(value);
}

function buildDownloadUrl(signedUrl, fileName) {
  if (!signedUrl) return null;
  const separator = signedUrl.includes('?') ? '&' : '?';
  const safeName = String(fileName || 'cosmoskin-iade-eki').replace(/[\r\n]/g, '');
  return `${signedUrl}${separator}download=${encodeURIComponent(safeName)}`;
}

function baseFields(row = {}) {
  const fileSize = Number(row.file_size);
  return {
    file_name: row.file_name || 'Ek dosya',
    mime_type: row.mime_type || '',
    file_size: Number.isFinite(fileSize) ? fileSize : null,
    created_at: row.created_at || null,
    preview_kind: previewKindFor(row.mime_type)
  };
}

async function signOneAttachment(context, row = {}, { expiresIn = DEFAULT_EXPIRES_IN } = {}) {
  const bucket = row.storage_bucket || 'return-attachments';
  const path = row.file_path || row.path || '';
  const base = baseFields(row);

  if (!isSafeStoragePath(path)) {
    return { ...base, signed_url: null, download_url: null, preview_error: 'attachment_unavailable' };
  }

  try {
    const signedUrl = await createSignedStorageUrl(context, bucket, path, expiresIn);
    // Defense-in-depth: only ever hand back a URL that is actually a signed
    // Supabase Storage object URL (bears /storage/v1/object/sign/ and a
    // token). Anything else — null, a public URL, a malformed path — is
    // treated the same as "could not sign" rather than forwarded as-is.
    if (!signedUrl || !/\/storage\/v1\/object\/sign\//.test(signedUrl) || !/[?&]token=/.test(signedUrl)) {
      return { ...base, signed_url: null, download_url: null, preview_error: 'attachment_unavailable' };
    }
    return {
      ...base,
      signed_url: signedUrl,
      download_url: buildDownloadUrl(signedUrl, base.file_name)
    };
  } catch (_error) {
    // Deliberately does not read _error.message/_error.stack anywhere below —
    // that would leak raw Supabase/Storage provider text to the client.
    return { ...base, signed_url: null, download_url: null, preview_error: 'signed_url_unavailable' };
  }
}

/**
 * Enriches already-fetched return_request_attachments rows with short-lived
 * signed URLs. See the module-level contract comment above before using this
 * from a new call site — it must only ever receive rows the caller already
 * proved the reader is allowed to see.
 *
 * Returns a new array; never mutates the input rows. The output never
 * includes file_path/storage_bucket (raw storage location), only the fields
 * a customer-facing UI needs: file_name, mime_type, file_size, created_at,
 * signed_url, download_url, preview_kind (and preview_error when signing
 * failed).
 */
export async function signReturnAttachments(context, rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return Promise.all(list.map((row) => signOneAttachment(context, row, options)));
}
