import { insertRow, selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, requireUser } from '../_lib/account.js';

const CATEGORIES = new Set(['order', 'product_selection', 'shipping', 'return_request', 'payment', 'account', 'routine', 'other']);

function normalizeCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  return CATEGORIES.has(raw) ? raw : 'other';
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const rows = await selectRows(context, 'support_requests', {
      select: '*',
      user_id: `eq.${auth.user.id}`,
      order: 'created_at.desc',
      limit: '100'
    }).catch(() => []);
    return json({ ok: true, support_requests: rows || [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Destek talepleri alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const subject = cleanString(body.subject || '', 140);
    const message = cleanString(body.message || '', 2000);
    if (subject.length < 3) return json({ ok: false, error: 'Konu alanı zorunlu.' }, { status: 400 });
    if (message.length < 10) return json({ ok: false, error: 'Mesaj en az 10 karakter olmalı.' }, { status: 400 });
    const now = new Date().toISOString();
    const row = await insertRow(context, 'support_requests', {
      user_id: auth.user.id,
      customer_email: auth.user.email || null,
      order_id: body.order_id || body.orderId || null,
      category: normalizeCategory(body.category),
      subject,
      message,
      status: 'açık',
      created_at: now,
      updated_at: now
    });
    return json({ ok: true, support_request: row });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Destek talebi oluşturulamadı.' }, { status: 500 });
  }
}
