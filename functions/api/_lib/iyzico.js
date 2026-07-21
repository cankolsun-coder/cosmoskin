import { fetchWithTimeout } from './http.js';

function getBaseUrl(env) {
  return (env.IYZICO_BASE_URL || 'https://api.iyzipay.com').replace(/\/$/, '');
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64(str) {
  return btoa(str);
}

async function buildHeaders(path, env, bodyString = '') {
  const apiKey = env.IYZICO_API_KEY;
  const secretKey = env.IYZICO_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error('IYZICO_API_KEY veya IYZICO_SECRET_KEY eksik.');
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const signature = await sha256Hex(randomKey + path + bodyString + secretKey);
  const authorization = b64(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`);
  return {
    Authorization: `IYZWSv2 ${authorization}`,
    'x-iyzi-rnd': randomKey,
    'Content-Type': 'application/json'
  };
}

export async function iyzicoRequest(path, env, payload) {
  const bodyString = payload ? JSON.stringify(payload) : '';
  const response = await fetchWithTimeout(`${getBaseUrl(env)}${path}`, {
    method: 'POST',
    headers: await buildHeaders(path, env, bodyString),
    body: bodyString
  }, Number(env.IYZICO_TIMEOUT_MS || 15000), 'iyzico servisi zaman aşımına uğradı.');
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data.errorMessage || data.errorCode || `iyzico hata kodu: ${response.status}`);
  return data;
}

/**
 * iyzico'nun /payment/iyzipos/refund uç noktası paymentId değil,
 * işlem (item) bazlı paymentTransactionId ister. Bir ödemenin kalem
 * detayları yalnızca checkoutform/auth/ecom/detail yanıtındaki
 * itemTransactions[] içinde bulunur (bkz. extractIyzicoItemTransactions).
 */
export async function refundIyzicoPayment(env, { paymentTransactionId, price, ip, currency = 'TRY', conversationId = null, reason = null, description = null }) {
  if (!paymentTransactionId) throw new Error('paymentTransactionId zorunlu.');
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Refund tutarı geçersiz.');
  const payload = {
    locale: 'tr',
    paymentTransactionId: String(paymentTransactionId),
    price: amount.toFixed(2),
    currency: currency || 'TRY',
    ip: ip || '127.0.0.1'
  };
  if (conversationId) payload.conversationId = String(conversationId);
  if (reason) payload.reason = String(reason);
  if (description) payload.description = String(description).slice(0, 400);
  return iyzicoRequest('/payment/iyzipos/refund', env, payload);
}

/** Extracts per-basket-item transaction ids/amounts from a stored checkoutform detail response. */
export function extractIyzicoItemTransactions(rawCallbackResponse) {
  const list = Array.isArray(rawCallbackResponse?.itemTransactions) ? rawCallbackResponse.itemTransactions : [];
  return list
    .map((item) => ({
      paymentTransactionId: item?.paymentTransactionId ? String(item.paymentTransactionId) : null,
      paidPrice: Number(item?.paidPrice ?? item?.price ?? 0)
    }))
    .filter((item) => item.paymentTransactionId && Number.isFinite(item.paidPrice) && item.paidPrice > 0);
}

/**
 * Splits a single aggregate refund amount across one or more iyzico item
 * transactions (each iyzico refund call can only target one transaction and
 * cannot exceed that transaction's own captured amount).
 */
export function allocateRefundAcrossTransactions(itemTransactions, amount) {
  const target = Math.round(Number(amount || 0) * 100) / 100;
  if (!Number.isFinite(target) || target <= 0) return { allocations: [], remainder: 0 };
  let remaining = target;
  const allocations = [];
  for (const tx of (itemTransactions || [])) {
    if (remaining <= 0) break;
    const share = Math.min(tx.paidPrice, remaining);
    if (share <= 0) continue;
    allocations.push({ paymentTransactionId: tx.paymentTransactionId, amount: Math.round(share * 100) / 100 });
    remaining = Math.round((remaining - share) * 100) / 100;
  }
  return { allocations, remainder: Math.max(0, remaining) };
}
