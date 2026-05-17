# COSMOSKIN — Phase 5 Değişiklik Günlüğü
**Tarih:** 09 Mayıs 2026  
**Versiyon:** `?v=20260509-phase5`  
**Kapsam:** Hamburger Menü, Mobil Navigasyon ve Yönlendirme Sistemi QA

---

## Phase 4 / 4B Doğrulama Sonuçları

| Kontrol | Durum |
|---------|-------|
| Mobil ürün ızgarası (2-kolon, premium) | ✅ |
| Tüm Ürünler stats/filter/sort arayüzü | ✅ |
| Ürün kart sistemi | ✅ |
| Kategori sayfaları (6/6) | ✅ |
| Skin goal sayfaları (6/6 — Nem dahil) | ✅ |
| Geçersiz nested @media düzeltmesi | ✅ |
| `collections/cosrx.html` JSON-LD fiyatları | ✅ (doğrulandı) |
| Marka sayfaları tüm rotalar | ✅ (17/17) |
| Thank You Farmer → `/brands/thank-you-farmer.html` | ✅ |

---

## Phase 5'te Düzeltilen Sorunlar

### TASK 1 — Mimari Denetim

**`mobile-redesign.js` inceleme özeti:**
- `menuOverlay()` fonksiyonu: tüm menü HTML'ini tek fonksiyonda üretiyor — mantık merkezi ✅
- `openMenu()` / `closeMenu()`: aria-hidden, aria-expanded, focus yönetimi ✅
- `bindDelegates()`: tek event listener bloğu, `delegatesBound` flag ile çift kayıt önlendi ✅
- `mount()`: `DRAWER_ID` kontrolü ile çift DOM montajı önlendi ✅
- ESC tuşu → `closeMenu()` + `closeSheet()` ✅
- `.cm-menu-panel a` tıklaması → `closeMenu()` ✅

**`mobile.js` denetimi:** Legacy sistem `__COSMOSKIN_LEGACY_MOBILE_DISABLED__` flag ile redesign rotalarında devre dışı — çakışma yok ✅

**CSS menü kuralları:** Phase 2 ve 4B blokları `body.cm-menu-open`, `cm-menu-panel`, `cm-menu-dim` için gerekli tüm kuralları içeriyor ✅

---

### Düzeltme 1 — Yanlış "Nem" Skin Goal Rotası (KRİTİK)

`menuOverlay()` fonksiyonundaki "Cilt Hedeflerine Göre Keşif" bölümünde "Nem" cilt amacı yanlış sayfaya (`/collections/hydrate.html` — Tonik & Essence kategori sayfası) yönlendiriyordu.

**Önceki:**
```javascript
card('drop', 'Nem', '/collections/hydrate.html')
```

**Sonrası:**
```javascript
card('drop', 'Nem', '/collections/hydration.html')
```

`/collections/hydration.html` Phase 4B'de oluşturulan gerçek "Nem" cilt amacı sayfası — keyword tabanlı filtre ile (`nem`, `hyaluronic`, `moisture` vb.) doğru ürünleri listeler.

---

### Düzeltme 2 — iOS Scroll Lock Güçlendirme

iOS Safari'de `body` üzerindeki `overflow: hidden` bazı durumlarda arka plan sayfasının kaydırılmasına izin vermektedir. `<html>` öğesine de kilit eklenmesi gerekiyordu.

**`openMenu()` ve `closeMenu()` fonksiyonlarına eklemeler:**
```javascript
// openMenu()
document.documentElement.classList.add('cm-menu-open');

// closeMenu()
document.documentElement.classList.remove('cm-menu-open');
```

**`unmount()` güncellendi:**
```javascript
document.documentElement.classList.remove('cm-mobile-active', 'cm-menu-open');
```

**CSS — yeni `html.cm-menu-open` kuralı:**
```css
html.cm-menu-open {
  overflow: hidden !important;
  overscroll-behavior: none;
}
```

---

### Düzeltme 3 — Marka Accordion Erişilebilirlik ve UX

`<details class="cm-menu-accordion">` öğesinin `<summary>` elementine cursor ve focus durumu eklendi:

