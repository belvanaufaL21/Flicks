-- System settings table for operator runtime controls (e.g., paid AI kill switch)
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
