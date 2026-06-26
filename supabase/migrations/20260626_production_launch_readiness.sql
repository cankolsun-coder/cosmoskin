-- COSMOSKIN production launch readiness bridge migration
-- Date: 2026-06-26
-- Purpose: add missing durable customer, legal, loyalty, admin audit and provider-ready tables/columns.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text,
  last_name text,
  phone text,
  birthday date,
  account_status text not null default 'active',
  marketing_email_opt_in boolean not null default false,
  newsletter_opt_in boolean not null default false,
  stock_alert_opt_in boolean not null default false,
  routine_reminder_opt_in boolean not null default false,
  fraud_flags jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  newsletter_opt_in boolean not null default false,
  marketing_email_opt_in boolean not null default false,
  stock_alert_opt_in boolean not null default false,
  routine_reminder_opt_in boolean not null default false,
  birthday_benefit_opt_in boolean not null default false,
  preferred_language text not null default 'tr',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_preferences_identity check (user_id is not null or email is not null)
);

-- Repair columns when this idempotent bridge migration is re-run against a partially-created/existing table.
alter table public.customer_preferences add column if not exists email text;
alter table public.customer_preferences add column if not exists newsletter_opt_in boolean not null default false;
alter table public.customer_preferences add column if not exists marketing_email_opt_in boolean not null default false;
alter table public.customer_preferences add column if not exists stock_alert_opt_in boolean not null default false;
alter table public.customer_preferences add column if not exists routine_reminder_opt_in boolean not null default false;
alter table public.customer_preferences add column if not exists birthday_benefit_opt_in boolean not null default false;
alter table public.customer_preferences add column if not exists preferred_language text not null default 'tr';
alter table public.customer_preferences add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.customer_preferences add column if not exists created_at timestamptz not null default now();
alter table public.customer_preferences add column if not exists updated_at timestamptz not null default now();

create unique index if not exists customer_preferences_user_unique on public.customer_preferences(user_id) where user_id is not null;
create unique index if not exists customer_preferences_email_unique on public.customer_preferences(lower(email)) where email is not null;

create table if not exists public.customer_skin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  skin_type text,
  sensitivity text,
  concerns text[] not null default '{}'::text[],
  routine_goal text,
  routine_style text,
  answers jsonb not null default '{}'::jsonb,
  source text not null default 'account',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_skin_profiles_identity check (user_id is not null or email is not null)
);

create index if not exists customer_skin_profiles_user_created_idx on public.customer_skin_profiles(user_id, created_at desc);

create table if not exists public.customer_routine_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  skin_profile_id uuid references public.customer_skin_profiles(id) on delete set null,
  routine_key text,
  routine_title text,
  result jsonb not null default '{}'::jsonb,
  recommended_products jsonb not null default '[]'::jsonb,
  points_awarded boolean not null default false,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_routine_results_identity check (user_id is not null or email is not null)
);

create index if not exists customer_routine_results_user_completed_idx on public.customer_routine_results(user_id, completed_at desc);

