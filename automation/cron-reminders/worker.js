function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' }
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validateEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function getSiteUrl(env) {
  return String(env.PUBLIC_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr').trim().replace(/\/$/, '');
}

function getSupabaseBase(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.');
  return { url, serviceRoleKey };
}

function adminHeaders(env, extra = {}) {
  const { serviceRoleKey } = getSupabaseBase(env);
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!response.ok) {
    const msg = data?.message || data?.error_description || data?.error || data?.hint || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return data;
}

async function selectRows(env, table, params = {}) {
  const { url } = getSupabaseBase(env);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const response = await fetch(`${url}/rest/v1/${table}?${qs.toString()}`, { headers: adminHeaders(env) });
  return parseResponse(response);
}

async function listAuthUsers(env, page = 1, perPage = 200) {
  const { url } = getSupabaseBase(env);
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  const response = await fetch(`${url}/auth/v1/admin/users?${qs.toString()}`, {
    headers: adminHeaders(env, { 'Content-Type': 'application/json' })
  });
  return parseResponse(response);
}

async function updateAuthUserMetadata(env, userId, metadataPatch = {}) {
  const { url } = getSupabaseBase(env);
  const existing = metadataPatch.__existing || {};
  delete metadataPatch.__existing;
  const nextMetadata = { ...existing, ...metadataPatch };
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: adminHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_metadata: nextMetadata })
  });
  return parseResponse(response);
}

function inferItemMeta(item = {}) {
  const source = `${item.product_id || ''} ${item.product_name || ''}`.toLowerCase();
  if (/clean|foam|gel cleanser|gentle cleanser/.test(source)) return { category: 'cleanser', display: 'Temizleyici' };
  if (/toner|mist|pad/.test(source)) return { category: 'toner', display: 'Toner' };
  if (/serum|hyaluronic|essence|ampoule/.test(source)) return { category: 'serum', display: 'Serum' };
  if (/cream|moist|barrier|lotion/.test(source)) return { category: 'moisturizer', display: 'Nemlendirici' };
  if (/spf|sun|protect|sunscreen/.test(source)) return { category: 'sunscreen', display: 'Güneş Koruması' };
  if (/mask|peel|acid|vitamin|retinal|retinol|treat|glow/.test(source)) return { category: 'treatment', display: 'Bakım' };
  return { category: 'product', display: item.product_name || 'Ürün' };
}

function getReminderPrefs(user = {}) {
  const meta = user.user_metadata || {};
  return {
    routineEmails: meta.routine_reminders?.routineEmails !== false,
    restockEmails: !!meta.routine_reminders?.restockEmails,
    lowStockAlerts: !!meta.routine_reminders?.lowStockAlerts,
    cadenceDays: Number(meta.routine_reminders?.cadenceDays || 14),
    depletionLeadDays: Number(meta.routine_reminders?.depletionLeadDays || 5),
    lastRoutineSentAt: String(meta.routine_reminders?.lastRoutineSentAt || '').trim(),
    lastRestockSentAt: String(meta.routine_reminders?.lastRestockSentAt || '').trim()
  };
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / 86400000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d;
}

function formatTrDate(date) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function getRestockEstimate(latestOrder, items = [], prefs = {}) {
  const categoryDays = { cleanser: 30, toner: 35, serum: 30, treatment: 28, moisturizer: 40, sunscreen: 25, product: 30 };
  const evaluated = items.map((item) => {
    const meta = inferItemMeta(item);
    const qty = Math.max(1, Number(item.quantity || 1));
    const threshold = Math.max(7, (categoryDays[meta.category] || 30) * qty - Number(prefs.depletionLeadDays || 5));
    return { item, meta, threshold, dueAt: addDays(latestOrder.created_at, threshold) };
  }).sort((a, b) => a.dueAt - b.dueAt);
  return evaluated[0] || null;
}

