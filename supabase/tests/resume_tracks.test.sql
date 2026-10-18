begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.jobs (id, user_id, source, external_id, title, posted_at, apply_url)
values ('b0000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'manual', 'rt1', 'Role', now(), 'https://example.org/rt1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.resumes (label, raw_text, profile, parsed_with, is_active) values ('Main', 't', '{}'::jsonb, 'heuristic', true)$$, 'the main resume can be current');
select lives_ok($$insert into public.resumes (label, raw_text, profile, parsed_with, is_active, track) values ('Data v1', 't', '{}'::jsonb, 'heuristic', true, 'Data')$$, 'a track has its own current resume');
select throws_ok($$insert into public.resumes (label, raw_text, profile, parsed_with, is_active, track) values ('Data v2', 't', '{}'::jsonb, 'heuristic', true, 'data')$$, '23505', null, 'a second current resume in the same track (ignoring case) is refused');
select throws_ok($$insert into public.resumes (label, raw_text, profile, parsed_with, is_active) values ('Main 2', 't', '{}'::jsonb, 'heuristic', true)$$, '23505', null, 'and so is a second current main resume');
select throws_ok($$insert into public.resumes (label, raw_text, profile, parsed_with, track) values ('Bad', 't', '{}'::jsonb, 'heuristic', ' padded ')$$, '23514', null, 'track names are trimmed');
select lives_ok($$insert into public.job_track_choices (job_id, track) values ('b0000000-0000-0000-0000-0000000000b1', 'Data')$$, 'a user picks a track for a job');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.job_track_choices), 0, 'another user cannot see the choice');

select * from finish();
rollback;
