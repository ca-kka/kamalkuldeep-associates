# KKA Admin Workspace

The admin area is intentionally separated from the public Knowledge Centre.

`index.html` is the secure-login placeholder. It asks for administrator ID/password but remains locked until a server-side authentication endpoint exists. Do not put credentials or repository tokens in client-side JavaScript.

`dashboard.html` is the interactive content workspace. It supports:
- Article metadata entry
- Draft/review/approved/published status
- Automatic slug suggestion
- Local draft persistence
- Preview in a new tab
- JSON export in the Knowledge Centre data shape
- Mobile-friendly UI

A future server-side publish connector should authenticate the administrator, validate the submitted content, create the controlled GitHub change/PR and keep all repository credentials server-side.