function shouldSendRoutine(latestOrder, prefs = {}, now = new Date()) {
  if (!prefs.routineEmails) return false;
  if (!latestOrder?.created_at) return false;
  const anchor = prefs.lastRoutineSentAt ? new Date(prefs.lastRoutineSentAt) : new Date(latestOrder.created_at);
  return daysBetween(anchor, now) >= Number(prefs.cadenceDays || 14);
}

function shouldSendRestock(latestOrder, items = [], prefs = {}, now = new Date()) {
  if (!(prefs.restockEmails || prefs.lowStockAlerts)) return { due: false, estimate: null };
  if (!latestOrder?.created_at || !items.length) return { due: false, estimate: null };
  const estimate = getRestockEstimate(latestOrder, items, prefs);
  if (!estimate) return { due: false, estimate: null };
  const alreadySentAfterDue = prefs.lastRestockSentAt && new Date(prefs.lastRestockSentAt) >= startOfDay(estimate.dueAt);
  return { due: !alreadySentAfterDue && startOfDay(now) >= startOfDay(estimate.dueAt), estimate };
}

function buildEmailShell({ title, preheader, eyebrow, body, footer, env }) {
  const siteUrl = getSiteUrl(env);
  const logoUrl = `${siteUrl}/assets/logo-mark.png`;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#181818;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${escapeHtml(preheader || '')}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ea;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #e7ded2;border-radius:20px;overflow:hidden;"><tr><td style="padding:28px 28px 24px;background:linear-gradient(180deg,#f7f2eb 0%,#f3ede5 100%);border-bottom:1px solid #ebe2d7;text-align:center;"><a href="${siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;"><img src="${logoUrl}" alt="COSMOSKIN" width="68" style="display:block;margin:0 auto 10px;width:68px;max-width:68px;height:auto;border:0;"></a><div style="font-size:18px;line-height:1.1;letter-spacing:3px;text-transform:uppercase;color:#161616;font-weight:600;">COSMOSKIN</div><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;margin-top:10px;">Premium Korean Skincare</div></td></tr><tr><td style="padding:34px 28px 28px;">${eyebrow ? `<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:10px;">${escapeHtml(eyebrow)}</div>` : ''}${body}</td></tr><tr><td style="padding:0 28px 28px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr><td align="center" style="border-radius:999px;background:#141414;"><a href="${siteUrl}/routine.html" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13px;line-height:1;color:#ffffff;text-decoration:none;font-weight:600;">Rutinini Gör</a></td><td style="width:10px;"></td><td align="center" style="border-radius:999px;background:#f4eee7;border:1px solid #e7ded2;"><a href="${siteUrl}/account/profile.html?tab=communication" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13px;line-height:1;color:#181818;text-decoration:none;font-weight:600;">Tercihleri Güncelle</a></td></tr></table></td></tr><tr><td style="padding:20px 28px;background:#faf7f2;border-top:1px solid #eee5da;">${footer}<div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee5da;font-size:12px;line-height:1.8;color:#857a6f;text-align:center;">${escapeHtml(env.CONTACT_TO_EMAIL || env.CONTACT_FROM_EMAIL || 'destek@cosmoskin.com.tr')} · İstanbul, Türkiye</div></td></tr></table></td></tr></table></body></html>`;
}

