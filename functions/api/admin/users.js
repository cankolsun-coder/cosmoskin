
import { selectRows, insertRow, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { cleanText, normalizeEmail, validEmail } from '../_lib/security.js';

// A1: admin_users is the source of RBAC truth. Minting or elevating an admin_users
// row (including granting role: 'owner') must itself require an existing,
// permission-checked admin identity — not just the shared ADMIN_TOKEN/session that
// assertAdmin() verifies. Owner rows (permissions: ['*']) pass this automatically.
const MANAGE_ADMINS_PERMISSION = 'admin.users.manage';

const ROLES = new Set(['owner','operations','warehouse','customer_support','content_editor']);
const STATUSES = new Set(['active','disabled','invited']);

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    const users = await selectRows(context, 'admin_users', { select: 'id,email,role,status,created_at,updated_at', order: 'email.asc' }).catch(() => []);
    return json({ ok: true, users, note: 'MVP uyumluluğu için ADMIN_TOKEN korunur. Production için authenticated admin users + RBAC kurulmalıdır.' });
  } catch (error) { return adminError(error, 'Admin kullanıcıları alınamadı.'); }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, MANAGE_ADMINS_PERMISSION);
    const body = await readJsonBody(context);
    const email = normalizeEmail(body.email);
    const role = cleanText(body.role || 'operations', 40);
    if (!validEmail(email)) return json({ ok: false, error: 'Geçerli e-posta gerekli.' }, { status: 400 });
    if (!ROLES.has(role)) return json({ ok: false, error: 'Rol geçersiz.' }, { status: 400 });
    const row = await insertRow(context, 'admin_users', { email, role, status: 'active' });
    return json({ ok: true, user: row, message: 'Admin rol temeli kaydedildi.' });
  } catch (error) { return adminError(error, 'Admin kullanıcı oluşturulamadı.'); }
}

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, MANAGE_ADMINS_PERMISSION);
    const body = await readJsonBody(context);
    if (!body.id) return json({ ok: false, error: 'id gerekli.' }, { status: 400 });
    const payload = { updated_at: new Date().toISOString() };
    if (body.role) { const role = cleanText(body.role, 40); if (!ROLES.has(role)) return json({ ok:false,error:'Rol geçersiz.'},{status:400}); payload.role = role; }
    if (body.status) { const status = cleanText(body.status, 40); if (!STATUSES.has(status)) return json({ ok:false,error:'Durum geçersiz.'},{status:400}); payload.status = status; }
    await updateRows(context, 'admin_users', { id: body.id }, payload);
    return json({ ok: true, message: 'Admin rol kaydı güncellendi.' });
  } catch (error) { return adminError(error, 'Admin kullanıcı güncellenemedi.'); }
}