create table if not exists public.membership_levels (
  code text primary key,
  name text not null,
  spend_threshold_12m numeric(12,2) not null default 0,
  order_threshold_12m integer not null default 0,
  benefits_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.membership_levels (code, name, spend_threshold_12m, order_threshold_12m, benefits_json, sort_order, is_active)
values
  ('essential', 'Essential', 0, 0, '{"positioning":"Başlangıç seviyesi","benefits":["COSMOSKIN Club erişimi","Seçili kampanya duyuruları"]}'::jsonb, 10, true),
  ('signature', 'Signature', 6000, 3, '{"positioning":"Aktif bakım müşterisi","benefits":["Seviye ilerleme avantajları","Özel kupon dönemleri"]}'::jsonb, 20, true),
  ('elite', 'Elite', 15000, 8, '{"positioning":"En yüksek sadakat seviyesi","benefits":["Öncelikli kampanyalar","Özel sürpriz avantajlar"]}'::jsonb, 30, true)
on conflict (code) do update set
  name = excluded.name,
  spend_threshold_12m = excluded.spend_threshold_12m,
  order_threshold_12m = excluded.order_threshold_12m,
  benefits_json = excluded.benefits_json,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists public.customer_membership_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level_code text not null default 'essential' references public.membership_levels(code),
  rolling_spend_12m numeric(12,2) not null default 0,
  completed_orders_12m integer not null default 0,
  points_balance integer not null default 0,
  next_level_code text references public.membership_levels(code),
  amount_to_next_level numeric(12,2) not null default 0,
  orders_to_next_level integer not null default 0,
  calculated_at timestamptz,
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_membership_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  old_level text,
  new_level text not null,
  reason text,
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.loyalty_point_rules (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  event_type text not null,
  points integer not null default 0,
  rate_per_try numeric(12,4),
  max_per_user integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loyalty_point_rules (code, name, event_type, points, rate_per_try, max_per_user, metadata)
values
  ('purchase_try_1_per_tl', '1 TL alışveriş = 1 puan', 'purchase', 0, 1, null, '{"basis":"eligible_paid_order_total"}'::jsonb),
  ('signup_250', 'İlk üyelik puanı', 'signup', 250, null, 1, '{}'::jsonb),
  ('first_order_500', 'İlk sipariş puanı', 'first_order', 500, null, 1, '{}'::jsonb),
  ('review_150', 'Ürün yorumu puanı', 'review', 150, null, null, '{}'::jsonb),
  ('photo_review_300', 'Fotoğraflı yorum puanı', 'photo_review', 300, null, null, '{}'::jsonb),
  ('routine_quiz_200', 'Akıllı rutin tamamlanma puanı', 'routine_quiz', 200, null, 1, '{"period":"lifetime_mvp"}'::jsonb),
  ('birthday_500', 'Doğum günü puanı', 'birthday', 500, null, 1, '{"period":"year"}'::jsonb),
  ('newsletter_250', 'Newsletter kayıt puanı', 'newsletter_signup', 250, null, 1, '{"requires_explicit_newsletter_consent":true}'::jsonb)
on conflict (code) do update set name = excluded.name, event_type = excluded.event_type, points = excluded.points, rate_per_try = excluded.rate_per_try, max_per_user = excluded.max_per_user, metadata = excluded.metadata, updated_at = now();

create table if not exists public.loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  event_type text not null,
  points_delta integer not null,
  balance_after integer,
  order_id uuid,
  review_id uuid,
  routine_result_id uuid references public.customer_routine_results(id) on delete set null,
  coupon_id uuid,
  expires_at timestamptz,
  reversal_of uuid references public.loyalty_points_ledger(id) on delete set null,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loyalty_points_identity check (user_id is not null or email is not null)
);

create index if not exists loyalty_points_ledger_user_created_idx on public.loyalty_points_ledger(user_id, created_at desc);
create index if not exists loyalty_points_ledger_order_idx on public.loyalty_points_ledger(order_id);

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  points_spent integer not null,
  benefit_type text not null,
  coupon_id uuid,
  order_id uuid,
  status text not null default 'issued',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_redemptions_identity check (user_id is not null or email is not null)
);

create table if not exists public.customer_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  coupon_id uuid,
  code text not null,
  source text not null default 'manual',
  status text not null default 'available',
  min_subtotal numeric(12,2) not null default 0,
  discount_type text not null default 'fixed',
  discount_value numeric(12,2) not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  order_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_coupons_identity check (user_id is not null or email is not null)
);

create index if not exists customer_coupons_user_status_idx on public.customer_coupons(user_id, status, expires_at);
create unique index if not exists customer_coupons_code_unique on public.customer_coupons(code);

create table if not exists public.birthday_benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  benefit_year integer not null,
  points_awarded integer not null default 0,
  coupon_id uuid,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'issued',
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id, benefit_year)
);

create table if not exists public.campaign_eligibility_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  campaign_code text not null,
  eligible boolean not null default false,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_roles (
  code text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.admin_roles (code, name, description)
values
  ('owner', 'Owner', 'Tüm yetkiler'),
  ('operations', 'Operations', 'Sipariş, kargo, iade operasyonları'),
  ('warehouse', 'Warehouse', 'Stok ve sevkiyat işlemleri'),
  ('customer_support', 'Customer Support', 'Müşteri destek ve iade görüntüleme'),
  ('content_editor', 'Content Editor', 'İçerik ve ürün yönetimi'),
  ('accountant', 'Accountant', 'Fatura ve muhasebe görüntüleme')
on conflict (code) do update set name = excluded.name, description = excluded.description;

create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  role_code text references public.admin_roles(code) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  unique(role_code, permission)
);

