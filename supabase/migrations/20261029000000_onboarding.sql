-- First-run onboarding state, kept on the user's own settings row.
-- Owner-only RLS already covers the table: users can read and update their row, and cannot insert or delete it.

alter table public.settings
  add column onboarding jsonb not null default '{}'::jsonb,
  add constraint settings_onboarding_shape
    check (jsonb_typeof(onboarding) = 'object' and pg_column_size(onboarding) < 2048);

-- People who already set up a plan or recorded a starting count are not new; don't show them the welcome.
update public.settings
   set onboarding = '{"status":"done","tourDone":true,"checklistDismissed":true}'::jsonb
 where overall_target is not null or baseline_connections is not null;
