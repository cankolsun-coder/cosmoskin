import { assertAdmin, adminError } from '../../../_lib/admin.js';
import { requireAdminPermission } from '../../../_lib/admin-audit.js';
import { json } from '../../../_lib/response.js';
import { selectRows } from '../../../_lib/supabase.js';
import { isMissingSaleAuditColumnError, normalizePriceHistoryItem, normalizeProductSlug } from '../../../_lib/product-pricing.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;
const LEGACY_SELECT = 'product_slug,old_regular_price_try,new_regular_price_try,old_currency,new_currency,changed_by_admin,changed_at,reason,source';
const EXTENDED_SELECT = `${LEGACY_SELECT},old_sale_price_try,new_sale_price_try,old_compare_at_price_try,new_compare_at_price_try,old_sale_starts_at,new_sale_starts_at,old_sale_ends_at,new_sale_ends_at`;

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(n)));
}

async function loadPriceHistoryRows(context, slug, limit, before) {
  const params = {
    select: EXTENDED_SELECT,
    product_slug: `eq.${slug}`,
    order: 'changed_at.desc',
    limit: String(limit)
  };
  if (before) params.changed_at = `lt.${before}`;

  try {
    return await selectRows(context, 'product_price_audit_logs', params);
  } catch (error) {
    if (isMissingSaleAuditColumnError(error)) {
      return await selectRows(context, 'product_price_audit_logs', {
        ...params,
        select: LEGACY_SELECT
      }).catch(() => []);
    }
    return [];
  }
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'products:read');

    const slug = normalizeProductSlug(context.params?.slug || '');
    if (!slug) return json({ ok: false, error: 'product_slug gerekli.' }, { status: 400 });

    const url = new URL(context.request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const before = String(url.searchParams.get('before') || '').trim();

    const rows = await loadPriceHistoryRows(context, slug, limit, before);
    const items = (Array.isArray(rows) ? rows : [])
      .slice()
      .sort((a, b) => String(b?.changed_at || '').localeCompare(String(a?.changed_at || '')))
      .slice(0, limit)
      .map((row) => normalizePriceHistoryItem(row)); // event_label + changed_fields

    return json({
      ok: true,
      product_slug: slug,
      items,
      page: {
        limit,
        before: before || null,
        has_more: items.length >= limit
      }
    });
  } catch (error) {
    return adminError(error, 'Fiyat geçmişi alınamadı.');
  }
}
