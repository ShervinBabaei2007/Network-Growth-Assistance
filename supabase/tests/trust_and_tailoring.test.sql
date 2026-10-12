begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- Written by the server (service role): a board job and an Adzuna search result.
insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');
insert into public.jobs (id, employer_id, external_id, title, province, posted_at, apply_url, verification_status, verified_at)
values ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '1', 'Junior Developer', 'BC', now(), 'https://boards.greenhouse.io/acme/jobs/1', 'verified', now());
insert into public.jobs (id, source, provider_key, external_id, title, province, posted_at, apply_url)
values ('b0000000-0000-0000-0000-000000000003', 'adzuna', 'adzuna:42', '42', 'Full Stack Developer', 'BC', now(), 'https://www.adzuna.ca/land/ad/42');

select is((select verification_status::text from public.jobs where id = 'b0000000-0000-0000-0000-000000000003'), 'pending_validation', 'search results start unverified');
select throws_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url, verification_status) values ('e0000000-0000-0000-0000-000000000001', '2', 'No link', now(), null, 'verified')$$,
  '23514', null, 'a job without a link can never be verified');
select lives_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url) values ('e0000000-0000-0000-0000-000000000001', '3', 'No link yet', now(), null)$$,
  'a job without a link is kept, unverified');
select throws_ok(
  $$insert into public.jobs (source, external_id, title, posted_at, apply_url) values ('ats', '4', 'Orphan', now(), 'https://x.example.org/4')$$,
  '23514', null, 'a board job must belong to an employer');
select throws_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url) values ('adzuna', 'adzuna:42', '42', 'Again', now(), 'https://www.adzuna.ca/land/ad/42')$$,
  '23505', null, 'a search result is stored once per provider id');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.jobs where id = 'b0000000-0000-0000-0000-000000000003'), 1, 'signed-in users read search results');
select throws_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url) values ('adzuna', 'adzuna:99', '99', 'Fake', now(), 'https://www.adzuna.ca/land/ad/99')$$,
  '42501', null, 'users cannot add search results');
update public.jobs set verification_status = 'verified' where id = 'b0000000-0000-0000-0000-000000000003';
select is((select verification_status::text from public.jobs where id = 'b0000000-0000-0000-0000-000000000003'), 'pending_validation', 'users cannot mark a shared listing verified');
select throws_ok(
  $$insert into public.jobs (user_id, source, external_id, title, posted_at, apply_url) values ('11111111-1111-1111-1111-111111111111', 'ats', 'p1', 'Pretend board job', now(), 'https://x.example.org/1')$$,
  null, null, 'a pasted job is always marked as pasted');

-- The original resume never changes.
insert into public.resumes (id, label, raw_text, profile, original_profile, original_file_path, parsed_with, is_active, source_kind)
values ('a0000000-0000-0000-0000-000000000001', 'Main', 'original resume text', '{"name":"Sam"}'::jsonb, '{"name":"Sam"}'::jsonb, '11111111-1111-1111-1111-111111111111/a.pdf', 'heuristic', true, 'pdf');
select throws_ok($$update public.resumes set raw_text = 'rewritten' where id = 'a0000000-0000-0000-0000-000000000001'$$, '42501', null, 'the original resume text cannot be changed');
select throws_ok($$update public.resumes set original_profile = '{"name":"Other"}'::jsonb where id = 'a0000000-0000-0000-0000-000000000001'$$, '42501', null, 'the parsed original cannot be changed');
select throws_ok($$update public.resumes set original_file_path = 'x/y.pdf' where id = 'a0000000-0000-0000-0000-000000000001'$$, '42501', null, 'the original file cannot be replaced');
select lives_ok($$update public.resumes set profile = '{"name":"Sam Lee"}'::jsonb where id = 'a0000000-0000-0000-0000-000000000001'$$, 'the working profile can be edited');

-- Several tailored versions of the same kind for one job, and Improvement Notes kept apart.
insert into public.job_matches (id, job_id, resume_id, fit_score, tier, method)
values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 80, 'strong', 'keywords');
insert into public.tailored_documents (match_id, kind, method, generated)
values
  ('c0000000-0000-0000-0000-000000000001', 'resume', 'ai', '{}'::jsonb),
  ('c0000000-0000-0000-0000-000000000001', 'resume', 'ai', '{}'::jsonb),
  ('c0000000-0000-0000-0000-000000000001', 'cv', 'ai', '{}'::jsonb);
select is((select count(*)::int from public.tailored_documents), 3, 'several tailored versions (and a CV) can be kept for one job');
select throws_ok(
  $$insert into public.tailored_documents (match_id, kind, method, generated) values ('c0000000-0000-0000-0000-000000000001', 'resume', 'rules', '{}'::jsonb)$$,
  '23514', null, 'a document is labelled with how it was really made');
insert into public.improvement_notes (match_id, resume_id, resume_updated_at, method, report)
values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'rules', '{"notes":[]}'::jsonb);
select is((select profile ->> 'name' from public.resumes where id = 'a0000000-0000-0000-0000-000000000001'), 'Sam Lee', 'saving Improvement Notes leaves the resume as it was');

-- ---------------------------------------------------------------- user B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.improvement_notes), 0, 'another user cannot see Improvement Notes');

-- Resume files: each user's folder is theirs alone.
reset role;
insert into storage.objects (bucket_id, name, owner) values ('resumes', '11111111-1111-1111-1111-111111111111/a.pdf', '11111111-1111-1111-1111-111111111111');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'resumes'), 0, 'another user cannot see someone else''s resume files');

select * from finish();
rollback;
