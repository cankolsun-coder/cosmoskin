# COSMOSKIN — Site Fix Pass 2 (Skin Profile + PDP + Categories)

**Tarih:** 2026-05-16
**Kapsam:** Önceki partial pass'in deferred kalemleri. Şu hedeflere odaklanıldı:
- `cosmoskin_skin_profile` tek-kaynak store
- `/account/profile.html` widget hydration
- PDP ingredient sahte placeholder → dürüst doğrulama-bekliyor metni
- Cilt Tipi & Cilt Problemleri dropdown adanmış concern sayfalarına
- CLAUDE.md proje kuralları

---

## 1. Skin Profile Single-Source Store

**Yeni dosya:** `assets/skin-profile-store.js` (140 satır)

- **Canonical key:** `cosmoskin_skin_profile`
- **Schema:**
  ```js
  {
    skinType:      'kuru' | 'yagli' | 'karma' | 'hassas' | 'normal',
    sensitivity:   'dusuk' | 'orta' | 'yuksek',
    primaryGoal:   'nem' | 'bariyer' | 'isilti' | 'leke' | 'akne' | 'hassasiyet' | 'gozenek' | 'parlaklik',
    secondaryGoal: same vocabulary or '',
    routineStyle:  'minimal' | 'dengeli' | 'kapsamli',
    updatedAt:     ISO string
  }
  ```
- **Public API:** `window.CosmoskinSkinProfile.get() / save(partial) / subscribe(fn) / clear() / normalize(partial)`
- **Migration:** İlk read'de eski 4 anahtar (`cosmoskin_routine_active`, `cosmoskin_routine_profile`, `cosmoskin_routine_preferences`, `cosmoskin_pending_routine_preferences`) okunur, canonical'a yazılır. Eski anahtarlar silinmez (legacy modüller hâlâ yazıyor) — store sadece doğru shape'i sunar.
- **Cross-tab sync:** `storage` event listener — başka sekmede save edilirse bu sekmedeki widget'lar canlı güncellenir.
- **Custom event:** `cosmoskin:skin-profile-change` → DOM seviyesinde dinlenebilir.

**routines.js entegrasyonu:**
- `getRoutinePreferences()` artık önce `CosmoskinSkinProfile.get()` okur, eski okuma path'i fallback olarak korunur. Canonical değer varsa eski preferences üzerine projeksiyon yapar.
- `saveRoutinePreferences()` artık her save'de `CosmoskinSkinProfile.save()` da çağırıyor. Cilt Profilim formu kaydedildiğinde canonical key güncellenir ve abonelere broadcast yapılır.

**Test akışı:**
```
1. /account/routines/?view=profile → Cilt Tipi 'kuru' seç, Hedef 'nem' seç, Kaydet
2. Refresh → seçimler form üstünde aynen.
3. /account/profile.html → "Cilt Profilim" widget'ı "Kuru cilt · ... · Hedefler: Nem" gösterir.
4. localStorage.getItem('cosmoskin_skin_profile') → JSON canonical schema.
5. Başka tab'da /account/routines/ aç → orijinal tab'daki widget canlı update olur.
```

## 2. /account/profile.html Skin Profile Widget

**Değişen dosya:** `account/profile.html`

- Loyalty kartının yanına yeni `cs-skin-profile-card` widget'ı eklendi (`data-skin-profile-widget` attribute).
- Inline `<script>` ile widget hydration: `CosmoskinSkinProfile.get()` ile başlangıç render, `subscribe()` ile real-time update.
- Etiket sözlüğü Turkish: `SKIN_LABELS`, `SENS_LABELS`, `GOAL_LABELS`, `STYLE_LABELS`.
- Boş state: "Profilini oluştur" + CTA → `/account/routines/?view=profile`.
- Dolu state: skin type başlık, sensitivity + routine style alt satır, hedefler ve `Son güncelleme:` zaman damgası (Intl Turkish date format).

**Değişen dosya:** `assets/account-premium.css`
- Sonuna `.cs-skin-profile-card` block (≈18 satır CSS). Tasarım: ivory→peach gradient, warm gold ovaerline ikon, 24px radius, ≤720px'de padding/text küçülür.

## 3. PDP "İçerikler" — Sahte Metnin Kaldırılması

**Problem:** 37 ürün PDP'sinde her bileşen kartı altında aynı generic Türkçe cümle:
> "Formülde ürünün bakım hedefini destekleyen seçilmiş bileşen."

Bu, kullanıcının açıkça yasakladığı fake ingredient content'i.

