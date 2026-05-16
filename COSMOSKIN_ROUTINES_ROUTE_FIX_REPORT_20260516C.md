# COSMOSKIN Rutinler Route Fix — 2026-05-16C

## Düzeltilen ana hata
Anasayfa üst menüdeki `Rutinler` ve hero `RUTİNİ GÖR` linkleri artık gerçek mevcut dosyaya (`/collections/routine.html`) güvenli şekilde gider. Production için clean URL rewrite/redirect korundu.

## Yapılanlar
- `/collections/routine.html` ve `/collections/routine/index.html` içerikleri korundu.
- Rutin sayfasına statik karşılama fallback eklendi; JS geç yüklenirse bile boş/loading ekran kalmaz.
- `assets/routines.js` routine sayfalarında daha erken yüklenir.
- `assets/routine-route-bridge.js` eklendi: homepage routine linklerini yakalar, seçimleri korur ve doğru routine sayfasına taşır.
- Rutin route linkleri local preview için `.html` hedefiyle çalışacak hale getirildi.
- `_redirects` clean URL desteği güncellendi.

## Beklenen akış
- Anasayfa > üst menü `Rutinler`: kullanıcı girişsizse karşılama ekranı açılır.
- Anasayfa > `RUTİNİ GÖR`: routine karşılama ekranına gider ve seçili akış varsa pending olarak korunur.
- Giriş varsa routine JS dashboard ekranına yükseltir.
