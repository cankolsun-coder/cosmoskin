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
  const response = await fetch(`${getBaseUrl(env)}${path}`, {
    method: 'POST',
    headers: await buildHeaders(path, env, bodyString),
    body: bodyString
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data.errorMessage || data.errorCode || `iyzico hata kodu: ${response.status}`);
  return data;
}
