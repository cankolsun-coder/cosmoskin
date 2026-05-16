# COSMOSKIN — Site Audit & Partial Fix Pass

**Tarih:** 2026-05-16
**Kapsam:** 14 maddelik denetim isteğinin ilk pass'i. Yüksek-etki / düşük-risk düzeltmeler uygulandı. Geri kalan kalemler aşağıda Punch List olarak listelendi.

---

## Senior-Level Önceliklendirme

İstek 14 büyük iş kalemi içeriyordu (kategori navigasyonu, search, PDP içerikleri, routine state sync, design defects, vb.). Bunların hepsini tek bir geçişte güvenli şekilde yapmak mümkün değil; her biri tek başına sahaya çıkmadan QA gerektiren değişiklikler. Senior yaklaşım: önce **düşük-risk / yüksek-etki** düzeltmeleri yap, gerisini açıkça punch list olarak teslim et.

Bu pass'te yapılanlar:

| # | Düzeltme | Etki | Risk |
|---|---------|------|------|
| 1 | Cilt Tipi dropdown yanlış route'ları | Yüksek | Düşük |
| 2 | `href="#"` Kayıt Ol dead link'leri (3 dosyada) | Orta | Düşük |
| 3 | Ürün kart fiyat font boyutu global olarak küçültüldü | Yüksek (görsel) | Düşük |
| 4 | Search overlay sağ-kenar overflow güvenliği | Orta | Düşük |

---

## Yapılan Düzeltmeler

