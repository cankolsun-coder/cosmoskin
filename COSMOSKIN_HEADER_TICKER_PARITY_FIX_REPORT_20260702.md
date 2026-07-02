# COSMOSKIN Header Ticker Parity Fix — 2026-07-02

## Amaç
Anasayfadaki header üstü kayan yazı ile Hesabım ekranı açıkken görünen kayan yazı arasında oluşan font, spacing, yükseklik ve animasyon hızı farkını düzeltmek.

## Uygulanan düzeltmeler
- `account/profile.html` içinde `account-premium.css` cache versiyonu `20260702-ticker-parity` olarak güncellendi.
- `account/profile.html` header top offset değeri `38px` yerine `40px` yapıldı.
- `account/order-detail.html` header top offset değeri `38px` yerine `40px` yapıldı.
- `assets/account-premium.css` sonuna Hesabım sayfaları için homepage ticker parity override eklendi:
  - desktop yükseklik: `40px`
  - font family: homepage `--sans`
  - font size: `10px`
  - font weight: `500`
  - letter spacing: `.32em`
  - gap/padding/separator: homepage ile aynı
  - animasyon: homepage effective timing ile aynı `22s linear infinite`
- Mobile için mevcut 36px announcement düzeni korunarak font/letter spacing mobil uyumluluğu sağlandı.

## Kontrol edilen ek riskler
- `style="top:38px"` kalıntısı account profile ve order detail dosyalarında temizlendi.
- Header/footer yapısı yeniden tasarlanmadı.
- Announcement HTML metinleri değiştirilmedi.
- Ürün, checkout, PDP, account dashboard ve iade akışlarına dokunulmadı.

## Ek validation
Yeni script eklendi:

```bash
node scripts/validate-header-ticker-parity.mjs
```

Bu script account ticker parity guardrail kontrollerini yapar.

## Sonuç
Hesabım ekranındaki üst kayan yazı artık anasayfa ile aynı görsel sisteme ve aynı efektif animasyon hızına hizalandı.
