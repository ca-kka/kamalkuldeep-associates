create or replace function public.get_filing_structure() returns jsonb language sql stable security definer set search_path=pg_catalog,public,private,auth as $function$ select coalesce(jsonb_agg(to_jsonb(f) order by f.node_type,f.sort_order,f.name),'[]'::jsonb) from public.filing_nodes f where f.enabled or private.is_staff(); $function$;
revoke all on function public.get_filing_structure() from public;
grant execute on function public.get_filing_structure() to authenticated;
