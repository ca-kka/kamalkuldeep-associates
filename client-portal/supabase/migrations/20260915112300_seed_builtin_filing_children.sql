insert into public.filing_nodes(parent_id,name,slug,node_type,sort_order,built_in,requires_financial_year,period_mode,client_upload_enabled)
select id,'Month','month','folder',10,true,true,'month',true from public.filing_nodes where slug in ('gst','other') and node_type='subject' on conflict do nothing;
insert into public.filing_nodes(parent_id,name,slug,node_type,sort_order,built_in,requires_financial_year,period_mode,client_upload_enabled)
select id,'Quarter','quarter','folder',10,true,true,'quarter',true from public.filing_nodes where slug='tds' and node_type='subject' on conflict do nothing;
insert into public.filing_nodes(parent_id,name,slug,node_type,sort_order,built_in,requires_financial_year,period_mode,client_upload_enabled)
select id,'Financial Year','financial-year','folder',10,true,true,'none',true from public.filing_nodes where slug in ('income-tax','accounts','mca') and node_type='subject' on conflict do nothing;
