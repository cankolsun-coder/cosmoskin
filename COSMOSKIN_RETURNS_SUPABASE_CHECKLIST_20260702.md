# COSMOSKIN Returns Supabase Checklist — 20260702

Bu checklist production Supabase ortamında manuel doğrulanmalıdır. Bu paket production DB üzerinde işlem yapmaz.

## 1. Çalıştırılması gereken migration

- `supabase/migrations/20260702_customer_returns_account_pdp_polish.sql`

Bu migration geriye uyumlu olacak şekilde hazırlanmıştır; tablo drop etmez. Production üzerinde çalıştırmadan önce mevcut DB yedeği alınmalıdır.

## 2. Beklenen tablolar

Aşağıdaki tablolar production Supabase'te bulunmalıdır:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'return_requests',
    'return_request_items',
    'return_request_attachments',
    'return_status_events',
    'refund_records',
    'return_shipping_settings',
    'orders',
    'order_items',
    'order_status_events',
    'notification_preferences',
    'profiles'
  )
order by table_name;
```

## 3. Return kolon kontrolü

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('return_requests','return_request_items','return_request_attachments','return_status_events')
order by table_name, ordinal_position;
```

Özellikle şu alanlar kontrol edilmelidir:

- `return_requests.return_number`
- `return_requests.return_window_ends_at`
- `return_requests.hygiene_confirmed`
- `return_requests.unused_confirmed`
- `return_requests.seal_intact_confirmed`
- `return_requests.resaleable_confirmed`
- `return_requests.return_code_shared_at`
- `return_request_items.reason`
- `return_request_attachments.file_path`
- `return_status_events.new_status`

## 4. Notification preferences fix

COSMOSKIN Journal hatası için şu kolonlar bulunmalıdır:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notification_preferences'
  and column_name in ('campaign_emails','stock_notifications','routine_reminders','newsletter','sms_notifications')
order by column_name;
```

`campaign_emails` yoksa Hesabım > Bildirim Tercihlerim alanında schema cache hatası dönebilir.

## 5. Doğum tarihi alanı

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('birthday','birth_date_locked')
order by column_name;
```

Kullanıcı ilk kez doğum tarihi ekleyebilmelidir. Bu paket kullanıcı daha önce doğum tarihi girmiş olsa bile profil tarafında güvenli düzeltme/düzenleme akışını açar.

## 6. Storage bucket

Supabase Storage tarafında manuel olarak bucket oluşturulmalıdır:

- Bucket adı: `return-attachments`
- Öneri: public bucket yapılmamalı; signed URL veya servis endpoint ile okunmalı.
- Müşteri yalnızca kendi iade talebine dosya yükleyebilmeli.
- Admin tüm iade eklerini görebilmeli.

Desteklenen dosyalar:

- JPG/JPEG
- PNG
- WEBP
- MP4

SVG, PDF, ZIP, EXE kabul edilmemelidir.

## 7. DHL iade kodu

DHL sabit iade kodu HTML/JS/e-posta içine hard-code edilmemelidir. Kod admin ayarı olarak girilmelidir:

```sql
select carrier, return_code, is_active, instructions
from public.return_shipping_settings
where is_active = true
order by updated_at desc;
```

İlk aşamada iade kodu admin onayı sonrası paylaşılmalıdır.

## 8. Production smoke test

Migration ve bucket sonrası yapılacaklar:

1. Teslim edilmiş ve 14 gün içinde olan test siparişiyle iade talebi oluştur.
2. Hasarlı/yanlış/eksik ürün seçeneğinde dosya zorunluluğunu test et.
3. Vazgeçtim senaryosunda hijyen/ambalaj onaylarının zorunlu olduğunu test et.
4. Admin iade panelinde ürünler, açıklama ve eklerin göründüğünü doğrula.
5. Admin onay/red statü değişimlerini test et.
6. Müşteri hesabında status mapping'in teknik statü yerine müşteri dostu metin gösterdiğini doğrula.
7. Müşteri ve `destek@cosmoskin.com.tr` e-postalarını kontrol et.
