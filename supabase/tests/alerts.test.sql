begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');
insert into public.jobs (id, employer_id, external_id, title, posted_at, apply_url)
values
  ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '1', 'Developer', now(), 'https://boards.greenhouse.io/acme/jobs/1'),
  ('b0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '2', 'Developer II', now(), 'https://boards.greenhouse.io/acme/jobs/2'),
  ('b0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', '3', 'Developer III', now(), 'https://boards.greenhouse.io/acme/jobs/3');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.saved_searches (id, name, query, alert_frequency, next_run_at, email_digest)
values ('5a000000-0000-0000-0000-000000000001', 'Developer · BC', '{"v":1,"params":{"q":"Developer"}}', 'daily', now() - interval '1 minute', true);
select lives_ok(
  $$insert into public.saved_search_matches (saved_search_id, job_id, status) values ('5a000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'baseline')$$,
  'a user records the baseline of their own search');
select throws_ok(
  $$insert into public.saved_search_matches (saved_search_id, job_id, status) values ('5a000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'pending')$$,
  '42501', null, 'users cannot queue announcements themselves');
select throws_ok($$update public.saved_searches set lease_until = now()$$, '42501', null, 'run state belongs to the cron');
select lives_ok($$update public.saved_searches set alert_frequency = 'daily', alert_hour = 9$$, 'users change when a search alerts');
select throws_ok(
  $$insert into public.notifications (user_id, kind, title, dedupe_key) values ('11111111-1111-1111-1111-111111111111', 'alert', 'Fake', 'x')$$,
  '42501', null, 'users cannot create notifications');
select throws_ok($$select public.deliver_alert('5a000000-0000-0000-0000-000000000001', 'r', 'x', '/jobs')$$, '42501', null, 'users cannot run the alert functions');
select throws_ok($$insert into public.email_deliveries (user_id, notification_id) values ('11111111-1111-1111-1111-111111111111', gen_random_uuid())$$, '42501', null, 'users cannot queue emails');

-- ---------------------------------------------------------------- user B sees none of it
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.saved_searches), 0, 'other users see no saved searches');
select is((select count(*)::int from public.saved_search_matches), 0, 'nor their matches');
select throws_ok(
  $$insert into public.saved_search_matches (saved_search_id, job_id, user_id, status) values ('5a000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'baseline')$$,
  '23503', null, 'nor can they attach matches to another user''s search');

-- ---------------------------------------------------------------- the cron (service role)
reset role;
set local role service_role;

select is((select count(*)::int from public.claim_due_saved_searches(10, 300) where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'a due search is claimed');
select is((select count(*)::int from public.claim_due_saved_searches(10, 300) where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'a leased search is not claimed again by an overlapping run');

insert into public.saved_search_matches (saved_search_id, job_id, user_id, status)
values
  ('5a000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'pending'),
  ('5a000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'pending');
-- Email only when the user has opted in globally too.
update public.settings set email_notifications = true where user_id = '11111111-1111-1111-1111-111111111111';

select isnt(public.deliver_alert('5a000000-0000-0000-0000-000000000001', 'run-1', 'Developer · BC', '/notifications'), null, 'new matches become a notification');
select is((select title from public.notifications where user_id = '11111111-1111-1111-1111-111111111111'), '2 new jobs for Developer · BC', 'it says how many');
select is(public.deliver_alert('5a000000-0000-0000-0000-000000000001', 'run-1', 'Developer · BC', '/notifications'), null, 'running it again finds nothing new');
select is((select count(*)::int from public.notifications where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'and creates no second notification');
select is((select count(*)::int from public.email_deliveries where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'one email is queued');
select is((select count(*)::int from public.saved_search_matches where user_id = '11111111-1111-1111-1111-111111111111' and status = 'notified'), 2, 'the matches are marked as announced');

select isnt(public.notify_user('11111111-1111-1111-1111-111111111111', 'reminder', 'Follow up', null, '/applications', 'reminder:1'), null, 'a reminder notification is created');
select is(public.notify_user('11111111-1111-1111-1111-111111111111', 'reminder', 'Follow up', null, '/applications', 'reminder:1'), null, 'and only once');

-- The 20-search limit.
reset role;
insert into public.saved_searches (user_id, name, query) select '11111111-1111-1111-1111-111111111111', 'S' || g, '{"v":1,"params":{}}' from generate_series(2, 20) g;
select throws_ok(
  $$insert into public.saved_searches (user_id, name, query) values ('11111111-1111-1111-1111-111111111111', 'One too many', '{"v":1,"params":{}}')$$,
  '23514', null, 'a user keeps at most 20 saved searches');

-- A job that is deleted takes its matches with it; the notification stays.
delete from public.jobs where id = 'b0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.saved_search_matches where job_id = 'b0000000-0000-0000-0000-000000000002'), 0, 'a deleted job''s matches go with it');

select * from finish();
rollback;
