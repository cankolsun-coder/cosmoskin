
import { getUserFromAccessToken, insertRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
import { assertRateLimit, cleanText, normalizeEmail, publicError, safeMetadata, validEmail } from './_lib/security.js';

const CONSENTS = new Set(['kvkk_acknowledged','distance_sales_accepted','preliminary_information_accepted','marketing_email_opt_in','newsletter_opt_in','cookie_preferences']);

export async function onRequestPost(context) {
  try {
    assertRateLimit(context, 'consents', 20, 10 * 60 * 1000);
    const body = await context.request.json().catch(() => ({}));
    const email = normalizeEmail(body.email || '');
    if (email && !validEmail(email)) return json({ ok: false, error: 'Geçerli bir e-posta gerekli.' }, { status: 400 });
    const source = cleanText(body.source || 'site', 80);
    const user = body.accessToken ? await getUserFromAccessToken(context, body.accessToken).catch(() => null) : null;
    const raw = Array.isArray(body.consents) ? body.consents : Object.entries(body.consents || {}).map(([type, value]) => ({ type, accepted: Boolean(value) }));
    const rows = raw
      .map((item) => ({ type: cleanText(item.type || item.consent_type, 80), accepted: Boolean(item.accepted ?? item.status === 'accepted' ?? item.status === 'acknowledged') }))
      .filter((item) => CONSENTS.has(item.type))
      .map((item) => ({
        user_id: user?.id || body.user_id || null,
        email: validEmail(email) ? email : null,
        consent_type: item.type,
        status: item.accepted ? (item.type === 'kvkk_acknowledged' ? 'acknowledged' : 'accepted') : 'declined',
        source,
        metadata: safeMetadata({ ...(body.metadata || {}), page: body.page || null })
      }));
    if (!rows.length) return json({ ok: false, error: 'Kaydedilecek izin bulunamadı.' }, { status: 400 });
    await insertRows(context, 'consent_records', rows);
    return json({ ok: true, recorded: rows.length });
  } catch (error) {
    console.error('consents failed:', { message: error?.message || 'unknown' });
    return publicError(error, 'İzin kaydı şu anda oluşturulamadı.');
  }
}