insert into public.admin_permissions (role_code, permission)
select role_code, permission from (values
  ('owner','*'),
  ('operations','orders:read'),('operations','orders:update'),('operations','payments:confirm_bank_transfer'),('operations','shipments:create'),('operations','returns:update'),('operations','refunds:update'),('operations','coupons:issue'),('operations','loyalty:adjust'),('operations','invoices:update'),
  ('warehouse','orders:read'),('warehouse','inventory:read'),('warehouse','inventory:adjust'),('warehouse','shipments:create'),
  ('customer_support','orders:read'),('customer_support','customers:read'),('customer_support','returns:update'),('customer_support','coupons:issue'),
  ('content_editor','products:update'),('content_editor','legal:publish'),
  ('accountant','orders:read'),('accountant','invoices:read'),('accountant','invoices:update')
) as seed(role_code, permission)
on conflict (role_code, permission) do nothing;

alter table if exists public.admin_users add column if not exists role_code text references public.admin_roles(code);
alter table if exists public.admin_users add column if not exists permissions text[] not null default '{}'::text[];
alter table if exists public.admin_users add column if not exists is_active boolean not null default true;
alter table if exists public.admin_users add column if not exists last_seen_at timestamptz;

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  role_code text,
  action text not null,
  resource_type text,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_logs_resource_idx on public.admin_activity_logs(resource_type, resource_id, created_at desc);

create table if not exists public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_key text not null,
  title text not null,
  version text not null,
  url text,
  content_hash text not null,
  effective_at timestamptz not null default now(),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_key, version)
);

insert into public.legal_document_versions (document_key, title, version, url, content_hash, metadata)
values
  ('kvkk-aydinlatma-metni', 'KVKK Aydınlatma Metni', 'checkout-20260626', '/legal/kvkk-aydinlatma-metni.html', encode(digest('kvkk-aydinlatma-metni|checkout-20260626|/legal/kvkk-aydinlatma-metni.html', 'sha256'), 'hex'), '{"source":"migration_seed"}'::jsonb),
  ('on-bilgilendirme-formu', 'Ön Bilgilendirme Formu', 'checkout-20260626', '/legal/on-bilgilendirme-formu.html', encode(digest('on-bilgilendirme-formu|checkout-20260626|/legal/on-bilgilendirme-formu.html', 'sha256'), 'hex'), '{"source":"migration_seed"}'::jsonb),
  ('mesafeli-satis-sozlesmesi', 'Mesafeli Satış Sözleşmesi', 'checkout-20260626', '/legal/mesafeli-satis-sozlesmesi.html', encode(digest('mesafeli-satis-sozlesmesi|checkout-20260626|/legal/mesafeli-satis-sozlesmesi.html', 'sha256'), 'hex'), '{"source":"migration_seed"}'::jsonb),
  ('ticari-elektronik-ileti-izni', 'Ticari Elektronik İleti Onayı', 'checkout-20260626', '/legal/ticari-elektronik-ileti-izni.html', encode(digest('ticari-elektronik-ileti-izni|checkout-20260626|/legal/ticari-elektronik-ileti-izni.html', 'sha256'), 'hex'), '{"source":"migration_seed"}'::jsonb),
  ('uyelik-sozlesmesi', 'Üyelik Sözleşmesi', 'checkout-20260626', '/legal/uyelik-sozlesmesi.html', encode(digest('uyelik-sozlesmesi|checkout-20260626|/legal/uyelik-sozlesmesi.html', 'sha256'), 'hex'), '{"source":"migration_seed"}'::jsonb),
  ('cosmoskin-club-kurallari', 'COSMOSKIN Club Kuralları', 'checkout-20260626', '/legal/cosmoskin-club-kurallari.html', encode(digest('cosmoskin-club-kurallari|checkout-20260626|/legal/cosmoskin-club-kurallari.html', 'sha256'), 'hex'), '{"source":"migration_seed"}'::jsonb)
on conflict (document_key, version) do update set title = excluded.title, url = excluded.url, content_hash = excluded.content_hash, is_active = true;

create table if not exists public.order_legal_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  user_id uuid,
  email text,
  document_key text not null,
  document_title text not null,
  document_version text not null,
  document_hash text not null,
  document_url text,
  accepted_at timestamptz,
  ip_address text,
  user_agent text,
  source text not null default 'checkout',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Repair columns when this migration is re-run after a failed/partial attempt or against a legacy table.
