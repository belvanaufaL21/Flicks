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

create table if not exists public.products (
  id uuid primary key,
  name text not null,
  category text not null,
  image_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token_id, type)
);

alter table public.payments enable row level security;
alter table public.payments force row level security;
revoke all on table public.payments from public, anon, authenticated;
grant all on table public.payments to service_role;

alter table public.products enable row level security;
alter table public.products force row level security;
revoke all on table public.products from public, anon, authenticated;
grant all on table public.products to service_role;

alter table public.jobs enable row level security;
alter table public.jobs force row level security;
revoke all on table public.jobs from public, anon, authenticated;
grant all on table public.jobs to service_role;
