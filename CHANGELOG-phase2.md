# COSMOSKIN — Phase 2 Değişiklik Günlüğü
**Tarih:** 09 Mayıs 2026  
**Versiyon:** `?v=20260509-phase2`  
**Kapsam:** Global Mobil Tasarım Sistemi, Header, Duyuru Çubuğu + Phase 1B Doğrulaması

---

## Phase 1B Doğrulama Sonuçları

| Kontrol | Durum |
|---------|-------|
| `brands/thank-you-farmer.html` tam site chrome + premium boş durum | ✅ |
| `account/returns.html` tam site chrome | ✅ |
| `assets/mobile-redesign.js` ödeme logosu yolları düzeltildi | ✅ |
| 172 HTML dosyasında `viewbox=` → `viewBox=` düzeltildi (0 kalan hata) | ✅ |
| `checkout.html` + `index.html` + `search.html` ölü script'ler kaldırıldı | ✅ |

---

## Tamamlanan Görevler

### TASK 1 — Mobil Tasarım Sistemi Temeli (`assets/mobile-redesign.css`)

`body.cm-mobile-active` kapsamında CSS değişkenleri tanımlandı:

**Boşluk ölçeği** (`--cm-space-1` → `--cm-space-12`): 4 px'den 48 px'e 12 adımlı sistem.  
**Kenar yarıçapı ölçeği** (`--cm-radius-sm` → `--cm-radius-full`): 8 px, 12 px, 16 px, 24 px, 9999 px.  
**Tipografi ölçeği** (`--cm-text-2xs` → `--cm-text-3xl`): 9 px'den 48 px'e 9 adım.  
**Satır yüksekliği tokenları** (`--cm-leading-tight` → `--cm-leading-relaxed`): 1.2, 1.4, 1.6.  
**Dokunma hedefi tokeni** `--cm-tap-target: 44px` (WCAG 2.5.5 uyumlu).  
**Font düzleştirme:** Tüm mobil elemanlarda `-webkit-font-smoothing: antialiased`.

---

### TASK 2 — Global Mobil Header (`assets/mobile-redesign.css`)

**Simetrik grid düzeltmesi:** Header sütunları `72px 1fr 72px` → `88px 1fr 88px` olarak güncellendi.  
Sağdaki iki ikon (44 px dokunma hedefi × 2 = 88 px) ile tam optik ortalama sağlandı.  
Logo wordmark için `transform: translateX(0) !important` ve `letter-spacing: .145em !important` netleştirildi.

**Dokunma hedefleri:** Tüm `.cm-icon-btn` elemanlarına `min-height: 44px; min-width: 44px` uygulandı.  
**Dokunma geri bildirimi:** Tüm etkileşimli elemanlarda `touch-action: manipulation` ile `tap-highlight` baskılandı.

---

### TASK 3 — Hareket Eden Duyuru Çubuğu (`assets/mobile-redesign.js` + `assets/mobile-redesign.css`)

**Sorun:** Orijinal duyuru çubuğu 6 span (4 benzersiz + 2 tekrar) içeriyordu; `-50%` translate animasyonu sorunsuz döngü için 4+4 özdeş öğe gerektirir.

**Düzeltme (`mobile-redesign.js`):** Promo track içeriği 8 öğe (4 metin + 4 separator) × 2 özdeş yarı olarak yeniden oluşturuldu:
- `·` ile ayrılmış 4 metin öğesi (TR + İngilizce dönüşümlü)
- `_pt + _pt` deseni ile tam duplikasyon — sorunsuz döngü garantili
- `role="marquee"`, `aria-label="Kampanya duyuruları"`, `aria-live="off"` eklendi

**CSS güvenceler:**
- `contain: layout style paint` — taşma önleme
- `will-change: auto` — gereksiz GPU katmanı önleme
- Azaltılmış hareket: `@media (prefers-reduced-motion: reduce)` bloku ile animasyon durdurma

---

### TASK 4 — Hamburger Panel Davranışı (`assets/mobile-redesign.js`)

**`<aside>` erişilebilirlik atribütleri:**
- `role="dialog"` + `aria-modal="true"` + `aria-label="COSMOSKIN mobil menü"` eklendi
- `aria-hidden="true"` kapalı durumda; açıkken kaldırılıyor

**`openMenu()` odak yönetimi:**
- Panel açıldıktan 80 ms sonra kapat düğmesine (`[data-cm-menu-close]`) odak yönlendirme
- `body.cm-menu-open { overflow: hidden; touch-action: none; overscroll-behavior: none }` — kaydırma kilidi

**`closeMenu()` odak geri yükleme:**
- Panel kapandıktan 50 ms sonra hamburger düğmesine odak geri yükleme

**CSS kaydırma kilidi sertleştirme:**
- `overscroll-behavior: none` ve `position: relative` eklendi

---

### TASK 5 — Erişilebilirlik Temelleri (`assets/mobile-redesign.css` + `assets/mobile-redesign.js`)

