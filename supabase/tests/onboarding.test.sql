begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select onboarding from public.settings), '{}'::jsonb, 'a new user starts with empty onboarding state');
select lives_ok(
  $$update public.settings set onboarding = '{"status":"in_progress","step":1}'::jsonb$$,
  'a user saves their own onboarding state');
select throws_ok(
  $$update public.settings set onboarding = '[1]'::jsonb$$,
  '23514', null, 'onboarding must be an object');
select throws_ok(
  $$update public.settings set onboarding = jsonb_build_object('x', repeat('a', 3000))$$,
  '23514', null, 'onboarding is size-limited');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select onboarding from public.settings), '{}'::jsonb, 'another user''s onboarding state is untouched and separate');

select * from finish();
rollback;
