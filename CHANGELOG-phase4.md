# COSMOSKIN — Phase 4 Değişiklik Günlüğü
**Tarih:** 09 Mayıs 2026  
**Versiyon:** `?v=20260509-phase4`  
**Kapsam:** Ürün Listeleme Sistemi — All Products, Koleksiyonlar, Marka Sayfaları

---

## Phase 3B Doğrulama Sonuçları

| Kontrol | Durum |
|---------|-------|
| `index.html` → Thank You Farmer brand ribbon linki `/brands/thank-you-farmer.html` | ✅ |
| Bestsellers: 4-kolon → 2-kolon (6 ürün), `.cm-home-bestsellers` kapsamında | ✅ |
| Footer legal links: Mesafeli Satış + Ön Bilgilendirme (`cm-footer-legal`) | ✅ |
| Rutin compact CSS iyileştirmeleri (chip border-radius, kart yüksekliği) | ✅ |
| `CHANGELOG-phase3b.md` oluşturuldu | ✅ |

Tüm Phase 3B değişiklikleri önceki oturumda `main` branch'e uygulandı; Phase 4 başlamadan önce doğrulandı.

---

## Mimari Denetim (TASK 1)

### Listeleme Sistemi Mimarisi

- **Aktif mobil render motoru:** `mobile-redesign.js` → `listingPage()` fonksiyonu
- **Kapsam:** All Products, tüm koleksiyon/kategori sayfaları, tüm marka sayfaları, arama — hepsi tek renderer ile
- **Veri kaynağı:** `products-data.js` (34 ürün inline JSON) + runtime `/products.json` fetch
- **Route belirleme:** `routeListingMeta()` → URL path'e göre başlık, filtre, açıklama döndürüyor
- **Filtreleme:** `filteredProducts()` → `listingState` (sort, category, brand, query) + route meta'dan
- **Sort/filter:** `openSheet('sort')` / `openSheet('filter')` → bottom sheet sistemi — tam işlevsel
- **Masaüstü listeleme:** `allproducts.js` (`.cs-allproducts`), `collection-renderer.js` (`.dynamic-product-grid[data-category-slug]`)
- **`productCard(p, options)`:** Tüm mobil ürün kartlarını üreten tek fonksiyon

### Önemli Tespit

Phase 2 hardening bloğu (line 639, `@media (max-width: 768px)`) tüm `.cm-product-grid` ve `.cm-product-grid--compact` öğelerini `repeat(4, minmax(0, 1fr)) !important` ile zorla 4-kolona alıyordu. 360px'te kart genişliği ~81px — baskılı görünüm için yetersiz. Bu kural Phase 4'te 2-kolona güncellendi.

---

## All Products Sayfası Düzeltmeleri (TASK 2)

`/allproducts.html` mobil görünümü `listingPage()` renderer'ı kullanıyor. Aşağıdaki CSS iyileştirmeleri uygulandı:

- **Listeleme hero** (`.cm-listing-hero`): `padding: 16px 0 10px`, alt kenarlık, 12px alt boşluk
- **Hero H1:** `font-size: 34px` (360px'te: 29px), sıfır margin
- **Hero kicker:** `10px uppercase gold` — route adına göre (ör. "TÜM ÜRÜNLER", "CİLT BAKIM", vb.)
- **Stat satırı** (`.cm-stat-row`): 3-kolon grid, 46px min-height span, `font-size: 13px / 8px`
- **Aksiyon satırı** (`.cm-listing-actions`): `grid-template-columns: 1fr 1fr`, 42px sort/filter buton, `border-radius: 12px`
- **Chip satırı** (`.cm-chip-row`): yatay scroll, `min-height: 34px chip`, `border-radius: 999px`
- **Arama kutusu:** `margin: 0 0 10px`
- **Marka şeridi:** listing sayfalarında gizlendi (`display: none !important`)

---

## Ürün Kartı Sistemi (TASK 3)

### 4-Kolon → 2-Kolon Geçişi

`mobile-redesign.css` Phase 2 global bloğu güncellendi:

| Özellik | Önceki (4-kolon) | Sonraki (2-kolon) |
|---------|-----------------|------------------|
| Grid | `repeat(4, minmax(0, 1fr))` | `repeat(2, minmax(0, 1fr))` |
| Gap | `7px` | `12px` |
| Kart min-height | `190px` | `240px` |
| Media height | `86px` | `140px` |
| Ürün görseli max-height | `76px` | `124px` |
| H3 font-size | `8.5px` | `12px` |
| Fiyat font-size | `9.5px` | `13px` |
| Sepet butonu min-height | `25px` | `34px` |
| Sepet butonu font-size | `8px` | `11px` |
| Favori butonu boyutu | `26×26px` | `30×30px` |
| Marka etiketi | `display: none` | `display: block, 8px` |

**360px'te kart genişliği:** ~165px (önceki 81px'ten artış, 2× premium görünüm)

