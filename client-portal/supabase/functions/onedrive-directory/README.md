# onedrive-directory

Production Supabase Edge Function: `onedrive-directory`.

## 2026-09-15 hardening

The live function was updated to make folder provisioning idempotent when Microsoft Graph returns HTTP 409 / `nameAlreadyExists` (`Name already exists`).

Behavior:
- Check the exact parent for an existing folder before creating it.
- If creation races with another request and Graph returns 409, re-read the exact parent up to 4 times with short backoff.
- Adopt the matching existing folder and return its item ID instead of failing provisioning.
- No existing OneDrive folder is deleted by this reconciliation path.
- Read-only `inspect_directory` remains non-creating.
- `delete_item` remains idempotent for Graph 404.

Live Supabase deployment: `onedrive-directory` version 6.
