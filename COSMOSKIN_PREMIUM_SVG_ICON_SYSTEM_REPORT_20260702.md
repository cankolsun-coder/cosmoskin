# COSMOSKIN Premium SVG Icon System — 2026-07-02

## Kapsam
Bu çalışma yalnızca Premium SVG Icon System fazıdır. Header/footer redesign, checkout redesign, ürün grid redesign, PDP redesign, Supabase/API schema değişikliği ve Akıllı Rutin wizard layout redesign yapılmadı.

## Mevcut ikon audit bulguları
- `assets/js/smart-routine.js`, homepage Akıllı Rutin alanında eski `/assets/icons/routine/final-color/256/*.png` rutin ikon sistemini kullanıyordu.
- `index.html` içindeki statik Akıllı Rutin bloklarında eski PNG rutin ikon referansları vardı.
- `assets/routines.js`, routine/account-routine sayfaları için kendi inline SVG path haritasını üretiyordu; bu yapı account ve homepage ikon ailesiyle görsel olarak ayrıydı.
- `assets/account-dashboard.js`, Hesabım ekranı için ikinci bir inline SVG path haritası kullanıyordu; bu da rutin sayfasındaki ikon ailesiyle tam tutarlı değildi.
- Ödeme logoları, sosyal medya ikonları, ürün görselleri, favicon ve marka logo görselleri kapsam dışı bırakıldı.

## Tasarım standardı
Yeni ikon ailesi `/assets/icons/cosmoskin/` altında oluşturuldu.

