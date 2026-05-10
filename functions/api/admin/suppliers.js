
import { selectRows, insertRow, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { cleanText, normalizeEmail, validEmail } from '../_lib/security.js';

function cleanUrl(value = '') {
  const raw = cleanText(value, 240);
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
  return raw;
}

function payload(body = {}) {
  const email = normalizeEmail(body.contact_email || '');
  return {
    name: cleanText(body.name, 180),
    contact_email: email && validEmail(email) ? email : null,
    contact_phone: cleanText(body.contact_phone, 80) || null,
    website: cleanUrl(body.website),
    notes: cleanText(body.notes, 2000) || null,
    updated_at: new Date().toISOString()
  };
}

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const url = new URL(context.request.url);
    const query = cleanText(url.searchParams.get('search') || '', 120);
    const params = { select: '*', order: 'name.asc', limit: '200' };
    if (query) params.name = `ilike.*${query}*`;
    const suppliers = await selectRows(context, 'supplier_records', params).catch(() => []);
    return json({ ok: true, suppliers });
  } catch (error) {
    return adminError(error, 'Tedarikçi kayıtları alınamadı.');
  }
}

export async function onRequestPost(context) {
  try {
    assertAdmin(context);
    const body = await readJsonBody(context);
    const row = payload(body);
    if (!row.name) return json({ ok: false, error: 'Tedarikçi adı gerekli.' }, { status: 400 });
    const supplier = await insertRow(context, 'supplier_records', row);
    return json({ ok: true, supplier, message: 'Tedarikçi kaydı oluşturuldu.' });
  } catch (error) {
    return adminError(error, 'Tedarikçi oluşturulamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    assertAdmin(context);
    const body = await readJsonBody(context);
    if (!body.id) return json({ ok: false, error: 'id gerekli.' }, { status: 400 });
    const row = payload(body);
    if (!row.name) return json({ ok: false, error: 'Tedarikçi adı gerekli.' }, { status: 400 });
    await updateRows(context, 'supplier_records', { id: body.id }, row);
    return json({ ok: true, message: 'Tedarikçi kaydı güncellendi.' });
  } catch (error) {
    return adminError(error, 'Tedarikçi güncellenemedi.');
  }
}
