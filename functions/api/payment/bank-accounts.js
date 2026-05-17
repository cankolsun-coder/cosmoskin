import { selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';

function normalizeAccount(row = {}) {
  return {
    id: row.id || null,
    bankName: row.bank_name || row.bankName || '',
    accountName: row.account_holder || row.accountName || '',
    iban: row.iban || '',
    branch: row.branch || row.branch_name || '',
    currency: row.currency || 'TRY'
  };
}

export async function onRequestGet(context) {
  try {
    const rows = await selectRows(context, 'payment_bank_accounts', {
      select: 'id,bank_name,account_holder,iban,branch,currency,is_active,sort_order',
      is_active: 'eq.true',
      order: 'sort_order.asc,created_at.asc',
      limit: '3'
    }).catch(() => []);

    const accounts = (rows || []).map(normalizeAccount).filter((account) => account.bankName && account.accountName && account.iban);
    return json({ ok: true, account: accounts[0] || null, accounts });
  } catch (error) {
    return json({ ok: false, account: null, accounts: [], error: 'Banka hesap bilgileri alınamadı.' }, { status: 500 });
  }
}
