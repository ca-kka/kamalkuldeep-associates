# KKA Portal Error Code Standard

## Purpose
Every production error that matters to a user, administrator, data workflow, security boundary, or integration should have a stable KKA error code.

### Format
`KKA-<MODULE>-<NUMBER>`

Examples:
- `KKA-AUTH-0001` — authentication failure
- `KKA-UPL-0003` — upload completion failure
- `KKA-SEC-0001` — authorization denied
- `KKA-OD-0001` — OneDrive failure

## Severity
- **LOW** — cosmetic/informational; no data or security impact.
- **MEDIUM** — operation failed; normally safe to retry.
- **HIGH** — core operation failed or state may require reconciliation.
- **CRITICAL** — security, authorization, data-integrity, or cross-client access risk.

## Production rules
1. Never expose stack traces, SQL, tokens, signed URLs, secrets, or internal credentials to clients.
2. Client messages should contain the stable error code and, where useful, a reference/correlation ID.
3. Administrator diagnostics may contain technical details, but secrets and authentication material must remain redacted.
4. Every server-side operation should log the error code, operation, timestamp, request/correlation ID, authenticated user ID, client ID when applicable, and safe technical details.
5. Do not reuse an error code for a different meaning.
6. If an operation may have partially completed, reconcile state before repeatedly retrying.
7. **CRITICAL** errors should be reviewed as security/data-integrity incidents, not treated as ordinary user errors.

## Current catalog
The machine-readable source of truth is `error-codes.json`.

## Recommended support workflow
1. Get the KKA error code.
2. Get the incident/reference or correlation/request ID.
3. Find the matching diagnostic event.
4. Determine whether the operation partially committed.
5. Follow the catalog's admin action.
6. Record the resolution if the issue is recurring.