function buildReminderEmail({ type, name, email, cadenceDays, highlights, nextDate, env }) {
  const title = type === 'restock' ? 'Ürünlerini yenileme zamanı yaklaşıyor' : 'Rutinine dönme zamanı';
  const preheader = type === 'restock' ? 'Rutinindeki bazı ürünler yakında bitebilir.' : 'Sabah ve akşam adımlarını tazelemek için kısa bir hatırlatma.';
  const eyebrow = type === 'restock' ? 'Yeniden Sipariş Hatırlatması' : 'Rutin Hatırlatması';
  const greeting = escapeHtml(name || email || 'Merhaba');
  const points = (highlights || []).slice(0, 4).map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`).join('');
  const body = `<div style="margin-bottom:20px;"><h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:600;color:#141414;">${escapeHtml(title)}</h1><p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">Merhaba ${greeting},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">${type === 'restock' ? 'Rutinindeki bazı ürünler kullanım sıklığına göre yeniden sipariş zamanına yaklaşmış olabilir.' : 'Seçtiğin akışa göre kısa bir rutin kontrolü yapmak için iyi bir zaman.'}</p></div><div style="padding:20px;border:1px solid #ece3d8;border-radius:16px;background:#fcfaf7;"><div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:12px;">Özet</div><p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#4f473f;">Hatırlatma sıklığı: <strong style="color:#141414;">${Number(cadenceDays || 14)} gün</strong></p>${points ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#4f473f;">${points}</ul>` : '<p style="margin:0;font-size:14px;line-height:1.8;color:#4f473f;">Rutinini ve son siparişlerini hesabından gözden geçirebilirsin.</p>'}${nextDate ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.8;color:#4f473f;">Bir sonraki planlanan temas tarihi: <strong style="color:#141414;">${escapeHtml(nextDate)}</strong></p>` : ''}</div><p style="margin:22px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">Tercihlerini hesabındaki <strong style="color:#141414;">İletişim Tercihlerim</strong> alanından dilediğin zaman güncelleyebilirsin.</p>`;
  const footer = `<div style="font-size:12px;line-height:1.7;color:#857a6f;text-align:center;">Bu mesaj COSMOSKIN hatırlatma merkezi üzerinden gönderildi.</div>`;
  return buildEmailShell({ title, preheader, eyebrow, body, footer, env });
}

