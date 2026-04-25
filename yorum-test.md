# COSMOSKIN — Yorum Sistemi Test Rehberi

## Genel Bakış

Bu doküman, yorum sisteminin doğru çalıştığını doğrulamak için kullanılacak test senaryolarını içerir.

---

## Ön Koşullar

1. Supabase'de `reviews.sql` çalıştırılmış olmalı
2. `review-images` bucket oluşturulmuş ve public erişime açık olmalı
3. Gerçek kullanıcı hesabı (admin hariç) oluşturulmuş olmalı
4. Test siparişi oluşturulmuş olmalı (bkz. `test-data.sql`)

---

## SENARYO 1 — Giriş yok → Yorum yazma butonu görünmez

**Adımlar:**
1. Tarayıcıda gizli sekme aç (oturum yok)
2. Herhangi bir ürün sayfasına git (örn: `/products/beauty-of-joseon-relief-sun-spf50.html`)
3. Yorumlar bölümüne kaydır

**Beklenen sonuç:**
- Yorum kartları görünür (onaylılar varsa)
- **"Yorum Yaz" butonu görünmez**
- Yorum formu açılmaz

**Doğrulama:**
```
reviewSection'da #rvWriteWrap → innerHTML: ""
```

---

## SENARYO 2 — Giriş yapıldı ama ürün satın alınmadı → Yorum yazma butonu görünmez

**Adımlar:**
1. Hesap oluştur veya giriş yap (admin olmayan bir hesap)
2. Sipariş geçmişinde bu ürün **olmayan** bir hesap kullan
3. Ürün sayfasını aç

