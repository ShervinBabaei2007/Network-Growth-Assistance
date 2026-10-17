begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Workday career sites are employer boards like the others; their token is "tenant.wdN.site".
select lives_ok(
  $$insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-0000000000a1', 'Acme Bank', 'workday', 'acmebank.wd3.External_Careers')$$,
  'a Workday career site can be added to the directory');
select throws_ok(
  $$insert into public.employers (name, ats, board_token) values ('Bad', 'workday', 'acme/wd3/External')$$,
  '23514', null, 'Workday tokens are still plain identifiers');

-- Careerjet listings are shared job-site listings: a provider key, no employer, no owner.
select lives_ok(
  $$insert into public.jobs (id, source, provider_key, external_id, title, posted_at, apply_url, country, countries)
    values ('f0000000-0000-0000-0000-0000000000c1', 'careerjet', 'careerjet:a1b2c3d4e5f6', 'a1b2c3d4e5f6', 'Registered Nurse', now(), 'https://jobviewer.careerjet.ca/a1b2c3d4e5f6.html', 'CA', '{CA}')$$,
  'a Careerjet listing can be stored');
select throws_ok(
  $$insert into public.jobs (source, external_id, title, posted_at, apply_url) values ('careerjet', 'x1', 'No key', now(), 'https://jobviewer.careerjet.ca/x1.html')$$,
  '23514', null, 'a Careerjet listing needs its provider key');
select is((select verification_status::text from public.jobs where id = 'f0000000-0000-0000-0000-0000000000c1'), 'pending_validation', 'Careerjet listings start unverified');

-- The feed reads a short copy of each description.
update public.jobs set description = repeat('a', 5000) where id = 'f0000000-0000-0000-0000-0000000000c1';
select is((select length(description_head) from public.jobs where id = 'f0000000-0000-0000-0000-0000000000c1'), 4000, 'the feed''s copy of a description is its first 4,000 characters');

-- Unseen for 30 days: Careerjet listings are closed like the other job sites'.
update public.jobs set last_seen_at = now() - interval '31 days' where id = 'f0000000-0000-0000-0000-0000000000c1';
select public.prune_jobs();
select is((select verification_status::text from public.jobs where id = 'f0000000-0000-0000-0000-0000000000c1'), 'unavailable', 'a Careerjet listing not seen for 30 days is closed');

select * from finish();
rollback;
