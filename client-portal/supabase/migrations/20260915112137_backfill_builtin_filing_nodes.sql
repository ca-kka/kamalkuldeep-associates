update public.documents d set filing_node_id=f.id from public.filing_nodes f where d.filing_node_id is null and f.node_type='subject' and f.slug=d.area::text;
update public.document_uploads u set proposed_filing_node_id=f.id from public.filing_nodes f where u.proposed_filing_node_id is null and f.node_type='subject' and f.slug=u.proposed_area::text;
