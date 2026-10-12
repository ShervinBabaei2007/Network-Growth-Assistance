begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- ---------------------------------------------------------------- the rule, for every table
-- Every public table with a user_id column must cascade from auth.users, so deleting an
-- account can never leave rows behind. A new table that forgets it fails here by name.
select is(
  (select coalesce(string_agg(c.table_name, ', ' order by c.table_name), '')
   from information_schema.columns c
   join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public' and c.column_name = 'user_id'
     and not exists (
       select 1 from pg_constraint k
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
       where k.conrelid = format('public.%I', c.table_name)::regclass and k.contype = 'f'
         and k.confrelid = 'auth.users'::regclass and a.attname = 'user_id' and k.confdeltype = 'c')),
  '',
  'every user-owned table cascades from the account');

-- ---------------------------------------------------------------- and in practice
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'gone@example.test');
insert into public.candidates (id, user_id, full_name, profile_url, profile_key, status)
values ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'X', 'u', 'x', 'approved');
insert into public.invitations (user_id, candidate_id, sent_at) values ('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000001', now());
insert into public.connection_snapshots (user_id, total_connections) values ('33333333-3333-3333-3333-333333333333', 1000);
insert into public.daily_queue (user_id, queue_date, candidate_id, rank, reason) values ('33333333-3333-3333-3333-333333333333', current_date, 'cccccccc-0000-0000-0000-000000000001', 1, 'r');
insert into public.job_runs (user_id, job, run_date) values ('33333333-3333-3333-3333-333333333333', 'daily', current_date);
insert into public.activity_logs (user_id, kind) values ('33333333-3333-3333-3333-333333333333', 'test');
insert into public.known_connections (user_id, full_name, normalized_name, company) values ('33333333-3333-3333-3333-333333333333', 'Sam Lee', 'sam lee', 'Acme');
insert into public.network_people (id, user_id, full_name, normalized_name) values ('f0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Pat Kim', 'pat kim');
insert into public.rate_limits (user_id, bucket, window_start, count) values ('33333333-3333-3333-3333-333333333333', 'test.bucket', now(), 1);
insert into public.resumes (id, user_id, label, raw_text, profile, parsed_with, is_active)
values ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Main', 'text', '{}'::jsonb, 'heuristic', true);
insert into public.jobs (id, user_id, source, external_id, title, posted_at, apply_url)
values ('b0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'manual', 'p3', 'Pasted role', now(), 'https://example.org/p3');
insert into public.job_user_states (user_id, job_id, status) values ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-000000000003', 'applied');
insert into public.applications (id, user_id, job_id, stage, title) values ('d0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-000000000003', 'interviewing', 'Pasted role');
insert into public.application_events (user_id, application_id, kind, detail) values ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000003', 'note', 'n');
insert into public.application_interviews (user_id, application_id, starts_at, timezone) values ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000003', now(), 'UTC');
insert into public.application_reminders (user_id, application_id, due_at, text) values ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000003', now(), 'r');
insert into public.application_documents (user_id, application_id, resume_id, kind, label, content)
values ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'resume', 'Resume', '{}'::jsonb);
insert into public.application_contacts (user_id, application_id, person_id) values ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003');

-- Rows the account holds in every user_id table, counted dynamically.
create temporary view account_rows as
select c.table_name,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where user_id = %L', c.table_name, '33333333-3333-3333-3333-333333333333'), false, true, '')))[1]::text::int as n
from information_schema.columns c
join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.column_name = 'user_id';

select ok((select count(*) from account_rows where n > 0) >= 15, 'the account has rows in many tables before deletion');
select ok((select n from account_rows where table_name = 'settings') = 1, 'the workspace exists before deletion');

delete from auth.users where id = '33333333-3333-3333-3333-333333333333';

select is(
  (select coalesce(string_agg(table_name || '=' || n, ', '), '') from account_rows where n > 0),
  '',
  'deleting the account leaves no rows in any user-owned table');

select * from finish();
rollback;
