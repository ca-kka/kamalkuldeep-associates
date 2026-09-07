# KKA Knowledge Centre

This directory is a separate subsystem from the existing KKA website and File Server.

## Phase 1
- Public Knowledge Centre at `/knowledge/`
- Separate article template
- Separate admin entry point at `/knowledge/admin/`
- No File Server credentials, sessions, authentication code or secrets are reused
- Public content is static and contains no credentials

## Authentication boundary
The admin page is intentionally only an entry point until a server-side authentication provider is connected. Username/password/TOTP must not be implemented as client-side JavaScript or stored in public files.

Required production flow:

`Admin browser -> HTTPS authentication API -> password hash + TOTP -> secure session -> CMS/publishing API -> GitHub`

Required controls:
- One Admin account initially
- Strong password hash (Argon2id or bcrypt)
- TOTP-based OTP
- One-time recovery codes
- Secure, HttpOnly, SameSite session cookie
- Login rate limiting and lockout/backoff
- Password change and recovery
- Audit log
- Server-side GitHub credentials only

## Next production step
Connect a dedicated server-side auth/API layer (for example a separately deployed serverless service) and configure its secret storage. This cannot safely be completed by GitHub Pages/static HTML alone.

## Main website boundary
The existing homepage and File Server are not modified by this Phase 1 branch. A small navigation link to `/knowledge/` should be added only after the Knowledge Centre public page is approved.
