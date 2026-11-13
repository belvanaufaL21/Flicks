alter table public.jobs
  add column if not exists model_metadata jsonb;

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
