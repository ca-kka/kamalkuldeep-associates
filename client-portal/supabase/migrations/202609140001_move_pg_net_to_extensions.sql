-- Keep pg_net's extension namespace out of public.
-- Supabase pg_net creates its runtime objects in the net schema.
-- The extension itself is installed under the private extensions schema.
drop extension pg_net;
create schema if not exists extensions;
create extension pg_net schema extensions;
