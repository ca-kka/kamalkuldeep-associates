# KKA Knowledge Centre — Google Admin Authentication

This Worker provides the server-side part required for a real Google login while the Knowledge Centre remains on GitHub Pages. It also provides the protected server-side publishing endpoint used by the admin editor.

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
   - `GITHUB_PUBLISH_TOKEN` — a GitHub fine-grained token restricted to this repository with **Contents: Read and write** permission
5. Keep `PUBLIC_ORIGIN` and `REDIRECT_URI` as defined in `wrangler.toml`.

## Publishing

The admin dashboard sends approved article data to `POST /publish` with the existing authenticated KKA session. The Worker validates the session and article, reads `knowledge/data/articles.json` from GitHub, updates or inserts the article, and commits the result to `main` using the server-side GitHub token.

The GitHub token is never sent to the browser. The public Knowledge Centre continues to read the published JSON file from GitHub Pages.

GitHub's Contents API requires a fine-grained token with repository **Contents: write** permission for this create/update operation. Do not grant workflow permissions because the publisher only changes the article data file.

## Result

`/knowledge/admin/` sends the administrator to Google, Google authenticates the account, and the Worker creates an HttpOnly, Secure session cookie only when the verified email exactly matches `ADMIN_EMAIL`.

No Google password, OAuth client secret, GitHub token, or session secret is placed in GitHub Pages JavaScript.
