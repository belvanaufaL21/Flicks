-- 1. Reports Table for 72-hour Secret-Link Delivery
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

-- 2. Admin Profiles Table for Server-Side Role Enforcement
create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;
alter table public.admin_profiles force row level security;
revoke all on table public.admin_profiles from public, anon, authenticated;
grant all on table public.admin_profiles to service_role;

-- 3. Extend Products Table with Catalog & Labeling Fields
alter table public.products
  add column if not exists brand text,
  add column if not exists subcategory text,
  add column if not exists source_url text,
  add column if not exists labels jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
