-- FLICKS Lite core schema (PRD §G.3), used by src/lib/store/supabase-store.ts.
--
-- Every table has RLS enabled and no policies, so the browser (anon/publishable key)
-- can read or write nothing. All access goes through the server with the secret key.
-- The functions that guard money take row locks, so concurrent requests are safe
-- across any number of server instances.

create table admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table products (
  id text primary key,
  name text not null,
  brand text not null,
  category text not null,
  subcategory text not null,
  image_path text not null,          -- path, never the image itself
  source_url text,
  labels jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id text primary key,
  provider text not null check (provider in ('midtrans', 'mock')),
  provider_reference text not null unique,   -- Midtrans order_id: duplicate webhooks cannot issue twice
  session_hash text not null,
  amount integer not null check (amount > 0),
  currency text not null default 'IDR',
  status text not null check (status in ('pending', 'paid', 'expired', 'failed')),
  qr_url text,
  qr_string text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_session_idx on payments (session_hash, created_at desc);

create table tokens (
  id text primary key,
  payment_id text not null unique references payments (id),  -- one payment, one token
  status text not null check (status in ('available', 'reserved', 'consumed', 'void')),
  analysis_attempts integer not null default 0,
  reserved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Metadata for files in the private "user-photos" bucket. Rows and files are removed
-- together once expires_at passes.
create table photos (
  id text primary key,
  kind text not null check (kind in ('face', 'body', 'tryon')),
  mime text not null,
  storage_path text not null unique,
  width integer not null default 0,
  height integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index photos_expiry_idx on photos (expires_at);

-- Photo ids are kept without foreign keys: the photos are deleted at expiry while the
-- analysis row stays for cost and audit records.
create table analyses (
  id text primary key,
  token_id text not null references tokens (id),
  session_hash text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('queued', 'processing', 'completed', 'needs_retake', 'failed')),
  face_photo_id text not null,
  body_photo_id text not null,
  personal_color_result jsonb,
  body_shape_result jsonb,
  model_metadata jsonb,
  error text,
  report_secret_hash text not null unique,   -- sha256 of the secret link; the secret is never stored
  report_expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index analyses_token_idx on analyses (token_id, created_at desc);

create table tryon_jobs (
  id text primary key,
  analysis_id text not null unique references analyses (id),  -- one try-on per analysis
  product_id text not null references products (id),
  idempotency_key text not null unique,
  provider text not null check (provider in ('fashn', 'mock')),
  provider_job_id text,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  result_photo_id text,
  attempts integer not null default 1,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table usage_events (
  id text primary key,
  provider text not null,
  feature text not null,
  job_id text not null,
  estimated_cost integer not null default 0,  -- IDR
  status text not null check (status in ('success', 'error')),
  detail text,
  created_at timestamptz not null default now()
);

alter table admin_profiles enable row level security;
alter table products enable row level security;
alter table payments enable row level security;
alter table tokens enable row level security;
alter table photos enable row level security;
alter table analyses enable row level security;
alter table tryon_jobs enable row level security;
alter table usage_events enable row level security;

-- Settle a payment and issue its token in one transaction. Returns false when the
-- payment was already paid, so a repeated webhook is a no-op (QA-08).
create function settle_payment(p_payment_id text, p_token_id text)
returns boolean language plpgsql set search_path = public as $$
begin
  update payments set status = 'paid', paid_at = now()
   where id = p_payment_id and status <> 'paid';
  if not found then return false; end if;
  insert into tokens (id, payment_id, status) values (p_token_id, p_payment_id, 'available')
    on conflict (payment_id) do nothing;
  return found;
end $$;

-- Returns the analysis for a repeated idempotency key, or reserves the session's token
-- and creates the analysis. The token row is locked (FOR UPDATE), so of two concurrent
-- requests only one can reserve it (QA-06, QA-07).
create function start_analysis(
  p_id text,
  p_session_hash text,
  p_idempotency_key text,
  p_face_photo_id text,
  p_body_photo_id text,
  p_report_secret_hash text,
  p_max_attempts integer
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_existing analyses;
  v_payment payments;
  v_token tokens;
begin
  select * into v_existing from analyses where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.session_hash <> p_session_hash then
      return jsonb_build_object('kind', 'rejected', 'reason', 'forbidden');
    end if;
    return jsonb_build_object('kind', 'existing', 'id', v_existing.id);
  end if;

  select * into v_payment from payments
   where session_hash = p_session_hash order by created_at desc limit 1;
  if not found or v_payment.status <> 'paid' then
    return jsonb_build_object('kind', 'rejected', 'reason', 'no_token');
  end if;

  select * into v_token from tokens where payment_id = v_payment.id for update;
  if not found then return jsonb_build_object('kind', 'rejected', 'reason', 'no_token'); end if;

  -- Another request with this key may have committed while we waited for the lock.
  select * into v_existing from analyses where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('kind', 'existing', 'id', v_existing.id); end if;

  if v_token.status = 'consumed' then return jsonb_build_object('kind', 'rejected', 'reason', 'consumed'); end if;
  if v_token.status = 'reserved' then return jsonb_build_object('kind', 'rejected', 'reason', 'busy'); end if;
  if v_token.status <> 'available' then return jsonb_build_object('kind', 'rejected', 'reason', 'no_token'); end if;
  if v_token.analysis_attempts >= p_max_attempts then
    return jsonb_build_object('kind', 'rejected', 'reason', 'attempts_exhausted');
  end if;

  update tokens
     set status = 'reserved', reserved_at = now(), analysis_attempts = analysis_attempts + 1
   where id = v_token.id;

  insert into analyses (id, token_id, session_hash, idempotency_key, status,
                        face_photo_id, body_photo_id, report_secret_hash)
  values (p_id, v_token.id, p_session_hash, p_idempotency_key, 'queued',
          p_face_photo_id, p_body_photo_id, p_report_secret_hash);

  return jsonb_build_object('kind', 'created', 'id', p_id);
end $$;

-- Creates an analysis's single try-on job, re-queues it after a failure (within the
-- attempt limit), or returns the running one. Locked, so double clicks share one job.
create function claim_tryon(p_job jsonb, p_max_attempts integer)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_job tryon_jobs;
begin
  insert into tryon_jobs (id, analysis_id, product_id, idempotency_key, provider, status, attempts)
  values (p_job->>'id', p_job->>'analysis_id', p_job->>'product_id', p_job->>'idempotency_key',
          p_job->>'provider', 'queued', 1)
  on conflict (analysis_id) do nothing;
  if found then return jsonb_build_object('kind', 'created', 'id', p_job->>'id'); end if;

  select * into v_job from tryon_jobs where analysis_id = p_job->>'analysis_id' for update;
  if v_job.status <> 'failed' then return jsonb_build_object('kind', 'existing', 'id', v_job.id); end if;
  if v_job.attempts >= p_max_attempts then
    return jsonb_build_object('kind', 'rejected', 'reason', 'attempts_exhausted');
  end if;

  update tryon_jobs
     set product_id = p_job->>'product_id', status = 'queued', error = null,
         provider_job_id = null, attempts = attempts + 1
   where id = v_job.id;
  return jsonb_build_object('kind', 'retry', 'id', v_job.id);
end $$;

-- Only the server (service role / secret key) may call these.
revoke execute on function settle_payment(text, text) from public, anon, authenticated;
revoke execute on function start_analysis(text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function claim_tryon(jsonb, integer) from public, anon, authenticated;
grant execute on function settle_payment(text, text) to service_role;
grant execute on function start_analysis(text, text, text, text, text, text, integer) to service_role;
grant execute on function claim_tryon(jsonb, integer) to service_role;

-- Private bucket for user photos and try-on results. Files are served only through
-- the app's signed /api/media URLs. 10 MB per file, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-photos', 'user-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Starter catalog (same as src/lib/store/seed-products.ts) until the admin CRUD exists.
insert into products (id, name, brand, category, subcategory, image_path, labels) values
  ('prd_basic_tee', 'Basic Tee', 'FLICKS Sample', 'Atasan', 'Kaos', '/images/product-basic-tee.webp',
   '{"colors":["netral"],"silhouette":["regular fit","crew neck"],"fashnCategory":"tops"}'),
  ('prd_knit_top', 'Knit Top', 'FLICKS Sample', 'Atasan', 'Rajut', '/images/product-knit-top.webp',
   '{"colors":["hangat"],"silhouette":["slim fit"],"fashnCategory":"tops"}'),
  ('prd_linen_shirt', 'Linen Shirt', 'FLICKS Sample', 'Atasan', 'Kemeja', '/images/product-linen-shirt.webp',
   '{"colors":["netral"],"silhouette":["relaxed fit","kerah"],"fashnCategory":"tops"}'),
  ('prd_wrap_blouse', 'Wrap Blouse', 'FLICKS Sample', 'Atasan', 'Blus', '/images/product-wrap-blouse.webp',
   '{"colors":["hangat"],"silhouette":["wrap","v-neck"],"fashnCategory":"tops"}');
