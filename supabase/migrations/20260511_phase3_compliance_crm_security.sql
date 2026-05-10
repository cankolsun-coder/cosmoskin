
-- COSMOSKIN Phase 3: compliance, CRM, consent, admin auth and audit foundation
-- Run manually in Supabase SQL editor after reviewing with legal/accounting/compliance advisors.

create table if not exists public.product_compliance (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null unique,
  barcode text null,
  uts_code_or_reference text null,
  origin_country text null,
  importer_name text null,
  distributor_name text null,
  inci_ingredients text null,
  usage_instructions text null,
  warnings text null,
  pao_info text null,
  expiry_required boolean default false,
  admin_note text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  lot_number text null,
  expiry_date date null,
  quantity integer not null default 0 check (quantity >= 0),
  supplier_name text null,
  purchase_reference text null,
  received_at timestamptz null,
  status text not null default 'sellable' check (status in ('sellable','quarantine','damaged','expired','returned','disposed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.supplier_records (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text null,
  contact_phone text null,
  website text null,
  notes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text null,
  consent_type text not null check (consent_type in ('kvkk_acknowledged','distance_sales_accepted','preliminary_information_accepted','marketing_email_opt_in','newsletter_opt_in','cookie_preferences')),
  status text not null check (status in ('accepted','declined','withdrawn','acknowledged')),
  source text null,
  created_at timestamptz default now(),
  metadata jsonb null
);

create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text null,
  event_type text not null check (event_type in ('product_viewed','added_to_cart','removed_from_cart','checkout_started','purchase_completed','favorite_added','restock_alert_created','newsletter_subscribed','return_requested')),
  product_slug text null,
  order_id uuid null,
  created_at timestamptz default now(),
  metadata jsonb null
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'operations' check (role in ('owner','operations','warehouse','customer_support','content_editor')),
  status text not null default 'active' check (status in ('active','disabled','invited')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_product_compliance_slug on public.product_compliance(product_slug);
create index if not exists idx_inventory_lots_product_slug on public.inventory_lots(product_slug);
create index if not exists idx_inventory_lots_expiry_status on public.inventory_lots(expiry_date, status);
create index if not exists idx_supplier_records_name on public.supplier_records(name);
create index if not exists idx_consent_records_email_type on public.consent_records(email, consent_type, created_at desc);
create index if not exists idx_crm_events_email_type on public.crm_events(email, event_type, created_at desc);
create index if not exists idx_crm_events_product on public.crm_events(product_slug, event_type, created_at desc);
create index if not exists idx_admin_users_email on public.admin_users(email);

comment on table public.product_compliance is 'Cosmetic compliance data foundation. Do not publish final legal/compliance claims without reviewed source data.';
comment on table public.inventory_lots is 'Warehouse lot/expiry traceability foundation. product_inventory remains public sellable stock source.';
comment on table public.consent_records is 'Legal and marketing consent audit trail. Marketing consent must remain optional.';
comment on table public.crm_events is 'Consent-aware CRM event foundation. Do not trigger marketing automation without valid consent and unsubscribe/preference-center flow.';
comment on table public.admin_users is 'RBAC foundation. Current MVP can keep ADMIN_TOKEN; replace with authenticated admin users before production scale.';