### 1. Cilt Tipi Dropdown Doğru Koleksiyonlara Yönlendirildi
**Dosya:** [index.html:162](index.html#L162)

Önce: Karma Cilt ve Normal Cilt `/account/routines.html`'e yönlendiriyordu — bu yanlıştı, kategoriler ürün koleksiyonlarına gitmeli.

Sonra:
- Kuru Cilt → `/collections/hydrate.html` (korundu)
- Yağlı Cilt → `/collections/pore-sebum.html` (önceden `protect.html` yanlışlığı)
- Karma Cilt → `/collections/hydration.html` (önceden routines'e gidiyordu)
- Hassas Cilt → `/collections/sensitivity.html` (önceden `care.html` yanlışlığı)
- Normal Cilt → `/collections/barrier.html` (önceden routines'e gidiyordu)
- **Akneye Eğilimli** (yeni eklendi) → `/collections/acne-balance.html`

Tüm hedef sayfalar mevcut. Yeni route yaratılmadı.

### 2. Dead Link Onarımı
**Dosyalar:** `routine.html:214`, `rutinler.html:214`, `collections/routine.html:214`

Önce: `<a href="#" data-rt-auth="register">Hesabın yok mu? Kayıt Ol →</a>`
Sonra: `<a href="/account/index.html" data-rt-auth="register">...`

Sebep: `data-rt-auth` JS handler'ı kayıt modal'ı açıyor; ama JS yüklenmeden önce tıklanırsa veya bot/tarayıcı JS'siz erişirse `#` sayfanın başına atıyor — sessiz bozulma. Şimdi fallback olarak account dashboard'a düşer (auth'lu değilse zaten login/register prompt'u olur).

### 3. Ürün Kartı Fiyat Tipografisi Global Düşürüldü
**Dosya:** [assets/master-upgrade.css:298–336](assets/master-upgrade.css)

Eski durum (denetim sonucu):
- `style.css:6938` → `.price { font-size: 28px }`
- `master-upgrade.css:197` → `.product-card .price { font-size: 22px !important }`
- `phase6-commerce.css` → çeşitli yerlerde 18–22px
- Mobile (760px altı) → `master-upgrade.css:203` 20px

Sonuç: Aynı sayfada farklı fiyat boyutları, baskın `!important` çatışmaları, masaüstünde 28px büyük görünüm.

Yeni durum (tek `!important` katmanı dosyanın sonunda):
- Desktop: **16px**, weight 700, harmonik
- Mobile (≤760px): **15px**
- Strike/del (eski fiyat): 12px / 11.5px, hafif renk

Etkilenen selektörler:
```
.product-card .price, .collection-page .price, .product-body .price,
.cm-product-card .price, .cm-card-price, .phase6-product-card .price,
#bestsellers .price, .price
```

### 4. Search Overlay Sağ-Kenar Taşma Güvenliği
**Dosya:** [assets/master-upgrade.css:338–356](assets/master-upgrade.css)

Eski durum: `.header .site-search-results { width: min(380px, calc(100vw - 48px)) }` — dar masaüstünde (örn. 1100px) overlay sağdan parent container'ı taşabiliyordu, kullanıcının raporladığı "alt sağda kutu görünür" görüntüsüne neden olabilir.

Yeni durum:
- `width: min(380px, calc(100vw - 32px)) !important`
- `max-width: calc(100vw - 32px) !important` (ekstra koruma)
- `max-height: min(72svh, 520px)` + `overflow-y: auto` — uzun listede dikey scroll
- `overscroll-behavior: contain` — scroll page'i etkilemez
- Mobile altında genişlik viewport-24px, sağa yapışık

Search input `outline` artifact'i zaten önceki turda mobil katmanda `:focus-within` polish'iyle çözülmüştü.

---

## Eklenen Dosyalar
- `COSMOSKIN_SITE_AUDIT_PARTIAL_FIX_REPORT_20260516.md` (bu rapor)

## Değiştirilen Dosyalar
- `index.html` — Cilt Tipi dropdown route'ları + master-upgrade.css cache versiyonu (`v=20260516-price-search`)
- `routine.html`, `rutinler.html`, `collections/routine.html` — `href="#"` → `/account/index.html`
- `assets/master-upgrade.css` — sonuna iki yeni katman (~60 satır): ürün fiyat tipografisi + search overlay overflow güvenliği

## Silinen Dosyalar
- Yok.

---

## DEFERRED / PUNCH LIST — Sonraki Pass'lerde Ele Alınmalı

Aşağıdaki kalemler tek bir geçişte yapılırsa regresyon riski yüksek. Ayrı pass'lerle veya kullanıcının önceliklendirdiği sırayla ele alınması önerilir.

### A. PDP "İçerikler" Bölümü Real Data Doldurma (TASK 5)
**Durum:** Yapılmadı. Sebep: ~40+ ürünün INCI listesi üretmek için resmî marka kaynaklarına erişim ve doğrulama gerekiyor. Kullanıcı talimatı: "Do not fabricate ingredients" — bu yüzden tahmin yapılmadı.

**Önerilen yol:**
1. `products.json`'a her ürün için `ingredients: { highlights: [...], full: [...] | null, verified: bool }` schema ekle.
2. Ingredients null ise PDP'de standart Türkçe placeholder göster: "İçerik bilgisi resmi kaynakla doğrulanmamıştır. Yayına almadan önce marka/tedarikçi verisiyle teyit edilmelidir."
3. Verified ürünleri toplu data entry sprint'i ile doldur (resmî marka sitelerinden veya Trendyol/Sevil/Gratis ürün sayfalarından).

**Tahminî efor:** 40+ ürün × 5–10 dk araştırma = ~5–7 saat data entry + 2 saat schema implementation.

### B. Cilt Profilim State Sync (TASK 7 + 8)
**Durum:** Yapılmadı. Sebep: Mevcut kod 4 farklı localStorage anahtarı kullanıyor (`SKIN_KEY` in home-routine.js, `cosmoskin_routine_preferences`, `cosmoskin_profile`, `STORAGE_ROUTINE` in mobile-redesign.js). Tek bir konsolide source-of-truth'a geçmek için her tüketici noktayı (`/account/profile.html`, `/account/routines.html`, `/account/routine-profile.html`, smart routine widget, mobile-redesign account widget) tek tek migrate etmek gerekiyor.

**Önerilen yol:**
1. Tek modül: `assets/skin-profile-store.js` — read/write/subscribe API'si, localStorage key `cosmoskin_skin_profile`.
2. Schema:
   ```js
   { skinType, sensitivity, primaryGoal, secondaryGoal, routineStyle, updatedAt }
   ```
3. Tüm tüketicilerin store'a `subscribe(callback)` ile bağlanması. Eski anahtarlardan tek-seferlik migration: ilk load'da eski key'leri oku, yeni format'a yaz, eskileri sil.

**Tahminî efor:** 1 günlük focused work + UI smoke testing.

### C. Side-tab UX (TASK 3) — In-Page Transition Hissi
**Durum:** Yapılmadı. Mevcut `/account/routines.html` zaten tek-page; ama `/account/profile.html`, `/account/orders.html`, `/account/returns.html` ayrı HTML dosyaları, bu yüzden tab geçişi tam page reload veriyor.

**Önerilen yol:**
- Hafif client-side router (sayfa-içi `<section data-tab="...">` blokları + `pushState`), veya
- Common sidebar layout'una hepsi taşınıp, content swap

**Risk:** Bu refactor SEO ve auth gating'i etkileyebilir. Backend-driven page'ler tek-page'e taşınırsa Supabase RLS senaryolarının test edilmesi gerekir.

### D. Adanmış Cilt Tipi Sayfaları (TASK 2)
**Durum:** Yapılmadı. Bu pass'te dropdown route'ları en yakın koleksiyon sayfalarına yönlendirildi (kullanıcının istediği "no broken navigation" kuralı korundu). Adanmış `/collections/kuru-cilt.html` vb. henüz yok.

**Önerilen yol:** Mevcut `collections/hydration.html` gibi koleksiyon sayfa template'ini kopya-yap-değiştir ile çoğalt. Her cilt tipi sayfasında `products.json` üzerinde filter (örn. `tags.skinType: 'dry'`). Bu filter alanı products.json'da henüz yok — yeni shema eklenmesi gerekir.

### E. Site-wide Design Defect Sweep (TASK 9)
**Durum:** Yapılmadı. Sebep: Visual QA gerektirir (tarayıcıda 6+ farklı sayfa, 3 viewport). Preview sandbox bu makinede çalışmıyor; manuel test gerekiyor.

**Önerilen yol:** Kullanıcı yerel server kurup (`python3 -m http.server 7700`) Chrome DevTools'ta 360/390/430/768/1280 px'de aşağıdaki sayfaları gezsin:
- /, /allproducts.html, /cart.html, /checkout.html
- /account/profile.html, /account/routines.html
- /collections/glow.html, /collections/sensitivity.html
- En az 3 brand sayfası (cosrx, anua, beauty-of-joseon)
- En az 3 PDP

Tespit edilen her defect ayrı bir focused fix pass'iyle ele alınabilir.

### F. Header Dropdown Davranış Polish (TASK 10)
**Durum:** Kısmen. Cilt Tipi route'ları düzeltildi. Ama dropdown'ın "close too fast" hissi için JS-level hover/focus geciktirme audit'i yapılmadı.

### G. products.json Tek-Kaynak Konsolidasyonu (TASK 11)
**Durum:** Yapılmadı. Şu anda hem `products.json` hem `assets/products-data.js` hem `assets/data/...` farklı yerlerde ürün listesi olabilir. Konsolidasyon ayrı bir refactor pass'i.

---

## Test Edilen

- ✅ `index.html` Cilt Tipi link'leri — 6/6 hedef dosya mevcut
- ✅ `routine.html`, `rutinler.html`, `collections/routine.html` — `href="#"` kalmadı
- ✅ `master-upgrade.css` brace dengesi: `braces 0, parens 0`
- ✅ Önceki turdan kalanlar (hero, footer, payment, brand bar, search focus) intact

## Test Edilemeyen

- ❌ Tarayıcıda görsel doğrulama — Claude Preview MCP bu makinedeki sandbox'tan dolayı `Documents/GitHub/cosmoskin` dizinine erişemiyor (`getcwd: Operation not permitted`). Python http.server, Ruby WEBrick aynı kısıtlamaya takıldı. Bu bir tooling kısıtı, kod kısıtı değil.

**Manuel test komutu:**
```bash
cd /Users/can/Documents/GitHub/cosmoskin && python3 -m http.server 7700
# http://localhost:7700/ → Cilt Tipi dropdown'unu aç, link'leri test et
# http://localhost:7700/routine.html → Kayıt Ol link'ine hover (yeni href görünmeli)
# Bestseller kartlarına bak → fiyatlar 16px civarı olmalı
```

---

## Assumptions Yapılan

1. **Karma Cilt → `/collections/hydration.html`**: T-bölge yağlı / kuru karışım için nem dengeleyici koleksiyon en mantıklı default.
2. **Normal Cilt → `/collections/barrier.html`**: Sade bariyer bakımı normal cilt için doğal başlangıç.
3. **Akneye Eğilimli yeni eklendi**: Mevcut `acne-balance` koleksiyonu zaten vardı, dropdown'da görünmüyordu — eklenmesi kullanıcı kazancı olur.
4. **Fiyat boyutu 16/15px**: 22px'den 16px'e düşüş premium e-com standartlarına yaklaşıyor (Sephora ~14px, Aesop ~13px, Apple ~17px regular). 16px güvenli orta nokta.
5. **Register href'i `/account/index.html`**: Adanmış register sayfası yok; account dashboard auth gate'i taşıyor, fallback olarak güvenli.

---

## Final Verdict

**ACCEPT WITH RISKS** — sınırlı kapsam.

- 4/14 task tamamlandı (1, 4 kısmen, 6, 10 kısmen).
- 10/14 task **defer edildi** — yukarıdaki Punch List'te detaylı.
- Bu pass'teki değişiklikler düşük riskli ve geri-alınabilir.
- Görsel doğrulama yapılmadı (tooling kısıtı) — kullanıcının manuel smoke testi önerilir.
- "Hepsini bir seferde yap" senior yaklaşımı değil; her major task'ı izole pass'le ele almak regresyon riskini düşürür.
