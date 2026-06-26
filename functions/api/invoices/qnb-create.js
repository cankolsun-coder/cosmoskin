import { assertAdmin, adminError } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { json } from '../_lib/response.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'invoices:update');
    if (String(context.env.EARCHIVE_PROVIDER || 'manual').toLowerCase() !== 'qnb') {
      return json({ ok: false, code: 'EARCHIVE_MANUAL_MODE', error: 'E-arşiv/e-fatura sağlayıcısı manuel modda. QNB API aktivasyonu için provider credentials ve mapping onayı gerekir.' }, { status: 409 });
    }
    if (!context.env.QNB_API_BASE_URL || !context.env.QNB_CLIENT_ID || !context.env.QNB_CLIENT_SECRET) {
      return json({ ok: false, code: 'QNB_NOT_CONFIGURED', error: 'QNB API bilgileri yapılandırılmadı.' }, { status: 503 });
    }
    return json({ ok: false, code: 'QNB_MAPPING_PENDING', error: 'QNB API credentials mevcut görünüyor ancak payload mapping ve resmi test onayı olmadan otomatik fatura kesimi aktif edilmedi.' }, { status: 501 });
  } catch (error) {
    return adminError(error, 'QNB fatura işlemi başlatılamadı.');
  }
}
