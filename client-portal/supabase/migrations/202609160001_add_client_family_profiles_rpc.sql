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
language sql
security definer
set search_path = public
as $$
  select
    cam.account_id,
    c.id as client_id,
    c.display_name,
    c.legal_name,
    c.pan,
    c.gstin,
    c.active,
    cam.relationship,
    cam.is_primary
  from client_memberships cm
  join client_account_members primary_member
    on primary_member.client_id = cm.client_id
   and primary_member.is_primary = true
   and primary_member.active = true
  join client_account_members cam
    on cam.account_id = primary_member.account_id
   and cam.active = true
  join client_accounts ca
    on ca.id = cam.account_id
   and ca.primary_client_id = primary_member.client_id
   and ca.active = true
  join clients c
    on c.id = cam.client_id
   and c.active = true
  where cm.user_id = auth.uid()
  order by cam.is_primary desc, c.display_name nulls last, c.legal_name nulls last;
$$;

revoke all on function public.get_my_client_family_profiles() from public;
grant execute on function public.get_my_client_family_profiles() to authenticated;
