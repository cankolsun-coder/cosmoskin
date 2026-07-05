import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { normalizeBankAccount, validateBankAccount } from '../_lib/bank-accounts.js';
import { json } from '../_lib/response.js';
import { insertRow, selectRows, updateRows } from '../_lib/supabase.js';

const SELECT = 'id,bank_name,account_holder,iban,branch,currency,is_active,sort_order,created_at,updated_at';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

function toDbPayload(raw = {}) {
  const normalized = normalizeBankAccount(raw);
  const validation = validateBankAccount({ ...normalized, active: raw.active ?? raw.is_active ?? true });
  if (!validation.valid) {
    const error = Object.assign(new Error(`Banka hesabı geçersiz: ${validation.errors.join(', ')}`), { status: 400 });
    throw error;
  }
  return {
    bank_name: validation.account.bankName,
    account_holder: validation.account.accountName,
    iban: validation.account.iban,
    branch: validation.account.branch || null,
    currency: validation.account.currency,
    is_active: Boolean(validation.account.active),
    sort_order: Math.max(0, Math.trunc(Number(raw.sort_order ?? raw.sortOrder ?? 0) || 0)),
    updated_at: new Date().toISOString()
  };
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'bank_accounts:manage');
    const rows = await selectRows(context, 'payment_bank_accounts', { select: SELECT, order: 'sort_order.asc,created_at.asc' });
    return json({ ok: true, accounts: (rows || []).map(normalizeBankAccount) }, { headers: NO_STORE });
  } catch (error) {
    return adminError(error, 'Banka hesapları alınamadı.');
  }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'bank_accounts:manage');
    const body = await readJsonBody(context);
    const payload = toDbPayload(body);
    const created = await insertRow(context, 'payment_bank_accounts', { ...payload, created_at: new Date().toISOString() });
    return json({ ok: true, account: normalizeBankAccount(created) }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return adminError(error, 'Banka hesabı kaydedilemedi.');
  }
}

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'bank_accounts:manage');
    const body = await readJsonBody(context);
    const id = String(body.id || '').trim();
    if (!id) return json({ ok: false, error: 'Hesap kimliği gerekli.' }, { status: 400, headers: NO_STORE });
    const current = (await selectRows(context, 'payment_bank_accounts', { select: SELECT, id: `eq.${id}`, limit: '1' }))?.[0];
    if (!current) return json({ ok: false, error: 'Banka hesabı bulunamadı.' }, { status: 404, headers: NO_STORE });
    const payload = toDbPayload({ ...current, ...body });
    await updateRows(context, 'payment_bank_accounts', { id }, payload);
    const updated = (await selectRows(context, 'payment_bank_accounts', { select: SELECT, id: `eq.${id}`, limit: '1' }))?.[0];
    return json({ ok: true, account: normalizeBankAccount(updated) }, { headers: NO_STORE });
  } catch (error) {
    return adminError(error, 'Banka hesabı güncellenemedi.');
  }
}
