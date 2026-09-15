drop index if exists public.documents_client_hash_unique;
create unique index documents_client_hash_unique on public.documents (client_id, sha256) where deleted_at is null;
