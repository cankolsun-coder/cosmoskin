import { json } from '../../../_lib/response.js';
import { assertAdmin, adminError } from '../../../_lib/admin.js';
import { normalizeSlug } from '../../../_lib/inventory.js';
import { selectRows } from '../../../_lib/supabase.js';

export async function onRequestGet(context) {
  try {
    assertAdmin(context);
    const slug = normalizeSlug(context.params?.slug || '');
    const movements = await selectRows(context, 'inventory_movements', {
      select: '*',
      product_slug: `eq.${slug}`,
      order: 'created_at.desc',
      limit: '100'
    });
    return json({ ok: true, movements: movements || [] });
  } catch (error) {
    return adminError(error, 'Stok hareketleri alınamadı.');
  }
}
