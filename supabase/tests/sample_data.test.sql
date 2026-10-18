begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'demo@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'real@example.test');

-- Another user's own data must survive both calls.
insert into public.universities (user_id, name) values ('22222222-2222-2222-2222-222222222222', 'Their School');

-- An account that already has its own data is refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into public.universities (name) values ('My own school');
select throws_ok($$select public.seed_sample_data()$$, 'P0001', null, 'example data is refused on an account that has its own data');

-- Start the demo.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$select public.seed_sample_data()$$, 'a new user can add example data');
select ok((select sample_data from public.settings), 'the account is marked as showing example data');
select is((select count(*)::int from public.candidates where is_sample), 30, 'thirty example people are added');
select ok((select count(*) from public.applications where is_sample) > 0 and (select count(*) from public.connection_snapshots where is_sample) > 0, 'applications and snapshots are added');

-- Calling it again changes nothing.
select public.seed_sample_data();
select is((select count(*)::int from public.candidates), 30, 'adding example data twice does not duplicate it');

-- The user adds one real thing of their own, then clears the examples.
insert into public.candidates (full_name, profile_url, profile_key, status) values ('Real Person', 'https://example.org/real', 'real-person', 'new');
select public.clear_sample_data();
select is((select string_agg(full_name, ',') from public.candidates), 'Real Person', 'clearing leaves only what the user added');
select is(
  (select (select count(*) from public.universities) + (select count(*) from public.disciplines) + (select count(*) from public.targets)
        + (select count(*) from public.invitations) + (select count(*) from public.applications) + (select count(*) from public.connection_snapshots)),
  0::bigint, 'clearing leaves no example rows in any other table');
select ok((select not sample_data and overall_target is null and baseline_connections is null from public.settings), 'clearing resets the plan and the flag');

-- Another user's rows are untouched.
reset role;
select is((select count(*)::int from public.universities where user_id = '22222222-2222-2222-2222-222222222222'), 1, 'another user''s data is untouched');

select * from finish();
rollback;
