# KKA Client & File Portal

This is a separate application intended for `portal.ca-kka.com`. It does not import, alter, or share the existing File Portal or Knowledge Centre authentication.

## What is included

- A private Supabase schema, RLS policies, storage policy, audit log, and document taxonomy.
- Server-side Supabase Edge Functions for secure filename classification and finalisation.
- A polished static admin dashboard shell, suitable for Cloudflare Pages.
- A Windows WPF desktop uploader project that hashes files locally, requests a short-lived upload URL, uploads, and displays the server classification result.

## Architecture

```text
portal.ca-kka.com (Cloudflare Pages)
  -> Supabase Auth + private data via RLS
  -> Edge Functions (prepare-upload / complete-upload / resolve-review)
  -> private `client-documents` Storage bucket

KKA Desktop Uploader (staff only)
  -> same Edge Functions using the staff member's Supabase session
```

Only Edge Functions use the Supabase service-role key. Never add it to the web application or the Windows application.

## Safe deployment order

1. Create a **new Supabase project** for this portal, or confirm the project to use.
2. Link this directory to it: `supabase link --project-ref <project-ref>`.
3. Apply the migration in `supabase/migrations/`.
4. In Supabase Auth, create the first administrator, then set `public.profiles.role` to `admin` in the SQL editor.
5. Set Edge Function secret `SUPABASE_SERVICE_ROLE_KEY`, then deploy the functions.
6. Configure Supabase Auth Site URL and redirect URLs for `https://portal.ca-kka.com` (and the Pages preview URL).
7. Create a new Cloudflare Pages project from this directory and attach `portal.ca-kka.com`.

See `docs/OPERATIONS.md` for the exact environment and domain checklist.

## Local preview

The dashboard shell is dependency-free. Serve `web/` with any static web server. The app becomes live after the Supabase URL and publishable key are supplied at deployment time and the authentication/data screens are wired in the next increment.

## Desktop uploader

Open `desktop-uploader/Kka.DesktopUploader.csproj` in Visual Studio 2022 with the .NET 8 desktop workload. Before using it, enter the portal's Supabase function URL and sign in through the approved staff-session flow; the sample uses an access token only in memory and never saves it.

