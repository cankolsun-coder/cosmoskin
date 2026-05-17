# COSMOSKIN — Profile Supabase + Skin Profile Sync Fix

**Tarih:** 2026-05-16
**Kapsam:** Profilim ekranı Supabase yükleme hatası + Cilt Profilim state senkronizasyonu

---

## Root Causes & Fixes

### 1. `account/profile.html` `/assets/site-config.js` yüklemiyordu
**Sebep:** Script blokunda Supabase CDN ve `account-dashboard.js` vardı, ama `window.COSMOSKIN_CONFIG`'i tanımlayan `site-config.js` eklenmemişti. Sonuç: dashboard `cfg.supabaseUrl` undefined görüp `"Supabase ayarları eksik."` ile hata ekranına düşüyordu.

**Fix:** [account/profile.html:314](account/profile.html)
```html
<script src="/assets/site-config.js?v=20260418a"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/assets/account-dashboard.js?v=20260516-skin-profile-sync"></script>
```
Sırayı `site-config → Supabase CDN → account-dashboard` olarak kuruldu.

### 2. `account-dashboard.js` `cfg` değerini modül yüklenir yüklenmez okuyordu
**Sebep:** `var cfg = window.COSMOSKIN_CONFIG || {};` modül en üstte (satır 4) sync olarak değerlendiriliyordu. Eğer site-config tag'i bu scriptten sonra yüklenirse `cfg` ebediyen `{}` kalıyor, init'te de hata.

