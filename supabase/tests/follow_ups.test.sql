begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.candidates (id, full_name, profile_url, profile_key, status)
values
  ('c0000000-0000-0000-0000-000000000001', 'New Accept', 'u1', 'k1', 'approved'),
  ('c0000000-0000-0000-0000-000000000002', 'Old Accept', 'u2', 'k2', 'approved');

-- A fresh acceptance suggests all four touches, counted from the day it was accepted.
select public.record_invitation_sent('c0000000-0000-0000-0000-000000000001', now() - interval '2 days');
select is((select count(*)::int from public.follow_ups), 0, 'nothing is suggested while the invitation is pending');
select public.resolve_invitation('c0000000-0000-0000-0000-000000000001', 'accepted', now());
select is(
  (select string_agg(kind || ':' || (due_on - current_date), ',' order by due_on) from public.follow_ups where candidate_id = 'c0000000-0000-0000-0000-000000000001'),
  'thank_you:0,coffee_chat:7,check_in_30:30,check_in_90:90',
  'an acceptance suggests a thank-you, a coffee chat and two check-ins');

-- An acceptance from long ago only gets the touches still ahead.
select public.record_invitation_sent('c0000000-0000-0000-0000-000000000002', now() - interval '100 days');
select public.resolve_invitation('c0000000-0000-0000-0000-000000000002', 'accepted', now() - interval '60 days');
select is(
  (select string_agg(kind, ',' order by due_on) from public.follow_ups where candidate_id = 'c0000000-0000-0000-0000-000000000002'),
  'check_in_90',
  'an old acceptance only gets the check-in that is still ahead');

-- Acting on a touch is remembered, and marking done needs a time.
select lives_ok($$update public.follow_ups set state = 'done', done_at = now() where kind = 'thank_you' and candidate_id = 'c0000000-0000-0000-0000-000000000001'$$, 'a touch can be marked done');
select throws_ok($$update public.follow_ups set state = 'done' where kind = 'coffee_chat'$$, '23514', null, 'done needs a time');

-- Undoing the acceptance takes back touches not yet acted on, and keeps the one already done.
select public.delete_invitation('c0000000-0000-0000-0000-000000000001');
select is((select string_agg(kind, ',') from public.follow_ups where candidate_id = 'c0000000-0000-0000-0000-000000000001'), 'thank_you', 'undoing an acceptance keeps only what was already done');

-- Accepting again does not duplicate.
select public.record_invitation_sent('c0000000-0000-0000-0000-000000000001', now() - interval '1 day');
select public.resolve_invitation('c0000000-0000-0000-0000-000000000001', 'accepted', now());
select is((select count(*)::int from public.follow_ups where candidate_id = 'c0000000-0000-0000-0000-000000000001'), 4, 'a second acceptance does not duplicate touches');

-- Owners only.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.follow_ups), 0, 'another user cannot see these follow-ups');
select throws_ok(
  $$insert into public.follow_ups (user_id, candidate_id, kind, due_on) values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'thank_you', current_date)$$,
  '42501', null, 'another user cannot add follow-ups for them');

select * from finish();
rollback;
