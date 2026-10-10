begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'gone@example.test');
insert into public.candidates (id, user_id, full_name, profile_url, profile_key, status)
values ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'X', 'u', 'x', 'approved');
insert into public.invitations (user_id, candidate_id, sent_at) values ('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000001', now());
insert into public.connection_snapshots (user_id, total_connections) values ('33333333-3333-3333-3333-333333333333', 1000);
insert into public.daily_queue (user_id, queue_date, candidate_id, rank, reason) values ('33333333-3333-3333-3333-333333333333', current_date, 'cccccccc-0000-0000-0000-000000000001', 1, 'r');
insert into public.job_runs (user_id, job, run_date) values ('33333333-3333-3333-3333-333333333333', 'daily', current_date);
insert into public.activity_logs (user_id, kind) values ('33333333-3333-3333-3333-333333333333', 'test');

select ok(
  (select count(*) from public.settings where user_id = '33333333-3333-3333-3333-333333333333') = 1,
  'the workspace exists before deletion');

delete from auth.users where id = '33333333-3333-3333-3333-333333333333';

select is(
  (select
     (select count(*) from public.settings where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.targets where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.candidates where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.invitations where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.connection_snapshots where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.daily_queue where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.job_runs where user_id = '33333333-3333-3333-3333-333333333333')
   + (select count(*) from public.activity_logs where user_id = '33333333-3333-3333-3333-333333333333'))::int,
  0,
  'deleting the account removes every row in every table');

select * from finish();
rollback;
