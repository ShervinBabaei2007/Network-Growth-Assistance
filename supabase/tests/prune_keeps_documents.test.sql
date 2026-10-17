begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');
insert into public.jobs (id, employer_id, external_id, title, posted_at, apply_url, closed_at)
values
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '1', 'Has a tailored resume', now() - interval '90 days', 'https://boards.greenhouse.io/acme/jobs/1', now() - interval '40 days'),
  ('b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '2', 'Has improvement notes', now() - interval '90 days', 'https://boards.greenhouse.io/acme/jobs/2', now() - interval '40 days'),
  ('b0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', '3', 'Only a fit check', now() - interval '90 days', 'https://boards.greenhouse.io/acme/jobs/3', now() - interval '40 days'),
  ('b0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', '4', 'Document deleted', now() - interval '90 days', 'https://boards.greenhouse.io/acme/jobs/4', now() - interval '40 days');
insert into public.resumes (id, user_id, label, raw_text, profile, parsed_with, is_active)
values ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Main', 'text', '{}'::jsonb, 'heuristic', true);
insert into public.job_matches (id, user_id, job_id, resume_id, fit_score, tier, method)
values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 80, 'strong', 'keywords'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 70, 'good', 'keywords'),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 60, 'good', 'keywords'),
  ('c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 60, 'good', 'keywords');
insert into public.tailored_documents (id, user_id, match_id, kind, method, generated)
values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'resume', 'ai', '{}'::jsonb);
insert into public.tailored_documents (id, user_id, match_id, kind, method, generated, deleted_at)
values ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000004', 'resume', 'ai', '{}'::jsonb, now() - interval '1 day');
insert into public.improvement_notes (user_id, match_id, resume_id, resume_updated_at, method, report)
values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', now(), 'rules', '{}'::jsonb);

select public.prune_jobs();

-- ---------------------------------------------------------------- prune_jobs keeps the user's work
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-0000-0000-000000000001'), 1, 'a closed job with a tailored document is kept');
select is((select count(*)::int from public.tailored_documents where id = 'd0000000-0000-0000-0000-000000000001'), 1, 'its tailored document survives pruning');
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-0000-0000-000000000002'), 1, 'a closed job with improvement notes is kept');
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-0000-0000-000000000003'), 0, 'a closed job with only a fit check is still pruned');
select is((select count(*)::int from public.jobs where id = 'b0000000-0000-0000-0000-000000000004'), 0, 'a document in the bin doesn''t keep its job');

select * from finish();
rollback;
