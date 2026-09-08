-- KKA Client Portal: isolated document platform foundation.
-- This migration deliberately does not alter the existing File Portal or Knowledge Centre tables/auth.

create schema if not exists private;

create type public.portal_role as enum ('admin', 'staff', 'client');
create type public.document_area as enum ('gst', 'tds', 'income_tax', 'accounts', 'other');
create type public.document_state as enum ('processing', 'review', 'accepted', 'rejected', 'duplicate');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.portal_role not null default 'client',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text,
  pan text,
  tan text,
  cin text,
  gstin text,
  filename_aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_pan_format check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  constraint clients_tan_format check (tan is null or tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
  constraint clients_cin_format check (cin is null or cin ~ '^[A-Z0-9]{21}$'),
  constraint clients_gstin_format check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$')
);
create unique index clients_pan_unique on public.clients(pan) where pan is not null;
create unique index clients_tan_unique on public.clients(tan) where tan is not null;
create unique index clients_cin_unique on public.clients(cin) where cin is not null;
create unique index clients_gstin_unique on public.clients(gstin) where gstin is not null;

create table public.client_memberships (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_upload boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create table public.document_uploads (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id),
  original_filename text not null,
  sanitized_filename text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  object_path text not null unique,
  proposed_client_id uuid references public.clients(id),
  proposed_area public.document_area not null default 'other',
  proposed_financial_year text,
  proposed_period text,
  confidence integer not null check (confidence between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  -- Null only while an uncertain filename waits in the staff review queue.
  client_id uuid references public.clients(id),
  upload_id uuid unique references public.document_uploads(id),
  original_filename text not null,
  storage_path text not null unique,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  area public.document_area not null,
  financial_year text,
  filing_period text,
  status public.document_state not null default 'review',
  classification_confidence integer not null check (classification_confidence between 0 and 100),
  classification_reasons jsonb not null default '[]'::jsonb,
  uploaded_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_fy_format check (financial_year is null or financial_year ~ '^[0-9]{4}-[0-9]{2}$')
);
create index documents_client_created on public.documents(client_id, created_at desc);
create index documents_review_queue on public.documents(status, created_at) where status = 'review';
create unique index documents_client_hash_unique on public.documents(client_id, sha256);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create table public.filename_patterns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  pattern text not null,
  area public.document_area,
  confidence integer not null default 85 check (confidence between 1 and 100),
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, pattern)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  client_id uuid references public.clients(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_client_created on public.audit_logs(client_id, created_at desc);

create or replace function private.current_portal_role()
returns public.portal_role
language sql stable security definer set search_path = public, private
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = public, private
as $$ select coalesce((select private.current_portal_role() in ('admin','staff')), false) $$;

create or replace function private.can_access_client(target_client uuid)
returns boolean
language sql stable security definer set search_path = public, private
as $$
  select private.is_staff() or exists (
    select 1 from public.client_memberships m
    where m.client_id = target_client and m.user_id = auth.uid()
  )
$$;

revoke all on schema private from public;
revoke all on function private.current_portal_role() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.can_access_client(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_portal_role(), private.is_staff(), private.can_access_client(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_memberships enable row level security;
alter table public.document_uploads enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.filename_patterns enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles admin manage" on public.profiles for all to authenticated using (private.current_portal_role() = 'admin') with check (private.current_portal_role() = 'admin');
create policy "clients visible by entitlement" on public.clients for select to authenticated using (private.can_access_client(id));
create policy "clients managed by staff" on public.clients for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy "memberships visible by entitlement" on public.client_memberships for select to authenticated using (user_id = auth.uid() or private.is_staff());
create policy "memberships managed by staff" on public.client_memberships for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy "documents visible by entitlement" on public.documents for select to authenticated using (private.is_staff() or (client_id is not null and private.can_access_client(client_id)));
create policy "documents staff update" on public.documents for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy "versions visible by document access" on public.document_versions for select to authenticated using (exists (select 1 from public.documents d where d.id = document_id and private.can_access_client(d.client_id)));
create policy "patterns staff only" on public.filename_patterns for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy "audit logs staff only" on public.audit_logs for select to authenticated using (private.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-documents', 'client-documents', false, 52428800, array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv'])
on conflict (id) do update set public = false;

create policy "document objects read by entitlement" on storage.objects for select to authenticated using (
  bucket_id = 'client-documents' and exists (
    select 1 from public.documents d
    where d.storage_path = name and private.can_access_client(d.client_id)
  )
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', '')); return new; end $$;
revoke all on function public.handle_new_auth_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

