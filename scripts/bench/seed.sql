-- Seeds one benchmark user with 20,000 candidates (15,000 invitations), 20,000 saved people and 20,000 applications.
-- Local only. Touches nothing else, and scripts/bench/clean.sql removes it.
--   docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 < scripts/bench/seed.sql
\set uid '''bbbbbbbb-0000-0000-0000-000000000001'''

delete from auth.users where id = :uid;
insert into auth.users (id, email, instance_id, aud, role) values (:uid, 'bench@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
;
insert into public.settings (user_id) values (:uid) on conflict (user_id) do nothing;

insert into public.candidates (id, user_id, full_name, profile_url, profile_key, role, status, discovered_at, raw_school_text, raw_program_text,
                               university_confidence, discipline_confidence, connected_via, connected_at)
select
  ('bbbbbbbb-1000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, :uid, 'Candidate ' || g,
  'https://www.linkedin.com/in/bench-' || g, 'bench-' || g,
  (array['Engineer', 'Analyst', 'Designer', 'Manager'])[1 + g % 4],
  (array['awaiting_review', 'approved', 'not_a_match', 'do_not_contact', 'new'])[1 + g % 5]::public.candidate_status,
  now() - (g || ' minutes')::interval, 'University ' || (g % 40), 'Program ' || (g % 25),
  'needs_review', 'needs_review',
  case when g % 10 = 0 then 'export'::public.connection_source end, case when g % 10 = 0 then now() - (g || ' hours')::interval end
from generate_series(1, 20000) g;

insert into public.invitations (user_id, candidate_id, sent_at, outcome, resolved_at)
select :uid, ('bbbbbbbb-1000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, now() - ((g % 400) || ' hours')::interval,
  (array['pending', 'accepted', 'declined', 'withdrawn'])[1 + g % 4]::public.invitation_outcome,
  case when g % 4 = 0 then null else now() - ((g % 400) || ' hours')::interval + interval '1 minute' end
from generate_series(1, 15000) g;

insert into public.network_people (user_id, full_name, normalized_name, current_title, current_company, saved, relevance_score, reminder_at, tags, crm_status)
select :uid, 'Person ' || g, 'person ' || g, 'Title ' || g % 50, 'Company ' || g % 300, true, g % 100,
  case when g % 7 = 0 then current_date + (g % 60) end, case when g % 5 = 0 then array['mentor'] else '{}' end, 'discovered'
from generate_series(1, 20000) g;

insert into public.applications (user_id, title, company, stage, stage_changed_at)
select :uid, 'Role ' || g, 'Company ' || g % 300,
  (array['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected'])[1 + g % 6]::public.application_stage, now() - (g || ' minutes')::interval
from generate_series(1, 20000) g;

analyze public.candidates; analyze public.invitations; analyze public.network_people; analyze public.applications;
select 'seeded' as result, (select count(*) from public.candidates where user_id = :uid) candidates, (select count(*) from public.network_people where user_id = :uid) people,
       (select count(*) from public.applications where user_id = :uid) applications;
