import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows, upsertRow } from '../_lib/supabase.js';

function cleanText(value = '', max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeBoolExplicit(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function normalizeBirthday(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function isValidBirthdayDate(raw) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const birthday = new Date(year, month - 1, day);
  if (
    birthday.getFullYear() !== year
    || birthday.getMonth() !== month - 1
    || birthday.getDate() !== day
  ) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (birthday > today) return false;
  if (year < today.getFullYear() - 120) return false;
  return true;
}

function mergeMetadata(existing = {}, incoming) {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  if (incoming === undefined) return base;
  if (incoming === null) return {};
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return base;
  return { ...base, ...incoming };
}

const OPT_IN_FIELDS = [
  'marketing_email_opt_in',
  'newsletter_opt_in',
  'stock_alert_opt_in',
  'routine_reminder_opt_in'
];

async function getProfile(context, user) {
  const rows = await selectRows(context, 'profiles', {
    select: '*',
    id: `eq.${user.id}`,
    limit: '1'
  }).catch(() => []);
  return rows?.[0] || null;
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const profile = await getProfile(context, auth.user);
  return json({ ok: true, profile: profile || { id: auth.user.id, email: auth.user.email } });
}

export async function onRequestPatch(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const existing = await getProfile(context, auth.user);
    const now = new Date().toISOString();

    const existingBirthday = existing?.birthday ? String(existing.birthday).slice(0, 10) : null;
    const birthdayLocked = Boolean(existing?.birth_date_locked);
    const changeCount = Number(existing?.birthday_change_count || 0);
    const hasBirthdayField = hasOwn(body, 'birthday') || hasOwn(body, 'birth_date');
    const requestedBirthday = hasBirthdayField
      ? normalizeBirthday(body.birthday ?? body.birth_date)
      : undefined;

    if (
      hasBirthdayField
      && body.birthday !== ''
      && body.birth_date !== ''
      && requestedBirthday === null
      && (body.birthday || body.birth_date)
    ) {
      return json({ ok: false, error: 'Geçerli bir doğum tarihi girin (YYYY-AA-GG).' }, { status: 400 });
    }

    if (hasBirthdayField && requestedBirthday && !isValidBirthdayDate(requestedBirthday)) {
      return json({
        ok: false,
        error: 'Geçerli bir doğum tarihi girin. Gelecek tarih veya geçersiz tarih kabul edilmez.'
      }, { status: 400 });
    }

    let nextBirthday = existingBirthday;
    let nextChangeCount = changeCount;
    let nextLocked = birthdayLocked;
    let nextLastChanged = existing?.birthday_last_changed_at || null;

    if (hasBirthdayField && requestedBirthday !== undefined) {
      if (birthdayLocked && requestedBirthday !== existingBirthday) {
        return json({
          ok: false,
          error: 'Doğum tarihiniz kilitlidir. Sonraki değişiklikler için destek ekibiyle iletişime geçebilirsiniz.'
        }, { status: 403 });
      }

      if (!existingBirthday && requestedBirthday) {
        nextBirthday = requestedBirthday;
      } else if (existingBirthday && requestedBirthday && requestedBirthday !== existingBirthday) {
        if (changeCount >= 1) {
          return json({
            ok: false,
            error: 'Doğum tarihi bir kez düzeltilebilir. Sonraki değişiklikler için destek ekibiyle iletişime geçebilirsiniz.'
          }, { status: 403 });
        }
        nextBirthday = requestedBirthday;
        nextChangeCount = changeCount + 1;
        nextLastChanged = now;
        nextLocked = true;
      } else if (existingBirthday && requestedBirthday === existingBirthday) {
        nextBirthday = existingBirthday;
      } else if (!requestedBirthday && !existingBirthday) {
        nextBirthday = null;
      }
    }

    const payload = {
      id: auth.user.id,
      email: String(auth.user.email || existing?.email || body.email || '').toLowerCase(),
      updated_at: now
    };

    if (hasOwn(body, 'first_name')) {
      payload.first_name = cleanText(body.first_name, 80);
    } else if (existing) {
      payload.first_name = cleanText(existing.first_name, 80);
    } else {
      payload.first_name = '';
    }

    if (hasOwn(body, 'last_name')) {
      payload.last_name = cleanText(body.last_name, 80);
    } else if (existing) {
      payload.last_name = cleanText(existing.last_name, 80);
    } else {
      payload.last_name = '';
    }

    if (hasOwn(body, 'phone')) {
      payload.phone = cleanText(body.phone, 40);
    } else if (existing) {
      payload.phone = cleanText(existing.phone, 40);
    } else {
      payload.phone = '';
    }

    payload.birthday = nextBirthday;
    payload.birthday_change_count = nextChangeCount;
    payload.birthday_last_changed_at = nextLastChanged;
    payload.birth_date_locked = nextLocked;

    // Only write opt-in columns when present on the row or explicitly sent.
    // Older profiles tables may lack these columns — always writing them caused 500s on birthday/name saves.
    for (const field of OPT_IN_FIELDS) {
      if (hasOwn(body, field)) {
        payload[field] = normalizeBoolExplicit(body[field]);
      } else if (existing && Object.prototype.hasOwnProperty.call(existing, field)) {
        payload[field] = Boolean(existing[field]);
      }
    }

    if (hasOwn(body, 'metadata')) {
      payload.metadata = mergeMetadata(existing?.metadata, body.metadata);
    } else if (existing?.metadata && typeof existing.metadata === 'object') {
      payload.metadata = existing.metadata;
    } else {
      payload.metadata = {};
    }

    const profile = await upsertRow(context, 'profiles', payload, 'id');
    return json({ ok: true, profile });
  } catch (error) {
    console.error('profile patch failed:', error);
    const detail = String(error && error.message || '').trim();
    const hint = /column|schema cache|PGRST/i.test(detail)
      ? ' Profil alanları henüz hazır değil olabilir; lütfen daha sonra tekrar deneyin.'
      : '';
    return json({
      ok: false,
      error: 'Hesap bilgileri şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' + hint,
      code: 'PROFILE_UPSERT_FAILED'
    }, { status: 500 });
  }
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PATCH' || context.request.method === 'POST') return onRequestPatch(context);
  return json({ ok: false, error: 'Yalnızca GET/PATCH desteklenir.' }, { status: 405, headers: { Allow: 'GET, PATCH, POST' } });
}
