-- These tables are accessed only by trusted server-side functions using service_role.
-- Keep client-facing roles without table grants; the policies make the intended
-- service-only RLS configuration explicit for policy inspection and linting.
CREATE POLICY client_login_otp_challenges_service_role_only
  ON public.client_login_otp_challenges
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY onedrive_file_registry_service_role_only
  ON public.onedrive_file_registry
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY onedrive_sync_state_service_role_only
  ON public.onedrive_sync_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY password_reset_otp_challenges_service_role_only
  ON public.password_reset_otp_challenges
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY storage_connections_service_role_only
  ON public.storage_connections
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
