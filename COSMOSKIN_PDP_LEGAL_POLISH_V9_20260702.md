# COSMOSKIN PDP + Legal Polish V9 — 2026-07-02

## Kapsam

Bu çalışma, son PDP V8 paketi üzerinden ürün detay sayfalarını ve iade/kargo metinlerini geliştirmek için yapıldı. Header, footer ve üst kayan duyuru iskeleti korunmuştur.

## PDP düzeltmeleri

### 1. Galeri okları
- `assets/pdp-professional.js` içinde ürün görsel galerisi yeniden güçlendirildi.
- Ürün sayfasında birden fazla benzersiz ürün görseli varsa sol/sağ navigasyon butonları gösterilir.
- Bazı ürün sayfalarında thumbnail sayısı birden fazla olmasına rağmen aynı görsel path’i tekrarlandığı için buton görünmüyordu. Bu nedenle V9’da ürün rehberi doku görseli de ek galeri öğesi olarak kullanılabilir hale getirildi.
- Galeriye dinamik “formül doku görseli” thumbnail’i eklenir; oklar ve görsel sayacı çalışır.

### 2. COSMOSKIN Club puan bilgisi
- PDP satın alma kartına COSMOSKIN Club puan bilgi kartı eklendi.
- Temel kural kullanıcıya açık şekilde gösterilir: `1 TL uygun net ürün harcaması = 1 puan`.
- Ürün fiyatına göre yaklaşık puan hesaplanır:
  - Essential: 1x
  - Signature: 1.25x
  - Elite: 1.5x
- Puanların ödeme ve teslimat sonrası, iade süresi tamamlandığında kullanılabilir hale geleceği açıklandı.
- `100 P = 1 TL` dönüşüm bilgisi eklendi.

### 3. Başlık / satın alma alanı hizası
- Uzun ürün isimlerinde H1 boyutu düşürüldü.
- Ürün açıklaması ve purchase card aralıkları sıkılaştırıldı.
- Sepete ekle bölümü çok aşağıda kalmayacak şekilde PDP-only CSS ile hizalandı.
- Ana layout/grid bozulmadı; sadece ürün bilgi alanı içi yoğunluk ayarı yapıldı.

### 4. Özet / içerik / rehber tekrar hissi azaltıldı
- Özet sekmesi daha kısa ve karar destekli hale getirildi.
- İçerikler sekmesi daha derin ve formül odaklı hale getirildi.
- Ürün rehberi kısmı artık ürün packshot’ı yerine transparent ingredient/texture görseli kullanır.
- Her ürün için `Tam içerik listesi için ürün ambalajındaki güncel INCI bilgisini esas alın.` uyarısı korundu.

### 5. Ürün içerik rehberi
- 35 ürün için ürün-bazlı rehber verileri yeniden detaylandırıldı.
- Ürün tipine göre gerçekçi kullanım, cilt tipi, dikkat notu, doku ve içerik odağı güncellendi.
- Medikal/tedavi iddialarından kaçınıldı; “destekler”, “yardımcı olur”, “görünüm/his” dili kullanıldı.

### 6. Ürün rehberi görselleri
- 35 ürün için transparent PNG ingredient/texture görselleri üretildi.
- Arka planlı veya yanlış ürün packshot’ı ürün rehberi görseli olarak kullanılmıyor.
- Görseller `/assets/img/ingredients/` altında tutuluyor.
- Dışarıdan lisanssız ürün/ingredient görseli alınmadı; her ürün için COSMOSKIN’e özgü transparent editorial texture görseli oluşturuldu.

## İade / kargo metni düzeltmeleri

### DHL iade kodu
Aşağıdaki alanlara DHL iade kodu eklendi:

`3606859272`

Güncellenen mantık:
- İade gönderimleri açık adres paylaşımı yerine DHL iade kodu üzerinden ilerler.
- Direkt adres sitede yayımlanmaz.
- İade talebi ve gönderim talimatı kod üzerinden yürütülür.

### Hediye / tester / kampanya ürünleri
Aşağıdaki kural yasal metinlere ve footer’daki iade/değişim sayfasına işlendi:

İade edilen sipariş kapsamında kampanya, kupon, sepet hediyesi, numune/tester veya promosyon ürün gönderilmişse; bu ürünlerin de eksiksiz, kullanılmamış ve gönderildiği haliyle iade paketi içinde yer alması gerekir. Hediye/tester/promosyon ürün iade edilmezse iade incelemesi bekletilebilir veya kampanya koşullarına göre ilgili ürün bedeli iade tutarından mahsup edilebilir.

## Değişen ana dosyalar

- `assets/pdp-professional.js`
- `assets/pdp-professional.css`
- `assets/data/product-guides.json`
- `assets/img/ingredients/*.png`
- `legal/iade-ve-cayma-politikasi.html`
- `legal/mesafeli-satis-sozlesmesi.html`
- `legal/on-bilgilendirme-formu.html`
- `legal/teslimat-ve-kargo.html`
- `iade-degisim.html`
- `mesafeli-satis.html`
- `on-bilgilendirme.html`
- `teslimat-kargo.html`
- `assets/legal-modal.js`
- `products/*.html` cache/version bump
- `allproducts.html`, `brands/beauty-of-joseon.html`, `collections/beauty-of-joseon.html`, `collections/protect.html` cache/version bump

## Testler

Geçen kontroller:

- `node --check assets/pdp-professional.js`
- `node --check assets/product-guide.js`
- `node --check assets/products-data.js`
- `node --check assets/legal-modal.js`
- CSS brace balance kontrolü
- 37 PDP sayfasında `pdp-v9` CSS/JS varlık kontrolü
- 35 ürün rehberi için transparent ingredient visual path kontrolü
- Legacy ürün slug resolve kontrolü:
  - `cosrx-advanced-snail-96-mucin-power-essence`
  - `torriden-dive-in-serum`
- Static HTTP 200 smoke test:
  - `/products/beauty-of-joseon-relief-sun-spf50.html`
  - `/products/cosrx-advanced-snail-96-mucin-power-essence.html`
  - `/products/torriden-dive-in-serum.html`
  - `/legal/iade-ve-cayma-politikasi.html`
  - `/iade-degisim.html`
- Zip integrity kontrolü

## Test blokajı

Headless browser çalıştırma denemesinde Playwright browser binary eksik olduğu için görsel E2E doğrulama yapılamadı. Static source, JS syntax ve HTTP smoke testleri tamamlandı. Deploy sonrası gerçek tarayıcıda aşağıdaki sayfalar kontrol edilmeli:

- `/products/beauty-of-joseon-relief-sun-spf50.html`
- `/products/cosrx-advanced-snail-96-mucin-power-essence.html`
- `/products/torriden-dive-in-serum.html`
- `/products/skin1004-hyalu-cica-water-fit-sun-serum.html`
- `/legal/iade-ve-cayma-politikasi.html`
- `/iade-degisim.html`

## Header / footer koruma

- Header tasarımı değiştirilmedi.
- Footer tasarımı değiştirilmedi.
- Üst kayan duyuru tasarımı değiştirilmedi.
- Çalışma PDP main content, legal main content ve ilgili scoped asset dosyalarıyla sınırlı tutuldu.
