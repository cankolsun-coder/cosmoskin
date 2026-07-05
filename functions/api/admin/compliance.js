
import { selectRows, insertRow, updateRows } from '../_lib/supabase.js';
import { catalogProducts, normalizeSlug } from '../_lib/inventory.js';
import { json } from '../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../_lib/admin.js';
import { requireAdminPermission } from '../_lib/admin-audit.js';
import { cleanText } from '../_lib/security.js';

function normalizePayload(body = {}) {
  const payload = {};
  ['barcode','uts_code_or_reference','origin_country','importer_name','distributor_name','inci_ingredients','usage_instructions','warnings','pao_info','admin_note'].forEach((field) => {
    if (body[field] !== undefined) payload[field] = cleanText(body[field], field === 'inci_ingredients' ? 8000 : 2000) || null;
  });
  if (body.expiry_required !== undefined) payload.expiry_required = Boolean(body.expiry_required);
  payload.updated_at = new Date().toISOString();
  return payload;
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'compliance:read');
    const url = new URL(context.request.url);
    const slug = normalizeSlug(url.searchParams.get('product_slug') || url.searchParams.get('slug') || '');
    if (slug) {
      const rows = await selectRows(context, 'product_compliance', { select: '*', product_slug: `eq.${slug}`, limit: '1' }).catch(() => []);
      return json({ ok: true, compliance: rows?.[0] || null });
    }
    const rows = await selectRows(context, 'product_compliance', { select: '*', order: 'product_slug.asc' }).catch(() => []);
    const map = new Map((rows || []).map((row) => [row.product_slug, row]));
    const products = catalogProducts().map((product) => ({
      product_slug: product.slug,
      name: product.name,
      brand: product.brand,
      category: product.category,
      compliance: map.get(product.slug) || null,
      missing_public_compliance: !map.get(product.slug)
    }));
    return json({ ok: true, products });
  } catch (error) {
    return adminError(error, 'Compliance bilgileri alınamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'products:update');
    const body = await readJsonBody(context);
    const slug = normalizeSlug(body.product_slug || body.slug);
    if (!slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });
    const payload = normalizePayload(body);
    const existing = await selectRows(context, 'product_compliance', { select: 'id', product_slug: `eq.${slug}`, limit: '1' }).catch(() => []);
    let row;
    if (existing?.[0]?.id) {
      await updateRows(context, 'product_compliance', { product_slug: slug }, payload);
      row = (await selectRows(context, 'product_compliance', { select: '*', product_slug: `eq.${slug}`, limit: '1' }).catch(() => []))?.[0] || null;
    } else {
      row = await insertRow(context, 'product_compliance', { product_slug: slug, ...payload });
    }
    return json({ ok: true, compliance: row, message: 'Compliance alanları kaydedildi.' });
  } catch (error) {
    return adminError(error, 'Compliance kaydı güncellenemedi.');
  }
}
