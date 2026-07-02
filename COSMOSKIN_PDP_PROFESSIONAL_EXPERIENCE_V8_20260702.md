# COSMOSKIN PDP PROFESSIONAL EXPERIENCE V8 — 2026-07-02

## Scope
Bu paket `cosmoskin(62).zip` üzerinden yalnızca ürün detay sayfaları (PDP) ve PDP’ye bağlı ürün rehberi/öneri katmanını hedefler.

## Protected areas
- Header görsel tasarımı değiştirilmedi.
- Footer görsel tasarımı değiştirilmedi.
- Üst kayan duyuru barı değiştirilmedi.
- Ana site iskeleti, checkout, account ve legal akışlarına müdahale edilmedi.

## Main improvements

### 1. PDP tab content professionalized
Tüm `products/*.html` sayfalarında Özet / İçerikler / Kullanım panelleri ürün-bazlı `assets/data/product-guides.json` verisiyle yeniden dolduruldu.

Eklenen yapı:
- Ürün özeti
- Rutin adımı
- Kullanım zamanı
- Uygun profil / cilt tipi odağı
- Öne çıkan içerik kartları
- Güvenli kullanım notu
- Daha profesyonel kullanım adımları

### 2. Skin profile compatibility tab
PDP tab alanına dinamik olarak `Cilt Profilime Uygun mu?` sekmesi eklenir.

Davranış:
- Cilt profili yoksa: Rutin testine yönlendiren profesyonel CTA gösterilir.
- Cilt profili varsa: ürün rehberi, kategori, içerik odağı, cilt tipi, hassasiyet ve bakım hedeflerine göre açıklamalı uygunluk kartı gösterilir.
- Tıbbi iddia veya kesin sonuç vaadi yapılmaz.

### 3. Smarter recommendations
`Yanında Önerilenler` alanı artık yalnızca statik/random ürün listesi gibi kalmaz.

Yeni mantık:
- Ürün kategorisi / rutin adımı dikkate alınır.
- Güneş kremi sayfasında temizlik, serum, nemlendirici gibi tamamlayıcı ürünler öne çıkarılır.
- Serum sayfasında nemlendirici ve SPF gibi tamamlayıcı adımlar öne çıkarılır.
- Cilt profili varsa öneri puanlamasında cilt tipi, hassasiyet ve hedefler dikkate alınır.
- Kartlarda neden önerildiğini açıklayan kısa gerekçe gösterilir.

### 4. Product gallery arrows
Ana ürün görselinde birden fazla benzersiz görsel varsa sağ/sol yarı transparan oklar ve görsel sayacı görünür.

Davranış:
- Tek görsel varsa oklar gösterilmez.
- Thumbnail seçimi korunur.
- Klavye oklarıyla geçiş desteklenir.
- Mobilde mevcut thumbnail yapısı bozulmaz.

### 5. Product guide area hardened
Ürün rehberi alanına dokunulmadan daha güvenli ve profesyonel hale getirildi.

Düzeltmeler:
- Eksik product-specific guide görsel yolları temizlendi.
- Eksik custom guide görseli varsa kırık/görsel uyumsuzluğu yerine kategoriye uygun fallback kullanılır.
- İçerik görseli alanında ürün görseli + içerik chip’leriyle daha ürün-bazlı görsel yapı oluşturulur.
- Rehberin üst kısmına cilt uyumu / rutin adımı / kullanım zamanı şeridi eklendi.

### 6. Beauty of Joseon Relief Sun image fix
Önceki `beauty-of-joseon-relief-sun-spf50-card.webp` görselinde kare/cyan bozuk alan görünüyordu. Bu ürün için mevcut daha temiz ürün görseli olan:

`/assets/img/products/beauty-of-joseon/relief-sun-spf50-card.png`

PDP, ürün listesi, ilgili ürün kartları, ürün data dosyaları ve rehber datasında kullanılacak şekilde güncellendi.

