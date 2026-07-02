# COSMOSKIN — Akıllı Rutin Veri Modeli + Supabase Sync Raporu

Tarih: 2026-07-02

## Kapsam

Bu çalışma yalnızca Akıllı Rutin verisinin anasayfa, public `/routine.html`, Supabase API ve `Hesabım` ekranı arasında tutarlı çalışması için yapıldı. Header/footer, checkout core, ürün grid, PDP redesign, SVG ikon sistemi ve tam UI redesign kapsam dışında bırakıldı.

## Bulunan ana problemler

1. Anasayfa Akıllı Rutin Seçimi yalnızca legacy localStorage anahtarlarına yazıyordu; girişli kullanıcıda Supabase kayıt akışı yoktu.
2. `saveRoutine()` giriş kontrolü yaptıktan sonra yine sadece localStorage kaydı oluşturuyordu.
3. Anasayfadan “rutini detaylı gör” akışı public routine yerine `/account/routines/` dashboard’una yönleniyordu.
4. Public routine merkezi ve anasayfa aynı payload modelini üretmiyordu.
5. `customer_skin_profiles` tablosu yeni rutin sistemi için gerekli `primary_goal`, `secondary_goals`, `budget_band`, `avoid_ingredients`, `preferred_texture`, `spf_habit`, `source_channel` alanlarını taşımıyordu.
6. `customer_routine_results` tablosu aktif rutin, rutin skoru, sabah/akşam/haftalık adımlar, profil snapshot ve kaynak kanalı gibi alanları ayrı kolonlarda taşımıyordu.
7. Hesabım > Rutinlerim paneli kayıtlı rutinlerde sabah/akşam adımlarını ve standart profil snapshot’ını göstermiyordu.
8. Giriş sonrası anonim draft’ın hesaba aktarılması için merkezi sync katmanı yoktu.

## Değiştirilen dosyalar

- `assets/routine-data-model.js` — Yeni ortak veri modeli helper’ı eklendi.
- `assets/js/smart-routine.js` — Anasayfa rutin seçimi standart draft/model üretir ve girişli kullanıcıda Supabase’e kaydeder.
- `assets/routines.js` — Public routine merkezi standart skin/routine payload üretir; giriş sonrası pending draft sync eder.
- `assets/account-dashboard.js` — Hesabım tarafı gerçek skin profile/routine result modelini okur ve fake veri yerine empty state gösterir.
- `assets/account-premium.css` — Rutin kartlarında taşmayı önleyen küçük, kapsam dışına çıkmayan layout güvenliği eklendi.
- `functions/api/account/skin-profile.js` — Skin profile API yeni standart alanları kabul eder ve `email` standardını korur.
- `functions/api/account/routine-results.js` — Routine result API yeni standart payload’ı normalize eder, aktif rutin mantığını destekler.
- `functions/api/account/summary.js` — Hesap özeti yeni skin profile alanlarını ve aktif rutin sıralamasını döndürür.
- `supabase/migrations/20260702_routine_data_sync.sql` — Backward-compatible tablo genişletme migration’ı eklendi.
- `index.html` — `skin-profile-store` ve `routine-data-model` scriptleri anasayfa rutin akışına eklendi.
- `routine.html` — `routine-data-model` scripti public rutin merkezine eklendi.
- `account/profile.html` — `routine-data-model` scripti hesabım sync akışına eklendi.

## Yeni veri modeli

### Skin Profile

Desteklenen standart alanlar:

- `skin_type`
- `sensitivity`
- `primary_goal`
- `secondary_goals`
- `routine_style`
- `budget_band`
- `avoid_ingredients`
- `preferred_texture`
- `spf_habit`
- `answers`
- `source_channel`
- `updated_at`

### Routine Result

Desteklenen standart alanlar:

- `routine_key`
- `routine_title`
- `routine_score`
- `routine_version`
- `skin_profile_snapshot`
- `morning_steps`
- `evening_steps`
- `weekly_steps`
- `recommended_products`
- `alternative_products`
- `conflict_warnings`
- `source_channel`
- `is_active`
- `updated_at`
- `result`

## Anonim kullanıcı akışı

