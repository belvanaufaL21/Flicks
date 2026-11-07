-- ponytail: consolidated idempotent schema for rapid 1-click execution in Supabase SQL editor; use sequential migrations for zero-downtime production schema drift.
-- ==============================================================================
-- FLICKS MVP - Consolidated Supabase Schema
-- Run this in Supabase SQL Editor (1-Click Run)
-- ==============================================================================

-- 1. PRIVATE PHOTO ASSETS (72-hour customer intake & VTO photos)
create table if not exists public.photo_assets (
  id uuid primary key,
  photo_kind text not null check (photo_kind in ('face', 'full_body', 'vto_result')),
  object_path text not null unique,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10000000),
  width integer not null check (width between 512 and 4096),
  height integer not null check (height between 512 and 4096),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at <= created_at + interval '72 hours'),
  check (expires_at > created_at)
);

alter table public.photo_assets enable row level security;
alter table public.photo_assets force row level security;
revoke all on table public.photo_assets from public, anon, authenticated;
grant all on table public.photo_assets to service_role;

-- Storage Bucket for Private Photos
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'flicks-private-photos',
  'flicks-private-photos',
  false,
  10000000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. PAID ACCESS TOKENS (One token per paid checkout)
create table if not exists public.tokens (
  id uuid primary key,
  secret_hash text not null unique,
  status text not null check (
    status in ('available', 'reserved', 'consumed', 'expired')
  ),
  payment_id uuid,
  reserved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tokens enable row level security;
alter table public.tokens force row level security;
revoke all on table public.tokens from public, anon, authenticated;
grant all on table public.tokens to service_role;

-- 3. PAYMENTS (Midtrans QRIS)
create table if not exists public.payments (
  id uuid primary key,
  provider text not null default 'midtrans' check (provider in ('midtrans')),
  provider_reference text not null unique,
  amount integer not null check (amount = 19000),
  currency text not null default 'IDR' check (currency in ('IDR')),
  status text not null check (
    status in ('pending', 'paid', 'failed', 'expired', 'refunded')
  ),
  qris_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tokens_payment_id_unique
  on public.tokens (payment_id)
  where payment_id is not null;

alter table public.payments enable row level security;
alter table public.payments force row level security;
revoke all on table public.payments from public, anon, authenticated;
grant all on table public.payments to service_role;

-- 4. PRODUCTS & CATALOG
create table if not exists public.products (
  id uuid primary key,
  name text not null,
  category text not null,
  subcategory text,
  brand text,
  image_path text not null,
  source_url text,
  labels jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.products force row level security;
revoke all on table public.products from public, anon, authenticated;
grant all on table public.products to service_role;

-- 5. ASYNC AI & VTO JOBS
create table if not exists public.jobs (
  id uuid primary key,
  token_id uuid not null references public.tokens (id),
  type text not null check (type in ('analysis', 'virtual_try_on')),
  status text not null check (
    status in ('queued', 'processing', 'completed', 'failed', 'needs_review')
  ),
  input jsonb not null,
  result jsonb,
  provider text not null check (provider in ('gemini', 'fashn')),
  provider_reference text unique,
  error text,
  model_metadata jsonb,
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  token_recovery_status text not null default 'not_needed' check (
    token_recovery_status in ('not_needed', 'retryable', 'manual_recovery_required')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token_id, type)
);

alter table public.jobs enable row level security;
alter table public.jobs force row level security;
revoke all on table public.jobs from public, anon, authenticated;
grant all on table public.jobs to service_role;

-- 6. USAGE EVENTS (COGS & Provider Auditing: Gemini, FASHN, Midtrans)
create table if not exists public.usage_events (
  id uuid primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  provider text not null check (provider in ('gemini', 'fashn')),
  feature text not null check (
    feature in ('personal_color', 'body_shape', 'virtual_try_on')
  ),
  model text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_idr numeric(12, 2) not null check (estimated_cost_idr >= 0),
  status text not null check (
    status in ('completed', 'needs_review', 'failed')
  ),
  error_code text,
  created_at timestamptz not null default now()
);

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;
revoke all on table public.usage_events from public, anon, authenticated;
grant all on table public.usage_events to service_role;

-- 7. CUSTOMER REPORTS (72-Hour Secret Links)
create table if not exists public.reports (
  id uuid primary key,
  token_id uuid not null unique references public.tokens (id) on delete cascade,
  secret_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists reports_secret_hash_idx on public.reports (secret_hash);
create index if not exists reports_expires_at_idx on public.reports (expires_at);

alter table public.reports enable row level security;
alter table public.reports force row level security;
revoke all on table public.reports from public, anon, authenticated;
grant all on table public.reports to service_role;

-- 8. ADMIN PROFILES (Server-side RBAC)
create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;
alter table public.admin_profiles force row level security;
revoke all on table public.admin_profiles from public, anon, authenticated;
grant all on table public.admin_profiles to service_role;

-- 9. SYSTEM SETTINGS (Operator Kill Switch & Runtime Config)
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.system_settings enable row level security;
alter table public.system_settings force row level security;
revoke all on table public.system_settings from anon, authenticated;
grant select, insert, update, delete on table public.system_settings to service_role;

insert into public.system_settings (key, value)
values ('kill_switch', '{"paid_work_paused": false, "reason": null}'::jsonb)
on conflict (key) do nothing;
