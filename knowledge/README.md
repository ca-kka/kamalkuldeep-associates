# KKA Knowledge Centre

The Knowledge Centre is a static, KKA-branded knowledge platform under `/knowledge/`.

## Hosting
- Public site: GitHub Pages
- Source/content: GitHub repository
- Validation and automation: GitHub Actions
- Administration: GitHub-authenticated repository permissions, editor and Pull Requests
- Existing File Server admin: completely separate and untouched

## Publishing
1. Edit canonical JSON data in GitHub.
2. Prefer a branch + Pull Request for editorial review.
3. Run **Knowledge Centre Validation**.
4. Review sources, dates and wording.
5. Merge the approved change into `main`.
6. GitHub Pages publishes the approved result.

The custom `/knowledge/admin/` area is a control centre and navigation layer. It never stores passwords, OTP secrets or GitHub tokens. GitHub itself provides the administrator authentication boundary.