1. Kullanıcı anasayfada Akıllı Rutin seçimi yapar.
2. `assets/routine-data-model.js` bu seçimi standart draft formatına çevirir.
3. Draft `cosmoskin_routine_draft_v2` anahtarıyla localStorage/sessionStorage içinde versiyonlu saklanır.
4. Kullanıcı “Rutini Kaydet” dediğinde oturum yoksa seçimler korunur ve giriş modalı açılır.
5. Giriş sonrası `Hesabım` veya public routine merkezi yüklendiğinde pending draft Supabase’e aktarılmaya çalışılır.
6. Aktarım başarılı olursa draft temizlenir.

## Girişli kullanıcı akışı

1. Kullanıcı anasayfa veya public routine merkezinde rutin oluşturur.
2. Skin profile önce `/api/account/skin-profile` endpointine kaydedilir.
3. Dönen `skin_profile.id`, routine result payload’a `skin_profile_id` olarak bağlanır.
4. Routine result `/api/account/routine-results` endpointine kaydedilir.
5. Yeni rutin `is_active=true` olur; önceki aktif rutinler pasife çekilir.
6. Hesabım ekranı `/api/account/summary` üzerinden en güncel aktif rutini gösterir.

## Supabase/API hizalaması

- `customer_email` alanı rutin kayıt akışında tekrar kullanılmadı; `email` standardı korundu.
- Yeni migration mevcut tabloları drop etmez.
- RLS/policy yapısı değiştirilmedi.
- Yeni kolonlar JSONB ve scalar alanlar olarak geriye uyumlu şekilde eklendi.
- `customer_routine_results.result` içinde eski payload korunurken yeni kolonlara normalize edilmiş veriler de yazılır.

## Hesabım ekranı

`Hesabım > Cilt Profilim` artık yeni alanları destekler:

- cilt tipi
- hassasiyet
- ana hedef
- ikincil hedefler
- rutin stili
- son güncelleme tarihi

`Hesabım > Akıllı Rutinim` artık kayıtlı rutin varsa şunları gösterir:

- rutin başlığı
- aktif rutin etiketi
- rutin skoru
- cilt tipi
- ana hedef
- hassasiyet
- sabah adımları
- akşam adımları
- haftalık adımlar varsa haftalık öneriler
- önerilen ürün görselleri
- son güncelleme tarihi

Veri yoksa fake bilgi gösterilmez; profesyonel empty state gösterilir.

## Çalıştırılan testler

```bash
node --check assets/account-dashboard.js
node --check assets/js/smart-routine.js
node --check assets/routines.js
node --check assets/routine-data-model.js
node --check functions/api/account/routine-results.js
node --check functions/api/account/skin-profile.js
node --check functions/api/account/summary.js
node --test tests/local-integration.test.mjs
```

Sonuç:

```text
tests 20
pass 20
fail 0
```

## Kalan riskler

1. Bu fazdaki yeni Supabase kolonları için `supabase/migrations/20260702_routine_data_sync.sql` production DB’ye uygulanmalı. Migration uygulanmadan yeni API payload’ı bazı kolonlarda hata alabilir.
2. Gerçek tarayıcı/Supabase oturumu ile login sonrası draft sync akışı ayrıca manuel QA’dan geçirilmelidir.
3. Bu faz UI redesign değildir; Akıllı Rutin Merkezi’nin premium görsel deneyimi hâlâ ayrı faz olarak ele alınmalıdır.
4. SVG ikon sistemi hâlâ eski PNG/icon kullanımından ayrıştırılmadı; sonraki ayrı fazda yapılmalıdır.
5. PDP ürün uyumu bu fazda yalnızca veri modeline hazır hale getirildi; PDP entegrasyonu ayrı fazda yapılmalıdır.

## Bir sonraki faz önerisi

Sıradaki faz: **Anasayfa Akıllı Rutin Seçimi + Akıllı Rutin Merkezi Premium UX Redesign**.

Bu fazda artık veri zemini hazır olduğu için:

- anasayfa kartları,
- public `/routine.html` wizard akışı,
- sonuç ekranı,
- rutin skoru,
- sabah/akşam/haftalık rutin haritası,
- alternatif ürün drawer’ı,
- premium mikro-kopyalar

daha güvenli şekilde tasarlanabilir.
