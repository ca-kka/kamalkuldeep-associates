-- rls_auto_enable is an internal helper and must not be callable through the public API.
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon, authenticated;