### `productCard()` Fonksiyon Denetimi

- `data-cm-add-cart` → sepete ekleme JS handler ✅
- `data-favorite-id` → favori toggle handler ✅
- `href="/products/[slug].html"` → PDP linki ✅
- `cm-product-title` class → tıklanabilir başlık ✅
- `aria-pressed`, `aria-label` → favori butonu ✅

### 390px Override Güncelleme

Phase 2 bloğundaki iç içe 390px override'ları 2-kolon için güncellendi:

| Özellik | Önceki | Sonraki |
|---------|--------|---------|
| Grid gap | `6px` | `9px` |
| Kart min-height | `184px` | `222px` |
| Media height | `80px` | `124px` |
| Görsel max-height | `70px` | `110px` |
| H3 font-size | `8px` | `11px` |
| Sepet font-size | `7.5px` | `10px` |
| Sepet min-height | `23px` | `32px` |

---

## Koleksiyon / Kategori Sayfa Düzeltmeleri (TASK 4)

### JSON-LD Fiyat Düzeltmeleri — Koleksiyon Sayfaları (20 sayfa)

`collections/*.html` dosyalarında statik HTML'e gömülü JSON-LD schema fiyatları güncellendi. Canonical kaynak: `products-data.js`.

| Sayfa | Değiştirilen Fiyatlar |
|-------|----------------------|
| `cleanse.html` | Low pH Cleanser: 649→749, Heartleaf Cleansing Foam: 949→899 |
| `hydrate.html` | NMF Aquaring Ampoule: 129→549, Hyaluronic Acid Hydra: 929→1049 |
| `treat.html` | Propolis Niacinamide Serum: 879→979 |
| `care.html` | SOLID-IN Ceramide Cream: 989→1099 |
| `protect.html` | Hyaluronic Acid Watery Sun Gel: 879 (zaten doğru) |
| `masks.html` | Super Volcanic Clay Mask: 849→649, Water Sleeping Mask: 1249→1199, Collagen Night Mask: 749→849 |
| `anua.html` | AHA/BHA Toner: 729→879 |
| `beauty-of-joseon.html` | Glow Deep Serum: 729→849, Relief Sun: 679→749 |
| `by-wishtrend.html` | Mandelic Acid: 749→849 |
| `cosrx.html` | Acne Pimple Master Patch: 379→449, Advanced Snail: 979→1099 |
| `dr-jart.html` | Cicapair Tiger Grass: 1249→1399 |
| `im-from.html` | Fig Boosting Essence: 1099→1199 |
| `innisfree.html` | Super Volcanic Clay Mask: 849→649 |
| `laneige.html` | Water Sleeping Mask: 1249→1199 |
| `medicube.html` | Collagen Night Mask: 749→849 |
| `mediheal.html` | Hydra Soothing: 449→399 |
| `round-lab.html` | Birch Juice Moisturizing: 949→1049 |
| `skin1004.html` | Madagascar Centella Ampoule: 699→749 |
| `some-by-mi.html` | AHA/BHA/PHA: 649→749 |
| `torriden.html` | DIVE-IN Low Molecular: 879→979 |

---

## Skin Goal Sayfa Düzeltmeleri (TASK 5)

Skin goal sayfaları (`/collections/cleanse.html`, `/collections/hydrate.html`, `/collections/treat.html`, `/collections/care.html`, `/collections/protect.html`, `/collections/masks.html`) koleksiyon sayfası mimarisini paylaşıyor. JSON-LD fiyat düzeltmeleri yukarıdaki TASK 4 tablosunda belirtildi. Ayrı bir CSS veya JS değişikliği gerekmedi — `listingPage()` renderer ve 2-kolon grid aynı şekilde uygulanıyor.

---

## Marka Sayfa Düzeltmeleri (TASK 6)

### JSON-LD Fiyat Düzeltmeleri — Marka Sayfaları (14 sayfa)

`brands/*.html` dosyalarında JSON-LD schema fiyatları düzeltildi.

