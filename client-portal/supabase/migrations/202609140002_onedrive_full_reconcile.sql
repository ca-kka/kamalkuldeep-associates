-- Daily full reconciliation support for OneDrive reverse synchronization.
-- Idempotent so it can safely be applied to an environment that already has the column.
alter table public.onedrive_sync_state
  add column if not exists last_full_reconcile_at timestamptz;

create index if not exists onedrive_sync_state_full_reconcile_idx
  on public.onedrive_sync_state(status,last_full_reconcile_at);
