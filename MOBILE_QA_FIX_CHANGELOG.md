# COSMOSKIN Mobile QA Fix Changelog

## Düzeltilen kritik hatalar
- Eski `assets/mobile.css` / `assets/mobile.js` ile yeni `assets/mobile-redesign.css` / `assets/mobile-redesign.js` çakışması stabilize edildi.
- Yeni mobil katman `body.cm-mobile-active` altında namespace'lendi; legacy mobil header, search bar, kategori blokları, bottom nav, toast ve sticky PDP öğeleri yeni sistem aktifken gizlendi.
- `assets/mobile.js` içine koruma eklendi; yeni mobil redesign aktif rotalarda legacy mobil injection çalışmıyor.
- `assets/mobile-redesign.js` yeniden yapılandırıldı; 768px üzerindeki desktop görünümde mount etmiyor ve duplicate DOM/event üretmiyor.

## Düzeltilen UI/UX hataları
- Mobil header, hamburger drawer, bottom nav, homepage hero, ürün kartları, listing, PDP, smart routine ve sepet arayüzü tek premium COSMOSKIN dili altında toplandı.
- Emoji/clipart kullanımından kaçınıldı; menü ve kontrol ikonları inline SVG / thin-line yaklaşımıyla düzenlendi.
- Ürün kartlarında erişilebilir favori butonu ve çalışan sepete ekleme butonu eklendi.
- Hamburger menü overlay, ESC ile kapanma, overlay tıklaması ve body scroll lock davranışıyla tamamlandı.

## Düzeltilen responsive hatalar
- 360px, 375px, 390px, 430px ve 768px için CSS breakpoint iyileştirmeleri eklendi.
- Quick category kartları, ürün gridleri, routine kartları ve sepet satırları küçük mobil ekranlarda daha okunabilir hale getirildi.
- Mobil bottom nav’ın CTA alanlarını örtmesini azaltmak için güvenli alt boşluk ve fixed nav düzeni eklendi.
- Horizontal scroll riskini azaltan `overflow-x: hidden` ve yatay chip scroll kuralları eklendi.

## Düzeltilen data/cart/PDP hataları
- Hardcoded mock ürün dizisi kaldırıldı; mobil listing gerçek `window.COSMOSKIN_PRODUCTS` / `products.json` verisini kullanacak şekilde düzenlendi.
- Ürün sayısı filtrelenen gerçek ürün adedinden hesaplanıyor.
- PDP mobil görünümü mevcut PDP slug’ı ve ürün datasına göre ürün görseli, marka, başlık, fiyat, hacim ve açıklama gösteriyor.
- PDP accordion içerikleri `assets/data/product-guides.json` varsa ürün rehberi datasından, yoksa kategori bazlı fallback’ten geliyor.
- Sepet mobil görünümü `cosmoskin_cart` localStorage verisini ve mevcut cart API fallback’ini kullanıyor; quantity/remove/summary güncelleniyor.
- Smart Routine seçimleri gerçek ürün datasından öneri üretir; rutin sepete ekleme ve localStorage’a kaydetme davranışı eklendi.

## Düzeltilen accessibility hataları
- Icon-only butonlara `aria-label` eklendi.
- Hamburger butonuna `aria-expanded`, drawer davranışına keyboard/ESC kapatma desteği eklendi.
- Toggle chip’lerde `aria-pressed` kullanıldı.
- PDP accordion’ları native `<details><summary>` yapısına çevrildi.
- Focus-visible stilleri ve erişilebilir buton yapıları eklendi.

## Değiştirilen dosyalar
- `assets/mobile-redesign.js`
- `assets/mobile-redesign.css`
- `assets/mobile.js`
- Global metin düzeltmeleri: HTML/JS/CSS/JSON içindeki hatalı “COSMOSKIN / Cosmo Skin / COSMOSKIN” kullanımları “COSMOSKIN” olarak standardize edildi.

## Test edilen sayfalar
- `index.html`
- `allproducts.html`
- `checkout.html`
- `collections/routine.html`
- `collections/cleanse.html`
- `collections/hydrate.html`
- `brands/cosrx.html`
- `products/beauty-of-joseon-relief-sun-spf50.html`
- `products/cosrx-low-ph-good-morning-gel-cleanser.html`
- `products/torriden-dive-in-hyaluronic-acid-serum.html`

## Test edilen ekran genişlikleri
- Kod/CSS seviyesinde 360px, 375px, 390px, 430px, 768px ve desktop breakpoint kuralları kontrol edildi.
- Ortam kısıtı nedeniyle gerçek browser rendering screenshot testi tamamlanamadı.

## Yapılan doğrulamalar
- `node --check assets/mobile-redesign.js`
- `node --check assets/mobile.js`
- `products.json`: 35 ürün, 0 eksik ürün görsel yolu
- HTML asset/script/link kontrolü: kritik eksik asset/link bulunmadı
- Lokal static server ile ana sayfa, ürün listesi, checkout, routine, 3 PDP, 2 collection ve 1 brand sayfasında HTTP 200 doğrulandı.
- `mobile-redesign.js` içinde eski hardcoded örnekler kaldırıldı: “234 ürün”, “1.284 değerlendirme”, mock fiyatlar ve `const PRODUCTS` bulunmuyor.
- “COSMOSKIN” marka yazımı standardize edildi.

## Kalan riskler
- Playwright/Chromium browser rendering testi çalışma ortamında `net::ERR_BLOCKED_BY_ADMINISTRATOR` nedeniyle tamamlanamadı. Bu yüzden gerçek cihaz/screenshot üzerinden görsel piksel-perfect QA yapıldığı iddia edilmemelidir.
- Coupon sistemi projede tam backend/kampanya datası ile bağlı değilse güvenli fallback mesajı gösterir; gerçek kampanya motoru ayrıca bağlanmalıdır.
