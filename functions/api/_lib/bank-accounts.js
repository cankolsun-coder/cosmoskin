import { selectRows } from './supabase.js';

const SUPPORTED_CURRENCIES = new Set(['TRY']);

export const FALLBACK_BANK_ACCOUNTS = [
  {
    id: 'garanti-bankasi-cosmoskin',
    bankName: 'Garanti Bankası',
    accountName: 'ENES CAN KÖLSÜN',
    iban: 'TR840006200074200006291866',
    branch: 'Maltepe Çarşı',
    currency: 'TRY',
    active: true,
    sortOrder: 1
  },
  {
    id: 'is-bankasi-cosmoskin',
    bankName: 'İş Bankası',
    accountName: 'ENES CAN KÖLSÜN',
    iban: 'TR700006400000110372579047',
    branch: 'Maltepe Çarşı',
    currency: 'TRY',
    active: true,
    sortOrder: 2
  }
];

function fallbackAccounts(limit = 3) {
  return FALLBACK_BANK_ACCOUNTS.slice(0, Math.max(1, Math.min(10, Number(limit || 3))));
}

export function normalizeIban(value = '') {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isValidTurkishIban(value = '') {
  const iban = normalizeIban(value);
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';
  for (const char of rearranged) {
    numeric += /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
  }
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

export function normalizeBankAccount(row = {}) {
  const currency = String(row.currency || 'TRY').trim().toUpperCase();
  return {
    id: row.id || null,
    bankName: String(row.bank_name || row.bankName || '').trim(),
    accountName: String(row.account_holder || row.accountName || '').trim(),
    iban: normalizeIban(row.iban),
    branch: String(row.branch || row.branch_name || '').trim(),
    currency,
    active: row.is_active === undefined ? Boolean(row.active ?? true) : Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0)
  };
}

export function validateBankAccount(row = {}) {
  const account = normalizeBankAccount(row);
  const errors = [];
  if (!account.active) errors.push('inactive');
  if (account.bankName.length < 2) errors.push('bank_name');
  if (account.accountName.length < 2) errors.push('account_holder');
  if (!isValidTurkishIban(account.iban)) errors.push('iban');
  if (!SUPPORTED_CURRENCIES.has(account.currency)) errors.push('currency');
  return { valid: errors.length === 0, errors, account };
}

export async function getValidatedBankAccounts(context, limit = 3) {
  try {
    const rows = await selectRows(context, 'payment_bank_accounts', {
      select: 'id,bank_name,account_holder,iban,branch,currency,is_active,sort_order,created_at',
      is_active: 'eq.true',
      order: 'sort_order.asc,created_at.asc',
      limit: String(Math.max(1, Math.min(10, Number(limit || 3))))
    });
    const accounts = (rows || [])
      .map(validateBankAccount)
      .filter((entry) => entry.valid)
      .map((entry) => entry.account);
    return accounts.length ? accounts : fallbackAccounts(limit);
  } catch (error) {
    console.warn('payment_bank_accounts fallback used:', { message: String(error?.message || 'unknown').slice(0, 160) });
    return fallbackAccounts(limit);
  }
}

export async function getPrimaryBankAccount(context) {
  const accounts = await getValidatedBankAccounts(context, 3);
  return accounts[0] || null;
}
