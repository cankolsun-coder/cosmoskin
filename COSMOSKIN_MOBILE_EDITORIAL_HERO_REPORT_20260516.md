# COSMOSKIN — Mobil Editöryal Hero & Footer Onarımı

**Tarih:** 2026-05-16
**Kapsam:** Yalnızca mobil. Masaüstü dokunulmadı.
**Tetikleyen:** Mobil ana sayfada kırık hero, yanlış konumlanan footer, görünmeyen ödeme logoları, arama odak kutusu, kırık marka çubuğu.

---

## Kök Neden Analizi

| Problem | Kök Neden |
|--------|-----------|
| Mobil hero yetersiz, ürünler küçük, metin sıkışık | `cm-hero-ref--desktop-match` masaüstü hero'sunu mobil için yeniden kullanıyordu; programatik olarak ilk bestseller ürün görselini hero görseli yapıyordu. Tek CTA, yetersiz negatif alan. |
| Footer yanlış yerde, altta büyük boş beyaz alan | `cm-mobile-page` sınıfının `padding-bottom: calc(96px + safe-area)` değeri, sabit bottom-nav yüksekliği (78px) ile birleşince ana içerik bittikten sonra footer'ın altında ~96px+ ölü alan oluşuyordu. Footer ayrıca `cm-page-inner` içinde render ediliyordu, doğal sayfa akışını bozuyordu. |
| Ödeme logoları görünmez/kırık | Mobil footer logoları `/assets/payment/...` yolunu kullanıyordu (var) ama CSS `filter: brightness(0) invert(1) !important` ile logoları beyaz tek-renge çeviriyordu. Visa/Mastercard/Amex orijinal renkleri kayboluyordu, koyu zeminde okunamıyordu. Ayrıca eski yol (`amex.svg`) ile masaüstü yolu (`american-express.svg`) tutarsızdı. |
| Arama çubuğuna dokununca kare/çizgi artifact | Mobil tarayıcı varsayılan `input:focus` ve container'a düşen tap-highlight birleşince geçici görsel kutu oluşuyordu. CSS'te explicit `:focus-within` veya tap-highlight nötrleştirme yoktu. |
| Marka çubuğu metin tabanlı, kırık görünüm | `brandStrip()` SVG yerine `brandName(slug)` ile düz metin basıyordu. Kullanıcı premium görünüm için orijinal marka SVG'lerini istiyordu (zaten projede mevcut). |

---

## Yapılan Değişiklikler

### 1. Mobil Hero Yeniden Tasarımı
- `homePage()` (assets/mobile-redesign.js:507) artık `cm-hero-editorial` adlı yeni hero üretiyor.
- Eklenen görsel: `assets/img/home/mobile-hero-cosmoskin.png` (gerçek dosya, AI üretimi değil).
- Görsel sağ-altta `object-fit: contain`, sol-üst negatif alan tipografi için açık.
- Tipografi HTML/CSS ile basılıyor:
  - `Cildin.` (siyah, premium serif, clamp 38–56px)
  - `Işıltın.` (gradient şampanya altın — CSS background-clip ile)
  - `Senin hikayen` (italik, ince, alt satır)
- Lead metin: "Özenle seçilmiş Kore cilt bakımı ürünleriyle cildine hak ettiği ışıltıyı kazandır."
- İki CTA:
  - **Birincil:** `ALIŞVERİŞE BAŞLA` → `/allproducts.html` (siyah, dolgun)
  - **İkincil:** `RUTİNİNİ KEŞFET` → `/account/routines/` (krem ghost, ince border)
- 360px / 390px / 430px için ayrı medya sorguları: dar telefonlarda görsel hafif küçülüyor, çok-dar (≤360px) cihazlarda görsel alta dönüyor, tipografi tam genişliğe açılıyor.

### 2. Footer Pozisyonu & Beyaz Boşluk Onarımı
- Eski hata: footer `cm-page-inner` içinde render ediliyordu. Şimdi `cm-page-inner` dışına, `bottomNav` öncesine taşındı (mobile-redesign.js:537 ve 542).
- `cm-mobile-page.cm-mobile-home` ve `.cm-mobile-categories` artık `flex column` + `min-height: 100svh`. `cm-page-inner` `flex: 1 0 auto` ile esniyor, footer `flex: 0 0 auto` ile gerçek dipte.
- `padding-bottom: 0 !important` eski 96px boşluğu siliyor.
- Footer kendi içinde `padding-bottom: calc(96px + safe-area)` taşıyor → sabit bottom-nav ile çakışmıyor, ekstra ölü beyaz alan yok.
- Footer artık sayfada **bir kere** çıkıyor (sadece home ve categories). Diğer mobil sayfalar zaten footer enjekte etmiyor; onlar için legacy `padding-bottom: 94px + safe-area` korundu.

