# KKA Knowledge Centre — GitHub-native administration

The KKA Knowledge Centre uses GitHub Pages for the public website and GitHub itself for administrative authentication and authorization. There is intentionally no separate password database, OTP server, Node server, PostgreSQL instance, or external website host.

## Architecture

`KKA public site → GitHub Pages`

`KKA Admin → GitHub authentication/account + repository permissions → GitHub editor / Pull Requests / GitHub Actions → GitHub Pages`

GitHub is the identity provider and the security boundary. Only the KKA GitHub account(s) with appropriate repository permissions can edit or merge Knowledge Centre content.

## Why there is no client-side OAuth token

A GitHub Pages site cannot safely keep a GitHub OAuth client secret or long-lived write token in browser JavaScript. GitHub's current OAuth web flow uses an authorization-code exchange, and GitHub recommends keeping application secrets/tokens protected on a backend. Therefore this project deliberately delegates the actual authenticated editing session to GitHub's own web interface rather than pretending that a static page is a secure OAuth server.

For a future richer single-page editor, a small serverless callback can be added without moving the website away from GitHub Pages. Until then, GitHub's authenticated editor and Pull Request UI provide the secure administrative surface.

## Editorial workflow

1. Administrator opens the KKA Admin control centre.
2. GitHub requires the administrator to sign in if necessary.
3. Content is edited through GitHub's authenticated editor.
4. Changes can be made on a branch and reviewed through a Pull Request.
5. Knowledge Validation GitHub Action checks JSON structure, required fields, dates and published records.
6. Approved changes are merged into `main`.
7. GitHub Pages publishes the approved site.

## Protected content files

- `knowledge/data/articles.json`
- `knowledge/data/case-laws.json`
- `knowledge/data/compliance.json`
- `knowledge/data/content-model.json`

## Security model

- No password or OTP secret is stored in the repository.
- No GitHub access token is stored in public JavaScript.
- Repository write/merge access is the administrator authorization boundary.
- Pull Requests provide the review/approval boundary.
- GitHub Actions uses the repository's short-lived `GITHUB_TOKEN` for automation where needed.
- Existing File Server authentication is completely separate and is not imported, reused, proxied or modified.

## GitHub OAuth note

GitHub OAuth can be introduced later for a richer custom admin UI, but the authorization-code exchange requires protected application credentials/server-side handling. A static GitHub Pages-only implementation must not put such credentials in the browser. The current design therefore uses GitHub's own authenticated UI as the secure admin surface while retaining GitHub Pages as the only website host.
