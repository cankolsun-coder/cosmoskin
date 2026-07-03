import { selectRows, updateRows, upsertRow } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, requireUser } from '../_lib/account.js';

const DEFAULT_PREFERENCES = {
  order_updates: true,
  cargo_updates: true,
  campaign_emails: false,
  stock_notifications: false,
  routine_reminders: false,
  newsletter: false,
  sms_notifications: false
};

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizePreferences(input = {}, profile = {}) {
  const p = input.preferences && typeof input.preferences === 'object' ? input.preferences : input;
  return {
    order_updates: bool(p.order_updates, true),
    cargo_updates: bool(p.cargo_updates, true),
    campaign_emails: bool(p.campaign_emails ?? p.marketing_email_opt_in, Boolean(profile.marketing_email_opt_in)),
    stock_notifications: bool(p.stock_notifications ?? p.stock_alert_opt_in, Boolean(profile.stock_alert_opt_in)),
    routine_reminders: bool(p.routine_reminders ?? p.routine_reminder_opt_in, Boolean(profile.routine_reminder_opt_in)),
    newsletter: bool(p.newsletter ?? p.newsletter_opt_in, Boolean(profile.newsletter_opt_in)),
    sms_notifications: bool(p.sms_notifications ?? p.marketing_sms_opt_in, Boolean(profile.marketing_sms_opt_in))
  };
}

async function readPreferences(context, user) {
  const [prefRows, profileRows] = await Promise.all([
    selectRows(context, 'notification_preferences', { select: '*', user_id: `eq.${user.id}`, limit: '1' }).catch(() => []),
    selectRows(context, 'profiles', { select: 'marketing_email_opt_in,newsletter_opt_in,stock_alert_opt_in,routine_reminder_opt_in,marketing_sms_opt_in', id: `eq.${user.id}`, limit: '1' }).catch(() => [])
  ]);
  const prefs = prefRows?.[0];
  if (prefs) return { ...DEFAULT_PREFERENCES, ...prefs };
  return { ...DEFAULT_PREFERENCES, ...normalizePreferences({}, profileRows?.[0] || {}) };
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const [rows, preferences] = await Promise.all([
      selectRows(context, 'notifications', {
        select: '*',
        user_id: `eq.${auth.user.id}`,
        order: 'created_at.desc',
        limit: '50'
      }).catch(() => []),
      readPreferences(context, auth.user)
    ]);
    return json({ ok: true, notifications: rows || [], preferences });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Bildirimler alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  return onRequestPatch(context);
}

export async function onRequestPatch(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));

    if (body.preferences || body.order_updates !== undefined || body.campaign_emails !== undefined || body.newsletter !== undefined) {
      const preferences = normalizePreferences(body);
      const now = new Date().toISOString();
      let saved = null;
      let preferenceWarning = null;
      try {
        saved = await upsertRow(context, 'notification_preferences', {
          user_id: auth.user.id,
          ...preferences,
          updated_at: now
        }, 'user_id');
      } catch (error) {
        preferenceWarning = /schema cache|column|campaign_emails|notification_preferences/i.test(error?.message || '')
          ? 'notification_preferences_schema_pending'
          : 'notification_preferences_save_skipped';
      }
      await upsertRow(context, 'profiles', {
        id: auth.user.id,
        email: auth.user.email || null,
        marketing_email_opt_in: preferences.campaign_emails,
        newsletter_opt_in: preferences.newsletter,
        stock_alert_opt_in: preferences.stock_notifications,
        routine_reminder_opt_in: preferences.routine_reminders,
        marketing_sms_opt_in: preferences.sms_notifications,
        updated_at: now
      }, 'id').catch(() => null);
      return json({ ok: true, preferences: saved || preferences, warning: preferenceWarning });
    }

    const id = cleanString(body.id || body.notification_id || '', 80);
    if (body.mark_all_read) {
      const rows = await selectRows(context, 'notifications', { select: 'id', user_id: `eq.${auth.user.id}`, is_read: 'eq.false', limit: '100' }).catch(() => []);
      for (const row of rows || []) await updateRows(context, 'notifications', { id: row.id }, { is_read: true, read_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (!id) return json({ ok: false, error: 'Bildirim id veya tercih payload zorunlu.' }, { status: 400 });
    const rows = await selectRows(context, 'notifications', { select: 'id', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' });
    if (!rows?.[0]) return json({ ok: false, error: 'Bildirim bulunamadı.' }, { status: 404 });
    await updateRows(context, 'notifications', { id }, { is_read: Boolean(body.is_read !== false), read_at: new Date().toISOString() });
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Bildirim güncellenemedi.' }, { status: 500 });
  }
}
