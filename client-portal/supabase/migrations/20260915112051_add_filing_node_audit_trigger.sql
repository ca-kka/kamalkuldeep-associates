create or replace function public.touch_filing_node_updated_at() returns trigger language plpgsql set search_path=pg_catalog,public as $function$ begin new.updated_at=now(); return new; end; $function$;
drop trigger if exists filing_nodes_touch_updated_at on public.filing_nodes;
create trigger filing_nodes_touch_updated_at before update on public.filing_nodes for each row execute function public.touch_filing_node_updated_at();
