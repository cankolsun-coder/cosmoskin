import { insertRow, selectRows } from './supabase.js';

function requestIp(context) {
  const headers = context?.request?.headers || new Headers();
  return headers.get('CF-Connecting-IP') || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
}

function userAgent(context) {
  return String(context?.request?.headers?.get('user-agent') || '').slice(0, 240);
}

export function getAccessEmail(context) {
  return context?.request?.headers?.get('Cf-Access-Authenticated-User-Email') || null;
}

export async function getAdminRecord(context) {
  const email = getAccessEmail(context);
  if (!email) return null;
  const rows = await selectRows(context, 'admin_users', {
    select: 'id,email,role,role_code,permissions,is_active',
    email: `eq.${String(email).toLowerCase()}`,
    limit: '1'
  }).catch(() => []);
  return rows?.[0] || null;
}

export async function hasAdminPermission(context, permission) {
  const admin = await getAdminRecord(context);
  if (!admin) return true; // Cloudflare Access + signed session remains the P0 gate until table rows are seeded.
  if (admin.is_active === false) return false;
  const direct = Array.isArray(admin.permissions) ? admin.permissions : [];
  if (direct.includes('*') || direct.includes(permission)) return true;
  const role = admin.role_code || admin.role || 'operations';
  if (role === 'owner') return true;
  const rows = await selectRows(context, 'admin_permissions', {
    select: 'permission',
    role_code: `eq.${role}`
  }).catch(() => []);
  return (rows || []).some((row) => row.permission === '*' || row.permission === permission);
}

export async function requireAdminPermission(context, permission) {
  if (!(await hasAdminPermission(context, permission))) {
    const error = new Error('Bu işlem için admin yetkiniz bulunmuyor.');
    error.status = 403;
    throw error;
  }
  return true;
}

export async function recordAdminActivity(context, { action, resource_type, resource_id, before_data = null, after_data = null, metadata = {} }) {
  try {
    const admin = await getAdminRecord(context);
    await insertRow(context, 'admin_activity_logs', {
      actor_user_id: admin?.id || null,
      actor_email: admin?.email || getAccessEmail(context),
      role_code: admin?.role_code || admin?.role || null,
      action,
      resource_type,
      resource_id: resource_id ? String(resource_id) : null,
      before_data,
      after_data,
      ip_address: requestIp(context),
      user_agent: userAgent(context),
      metadata
    });
  } catch (error) {
    console.error('admin activity log failed:', { action, message: error?.message || 'unknown' });
  }
}