alter table public.order_legal_snapshots add column if not exists order_id uuid;
alter table public.order_legal_snapshots add column if not exists user_id uuid;
alter table public.order_legal_snapshots add column if not exists email text;
alter table public.order_legal_snapshots add column if not exists document_key text;
alter table public.order_legal_snapshots add column if not exists document_title text;
alter table public.order_legal_snapshots add column if not exists document_version text;
alter table public.order_legal_snapshots add column if not exists document_hash text;
alter table public.order_legal_snapshots add column if not exists document_url text;
alter table public.order_legal_snapshots add column if not exists accepted_at timestamptz;
alter table public.order_legal_snapshots add column if not exists ip_address text;
alter table public.order_legal_snapshots add column if not exists user_agent text;
alter table public.order_legal_snapshots add column if not exists source text not null default 'checkout';
alter table public.order_legal_snapshots add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.order_legal_snapshots add column if not exists created_at timestamptz not null default now();

create index if not exists order_legal_snapshots_order_idx on public.order_legal_snapshots(order_id);

create table if not exists public.order_legal_consents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  user_id uuid,
  email text,
  consent_type text not null,
  accepted boolean not null default false,
  document_key text not null,
  document_title text not null,
  document_version text not null,
  document_hash text not null,
  document_url text,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  source text not null default 'checkout',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Repair columns when this migration is re-run after a failed/partial attempt or against a legacy table.
alter table public.order_legal_consents add column if not exists order_id uuid;
alter table public.order_legal_consents add column if not exists user_id uuid;
alter table public.order_legal_consents add column if not exists email text;
alter table public.order_legal_consents add column if not exists consent_type text;
alter table public.order_legal_consents add column if not exists accepted boolean not null default false;
alter table public.order_legal_consents add column if not exists document_key text;
alter table public.order_legal_consents add column if not exists document_title text;
alter table public.order_legal_consents add column if not exists document_version text;
alter table public.order_legal_consents add column if not exists document_hash text;
alter table public.order_legal_consents add column if not exists document_url text;
alter table public.order_legal_consents add column if not exists accepted_at timestamptz not null default now();
alter table public.order_legal_consents add column if not exists ip_address text;
alter table public.order_legal_consents add column if not exists user_agent text;
alter table public.order_legal_consents add column if not exists source text not null default 'checkout';
alter table public.order_legal_consents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.order_legal_consents add column if not exists created_at timestamptz not null default now();

create index if not exists order_legal_consents_order_idx on public.order_legal_consents(order_id);
create index if not exists order_legal_consents_email_idx on public.order_legal_consents(lower(email)) where email is not null;

create table if not exists public.shipping_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'manual',
  is_active boolean not null default true,
  default_package_weight_kg numeric(10,3) not null default 0.5,
  default_package_length_cm numeric(10,2),
  default_package_width_cm numeric(10,2),
  default_package_height_cm numeric(10,2),
  cutoff_time text,
  sender_reference text,
  service_code text,
  label_format text not null default 'PDF',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.shipping_settings(provider, is_active, metadata)
values ('manual', true, '{"launch_mode":"manual DHL fallback until API credentials are configured"}'::jsonb)
on conflict do nothing;

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid,
  order_item_id uuid,
  product_id text,
  product_slug text,
  product_name text,
  quantity integer not null default 1,
  reason text,
  condition_status text,
  refund_amount numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists return_items_return_idx on public.return_items(return_request_id);

-- Extend existing operational tables safely.
alter table if exists public.orders add column if not exists checkout_idempotency_key text;
alter table if exists public.orders add column if not exists legal_consents jsonb not null default '{}'::jsonb;
alter table if exists public.orders add column if not exists fulfillment_status text not null default 'not_started';
alter table if exists public.orders add column if not exists coupon_code text;
alter table if exists public.orders add column if not exists cargo_note text;
alter table if exists public.orders add column if not exists billing_first_name text;
alter table if exists public.orders add column if not exists billing_last_name text;
alter table if exists public.orders add column if not exists billing_email text;
alter table if exists public.orders add column if not exists billing_phone text;
alter table if exists public.orders add column if not exists company_title text;
alter table if exists public.orders add column if not exists tax_office text;
alter table if exists public.orders add column if not exists tax_number text;
alter table if exists public.orders add column if not exists corporate_email text;
alter table if exists public.orders add column if not exists is_e_invoice_taxpayer boolean not null default false;
alter table if exists public.orders add column if not exists billing_address_line text;
alter table if exists public.orders add column if not exists billing_city text;
alter table if exists public.orders add column if not exists billing_district text;
alter table if exists public.orders add column if not exists billing_postal_code text;
alter table if exists public.orders add column if not exists paid_at timestamptz;
alter table if exists public.orders add column if not exists fulfilled_at timestamptz;
alter table if exists public.orders add column if not exists delivered_at timestamptz;
create unique index if not exists orders_checkout_idempotency_key_unique on public.orders(checkout_idempotency_key) where checkout_idempotency_key is not null;

