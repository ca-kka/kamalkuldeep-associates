-- These five RPCs stay callable under their existing public names and roles.
-- Only their SECURITY DEFINER implementations move to the non-API private schema.
ALTER FUNCTION public.submit_portal_access_request(text,text,text,text,text,text,text,text,text,text,text) SET SCHEMA private;
ALTER FUNCTION public.get_filing_structure() SET SCHEMA private;
ALTER FUNCTION public.get_my_client_family_profiles() SET SCHEMA private;
ALTER FUNCTION public.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) SET SCHEMA private;
ALTER FUNCTION public.resolve_client_email_account(text) SET SCHEMA private;

-- Pin every privileged implementation to an empty search_path.
ALTER FUNCTION private.submit_portal_access_request(text,text,text,text,text,text,text,text,text,text,text) SET search_path = '';
ALTER FUNCTION private.get_filing_structure() SET search_path = '';
ALTER FUNCTION private.get_my_client_family_profiles() SET search_path = '';
ALTER FUNCTION private.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) SET search_path = '';
ALTER FUNCTION private.resolve_client_email_account(text) SET search_path = '';

-- Invoker wrappers preserve each existing RPC contract and caller role.
CREATE FUNCTION public.submit_portal_access_request(
  p_email text,
  p_full_name text,
  p_mobile text DEFAULT NULL,
  p_pan text DEFAULT NULL,
  p_gstin text DEFAULT NULL,
  p_tan text DEFAULT NULL,
  p_cin text DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_relationship text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $wrapper$ SELECT private.submit_portal_access_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) $wrapper$;

CREATE FUNCTION public.get_filing_structure()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $wrapper$ SELECT private.get_filing_structure() $wrapper$;

CREATE FUNCTION public.get_my_client_family_profiles()
RETURNS TABLE (
  account_id uuid,
  client_id uuid,
  display_name text,
  legal_name text,
  pan text,
  gstin text,
  active boolean,
  relationship text,
  is_primary boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $wrapper$ SELECT * FROM private.get_my_client_family_profiles() $wrapper$;

CREATE FUNCTION public.manage_filing_node(
  p_action text,
  p_id uuid DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_node_type text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_enabled boolean DEFAULT NULL,
  p_client_visible boolean DEFAULT NULL,
  p_client_upload_enabled boolean DEFAULT NULL,
  p_requires_financial_year boolean DEFAULT NULL,
  p_period_mode text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $wrapper$ SELECT private.manage_filing_node($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) $wrapper$;

CREATE FUNCTION public.resolve_client_email_account(p_email text)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $wrapper$ SELECT private.resolve_client_email_account($1) $wrapper$;

-- The private implementations are no longer direct API endpoints.
REVOKE ALL ON FUNCTION private.submit_portal_access_request(text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_filing_structure() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_my_client_family_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_client_email_account(text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.submit_portal_access_request(text,text,text,text,text,text,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION private.get_filing_structure() TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_my_client_family_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION private.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_client_email_account(text) TO authenticated;

-- Preserve the exact permissions that callers had on the exposed RPCs.
REVOKE ALL ON FUNCTION public.submit_portal_access_request(text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_filing_structure() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_client_family_profiles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_client_email_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_portal_access_request(text,text,text,text,text,text,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_filing_structure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_client_family_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_filing_node(text,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_client_email_account(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
