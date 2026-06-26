import { adminError, issueAdminSession } from '../_lib/admin.js';
import { json } from '../_lib/response.js';

export async function onRequestPost(context) {
  try {
    const session = await issueAdminSession(context);
    return json({ ok: true, ...session }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminError(error, 'Admin oturumu başlatılamadı.');
  }
}

export function onRequestGet() {
  return json({ ok: false, error: 'Bu endpoint yalnızca POST isteğini kabul eder.' }, {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
}
