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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizePreferences(input = {}, profile = {}, existing = {}) {
  const p = input.preferences && typeof input.preferences === 'object' ? input.preferences : input;
  const base = {
    order_updates: existing.order_updates !== false,
    cargo_updates: existing.cargo_updates !== false,
    campaign_emails: Boolean(existing.campaign_emails ?? profile.marketing_email_opt_in),
    stock_notifications: Boolean(existing.stock_notifications ?? profile.stock_alert_opt_in),
    routine_reminders: Boolean(existing.routine_reminders ?? profile.routine_reminder_opt_in),
    newsletter: Boolean(existing.newsletter ?? profile.newsletter_opt_in),
    sms_notifications: Boolean(existing.sms_notifications ?? profile.sms_notifications)
  };

  if (hasOwn(p, 'order_updates')) base.order_updates = p.order_updates !== false;
  if (hasOwn(p, 'cargo_updates')) base.cargo_updates = p.cargo_updates !== false;
  if (hasOwn(p, 'campaign_emails') || hasOwn(p, 'marketing_email_opt_in')) {
    base.campaign_emails = bool(p.campaign_emails ?? p.marketing_email_opt_in, base.campaign_emails);
  }
  if (hasOwn(p, 'stock_notifications') || hasOwn(p, 'stock_alert_opt_in')) {
    base.stock_notifications = bool(p.stock_notifications ?? p.stock_alert_opt_in, base.stock_notifications);
  }
  if (hasOwn(p, 'routine_reminders') || hasOwn(p, 'routine_reminder_opt_in')) {
    base.routine_reminders = bool(p.routine_reminders ?? p.routine_reminder_opt_in, base.routine_reminders);
  }
  if (hasOwn(p, 'newsletter') || hasOwn(p, 'newsletter_opt_in')) {
    base.newsletter = bool(p.newsletter ?? p.newsletter_opt_in, base.newsletter);
  }
  if (hasOwn(p, 'sms_notifications')) base.sms_notifications = bool(p.sms_notifications, base.sms_notifications);

  return base;
}

async function readPreferences(context, user) {
  const [prefRows] = await Promise.all([
    selectRows(context, 'notification_preferences', { select: '*', user_id: `eq.${user.id}`, limit: '1' }).catch(() => [])
  ]);
  const prefs = prefRows?.[0];
  if (prefs) {
    return {
      ...DEFAULT_PREFERENCES,
      order_updates: prefs.order_updates !== false,
      cargo_updates: prefs.cargo_updates !== false,
      campaign_emails: Boolean(prefs.campaign_emails),
      stock_notifications: Boolean(prefs.stock_notifications),
      routine_reminders: Boolean(prefs.routine_reminders),
      newsletter: Boolean(prefs.newsletter),
      sms_notifications: Boolean(prefs.sms_notifications)
    };
  }
  // profiles.*_opt_in columns are not present on the live schema; defaults only.
  return { ...DEFAULT_PREFERENCES };
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
    console.error('notifications get failed:', error);
    return json({ ok: false, error: 'Bildirimler alınamadı.' }, { status: 500 });
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
      const existingPrefs = await readPreferences(context, auth.user);
      const preferences = normalizePreferences(body, {}, existingPrefs);
      // Always keep transactional order/cargo alerts on.
      preferences.order_updates = true;
      preferences.cargo_updates = true;
      const now = new Date().toISOString();
      let saved = null;
      try {
        // Live table PK is user_id. Do NOT send `email`/`id` — those columns are
        // not present on the production notification_preferences schema and cause
        // PostgREST "column not found in schema cache" failures on save.
        saved = await upsertRow(context, 'notification_preferences', {
          user_id: auth.user.id,
          ...preferences,
          updated_at: now
        }, 'user_id');
      } catch (error) {
        console.error('notification_preferences save failed:', error);
        return json({
          ok: false,
          error: 'Tercihleriniz şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.'
        }, { status: 500 });
      }
      return json({ ok: true, preferences: saved || preferences });
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
    console.error('notifications patch failed:', error);
    return json({ ok: false, error: 'Bildirim güncellenemedi.' }, { status: 500 });
  }
}
