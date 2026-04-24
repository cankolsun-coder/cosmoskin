/**
 * COSMOSKIN — Merkezi Ürün Veritabanı v2
 * Tek kaynak: Arama, kategori ve marka sayfaları bu veriden beslenir.
 * Yeni ürün eklemek için COSMOSKIN_PRODUCTS dizisine nesne ekleyin.
 */
window.COSMOSKIN_PRODUCTS = [

  /* ── ANUA ───────────────────────────────────────────────── */
  { id:'anua-heartleaf-77-soothing-toner', name:'Heartleaf 77% Soothing Toner',
    brand:'Anua', brandSlug:'anua', category:'Tonik & Essence', categorySlug:'hydrate',
    price:849, volume:'250 ml', url:'/products/anua-heartleaf-77-soothing-toner.html',
    image:'/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp',
    keywords:'anua heartleaf soothing toner hassas yatistirici centella nem'},

  { id:'anua-heartleaf-pore-control-cleansing-oil', name:'Heartleaf Pore Control Cleansing Oil',
    brand:'Anua', brandSlug:'anua', category:'Temizleyiciler', categorySlug:'cleanse',
    price:879, volume:'200 ml', url:'/products/anua-heartleaf-pore-control-cleansing-oil.html',
    image:'/assets/img/products/anua/anua-heartleaf-pore-control-cleansing-oil-card.webp',
    keywords:'anua heartleaf pore control cleansing oil yag bazli temizleyici makyaj'},

  /* ── BEAUTY OF JOSEON ──────────────────────────────────── */
  { id:'beauty-of-joseon-relief-sun-spf50', name:'Relief Sun: Rice + Probiotics SPF 50+ PA++++',
    brand:'Beauty of Joseon', brandSlug:'beauty-of-joseon', category:'Güneş Koruyucular', categorySlug:'protect',
    price:899, volume:'50 ml', url:'/products/beauty-of-joseon-relief-sun-spf50.html',
    image:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-relief-sun-spf50-card.webp',
    keywords:'beauty of joseon relief sun rice probiotics spf50 gunes koruyucu boj'},

  { id:'beauty-of-joseon-glow-serum-propolis-niacinamide', name:'Glow Serum: Propolis + Niacinamide',
    brand:'Beauty of Joseon', brandSlug:'beauty-of-joseon', category:'Serum & Ampul', categorySlug:'treat',
    price:879, volume:'30 ml', url:'/products/beauty-of-joseon-glow-serum-propolis-niacinamide.html',
    image:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-glow-serum-propolis-niacinamide-card.webp',
    keywords:'beauty of joseon glow serum propolis niacinamide isilti ton boj'},

  { id:'beauty-of-joseon-glow-deep-serum', name:'Glow Deep Serum: Rice + Arbutin',
    brand:'Beauty of Joseon', brandSlug:'beauty-of-joseon', category:'Serum & Ampul', categorySlug:'treat',
    price:879, volume:'30 ml', url:'/products/beauty-of-joseon-glow-deep-serum.html',
    image:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-glow-deep-serum-card.webp',
    keywords:'beauty of joseon glow deep serum rice arbutin pirinc leke isilti boj'},

  { id:'beauty-of-joseon-dynasty-cream', name:'Dynasty Cream',
    brand:'Beauty of Joseon', brandSlug:'beauty-of-joseon', category:'Nemlendiriciler', categorySlug:'care',
    price:999, volume:'50 ml', url:'/products/beauty-of-joseon-dynasty-cream.html',
    image:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-dynasty-cream-card.webp',
    keywords:'beauty of joseon dynasty cream pirinc niacinamide nemlendirici krem boj'},

  { id:'beauty-of-joseon-green-plum-refreshing-cleanser', name:'Green Plum Refreshing Cleanser',
    brand:'Beauty of Joseon', brandSlug:'beauty-of-joseon', category:'Temizleyiciler', categorySlug:'cleanse',
    price:759, volume:'170 ml', url:'/products/beauty-of-joseon-green-plum-refreshing-cleanser.html',
    image:'/assets/img/products/beauty-of-joseon/beauty-of-joseon-green-plum-refreshing-cleanser-card.webp',
    keywords:'beauty of joseon green plum refreshing cleanser yesil erik temizleyici boj'},

  /* ── BY WISHTREND ──────────────────────────────────────── */
  { id:'by-wishtrend-pure-vitamin-c-21-5-serum', name:'Pure Vitamin C 21.5% Advanced Serum',
    brand:'By Wishtrend', brandSlug:'by-wishtrend', category:'Serum & Ampul', categorySlug:'treat',
    price:1249, volume:'30 ml', url:'/products/by-wishtrend-pure-vitamin-c-21-5-serum.html',
    image:'/assets/img/products/by-wishtrend/by-wishtrend-pure-vitamin-c-21-5-serum-card.webp',
    keywords:'by wishtrend pure vitamin c 21 5 serum leke ton esitleme isilti'},

  /* ── COSRX ─────────────────────────────────────────────── */
  { id:'cosrx-advanced-snail-96-mucin-essence', name:'Advanced Snail 96 Mucin Power Essence',
    brand:'COSRX', brandSlug:'cosrx', category:'Tonik & Essence', categorySlug:'hydrate',
    price:979, volume:'100 ml', url:'/products/cosrx-advanced-snail-96-mucin-essence.html',
    image:'/assets/img/products/cosrx/cosrx-advanced-snail-96-mucin-essence-card.webp',
    keywords:'cosrx advanced snail 96 mucin power essence salyangoz bariyer nem'},

  { id:'cosrx-the-vitamin-c-23-serum', name:'The Vitamin C 23 Serum',
    brand:'COSRX', brandSlug:'cosrx', category:'Serum & Ampul', categorySlug:'treat',
    price:999, volume:'20 g', url:'/products/cosrx-the-vitamin-c-23-serum.html',
    image:'/assets/img/products/cosrx/vitamin-c-23-serum-card.png',
    keywords:'cosrx vitamin c 23 serum leke ton esitleme isilti brightening'},

  { id:'cosrx-acne-pimple-master-patch', concernSlugs:['blemish'], name:'Acne Pimple Master Patch',
    brand:'COSRX', brandSlug:'cosrx', category:'Maskeler', categorySlug:'masks',
    price:379, volume:'24 adet', url:'/products/cosrx-acne-pimple-master-patch.html',
    image:'/assets/img/products/cosrx/cosrx-acne-pimple-master-patch-card.webp',
    keywords:'cosrx acne pimple master patch akne sivilce yama hydrocolloid'},

  { id:'cosrx-aha-bha-clarifying-treatment-toner', concernSlugs:['blemish'], name:'AHA/BHA Clarifying Treatment Toner',
    brand:'COSRX', brandSlug:'cosrx', category:'Tonik & Essence', categorySlug:'hydrate',
    price:729, volume:'150 ml', url:'/products/cosrx-aha-bha-clarifying-treatment-toner.html',
    image:'/assets/img/products/cosrx/cosrx-aha-bha-clarifying-treatment-toner-card.webp',
    keywords:'cosrx aha bha clarifying treatment toner asit tonik gozenek akne'},

  { id:'cosrx-low-ph-good-morning-gel-cleanser', name:'Low pH Good Morning Gel Cleanser',
    brand:'COSRX', brandSlug:'cosrx', category:'Temizleyiciler', categorySlug:'cleanse',
    price:649, volume:'150 ml', url:'/products/cosrx-low-ph-good-morning-gel-cleanser.html',
    image:'/assets/img/products/cosrx/cosrx-low-ph-good-morning-gel-cleanser-card.webp',
    keywords:'cosrx low ph good morning gel cleanser dusuk ph sabah temizleyici'},

  { id:'cosrx-salicylic-acid-daily-gentle-cleanser', concernSlugs:['blemish'], name:'Salicylic Acid Daily Gentle Cleanser',
    brand:'COSRX', brandSlug:'cosrx', category:'Temizleyiciler', categorySlug:'cleanse',
    price:679, volume:'150 ml', url:'/products/cosrx-salicylic-acid-daily-gentle-cleanser.html',
    image:'/assets/img/products/cosrx/cosrx-salicylic-acid-daily-gentle-cleanser-card.webp',
    keywords:'cosrx salicylic acid daily gentle cleanser salisilik asit gozenek akne'},

  { id:'cosrx-oil-free-ultra-moisturizing-lotion', name:'Oil-Free Ultra Moisturizing Lotion',
    brand:'COSRX', brandSlug:'cosrx', category:'Nemlendiriciler', categorySlug:'care',
    price:799, volume:'100 ml', url:'/products/cosrx-oil-free-ultra-moisturizing-lotion.html',
    image:'/assets/img/products/cosrx/cosrx-oil-free-ultra-moisturizing-lotion-card.webp',
    keywords:'cosrx oil free ultra moisturizing lotion yaglanmayan hafif nemlendirici'},

  /* ── DR. JART+ ─────────────────────────────────────────── */
  { id:'dr-jart-ceramidin-cream', name:'Ceramidin Cream',
    brand:'Dr. Jart+', brandSlug:'dr-jart', category:'Nemlendiriciler', categorySlug:'care',
    price:1349, volume:'50 ml', url:'/products/dr-jart-ceramidin-cream.html',
    image:'/assets/img/products/dr-jart/dr-jart-ceramidin-cream-card.webp',
    keywords:'dr jart ceramidin cream seramid ceramide bariyer kuru hassas'},

  /* ── GOODAL ────────────────────────────────────────────── */
  { id:'goodal-green-tangerine-vitamin-c-serum', name:'Green Tangerine Vita C Dark Spot Serum',
    brand:'Goodal', brandSlug:'goodal', category:'Serum & Ampul', categorySlug:'treat',
    price:1099, volume:'30 ml', url:'/products/goodal-green-tangerine-vitamin-c-serum.html',
    image:'/assets/img/products/goodal/goodal-green-tangerine-vitamin-c-serum-card.webp',
    keywords:'goodal green tangerine vita c dark spot serum yesil mandalin vitamin c leke'},

  /* ── I'M FROM ──────────────────────────────────────────── */
  { id:'im-from-rice-toner', name:'Rice Toner',
    brand:"I'm From", brandSlug:'im-from', category:'Tonik & Essence', categorySlug:'hydrate',
    price:949, volume:'150 ml', url:'/products/im-from-rice-toner.html',
    image:'/assets/img/products/im-from/im-from-rice-toner-card.webp',
    keywords:'im from rice toner pirinc tonik parlaklik nem isilti glutathione'},

  /* ── INNISFREE ─────────────────────────────────────────── */
  { id:'innisfree-super-volcanic-clay-mask', concernSlugs:['blemish'], name:'Super Volcanic Clay Mask 2X',
    brand:'Innisfree', brandSlug:'innisfree', category:'Maskeler', categorySlug:'masks',
    price:849, volume:'100 ml', url:'/products/innisfree-super-volcanic-clay-mask.html',
    image:'/assets/img/products/innisfree/innisfree-super-volcanic-clay-mask-card.webp',
    keywords:'innisfree super volcanic clay mask jeju volkanik kil gozenek sebum'},

  /* ── ISNTREE ───────────────────────────────────────────── */
  { id:'isntree-hyaluronic-acid-watery-sun-gel', name:'Hyaluronic Acid Watery Sun Gel SPF 50+ PA++++',
    brand:'Isntree', brandSlug:'isntree', category:'Güneş Koruyucular', categorySlug:'protect',
    price:879, volume:'50 ml', url:'/products/isntree-hyaluronic-acid-watery-sun-gel.html',
    image:'/assets/img/products/isntree/isntree-hyaluronic-acid-watery-sun-gel-card.webp',
    keywords:'isntree hyaluronic acid watery sun gel spf50 gunes hyaluronik hafif'},

  /* ── LANEIGE ───────────────────────────────────────────── */
  { id:'laneige-water-sleeping-mask', name:'Water Sleeping Mask',
    brand:'Laneige', brandSlug:'laneige', category:'Maskeler', categorySlug:'masks',
    price:1249, volume:'70 ml', url:'/products/laneige-water-sleeping-mask.html',
    image:'/assets/img/products/laneige/laneige-water-sleeping-mask-card.webp',
    keywords:'laneige water sleeping mask uyku maskesi gece nem hidrasyon'},

  /* ── MEDICUBE ──────────────────────────────────────────── */
  { id:'medicube-zero-pore-pad', concernSlugs:['blemish'], name:'Zero Pore Pad',
    brand:'Medicube', brandSlug:'medicube', category:'Tonik & Essence', categorySlug:'hydrate',
    price:849, volume:'70 adet', url:'/products/medicube-zero-pore-pad.html',
    image:'/assets/img/products/medicube/medicube-zero-pore-pad-card.webp',
    keywords:'medicube zero pore pad gozenek ped aha bha sebum akne'},

  { id:'medicube-collagen-night-wrapping-mask', concernSlugs:['blemish'], name:'Collagen Night Wrapping Mask',
    brand:'Medicube', brandSlug:'medicube', category:'Maskeler', categorySlug:'masks',
    price:749, volume:'100 ml', url:'/products/medicube-collagen-night-wrapping-mask.html',
    image:'/assets/img/products/medicube/medicube-collagen-night-wrapping-mask-card.webp',
    keywords:'medicube collagen night wrapping mask kolajen gece maskesi dolgunluk'},

  /* ── MEDIHEAL ──────────────────────────────────────────── */
  { id:'mediheal-nmf-aquaring-sheet-mask', name:'NMF Aquaring Ampoule Mask',
    brand:'Mediheal', brandSlug:'mediheal', category:'Maskeler', categorySlug:'masks',
    price:129, volume:'1 adet', url:'/products/mediheal-nmf-aquaring-sheet-mask.html',
    image:'/assets/img/products/mediheal/mediheal-nmf-aquaring-sheet-mask-card.webp',
    keywords:'mediheal nmf aquaring ampoule sheet mask yaprak maskesi nem dolgunluk'},

  /* ── ROUND LAB ─────────────────────────────────────────── */
  { id:'round-lab-1025-dokdo-cleanser', name:'1025 Dokdo Cleanser',
    brand:'Round Lab', brandSlug:'round-lab', category:'Temizleyiciler', categorySlug:'cleanse',
    price:729, volume:'150 ml', url:'/products/round-lab-1025-dokdo-cleanser.html',
    image:'/assets/img/products/round-lab/round-lab-1025-dokdo-cleanser-card.webp',
    keywords:'round lab 1025 dokdo cleanser mineral deniz suyu ceramide nazik temizleyici'},

  { id:'round-lab-dokdo-toner', name:'Dokdo Toner',
    brand:'Round Lab', brandSlug:'round-lab', category:'Tonik & Essence', categorySlug:'hydrate',
    price:849, volume:'200 ml', url:'/products/round-lab-dokdo-toner.html',
    image:'/assets/img/products/round-lab/round-lab-dokdo-toner-card.webp',
    keywords:'round lab dokdo toner mineral tonik nem deniz suyu hassas'},

  { id:'round-lab-birch-juice-sunscreen', name:'Birch Juice Moisturizing Sunscreen SPF 50+ PA++++',
    brand:'Round Lab', brandSlug:'round-lab', category:'Güneş Koruyucular', categorySlug:'protect',
    price:899, volume:'50 ml', url:'/products/round-lab-birch-juice-sunscreen.html',
    image:'/assets/img/products/round-lab/round-lab-birch-juice-sunscreen-card.webp',
    keywords:'round lab birch juice moisturizing sunscreen spf50 hus suyu gunes'},

  { id:'round-lab-soybean-nourishing-cream', name:'Soybean Nourishing Cream',
    brand:'Round Lab', brandSlug:'round-lab', category:'Nemlendiriciler', categorySlug:'care',
    price:1049, volume:'80 ml', url:'/products/round-lab-soybean-nourishing-cream.html',
    image:'/assets/img/products/round-lab/soybean-nourishing-cream-card.png',
    keywords:'round lab soybean nourishing cream soya seramid adenosin besleyici'},

  /* ── SKIN1004 ──────────────────────────────────────────── */
  { id:'skin1004-madagascar-centella-ampoule', name:'Madagascar Centella Ampoule',
    brand:'SKIN1004', brandSlug:'skin1004', category:'Serum & Ampul', categorySlug:'treat',
    price:869, volume:'55 ml', url:'/products/skin1004-madagascar-centella-ampoule.html',
    image:'/assets/img/products/skin1004/skin1004-madagascar-centella-ampoule-card.webp',
    keywords:'skin1004 madagascar centella ampoule centella asiatica yatistirici hassas'},

  { id:'skin1004-centella-toning-toner', name:'Madagascar Centella Tone Brightening Toner',
    brand:'SKIN1004', brandSlug:'skin1004', category:'Tonik & Essence', categorySlug:'hydrate',
    price:829, volume:'210 ml', url:'/products/skin1004-centella-toning-toner.html',
    image:'/assets/img/products/skin1004/skin1004-centella-toning-toner-card.webp',
    keywords:'skin1004 centella tone brightening toner isilti nem centella tonik'},

  { id:'skin1004-hyalu-cica-water-fit-sun-serum', name:'Hyalu-Cica Water-Fit Sun Serum SPF 50+ PA++++',
    brand:'SKIN1004', brandSlug:'skin1004', category:'Güneş Koruyucular', categorySlug:'protect',
    price:879, volume:'50 ml', url:'/products/skin1004-hyalu-cica-water-fit-sun-serum.html',
    image:'/assets/img/products/skin1004/skin1004-hyalu-cica-water-fit-sun-serum-card.webp',
    keywords:'skin1004 hyalu cica water fit sun serum spf50 centella hyaluronik'},

  /* ── SOME BY MI ────────────────────────────────────────── */
  { id:'some-by-mi-aha-bha-miracle-toner', concernSlugs:['blemish'], name:'AHA BHA PHA 30 Days Miracle Toner',
    brand:'Some By Mi', brandSlug:'some-by-mi', category:'Tonik & Essence', categorySlug:'hydrate',
    price:729, volume:'150 ml', url:'/products/some-by-mi-aha-bha-miracle-toner.html',
    image:'/assets/img/products/some-by-mi/some-by-mi-aha-bha-miracle-toner-card.webp',
    keywords:'some by mi aha bha pha 30 days miracle toner asit tonik gozenek leke akne'},

  /* ── TORRIDEN ──────────────────────────────────────────── */
  { id:'torriden-dive-in-hyaluronic-acid-serum', name:'DIVE-IN Low Molecular Hyaluronic Acid Serum',
    brand:'Torriden', brandSlug:'torriden', category:'Serum & Ampul', categorySlug:'treat',
    price:949, volume:'50 ml', url:'/products/torriden-dive-in-hyaluronic-acid-serum.html',
    image:'/assets/img/products/torriden/torriden-dive-in-hyaluronic-acid-serum-card.webp',
    keywords:'torriden dive in low molecular hyaluronic acid serum hyaluronik nem'},

  { id:'torriden-solid-in-ceramide-cream', name:'SOLID-IN Ceramide Cream',
    brand:'Torriden', brandSlug:'torriden', category:'Nemlendiriciler', categorySlug:'care',
    price:989, volume:'70 ml', url:'/products/torriden-solid-in-ceramide-cream.html',
    image:'/assets/img/products/torriden/torriden-solid-in-ceramide-cream-card.webp',
    keywords:'torriden solid in ceramide cream seramid bariyer kuru hassas krem'},

  { id:'torriden-dive-in-watery-moisture-sun-cream', name:'DIVE-IN Watery Moisture Sun Cream SPF 50+ PA++++',
    brand:'Torriden', brandSlug:'torriden', category:'Güneş Koruyucular', categorySlug:'protect',
    price:939, volume:'60 ml', url:'/products/torriden-dive-in-watery-moisture-sun-cream.html',
    image:'/assets/img/products/torriden/watery-moisture-sun-cream-card.png',
    keywords:'torriden dive in watery moisture sun cream spf50 gunes hafif hyaluronik'},

];

/* ── Arama Yapısını Otomatik Oluştur ──────────────────── */
window.COSMOSKIN_SEARCH_PRODUCTS = window.COSMOSKIN_PRODUCTS.map(function(p) {
  return {
    label: p.name,
    type: 'Ürün',
    badge: p.brand,
    url: p.url,
    meta: p.brand + ' · ' + p.category + ' · ' + (p.volume || ''),
    keywords: p.name + ' ' + p.brand + ' ' + p.category + ' ' + (p.keywords || '')
  };
});
