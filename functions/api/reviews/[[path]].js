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

const REVIEW_SELECT =
  'id,product_slug,user_id,user_display_name,user_email,title,body,rating,helpful_count,approved,is_edited,created_at,updated_at';
const REVIEW_SELECT_WITH_IMAGES =
  `${REVIEW_SELECT},review_images(id,public_url,status,width,height,created_at)`;

function getSupabaseConfig(context) {
  const env = context?.env || {};
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase yapılandırması eksik.');
  }
  return { url, serviceRoleKey };
}

async function supabaseRequest(context, path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig(context);
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...options.headers
  };

  const response = await fetch(`${url}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error_description ||
      data?.error ||
      data?.hint ||
      `Supabase hata kodu: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function selectRows(context, table, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  });
  return await supabaseRequest(context, `/rest/v1/${table}?${qs.toString()}`);
}

async function insertRows(context, table, rows, prefer = 'return=representation') {
  return await supabaseRequest(context, `/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(rows)
  });
}

async function insertRow(context, table, payload) {
  const data = await insertRows(context, table, [payload], 'return=representation');
  return Array.isArray(data) ? data[0] || null : data;
}

async function updateRows(context, table, filters, payload, prefer = 'return=representation') {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, `eq.${value}`);
  });
  return await supabaseRequest(context, `/rest/v1/${table}?${qs.toString()}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(payload)
  });
}

