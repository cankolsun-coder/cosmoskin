
import { insertRow } from './supabase.js';
import { cleanText, normalizeEmail, normalizeSlug, safeMetadata, validEmail } from './security.js';

const ALLOWED = new Set(['product_viewed','added_to_cart','removed_from_cart','checkout_started','purchase_completed','favorite_added','restock_alert_created','newsletter_subscribed','return_requested']);

export async function recordCrmEvent(context, payload = {}) {
  const eventType = cleanText(payload.event_type || payload.eventType, 80);
  if (!ALLOWED.has(eventType)) return null;
  const email = normalizeEmail(payload.email || '');
  return await insertRow(context, 'crm_events', {
    user_id: payload.user_id || payload.userId || null,
    email: validEmail(email) ? email : null,
    event_type: eventType,
    product_slug: normalizeSlug(payload.product_slug || payload.productSlug || '') || null,
    order_id: payload.order_id || payload.orderId || null,
    metadata: safeMetadata(payload.metadata || {})
  }).catch((error) => {
    console.error('crm_events insert failed:', { message: error?.message || 'unknown' });
    return null;
  });
}
