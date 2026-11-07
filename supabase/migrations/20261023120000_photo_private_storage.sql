create table if not exists public.photo_assets (
  id uuid primary key,
  photo_kind text not null check (photo_kind in ('face', 'full_body')),
  object_path text not null unique,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10000000),
  width integer not null check (width between 512 and 4096),
  height integer not null check (height between 512 and 4096),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at <= created_at + interval '72 hours'),
  check (expires_at > created_at)
);

alter table public.photo_assets enable row level security;
alter table public.photo_assets force row level security;
revoke all on table public.photo_assets from public, anon, authenticated;
grant all on table public.photo_assets to service_role;

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
