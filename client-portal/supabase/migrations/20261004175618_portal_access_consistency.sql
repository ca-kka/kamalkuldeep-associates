alter type public.document_area add value if not exists 'mca';

alter table public.documents add column if not exists deleted_at timestamptz;
alter table public.documents add column if not exists rejection_reason text;

create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  primary_client_id uuid not null references public.clients(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_account_members (
  account_id uuid not null references public.client_accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  relationship text not null default 'family_member',
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, client_id)
);

drop trigger if exists client_accounts_updated_at on public.client_accounts;
create trigger client_accounts_updated_at before update on public.client_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists client_account_members_updated_at on public.client_account_members;
create trigger client_account_members_updated_at before update on public.client_account_members
  for each row execute function public.set_updated_at();

create unique index if not exists client_accounts_primary_client_unique
  on public.client_accounts(primary_client_id);
create unique index if not exists client_account_one_primary_member
  on public.client_account_members(account_id) where is_primary;

-- Give each existing portal client a family account with a primary profile.
insert into public.client_accounts(account_name, primary_client_id, active)
select coalesce(nullif(c.display_name, ''), c.legal_name), c.id, c.active
from public.clients c
where exists (select 1 from public.client_memberships cm where cm.client_id = c.id)
  and not exists (select 1 from public.client_accounts ca where ca.primary_client_id = c.id);

insert into public.client_account_members(account_id, client_id, relationship, is_primary, active)
select ca.id, ca.primary_client_id, 'primary_holder', true, ca.active
from public.client_accounts ca
on conflict (account_id, client_id) do update
  set relationship = excluded.relationship,
      is_primary = true,
      active = excluded.active,
      updated_at = now();

alter table public.client_accounts enable row level security;
alter table public.client_account_members enable row level security;
revoke all on public.client_accounts, public.client_account_members from public, anon;
grant select, insert, update, delete on public.client_accounts, public.client_account_members to authenticated;
grant all on public.client_accounts, public.client_account_members to service_role;
drop policy if exists "family accounts staff only" on public.client_accounts;
create policy "family accounts staff only" on public.client_accounts
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
drop policy if exists "family members staff only" on public.client_account_members;
create policy "family members staff only" on public.client_account_members
  for all to authenticated using (private.is_staff()) with check (private.is_staff());

create or replace function private.current_portal_role()
returns public.portal_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_portal_role() in ('admin', 'staff'), false)
$$;

create or replace function private.can_access_client(target_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() or (
    target_client is not null
    and exists (
      select 1
      from public.profiles caller
      join public.clients target on target.id = target_client and target.active
      where caller.id = auth.uid() and caller.active and caller.role = 'client'
        and (
          exists (
            select 1 from public.client_memberships membership
            where membership.user_id = caller.id and membership.client_id = target_client
          )
          or exists (
            select 1
            from public.client_memberships primary_membership
            join public.clients primary_client
              on primary_client.id = primary_membership.client_id and primary_client.active
            join public.client_account_members primary_member
              on primary_member.client_id = primary_membership.client_id
             and primary_member.is_primary and primary_member.active
            join public.client_accounts account
              on account.id = primary_member.account_id
             and account.primary_client_id = primary_membership.client_id
             and account.active
            join public.client_account_members family_member
              on family_member.account_id = account.id
             and family_member.client_id = target_client
             and family_member.active
            where primary_membership.user_id = caller.id
          )
        )
    )
  )
$$;

revoke all on function private.current_portal_role(), private.is_staff(), private.can_access_client(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_portal_role(), private.is_staff(), private.can_access_client(uuid) to authenticated;

drop policy if exists "clients visible by entitlement" on public.clients;
create policy "clients visible by entitlement" on public.clients
  for select to authenticated using (private.can_access_client(id));
drop policy if exists "documents visible by entitlement" on public.documents;
create policy "documents visible by entitlement" on public.documents
  for select to authenticated using (
    private.is_staff()
    or (status = 'accepted' and deleted_at is null and client_id is not null and private.can_access_client(client_id))
  );
drop policy if exists "versions visible by document access" on public.document_versions;
create policy "versions visible by document access" on public.document_versions
  for select to authenticated using (
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.status = 'accepted' and d.deleted_at is null
        and private.can_access_client(d.client_id)
    )
  );
drop policy if exists "document objects read by entitlement" on storage.objects;
create policy "document objects read by entitlement" on storage.objects for select to authenticated using (
  bucket_id = 'client-documents' and exists (
    select 1 from public.documents d
    where d.storage_path = name and d.status = 'accepted' and d.deleted_at is null
      and private.can_access_client(d.client_id)
  )
);

create or replace function public.get_my_client_family_profiles()
returns table (
  account_id uuid,
  client_id uuid,
  display_name text,
  legal_name text,
  pan text,
  gstin text,
  active boolean,
  relationship text,
  is_primary boolean
)
language sql stable security definer set search_path = ''
as $$
  select account.id, client.id, client.display_name, client.legal_name,
         client.pan, client.gstin, client.active, family_member.relationship,
         family_member.is_primary
  from public.client_memberships membership
  join public.profiles caller on caller.id = membership.user_id and caller.active and caller.role = 'client'
  join public.client_account_members primary_member
    on primary_member.client_id = membership.client_id
   and primary_member.is_primary and primary_member.active
  join public.client_accounts account
    on account.id = primary_member.account_id
   and account.primary_client_id = membership.client_id and account.active
  join public.client_account_members family_member
    on family_member.account_id = account.id and family_member.active
  join public.clients client
    on client.id = family_member.client_id and client.active
  where auth.uid() is not null and membership.user_id = auth.uid()
  order by family_member.is_primary desc, client.display_name nulls last, client.legal_name nulls last
$$;
revoke all on function public.get_my_client_family_profiles() from public, anon;
grant execute on function public.get_my_client_family_profiles() to authenticated;

alter function public.handle_new_auth_user() set search_path = '';
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