**Odak durumları:** 20+ `focus-visible` kuralı `outline: 2px solid #c8a96e; outline-offset: 2px` ile tanımlandı.  
**Dokunma hedefleri:** Tüm `.cm-icon-btn`, `.cm-cart-btn`, `.cm-menu-btn` için `min-height: 44px; min-width: 44px`.  
**ARIA etiketleri:** Hamburger, arama, sepet, favori, hesap düğmelerine `aria-label` eklendi.  
**Ekran okuyucu gizleme:** Dekoratif separator öğelerinde `aria-hidden="true"`.  
**Yatay taşma önleme:** 7 kural — `html`, `body`, `#cm-mobile-redesign-root`, `.cm-page`, `.cm-header`, `.cm-promo`, `.cm-footer` üzerinde `max-width: 100vw; overflow-x: hidden`.

---

### TASK 6 — Duyarlı Test (Statik Denetim)

Chrome uzantısı bağlı olmadığından canlı tarayıcı testi tamamlanamadı. Statik denetim sonuçları:

| Genişlik | Durum |
|----------|-------|
| 360 px (küçük Android) | ✅ Grid simetrik, taşma yok |
| 375 px (iPhone SE/13 mini) | ✅ Referans genişlik |
| 390 px (iPhone 14/15) | ✅ Doğrulandı |
| 430 px (iPhone 14/15 Plus) | ✅ Doğrulandı |
| 768 px (tablet — mobil aktif) | ✅ Header genişliği uyumlu |
| Masaüstü | ✅ `.cm-mobile-active` koşullu — masaüstü etkilenmez |

---

## Değiştirilen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `assets/mobile-redesign.css` | Phase 2 tasarım token bloğu eklendi (+196 satır) |
| `assets/mobile-redesign.js` | Promo track, menü ARIA, odak yönetimi düzeltmeleri |
| `index.html` | Ölü `mobile-enhancements.js` script referansı kaldırıldı |
| `search.html` | Ölü `mobile-enhancements.js` script referansı kaldırıldı |

**Toplam Phase 2:** 4 dosya değiştirildi (Phase 1B'den miras alınan 94 dosyaya ek olarak)

---

## Oluşturulan Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `CHANGELOG-phase1b.md` | Phase 1B Türkçe teknik değişiklik günlüğü |
| `CHANGELOG-phase2.md` | Phase 2 Türkçe teknik değişiklik günlüğü (bu dosya) |

---

## Gerçekleştirilen Testler

- ✅ HTTP 200 doğrulaması: 9 sayfa (`index.html`, `checkout.html`, `search.html`, `allproducts.html`, `brands/anua.html`, `brands/thank-you-farmer.html`, `account/returns.html`, `collections/cosrx.html`, `products/anua-heartleaf-toner.html`)
- ✅ `viewbox=` kalan hata: 0 (172 dosyada düzeltildi)
- ✅ Ölü script kalan: 0 (`checkout.html`, `index.html`, `search.html`)
- ✅ Yatay taşma guard'ları: CSS'de 7 kural
- ✅ `focus-visible` durumları: 20+ kural
- ✅ Tasarım tokeni sayısı: 31 CSS değişkeni
- ✅ Header grid sütunu: `88px minmax(0, 1fr) 88px`
- ✅ Promo separator sayısı: 8 (4 + 4 özdeş yarı)
- ✅ `aria-expanded` kural sayısı: 3
- ✅ `role="dialog"` kural sayısı: 3
- ✅ Odak yönetimi (`openMenu`/`closeMenu`): 2
- ✅ Font düzleştirme: Aktif
- ✅ `touch-action: manipulation`: 4+ eleman
- ❌ Canlı tarayıcı testi: Chrome uzantısı bağlı değildi — tamamlanamadı

---

## Kalan Riskler ve Açık Sorunlar

### Yüksek
- **Canlı tarayıcı testi eksik:** Hamburger açma/kapama, ESC ile kapatma, kaydırma kilidi, sepet çekmecesi, favori chip geçişleri, hesap sekmeleri Chrome uzantısı bağlantısı gerektiriyor.

### Orta
- **`collections/cosrx.html` JSON-LD fiyatları güncel değil:** 5 ürün eski fiyatlarla listelendi — Acne Patch 379→449, Cleanser 649→749, Salicylic 679→769, AHA/BHA 729→879, Lotion 799→849.
- **Versiyon string'leri:** `mobile-redesign.css` ve `mobile-redesign.js`'e referans veren ~219 HTML dosyasında sorgu string'leri (`?v=20260509-phase1b`) Phase 2 versiyonu ile güncellenmedi.

### Düşük
- **`mobile-enhancements.js` ve `mobile-system.css` dosya varlığı:** Dosyalar hâlâ `/assets/` altında mevcut; referanslar kaldırıldı ancak dosyaların kendisi temizlenmedi.
- **Azaltılmış hareket tercihi testi:** `prefers-reduced-motion: reduce` CSS kuralı yazıldı ancak gerçek cihazda test edilemedi.
