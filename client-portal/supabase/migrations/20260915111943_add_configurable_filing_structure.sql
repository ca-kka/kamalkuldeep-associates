create extension if not exists pgcrypto;
create table if not exists public.filing_nodes (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.filing_nodes(id) on delete restrict,
  name text not null, slug text not null, node_type text not null check (node_type in ('subject','folder')),
  sort_order integer not null default 0, enabled boolean not null default true,
  client_visible boolean not null default true, client_upload_enabled boolean not null default true,
  built_in boolean not null default false, requires_financial_year boolean not null default false,
  period_mode text not null default 'none' check (period_mode in ('none','month','quarter','custom')),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint filing_nodes_parent_type_chk check ((node_type='subject' and parent_id is null) or (node_type='folder' and parent_id is not null))
);
create unique index if not exists filing_nodes_subject_slug_uq on public.filing_nodes(slug) where node_type='subject';
create unique index if not exists filing_nodes_child_slug_uq on public.filing_nodes(parent_id,slug) where node_type='folder';
create index if not exists filing_nodes_parent_idx on public.filing_nodes(parent_id,sort_order);
create index if not exists filing_nodes_enabled_idx on public.filing_nodes(enabled,sort_order);
alter table public.filing_nodes enable row level security;
drop policy if exists filing_nodes_read_authenticated on public.filing_nodes;
create policy filing_nodes_read_authenticated on public.filing_nodes for select to authenticated using (enabled=true or private.is_staff());
alter table public.documents add column if not exists filing_node_id uuid references public.filing_nodes(id);
alter table public.document_uploads add column if not exists proposed_filing_node_id uuid references public.filing_nodes(id);
create index if not exists documents_filing_node_idx on public.documents(filing_node_id) where deleted_at is null;
create index if not exists document_uploads_filing_node_idx on public.document_uploads(proposed_filing_node_id);
insert into public.filing_nodes(name,slug,node_type,sort_order,built_in,requires_financial_year,period_mode) values
('GST','gst','subject',10,true,true,'month'),('TDS','tds','subject',20,true,true,'quarter'),('Income Tax','income-tax','subject',30,true,true,'none'),('Accounts','accounts','subject',40,true,true,'none'),('MCA','mca','subject',50,true,true,'none'),('Other','other','subject',60,true,true,'month') on conflict do nothing;