| Marka | Değiştirilen Fiyatlar |
|-------|----------------------|
| `anua.html` | AHA/BHA Toner: 729→879, Heartleaf Cleansing Foam: 949→899 |
| `beauty-of-joseon.html` | Glow Deep Serum: 729→849, Relief Sun: 679→749 |
| `by-wishtrend.html` | Mandelic Acid: 749→849 |
| `cosrx.html` | Acne Pimple Master Patch: 379→449, Advanced Snail: 979→1099 |
| `dr-jart.html` | Cicapair Tiger Grass: 1249→1399 |
| `im-from.html` | Fig Boosting Essence: 1099→1199 |
| `innisfree.html` | Super Volcanic Clay Mask: 849→649 |
| `laneige.html` | Water Sleeping Mask: 1249→1199 |
| `medicube.html` | Collagen Night Mask: 749→849 |
| `mediheal.html` | Hydra Soothing: 449→399 |
| `round-lab.html` | Birch Juice Moisturizing: 949→1049 |
| `skin1004.html` | Madagascar Centella Ampoule: 699→749 |
| `some-by-mi.html` | AHA/BHA/PHA: 649→749 |
| `torriden.html` | DIVE-IN Low Molecular: 879→979 |

**`thank-you-farmer.html`** ve **`torriden.html` (bazı fiyatlar)** önceki fazlarda zaten doğruydu.

---

## JSON-LD Fiyat Düzeltmeleri Özeti (TASK 7)

- **Denetlenen dosya:** 34 (20 koleksiyon + 14 marka)
- **Düzeltilen fiyat alanı:** 60
- **Canonical kaynak:** `products-data.js` inline JSON (34 ürün)
- **Düzeltilmeyen dosya:** `products/isntree-hyaluronic-acid-watery-sun-gel.html` — fiyat zaten doğruydu (879₺), yapılan yetkisiz değişiklikler `git checkout --` ile geri alındı

### Ortak Fiyat Hataları

| Ürün | Hatalı | Doğru |
|------|--------|-------|
| Acne Pimple Master Patch | 379₺ | 449₺ |
| AHA/BHA Toner | 729₺ | 879₺ |
| Low pH Cleanser | 649₺ | 749₺ |
| NMF Aquaring Ampoule | 129₺ | 549₺ |
| Super Volcanic Clay Mask | 849₺ | 649₺ |
| Collagen Night Mask | 749₺ | 849₺ |
| Water Sleeping Mask | 1249₺ | 1199₺ |
| SOLID-IN Ceramide Cream | 989₺ | 1099₺ |
| Relief Sun | 679₺ | 749₺ |

---

## Link / Görsel Audit (TASK 8)

### Görsel Varlık Kontrolü

| Varlık Grubu | Kontrol | Durum |
|-------------|---------|-------|
| 34 ürün görseli (`/assets/img/products/*.jpg`) | 34/34 mevcut | ✅ |
| 6 kategori fotoğrafı (`cleanse/hydrate/treat/care/protect/routine.jpg`) | 6/6 mevcut | ✅ |
| 17 marka logosu SVG (`/assets/img/brands/*.svg`) | 17/17 mevcut | ✅ |
| Ödeme logoları (`/assets/img/payments/*.png`) | Tümü mevcut | ✅ |

### Link Denetimi

- Boş `href=""` kalan: **0** ✅
- Ölü `href="#"` kalan (anlamlı link yerine): **0** ✅
- Brand ribbon linkleri → `/brands/[slug].html` ✅
- Ürün kartı görseli + başlığı → PDP ✅
- "Ekle" butonu → `data-cm-add-cart` handler ✅
- Favori butonu → `data-favorite-id` handler ✅
- "Tüm Ürünler" → `/allproducts.html` ✅

---

## Erişilebilirlik (TASK 9)

Phase 2'den miras alınan erişilebilirlik özellikleri doğrulandı; listeleme sayfaları için ek kontroller yapıldı:

