export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store, max-age=0');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function noStoreHeaders(extra = {}) {
  return { 'Cache-Control': 'no-store, max-age=0', ...extra };
}

export function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}
