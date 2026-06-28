import { FALLBACK_BANK_ACCOUNTS, getValidatedBankAccounts } from '../_lib/bank-accounts.js';
import { json } from '../_lib/response.js';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

export async function onRequestGet(context) {
  try {
    const accounts = await getValidatedBankAccounts(context, 5);
    const account = accounts[0] || null;
    return json({
      ok: true,
      configured: Boolean(account),
      account,
      accounts,
      fallback: JSON.stringify(accounts) === JSON.stringify(FALLBACK_BANK_ACCOUNTS.slice(0, accounts.length)),
      message: account ? null : 'Havale/EFT ödeme bilgileri henüz kullanıma hazır değil.'
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('bank account configuration read failed:', { message: String(error?.message || 'unknown').slice(0, 180) });
    const accounts = FALLBACK_BANK_ACCOUNTS.slice(0, 2);
    return json({ ok: true, configured: true, account: accounts[0], accounts, fallback: true, warning: 'Veritabanı banka bilgisi okunamadığı için güvenli COSMOSKIN yedeği kullanıldı.' }, { headers: NO_STORE });
  }
}
