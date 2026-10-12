begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- A = 1111…, B = 2222…
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');
insert into public.jobs (id, employer_id, external_id, title, company, location_text, posted_at, apply_url)
values
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '1', 'Developer', 'Acme', 'Vancouver, BC', now(), 'https://boards.greenhouse.io/acme/jobs/1'),
  ('b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '2', 'Tester', 'Acme', 'Remote', now(), 'https://boards.greenhouse.io/acme/jobs/2');
-- B's own pasted posting: A must not be able to track it.
insert into public.jobs (id, user_id, source, external_id, title, posted_at, apply_url)
values ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'manual', 'p', 'Secret role', now(), 'https://example.org/p');
insert into public.network_people (id, user_id, full_name, normalized_name) values ('f0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'B Contact', 'b contact');
insert into public.network_people (id, user_id, full_name, normalized_name) values ('f0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'A Contact', 'a contact');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Save, then save again (double click): one application.
select isnt(public.sync_application_for_job('b0000000-0000-0000-0000-000000000001', 'saved'), null, 'saving a job creates an application');
select lives_ok($$select public.sync_application_for_job('b0000000-0000-0000-0000-000000000001', 'saved')$$, 'saving again is harmless');
select is((select count(*)::int from public.applications), 1, 'saving twice keeps one application');
select is((select title from public.applications), 'Developer', 'the posting details are copied');

-- I applied, twice.
select public.sync_application_for_job('b0000000-0000-0000-0000-000000000001', 'applied');
select public.sync_application_for_job('b0000000-0000-0000-0000-000000000001', 'applied');
select is((select stage::text from public.applications), 'applied', 'marking applied moves it to applied');
select isnt((select applied_on from public.applications), null, 'the applied date is recorded');
select is((select count(*)::int from public.applications), 1, 'marking applied twice keeps one application');
select is((select count(*)::int from public.application_events where kind = 'stage'), 1, 'one stage change is on the timeline');

-- Stage changes with the version check.
select is(
  public.set_application_stage((select id from public.applications), 'screening', (select version from public.applications)),
  3, 'moving a stage bumps the version');
select throws_ok(
  $$select public.set_application_stage((select id from public.applications), 'interviewing', 1)$$,
  '40001', null, 'a stale version is refused');
select is((select stage::text from public.applications), 'screening', 'a refused change leaves the stage alone');

-- Save on a job that's further along doesn't move it back.
select public.sync_application_for_job('b0000000-0000-0000-0000-000000000001', 'saved');
select is((select stage::text from public.applications), 'screening', 'Save never moves an application backwards');

-- Users can't write stage or version directly, or forge timeline history.
select throws_ok($$update public.applications set stage = 'offer'$$, '42501', null, 'the stage only changes through set_application_stage');
select throws_ok($$update public.applications set version = 99$$, '42501', null, 'the version cannot be set directly');
select lives_ok($$update public.applications set notes = 'Spoke to Sam' $$, 'notes can be edited');
select throws_ok(
  $$insert into public.application_events (application_id, kind, to_stage) values ((select id from public.applications), 'stage', 'offer')$$,
  '42501', null, 'stage history cannot be forged');
select lives_ok(
  $$insert into public.application_events (application_id, kind, detail) values ((select id from public.applications), 'note', 'Followed up')$$,
  'a note can be added to the timeline');
select throws_ok($$update public.application_events set detail = 'changed'$$, '42501', null, 'the timeline cannot be rewritten');

-- Close, reopen, apply again.
select public.set_application_stage((select id from public.applications), 'rejected', (select version from public.applications));
select is(public.sync_application_for_job('b0000000-0000-0000-0000-000000000001', 'applied'), null, 'I applied on a closed application does not start a new attempt');
select is((select count(*)::int from public.applications), 1, 'still one application');
select public.set_application_stage((select id from public.applications), 'interviewing', (select version from public.applications));
select is((select count(*)::int from public.application_events where kind = 'reopened'), 1, 'reopening is recorded as such');
select public.set_application_stage((select id from public.applications), 'withdrawn', (select version from public.applications));
select isnt(public.apply_again((select id from public.applications where attempt = 1), 'applied'), null, 'a closed application can be started again');
select is((select max(attempt)::int from public.applications), 2, 'the new attempt is numbered');
select throws_ok(
  $$select public.set_application_stage((select id from public.applications where attempt = 1), 'applied', (select version from public.applications where attempt = 1))$$,
  '23505', null, 'two attempts at one job cannot both be open');

-- Releasing (undo Save) only removes an application with nothing entered.
select public.sync_application_for_job('b0000000-0000-0000-0000-000000000002', 'saved');
select ok(public.release_application_for_job('b0000000-0000-0000-0000-000000000002'), 'an untouched saved application is removed on undo');
insert into public.application_events (application_id, kind, detail) values ((select id from public.applications where attempt = 2), 'note', 'Asked about the team');
select ok(not public.release_application_for_job('b0000000-0000-0000-0000-000000000001'), 'an application with something the user entered is kept');

-- Cross-user references.
select throws_ok($$select public.sync_application_for_job('b0000000-0000-0000-0000-00000000000b', 'saved')$$, 'P0002', null, 'another user''s pasted job cannot be tracked');
select throws_ok(
  $$insert into public.applications (job_id, title) values ('b0000000-0000-0000-0000-00000000000b', 'x')$$,
  '23503', null, 'nor inserted directly');
select throws_ok(
  $$insert into public.application_contacts (application_id, person_id) values ((select id from public.applications where attempt = 2), 'f0000000-0000-0000-0000-00000000000b')$$,
  '23503', null, 'another user''s contact cannot be linked');
select lives_ok(
  $$insert into public.application_contacts (application_id, person_id, role) values ((select id from public.applications where attempt = 2), 'f0000000-0000-0000-0000-00000000000a', 'recruiter')$$,
  'your own contact can be linked');

-- ---------------------------------------------------------------- user B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.applications), 0, 'other users see none of A''s applications');
select throws_ok(
  $$select public.set_application_stage((select id from public.applications limit 1), 'offer', 1)$$,
  'P0002', null, 'and cannot move them');

-- ---------------------------------------------------------------- the job disappears; then the account
reset role;
delete from public.jobs where id = 'b0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.applications where user_id = '11111111-1111-1111-1111-111111111111' and title = 'Developer' and job_id is null), 2, 'applications keep their details when the job is deleted');
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select (select count(*) from public.applications where user_id = '11111111-1111-1111-1111-111111111111')
        + (select count(*) from public.application_events where user_id = '11111111-1111-1111-1111-111111111111')
        + (select count(*) from public.application_contacts where user_id = '11111111-1111-1111-1111-111111111111'))::int,
  0, 'deleting the account removes every application row');

select * from finish();
rollback;