alter table if exists public.consent_records add column if not exists document_key text;
alter table if exists public.consent_records add column if not exists document_version text;
alter table if exists public.consent_records add column if not exists document_hash text;
alter table if exists public.consent_records add column if not exists ip_address text;
alter table if exists public.consent_records add column if not exists user_agent text;

alter table if exists public.shipments add column if not exists provider text;
alter table if exists public.shipments add column if not exists provider_shipment_id text;
alter table if exists public.shipments add column if not exists label_url text;
alter table if exists public.shipments add column if not exists label_format text;
alter table if exists public.shipments add column if not exists service_code text;
alter table if exists public.shipments add column if not exists package_weight_kg numeric(10,3);
alter table if exists public.shipments add column if not exists package_length_cm numeric(10,2);
alter table if exists public.shipments add column if not exists package_width_cm numeric(10,2);
alter table if exists public.shipments add column if not exists package_height_cm numeric(10,2);
alter table if exists public.shipments add column if not exists sender_reference text;
alter table if exists public.shipments add column if not exists recipient_snapshot jsonb;
alter table if exists public.shipments add column if not exists provider_payload jsonb;
alter table if exists public.shipments add column if not exists provider_response jsonb;
alter table if exists public.shipments add column if not exists error_message text;
alter table if exists public.shipments add column if not exists direction text not null default 'outbound';

alter table if exists public.shipment_events add column if not exists provider_event_code text;
alter table if exists public.shipment_events add column if not exists raw_payload jsonb;
alter table if exists public.shipping_events add column if not exists provider_event_code text;
alter table if exists public.shipping_events add column if not exists raw_payload jsonb;

alter table if exists public.invoice_records add column if not exists provider text not null default 'manual';
alter table if exists public.invoice_records add column if not exists provider_invoice_id text;
alter table if exists public.invoice_records add column if not exists pdf_url text;
alter table if exists public.invoice_records add column if not exists provider_payload jsonb;
alter table if exists public.invoice_records add column if not exists provider_response jsonb;

alter table if exists public.coupons add column if not exists stackable boolean not null default false;
alter table if exists public.coupons add column if not exists excluded_product_slugs text[] not null default '{}'::text[];
alter table if exists public.coupons add column if not exists excluded_categories text[] not null default '{}'::text[];

alter table if exists public.coupon_redemptions add column if not exists status text not null default 'reserved';
alter table if exists public.coupon_redemptions add column if not exists customer_email text;
alter table if exists public.coupon_redemptions add column if not exists discount_amount numeric(12,2) not null default 0;
alter table if exists public.coupon_redemptions add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.newsletter_subscribers add column if not exists marketing_email_opt_in boolean not null default false;
alter table if exists public.newsletter_subscribers add column if not exists consent_source text;

-- Generic updated_at trigger helper.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists customer_membership_status_set_updated_at on public.customer_membership_status;
create trigger customer_membership_status_set_updated_at before update on public.customer_membership_status for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, metadata)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'given_name'),
    coalesce(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'family_name'),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    metadata = public.profiles.metadata || excluded.metadata,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_auth_user_profile();

create or replace function public.recalculate_customer_membership(p_user_id uuid)
returns public.customer_membership_status language plpgsql security definer set search_path = public as $$
declare
  spend numeric(12,2) := 0;
  order_count integer := 0;
  new_level text := 'essential';
  next_level text;
  amount_needed numeric(12,2) := 0;
  orders_needed integer := 0;
  points integer := 0;
  old_level text;
  result public.customer_membership_status;