async function sendBrevoEmail(env, payload) {
  if (!env.BREVO_API_KEY || !env.CONTACT_FROM_EMAIL) throw new Error('BREVO_API_KEY veya CONTACT_FROM_EMAIL eksik.');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
      accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

async function getLatestPaidOrderWithItems(env, userId) {
  const orders = await selectRows(env, 'orders', {
    select: 'id,order_number,total_amount,created_at,status',
    user_id: `eq.${userId}`,
    status: 'eq.paid',
    order: 'created_at.desc',
    limit: 1
  });
  const latest = Array.isArray(orders) && orders.length ? orders[0] : null;
  if (!latest?.id) return { latestOrder: null, items: [] };
  const items = await selectRows(env, 'order_items', {
    select: 'product_id,product_name,brand,quantity,line_total',
    order_id: `eq.${latest.id}`
  });
  return { latestOrder: latest, items: Array.isArray(items) ? items : [] };
}

function buildRoutineHighlights(items = []) {
  const mapped = items.slice(0, 3).map((item) => inferItemMeta(item).display);
  if (!mapped.length) return ['Hesabındaki son siparişlerini ve kullanım sırasını gözden geçir.'];
  return [`Son siparişindeki ürünler: ${mapped.join(', ')}`, 'Sabah ve akşam akışını hesabından kontrol et.'];
}

function buildRestockHighlights(estimate, items = []) {
  const primary = estimate?.item?.product_name || inferItemMeta(estimate?.item || {}).display || 'ürün';
  const supporting = items.filter((item) => item !== estimate?.item).slice(0, 2).map((item) => item.product_name || inferItemMeta(item).display);
  const out = [`${primary} için yenileme zamanı yaklaşmış olabilir.`];
  if (supporting.length) out.push(`Rutini destekleyen diğer ürünler: ${supporting.join(', ')}`);
  return out;
}

async function processUser(env, user, now = new Date()) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (!validateEmail(email)) return { skipped: true, reason: 'invalid_email' };

  const prefs = getReminderPrefs(user);
  if (!(prefs.routineEmails || prefs.restockEmails || prefs.lowStockAlerts)) {
    return { skipped: true, reason: 'optout' };
  }

  const { latestOrder, items } = await getLatestPaidOrderWithItems(env, user.id);
  if (!latestOrder) return { skipped: true, reason: 'no_paid_order' };

  const senderName = env.BREVO_SENDER_NAME || 'COSMOSKIN';
  const fullName = [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ').trim();
  const sendQueue = [];

  if (shouldSendRoutine(latestOrder, prefs, now)) {
    sendQueue.push({
      type: 'routine',
      cadenceDays: prefs.cadenceDays,
      highlights: buildRoutineHighlights(items),
      nextDate: formatTrDate(addDays(now, prefs.cadenceDays))
    });
  }

  const restock = shouldSendRestock(latestOrder, items, prefs, now);
  if (restock.due) {
    sendQueue.push({
      type: 'restock',
      cadenceDays: prefs.cadenceDays,
      highlights: buildRestockHighlights(restock.estimate, items),
      nextDate: formatTrDate(addDays(restock.estimate.dueAt, Math.max(7, prefs.cadenceDays)))
    });
  }

  if (!sendQueue.length) return { skipped: true, reason: 'not_due' };

  for (const job of sendQueue) {
    const htmlContent = buildReminderEmail({ ...job, email, name: fullName, env });
    await sendBrevoEmail(env, {
      sender: { email: env.CONTACT_FROM_EMAIL, name: senderName },
      to: [{ email, name: fullName || email }],
      subject: job.type === 'restock' ? 'COSMOSKIN | Yeniden sipariş zamanı yaklaşıyor' : 'COSMOSKIN | Rutin hatırlatman hazır',
      htmlContent,
      textContent: job.type === 'restock'
        ? 'Rutinindeki bazı ürünler yakında bitebilir. Hesabından yeniden sipariş önerilerini gözden geçir.'
        : 'Rutinine dönme zamanı. Hesabından sabah ve akşam akışını gözden geçir.'
    });
  }

  const existingMeta = user.user_metadata || {};
  const nextPrefs = {
    ...(existingMeta.routine_reminders || {}),
    ...(sendQueue.some((x) => x.type === 'routine') ? { lastRoutineSentAt: now.toISOString() } : {}),
    ...(sendQueue.some((x) => x.type === 'restock') ? { lastRestockSentAt: now.toISOString() } : {})
  };
  await updateAuthUserMetadata(env, user.id, {
    __existing: existingMeta,
    routine_reminders: nextPrefs
  });

  return { ok: true, email, sent: sendQueue.map((x) => x.type) };
}

async function runDispatch(env, options = {}) {
  const now = options.now || new Date();
  const limit = Math.max(1, Number(options.limit || env.CRON_BATCH_LIMIT || 200));
  const perPage = Math.min(200, limit);
  let page = 1;
  let scanned = 0;
  let sent = 0;
  const errors = [];
  const sentTo = [];

  while (scanned < limit) {
    const data = await listAuthUsers(env, page, perPage);
    const users = Array.isArray(data?.users) ? data.users : [];
    if (!users.length) break;
    for (const user of users) {
      if (scanned >= limit) break;
      scanned += 1;
      try {
        const result = await processUser(env, user, now);
        if (result?.ok) {
          sent += result.sent.length;
          sentTo.push({ email: result.email, types: result.sent });
        }
      } catch (error) {
        errors.push({ email: user?.email || '', error: error.message || 'Bilinmeyen hata' });
      }
    }
    if (users.length < perPage) break;
    page += 1;
  }

  return { ok: true, scanned, sent, sentTo, errors };
}

function authorizeManualRun(request, env) {
  const supplied = request.headers.get('x-reminder-secret') || new URL(request.url).searchParams.get('secret') || '';
  return !!env.REMINDER_CRON_SECRET && supplied === env.REMINDER_CRON_SECRET;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true, worker: 'cosmoskin-reminder-cron', site: getSiteUrl(env) });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      if (!authorizeManualRun(request, env)) return json({ ok: false, error: 'Yetkisiz istek.' }, 401);
      try {
        const result = await runDispatch(env, { limit: Number(url.searchParams.get('limit') || env.CRON_BATCH_LIMIT || 200) });
        return json(result, 200);
      } catch (error) {
        return json({ ok: false, error: error.message || 'Cron çalıştırılamadı.' }, 500);
      }
    }
    return json({ ok: false, error: 'Not found' }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDispatch(env, { now: new Date(controller.scheduledTime) }));
  }
};
