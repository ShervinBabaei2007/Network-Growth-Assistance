begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- B's own school, which A must not be able to use.
insert into public.universities (id, user_id, name) values ('b1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Humber College');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.universities (id, name, aliases) values ('a1000000-0000-0000-0000-000000000001', 'McGill University', '{McGill}')$$,
  'a user adds any school, with its other spellings');
select lives_ok(
  $$insert into public.disciplines (id, name, aliases) values ('a2000000-0000-0000-0000-000000000001', 'Nursing', '{BSN,BScN}')$$,
  'a user adds any discipline');
select throws_ok(
  $$insert into public.disciplines (name) values ('nursing')$$,
  '23505', null, 'the same discipline name twice is refused (ignoring case)');
select is((select count(*)::int from public.universities), 1, 'a user sees only their own schools');

insert into public.candidates (id, full_name, profile_url, profile_key, university, discipline, university_confidence, discipline_confidence, status)
values ('c0000000-0000-0000-0000-000000000001', 'Pat Example', 'https://www.linkedin.com/in/pat', 'pat', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'confirmed', 'confirmed', 'approved');
select throws_ok(
  $$update public.candidates set university = 'b1000000-0000-0000-0000-000000000001' where id = 'c0000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'a candidate can''t be put in another user''s school');

select lives_ok(
  $$insert into public.targets (discipline, university, target_count) values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 40)$$,
  'targets point at the user''s own discipline and school');

delete from public.universities where id = 'a1000000-0000-0000-0000-000000000001';
select is(
  (select university_confidence::text || '/' || coalesce(university::text, 'none') from public.candidates where id = 'c0000000-0000-0000-0000-000000000001'),
  'needs_review/none', 'removing a school sends its candidates back to review');
select is((select count(*)::int from public.targets where university is not null), 0, 'and removes its targets');

select * from finish();
rollback;
