# COSMOSKIN Account Runtime Hotfix Report — 2026-07-01

## Tespit Edilen Hatalar

1. `/account/profile.html` üzerinde hesap verisi yüklendikten sonra `cleanSkinType is not defined` JavaScript hatası oluşuyordu. Bu hata `renderOverview()` içinde `skinMiniCard()` ve `routineSummary()` çağrılarında tanımsız yardımcı fonksiyon kullanılmasından kaynaklanıyordu.
2. Hesap sayfasındaki kayan duyuru barı anasayfadaki marquee davranışından farklıydı. Account scoped CSS içinde animation kapatılmış ve ilk duyuru metni gizlenmişti.
3. Header içindeki `Alışverişe Dön` butonu bazı viewport/CSS kombinasyonlarında ikon butonu gibi 42px daireye sıkıştırılıyordu; metin iki satıra düşüp bozuk görünüyordu.
4. Account overview içinde bazı alanlarda sabit/fake izlenimi veren fallback değerler vardı: üyelik tarihi için sabit 2026 tarihi, cilt rutininde sabit “Nem / Işıltı / Bariyer desteği”, “2 kayıtlı tercih” gibi gerçek profile dayanmayan metinler.
5. Transactional email şablonları yeni PNG dosyası değiştirilse bile aynı URL kullanıldığında Gmail/Brevo cache sebebiyle eski ikonları göstermeye devam edebilirdi.

## Yapılan Düzeltmeler

### Account JavaScript

- `assets/account-dashboard.js` içine güvenli label helperları eklendi:
  - `cleanSkinType()`
  - `cleanSensitivity()`
  - `cleanGoal()`
  - `profileGoalLabels()`
  - `profilePreferenceCount()`
- `cleanSkinType is not defined` hatası giderildi.
- Cilt profili yoksa artık sahte rutin/skin kartı gösterilmiyor; kullanıcı Akıllı Rutin veya Cilt Profilim CTA’larına yönlendiriliyor.
- Cilt profili varsa kartlar gerçek `skin_profile` DTO verilerinden besleniyor.
- `2 kayıtlı tercih` sabiti kaldırıldı; gerçek profil alanlarından hesaplanıyor.
- Sabit üyelik tarihi fallback’i kaldırıldı. Tarih yoksa “Üyelik bilgisi mevcut değil” gösteriliyor.
- Sipariş kartındaki sabit tarih fallback’i kaldırıldı.

### Account CSS / Header ve Duyuru Barı

- Header/footer görsel tasarımı değiştirilmedi.
- Sadece account sayfasında bozulan `Alışverişe Dön` butonu için scoped sizing düzeltmesi yapıldı.
- Account duyuru barının animation davranışı anasayfadaki marquee sistemiyle eşitlendi.
- Account error card görünümü daha okunabilir hale getirildi.

### Email PNG Cache Düzeltmesi

- Email status ikonları yeni URL versiyonlarına taşındı:
  - `status-check-v3.png`
  - `status-bank-v3.png`
  - `status-reminder-v3.png`
  - `status-cancel-v3.png`
  - `status-package-v3.png`
  - `status-truck-v3.png`
  - `status-delivered-v3.png`
- Product email image override URL’i `beauty-of-joseon-relief-sun-spf50-email-v4.png` olarak güncellendi.
- `functions/api/_lib/order-email.js` ve `email-previews/*.html` yeni dosya adlarına geçirildi.
- Not: Eski gönderilmiş mailler Gmail cache yüzünden değişmez; sadece yeni gönderilen mailler yeni URL’lerle gelir.

## Değişen Dosyalar

- `assets/account-dashboard.js`
- `assets/account-premium.css`
- `account/profile.html`
- `functions/api/_lib/order-email.js`
- `email-previews/*.html`
- `assets/img/email/status-*-v3.png`
- `assets/img/email/products/beauty-of-joseon-relief-sun-spf50-email-v4.png`

## Testler

- `node --check assets/account-dashboard.js` geçti.
- `node --check functions/api/_lib/order-email.js` geçti.
- `assets/account-premium.css` brace balance kontrolü geçti.
- Static server üzerinde `/account/profile.html` HTTP 200 döndü.
- Email template referanslarında eski `status-*-v2.png` ve product `email-v3.png` referansları temizlendi.

## Header / Footer Koruma Onayı

- Header görsel tasarımı değiştirildi mi? Hayır.
- Footer görsel tasarımı değiştirildi mi? Hayır.
- Değişiklik sadece account sayfasında bozuk görünen header CTA sizing ve duyuru barı çalışma tutarlılığıyla sınırlıdır.
- Header/footer kolon mimarisi, logo, renk, spacing, nav yapısı ve footer içerik düzeni değiştirilmedi.
