-- OneDrive reverse-sync state and deletion tracking.
-- Production was applied before source-control synchronization; statements are idempotent.
alter table public.onedrive_file_registry add column if not exists deleted_at timestamptz;
alter table public.onedrive_file_registry add column if not exists deletion_source text;
create index if not exists onedrive_file_registry_active_drive_idx on public.onedrive_file_registry(drive_id,deleted_at);
create unique index if not exists onedrive_sync_state_owner_drive_uidx on public.onedrive_sync_state(owner_user_id,drive_id);
alter table public.onedrive_sync_state enable row level security;
alter table public.onedrive_sync_state add column if not exists last_full_reconcile_at timestamptz;
create index if not exists onedrive_sync_state_full_reconcile_idx on public.onedrive_sync_state(status,last_full_reconcile_at);