begin
  select coalesce(sum(total_amount), 0), count(*)::integer
    into spend, order_count
  from public.orders
  where user_id = p_user_id
    and created_at >= now() - interval '12 months'
    and coalesce(payment_status,'') in ('paid','confirmed','awaiting_fulfillment')
    and coalesce(status,'') not in ('cancelled','payment_failed','refunded');

  if spend >= 15000 or order_count >= 8 then
    new_level := 'elite';
    next_level := null;
    amount_needed := 0;
    orders_needed := 0;
  elsif spend >= 6000 or order_count >= 3 then
    new_level := 'signature';
    next_level := 'elite';
    amount_needed := greatest(0, 15000 - spend);
    orders_needed := greatest(0, 8 - order_count);
  else
    new_level := 'essential';
    next_level := 'signature';
    amount_needed := greatest(0, 6000 - spend);
    orders_needed := greatest(0, 3 - order_count);
  end if;

  select coalesce(sum(points_delta),0)::integer into points
  from public.loyalty_points_ledger
  where user_id = p_user_id and (expires_at is null or expires_at > now());

  select level_code into old_level from public.customer_membership_status where user_id = p_user_id;

  insert into public.customer_membership_status (user_id, level_code, rolling_spend_12m, completed_orders_12m, points_balance, next_level_code, amount_to_next_level, orders_to_next_level, calculated_at)
  values (p_user_id, new_level, spend, order_count, points, next_level, amount_needed, orders_needed, now())
  on conflict (user_id) do update set
    level_code = excluded.level_code,
    rolling_spend_12m = excluded.rolling_spend_12m,
    completed_orders_12m = excluded.completed_orders_12m,
    points_balance = excluded.points_balance,
    next_level_code = excluded.next_level_code,
    amount_to_next_level = excluded.amount_to_next_level,
    orders_to_next_level = excluded.orders_to_next_level,
    calculated_at = now(),
    updated_at = now()
  returning * into result;

  if old_level is not null and old_level <> new_level then
    insert into public.customer_membership_history (user_id, old_level, new_level, reason, metadata)
    values (p_user_id, old_level, new_level, 'rolling_12m_recalculation', jsonb_build_object('rolling_spend_12m', spend, 'completed_orders_12m', order_count));
  end if;
  return result;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.customer_preferences enable row level security;
alter table public.customer_skin_profiles enable row level security;
alter table public.customer_routine_results enable row level security;
alter table public.customer_membership_status enable row level security;
alter table public.customer_membership_history enable row level security;
alter table public.loyalty_points_ledger enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.customer_coupons enable row level security;
alter table public.birthday_benefits enable row level security;
alter table public.legal_document_versions enable row level security;
alter table public.order_legal_snapshots enable row level security;
alter table public.order_legal_consents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_preferences' and policyname='customer_preferences_own') then
    create policy customer_preferences_own on public.customer_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_skin_profiles' and policyname='customer_skin_profiles_own') then
    create policy customer_skin_profiles_own on public.customer_skin_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_routine_results' and policyname='customer_routine_results_own') then
    create policy customer_routine_results_own on public.customer_routine_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_membership_status' and policyname='customer_membership_status_select_own') then
    create policy customer_membership_status_select_own on public.customer_membership_status for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_membership_history' and policyname='customer_membership_history_select_own') then
    create policy customer_membership_history_select_own on public.customer_membership_history for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='loyalty_points_ledger' and policyname='loyalty_points_ledger_select_own') then
    create policy loyalty_points_ledger_select_own on public.loyalty_points_ledger for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='loyalty_redemptions' and policyname='loyalty_redemptions_select_own') then
    create policy loyalty_redemptions_select_own on public.loyalty_redemptions for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_coupons' and policyname='customer_coupons_select_own') then
    create policy customer_coupons_select_own on public.customer_coupons for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='birthday_benefits' and policyname='birthday_benefits_select_own') then
    create policy birthday_benefits_select_own on public.birthday_benefits for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='legal_document_versions' and policyname='legal_document_versions_public_active') then
    create policy legal_document_versions_public_active on public.legal_document_versions for select using (is_active = true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_legal_snapshots' and policyname='order_legal_snapshots_select_own') then
    create policy order_legal_snapshots_select_own on public.order_legal_snapshots for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_legal_consents' and policyname='order_legal_consents_select_own') then
    create policy order_legal_consents_select_own on public.order_legal_consents for select using (auth.uid() = user_id);
  end if;
end $$;
