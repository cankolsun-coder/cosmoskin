# COSMOSKIN Return Attachment Persistence Hotfix — 2026-07-03

## Problem
Müşteri iade talebi oluştururken dosya seçmesine rağmen Hesabım > İade Taleplerim ve Admin > İade Talepleri ekranında `Ek dosya yok` görünüyordu.

## Kök neden
`/api/returns` ana `return_requests` kaydını oluşturduktan sonra `return_request_items` ve `return_request_attachments` child insert hatalarını `.catch(()=>null)` ile sessizce yutuyordu. Production Supabase'te migration/kolon/RLS/policy eksik olduğunda ana talep başarılı görünüyor, fakat ürün ve ek dosya kayıtları oluşmuyordu.

## Uygulanan düzeltmeler
- `functions/api/returns.js`: ürün ve attachment insertleri artık sessizce yutulmuyor; hata varsa API hata döndürüyor.
- `assets/account-dashboard.js`: ürün detayları için `requested_items` fallback eklendi; attachment beklenip kaydedilemezse anlaşılır uyarı gösteriliyor.
- `assets/admin-returns.js`: admin iade kartlarında `requested_items` fallback eklendi; attachment persistence sorunu varsa teknik uyarı gösteriliyor.
- `scripts/validate-return-attachment-persistence.mjs`: child insert hatalarının yeniden sessizce yutulmasını engelleyen validation script eklendi.

## Mevcut eski kayıtlar
Bu hotfix geçmişte child attachment kaydı oluşmamış eski iade taleplerindeki görseli otomatik geri getiremez. Storage'daki dosya path'i biliniyorsa `return_request_attachments` tablosuna manuel kayıt girilebilir; aksi halde müşteri yeni talep/ek dosya ile tekrar test etmelidir.
