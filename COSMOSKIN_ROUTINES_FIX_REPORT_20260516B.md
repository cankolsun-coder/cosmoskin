# COSMOSKIN Rutinler + Homepage UI Fix Report — 2026-05-16B

## Kapsam
Bu güncelleme, son kontrolde görülen Rutinler akışı, homepage hover/search/routine selector, ürün fiyat tipografisi ve sepet satırı düzeni hatalarını hedefler. Global header ve footer yeniden tasarlanmadı; mevcut yapı korunarak noktasal CSS/JS düzeltmeleri yapıldı.

## Ana routing değişiklikleri
- Ana Rutinler rotası temiz URL olarak `/account/routines/` yapıldı.
- `/account/routines/` dosyası korunarak uyumluluk sağlandı.
- `/account/routines/index.html` eklendi; temiz URL/dizin index senaryosunda da çalışır.
- `_redirects` içinde eski ve yardımcı rutin rotaları temiz Rutinler rotasına bağlandı.
- Global HTML ve JS içindeki eski `/routine.html` linkleri `/account/routines/` rotasına taşındı.
- Account içindeki rutin alt sayfa linkleri, tek Rutinler ekranı içinde query tab mantığına bağlandı:
  - `/account/routines/?view=profile`
  - `/account/routines/?view=favorites`
  - `/account/routines/?view=history`

## Rutinler sayfa geçişi
- Rutinler alanında sidebar geçişleri gerçek ayrı sayfa hissi yerine aynı sayfa içinde çalışacak şekilde History API ile düzenlendi.
- `data-rt-view` linkleri sayfayı full reload etmeden içerik alanını değiştirir.
- Browser back/forward desteği eklendi.

## Gerçek ürün verisi bağlantısı
- Rutin önerileri statik taslak hissinden çıkarıldı.
- Rutinler JS, `window.COSMOSKIN_PRODUCTS` / `assets/products-data.js` katalog datasını kullanır.
- Homepage Akıllı Rutin seçimlerinden gelen `dayRoutine`, `nightRoutine`, hedef ve cilt tipi değerleri Rutinler ekranına taşınır.
- Ürün kartları gerçek ürün URL, fiyat, marka, ürün adı ve görsel değerleriyle render edilir.

## Homepage Akıllı Rutin bağlantısı
- Homepage `Rutini Gör` akışı `/account/routines/` rotasına bağlandı.
- Seçimler şu localStorage anahtarları üzerinden korunur:
  - `cosmoskin_pending_routine_preferences`
  - `cosmoskin_routine_preferences`
  - `cosmoskin_routine_active`
- Giriş yapılmamışsa Rutinler karşılama ekranı açılır.
- Giriş yapıldıktan sonra pending seçimler dashboard/profile içerisine yansır.

## Header / nav / hover düzeltmeleri
- Kategoriler hover mega menüsü, Markalar hover davranışıyla daha uyumlu hale getirildi.
- Kategori mega panelinin çok sola taşarak yarım görünmesi engellendi.
- Hover açılış animasyonu yumuşatıldı.
- Üst kayan reklam yazısı bir miktar hızlandırıldı.

## Search düzeltmeleri
- Sağ üst arama alanında hover/focus sırasında çıkan kare/çizgi outline kaldırıldı.
- Search results dropdown için daha kompakt, taşmayan ve premium görünümlü satır yapısı eklendi.
- Ürün adları ve meta satırları taşmayı önleyecek şekilde line-clamp/ellipsis ile kontrol edildi.

## Homepage Akıllı Rutin UI polish
- `Cilt hedefini seç` alanı daha düzenli, kompakt ve profesyonel kart grid yapısına çekildi.
- Gündüz/Gece ürün akışı kartlarında ürün adı/fiyat/görsel hizaları sıkılaştırıldı.
- Ana yapı bozulmadan sadece görünüm ve hizalama düzeltmesi yapıldı.

## Ürün kartları ve fiyat tipografisi
- Fiyat font boyutu bir kademe küçültüldü.
- Ürün isimleri iki satırla sınırlandı.
- Price row ve buton hizaları taşmayı önleyecek şekilde sıkılaştırıldı.

## Sepet ekranı
- Cart drawer ve mobil cart satırları için ayrı responsive düzeltmeler eklendi.
- Ürün görseli, ürün adı, hacim/marka, fiyat ve adet kontrolü daha kompakt hale getirildi.
- Sepette eklenen ürün satırının üstte kaybolması/taşması için font ve grid boyutları yeniden ayarlandı.

## Değiştirilen / eklenen önemli dosyalar
- `collections/routine.html`
- `collections/routine/index.html`
- `routine.html`
- `index.html`
- `_redirects`
- `sitemap.xml`
- `assets/routines.js`
- `assets/routines.css`
- `assets/home-routine.js`
- `assets/js/smart-routine.js`
- `assets/master-upgrade.css`
- `assets/mobile-redesign.js`
- `assets/mobile.js`
- `assets/mobile-enhancements.js`
- `assets/master-upgrade.js`
- `assets/app.js`
- `assets/account-dashboard.js`
- `functions/api/routine-reminders.js`
- `functions/api/contact.js`
- `automation/cron-reminders/worker.js`

## QA sonuçları
- JS syntax check geçti:
  - `assets/routines.js`
  - `assets/home-routine.js`
  - `assets/js/smart-routine.js`
  - `assets/mobile.js`
  - `assets/mobile-enhancements.js`
  - `assets/master-upgrade.js`
  - `assets/mobile-redesign.js`
  - `assets/app.js`
  - `assets/account-dashboard.js`
  - `js/search.js`
- Eski `/routine.html` linkleri aktif HTML/JS/XML dosyalarından temizlendi.
- Hatalı `/collections/account/routines/` oluşumu kontrol edilip temizlendi.

## Not
Sandbox ortamında canlı browser görsel QA çalıştırılamadı; bu nedenle son piksel kontrolünü local Live Server veya Cloudflare preview üzerinde açıp gözle kontrol etmek gerekir. Kod tarafında route/link/syntax ve statik entegrasyon kontrolleri tamamlandı.
