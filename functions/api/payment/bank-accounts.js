import { getValidatedBankAccounts } from '../_lib/bank-accounts.js';
import { json } from '../_lib/response.js';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

export async function onRequestGet(context) {
  try {
    const accounts = await getValidatedBankAccounts(context, 3);
    const account = accounts[0] || null;
    return json({
      ok: true,
      configured: Boolean(account),
      account,
      accounts,
      message: account ? null : 'Havale/EFT ödeme bilgileri henüz kullanıma hazır değil.'
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('bank account configuration read failed:', { message: String(error?.message || 'unknown').slice(0, 180) });
    return json({
      ok: false,
      configured: false,
      account: null,
      accounts: [],
      error: 'Havale/EFT bilgileri şu anda doğrulanamıyor. Lütfen daha sonra tekrar deneyin.'
    }, { status: 503, headers: NO_STORE });
  }
}