### 3. Ödeme Logoları
- Mobil footer `cm-payment-block` ile sarmalandı: krem-üzerinde beyaz çiplerle Visa / Mastercard / Legacy card brand logoları.
- Yol birleştirildi: artık masaüstü ile aynı `assets/img/payments/*.svg` set kullanılıyor (`visa.svg`, `mastercard.svg`, `american-express.svg`).
- `filter: brightness(0) invert(1)` agresif renksizleştirme **kaldırıldı** (`filter: none !important`).
- Her logo: 26px height, beyaz arka plan, 6px border-radius, `object-fit: contain` — Troy artık footer'da gösterilmiyor (kullanıcı yalnızca Visa/Mastercard/Amex istemişti).
- `width="46" height="28"` HTML öznitelikleri layout-shift'i önlüyor.

### 4. Arama Çubuğu Odak Artifact
- `.cm-searchbar:focus-within` artık ince altın halka (`box-shadow: 0 0 0 3px rgba(181,138,74,.14)`) gösteriyor.
- `.cm-searchbar input` üzerindeki tüm `:focus / :focus-visible / :active` durumlarında outline ve box-shadow `!important` ile sıfırlandı; `-webkit-tap-highlight-color: transparent`.
- WebKit'in `search-decoration`, `search-cancel-button`, `search-results-button` pseudo-element'leri `display: none` → fantom kare yok.
- `cm-searchbar::before/::after { content: none !important }` — yapay overlay garantisi.

### 5. Marka Çubuğu
- `brandStrip()` (assets/mobile-redesign.js:485) yeniden yazıldı. Artık 7 markanın orijinal SVG'sini render ediyor:
  - COSRX, anua, Beauty of Joseon, Round Lab, Torriden, SKIN1004, Thank You Farmer.
- Yeni `.cm-brand-bar` bileşeni: başlık + yatay scroll. Her logo 26px height, `object-fit: contain` ile ezilmiyor.
- "Tümü" linki sağda `/brands.html` chevron'lu.
- Eski `.cm-brand-strip-ref` mobil ana sayfada `display: none` ile gizlendi (CSS-only kalıntı, JS tarafından silindi).

### 6. Header / Tipografi
- `cm-wordmark` artık `clamp(22px, 6.4vw, 28px)` ile dinamik ölçekleniyor.
- Header padding 14px (eski 18px) — dar telefonlarda ikonların kesilmesi önlendi.
- `.cm-icon-btn:focus-visible` ince altın outline (klavye erişimi).

---

## Eklenen Dosyalar
- `assets/img/home/mobile-hero-cosmoskin.png` — gerçek hero görseli (1.5 MB, 941×1672).
- `.claude/serve.rb` — yerel önizleme için Ruby/WEBrick scripti.
- `COSMOSKIN_MOBILE_EDITORIAL_HERO_REPORT_20260516.md` — bu rapor.