## Changed files

### New files
- `assets/pdp-professional.css`
- `assets/pdp-professional.js`
- `COSMOSKIN_PDP_PROFESSIONAL_EXPERIENCE_V8_20260702.md`

### Updated files
- `products/*.html` — 37 PDP sayfasında yeni PDP CSS/JS, skin profile store ve ürün-bazlı panel içerikleri eklendi.
- `assets/product-guide.js` — guide görsel fallback ve kırık görsel dayanıklılığı iyileştirildi.
- `assets/data/product-guides.json` — eksik custom guide görsel yolları temizlendi; BOJ Relief Sun ürün görsel yolu düzeltildi.
- `products.json` — BOJ Relief Sun görsel yolu düzeltildi.
- `assets/products-data.js` — BOJ Relief Sun fallback ürün data görsel yolu düzeltildi.
- `functions/api/_lib/products-data.js` — API tarafındaki BOJ Relief Sun görsel yolu düzeltildi.
- İlgili collection/brand/allproducts HTML dosyalarında BOJ Relief Sun görsel yolu düzeltildi.

## QA performed

### Static checks
- `node --check assets/pdp-professional.js` passed.
- `node --check assets/product-guide.js` passed.
- `node --check assets/products-data.js` passed.
- CSS brace/parens balance passed for `assets/pdp-professional.css`.
- 37 PDP sayfasında `pdp-professional.css`, `pdp-professional.js`, `skin-profile-store.js` varlığı doğrulandı.
- 37 PDP sayfasında Özet / İçerikler / Kullanım panel yapısı doğrulandı.
- Product image path existence check passed.
- Product guide image path existence check passed.

### Static server smoke tests
HTTP 200 confirmed:
- `/products/beauty-of-joseon-relief-sun-spf50.html`
- `/products/torriden-dive-in-hyaluronic-acid-serum.html`
- `/products/cosrx-low-ph-good-morning-gel-cleanser.html`
- `/products/skin1004-hyalu-cica-water-fit-sun-serum.html`
- `/products/anua-heartleaf-77-soothing-toner.html`
- `/assets/pdp-professional.js`
- `/assets/pdp-professional.css`
- `/assets/product-guide.js`
- `/assets/data/product-guides.json`
- `/assets/img/products/beauty-of-joseon/relief-sun-spf50-card.png`

## Manual staging QA checklist
1. Aç: `/products/beauty-of-joseon-relief-sun-spf50.html`
2. Özet / İçerikler / Kullanım sekmelerini kontrol et.
3. Cilt profili yokken `Cilt Profilime Uygun mu?` sekmesinde CTA görünüyor mu kontrol et.
4. Cilt profili oluşturup aynı ürüne dön; uygunluk açıklaması görünüyor mu kontrol et.
5. `Yanında Önerilenler` alanında öneriler ürün kategorisi ve profil ile uyumlu mu kontrol et.
6. Birden fazla görsele sahip ürün varsa ana görsel oklarını test et.
7. Beauty of Joseon Relief Sun görselinde eski cyan/kare bozukluk görünmüyor mu kontrol et.
8. Ürün rehberi alanında ürünle alakasız görsel kullanılmadığını kontrol et.
9. Sepete ekle, favori, hemen al, rutin oluştur ve yorumlara git CTA’larını test et.
10. Mobilde PDP sayfasında yatay scroll veya CTA kapanması var mı kontrol et.

## Known boundaries
- İçerik metinleri mevcut proje içindeki `product-guides.json` ürün rehberi verisiyle hazırlandı. Tam INCI listesi için ürün ambalajı/resmi marka bilgisi esas alınmalıdır.
- Canlı Supabase oturumu, gerçek cilt profili ve gerçek ürün yorumları bu ortamda browser oturumu ile test edilemedi; staging’de gerçek kullanıcı hesabıyla doğrulanmalıdır.
