# COSMOSKIN Brevo Segment Setup

Bu faz ile ödeme sonrası müşteri verisi Brevo tarafına otomatik senkronize edilir.

## Zorunlu env
- `BREVO_API_KEY`
- `CONTACT_FROM_EMAIL`

## İsteğe bağlı liste env'leri
- `BREVO_LIST_CUSTOMERS_ID`
- `BREVO_LIST_ROUTINE_ID`
- `BREVO_LIST_REORDER_ID`
- `BREVO_LIST_HIGH_VALUE_ID`
- `BREVO_LIST_CLEANSE_ID`
- `BREVO_LIST_HYDRATE_ID`
- `BREVO_LIST_CARE_ID`
- `BREVO_LIST_TREAT_ID`
- `BREVO_LIST_PROTECT_ID`

## Otomatik segment mantığı
- Her ödenmiş sipariş -> `customer`
- 2.500 TL+ -> `high_value`
- 3+ kalem -> `bundle_buyer`
- Kategoriye göre -> `category_cleanse`, `category_hydrate`, `category_care`, `category_treat`, `category_protect`
- Hesap tercihine göre -> `routine_optin`, `reorder_optin`
- Cilt tipine göre -> `skin_dry`, `skin_oily`, vb.

## Manuel test
Hesap > İletişim Tercihlerim > `Şimdi Senkronize Et`

## Brevo contact attributes
Kod aşağıdaki attribute adlarını günceller:
- `CS_LAST_ORDER_NUMBER`
- `CS_LAST_ORDER_DATE`
- `CS_LAST_ORDER_TOTAL`
- `CS_TOTAL_ORDERS`
- `CS_SKIN_TYPE`
- `CS_SKIN_CONCERNS`
- `CS_SEGMENTS`
- `CS_CATEGORIES`
- `CS_ROUTINE_OPTIN`
- `CS_REORDER_OPTIN`

Bu attribute'ların Brevo hesabında önceden oluşturulması tavsiye edilir.
