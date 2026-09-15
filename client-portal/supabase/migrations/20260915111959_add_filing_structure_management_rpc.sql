create or replace function public.manage_filing_node(p_action text,p_id uuid default null,p_parent_id uuid default null,p_name text default null,p_node_type text default null,p_sort_order integer default null,p_enabled boolean default null,p_client_visible boolean default null,p_client_upload_enabled boolean default null,p_requires_financial_year boolean default null,p_period_mode text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth as $function$
declare r public.filing_nodes; me uuid:=auth.uid();
begin
 if me is null or not private.is_staff() then raise exception 'Staff access required'; end if;
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x) order by x.node_type,x.sort_order,x.name) from public.filing_nodes x),'[]'::jsonb);
 elsif p_action='create' then
  if coalesce(trim(p_name),'')='' then raise exception 'Folder name is required'; end if;
  if p_node_type not in ('subject','folder') then raise exception 'Invalid filing node type'; end if;
  if p_node_type='subject' and p_parent_id is not null then raise exception 'Subjects cannot have a parent'; end if;
  if p_node_type='folder' and p_parent_id is null then raise exception 'Folders require a parent'; end if;
  insert into public.filing_nodes(parent_id,name,slug,node_type,sort_order,enabled,client_visible,client_upload_enabled,built_in,requires_financial_year,period_mode,created_by)
  values(p_parent_id,trim(p_name),regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g'),p_node_type,coalesce(p_sort_order,100),coalesce(p_enabled,true),coalesce(p_client_visible,true),coalesce(p_client_upload_enabled,true),false,coalesce(p_requires_financial_year,false),coalesce(p_period_mode,'none'),me) returning * into r;
  return to_jsonb(r);
 elsif p_action in ('update','enable','disable') then
  if p_id is null then raise exception 'Filing node id is required'; end if;
  update public.filing_nodes set name=case when p_action='update' and nullif(trim(p_name),'') is not null then trim(p_name) else name end,sort_order=case when p_action='update' then coalesce(p_sort_order,sort_order) else sort_order end,enabled=case when p_action='enable' then true when p_action='disable' then false else coalesce(p_enabled,enabled) end,client_visible=case when p_action='update' then coalesce(p_client_visible,client_visible) else client_visible end,client_upload_enabled=case when p_action='update' then coalesce(p_client_upload_enabled,client_upload_enabled) else client_upload_enabled end,requires_financial_year=case when p_action='update' then coalesce(p_requires_financial_year,requires_financial_year) else requires_financial_year end,period_mode=case when p_action='update' then coalesce(p_period_mode,period_mode) else period_mode end,updated_at=now() where id=p_id returning * into r;
  if not found then raise exception 'Filing node not found'; end if; return to_jsonb(r);
 else raise exception 'Unsupported filing structure action'; end if;
end;$function$;
revoke all on function public.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) from public;
grant execute on function public.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) to authenticated;