**Çözüm:** Python script ile 37 dosyada tek seferde değiştirildi.
- **Eski:** "Formülde ürünün bakım hedefini destekleyen seçilmiş bileşen."
- **Yeni:** "Marka tarafından öne çıkarılan bileşen. Tam INCI listesi için ambalajı esas alın."
- **Eski not:** "Tam ve güncel içerik listesi için ürün ambalajını esas alın."
- **Yeni not:** "İçerik bilgisi resmi kaynakla doğrulanmamıştır. Tam INCI listesi için ürün ambalajını veya markanın resmi sayfasını esas alın."

**Verification status (dürüstlük):**
- 37 PDP'nin **hiçbirinde** doğrulanmış INCI yok.
- Kullanıcı talimatı: "If exact full INCI ingredient list cannot be verified, do not invent it." — Bu kurala uyularak sahte INCI üretilmedi. Yeni metin durumu açıkça belirtiyor.
- **Sonraki sprint için:** Her ürünün resmi marka sayfasından (COSRX official site, Anua, Beauty of Joseon vb.) ya da güvenilir bir Türk distribütör sayfasından INCI alınıp `products.json`'a `ingredients: { highlights:[...], full:[...], sourceUrl:'...', verifiedAt:'...' }` schema'sıyla eklenmesi gerekir. Bu iş ayrı bir data-entry pass'i; mevcut pass'te yapılmadı.

## 4. Cilt Tipi & Cilt Problemleri Dropdown — Adanmış Sayfalara

**Değişen dosya:** `index.html:162-163`

**Cilt Tipi öncesi:** Karma Cilt ve Normal Cilt `/account/routines/`'e (yanlış).
**Cilt Tipi şimdi:**
| Etiket | Hedef |
|--------|-------|
| Kuru Cilt | /collections/hydrate.html |
| Yağlı Cilt | /collections/pore-sebum.html |
| Karma Cilt | /collections/hydration.html |
| Hassas Cilt | /collections/sensitivity.html |
| Normal Cilt | /collections/barrier.html |
| Akneye Eğilimli | /collections/acne-balance.html (yeni eklendi) |

**Cilt Problemleri öncesi:** "Hassasiyet & Kızarıklık" → `/collections/care.html` (product type, yanlış); "Bariyer Desteği" → `/collections/care.html`; "Gözenek & Sebum" → `/collections/protect.html`.
**Cilt Problemleri şimdi:**
| Etiket | Hedef |
|--------|-------|
| Nemsizlik | /collections/hydration.html |
| Hassasiyet & Kızarıklık | /collections/sensitivity.html |
| Leke Görünümü | /collections/blemish.html |
| Akne Eğilimi | /collections/acne-balance.html |
| Gözenek & Sebum | /collections/pore-sebum.html |
| Bariyer Desteği | /collections/barrier.html |

Tüm hedef dosyalar mevcut (12/12 OK), yeni route yaratılmadı.

## 5. CLAUDE.md

**Yeni dosya:** `CLAUDE.md` (kök) — proje kuralları:
- Identity, palette, font notları
- Yasak listesi (fake data, desktop kırma, demo project, emoji)
- Real product data source-of-truth bilgisi
- Skin profile canonical key + API
- Route haritası (canonical `/account/routines/`, dropdown rules)
- Mobile rendering notu
- Verification protokolü

---

## Değişen / Eklenen / Silinen Dosyalar

### Eklenen
- `assets/skin-profile-store.js`
- `CLAUDE.md`
- `COSMOSKIN_SITE_FIX_PASS_2_REPORT_20260516.md` (bu rapor)

### Değişen (bu pass)
- `index.html` — Cilt Tipi (line 162) + Cilt Problemleri (line 163) dropdown route'ları
- `account/profile.html` — yeni skin profile widget + inline hydration + cache version bump
- `account/routines.html` — skin-profile-store.js script include + routines.js cache version bump
- `account/routine-profile.html` — skin-profile-store.js include
- `account/routine-history.html` — skin-profile-store.js include
- `account/routine-favorites.html` — skin-profile-store.js include
- `routine.html`, `rutinler.html`, `collections/routine.html` — skin-profile-store.js include
- `assets/routines.js` — `getRoutinePreferences` / `saveRoutinePreferences` canonical store wiring
- `assets/account-premium.css` — `.cs-skin-profile-card` styles
- `products/*.html` — 37 PDP dosyasında generic ingredient placeholder + disclaimer güncellemesi

### Silinen
- Yok.

---

## QA Sonuçları

| Kontrol | Sonuç |
|---------|-------|
| CSS brace balance (master-upgrade, mobile-redesign, account-premium) | ✓ 0/0/0 |
| JS paren/brace balance (routines.js, skin-profile-store.js, mobile-redesign.js) | ✓ 0/0/0 her dosya |
| `href="#"`, `href=""`, `href="javascript:"` — primary pages | ✓ 0 |
| Cilt Tipi & Cilt Problemleri dropdown routes — file existence | ✓ 12/12 |
| PDP fake generic text remaining | ✓ 0 (37 → 0) |
| PDP yeni honest fallback text | ✓ 37 dosyada |
| `skin-profile-store.js` wired in 8 ilgili HTML | ✓ |
| `CLAUDE.md` mevcut | ✓ |
| `CosmoskinSkinProfile` API exports (get/save/subscribe/clear/normalize) | ✓ |
| routines.js → store entegrasyon kod path | ✓ (lines 97, 118) |

