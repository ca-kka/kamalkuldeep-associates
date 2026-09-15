create or replace function public.validate_filing_node_hierarchy() returns trigger language plpgsql set search_path=pg_catalog,public as $function$
declare p public.filing_nodes;
begin
 if new.node_type='folder' then select * into p from public.filing_nodes where id=new.parent_id; if not found or not p.enabled then raise exception 'Parent filing folder is unavailable'; end if; end if;
 return new;
end;$function$;
drop trigger if exists filing_nodes_validate_hierarchy on public.filing_nodes;
create trigger filing_nodes_validate_hierarchy before insert or update of parent_id,node_type on public.filing_nodes for each row execute function public.validate_filing_node_hierarchy();
