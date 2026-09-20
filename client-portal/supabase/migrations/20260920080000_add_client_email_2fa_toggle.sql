-- Add an administrator-controlled email OTP requirement for client portal sign-in.
-- Enabled by default for all existing and future client profiles.
alter table public.profiles
  add column if not exists email_2fa_enabled boolean not null default true;

update public.profiles
set email_2fa_enabled = true
where email_2fa_enabled is null;

comment on column public.profiles.email_2fa_enabled is
  'Require email OTP verification for client portal login; enabled by default and changeable only by administrators through the management function.';
