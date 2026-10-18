begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.applications (id, title, stage) values ('d0000000-0000-0000-0000-000000000001', 'Role', 'interviewing');

select lives_ok($$insert into public.interview_preps (application_id, content) values ('d0000000-0000-0000-0000-000000000001', '{"heading":"x"}')$$, 'a user saves a prep pack for their application');
select throws_ok($$insert into public.interview_preps (application_id, content) values ('d0000000-0000-0000-0000-000000000001', '[1]')$$, '23514', null, 'a pack must be an object');
select throws_ok($$insert into public.interview_preps (application_id, content) values ('d0000000-0000-0000-0000-000000000009', '{}')$$, '23503', null, 'a pack needs one of the user''s own applications');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.interview_preps), 0, 'another user cannot see the pack');
select throws_ok($$insert into public.interview_preps (user_id, application_id, content) values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', '{}')$$, '42501', null, 'another user cannot add one');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.applications where id = 'd0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.interview_preps), 0, 'deleting the application removes its saved packs');

select * from finish();
rollback;
