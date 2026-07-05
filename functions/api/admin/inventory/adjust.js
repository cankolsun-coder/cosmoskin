import { json } from '../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../_lib/admin.js';
import { requireAdminPermission } from '../../_lib/admin-audit.js';
import { adjustInventory } from '../../_lib/inventory.js';

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'inventory:adjust');
    const body = await readJsonBody(context);
    const inventory = await adjustInventory(context, body);
    return json({ ok: true, inventory, message: 'Stok bilgisi güncellendi.' });
  } catch (error) {
    return adminError(error, 'Stok bilgisi güncellenemedi. Lütfen tekrar dene.');
  }
}