**Fix:** [assets/account-dashboard.js:4-5, 860](assets/account-dashboard.js)
```js
function readConfig() { return window.COSMOSKIN_CONFIG || {}; }
var cfg = readConfig();
// init() içinde de yeniden okunuyor:
cfg = readConfig();
if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Hesap yüklenemedi: site-config.js eksik veya geç yüklendi.');
if (!window.supabase?.createClient) throw new Error('Hesap yüklenemedi: Supabase istemcisi bulunamadı.');
```
Hatalar artık ayrışmış: hangi koşulun eksik olduğunu söylüyor (config mi yoksa Supabase SDK'sı mı). Mevcut hata UI'sı (`<div class="cs-loading-card is-error">`) bu mesajları gösterir.

### 3. `saveSkin()` canonical localStorage'a yazmıyordu
**Sebep:** `saveSkin()` yalnızca `state.client.auth.updateUser({ data: payload })` çağırıyordu. `cosmoskin_skin_profile` localStorage'ı güncellenmiyor, dolayısıyla `/account/routines/`, `/account/routine-profile/` ve `/account/profile.html` üst widget'ı senkron olmuyordu.

**Fix:** [assets/account-dashboard.js:684-712](assets/account-dashboard.js)
- `saveSkin()` artık Supabase update sonrası `syncCanonicalSkinProfile(payload)` çağırıyor.
- Yeni helper `syncCanonicalSkinProfile(source)`:
  - `payload.skin_type / skin_sensitivity / routine_goal / skin_concerns / routine_style` → canonical shape `{skinType, sensitivity, primaryGoal, secondaryGoal, routineStyle, updatedAt}`'a maple ediyor.
  - `window.CosmoskinSkinProfile.save()` varsa onu kullanıyor (store içindeki `cosmoskin:skin-profile-change` event'ini de tetikliyor).
  - Yoksa fallback olarak direkt `localStorage.setItem('cosmoskin_skin_profile', …)` + manuel event dispatch.
- `loadSummary()` (init load veya save sonrası refresh) sonunda da `syncCanonicalSkinProfile(state.summary.user)` çağrılıyor → Supabase'den gelen veri canonical key'e iniyor. Böylece login'den sonra ilk yüklemede de widget hazır.

### 4. `functions/api/account/summary.js` `skin_sensitivity` döndürmüyordu
**Sebep:** Endpoint `meta.skin_type`, `skin_concerns`, `routine_goal` döndürüyordu ama `skin_sensitivity` `meta`'da olsa bile response'a eklenmemişti. Sonuç: server'a save edilen sensitivity, sonraki page-load'da kaybolmuş gibi görünüyordu (form `value=""` ile yükleniyordu).

**Fix:** [functions/api/account/summary.js:152-154](functions/api/account/summary.js)
```js
skin_type: meta.skin_type || '',
skin_sensitivity: meta.skin_sensitivity || '',
skin_concerns: Array.isArray(meta.skin_concerns) ? meta.skin_concerns : [],
routine_goal: meta.routine_goal || '',
routine_style: meta.routine_style || meta.routine_intensity || '',
```
Bonus: `routine_style` da eklendi (routines.js intensity ile aynı semantic).

### 5. CLAUDE.md → wrangler notu
Yerel statik server (`python3 -m http.server`) `/api/*` endpoint'lerine hizmet vermez. Cloudflare Pages Functions için `npx wrangler pages dev .` gerekli. Bu CLAUDE.md'ye eklendi.

---

## State Flow — Tek Source of Truth

```
                ┌─────────────────────────────────────┐
                │  Supabase user_metadata             │
                │  (skin_type, skin_sensitivity,      │
                │   skin_concerns, routine_goal,      │
                │   routine_style)                    │
                └──────────────┬──────────────────────┘
                               │ saveSkin() / loadSummary()
                               ▼
                ┌─────────────────────────────────────┐
                │  syncCanonicalSkinProfile(source)   │
                │  in account-dashboard.js            │
                └──────────────┬──────────────────────┘
                               │ projection to canonical shape
                               ▼
                ┌─────────────────────────────────────┐
                │  localStorage: cosmoskin_skin_profile│
                │  { skinType, sensitivity,           │
                │    primaryGoal, secondaryGoal,      │
                │    routineStyle, updatedAt }        │
                └──────────────┬──────────────────────┘
                               │ store.subscribe / event
                               ▼
                ┌──────────────┬──────────────────────┐
                ▼              ▼                       ▼
   account/profile.html  routines.js               (future consumers)
   widget üst kart        view=profile form
   (data-skin-profile-    /account/routines/
    widget)               /account/routine-profile/
```

Üç farklı consumer aynı canonical key'i okuyor. Save'ten sonra:
1. Supabase server'a yazıldı
2. Canonical localStorage yazıldı
3. `cosmoskin:skin-profile-change` event dispatch edildi
4. Profile widget kendini yeniledi (`subscribe()` callback)
5. Diğer sekmelerdeki sayfalar da `storage` event ile yenilendi

---

## Değiştirilen Dosyalar
- [account/profile.html](account/profile.html) — site-config.js eklendi, account-dashboard.js cache version bump
- [assets/account-dashboard.js](assets/account-dashboard.js) — `readConfig()` lazy lookup, `syncCanonicalSkinProfile()` helper, `saveSkin()` + `loadSummary()` canonical-key sync
- [functions/api/account/summary.js](functions/api/account/summary.js) — `skin_sensitivity` + `routine_style` response'ta
- [CLAUDE.md](CLAUDE.md) — wrangler pages dev notu + script load order kuralı

## Eklenen Dosyalar
- [COSMOSKIN_SUPABASE_SKIN_PROFILE_FIX_20260516.md](COSMOSKIN_SUPABASE_SKIN_PROFILE_FIX_20260516.md) — bu rapor

---

## QA Sonuçları

| Kontrol | Durum |
|---------|-------|
| `account-dashboard.js` JS balance | ✓ 0/0/0 |
| `skin-profile-store.js` JS balance | ✓ 0/0/0 |
| `routines.js` JS balance | ✓ 0/0/0 |
| `functions/api/account/summary.js` JS balance | ✓ 0/0/0 |
| profile.html script order (site-config → supabase → dashboard) | ✓ 314-316 |
| `saveSkin()` → `syncCanonicalSkinProfile(payload)` | ✓ |
| `loadSummary()` sonu → `syncCanonicalSkinProfile(state.summary.user)` | ✓ |
| `summary.js` response → `skin_sensitivity` döner | ✓ |
| `readConfig()` lazy lookup | ✓ (lines 4, 860) |
| Ayrı/açık hata mesajları (config eksik vs Supabase SDK eksik) | ✓ |

---

## Manuel Test Adımları

**Önemli:** Profile sayfası `/api/account/summary` Cloudflare Function'ına ihtiyaç duyar. Statik server YETMEZ.

### Yerel test (full account flow)
```bash
cd /Users/can/Documents/GitHub/cosmoskin
npx wrangler pages dev . --compatibility-date=2024-06-01
# wrangler default port 8788; siteler http://localhost:8788
```

### Yerel test (sadece statik UI, /api yoksa "yüklenemedi" hatası beklenir)
```bash
cd /Users/can/Documents/GitHub/cosmoskin
python3 -m http.server 7700
# http://localhost:7700 — login flow ve /account/profile.html /api hatası gösterir; bu beklenen.
```

### Test akışı (wrangler ile, login'li)
1. `http://localhost:8788/account/profile.html` aç → "Cilt Profilim" tabına git.
2. Cilt Tipi: **Kuru**, Hassasiyet: **Orta**, Hedef: **Nem**, bir concern işaretle.
3. "Kaydet"e tıkla → "Cilt profiliniz güncellendi." toast'u görmeli.
4. DevTools Console:
   ```js
   JSON.parse(localStorage.getItem('cosmoskin_skin_profile'))
   // → { skinType:'kuru', sensitivity:'orta', primaryGoal:'nem', ..., updatedAt:'2026-05-16T...' }
   ```
5. Sayfayı refresh et (`Cmd+R`).
6. Form alanlarının seçili kaldığını doğrula (özellikle "Hassasiyet"in `Orta` olduğunu — bu summary.js fix'ini test ediyor).
7. Profilim sayfasının üst kısmındaki "CİLT PROFİLİM" widget'ı "Kuru cilt · Orta hassasiyet · ..." göstermeli.
8. Yeni sekme aç → `http://localhost:8788/account/routines/?view=profile` → aynı seçimlerin form'da yüklü olduğunu doğrula.
9. Routines profilinde değer değiştir, kaydet → ana sekmeye dön; widget canlı güncellenmeli (storage event).

### Hata senaryosu testi
1. `account/profile.html`'i editle, `<script src="/assets/site-config.js?v=20260418a"></script>` satırını sil → refresh.
2. Hata kartında **"Hesap yüklenemedi: site-config.js eksik veya geç yüklendi."** mesajı görünmeli — eski generic "Supabase ayarları eksik" değil.
3. Satırı geri ekle, refresh, normal yüklensin.

---

## Tek Source of Truth — Doğrulama

| Yer | Okur (key) | Yazar (key) |
|-----|------------|-------------|
| Supabase `user_metadata` | server (`functions/api/account/summary.js`) | `account-dashboard.js` `state.client.auth.updateUser()` |
| `cosmoskin_skin_profile` localStorage | `CosmoskinSkinProfile.get()`, `routines.js getRoutinePreferences()`, profile widget inline script | `CosmoskinSkinProfile.save()`, `account-dashboard.js syncCanonicalSkinProfile()`, `routines.js saveRoutinePreferences()` |
| Legacy keys (`cosmoskin_routine_active`, `cosmoskin_routine_profile`, ...) | sadece migration (read-only first-load) | `routines.js`, `smart-routine.js` (backward compat, store legacy modülleri bozmamak için bunları silmez) |

Canonical key her save'de yazılıyor, her okuma noktasında öncelikli kaynak. Legacy keys cleanup yapılmadı çünkü mobile-redesign.js + smart-routine.js + home-routine.js hâlâ onları kullanıyor; migration ile her zaman canonical'a düşürüyoruz.

---

## Caveat
- Tarayıcı görsel doğrulaması yapılamadı — preview MCP bu makinedeki sandbox'tan dolayı dizine erişemiyor (`getcwd: Operation not permitted`). Yukarıdaki manuel test adımlarını çalıştırmak gerekli.
- Yukarıdaki adımlar `wrangler pages dev` kullanılırsa tam senaryo çalışır. Statik server'da `/api/account/summary` 404 verir ama bu beklenen.

**Verdict:** ACCEPT — bildirilen 8 root cause / fix item'ın hepsi adreslendi, statik doğrulama clean.
