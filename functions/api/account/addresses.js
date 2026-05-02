import { deleteRows, insertRow, selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanNullable, cleanString, requireUser } from '../_lib/account.js';

function normalizeAddress(body = {}) {
  const title = cleanString(body.title || body.label || 'Teslimat Adresi', 80) || 'Teslimat Adresi';
  const firstName = cleanString(body.first_name || body.firstName || '', 80);
  const lastName = cleanString(body.last_name || body.lastName || '', 80);
  const phone = cleanString(body.phone || '', 32);
  const city = cleanString(body.city || '', 80);
  const district = cleanString(body.district || '', 80);
  const addressLine = cleanString(body.address_line || body.addressLine || body.address || '', 500);
  return {
    title,
    recipient_first_name: firstName,
    recipient_last_name: lastName,
    phone,
    city,
    district,
    postal_code: cleanNullable(body.postal_code || body.postalCode, 24),
    address_line: addressLine,
    address_type: ['shipping', 'billing', 'both'].includes(body.address_type || body.type) ? (body.address_type || body.type) : 'shipping',
    is_default: Boolean(body.is_default),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  };
}

function validateAddress(address) {
  const missing = [];
  if (!address.recipient_first_name) missing.push('ad');
  if (!address.recipient_last_name) missing.push('soyad');
  if (!address.phone) missing.push('telefon');
  if (!address.city) missing.push('il');
  if (!address.district) missing.push('ilçe');
  if (!address.address_line) missing.push('açık adres');
  return missing;
}

async function ensureSingleDefault(context, userId, currentId = '') {
  await updateRows(context, 'user_addresses', { user_id: userId }, { is_default: false }).catch(() => false);
  if (currentId) await updateRows(context, 'user_addresses', { id: currentId }, { is_default: true });
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const rows = await selectRows(context, 'user_addresses', {
      select: '*',
      user_id: `eq.${auth.user.id}`,
      order: 'is_default.desc,updated_at.desc'
    });
    return json({ ok: true, addresses: rows || [] });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Adresler alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const address = normalizeAddress(body);
    const missing = validateAddress(address);
    if (missing.length) return json({ ok: false, error: `Eksik alanlar: ${missing.join(', ')}.` }, { status: 400 });

    const existing = await selectRows(context, 'user_addresses', { select: 'id', user_id: `eq.${auth.user.id}`, limit: '1' }).catch(() => []);
    if (!existing?.length) address.is_default = true;
    if (address.is_default) await ensureSingleDefault(context, auth.user.id);

    const row = await insertRow(context, 'user_addresses', { user_id: auth.user.id, ...address });
    if (row?.is_default) await ensureSingleDefault(context, auth.user.id, row.id);
    return json({ ok: true, address: row });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Adres kaydedilemedi.' }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const id = cleanString(body.id || body.address_id || '', 80);
    if (!id) return json({ ok: false, error: 'Adres id zorunlu.' }, { status: 400 });
    const rows = await selectRows(context, 'user_addresses', { select: 'id', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' });
    if (!rows?.[0]) return json({ ok: false, error: 'Adres bulunamadı.' }, { status: 404 });

    const address = normalizeAddress(body);
    const missing = validateAddress(address);
    if (missing.length) return json({ ok: false, error: `Eksik alanlar: ${missing.join(', ')}.` }, { status: 400 });
    if (address.is_default) await ensureSingleDefault(context, auth.user.id);
    await updateRows(context, 'user_addresses', { id }, address);
    if (address.is_default) await ensureSingleDefault(context, auth.user.id, id);
    const updated = await selectRows(context, 'user_addresses', { select: '*', id: `eq.${id}`, limit: '1' });
    return json({ ok: true, address: updated?.[0] || null });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Adres güncellenemedi.' }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const url = new URL(context.request.url);
    const body = await context.request.json().catch(() => ({}));
    const id = cleanString(url.searchParams.get('id') || body.id || body.address_id || '', 80);
    if (!id) return json({ ok: false, error: 'Adres id zorunlu.' }, { status: 400 });
    const rows = await selectRows(context, 'user_addresses', { select: 'id,is_default', id: `eq.${id}`, user_id: `eq.${auth.user.id}`, limit: '1' });
    if (!rows?.[0]) return json({ ok: false, error: 'Adres bulunamadı.' }, { status: 404 });
    await deleteRows(context, 'user_addresses', { id });
    if (rows[0].is_default) {
      const next = await selectRows(context, 'user_addresses', { select: 'id', user_id: `eq.${auth.user.id}`, order: 'updated_at.desc', limit: '1' }).catch(() => []);
      if (next?.[0]?.id) await updateRows(context, 'user_addresses', { id: next[0].id }, { is_default: true });
    }
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Adres silinemedi.' }, { status: 500 });
  }
}