async function deleteRows(context, table, filters) {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, `eq.${value}`);
  });
  await supabaseRequest(context, `/rest/v1/${table}?${qs.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR');
}

function getPathParts(requestUrl) {
  const pathname = new URL(requestUrl).pathname.replace(/^\/api\/reviews\/?/, '');
  return pathname ? pathname.split('/').filter(Boolean) : [];
}

function methodNotAllowed(methods) {
  return json(
    { ok: false, code: 'method_not_allowed', error: 'İstek yöntemi desteklenmiyor.' },
    { status: 405, headers: { Allow: methods.join(', ') } }
  );
}

function validationError(message, code = 'validation_error', status = 400) {
  return json({ ok: false, code, error: message }, { status });
}

function resolveProduct(reference) {
  if (!reference) return null;
  if (typeof reference === 'object') {
    return (
      resolveCatalogProduct(reference.product_slug || reference.product_id || reference.product || '') ||
      getCatalogProductByName(reference.product_name || '')
    );
  }
  return resolveCatalogProduct(reference);
}

function mapImage(image) {
  return {
    id: image.id,
    url: image.public_url,
    public_url: image.public_url,
    status: image.status || 'pending',
    width: image.width || null,
    height: image.height || null,
    created_at: image.created_at || null,
    source: 'review_images',
    table: 'review_images',
    field: 'public_url',
    index: 0
  };
}

function reviewStatus(review) {
  return review?.approved ? 'approved' : 'pending';
}

function mapReview(review, options = {}) {
  const product =
    options.product ||
    getCatalogProductByHandle(review?.product_slug || '') ||
    getCatalogProductByName(review?.product_name || '') ||
    null;
  const productSlug = product?.slug || review?.product_slug || '';
  const productUrl = product?.url || (productSlug ? `/products/${productSlug}.html` : '');
  const rawImages = Array.isArray(review?.review_images) ? review.review_images : [];
  const images = rawImages
    .filter((image) => !options.publicOnly || image.status === 'approved')
    .map(mapImage);

  return {
    id: review.id,
    title: review.title || '',
    body: review.body || '',
    rating: Number(review.rating || 0),
    helpful_count: Number(review.helpful_count || 0),
    approved: !!review.approved,
    status: options.status || reviewStatus(review),
    is_edited: !!review.is_edited,
    created_at: review.created_at || null,
    updated_at: review.updated_at || null,
    product_slug: productSlug,
    user_id: review.user_id || '',
    user_display_name: review.user_display_name || 'Dogrulanmis Musteri',
    user_email: options.hideEmail ? '' : (review.user_email || ''),
    product: {
      id: product?.id || productSlug,
      slug: productSlug,
      name: product?.name || '',
      brand: product?.brand || '',
      image: product?.image || '',
      url: productUrl
    },
    user: {
      id: review.user_id || '',
      name: review.user_display_name || 'Dogrulanmis Musteri',
      email: options.hideEmail ? '' : (review.user_email || '')
    },
    order: {
      id: '',
      number: '',
      status: '',
      created_at: ''
    },
    source_table: 'reviews',
    review_images: images,
    images
  };
}

function buildSummary(reviews = []) {
  const approved = (reviews || []).filter((review) => review.approved);
  const count = approved.length;
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  approved.forEach((review) => {
    const rating = Number(review.rating || 0);
    if (stars[rating] != null) stars[rating] += 1;
  });

  const avg = count
    ? Math.round((approved.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count) * 10) / 10
    : 0;

  return {
    avg_rating: avg,
    approved_count: count,
    total_count: count,
    five_star: stars[5],
    four_star: stars[4],
    three_star: stars[3],
    two_star: stars[2],
    one_star: stars[1]
  };
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Gecersiz istek govdesi.');
  }
}

async function getUserFromRequest(context) {
  const authHeader = context.request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { token: '', user: null };
  try {
    const user = await getUserFromAccessToken(context, token);
    return { token, user: user || null };
  } catch {
    return { token, user: null };
  }
}

async function requireUser(context) {
  const { user } = await getUserFromRequest(context);
  if (!user) {
    return { ok: false, response: json({ ok: false, error: 'Oturum gerekli.' }, { status: 401 }) };
  }
  return { ok: true, user };
}

function requireAdmin(context) {
  const expected = String(context.env.ADMIN_TOKEN || '');
  if (!expected) {
    return json({ ok: false, error: 'Admin token tanimli degil.' }, { status: 503 });
  }
  const received = String(context.request.headers.get('X-Admin-Token') || '').trim();
  if (!received || received !== expected) {
    return json({ ok: false, error: 'Token gecersiz veya eksik.' }, { status: 401 });
  }
  return null;
}

function buildDisplayName(user) {
  const firstName = String(user?.user_metadata?.first_name || '').trim();
  const lastName = String(user?.user_metadata?.last_name || '').trim();
  return [firstName, lastName].filter(Boolean).join(' ') || user?.email?.split('@')[0] || 'Kullanici';
}

function sanitizeReviewPayload(payload = {}) {
  const title = String(payload.title || '').trim();
  const body = String(payload.review_body || payload.body || '').trim();
  const rating = Number(payload.rating || 0);
  const product =
    resolveProduct(payload.product_slug || payload.product_id || payload.product || '') ||
    resolveProduct(payload);

  return { title, body, rating, product, images: sanitizeImages(payload.images) };
}

function validateReviewPayload(payload = {}) {
  if (!payload.product?.slug) return 'Gecerli bir urun bulunamadi.';
  if (!payload.title || payload.title.length < 3 || payload.title.length > 100) {
    return 'Baslik 3 ile 100 karakter arasinda olmali.';
  }
  if (!payload.body || payload.body.length < 10 || payload.body.length > 2000) {
    return 'Yorum 10 ile 2000 karakter arasinda olmali.';
  }
  if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) {
    return 'Puan 1 ile 5 arasinda olmali.';
  }
  return '';
}

function sanitizeImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .map((image) => ({
      storage_path: String(image?.storagePath || image?.storage_path || '').trim(),
      public_url: String(image?.publicUrl || image?.public_url || '').trim(),
      width: image?.width ? Number(image.width) : null,
      height: image?.height ? Number(image.height) : null
    }))
    .filter((image) => image.storage_path && image.public_url);
}

async function insertReviewImages(context, reviewId, images = []) {
  const rows = sanitizeImages(images).map((image) => ({
    review_id: reviewId,
    storage_path: image.storage_path,
    public_url: image.public_url,
    status: 'pending',
    width: Number.isFinite(image.width) ? image.width : null,
    height: Number.isFinite(image.height) ? image.height : null
  }));

  if (!rows.length) return [];
  const inserted = await insertRows(context, 'review_images', rows, 'return=representation');
  return Array.isArray(inserted) ? inserted : [];
}

async function getReviewById(context, reviewId) {
  const rows = await selectRows(context, 'reviews', {
    select: REVIEW_SELECT_WITH_IMAGES,
    id: `eq.${reviewId}`,
    limit: '1'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function hasPurchasedProduct(context, userId, product) {
  const orders = await selectRows(context, 'orders', {
    select: 'id',
    user_id: `eq.${userId}`,
    status: 'in.(paid,confirmed)',
    limit: '200'
  });

  const orderIds = (orders || []).map((order) => order.id).filter(Boolean);
  if (!orderIds.length) return false;

  const items = await selectRows(context, 'order_items', {
    select: 'product_id,product_slug,product_name',
    order_id: `in.(${orderIds.join(',')})`
  });

  const targetName = normalizeText(product.name);

  return (items || []).some((item) => {
    const resolved =
      getCatalogProductByHandle(item.product_slug || item.product_id || '') ||
      getCatalogProductByName(item.product_name || '');
    const resolvedSlug = resolved?.slug || item.product_slug || item.product_id || '';
    return resolvedSlug === product.slug || normalizeText(item.product_name) === targetName;
  });
}

async function handlePublicList(context) {
  const { user } = await getUserFromRequest(context);
  const url = new URL(context.request.url);
  const product =
    resolveProduct(url.searchParams.get('product_slug') || url.searchParams.get('product_id') || url.searchParams.get('product') || '') ||
    resolveProduct({ product_name: url.searchParams.get('product_name') || '' });

  if (!product?.slug) {
    return validationError('Gecerli bir urun secin.', 'invalid_product');
  }

  const rows = await selectRows(context, 'reviews', {
    select: REVIEW_SELECT_WITH_IMAGES,
    product_slug: `eq.${product.slug}`,
    approved: 'eq.true',
    order: 'created_at.desc'
  });

  const approvedReviews = (rows || []).map((review) => mapReview(review, {
    product,
    publicOnly: true,
    hideEmail: true
  }));
  let userReview = null;
  let helpfulIds = [];

  if (user?.id) {
    const ownRows = await selectRows(context, 'reviews', {
      select: REVIEW_SELECT_WITH_IMAGES,
      product_slug: `eq.${product.slug}`,
      user_id: `eq.${user.id}`,
      limit: '1'
    });
    if (Array.isArray(ownRows) && ownRows[0]) {
      userReview = mapReview(ownRows[0], { product });
    }

    const reviewIds = approvedReviews.map((review) => review.id).filter(Boolean);
    if (reviewIds.length) {
      const helpfulRows = await selectRows(context, 'review_helpful', {
        select: 'review_id',
        user_id: `eq.${user.id}`,
        review_id: `in.(${reviewIds.join(',')})`
      });
      helpfulIds = (helpfulRows || []).map((row) => row.review_id).filter(Boolean);
    }
  }

  return json({
    ok: true,
    product_slug: product.slug,
    summary: buildSummary(rows || []),
    reviews: approvedReviews,
    user_review: userReview,
    helpful_ids: helpfulIds
  });
}

async function handleCreateReview(context) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  let payload;
  try {
    payload = sanitizeReviewPayload(await parseJsonBody(context.request));
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const validationMessage = validateReviewPayload(payload);
  if (validationMessage) return validationError(validationMessage);

  const purchased = await hasPurchasedProduct(context, required.user.id, payload.product);
  if (!purchased) {
    return json(
      { ok: false, code: 'purchase_required', error: 'Yalnizca satin alinan urunler icin yorum yazilabilir.' },
      { status: 403 }
    );
  }

  const existing = await selectRows(context, 'reviews', {
    select: 'id',
    product_slug: `eq.${payload.product.slug}`,
    user_id: `eq.${required.user.id}`,
    limit: '1'
  });

  if (Array.isArray(existing) && existing[0]?.id) {
    return json(
      { ok: false, code: 'duplicate_review', error: 'Bu urun icin zaten bir yorum yazdiniz.' },
      { status: 409 }
    );
  }

  const row = await insertRow(context, 'reviews', {
    product_slug: payload.product.slug,
    user_id: required.user.id,
    user_display_name: buildDisplayName(required.user),
    user_email: required.user.email || '',
    title: payload.title,
    body: payload.body,
    rating: payload.rating,
    approved: false,
    is_edited: false
  });

  const createdImages = await insertReviewImages(context, row.id, payload.images);
  const mappedReview = mapReview({ ...row, review_images: createdImages }, { product: payload.product });

  return json({
    ok: true,
    review_id: row.id,
    review: mappedReview
  });
}

async function handleUpdateReview(context, reviewId) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  const existing = await getReviewById(context, reviewId);
  if (!existing || existing.user_id !== required.user.id) {
    return json({ ok: false, error: 'Yorum bulunamadi.' }, { status: 404 });
  }

  let payload;
  try {
    payload = sanitizeReviewPayload(await parseJsonBody(context.request));
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  payload.product = payload.product || resolveProduct(existing.product_slug);
  const validationMessage = validateReviewPayload(payload);
  if (validationMessage) return validationError(validationMessage);

  await updateRows(context, 'reviews', { id: reviewId, user_id: required.user.id }, {
    title: payload.title,
    body: payload.body,
    rating: payload.rating,
    approved: false,
    is_edited: true
  }, 'return=minimal');

  const newImages = await insertReviewImages(context, reviewId, payload.images);
  const refreshed = await getReviewById(context, reviewId);
  return json({
    ok: true,
    review_id: reviewId,
    review: mapReview(
      {
        ...refreshed,
        review_images: Array.isArray(refreshed?.review_images)
          ? refreshed.review_images
          : [...(Array.isArray(existing.review_images) ? existing.review_images : []), ...newImages]
      },
      { product: payload.product || resolveProduct(existing.product_slug) }
    )
  });
}

async function handleCreateImages(context) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const reviewId = String(payload.review_id || '').trim();
  if (!reviewId) return validationError('Yorum kimligi gerekli.', 'missing_review_id');

  const review = await getReviewById(context, reviewId);
  if (!review || review.user_id !== required.user.id) {
    return json({ ok: false, error: 'Yorum bulunamadi.' }, { status: 404 });
  }

  const inserted = await insertReviewImages(context, reviewId, payload.images);
  return json({
    ok: true,
    review_id: reviewId,
    images: inserted.map(mapImage)
  });
}

async function handleHelpful(context) {
  const required = await requireUser(context);
  if (!required.ok) return required.response;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const reviewId = String(payload.review_id || '').trim();
  const action = String(payload.action || 'add').trim().toLowerCase();
  if (!reviewId) return validationError('Yorum kimligi gerekli.', 'missing_review_id');

  if (action === 'remove') {
    await deleteRows(context, 'review_helpful', {
      review_id: reviewId,
      user_id: required.user.id
    });
    return json({ ok: true, action: 'remove' });
  }

  try {
    await insertRow(context, 'review_helpful', {
      review_id: reviewId,
      user_id: required.user.id
    });
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (!message.includes('duplicate') && !message.includes('unique')) throw error;
  }

  return json({ ok: true, action: 'add' });
}

async function handleAdminList(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const rows = await selectRows(context, 'reviews', {
    select: REVIEW_SELECT_WITH_IMAGES,
    order: 'created_at.desc'
  });

  return json({
    ok: true,
    reviews: (rows || []).map((review) => mapReview(review))
  });
}

async function handleAdminReviewUpdate(context, reviewId) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const nextStatus = String(payload.status || '').trim().toLowerCase();
  if (!['approved', 'pending', 'rejected'].includes(nextStatus)) {
    return validationError('Gecersiz moderasyon durumu.', 'invalid_status');
  }

  const existing = await getReviewById(context, reviewId);
  if (!existing) {
    return json({ ok: false, error: 'Yorum bulunamadi.' }, { status: 404 });
  }

  if (nextStatus === 'rejected') {
    await deleteRows(context, 'reviews', { id: reviewId });
    return json({
      ok: true,
      deleted: true,
      review: mapReview(existing, { status: 'rejected' })
    });
  }

  await updateRows(context, 'reviews', { id: reviewId }, {
    approved: nextStatus === 'approved'
  }, 'return=minimal');

  const refreshed = await getReviewById(context, reviewId);
  return json({
    ok: true,
    review: mapReview(refreshed)
  });
}

async function handleAdminReviewDelete(context, reviewId) {
  const authError = requireAdmin(context);
  if (authError) return authError;
  await deleteRows(context, 'reviews', { id: reviewId });
  return json({ ok: true, deleted: true });
}

async function handleAdminImageUpdate(context, reviewId, imageId) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  let payload;
  try {
    payload = await parseJsonBody(context.request);
  } catch (error) {
    return validationError(error.message, 'bad_request');
  }

  const nextStatus = String(payload.status || '').trim().toLowerCase();
  if (!['approved', 'pending', 'rejected'].includes(nextStatus)) {
    return validationError('Gecersiz gorsel durumu.', 'invalid_status');
  }

  await updateRows(context, 'review_images', { id: imageId, review_id: reviewId }, {
    status: nextStatus
  }, 'return=minimal');

  const rows = await selectRows(context, 'review_images', {
    select: 'id,public_url,status,width,height,created_at',
    id: `eq.${imageId}`,
    review_id: `eq.${reviewId}`,
    limit: '1'
  });

  return json({
    ok: true,
    image: rows?.[0] ? mapImage(rows[0]) : null
  });
}

async function handleAdminImageDelete(context, reviewId, imageId) {
  const authError = requireAdmin(context);
  if (authError) return authError;
  await deleteRows(context, 'review_images', { id: imageId, review_id: reviewId });
  return json({ ok: true, deleted: true });
}

export async function onRequest(context) {
  try {
    const parts = getPathParts(context.request.url);
    const method = context.request.method.toUpperCase();

    if (!parts.length) {
      if (method === 'GET') return await handlePublicList(context);
      if (method === 'POST') return await handleCreateReview(context);
      return methodNotAllowed(['GET', 'POST']);
    }

    if (parts[0] === 'images') {
      if (method === 'POST') return await handleCreateImages(context);
      return methodNotAllowed(['POST']);
    }

    if (parts[0] === 'helpful') {
      if (method === 'POST') return await handleHelpful(context);
      return methodNotAllowed(['POST']);
    }

    if (parts[0] === 'admin') {
      if (parts.length === 1) {
        if (method === 'GET') return await handleAdminList(context);
        return methodNotAllowed(['GET']);
      }

      if (parts.length === 2) {
        if (method === 'PATCH') return await handleAdminReviewUpdate(context, parts[1]);
        if (method === 'DELETE') return await handleAdminReviewDelete(context, parts[1]);
        return methodNotAllowed(['PATCH', 'DELETE']);
      }

      if (parts.length === 4 && parts[2] === 'images') {
        if (method === 'PATCH') return await handleAdminImageUpdate(context, parts[1], parts[3]);
        if (method === 'DELETE') return await handleAdminImageDelete(context, parts[1], parts[3]);
        return methodNotAllowed(['PATCH', 'DELETE']);
      }

      return json({ ok: false, error: 'Gecersiz admin endpointi.' }, { status: 404 });
    }

    if (parts.length === 1) {
      if (method === 'PATCH') return await handleUpdateReview(context, parts[0]);
      return methodNotAllowed(['PATCH']);
    }

    return json({ ok: false, error: 'Gecersiz review endpointi.' }, { status: 404 });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Review islemi basarisiz.' }, { status: 500 });
  }
}
