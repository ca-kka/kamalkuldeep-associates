create or replace function public.link_document_onedrive_registry()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted' and new.client_id is not null then
    update public.onedrive_file_registry r
       set document_id = new.id,
           updated_at = now()
     where r.id = (
       select r2.id
       from public.onedrive_file_registry r2
       where r2.document_id is null
         and r2.deleted_at is null
         and r2.client_id = new.client_id
         and coalesce(r2.area::text, '') = coalesce(new.area::text, '')
         and coalesce(r2.financial_year, '') = coalesce(new.financial_year, '')
         and coalesce(r2.filing_period, '') = coalesce(new.filing_period, '')
         and r2.name = new.original_filename
         and r2.created_at between new.created_at - interval '15 minutes' and now()
       order by r2.created_at desc
       limit 1
     );
  end if;
  return new;
end;
$$;