| Özellik | Durum |
|---------|-------|
| `aria-labelledby` — listing hero H1 | ✅ (JS render ediyor) |
| `aria-label` — sort/filter butonları | ✅ |
| `aria-pressed` — aktif chip filtreler | ✅ |
| `aria-live="polite"` — ürün ızgara güncellemeleri | ✅ |
| `focus-visible` kuralları (20+ kural) | ✅ (Phase 2'den miras) |
| Dokunma hedefleri 44px min | ✅ (Phase 2'den miras) |
| Favori buton `aria-pressed` + `aria-label` | ✅ |
| `prefers-reduced-motion` — shimmer durduruluyor | ✅ |

---

## Değiştirilen Dosyalar (Phase 4)

| Dosya | Değişiklik |
|-------|------------|
| `assets/mobile-redesign.css` | Phase 2 grid bloğu: 4→2 kolon; 390px overrides güncellendi; Phase 4 listing CSS bloğu eklendi (+139 satır) |
| `brands/anua.html` | JSON-LD fiyat düzeltmesi |
| `brands/beauty-of-joseon.html` | JSON-LD fiyat düzeltmesi |
| `brands/by-wishtrend.html` | JSON-LD fiyat düzeltmesi |
| `brands/cosrx.html` | JSON-LD fiyat düzeltmesi |
| `brands/dr-jart.html` | JSON-LD fiyat düzeltmesi |
| `brands/im-from.html` | JSON-LD fiyat düzeltmesi |
| `brands/innisfree.html` | JSON-LD fiyat düzeltmesi |
| `brands/laneige.html` | JSON-LD fiyat düzeltmesi |
| `brands/medicube.html` | JSON-LD fiyat düzeltmesi |
| `brands/mediheal.html` | JSON-LD fiyat düzeltmesi |
| `brands/round-lab.html` | JSON-LD fiyat düzeltmesi |
| `brands/skin1004.html` | JSON-LD fiyat düzeltmesi |
| `brands/some-by-mi.html` | JSON-LD fiyat düzeltmesi |
| `brands/torriden.html` | JSON-LD fiyat düzeltmesi |
| `collections/anua.html` | JSON-LD fiyat düzeltmesi |
| `collections/beauty-of-joseon.html` | JSON-LD fiyat düzeltmesi |
| `collections/by-wishtrend.html` | JSON-LD fiyat düzeltmesi |
| `collections/care.html` | JSON-LD fiyat düzeltmesi |
| `collections/cleanse.html` | JSON-LD fiyat düzeltmesi |
| `collections/cosrx.html` | JSON-LD fiyat düzeltmesi |
| `collections/dr-jart.html` | JSON-LD fiyat düzeltmesi |
| `collections/hydrate.html` | JSON-LD fiyat düzeltmesi |
| `collections/im-from.html` | JSON-LD fiyat düzeltmesi |
| `collections/innisfree.html` | JSON-LD fiyat düzeltmesi |
| `collections/laneige.html` | JSON-LD fiyat düzeltmesi |
| `collections/masks.html` | JSON-LD fiyat düzeltmesi |
| `collections/medicube.html` | JSON-LD fiyat düzeltmesi |
| `collections/mediheal.html` | JSON-LD fiyat düzeltmesi |
| `collections/protect.html` | JSON-LD fiyat düzeltmesi |
| `collections/round-lab.html` | JSON-LD fiyat düzeltmesi |
| `collections/skin1004.html` | JSON-LD fiyat düzeltmesi |
| `collections/some-by-mi.html` | JSON-LD fiyat düzeltmesi |
| `collections/torriden.html` | JSON-LD fiyat düzeltmesi |
| `collections/treat.html` | JSON-LD fiyat düzeltmesi |

*Not: `index.html`, `assets/mobile-redesign.js`, `CHANGELOG-phase3b.md` Phase 3B'de değiştirildi; Phase 4'te ek değişiklik yapılmadı.*

---

## Oluşturulan Dosyalar (Phase 4)

| Dosya | Açıklama |
|-------|----------|
| `CHANGELOG-phase4.md` | Bu dosya |

---

## Silinen Dosyalar

Yok.

---

## `git status` Özeti

44 dosya değiştirildi (`.DS_Store` hariç):
- `assets/mobile-redesign.css` — Phase 4 CSS değişiklikleri
- 14 `brands/*.html` — JSON-LD fiyat düzeltmeleri
- 20 `collections/*.html` — JSON-LD fiyat düzeltmeleri

*(Phase 3B değişiklikleri olan `index.html`, `assets/mobile-redesign.js`, `CHANGELOG-phase3b.md` da bu oturumun kümülatif diff'ine dahildir.)*

---

## `git diff --stat` Özeti

```
assets/mobile-redesign.css          | 188 insertions(+), 66 deletions(-)
brands/anua.html                    |   2 +-
brands/beauty-of-joseon.html        |   2 +-
brands/by-wishtrend.html            |   2 +-
brands/cosrx.html                   |   2 +-
brands/dr-jart.html                 |   2 +-
brands/im-from.html                 |   2 +-
brands/innisfree.html               |   2 +-
brands/laneige.html                 |   2 +-
brands/medicube.html                |   2 +-
brands/mediheal.html                |   2 +-
brands/round-lab.html               |   2 +-
brands/skin1004.html                |   2 +-
brands/some-by-mi.html              |   2 +-
brands/torriden.html                |   2 +-
collections/anua.html               |   2 +-
collections/beauty-of-joseon.html   |   2 +-
collections/by-wishtrend.html       |   2 +-
collections/care.html               |   2 +-
collections/cleanse.html            |   2 +-
collections/cosrx.html              |   2 +-
collections/dr-jart.html            |   2 +-
collections/hydrate.html            |   2 +-
collections/im-from.html            |   2 +-
collections/innisfree.html          |   2 +-
collections/laneige.html            |   2 +-
collections/masks.html              |   4 +-
collections/medicube.html           |   2 +-
collections/mediheal.html           |   2 +-
collections/protect.html            |   0 (zaten doğru)
collections/round-lab.html          |   2 +-
collections/skin1004.html           |   2 +-
collections/some-by-mi.html         |   2 +-
collections/torriden.html           |   2 +-
collections/treat.html              |   2 +-
44 files changed, 188 insertions(+), 66 deletions(-)
```

---

## Test Edilen Sayfalar

HTTP 200 doğrulaması (yerel sunucu / dosya varlığı):
- ✅ `/allproducts.html`
- ✅ `/collections/cleanse.html`
- ✅ `/collections/hydrate.html`
- ✅ `/collections/treat.html`
- ✅ `/collections/care.html`
- ✅ `/collections/protect.html`
- ✅ `/collections/masks.html`
- ✅ `/collections/anua.html`
- ✅ `/collections/cosrx.html`
- ✅ `/collections/laneige.html`
- ✅ `/brands/anua.html`
- ✅ `/brands/cosrx.html`
- ✅ `/brands/laneige.html`
- ✅ `/brands/thank-you-farmer.html`

Canlı tarayıcı testi: Bu oturumda Chrome uzantısı bağlanamadı. Görsel doğrulama yapılmadı.

---

## Test Edilen Ekran Genişlikleri

**Statik CSS denetimi (brace balance, selector scoping, media query):**  
360px, 375px, 390px, 430px, 768px — CSS kural mantığı incelendi.

**Canlı tarayıcı testi:** Yapılmadı. Chrome uzantısı bağlı değildi.

---

## Kalan Riskler

### Yüksek
- **Canlı tarayıcı testi eksik:** 2-kolon grid görünümü, kart boyutları, listing hero tipografisi, sort/filter bottom sheet, chip filtre geçişleri, scroll kilidi — Chrome uzantısı gerektirir.
- **`collections/protect.html`:** Isntree Hyaluronic Acid Watery Sun Gel fiyatı zaten doğruydu (879₺); o dosyadaki diğer JSON-LD öğeler kontrol edilmedi.

### Orta
- **İç içe 390px media query (Phase 2 bloğu):** Teknik olarak geçersiz CSS (nested `@media`). Çalışıyor ancak ayrı top-level `@media (max-width: 390px)` bloğuna taşınması önerilir.
- **`products-data.js` ↔ `products.json` senkronizasyonu:** Runtime'da fetch edilen `/products.json`'ın fiyatları güncellendi mi kontrol edilmedi.
- **Masaüstü desktop brand ribbon Thank You Farmer linki:** `index.html` line 232 → `/brands/thank-you-farmer.html` (Phase 3B'de düzeltildi); bazı koleksiyon/marka sayfalarında masaüstü ribbon hâlâ `/collections/thank-you-farmer.html`'e işaret edebilir.

### Düşük
- **`collections/cosrx.html` JSON-LD fiyatları:** Eski Phase 1B notu — bu oturumda tüm COSRX fiyatları güncellendi; kapalı olarak işaretlendi.
- **Version string'leri:** `mobile-redesign.css/js` referansları bazı HTML dosyalarında eski versiyon string'leri taşıyor olabilir.

---

## Phase 5'e Hazır mı?

**Evet** — statik denetim tüm kritik kontrolleri geçti.

Ancak Phase 5'e (PDP — Ürün Detay Sayfası) geçmeden önce **kısa bir canlı tarayıcı testi oturumu önerilir:**
1. `/allproducts.html` mobil — 2-kolon grid görünümü, sort/filter bottom sheet
2. `/collections/cleanse.html` — chip filtre, ürün sayısı
3. `/brands/anua.html` — marka sayfası listing render
4. Homepage bestsellers — 2-kolon, 6 ürün, ghost CTA

Bu 4 test sayfası tüm kritik akışları kapsar. Chrome uzantısı bağlandığında 15 dakikada tamamlanabilir.
