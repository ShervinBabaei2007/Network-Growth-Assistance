begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');

-- Written by the server (service role): free job sources, no keys.
select lives_ok(
  $$insert into public.jobs (id, source, provider_key, external_id, title, posted_at, apply_url, remote)
    values ('f0000000-0000-0000-0000-000000000001', 'jobicy', 'jobicy:900000001', '900000001', 'Senior Full Stack Engineer', now(), 'https://jobicy.com/jobs/900000001-senior-full-stack-engineer-6', true)$$,
  'a Jobicy listing can be stored');
select lives_ok(
  $$insert into public.jobs (id, source, provider_key, external_id, title, posted_at, apply_url, remote)
    values ('f0000000-0000-0000-0000-000000000002', 'remotive', 'remotive:900000002', '900000002', 'Backend Engineer', now() - interval '2 days', 'https://remotive.com/remote-jobs/software-dev/backend-engineer-900000002', true)$$,
  'a Remotive listing can be stored');
select is((select verification_status::text from public.jobs where id = 'f0000000-0000-0000-0000-000000000001'), 'pending_validation', 'Jobicy listings start unverified');
select lives_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url, country, countries) values ('arbeitnow', 'arbeitnow:pgtap-only-1', 'pgtap-only-1', 'Data Analyst', now(), 'https://www.arbeitnow.com/jobs/companies/x/pgtap-only-1', 'DE', '{DE}')$$,
  'an Arbeitnow listing can be stored');
select lives_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url, country, countries, province) values ('usajobs', 'usajobs:900000003', '900000003', 'Registered Nurse', now(), 'https://www.usajobs.gov/job/900000003', 'US', '{US}', 'WA')$$,
  'a USAJOBS announcement can be stored');
select throws_ok(
  $$insert into public.jobs (source, external_id, title, posted_at, apply_url) values ('jobicy', '1', 'No key', now(), 'https://jobicy.com/jobs/1-x')$$,
  '23514', null, 'a job-site listing needs its provider key');
select throws_ok(
  $$insert into public.jobs (source, provider_key, employer_id, external_id, title, posted_at, apply_url) values ('jobicy', 'jobicy:2', 'e0000000-0000-0000-0000-000000000001', '2', 'Pretend board job', now(), 'https://jobicy.com/jobs/2-x')$$,
  '23514', null, 'a job-site listing never claims an employer board');
select throws_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url) values ('linkedin', 'linkedin:1', '1', 'Scraped', now(), 'https://www.linkedin.com/jobs/view/1')$$,
  '23514', null, 'unknown sources are rejected');
select throws_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url) values ('jobicy', 'jobicy:900000001', '900000001', 'Again', now(), 'https://jobicy.com/jobs/900000001-x')$$,
  '23505', null, 'a Jobicy listing is stored once');

-- The cursor for the next page of a Jobicy search is kept with the cached answer.
insert into public.job_search_cache (query_key, provider, result_count, status, next_cursor) values ('jobicy:pgtap-only-test||7|p1', 'jobicy', 3, 'ok', 'AgAAAA');
select is((select next_cursor from public.job_search_cache where query_key = 'jobicy:pgtap-only-test||7|p1'), 'AgAAAA', 'the next-page cursor is cached');

-- Unseen for 30 days: job-site listings are closed like Adzuna's.
update public.jobs set last_seen_at = now() - interval '31 days' where id = 'f0000000-0000-0000-0000-000000000002';
select public.prune_jobs();
select is((select verification_status::text from public.jobs where id = 'f0000000-0000-0000-0000-000000000002'), 'unavailable', 'a Remotive listing not seen for 30 days is closed');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.jobs where id = 'f0000000-0000-0000-0000-000000000001'), 1, 'signed-in users read Jobicy listings');
select throws_ok(
  $$insert into public.jobs (source, provider_key, external_id, title, posted_at, apply_url) values ('jobicy', 'jobicy:99', '99', 'Fake', now(), 'https://jobicy.com/jobs/99-fake')$$,
  '42501', null, 'users cannot add job-site listings');

select * from finish();
rollback;
