begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Two users; the signup trigger seeds their settings and targets.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

select is(
  (select count(*)::int from public.settings where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'signup creates one settings row');
select is(
  (select count(*)::int from public.targets where user_id = '11111111-1111-1111-1111-111111111111'),
  12, 'signup creates 4 discipline totals + U of T and UBC cells');
select is(
  (select sum(target_count)::int from public.targets
   where user_id = '11111111-1111-1111-1111-111111111111' and university is null),
  1000, 'discipline totals add up to 1,000');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.candidates (id, full_name, profile_url, profile_key)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alex Example',
        'https://www.linkedin.com/in/alex-example', 'alex-example');

select throws_ok(
  $$insert into public.candidates (full_name, profile_url, profile_key)
    values ('Alex Again', 'https://linkedin.com/in/alex-example/', 'alex-example')$$,
  '23505', null, 'duplicate profile_key for the same user is rejected');

insert into public.invitations (candidate_id, sent_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', now());

select throws_ok(
  $$insert into public.invitations (candidate_id, sent_at)
    values ('aaaaaaaa-0000-0000-0000-000000000001', now())$$,
  '23505', null, 'a second pending invitation for the same person is rejected');

select throws_ok(
  $$update public.invitations set outcome = 'accepted'
    where candidate_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null, 'a resolved invitation must have resolved_at');

select throws_ok(
  $$insert into public.candidates (full_name, profile_url, profile_key, university_confidence)
    values ('No School', 'https://linkedin.com/in/no-school', 'no-school', 'confirmed')$$,
  '23514', null, 'confidence cannot be confirmed when the value is missing');

select throws_ok(
  $$insert into public.job_runs (user_id, job, run_date)
    values ('11111111-1111-1111-1111-111111111111', 'daily', current_date)$$,
  '42501', null, 'users cannot write job_runs directly');

select throws_ok(
  $$insert into public.settings (user_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'users cannot insert settings rows');

-- ---------------------------------------------------------------- user B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.candidates), 0, 'B cannot see A''s candidates');
select is((select count(*)::int from public.invitations), 0, 'B cannot see A''s invitations');
select is((select count(*)::int from public.targets), 12, 'B sees only their own targets');

select is_empty(
  $$update public.candidates set notes = 'hijacked'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id$$,
  'B cannot update A''s candidate');

select throws_ok(
  $$insert into public.candidates (user_id, full_name, profile_url, profile_key)
    values ('11111111-1111-1111-1111-111111111111', 'Planted', 'https://linkedin.com/in/planted', 'planted')$$,
  '42501', null, 'B cannot insert rows owned by A');

select throws_ok(
  $$insert into public.invitations (candidate_id, sent_at)
    values ('aaaaaaaa-0000-0000-0000-000000000001', now())$$,
  '23503', null, 'B cannot attach an invitation to A''s candidate');

select lives_ok(
  $$insert into public.candidates (full_name, profile_url, profile_key)
    values ('Alex Example', 'https://www.linkedin.com/in/alex-example', 'alex-example')$$,
  'the same profile can exist independently in another workspace');

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select count(*) from public.candidates$$,
  '42501', null, 'anonymous visitors have no table access');

select * from finish();
rollback;