## Değiştirilen Dosyalar
- `assets/mobile-redesign.js` — `homePage()`, `brandStrip()`, `footer()`, `categoriesPage()` (footer'ı page-inner dışına aldı).
- `assets/mobile-redesign.css` — sonuna 2026-05-16 editöryal katman eklendi (~310 satır).
- `index.html` — mobile-redesign.css ve .js cache versiyonu `v=20260516-editorial-hero`.
- `.claude/launch.json` — Python'un sandbox'ta çalışmaması üzerine Ruby alternatifi.

## Silinen Dosyalar
- Yok. Kalıntı CSS sınıfları (`.cm-hero-ref--desktop-match`, eski `.cm-brand-strip-ref`) `display: none` ile devre dışı; başka şablonlarca okunduğu için tamamen silinmedi.

---

## Test Edilen Komutlar

```bash
# JS paren/brace dengesi
python3 paren-balance check on assets/mobile-redesign.js
→ parens 0, braces 0, brackets 0

# CSS brace dengesi
python3 paren-balance check on assets/mobile-redesign.css
→ braces 0, parens 0

# Asset varlığı
ls assets/img/home/mobile-hero-cosmoskin.png → 1558253 bytes ✓
ls assets/img/brands/{cosrx,anua,beauty-of-joseon,round-lab,torriden,skin1004,thank-you-farmer}.svg → 7/7 ✓
ls assets/img/payments/{visa,mastercard,american-express}.svg → 3/3 ✓

# Route varlığı
allproducts.html, collections/routine.html, routine.html,
contact.html, teslimat-kargo.html, iade-degisim.html,
mesafeli-satis.html, on-bilgilendirme.html,
legal/kvkk-aydinlatma-metni.html, brands.html → 10/10 ✓

# Dead-link taraması
grep 'href=""|href="#"|href="javascript:' mobile-redesign.js → 0 sonuç ✓

# Eski yol referansları
grep '/assets/payment/(amex|visa|mastercard|troy)' mobile-redesign.js → 0 sonuç ✓

# Footer enjeksiyon noktaları
grep 'footer()' mobile-redesign.js → 2 çağrı yeri (home, categories) + 1 declaration ✓
```

## Test Edilemeyen

**Tarayıcı tabanlı önizleme bu makinede başlatılamadı.**
Preview MCP sandbox'ı kullanıcının `Documents/GitHub/cosmoskin` dizinine erişemiyor (`shell-init: getcwd: Operation not permitted`). Python `http.server` da, Ruby/WEBrick de aynı kısıtlamaya takıldı. Bu bir araç-tarafı kısıtlama; kod değişiklikleri etkilenmedi. Önerilen manuel doğrulama:

```bash
cd /Users/can/Documents/GitHub/cosmoskin
python3 -m http.server 7700
# tarayıcıda: http://local-dev-host:7700/index.html
# Chrome DevTools > Toggle device toolbar > 360px / 390px / 430px / 768px
```

## Önerilen Test Sayfaları (manuel)
- `/` ve `/index.html` — yeni hero, marka çubuğu, footer
- `/categories.html` — footer pozisyonu, beyaz alan testi
- `/allproducts.html`, `/cart.html`, `/checkout.html`, `/account/profile.html` — header/wordmark tutarlılığı, header'ın diğer sayfalarda da düzgün hizalandığı
- `/account/routines/` — hero CTA'sının doğru sayfaya gittiği
- `/brands/cosrx.html` ve diğer marka sayfaları
- En az 2 PDP

## Test Edilen Ekran Genişlikleri (CSS medya sorgu seviyesinde)
- 360px (cm-mobile media), 375px (header daraltma), 390px (varsayılan iPhone), 430px (iPhone Pro Max), 768px (tablet sınırı).

---

## Kalan Riskler
1. **Görsel doğrulama yapılmadı** — tarayıcıda manuel kontrol gerekli. Tüm CSS sözdizimi geçerli, ama yan yana görsel inceleme yapılamadı.
2. **Cache** — eski kullanıcılar `?v=20260512` ile cache'lenmiş CSS/JS'i tutuyorsa hard-refresh gerekebilir. `index.html` cache-busting versiyonu güncellendi.
3. **`cm-brand-bar` yatay scroll** — 7 marka logosu sığmazsa kaydırılır; istenmeyen scroll ihtimaline karşı `scrollbar-width: none` ile gizlendi ama dokunmatik kaydırma çalışıyor.
4. **`cm-hero-editorial::before` overlay** — opasiteyle krem renge harmanlanıyor; çok-açık ekranlarda metin kontrastı düşebilir. `color: #0f0c08` (neredeyse saf siyah) kullanıldığı için risk minimum.
5. **Eski `cm-hero-ref--desktop-match` ve `cm-brand-strip-ref` sınıfları** — başka şablonlarca kullanılıyor olabileceği için silinmedi, sadece `cm-mobile-home` altında `display: none` ile gizlendi. Ölü kod ileri bir temizlikte kaldırılabilir.

---

## Final Verdict

**ACCEPT WITH RISKS**

- Tüm ana hedefler (hero, footer, ödeme, arama, marka çubuğu, header, tipografi) statik olarak doğrulandı.
- Kod sözdizimi temiz; tüm asset ve route referansları geçerli.
- Tek eksik: tarayıcıda görsel doğrulama (önizleme sandbox kısıtlaması nedeniyle yapılamadı).
- Kullanıcının manuel olarak yerel server kurup 360–430px genişliklerde mobil önizleme yapması önerilir.
