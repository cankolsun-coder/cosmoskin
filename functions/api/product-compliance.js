
import { selectRows } from './_lib/supabase.js';
import { json } from './_lib/response.js';
import { normalizeSlug, publicError } from './_lib/security.js';

function publicCompliance(row = {}) {
  return {
    product_slug: row.product_slug,
    barcode: row.barcode || null,
    uts_code_or_reference: row.uts_code_or_reference || null,
    origin_country: row.origin_country || null,
    importer_name: row.importer_name || null,
    distributor_name: row.distributor_name || null,
    inci_ingredients: row.inci_ingredients || null,
    usage_instructions: row.usage_instructions || null,
    warnings: row.warnings || null,
    pao_info: row.pao_info || null,
    expiry_required: Boolean(row.expiry_required)
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = normalizeSlug(url.searchParams.get('slug') || url.searchParams.get('product_slug') || '');
    if (!slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });
    const rows = await selectRows(context, 'product_compliance', {
      select: 'product_slug,barcode,uts_code_or_reference,origin_country,importer_name,distributor_name,inci_ingredients,usage_instructions,warnings,pao_info,expiry_required',
      product_slug: `eq.${slug}`,
      limit: '1'
    }).catch(() => []);
    const record = rows?.[0] || null;
    return json({ ok: true, compliance: record ? publicCompliance(record) : null });
  } catch (error) {
    console.error('product compliance failed:', { message: error?.message || 'unknown' });
    return publicError(error, 'Ürün uygunluk bilgisi şu anda alınamadı.');
  }
}
