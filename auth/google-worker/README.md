# KKA Knowledge Centre — Google Admin Authentication

This Worker provides the server-side part required for a real Google login while the Knowledge Centre remains on GitHub Pages.

## One-time setup

1. Create a Google Cloud OAuth 2.0 **Web application** client.
2. Add this authorized redirect URI:
   `https://auth.ca-kka.com/callback`
3. Deploy this Worker with Cloudflare Workers and map `auth.ca-kka.com` to it.
4. Set encrypted Worker secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `ADMIN_EMAIL` — the single Google account allowed to administer KKA
   - `SESSION_SECRET` — long random secret (at least 32 bytes)
5. Keep `PUBLIC_ORIGIN` and `REDIRECT_URI` as defined in `wrangler.toml`.

## Result

`/knowledge/admin/` sends the administrator to Google, Google authenticates the account, and the Worker creates an HttpOnly, Secure session cookie only when the verified email exactly matches `ADMIN_EMAIL`.

No Google password, OAuth client secret, GitHub token, or session secret is placed in GitHub Pages JavaScript.

## Important

The current editor still saves drafts locally and exports JSON. A secure publish API is a separate next step; do not put a GitHub PAT in the browser.