Standartlar:
- Gerçek SVG dosyaları kullanıldı.
- Tüm yeni SVG dosyaları `viewBox="0 0 24 24"` standardındadır.
- SVG içinde bitmap, base64, `<image>`, `.png`, `.jpg`, `.jpeg`, `.webp` referansı yoktur.
- Top-level hardcoded `width` / `height` yoktur.
- Stroke standardı: `stroke-width="1.65"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Ana renk yaklaşımı: `currentColor`. External `<img>` kullanımında tarayıcılar `currentColor` mirasını SVG içine doğrudan taşımadığı için selected/active state'lerde CSS filter desteği eklendi.
- Görsel dil: premium, sade, cilt bakımı odaklı, fazla oyuncak/medikal olmayan line icon ailesi.

## Eklenen SVG dosyaları
### Rutin hedef ikonları
- `routine-goal-hydration.svg`: Nem hedefi.
- `routine-goal-barrier.svg`: Bariyer hedefi.
- `routine-goal-radiance.svg`: Işıltı/cam cilt görünümü.
- `routine-goal-tone.svg`: Leke görünümü / ton eşitsizliği.
- `routine-goal-pore.svg`: Gözenek / sebum dengesi.
- `routine-goal-sensitive.svg`: Hassasiyet / kızarıklık eğilimi.
- `routine-goal-acne-prone.svg`: Sivilceye eğilimli cilt görünümü.

### Rutin adım ikonları
- `routine-step-cleanse.svg`: Temizleme adımı.
- `routine-step-prep.svg`: Hazırlama / toner-essence adımı.
- `routine-step-serum.svg`: Serum adımı.
- `routine-step-moisturize.svg`: Nemlendirme adımı.
- `routine-step-spf.svg`: Gündüz SPF adımı.
- `routine-step-weekly.svg`: Haftalık destek adımı.
- `routine-step-night.svg`: Akşam/gece rutini.
- `routine-step-repair.svg`: Destek/onarım odaklı adım.

### Hesap ikonları
- `account-overview.svg`: Hesap genel bakış.
- `account-orders.svg`: Siparişler/faturalar.
- `account-returns.svg`: İade ve talepler.
- `account-favorites.svg`: Favoriler.
- `account-addresses.svg`: Adresler.
- `account-club.svg`: COSMOSKIN Club.
- `account-skin-profile.svg`: Cilt profili.
- `account-routine.svg`: Akıllı Rutinim / Rutinlerim.
- `account-notifications.svg`: Bildirim tercihleri.
- `account-support.svg`: Destek talepleri.
- `account-security.svg`: Güvenlik.
- `account-payments.svg`: Ödeme tercihleri.

### Sistem ve ticaret mikro ikonları
- `status-check.svg`, `status-info.svg`, `status-warning.svg`, `status-empty.svg`, `status-sync.svg`, `status-lock.svg`, `status-history.svg`, `status-compare.svg`
- `system-arrow-right.svg`, `system-plus.svg`, `system-edit.svg`
- `commerce-cart.svg`, `commerce-heart.svg`, `commerce-truck.svg`, `commerce-shield.svg`, `commerce-credit-card.svg`, `commerce-gift.svg`

## Kullanım yöntemi
Projeye en az riskli yöntem olarak external SVG dosyalarını `<img src="/assets/icons/cosmoskin/...svg" alt="" aria-hidden="true">` ile kullanma yöntemi seçildi.

Gerekçe:
- Mevcut HTML/JS render yapısına en az müdahaleyi gerektirir.
- Sprite sistemi veya inline SVG template sistemi eklemek daha fazla JS/CSS refactor riski yaratırdı.
- Cache yönetimi mevcut asset version query sistemiyle sürdürülebilir.
- Dekoratif ikonlar `alt=""` ve `aria-hidden="true"` ile işaretlendi.

## Değiştirilen eski ikon kullanımları
- `assets/js/smart-routine.js` eski PNG path üretimi yerine `/assets/icons/cosmoskin/*.svg` mapping sistemine geçirildi.
- Homepage Akıllı Rutin hedef kartları yeni rutin hedef SVG ikonlarını kullanıyor.
- Homepage rutin adımları, check, arrow, offer, status ikonları yeni SVG sisteminden besleniyor.
- `index.html` içindeki eski statik Akıllı Rutin PNG ikon referansları yeni SVG dosyalarıyla değiştirildi.
- `assets/routines.js` içindeki inline path icon map, yeni `/assets/icons/cosmoskin/*.svg` map sistemine geçirildi.
- Public `/routine.html` wizard seçim kartlarına yeni SVG ikon slotu eklendi.
- Public routine sonuç ekranı, sabah/akşam/haftalık ikonları yeni SVG ailesinden geliyor.
- `assets/account-dashboard.js` içindeki inline account icon map, yeni SVG dosya map sistemine geçirildi.
- Account nav, quick cards, stats, empty/info/support ikonları aynı SVG ailesine bağlandı.

## Bilerek dokunulmayan ikon/logolar
- COSMOSKIN logo/wordmark/monogram dosyaları.
- Ödeme logoları: iyzico, Visa, Mastercard, Troy.
- Footer sosyal medya ikonları.
- Ürün görselleri ve ürün placeholder görselleri.
- Favicon / Apple touch icon.
- Header tool inline ikonları, bu fazda header redesign kapsamına girmediği için korunmuştur.

## Anasayfa entegrasyon notları
- Eski routine PNG ikon referansları kaldırıldı.
- Hedef kartları aynı ölçüde yeni SVG ikonları kullanıyor.
- Selected state için beyaz/kontrastlı ikon görünümü CSS filter ile desteklendi.
- Ürün görselleri ve statik marka görselleri etkilenmedi.

## Public routine merkezi entegrasyon notları
- Wizard choice kartlarına `rt-public-choice-icon` alanı eklendi.
- Hedef, cilt tipi, hassasiyet, rutin yoğunluğu ve doku tercihi seçenekleri için ikon mapping eklendi.
- Rutin sonucu sabah/akşam/haftalık akışındaki ikonlar yeni SVG ailesinden geliyor.
- Seçim value'ları, routine payload ve local draft / Supabase sync mantığı değiştirilmedi.

## Hesabım ekranı entegrasyon notları
- Account dashboard inline icon map external SVG map’e geçirildi.
- Account cleanup fazındaki tek render sistemi korunmuştur.
- Statik/fake panel geri eklenmedi.
- Duplicate ID yaratılmadı.
- Account CSS’e yeni SVG `<img>` kullanımını destekleyen scoped kurallar eklendi.

## Accessibility notları
- Dekoratif ikonlarda `alt=""` ve `aria-hidden="true"` kullanıldı.
- Icon-only button eklenmedi.
- Mevcut button/link label yapıları korundu.
- Seçili state sadece ikon rengine bırakılmadı; mevcut background/border/pressed state korunuyor.

## Performans notları
- Yeni external dependency eklenmedi.
- Icon font, Lottie, canvas veya CDN eklenmedi.
- SVG dosyaları küçük ve metadata içermeyen sade dosyalardır.
- Base64/bitmap gömülmedi.
- Cache busting için ilgili asset query versiyonları `20260702-svg-icons` olarak güncellendi.

## Çalıştırılan testler
```bash
node --check assets/js/smart-routine.js
node --check assets/routines.js
node --check assets/routine-data-model.js
node --check assets/account-dashboard.js
node --check functions/api/account/routine-results.js
node --check functions/api/account/skin-profile.js
node --test tests/local-integration.test.mjs
node scripts/validate-cosmoskin-icons.mjs
```

## Test sonuçları
- `node --test tests/local-integration.test.mjs`: 20 test geçti, 0 fail.
- Icon validation: 44 SVG dosyası ve 19 scoped dosya kontrol edildi, geçti.

## Kalan riskler
- Gerçek tarayıcı/staging üzerinde 360px/390px mobile ve desktop görsel QA yapılmalı. Kod ve static validation geçti; görsel algı nihai olarak canlı/staging viewport kontrolüyle doğrulanmalıdır.
- External SVG `<img>` kullanımında `currentColor` mirası doğrudan SVG path içine aktarılmadığı için aktif/selected ikon renkleri CSS filter ile desteklendi. Görsel ton staging’de kontrol edilmeli.

## Bir sonraki faz önerisi
Sıradaki en mantıklı fazlardan biri:
1. PDP Routine Intelligence + Product Detail Professional QA
2. Legal & Commerce Readiness Audit

Bu faz içinde PDP, checkout veya yasal metin redesign yapılmamıştır.