```css
.cm-menu-accordion > summary { cursor: pointer; user-select: none; }
.cm-menu-accordion > summary:focus-visible {
  outline: 2px solid #151412;
  outline-offset: 2px;
  border-radius: 14px;
}
```

`<details>` elementi modern tarayıcılarda `aria-expanded`'ı otomatik yönetir — ek JS gerekmez. ✅

---

## Hamburger Davranış Doğrulaması

| Kontrol | Durum |
|---------|-------|
| Hamburger tıklama → menü açılır | ✅ (`data-cm-menu` handler) |
| Overlay görünür | ✅ (`cm-menu-dim`) |
| Kapatma butonu çalışır | ✅ (`data-cm-menu-close`) |
| ESC tuşu kapatır | ✅ (`keydown` handler) |
| Overlay tıklaması kapatır | ✅ (`data-cm-menu-close` on dim) |
| Normal nav linki → menü kapanır | ✅ (`.cm-menu-panel a` delegate) |
| Sayfa scroll kilidi (body) | ✅ (`overflow: hidden`) |
| Sayfa scroll kilidi (html) | ✅ (Phase 5'te eklendi) |
| iOS overscroll-behavior: none | ✅ |
| Focus menüye girer (açılışta) | ✅ (`closeBtn.focus()`) |
| Focus hamburger'a döner (kapanışta) | ✅ (`button.focus()`) |
| Yatay scroll oluşmaz | ✅ |
| Eski menü kalmaz | ✅ (DRAWER_ID kontrolü) |
| Çift event listener yok | ✅ (`delegatesBound` flag) |
| Çift DOM mount yok | ✅ (drawer ID kontrolü) |
| Menü durumu takılmaz | ✅ (multiple close mekanizmaları) |

---

## Mobil Menü İçerik Yapısı

### Genel Navigasyon (cm-menu-main)
| Öğe | Rota | Durum |
|-----|------|-------|
| Tüm Ürünler | `/allproducts.html` | ✅ |
| Markalar accordion | 17 marka × `/brands/[slug].html` | ✅ |
| Çok Satanlar | `/index.html#bestsellers` | ✅ |
| Rutinler | `/account/routines/` | ✅ |
| Destek | `/contact.html` | ✅ |

### Marka Accordion (17 Marka)
anua, Beauty of Joseon, COSRX, Round Lab, SKIN1004, Torriden, Thank You Farmer, Innisfree, Medicube, Dr. Jart+, Isntree, Mediheal, Goodal, Laneige, Some By Mi, By Wishtrend, I'm From

Tüm 17 marka dosyası `/brands/[slug].html` olarak mevcut. Thank You Farmer → `/brands/thank-you-farmer.html` (premium boş durum). ✅

### Hızlı Kategoriler (6 Kart)
| Kategori | Rota | Durum |
|----------|------|-------|
| Temizleyiciler | `/collections/cleanse.html` | ✅ |
| Tonik & Essence | `/collections/hydrate.html` | ✅ |
| Serum & Ampul | `/collections/treat.html` | ✅ |
| Nemlendiriciler | `/collections/care.html` | ✅ |
| Güneş Koruyucular | `/collections/protect.html` | ✅ |
| Maskeler | `/collections/masks.html` | ✅ |

### Cilt Hedeflerine Göre Keşif (6 Kart)
| Cilt Hedefi | Rota | Durum |
|------------|------|-------|
| Nem | `/collections/hydration.html` | ✅ (Phase 5'te düzeltildi) |
| Bariyer | `/collections/barrier.html` | ✅ |
| Işıltı | `/collections/glow.html` | ✅ |
| Akne & Denge | `/collections/acne-balance.html` | ✅ |
| Hassasiyet | `/collections/sensitivity.html` | ✅ |
| Gözenek & Sebum | `/collections/pore-sebum.html` | ✅ |

### Hesap ve Destek (6 Link)
Hesabım, Siparişlerim, Favorilerim, Sepetim, Yardım ve Destek, İade ve Teslimat — tüm rotalar mevcut. ✅

---

## Erişilebilirlik Sonuçları

| Kontrol | Durum |
|---------|-------|
| Menü paneli `role="dialog"` + `aria-modal="true"` | ✅ |
| Hamburger `aria-label="Menüyü aç"` | ✅ |
| Hamburger `aria-expanded` güncelleme | ✅ |
| Hamburger `aria-controls="cm-mobile-menu"` | ✅ |
| Kapatma butonu `aria-label="Menüyü kapat"` | ✅ |
| Overlay `aria-hidden="true"` | ✅ |
| Marka accordion `<details>` — tarayıcı otomatik aria-expanded | ✅ |
| Accordion summary `focus-visible` | ✅ (Phase 5'te eklendi) |
| Accordion summary `cursor: pointer` | ✅ (Phase 5'te eklendi) |
| Focus trap (tam) | ❌ küçük gap — Phase 6 kapsamında |
| Dokunma hedefleri 44px min | ✅ |

---

## Değiştirilen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `assets/mobile-redesign.js` | "Nem" rota düzeltmesi (`hydrate.html` → `hydration.html`); `openMenu()`/`closeMenu()`/`unmount()` → html sınıfı yönetimi |
| `assets/mobile-redesign.css` | `html.cm-menu-open` scroll kilit kuralı; accordion summary `cursor` + `focus-visible` |

---

## Oluşturulan Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `CHANGELOG-phase5.md` | Bu dosya |

---

## Silinen Dosyalar

Yok.

---

## `git status` Özeti

```
M  assets/mobile-redesign.css    (Phase 4 + 4B + Phase 5 eklemeleri)
M  assets/mobile-redesign.js    (Phase 3B + 4B + Phase 5 düzeltmeleri)
M  brands/*.html                 (14 dosya — Phase 4 JSON-LD)
M  collections/*.html            (20 dosya — Phase 4 JSON-LD)
?? collections/hydration.html
?? CHANGELOG-phase4.md
?? CHANGELOG-phase4b.md
?? CHANGELOG-phase5.md
```

---

## Test Edilen Sayfalar

Statik kod denetimi:
- `index.html`, `allproducts.html`, `checkout.html`
- `account/profile.html`
- `products/beauty-of-joseon-relief-sun-spf50.html`
- `brands/anua.html`, `brands/thank-you-farmer.html`
- `collections/cleanse.html`, `collections/hydration.html`
- Tüm 17 marka ve 20+ koleksiyon sayfası rota denetimi

Canlı tarayıcı testi: Chrome uzantısı bağlı olmadığından tamamlanamadı.

---

## Test Edilen Ekran Genişlikleri

360, 375, 390, 430, 768px — statik CSS denetimi.

---

## Kalan Riskler

**Yüksek**
- Canlı tarayıcı testi eksik — tüm Phase 5 değişikliklerinin gerçek cihazda doğrulanması gerekiyor.

**Orta**
- Focus trap menü içinde tam değil — Tab ile klavye odağı menü dışına sızabiliyor. Phase 6'da eklenebilir.
- Version string'leri tutarsız: `collections/hydration.html` `v=20260509-phase4b`, diğer 50+ sayfa `v=20260507-ref` kullanıyor — tarayıcı cache sorunu oluşturmaz (sunucu seviyesinde değişiklik yoksa), Phase 6'da toplu güncelleme yapılabilir.

**Düşük**
- `allproducts.html` "Kategoriler" bottom nav öğesi `/collections/cleanse.html`'e yönlendirir — tüm kategorileri gösteren bir sayfa değil. Phase 6'da `/allproducts.html?category=` veya ayrılmış rota ile düzeltilebilir.
- `mobile.js` `buildBottomNav()` hâlâ çalışabilecek sayfalar olabilir (redesign route olmayan) — bunlar için bottom nav çakışması yok çünkü mobile.js kendi kontrol akışını yönetiyor.

---

## Phase 6'ya Geçmeye Hazır mı?

**Evet.** Phase 5 statik denetimlerinin tamamı geçti:
- Tüm 39 menü rotası disk üzerinde mevcut ✅
- JS sözdizimi (`node --check`) ✅
- CSS parantez dengesi: 530 = 530 ✅
- "Nem" skin goal rotası düzeltildi ✅
- iOS scroll lock güçlendirildi ✅

Phase 6 kapsamı: PDP (ürün detay sayfası) sistemi.
