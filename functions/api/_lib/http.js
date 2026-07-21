export function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '127.0.0.1';
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = 15000, timeoutMessage = 'Dış servis zaman aşımına uğradı.') {
  const configured = Number(timeoutMs);
  const delay = Number.isFinite(configured) ? Math.max(1000, Math.min(60000, configured)) : 15000;
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  let upstreamAbort = null;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort(upstreamSignal.reason);
    else {
      upstreamAbort = () => controller.abort(upstreamSignal.reason);
      upstreamSignal.addEventListener('abort', upstreamAbort, { once: true });
    }
  }
  const timer = setTimeout(() => controller.abort(new DOMException(timeoutMessage, 'TimeoutError')), delay);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) {
      const timeoutError = new Error(timeoutMessage);
      timeoutError.name = 'UpstreamTimeoutError';
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstreamSignal && upstreamAbort) upstreamSignal.removeEventListener('abort', upstreamAbort);
  }
}
