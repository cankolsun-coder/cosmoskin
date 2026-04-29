export class ApiError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function ok(data = null, init = {}) {
  return jsonEnvelope({ success: true, data }, init);
}

export function fail(error, init = {}) {
  const status = error?.status || init.status || 500;
  const code = error?.code || 'INTERNAL_ERROR';
  const message = error?.message || 'Beklenmeyen bir hata oluştu.';
  const payload = { success: false, error: { code, message } };
  if (error?.details && status < 500) payload.error.details = error.details;
  return jsonEnvelope(payload, { ...init, status });
}

export function methodNotAllowed(allowed = ['GET']) {
  return fail(new ApiError('METHOD_NOT_ALLOWED', 'Bu endpoint için HTTP metodu desteklenmiyor.', 405), {
    headers: { Allow: allowed.join(', ') }
  });
}

export async function parseJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_JSON', 'Geçersiz JSON gövdesi.', 400);
  }
}

export async function handleApi(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error('COSMOSKIN API error:', error);
    }
    return fail(error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 'İşlem şu anda tamamlanamadı.', 500));
  }
}

function jsonEnvelope(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { ...init, headers });
}
