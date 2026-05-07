# COSMOSKIN — Mobil Beyaz Ekran / FAQ Regresyon Düzeltmesi

## Kök neden
Mobil redesign aktif olduğunda `body.cm-mobile-active` sınıfı ekleniyordu. CSS tarafındaki şu kural yeni mobil root kapsayıcısını da gizliyordu:

```css
body.cm-mobile-active main > :not(.cm-mobile-page){ display:none !important; }
```

`mobile-redesign.js` yeni arayüzü `<main>` içine `#cm-mobile-redesign-root` olarak ekliyor; gerçek `.cm-mobile-page` bu root'un içinde kalıyor. Bu yüzden CSS `#cm-mobile-redesign-root` elementini gizliyor, ana içerik beyaz ekrana düşüyor ve `main` dışındaki FAQ bölümü görünür kalıyordu.

## Yapılan düzeltme
- Mobilde artık yalnızca `main` içindeki `#cm-mobile-redesign-root` dışındaki eski desktop/mobile içerikler gizleniyor.
- `#cm-mobile-redesign-root` ve içindeki `.cm-mobile-page` explicit olarak görünür bırakıldı.
- `index.html` içinde `main` dışında duran FAQ bölümü mobil redesign aktifken gizlenecek şekilde güvenli CSS kuralı eklendi.
- Desktop davranışı etkilenmedi; kurallar yalnızca `@media (max-width: 768px)` ve `body.cm-mobile-active` altında çalışıyor.

## Değiştirilen dosya
- `assets/mobile-redesign.css`

## Kontrol
- `node --check assets/mobile-redesign.js` başarılı.
- `node --check assets/mobile.js` başarılı.
- İzole Playwright render testinde mobil root görünür, FAQ gizli ve desktop header gizli doğrulandı.
