# KKA Knowledge Centre — production backend contract

The public Knowledge Centre is static and can be hosted by GitHub Pages. The admin system must NOT be implemented as client-side authentication.

## Required production backend
- HTTPS-only API under a separate origin/subdomain or serverless function.
- One Admin account initially; Admin ID is stored server-side and can be changed after re-authentication.
- Password hashing: Argon2id preferred; bcrypt acceptable if Argon2id is unavailable.
- TOTP authenticator compatible with Google Authenticator / Microsoft Authenticator.
- One-time recovery codes, hashed at rest.
- Secure, HttpOnly, SameSite session cookies; short idle/absolute expiry; session revocation.
- Login rate limiting, progressive lockout and audit logging.
- CSRF protection for cookie-authenticated state-changing requests.
- Password reset/change requires re-authentication and OTP; recovery flow requires recovery code.
- Registered email/mobile changes require re-authentication and OTP.
- Logout-all-sessions support.
- Never place GitHub, X, LinkedIn or other API tokens in public JavaScript.

## CMS API
`POST /auth/login` → password verification → TOTP challenge
`POST /auth/totp` → session creation
`POST /auth/logout`
`POST /auth/logout-all`
`POST /auth/password/change`
`POST /auth/admin-id/change`
`POST /auth/totp/enrol`
`POST /auth/totp/disable`
`POST /auth/recovery-codes/regenerate`
`GET /me`
`GET /content?status=draft|review|approved|published`
`POST /content/articles`
`PUT /content/articles/:id`
`POST /content/articles/:id/submit-review`
`POST /content/articles/:id/approve`
`POST /content/articles/:id/publish`
`POST /content/case-laws`
`POST /content/compliance`
`POST /social/x/prepare`
`POST /social/linkedin/prepare`
`POST /social/x/publish`
`POST /social/linkedin/publish`
`GET /audit-log`

## Publishing model
1. Admin saves Draft.
2. Article enters Review.
3. Admin/author completes factual/source checks.
4. Article becomes Approved.
5. Publish generates canonical static content/data.
6. GitHub Actions builds/deploys the public Knowledge Centre.
7. Social posts are generated from the canonical article and require explicit publish approval.

## Environment variables
Never commit values. Production deployment should provide secrets such as `DATABASE_URL`, `SESSION_SECRET`, `TOTP_ENCRYPTION_KEY`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `X_CLIENT_*`, and `LINKEDIN_CLIENT_*` through the hosting platform's secret store.

## Separation guarantee
This backend is exclusively for the KKA Knowledge Centre. It must not import, reuse, proxy, or share sessions/credentials with the existing File Server administration system.
