begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.known_connections (id, full_name, normalized_name, company, linkedin_key)
values ('a0000000-0000-0000-0000-000000000001', 'Alex Chen', 'alex chen', 'AMD', 'alex-chen-1');

select throws_ok(
  $$insert into public.known_connections (full_name, normalized_name, linkedin_key) values ('Alex C', 'alex c', 'alex-chen-1')$$,
  '23505', null, 'the same LinkedIn profile cannot be imported twice');

insert into public.network_searches (id, original_query, target_count)
values ('a0000000-0000-0000-0000-000000000002', 'Find UofT CE alumni', 10);

insert into public.network_people (id, full_name, normalized_name, known_connection_id)
values ('a0000000-0000-0000-0000-000000000003', 'Priya Raman', 'priya raman', 'a0000000-0000-0000-0000-000000000001');

insert into public.network_person_facts (person_id, field, value, source_url, extracted_text, confidence)
values ('a0000000-0000-0000-0000-000000000003', 'institution', 'University of Toronto', 'https://example.org/team', 'Priya Raman, University of Toronto', 'high');

insert into public.network_search_people (search_id, person_id, tier)
values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'verified');

select throws_ok(
  $$insert into public.network_searches (original_query, target_count) values ('x', 500)$$,
  '23514', null, 'a search asks for at most 100 people');

select throws_ok(
  $$insert into public.network_people (full_name, normalized_name, proximity) values ('Z', 'z', 'second_degree')$$,
  '22P02', null, 'proximity has no automatic degree values');

select is((select count(*)::int from public.network_people), 1, 'owner sees their researched people');

-- ---------------------------------------------------------------- user B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.known_connections), 0, 'another user cannot see imported connections');
select is((select count(*)::int from public.network_searches), 0, 'another user cannot see searches');
select is((select count(*)::int from public.network_people), 0, 'another user cannot see researched people');
select is((select count(*)::int from public.network_person_facts), 0, 'another user cannot see evidence');
select is((select count(*)::int from public.network_search_people), 0, 'another user cannot see search results');

select throws_ok(
  $$insert into public.network_person_facts (person_id, field, value, source_url, extracted_text, confidence)
    values ('a0000000-0000-0000-0000-000000000003', 'company', 'X', 'https://x', 'x', 'low')$$,
  '23503', null, 'evidence cannot be attached to another user''s person');

select throws_ok(
  $$insert into public.network_search_people (search_id, person_id)
    values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003')$$,
  '23503', null, 'cannot link into another user''s search');

select throws_ok(
  $$insert into public.network_people (full_name, normalized_name, known_connection_id)
    values ('Y', 'y', 'a0000000-0000-0000-0000-000000000001')$$,
  '23503', null, 'cannot point at another user''s known connection');

select throws_ok(
  $$insert into public.known_connections (user_id, full_name, normalized_name)
    values ('11111111-1111-1111-1111-111111111111', 'Sneaky', 'sneaky')$$,
  '42501', null, 'cannot write rows for another user');

update public.network_people set notes = 'hijack' where id = 'a0000000-0000-0000-0000-000000000003';
delete from public.known_connections where id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select throws_ok($$select count(*) from public.known_connections$$, '42501', null, 'signed-out visitors cannot read connections');
select throws_ok($$select count(*) from public.network_people$$, '42501', null, 'signed-out visitors cannot read people');

reset role;
select is(
  (select notes from public.network_people where id = 'a0000000-0000-0000-0000-000000000003') is null
  and (select count(*) from public.known_connections where id = 'a0000000-0000-0000-0000-000000000001') = 1,
  true, 'another user''s update and delete change nothing');

select * from finish();
rollback;
