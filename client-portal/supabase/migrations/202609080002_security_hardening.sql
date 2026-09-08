-- Keep staging metadata Edge-Function-only while satisfying explicit RLS policy review.
create policy "document uploads deny direct access" on public.document_uploads
  for select to authenticated using (false);

-- Trigger helpers are never RPC endpoints. Fix their search path and explicit role grants.
alter function public.set_updated_at() set search_path = public;
revoke all on function public.handle_new_auth_user() from anon, authenticated;

-- Existing project helper was already exposed before this portal migration; lock it down too.
revoke all on function public.rls_auto_enable() from anon, authenticated;