**Beklenen sonuç:**
- Kullanıcı giriş yapmış görünür (header'da)
- **"Yorum Yaz" butonu yine görünmez**
- `check_purchase()` Supabase RPC → `false` döner

**Doğrulama (Supabase SQL):**
```sql
SELECT check_purchase('USER-UUID', 'beauty-of-joseon-relief-sun-spf50');
-- Sonuç: false
```

---

## SENARYO 3 — Satın alma var → Yorum yazılabilir

**Adımlar:**
1. Supabase'de test siparişi oluştur:
   ```sql
   INSERT INTO orders (user_id, status, total_try)
   VALUES ('GERCEK-USER-UUID', 'paid', 899);

   INSERT INTO order_items (order_id, product_slug, quantity, price_try)
   SELECT id, 'beauty-of-joseon-relief-sun-spf50', 1, 899
   FROM orders WHERE user_id = 'GERCEK-USER-UUID' ORDER BY created_at DESC LIMIT 1;
   ```
2. Bu kullanıcı olarak giriş yap
3. Ürün sayfasını aç

**Beklenen sonuç:**
- **"Yorum Yaz" butonu görünür**
- Butona tıklanınca modal açılır
- Puan seçilip yorum yazılabilir
- Görsel yüklenebilir (max 2MB, jpg/png/webp)

**Doğrulama:**
```
#rvWriteWrap → <button> "Yorum Yaz" görünür
```

---

## SENARYO 4 — Yorum gönderildi → Frontend'de görünmez (admin onayı bekler)

**Adımlar:**
1. Satın alma yapılmış kullanıcı olarak giriş yap
2. Ürün sayfasında "Yorum Yaz" butonuna tıkla
3. Puan seç, başlık ve yorum yaz
4. İsteğe bağlı görsel ekle
5. "Yorumu Gönder" butonuna tıkla

**Beklenen sonuç:**
- Başarı mesajı: "Yorumunuz incelemeye alındı"
- Modal kapanabilir
- **Yorum ürün sayfasında henüz görünmez** (approved=false)

**Doğrulama (Supabase SQL):**
```sql
SELECT id, product_slug, title, rating, approved, created_at
FROM reviews
WHERE product_slug = 'beauty-of-joseon-relief-sun-spf50'
ORDER BY created_at DESC
LIMIT 5;
-- approved: false
```

---

## SENARYO 5 — Admin onayı → Yorum görünür

**Adımlar:**
1. `/admin/admin-reviews.html` adresine git
2. `cankolsun@cosmoskin.com.tr` ile giriş yap
3. "Bekleyen Yorumlar" listesinde yorumu bul
4. **"Onayla"** butonuna tıkla

**Beklenen sonuç:**
- Yorum listeden kaldırılır (pending listesinden çıkar)
- "Onaylı Yorumlar" görünümüne geçince yorum burada görünür
- **Ürün sayfasını yenilediğinde yorum artık frontend'de görünür**

**Doğrulama (Supabase SQL):**
```sql
SELECT id, approved FROM reviews WHERE id = 'REVIEW-UUID';
-- approved: true
```

---

## SENARYO 6 — Admin reddet → Yorum silinir

**Adımlar:**
1. Admin panelinde bekleyen yorumu bul
2. **"Reddet & Sil"** butonuna tıkla
3. Onay dialogunu kabul et

**Beklenen sonuç:**
- Yorum ve görselleri kalıcı olarak silinir
- Storage'daki görseller de temizlenir
- Yorum hiçbir yerde görünmez

---

## SENARYO 7 — Görsel yükleme kuralları

**Geçerli:**
- `.jpg`, `.jpeg`, `.png`, `.webp`
- Max 2 MB
- Max 5 görsel

**Geçersiz (hata gösterilmeli):**
- `.gif`, `.pdf`, `.svg` → "Desteklenmiyor" hatası
- 2MB+ dosya → "Boyut sınırı" hatası
- 6. görsel → eklenmez

---

## SENARYO 8 — Rate limit koruması

**Adımlar:**
1. Bir yorum gönder
2. Hemen ardından tekrar "Yorumu Gönder"e tıkla

**Beklenen sonuç:**
- "Lütfen 30 saniye bekleyin" mesajı görünür

---

## SENARYO 9 — Yorum düzenleme

**Adımlar:**
1. Kendi yorumun olan ürün sayfasına git (onaylı yorum)
2. Kart altında "Düzenle" butonunu tıkla
3. Yorumu güncelle, gönder

**Beklenen sonuç:**
- Yorum kaydedilir
- `is_edited = true` olarak işaretlenir
- `approved = false` → admin tekrar onay vermeli
- Kart üzerinde "(Düzenlendi)" etiketi görünür

---

## SENARYO 10 — Live arama sistemi

**Adımlar:**
1. Herhangi bir sayfanın arama barına tıkla
2. "cosrx" yaz
3. "torriden serum" yaz
4. "vitamin c" yaz

**Beklenen sonuçlar:**
- Yazarken anında sonuçlar çıkar (debounce: 160ms)
- Ürün adı, marka, kategori eşleşmeleri gösterilir
- Sonuca tıklayınca doğru ürün sayfasına gider
- Eşleşen metin sarı ile vurgulanır
- Sonuç yoksa "Sonuç bulunamadı" mesajı görünür

---

## Performans & Güvenlik Notları

| Kural | Uygulama |
|-------|----------|
| XSS koruması | `esc()` fonksiyonu tüm user input'u sanitize eder |
| Rate limit | İstemci: 30 saniye; Supabase RLS server-side korur |
| Satın alma doğrulama | Server-side RPC (`check_purchase`) |
| Admin erişimi | E-posta kısıtlaması + Supabase policy |
| Görsel boyut | Max 2MB, Canvas ile sıkıştırma (WebP, 0.82 kalite) |
| SQL Injection | Supabase SDK parametreli sorgu kullanır |
| Görsel URL | Yalnızca `approved` görseller public_url ile sunulur |

---

## Supabase Kontrol Listesi

- [ ] `reviews.sql` çalıştırıldı
- [ ] `review-images` bucket oluşturuldu (public: true)
- [ ] Bucket MIME kısıtlaması: image/jpeg, image/png, image/webp
- [ ] Bucket max boyut: 2097152 (2MB)
- [ ] Admin hesabı Supabase Auth'da mevcut
- [ ] `check_purchase` RPC fonksiyonu test edildi
- [ ] RLS politikaları aktif
