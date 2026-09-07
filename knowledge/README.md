# KKA Knowledge Centre

The Knowledge Centre is a static, KKA-branded knowledge platform under `/knowledge/`.

## UI updates
- Uses the KKA CA logo from the main website assets.
- Uses a shared footer matching the main website structure, with working links back to the main site.
- Includes the same WhatsApp contact number/button used by the main website.
- Main-site Knowledge Centre navigation is styled as a prominent button.
- `/knowledge/admin/` provides a dedicated KKA publishing workspace with local draft saving, preview and JSON export.

## Publishing/authentication boundary
GitHub Pages is static hosting. It cannot safely implement a real administrator ID/password system or accept/store a GitHub token in browser JavaScript. The admin login screen therefore fails closed until a server-side authentication/API endpoint is connected.

The publishing workspace can prepare and preview content without redirecting to GitHub. Final authenticated publishing should be connected to a server-side service that validates the administrator credentials, creates the controlled content change/PR, and never exposes repository credentials to the browser.

The existing File Server authentication remains completely separate.
