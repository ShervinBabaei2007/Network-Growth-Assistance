begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.jobs (id, user_id, source, external_id, title, posted_at, apply_url)
values ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'manual', 'jn1', 'Role', now(), 'https://example.org/jn1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.job_notes (job_id, body) values ('b0000000-0000-0000-0000-0000000000a1', 'Ask about remote days')$$, 'a user adds a note to a job');
select throws_ok($$insert into public.job_notes (job_id, body) values ('b0000000-0000-0000-0000-0000000000a1', 'second')$$, '23505', null, 'one note per job');
select throws_ok($$insert into public.job_filters (kind, pattern) values ('company', 'Acme')$$, '23514', null, 'patterns must be stored lower-case');
select lives_ok($$insert into public.job_filters (kind, pattern) values ('company', 'acme corp')$$, 'a user hides a company');
select throws_ok($$insert into public.job_filters (kind, pattern) values ('company', 'acme corp')$$, '23505', null, 'the same pattern is not stored twice');

insert into public.job_filters (kind, pattern) select 'title', 'word ' || g from generate_series(1, 199) g;
select throws_ok($$insert into public.job_filters (kind, pattern) values ('title', 'one too many')$$, 'P0001', null, 'a user can keep at most 200 filters');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.job_notes) + (select count(*)::int from public.job_filters), 0, 'another user sees neither notes nor filters');
select throws_ok($$insert into public.job_filters (user_id, kind, pattern) values ('11111111-1111-1111-1111-111111111111', 'title', 'sneaky')$$, '42501', null, 'another user cannot add filters for them');
select throws_ok($$insert into public.job_notes (user_id, job_id, body) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000a1', 'sneaky')$$, '42501', null, 'another user cannot add notes for them');

select * from finish();
rollback;
