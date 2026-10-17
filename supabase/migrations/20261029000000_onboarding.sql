-- First-run onboarding state, kept on the user's own settings row.
-- Owner-only RLS already covers the table: users can read and update their row, and cannot insert or delete it.

alter table public.settings
  add column onboarding jsonb not null default '{}'::jsonb,
  add constraint settings_onboarding_shape
    check (jsonb_typeof(onboarding) = 'object' and pg_column_size(onboarding) < 2048);

-- Anyone who already used the app is not new; don't show them the welcome. That means a plan or starting
-- count, or any records of their own in Jobs, Discover or Candidates.
update public.settings s
   set onboarding = '{"status":"done","tourDone":true,"checklistDismissed":true}'::jsonb
 where s.overall_target is not null
    or s.baseline_connections is not null
    or exists (select 1 from public.resumes r where r.user_id = s.user_id)
    or exists (select 1 from public.applications a where a.user_id = s.user_id)
    or exists (select 1 from public.job_user_states j where j.user_id = s.user_id)
    or exists (select 1 from public.candidates c where c.user_id = s.user_id)
    or exists (select 1 from public.network_searches n where n.user_id = s.user_id);
