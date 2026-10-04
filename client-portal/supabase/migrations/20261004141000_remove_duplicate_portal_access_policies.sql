-- Remove equivalent policies that predate portal_access_consistency.
-- The migration already creates the canonical policies with tighter role scope.
drop policy if exists "staff can manage client accounts" on public.client_accounts;
drop policy if exists "staff can manage client account members" on public.client_account_members;
drop policy if exists "clients select by entitlement" on public.clients;
