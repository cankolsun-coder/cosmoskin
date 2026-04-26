/**
 * Legacy review API surface (DEPRECATED).
 *
 * Background
 * ----------
 * An earlier version of the site shipped two review widgets:
 *   - assets/reviews-widget.js (legacy) — issued POST/PATCH against /api/reviews/*
 *   - js/reviews.js            (current) — talks to Supabase directly
 *
 * The legacy widget was removed in Phase 2 because it duplicated the live
 * widget, used IDs that did not exist in the DOM, and produced "Method Not
 * Allowed" errors when users tried to edit a review and upload an image
 * together — the request hit a 22-byte placeholder that wasn't valid JS.
 *
 * To prevent any zombie caller (cached browsers, bookmarks, third-party
 * scripts) from getting a confusing 405, this catch-all handler returns
 * a structured 410 Gone with guidance. The active review flow is now
 * Supabase-direct via js/reviews.js (auth + Storage + PostgREST).
 *
 * If a future server-side review endpoint is needed (e.g. for moderation
 * or admin operations), implement it here with explicit method handlers.
 */

import { json } from '../_lib/response.js';

const PAYLOAD = {
  ok: false,
  code: 'gone',
  error:
    'Review API uç noktası kullanımdan kaldırıldı. ' +
    'İstemci, Supabase SDK üzerinden doğrudan reviews tablosuna ve review-images bucket’ına yazmalıdır.',
  migration: {
    canonical_client: '/js/reviews.js',
    write_path:       'supabase.from("reviews").insert(...)',
    update_path:      'supabase.from("reviews").update(...).eq("id", ...).eq("user_id", ...)',
    upload_path:      'supabase.storage.from("review-images").upload(path, blob)'
  }
};

const HEADERS = { Allow: '' }; // no methods allowed; this resource is gone.

export const onRequest = () => json(PAYLOAD, { status: 410, headers: HEADERS });
export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestPut = onRequest;
export const onRequestPatch = onRequest;
export const onRequestDelete = onRequest;
export const onRequestOptions = onRequest;
