import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows, upsertRow } from '../_lib/supabase.js';

function cleanText(value = '', max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeBool(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function normalizeBirthday(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

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
    const hasBirthdayField = body.birthday !== undefined || body.birth_date !== undefined;
    const requestedBirthday = hasBirthdayField
      ? normalizeBirthday(body.birthday ?? body.birth_date)
      : undefined;

    if (hasBirthdayField && body.birthday !== '' && body.birth_date !== '' && requestedBirthday === null && (body.birthday || body.birth_date)) {
      return json({ ok: false, error: 'Geçerli bir doğum tarihi girin (YYYY-AA-GG).' }, { status: 400 });
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
      email: String(auth.user.email || body.email || '').toLowerCase(),
      first_name: cleanText(body.first_name, 80),
      last_name: cleanText(body.last_name, 80),
      phone: cleanText(body.phone, 40),
      birthday: nextBirthday,
      birthday_change_count: nextChangeCount,
      birthday_last_changed_at: nextLastChanged,
      birth_date_locked: nextLocked,
      marketing_email_opt_in: normalizeBool(body.marketing_email_opt_in),
      newsletter_opt_in: normalizeBool(body.newsletter_opt_in),
      stock_alert_opt_in: normalizeBool(body.stock_alert_opt_in),
      routine_reminder_opt_in: normalizeBool(body.routine_reminder_opt_in),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      updated_at: now
    };

    const profile = await upsertRow(context, 'profiles', payload, 'id');
    return json({ ok: true, profile });
  } catch (error) {
    console.error('profile patch failed:', error);
    return json({ ok: false, error: 'Hesap bilgileri şu anda kaydedilemedi. Lütfen daha sonra tekrar deneyin.' }, { status: 500 });
  }
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PATCH' || context.request.method === 'POST') return onRequestPatch(context);
  return json({ ok: false, error: 'Yalnızca GET/PATCH desteklenir.' }, { status: 405, headers: { Allow: 'GET, PATCH, POST' } });
}
