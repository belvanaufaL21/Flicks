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
