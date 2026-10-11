begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- Shared rows are written by the crawler (service role).
insert into public.employers (id, name, ats, board_token)
values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');
insert into public.jobs (id, employer_id, external_id, title, province, posted_at, apply_url)
values ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '1', 'Junior Developer', 'BC', now() - interval '2 hours', 'https://boards.greenhouse.io/acme/jobs/1');
insert into public.job_requirements (job_id, idx, text, kind, category)
values ('b0000000-0000-0000-0000-000000000001', 0, 'Python', 'must', 'skill');

select throws_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url) values ('e0000000-0000-0000-0000-000000000001', '1', 'Again', now(), 'https://x.example')$$,
  '23505', null, 'a job is stored once per employer');
select throws_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url) values ('e0000000-0000-0000-0000-000000000001', '2', 'No date', null, 'https://x.example')$$,
  '23502', null, 'a job must have a date');
select throws_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url) values ('e0000000-0000-0000-0000-000000000001', '3', 'X', now(), 'javascript:alert(1)')$$,
  '23514', null, 'apply links must be http(s)');
select throws_ok(
  $$insert into public.employers (name, ats, board_token) values ('Bad', 'greenhouse', '../etc')$$,
  '23514', null, 'board tokens are plain identifiers');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.jobs where id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')), 1, 'signed-in users read shared jobs');
select is((select count(*)::int from public.employers where id = 'e0000000-0000-0000-0000-000000000001'), 1, 'signed-in users read the employer directory');
select is((select count(*)::int from public.job_requirements where job_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')), 1, 'signed-in users read requirements of shared jobs');

select throws_ok(
  $$insert into public.employers (name, ats, board_token) values ('Mine', 'lever', 'mine')$$,
  '42501', null, 'users cannot add employers directly');
select throws_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url) values ('e0000000-0000-0000-0000-000000000001', '9', 'Fake', now(), 'https://x.example')$$,
  '42501', null, 'users cannot add shared jobs');
update public.jobs set title = 'Hijacked' where id = 'b0000000-0000-0000-0000-000000000001';
delete from public.jobs where id = 'b0000000-0000-0000-0000-000000000001';
select is((select title from public.jobs where id = 'b0000000-0000-0000-0000-000000000001'), 'Junior Developer', 'users cannot change or delete shared jobs');
select throws_ok(
  $$insert into public.ai_usage (user_id, day, used) values ('11111111-1111-1111-1111-111111111111', current_date, -5)$$,
  '42501', null, 'users cannot reset their AI quota');

-- A pasted job is private to the person who pasted it.
insert into public.jobs (id, user_id, external_id, title, posted_at, apply_url)
values ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'pasted', 'Pasted job', now(), 'https://www.linkedin.com/jobs/view/1');
insert into public.job_requirements (job_id, idx, text, kind, category) values ('b0000000-0000-0000-0000-000000000002', 0, 'SQL', 'must', 'skill');

insert into public.resumes (id, label, raw_text, profile, parsed_with, is_active)
values ('a0000000-0000-0000-0000-000000000001', 'Main', 'resume text', '{}'::jsonb, 'heuristic', true);
select throws_ok(
  $$insert into public.resumes (label, raw_text, profile, parsed_with, is_active) values ('Second', 'text', '{}'::jsonb, 'heuristic', true)$$,
  '23505', null, 'only one resume can be active');
insert into public.resume_lines (resume_id, line_id, text, embedding)
values ('a0000000-0000-0000-0000-000000000001', 'x1b1', 'Built things in Python', ('[' || array_to_string(array_fill(0.1::real, array[384]), ',') || ']')::extensions.vector);
insert into public.job_user_states (job_id, status) values ('b0000000-0000-0000-0000-000000000001', 'saved');
insert into public.job_matches (id, job_id, resume_id, fit_score, tier, method)
values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 80, 'strong', 'keywords');
insert into public.tailored_documents (match_id, kind, generated) values ('c0000000-0000-0000-0000-000000000001', 'resume', '{}'::jsonb);
insert into public.user_ai (own_key_ciphertext, own_key_hint) values ('v1:x:y:z', '…abcd');

-- ---------------------------------------------------------------- user B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.jobs where id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')), 1, 'another user sees shared jobs but not pasted ones');
select is((select count(*)::int from public.job_requirements where job_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')), 1, 'another user cannot see requirements of a pasted job');
select is((select count(*)::int from public.resumes) + (select count(*)::int from public.resume_lines), 0, 'another user cannot see resumes');
select is((select count(*)::int from public.job_user_states), 0, 'another user cannot see saved jobs');
select is((select count(*)::int from public.job_matches) + (select count(*)::int from public.tailored_documents), 0, 'another user cannot see fit checks or documents');
select is((select count(*)::int from public.user_ai), 0, 'another user cannot see stored AI keys');
select is((select count(*)::int from public.match_jobs('a0000000-0000-0000-0000-000000000001', array['b0000000-0000-0000-0000-000000000001'::uuid])), 0,
  'matching never reads another user''s resume');

-- ---------------------------------------------------------------- back to A
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
-- Shared requirements have no embedding yet, so give one (as the crawler would, with the service role).
reset role;
update public.job_requirements set embedding = ('[' || array_to_string(array_fill(0.1::real, array[384]), ',') || ']')::extensions.vector
where job_id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select line_id from public.match_jobs('a0000000-0000-0000-0000-000000000001', array['b0000000-0000-0000-0000-000000000001'::uuid])), 'x1b1',
  'matching finds the closest resume line for each requirement');

delete from public.resumes where id = 'a0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.tailored_documents), 0, 'deleting a resume deletes its fit checks and documents');

reset role;
select is(public.consume_ai_quota('11111111-1111-1111-1111-111111111111', 1) and not public.consume_ai_quota('11111111-1111-1111-1111-111111111111', 1), true,
  'the AI quota stops at the daily limit');

select * from finish();
rollback;
