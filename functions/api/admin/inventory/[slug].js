import { json } from '../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../_lib/admin.js';
import { assertAdminInventoryPayload, normalizeSlug, setInventory } from '../../_lib/inventory.js';

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    const slug = normalizeSlug(context.params?.slug || '');
    const body = await readJsonBody(context);
    const payload = assertAdminInventoryPayload(body);
    if (!Object.keys(payload).length) return json({ ok: false, error: 'Güncellenecek alan yok.' }, { status: 400 });
    const inventory = await setInventory(context, slug, payload, { reason: body.reason || 'manual_adjustment', note: body.note || null, created_by: 'admin' });
    return json({ ok: true, inventory, message: 'Stok bilgisi güncellendi.' });
  } catch (error) {
    return adminError(error, 'Stok bilgisi güncellenemedi. Lütfen tekrar dene.');
  }
}
