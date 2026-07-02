# COSMOSKIN Return Attachment + Success UX Hotfix — 2026-07-02

## Amaç
Müşteri iade talebi oluştururken yüklenen görsellerin admin ekranında görünmemesi ve başarılı iade sonrası formun açık kalması sorunları düzeltildi.

## Bulgular
- Müşteri dosyaları `return-attachments` private bucket içine yükleniyordu.
- Admin API `return_request_attachments` kayıtlarını döndürüyordu ancak private bucket için signed URL üretmiyordu. Bu yüzden admin UI’da görsel preview oluşmuyordu.
- Başarılı iade sonrası form kapatılmaya çalışıyordu; ancak URL’de `?createReturn=1` parametresi kaldığında form yeniden açık render edilebiliyordu.
- Müşteri iade listesi talebi gösteriyordu fakat detay açılımı yeterince bilgi vermiyordu.

## Uygulanan düzeltmeler
- `functions/api/_lib/supabase.js` içine `createSignedStorageUrl` helper eklendi.
- `functions/api/admin/returns.js` admin iade ekleri için 1 saatlik signed preview URL üretir hale getirildi.
- `assets/admin-returns.js` görsel ekleri thumbnail olarak, video ekleri bağlantı olarak gösterecek şekilde güncellendi.
- `assets/account-dashboard.js` başarılı iade sonrası `createReturn` URL parametresini temizliyor, formu kapatıyor ve başarı mesajı gösteriyor.
- Müşteri iade kartına detay açılımı eklendi.
- Admin attachment preview ve müşteri iade detayları için CSS eklendi.
- Yeni validation script eklendi: `scripts/validate-return-attachment-success-hotfix.mjs`.

## Not
Admin görsel önizlemesi için `return-attachments` bucket dosyalarının gerçekten upload edilmiş olması gerekir. Daha önce eski standalone `/account/returns.html` akışıyla oluşturulmuş ve `pending-upload/...` path’i taşıyan kayıtların gerçek dosyası olmayabilir; yeni Hesabım iade formu gerçek Storage upload yapar.
