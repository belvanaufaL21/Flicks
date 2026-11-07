-- Update photo_assets check constraint to allow 'vto_result'
alter table public.photo_assets drop constraint if exists photo_assets_photo_kind_check;
alter table public.photo_assets add constraint photo_assets_photo_kind_check check (
  photo_kind in ('face', 'full_body', 'vto_result')
);

-- Add attempt_count and token_recovery_status to jobs table
alter table public.jobs add column if not exists attempt_count integer not null default 1 check (
  attempt_count between 1 and 3
);

alter table public.jobs add column if not exists token_recovery_status text not null default 'not_needed' check (
  token_recovery_status in ('not_needed', 'retryable', 'manual_recovery_required')
);
