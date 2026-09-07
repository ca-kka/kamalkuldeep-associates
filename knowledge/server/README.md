# KKA Knowledge Centre — GitHub-native administration

The KKA Knowledge Centre uses GitHub Pages for the public website and GitHub itself for administrative authentication and authorization. There is intentionally no separate password database, OTP server, Node server, PostgreSQL instance, or external website host.

## Architecture

`KKA public site → GitHub Pages`

`KKA Admin → GitHub account authentication + repository permissions → GitHub editor / Pull Requests / GitHub Actions → GitHub Pages`

GitHub is the identity and authorization boundary. Only the KKA GitHub account(s) with appropriate repository permissions can edit or merge Knowledge Centre content.

## Why this is safer than browser-side OAuth tokens

A GitHub Pages site cannot safely keep a GitHub OAuth client secret or long-lived write token in browser JavaScript. GitHub's OAuth authorization-code flow requires protected application credentials for the token exchange, and GitHub recommends keeping application secrets/tokens protected. Therefore this project deliberately delegates the authenticated editing session to GitHub's own web interface instead of pretending that a static page is a secure OAuth server.

For a future richer single-page editor, a small serverless callback can be added without moving the website away from GitHub Pages. Until then, GitHub's authenticated editor and Pull Request UI provide the secure administrative surface.

## Editorial workflow

1. Administrator opens the KKA Admin control centre.
2. GitHub requires the administrator to sign in if necessary.
3. Content is edited through GitHub's authenticated editor.
4. Important changes should be made on a branch and reviewed through a Pull Request.
5. Knowledge Validation GitHub Action checks JSON structure, required fields, dates and published records.
6. Approved changes are merged into `main`.
7. GitHub Pages publishes the approved site.

## Security model

- No password or OTP secret is stored in the repository.
- No GitHub access token is stored in public JavaScript.
- Repository write/merge access is the administrator authorization boundary.
- Pull Requests provide the review/approval boundary.
- GitHub Actions uses the repository's short-lived `GITHUB_TOKEN` for automation where needed.
- Existing File Server authentication is completely separate and is not imported, reused, proxied or modified.

## GitHub OAuth note

GitHub OAuth remains available as a future enhancement for a custom single-page editor, but the confidential callback/token exchange must not be placed in GitHub Pages. The current implementation therefore uses GitHub's own authenticated UI as the secure admin surface while retaining GitHub Pages as the only website host.
