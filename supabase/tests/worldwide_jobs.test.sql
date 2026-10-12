begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- Search preferences: one country, Canada by default.
select is((select job_country from public.settings where user_id = '11111111-1111-1111-1111-111111111111'), 'CA', 'users start searching Canada');
update public.settings set job_country = 'DE' where user_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$update public.settings set job_country = 'Germany' where user_id = '22222222-2222-2222-2222-222222222222'$$, '23514', null, 'a country is an ISO code');
select lives_ok($$update public.settings set job_country = '*' where user_id = '11111111-1111-1111-1111-111111111111'$$, '"*" means remote jobs open anywhere');
update public.settings set job_country = 'CA' where user_id = '11111111-1111-1111-1111-111111111111';

-- The crawler keeps jobs for the countries users search.
select results_eq($$select c from public.job_search_countries() c order by c$$, $$values ('CA'), ('DE')$$, 'the searched countries');

-- Where a job can be done: countries, region tokens and "*".
insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000009', 'Acme', 'greenhouse', 'acme-world');
select lives_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url, country, countries) values ('e0000000-0000-0000-0000-000000000009', 'w1', 'Designer', now(), 'https://boards.greenhouse.io/acme-world/jobs/1', 'DE', '{DE}')$$,
  'a job in Germany');
select lives_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url, remote, countries) values ('e0000000-0000-0000-0000-000000000009', 'w2', 'Support Agent', now(), 'https://boards.greenhouse.io/acme-world/jobs/2', true, '{emea,*}')$$,
  'a remote job open to EMEA and anywhere');
select throws_ok(
  $$insert into public.jobs (employer_id, external_id, title, posted_at, apply_url, countries) values ('e0000000-0000-0000-0000-000000000009', 'w3', 'Bad', now(), 'https://boards.greenhouse.io/acme-world/jobs/3', '{Germany!}')$$,
  '23514', null, 'only codes, region tokens and "*"');
select is((select count(*)::int from public.jobs where employer_id = 'e0000000-0000-0000-0000-000000000009' and countries && array['FR', 'europe', 'emea', '*']), 1, 'a search from France finds the remote EMEA job, not the one in Germany');

-- Server only.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$select * from public.job_search_countries()$$, '42501', null, 'users cannot list other users'' countries');

select * from finish();
rollback;