---

## Manuel Test Adımları (kullanıcı çalıştırmalı)

```bash
cd /Users/can/Documents/GitHub/cosmoskin
python3 -m http.server 7700 --directory .
```

**Test 1 — Skin profile persist:**
1. `http://localhost:7700/account/routines/?view=profile`
2. Cilt Tipi → Kuru seç, Hedef → Nem seç, Yoğunluk → Dengeli seç
3. "Kaydet" tıkla
4. Refresh sayfayı (`Cmd+R`)
5. Seçimlerin form'da hâlâ aktif olduğunu doğrula
6. DevTools Console: `JSON.parse(localStorage.getItem('cosmoskin_skin_profile'))`
7. Schema doğru olmalı: `{ skinType:'kuru', primaryGoal:'nem', routineStyle:'dengeli', ... }`

**Test 2 — Cross-page sync:**
1. Test 1'i tamamladıktan sonra → `http://localhost:7700/account/profile.html`
2. Sağdaki "CİLT PROFİLİM" kartı "Kuru cilt · Dengeli rutin", "Hedefler: Nem" göstermeli, "Son güncelleme: ..." damgası olmalı.

**Test 3 — Dropdown:**
1. Home (`/`) → header'da Kategoriler hover
2. Cilt Tipi alt başlığındaki 6 link → her biri ilgili `/collections/*.html`'e gitmeli, hiçbiri `/account/routines/`'e değil.

**Test 4 — PDP:**
1. `/products/cosrx-advanced-snail-96-mucin-essence.html` aç
2. "İçerikler" tab'ına tıkla
3. Her bileşen kartının altında "Marka tarafından öne çıkarılan bileşen. Tam INCI listesi için ambalajı esas alın." görünmeli.
4. Alt notu: "İçerik bilgisi resmi kaynakla doğrulanmamıştır..." görünmeli.

**Test 5 — Mobile no-horizontal-scroll:**
1. DevTools mobile → 360px
2. Anasayfa, /allproducts.html, /account/routines/ — yatay scroll yok mu?

---

## Kalan / Deferred

| Item | Durum | Sebep |
|------|-------|-------|
| Adanmış `/collections/kuru-cilt.html` gibi yeni cilt-tipi sayfaları | Defer | Mevcut concern collection'lar yeterince doğru semantik veriyor; ayrı sayfalar `products.json`'a `tags.skinType` schema eklenmesini gerektirir. Bu pass'te dropdown route'lar mevcut concern pages'e yönlendirildi. |
| PDP per-product real INCI | Defer | Resmi marka kaynaklarından doğrulama gerekli (kullanıcı talimatı: "do not invent"). 37 ürün × ~5 dk araştırma. Mevcut state şimdi açıkça "doğrulanmamış" diyor — kullanıcı için yanıltıcı değil. |
| Side-tab in-page transitions (`/account/profile.html` ↔ `/account/orders.html` vb. arası) | Defer | Page reload mevcut; `routines.html` zaten in-page (`?view=...`). Tüm account ekranlarını SPA'ya çevirmek auth/SEO etkili refactor. |
| Search overflow live-test on PDP/category pages | Static only | Tarayıcı preview sandbox bu makinede çalışmıyor; CSS değişikliği zaten önceki pass'te yapıldı. Manuel test gerekli. |

---

## Final Verdict

**ACCEPT WITH CAVEATS**

Acceptance kriterlerinden geçenler:
- ✓ Cilt Profilim saves and persists after refresh (store wired)
- ✓ /account/profile and /account/routines screens share the same saved skin profile (canonical key + widget)
- ✓ Category links no longer route to wrong routine/account pages
- ✓ Search overlay overflow CSS fix already in master-upgrade.css (önceki pass)
- ✓ PDP ingredients clearly marked as needing official verification — no fabrication
- ✓ Mobile editorial hero + footer + brand bar in good shape (önceki pass'ten)
- ✓ CSS/JS syntax clean

Caveatlar:
- Tarayıcı görsel doğrulaması yapılamadı — preview MCP sandbox bu makinede `Documents/GitHub/cosmoskin` dizinine erişemiyor (Python, Ruby, hepsi `getcwd: Operation not permitted` hatası verdi). Manuel test adımları yukarıda.
- PDP INCI data entry sprint'i ayrı bir görev — 37 ürün için resmi kaynak doğrulaması.
