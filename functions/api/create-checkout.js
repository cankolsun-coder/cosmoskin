import { createClient } from '@supabase/supabase-js';

function getSupabase(context) {
  const env = context?.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase yapılandırması eksik.');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getUserFromAccessToken(context, accessToken) {
  if (!accessToken) return null;
  const supabase = getSupabase(context);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) return null;
  return data?.user || null;
}

function applyFilter(query, key, value) {
  const raw = String(value || '');
  if (raw.startsWith('eq.')) return query.eq(key, raw.slice(3));
  if (raw.startsWith('in.(') && raw.endsWith(')')) return query.in(key, raw.slice(4, -1).split(',').map((item) => item.replace(/^"|"$/g, '')).filter(Boolean));
  if (raw.startsWith('gt.')) return query.gt(key, raw.slice(3));
  if (raw.startsWith('lt.')) return query.lt(key, raw.slice(3));
  return query.eq(key, raw);
}

async function selectRows(context, table, params = {}) {
  const supabase = getSupabase(context);
  let query = supabase.from(table).select(params.select || '*');
  for (const [key, value] of Object.entries(params)) {
    if (['select', 'order', 'limit'].includes(key) || value === undefined || value === null || value === '') continue;
    query = applyFilter(query, key, value);
  }
  if (params.order) {
    String(params.order).split(',').forEach((part) => {
      const [column, direction] = part.trim().split('.');
      if (column) query = query.order(column, { ascending: direction !== 'desc' });
    });
  }
  if (params.limit) query = query.limit(Number(params.limit));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function insertRow(context, table, payload) {
  const supabase = getSupabase(context);
  const { data, error } = await supabase.from(table).insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

async function insertRows(context, table, rows) {
  if (!Array.isArray(rows) || !rows.length) return true;
  const supabase = getSupabase(context);
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(error.message);
  return true;
}

async function updateRows(context, table, filters, payload) {
  const supabase = getSupabase(context);
  let query = supabase.from(table).update(payload);
  for (const [key, value] of Object.entries(filters || {})) query = query.eq(key, value);
  const { error } = await query;
  if (error) throw new Error(error.message);
  return true;
}

function getBaseUrl(env) { return String(env.IYZICO_BASE_URL || 'https://api.iyzipay.com').replace(/\/$/, ''); }
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function iyzicoHeaders(path, env, bodyString = '') {
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) throw new Error('IYZICO_API_KEY veya IYZICO_SECRET_KEY eksik.');
  const randomKey = String(Date.now()) + String(Math.floor(Math.random() * 1000000));
  const signature = await sha256Hex(randomKey + path + bodyString + env.IYZICO_SECRET_KEY);
  const authorization = btoa('apiKey:' + env.IYZICO_API_KEY + '&randomKey:' + randomKey + '&signature:' + signature);
  return { Authorization: 'IYZWSv2 ' + authorization, 'x-iyzi-rnd': randomKey, 'Content-Type': 'application/json' };
}
async function iyzicoRequest(path, env, payload) {
  const bodyString = payload ? JSON.stringify(payload) : '';
  const response = await fetch(getBaseUrl(env) + path, { method: 'POST', headers: await iyzicoHeaders(path, env, bodyString), body: bodyString });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data.errorMessage || data.errorCode || ('iyzico hata kodu: ' + response.status));
  return data;
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

const productSource = {"products":[{"slug":"anua-heartleaf-77-soothing-toner","name":"Heartleaf 77% Soothing Toner","brand":"Anua","category":"Tonik & Essence","price":849,"volume":"250 ml","image":"/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp","url":"/products/anua-heartleaf-77-soothing-toner.html","keywords":["anua","heartleaf","soothing toner","tonik","hassas","yatıştırıcı","centella","nem","doğal","kore"],"aliases":["anua-heartleaf-toner"]},{"slug":"anua-heartleaf-pore-control-cleansing-oil","name":"Heartleaf Pore Control Cleansing Oil","brand":"Anua","category":"Temizleyiciler","price":849,"volume":"200 ml","image":"/assets/img/products/anua/anua-heartleaf-pore-control-cleansing-oil-card.webp","url":"/products/anua-heartleaf-pore-control-cleansing-oil.html","keywords":["anua","heartleaf","cleansing oil","temizleyici","gözenek","yağ bazlı","makyaj","temizleme"],"aliases":["anua-cleansing-oil"]},{"slug":"beauty-of-joseon-relief-sun-spf50","name":"Relief Sun: Rice + Probiotics SPF 50+ PA++++","brand":"Beauty of Joseon","category":"Güneş Koruyucular","price":899,"volume":"50 ml","image":"/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp","url":"/products/beauty-of-joseon-relief-sun-spf50.html","keywords":["beauty of joseon","relief sun","spf50","güneş koruyucu","pirinç","probiyotik","spf","pa++++","günlük","kore spf"],"aliases":["boj-relief","beauty-of-joseon-relief-sun-spf50-pa"]},{"slug":"beauty-of-joseon-glow-serum-propolis-niacinamide","name":"Glow Serum: Propolis + Niacinamide","brand":"Beauty of Joseon","category":"Serum & Ampul","price":879,"volume":"30 ml","image":"/assets/img/products/beauty-of-joseon/beauty-of-joseon-glow-serum-propolis-niacinamide-card.webp","url":"/products/beauty-of-joseon-glow-serum-propolis-niacinamide.html","keywords":["beauty of joseon","glow serum","propolis","niacinamide","ışıltı","ton eşitsizliği","serum","niasinamid","boj"],"aliases":["boj-glow","beauty-of-joseon-glow-serum"]},{"slug":"beauty-of-joseon-glow-deep-serum","name":"Glow Deep Serum: Rice + Arbutin","brand":"Beauty of Joseon","category":"Serum & Ampul","price":949,"volume":"30 ml","image":"/assets/img/products/beauty-of-joseon/beauty-of-joseon-glow-deep-serum-card.webp","url":"/products/beauty-of-joseon-glow-deep-serum.html","keywords":["beauty of joseon","glow deep serum","arbutin","pirinç","leke","ışıltı","serum","boj","aydınlatıcı"],"aliases":["boj-glow-deep"]},{"slug":"beauty-of-joseon-dynasty-cream","name":"Dynasty Cream","brand":"Beauty of Joseon","category":"Nemlendiriciler","price":999,"volume":"50 ml","image":"/assets/img/products/beauty-of-joseon/beauty-of-joseon-dynasty-cream-card.webp","url":"/products/beauty-of-joseon-dynasty-cream.html","keywords":["beauty of joseon","dynasty cream","nem","krem","bariyer","boj","gece kremi"],"aliases":["boj-dynasty"]},{"slug":"beauty-of-joseon-green-plum-refreshing-cleanser","name":"Green Plum Refreshing Cleanser","brand":"Beauty of Joseon","category":"Temizleyiciler","price":729,"volume":"170 ml","image":"/assets/img/products/beauty-of-joseon/beauty-of-joseon-green-plum-refreshing-cleanser-card.webp","url":"/products/beauty-of-joseon-green-plum-refreshing-cleanser.html","keywords":["beauty of joseon","green plum","cleanser","yeşil erik","temizleyici","köpük","günlük","boj"],"aliases":["boj-green-plum"]},{"slug":"by-wishtrend-pure-vitamin-c-21-5-serum","name":"Pure Vitamin C 21.5% Advanced Serum","brand":"By Wishtrend","category":"Serum & Ampul","price":1149,"volume":"30 ml","image":"/assets/img/products/by-wishtrend/by-wishtrend-pure-vitamin-c-21-5-serum-card.webp","url":"/products/by-wishtrend-pure-vitamin-c-21-5-serum.html","keywords":["by wishtrend","vitamin c","serum","c vitamini","aydınlatıcı","leke","antioksidan"],"aliases":["bywishtrend-vitc"]},{"slug":"cosrx-advanced-snail-96-mucin-essence","name":"Advanced Snail 96 Mucin Power Essence","brand":"COSRX","category":"Tonik & Essence","price":979,"volume":"100 ml","image":"/assets/img/products/cosrx/cosrx-advanced-snail-96-mucin-essence-card.webp","url":"/products/cosrx-advanced-snail-96-mucin-essence.html","keywords":["cosrx","snail","mucin","essence","salyangoz","bariyer","nem","essans"],"aliases":["cosrx-snail"]},{"slug":"cosrx-the-vitamin-c-23-serum","name":"The Vitamin C 23 Serum","brand":"COSRX","category":"Serum & Ampul","price":999,"volume":"20 g","image":"/assets/img/products/cosrx/vitamin-c-23-serum-card.png","url":"/products/cosrx-the-vitamin-c-23-serum.html","keywords":["cosrx","vitamin c 23","serum","c vitamini","leke","ton","aydınlatıcı","antioksidan"],"aliases":["cosrx-vitc"]},{"slug":"cosrx-acne-pimple-master-patch","name":"Acne Pimple Master Patch","brand":"COSRX","category":"Maskeler","price":449,"volume":"24 adet","image":"/assets/img/products/cosrx/cosrx-acne-pimple-master-patch-card.webp","url":"/products/cosrx-acne-pimple-master-patch.html","keywords":["cosrx","acne patch","pimple","sivilce bandı","akne","gözenek","nokta tedavi"],"aliases":["cosrx-patch"],"concernSlugs":["blemish"]},{"slug":"cosrx-aha-bha-clarifying-treatment-toner","name":"AHA/BHA Clarifying Treatment Toner","brand":"COSRX","category":"Tonik & Essence","price":879,"volume":"150 ml","image":"/assets/img/products/cosrx/cosrx-aha-bha-clarifying-treatment-toner-card.webp","url":"/products/cosrx-aha-bha-clarifying-treatment-toner.html","keywords":["cosrx","aha","bha","toner","tonik","asit","gözenek","akne","arındırıcı"],"aliases":["cosrx-aha-bha"],"concernSlugs":["blemish"]},{"slug":"cosrx-low-ph-good-morning-gel-cleanser","name":"Low pH Good Morning Gel Cleanser","brand":"COSRX","category":"Temizleyiciler","price":749,"volume":"150 ml","image":"/assets/img/products/cosrx/cosrx-low-ph-good-morning-gel-cleanser-card.webp","url":"/products/cosrx-low-ph-good-morning-gel-cleanser.html","keywords":["cosrx","low ph","gel cleanser","jel temizleyici","düşük ph","sabah","günlük"],"aliases":["cosrx-morning"]},{"slug":"cosrx-salicylic-acid-daily-gentle-cleanser","name":"Salicylic Acid Daily Gentle Cleanser","brand":"COSRX","category":"Temizleyiciler","price":769,"volume":"150 ml","image":"/assets/img/products/cosrx/cosrx-salicylic-acid-daily-gentle-cleanser-card.webp","url":"/products/cosrx-salicylic-acid-daily-gentle-cleanser.html","keywords":["cosrx","salicylic acid","cleanser","salisilik asit","temizleyici","akne","günlük"],"aliases":["cosrx-salicylic"],"concernSlugs":["blemish"]},{"slug":"cosrx-oil-free-ultra-moisturizing-lotion","name":"Oil-Free Ultra Moisturizing Lotion","brand":"COSRX","category":"Nemlendiriciler","price":849,"volume":"100 ml","image":"/assets/img/products/cosrx/cosrx-oil-free-ultra-moisturizing-lotion-card.webp","url":"/products/cosrx-oil-free-ultra-moisturizing-lotion.html","keywords":["cosrx","oil free","moisturizing","nemlendirici","yağsız","lotion","hafif"],"aliases":["cosrx-lotion"]},{"slug":"dr-jart-ceramidin-cream","name":"Ceramidin Cream","brand":"Dr. Jart+","category":"Nemlendiriciler","price":1249,"volume":"50 ml","image":"/assets/img/products/dr-jart/dr-jart-ceramidin-cream-card.webp","url":"/products/dr-jart-ceramidin-cream.html","keywords":["dr jart","ceramidin","cream","seramid","krem","bariyer","nem","onarıcı"],"aliases":["drjart-ceramidin"]},{"slug":"goodal-green-tangerine-vitamin-c-serum","name":"Green Tangerine Vita C Dark Spot Serum","brand":"Goodal","category":"Serum & Ampul","price":1099,"volume":"30 ml","image":"/assets/img/products/goodal/goodal-green-tangerine-vitamin-c-serum-card.webp","url":"/products/goodal-green-tangerine-vitamin-c-serum.html","keywords":["goodal","green tangerine","vitamin c","yeşil mandalin","c vitamini","serum","aydınlatıcı","leke"],"aliases":["goodal-vitc"]},{"slug":"im-from-rice-toner","name":"Rice Toner","brand":"I'm From","category":"Tonik & Essence","price":899,"volume":"150 ml","image":"/assets/img/products/im-from/im-from-rice-toner-card.webp","url":"/products/im-from-rice-toner.html","keywords":["im from","rice toner","pirinç tonik","nem","parlak","tonik","kore"],"aliases":["imfrom-rice"]},{"slug":"innisfree-super-volcanic-clay-mask","name":"Super Volcanic Clay Mask 2X","brand":"Innisfree","category":"Maskeler","price":649,"volume":"100 ml","image":"/assets/img/products/innisfree/innisfree-super-volcanic-clay-mask-card.webp","url":"/products/innisfree-super-volcanic-clay-mask.html","keywords":["innisfree","volcanic clay","kil maskesi","gözenek","arındırıcı","maske","volkanik kil"],"aliases":["innisfree-clay"],"concernSlugs":["blemish"]},{"slug":"isntree-hyaluronic-acid-watery-sun-gel","name":"Hyaluronic Acid Watery Sun Gel SPF 50+ PA++++","brand":"Isntree","category":"Güneş Koruyucular","price":879,"volume":"50 ml","image":"/assets/img/products/isntree/isntree-hyaluronic-acid-watery-sun-gel-card.webp","url":"/products/isntree-hyaluronic-acid-watery-sun-gel.html","keywords":["isntree","hyaluronic acid","sun gel","hyalüronik asit","güneş","spf","jel","hafif"],"aliases":["isntree-sun"]},{"slug":"laneige-water-sleeping-mask","name":"Water Sleeping Mask","brand":"Laneige","category":"Maskeler","price":1199,"volume":"70 ml","image":"/assets/img/products/laneige/laneige-water-sleeping-mask-card.webp","url":"/products/laneige-water-sleeping-mask.html","keywords":["laneige","water sleeping mask","uyku maskesi","gece","nem","maske","hydration"],"aliases":["laneige-sleeping"]},{"slug":"medicube-zero-pore-pad","name":"Zero Pore Pad","brand":"Medicube","category":"Tonik & Essence","price":849,"volume":"70 adet","image":"/assets/img/products/medicube/medicube-zero-pore-pad-card.webp","url":"/products/medicube-zero-pore-pad.html","keywords":["medicube","zero pore pad","gözenek pedi","aha","bha","toner pad","gözenek"],"aliases":["medicube-pad"],"concernSlugs":["blemish"]},{"slug":"medicube-collagen-night-wrapping-mask","name":"Collagen Night Wrapping Mask","brand":"Medicube","category":"Maskeler","price":849,"volume":"100 ml","image":"/assets/img/products/medicube/medicube-collagen-night-wrapping-mask-card.webp","url":"/products/medicube-collagen-night-wrapping-mask.html","keywords":["medicube","collagen","night mask","kolajen","gece maskesi","sarma","sıkılaştırıcı"],"aliases":["medicube-mask"],"concernSlugs":["blemish"]},{"slug":"mediheal-nmf-aquaring-sheet-mask","name":"NMF Aquaring Ampoule Mask","brand":"Mediheal","category":"Maskeler","price":549,"volume":"1 adet","image":"/assets/img/products/mediheal/mediheal-nmf-aquaring-sheet-mask-card.webp","url":"/products/mediheal-nmf-aquaring-sheet-mask.html","keywords":["mediheal","nmf","aquaring","sheet mask","yaprak maske","nem","hydration"],"aliases":["mediheal-nmf"]},{"slug":"round-lab-1025-dokdo-cleanser","name":"1025 Dokdo Cleanser","brand":"Round Lab","category":"Temizleyiciler","price":729,"volume":"150 ml","image":"/assets/img/products/round-lab/round-lab-1025-dokdo-cleanser-card.webp","url":"/products/round-lab-1025-dokdo-cleanser.html","keywords":["round lab","dokdo cleanser","deniz suyu","temizleyici","nazik","köpük","günlük"],"aliases":["roundlab-cleanser"]},{"slug":"round-lab-dokdo-toner","name":"Dokdo Toner","brand":"Round Lab","category":"Tonik & Essence","price":799,"volume":"200 ml","image":"/assets/img/products/round-lab/round-lab-dokdo-toner-card.webp","url":"/products/round-lab-dokdo-toner.html","keywords":["round lab","dokdo toner","deniz suyu","tonik","nem","mineral","hassas"],"aliases":["roundlab-toner"]},{"slug":"round-lab-birch-juice-sunscreen","name":"Birch Juice Moisturizing Sunscreen SPF 50+ PA++++","brand":"Round Lab","category":"Güneş Koruyucular","price":849,"volume":"50 ml","image":"/assets/img/products/round-lab/round-lab-birch-juice-sunscreen-card.webp","url":"/products/round-lab-birch-juice-sunscreen.html","keywords":["round lab","birch juice","sunscreen","huş suyu","güneş","spf","hafif"],"aliases":["roundlab-birch"]},{"slug":"round-lab-soybean-nourishing-cream","name":"Soybean Nourishing Cream","brand":"Round Lab","category":"Nemlendiriciler","price":1049,"volume":"80 ml","image":"/assets/img/products/round-lab/soybean-nourishing-cream-card.png","url":"/products/round-lab-soybean-nourishing-cream.html","keywords":["round lab","soybean","nourishing cream","soya","besleyici krem","seramid","nem"],"aliases":["roundlab-soy"]},{"slug":"skin1004-madagascar-centella-ampoule","name":"Madagascar Centella Ampoule","brand":"SKIN1004","category":"Serum & Ampul","price":869,"volume":"55 ml","image":"/assets/img/products/skin1004/skin1004-madagascar-centella-ampoule-card.webp","url":"/products/skin1004-madagascar-centella-ampoule.html","keywords":["skin1004","centella","ampoule","amfül","ampul","yatıştırıcı","hassas","centella asiatica"],"aliases":["skin1004-ampoule"]},{"slug":"skin1004-centella-toning-toner","name":"Madagascar Centella Tone Brightening Toner","brand":"SKIN1004","category":"Tonik & Essence","price":829,"volume":"210 ml","image":"/assets/img/products/skin1004/skin1004-centella-toning-toner-card.webp","url":"/products/skin1004-centella-toning-toner.html","keywords":["skin1004","centella toner","tonik","centella asiatica","yatıştırıcı","nem"],"aliases":["skin1004-toner"]},{"slug":"skin1004-hyalu-cica-water-fit-sun-serum","name":"Hyalu-Cica Water-Fit Sun Serum SPF 50+ PA++++","brand":"SKIN1004","category":"Güneş Koruyucular","price":899,"volume":"50 ml","image":"/assets/img/products/skin1004/skin1004-hyalu-cica-water-fit-sun-serum-card.webp","url":"/products/skin1004-hyalu-cica-water-fit-sun-serum.html","keywords":["skin1004","hyalu cica","sun serum","güneş serumu","spf","centella","hyalüronik"],"aliases":["skin1004-sun"]},{"slug":"some-by-mi-aha-bha-miracle-toner","name":"AHA BHA PHA 30 Days Miracle Toner","brand":"Some By Mi","category":"Tonik & Essence","price":799,"volume":"150 ml","image":"/assets/img/products/some-by-mi/some-by-mi-aha-bha-miracle-toner-card.webp","url":"/products/some-by-mi-aha-bha-miracle-toner.html","keywords":["some by mi","aha bha","miracle toner","asit tonik","gözenek","akne","arındırıcı"],"aliases":["some-by-mi-toner"],"concernSlugs":["blemish"]},{"slug":"torriden-dive-in-hyaluronic-acid-serum","name":"DIVE-IN Low Molecular Hyaluronic Acid Serum","brand":"Torriden","category":"Serum & Ampul","price":949,"volume":"50 ml","image":"/assets/img/products/torriden/torriden-dive-in-hyaluronic-acid-serum-card.webp","url":"/products/torriden-dive-in-hyaluronic-acid-serum.html","keywords":["torriden","dive-in","hyaluronic acid","serum","hyalüronik asit","nem","katmanlı"],"aliases":["torriden-divein-serum","torriden-dive-in-serum"]},{"slug":"torriden-solid-in-ceramide-cream","name":"SOLID-IN Ceramide Cream","brand":"Torriden","category":"Nemlendiriciler","price":1099,"volume":"70 ml","image":"/assets/img/products/torriden/torriden-solid-in-ceramide-cream-card.webp","url":"/products/torriden-solid-in-ceramide-cream.html","keywords":["torriden","solid-in","ceramide cream","seramid","krem","bariyer","nem"],"aliases":["torriden-ceramide"]},{"slug":"torriden-dive-in-watery-moisture-sun-cream","name":"DIVE-IN Watery Moisture Sun Cream SPF 50+ PA++++","brand":"Torriden","category":"Güneş Koruyucular","price":939,"volume":"60 ml","image":"/assets/img/products/torriden/watery-moisture-sun-cream-card.png","url":"/products/torriden-dive-in-watery-moisture-sun-cream.html","keywords":["torriden","watery moisture sun","spf50","güneş","hafif","hyalüronik","spf","kore spf"],"aliases":["torriden-sun","torriden-watery-sun","torriden-dive-in-watery-sun-serum"]}]};

function catalogArray(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function catalogSlug(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/\/products\/([^.?#/]+)\.html(?:[?#].*)?$/i);
  return match ? match[1] : raw;
}
function catalogText(value) { return String(value || '').trim().toLocaleLowerCase('tr-TR'); }
function catalogProduct(product) {
  const slug = catalogSlug(product?.slug || product?.id || product?.url || '');
  if (!slug) return null;
  return { id: slug, slug, name: String(product.name || '').trim(), brand: String(product.brand || '').trim(), price: Number(product.price || 0), image: String(product.image || '').trim(), url: String(product.url || ('/products/' + slug + '.html')).trim(), category: String(product.category || '').trim(), aliases: catalogArray(product.aliases).map((alias) => String(alias || '').trim()).filter(Boolean) };
}
const catalogProducts = catalogArray(productSource.products).map(catalogProduct).filter(Boolean);
const catalogByName = Object.create(null);
const catalog = Object.create(null);
for (const product of catalogProducts) {
  catalogByName[catalogText(product.name)] = product;
  [product.id, product.slug].concat(product.aliases || []).filter(Boolean).forEach((handle) => { catalog[catalogSlug(handle)] = product; });
}
function getCatalogProductByHandle(handle) {
  if (!handle) return null;
  if (typeof handle === 'object') return getCatalogProductByHandle(handle.slug || handle.id || handle.url || '');
  return catalog[catalogSlug(handle)] || null;
}
function getCatalogProductByName(name) { return catalogByName[catalogText(name)] || null; }
function resolveCatalogProduct(reference) { return getCatalogProductByHandle(reference) || getCatalogProductByName(reference); }


const VAT_RATE = 0.20;
const FREE_SHIPPING_LIMIT = 2500;
const SHIPPING_FEE = 119;
const MAX_CART_LINES = 30;
const MAX_TOTAL_QUANTITY = 99;
const MAX_ITEM_QUANTITY = 10;
const MAX_NOTE_LENGTH = 180;
const ALLOWED_INVOICE_TYPES = new Set(['Bireysel', 'Kurumsal']);

class CheckoutError extends Error {
  constructor(message, status = 400, code = 'CHECKOUT_ERROR') {
    super(message);
    this.name = 'CheckoutError';
    this.status = status;
    this.code = code;
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function clampText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
}

function normalizeTurkishPhone(value) {
  let digits = onlyDigits(value);
  if (digits.startsWith('0090')) digits = digits.slice(4);
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{9}$/.test(digits)) return null;
  return `+90${digits}`;
}

function isValidTurkishIdentityNumber(value) {
  const digits = onlyDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  if (digits[0] === '0') return false;
  const numbers = digits.split('').map(Number);
  const oddSum = numbers[0] + numbers[2] + numbers[4] + numbers[6] + numbers[8];
  const evenSum = numbers[1] + numbers[3] + numbers[5] + numbers[7];
  const tenth = ((oddSum * 7) - evenSum) % 10;
  const eleventh = numbers.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10;
  return numbers[9] === tenth && numbers[10] === eleventh;
}

function requireName(value, fieldName) {
  const normalized = clampText(value, 60);
  if (normalized.length < 2) throw new CheckoutError(`${fieldName} alanı geçersiz.`, 400, 'INVALID_CUSTOMER');
  if (!/^[A-Za-zÇĞİÖŞÜçğıöşü\s.'-]+$/.test(normalized)) throw new CheckoutError(`${fieldName} alanı yalnızca harf içermelidir.`, 400, 'INVALID_CUSTOMER');
  return normalized;
}

function validateCustomer(rawCustomer = {}) {
  const customer = {
    first_name: requireName(rawCustomer.first_name, 'Ad'),
    last_name: requireName(rawCustomer.last_name, 'Soyad'),
    email: normalizeEmail(rawCustomer.email),
    phone: normalizeTurkishPhone(rawCustomer.phone),
    identity_number: onlyDigits(rawCustomer.identity_number).slice(0, 11),
    city: clampText(rawCustomer.city, 60),
    district: clampText(rawCustomer.district, 80),
    postal_code: onlyDigits(rawCustomer.postal_code).slice(0, 5),
    invoice_type: clampText(rawCustomer.invoice_type || 'Bireysel', 20),
    address: clampText(rawCustomer.address, 300),
    cargo_note: clampText(rawCustomer.cargo_note, MAX_NOTE_LENGTH)
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)) throw new CheckoutError('E-posta adresi geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!customer.phone) throw new CheckoutError('Telefon numarası geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!isValidTurkishIdentityNumber(customer.identity_number)) throw new CheckoutError('T.C. kimlik numarası geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.city.length < 2) throw new CheckoutError('İl alanı geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.district.length < 2) throw new CheckoutError('İlçe alanı geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!/^\d{5}$/.test(customer.postal_code)) throw new CheckoutError('Posta kodu geçersiz.', 400, 'INVALID_CUSTOMER');
  if (customer.address.length < 10) throw new CheckoutError('Adres alanı geçersiz.', 400, 'INVALID_CUSTOMER');
  if (!ALLOWED_INVOICE_TYPES.has(customer.invoice_type)) customer.invoice_type = 'Bireysel';

  return customer;
}

function buildCatalogIndex() {
  const products = Array.isArray(catalog) ? catalog : Object.values(catalog || {});
  const index = new Map();
  products.forEach((product) => {
    if (!product) return;
    [product.id, product.slug, product.product_id, product.sku].filter(Boolean).forEach((key) => {
      index.set(String(key), product);
    });
  });
  return index;
}

function findCatalogProduct(index, rawItem) {
  const keys = [rawItem.id, rawItem.product_id, rawItem.productId, rawItem.slug, rawItem.handle, rawItem.sku]
    .filter(Boolean)
    .map(String);
  for (const key of keys) {
    const product = index.get(key);
    if (product) return product;
  }
  return null;
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, MAX_ITEM_QUANTITY);
}

function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) throw new CheckoutError('Sepet boş.', 400, 'EMPTY_CART');
  if (rawCart.length > MAX_CART_LINES) throw new CheckoutError('Sepette çok fazla ürün satırı var.', 400, 'CART_TOO_LARGE');

  const catalogIndex = buildCatalogIndex();
  const merged = new Map();
  let totalQuantity = 0;

  rawCart.forEach((rawItem) => {
    const product = findCatalogProduct(catalogIndex, rawItem || {});
    if (!product) throw new CheckoutError('Sepette geçersiz veya satışta olmayan ürün var.', 400, 'INVALID_CART_ITEM');

    const productId = String(product.id || product.slug || rawItem.id || '').trim();
    const unitPrice = normalizeMoney(product.price);
    if (!productId || unitPrice <= 0) throw new CheckoutError('Ürün fiyatı doğrulanamadı.', 400, 'INVALID_CART_ITEM');

    const quantity = normalizeQuantity(rawItem.qty ?? rawItem.quantity ?? 1);
    totalQuantity += quantity;
    if (totalQuantity > MAX_TOTAL_QUANTITY) throw new CheckoutError('Sepette izin verilen toplam adet sınırı aşıldı.', 400, 'CART_TOO_LARGE');

    const existing = merged.get(productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_ITEM_QUANTITY);
      existing.line_total = normalizeMoney(existing.unit_price * existing.quantity);
      return;
    }

    merged.set(productId, {
      product_id: productId,
      product_slug: product.slug || rawItem.slug || null,
      product_name: clampText(product.name || rawItem.name || 'Cosmoskin Ürünü', 120),
      brand: clampText(product.brand || rawItem.brand || 'COSMOSKIN', 80),
      unit_price: unitPrice,
      quantity,
      image: product.image || rawItem.image || null,
      line_total: normalizeMoney(unitPrice * quantity)
    });
  });

  const cart = Array.from(merged.values());
  if (!cart.length) throw new CheckoutError('Sepet boş.', 400, 'EMPTY_CART');
  return cart;
}

function calculateTotals(cart) {
  const subtotal = normalizeMoney(cart.reduce((sum, item) => sum + item.line_total, 0));
  const shipping = subtotal >= FREE_SHIPPING_LIMIT ? 0 : SHIPPING_FEE;
  const vat = normalizeMoney((subtotal * VAT_RATE) / (1 + VAT_RATE));
  const total = normalizeMoney(subtotal + shipping);
  return { subtotal, shipping, vat, total };
}

function createOrderNumber() {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CS-${Date.now()}-${random}`;
}

function iyzicoDate(value) {
  return new Date(value || Date.now()).toISOString().slice(0, 19).replace('T', ' ');
}

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '127.0.0.1';
}

function buildIyzicoBasketItems(cart, shipping) {
  const items = cart.map((item) => ({
    id: item.product_id,
    name: item.product_name,
    category1: 'Skincare',
    itemType: 'PHYSICAL',
    price: item.line_total.toFixed(2)
  }));

  if (shipping > 0) {
    items.push({
      id: 'shipping',
      name: 'Kargo Ücreti',
      category1: 'Shipping',
      itemType: 'PHYSICAL',
      price: shipping.toFixed(2)
    });
  }

  return items;
}

function getPublicSiteUrl(env) {
  return String(env.PUBLIC_SITE_URL || 'https://www.cosmoskin.com.tr').replace(/\/$/, '');
}

function assertPaymentEnvironment(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CheckoutError('Sipariş sistemi yapılandırması eksik.', 503, 'SERVICE_NOT_CONFIGURED');
  }
  if (!env.IYZICO_API_KEY || !env.IYZICO_SECRET_KEY) {
    throw new CheckoutError('Ödeme sistemi henüz aktif değil.', 503, 'PAYMENT_NOT_CONFIGURED');
  }
}

export async function onRequestPost(context) {
  try {
    assertPaymentEnvironment(context.env || {});

    const payload = await context.request.json().catch(() => {
      throw new CheckoutError('Geçersiz istek formatı.', 400, 'INVALID_JSON');
    });

    const accessToken = payload.accessToken || null;
    const customer = validateCustomer(payload.customer || {});
    const cart = normalizeCart(payload.cart || []);
    const user = accessToken ? await getUserFromAccessToken(context, accessToken) : null;
    if (accessToken && !user) throw new CheckoutError('Oturum süresi dolmuş. Lütfen tekrar giriş yap.', 401, 'INVALID_SESSION');

    const totals = calculateTotals(cart);
    const orderNumber = createOrderNumber();
    const order = await insertRow(context, 'orders', {
      user_id: user?.id || null,
      order_number: orderNumber,
      status: 'pending_payment',
      currency: 'TRY',
      subtotal_amount: totals.subtotal,
      vat_amount: totals.vat,
      shipping_amount: totals.shipping,
      total_amount: totals.total,
      customer_email: customer.email,
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_phone: customer.phone,
      invoice_type: customer.invoice_type,
      identity_number: customer.identity_number,
      city: customer.city,
      district: customer.district,
      postal_code: customer.postal_code,
      address_line: customer.address,
      cargo_note: customer.cargo_note || null
    });

    await insertRows(context, 'order_items', cart.map((item) => ({ ...item, order_id: order.id })));

    const callbackUrl = `${getPublicSiteUrl(context.env)}/api/iyzico-callback`;
    const ip = getClientIp(context.request);
    const buyerName = `${customer.first_name} ${customer.last_name}`.trim();
    const basketItems = buildIyzicoBasketItems(cart, totals.shipping);

    const iyzicoRes = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', context.env, {
      locale: 'tr',
      conversationId: order.id,
      price: totals.total.toFixed(2),
      paidPrice: totals.total.toFixed(2),
      currency: 'TRY',
      basketId: order.id,
      paymentGroup: 'PRODUCT',
      callbackUrl,
      enabledInstallments: [1, 2, 3],
      buyer: {
        id: user?.id || `guest-${order.id}`,
        name: customer.first_name,
        surname: customer.last_name,
        gsmNumber: customer.phone,
        email: customer.email,
        identityNumber: customer.identity_number,
        lastLoginDate: iyzicoDate(),
        registrationDate: iyzicoDate(user?.created_at),
        registrationAddress: customer.address,
        ip,
        city: customer.city,
        country: 'Turkey',
        zipCode: customer.postal_code
      },
      shippingAddress: {
        contactName: buyerName,
        city: customer.city,
        country: 'Turkey',
        address: customer.address,
        zipCode: customer.postal_code
      },
      billingAddress: {
        contactName: buyerName,
        city: customer.city,
        country: 'Turkey',
        address: customer.address,
        zipCode: customer.postal_code
      },
      basketItems
    });

    const paymentStatus = String(iyzicoRes?.status || '').toLowerCase();
    const paymentSucceeded = paymentStatus === 'success' && (iyzicoRes.token || iyzicoRes.paymentPageUrl || iyzicoRes.checkoutFormContent);

    await insertRow(context, 'payments', {
      order_id: order.id,
      provider: 'iyzico',
      status: paymentSucceeded ? 'initiated' : 'initialize_failed',
      amount: totals.total,
      conversation_id: order.id,
      provider_token: iyzicoRes?.token || null,
      raw_initialize_response: iyzicoRes || null
    });

    if (!paymentSucceeded) {
      throw new CheckoutError(iyzicoRes?.errorMessage || 'Ödeme başlatılamadı. Lütfen bilgileri kontrol edip tekrar dene.', 502, 'PAYMENT_INITIALIZE_FAILED');
    }

    return json({
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      token: iyzicoRes.token,
      paymentPageUrl: iyzicoRes.paymentPageUrl || null,
      checkoutFormContent: iyzicoRes.checkoutFormContent || null
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    }

    console.error('Checkout create error:', error);
    return json({ ok: false, code: 'CHECKOUT_INTERNAL_ERROR', error: 'Checkout başlatılamadı. Lütfen kısa süre sonra tekrar dene.' }, { status: 500 });
  }
}
