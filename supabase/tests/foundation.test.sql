begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000001', 'Acme', 'greenhouse', 'acme');
insert into public.jobs (id, employer_id, external_id, title, posted_at, apply_url)
values ('b0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '1', 'Developer', now(), 'https://boards.greenhouse.io/acme/jobs/1');
insert into public.resumes (id, user_id, label, raw_text, profile, parsed_with, is_active)
values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A', 'text', '{}'::jsonb, 'heuristic', true),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B', 'text', '{}'::jsonb, 'heuristic', true);
insert into public.job_matches (id, user_id, job_id, resume_id, fit_score, tier, method)
values ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 80, 'strong', 'keywords');

-- ---------------------------------------------------------------- rate limits, as user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select ok(public.hit_rate_limit('test.bucket', 2, 3600), 'the first use is allowed');
select ok(public.hit_rate_limit('test.bucket', 2, 3600), 'the second use is allowed');
select ok(not public.hit_rate_limit('test.bucket', 2, 3600), 'the third use in the window is refused');
select ok(public.hit_rate_limit('other.bucket', 2, 3600), 'each action has its own allowance');
select throws_ok($$select * from public.rate_limits$$, '42501', null, 'users cannot read the counters');
select throws_ok($$insert into public.rate_limits (user_id, bucket, window_start) values ('11111111-1111-1111-1111-111111111111', 'x', now())$$, '42501', null, 'users cannot reset their counters');

-- ---------------------------------------------------------------- tailored_documents.resume_id
select throws_ok(
  $$insert into public.tailored_documents (match_id, kind, method, generated, resume_id) values ('c0000000-0000-0000-0000-000000000001', 'resume', 'ai', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002')$$,
  '23503', null, 'a document cannot point at another user''s resume');
insert into public.tailored_documents (id, match_id, kind, method, generated, resume_id)
values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'cover_letter', 'ai', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001');
select is((select resume_id from public.tailored_documents where id = 'd0000000-0000-0000-0000-000000000001'), 'a0000000-0000-0000-0000-000000000001'::uuid, 'a document can point at its owner''s resume');

-- ---------------------------------------------------------------- anonymous
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.hit_rate_limit('test.bucket', 2, 3600)$$, '42501', null, 'anonymous callers cannot use rate limits');

reset role;
select is(
  (select count from public.rate_limits where user_id = '11111111-1111-1111-1111-111111111111' and bucket = 'test.bucket'),
  2, 'refused uses are not counted');

select * from finish();
rollback;
