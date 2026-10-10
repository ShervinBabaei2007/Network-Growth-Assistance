begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

insert into public.candidates (id, user_id, full_name, profile_url, profile_key, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ada', 'u', 'ada', 'approved'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Blocked', 'u', 'blocked', 'do_not_contact');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$select public.record_invitation_sent('aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day', '  Hi Ada  ')$$,
  'recording a sent invitation works');
select is((select status::text from public.candidates where profile_key = 'ada'), 'invitation_sent',
  'candidate status follows the invitation');
select ok((select had_note and note_text = 'Hi Ada' from public.invitations), 'note is trimmed and flagged');

select throws_ok(
  $$select public.record_invitation_sent('aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23505', 'An invitation to this person is already recorded.', 'the same person cannot be invited twice');
select throws_ok(
  $$select public.record_invitation_sent('aaaaaaaa-0000-0000-0000-000000000002')$$,
  'P0001', null, 'do-not-contact candidates cannot be invited');
select throws_ok(
  $$select public.record_invitation_sent('aaaaaaaa-0000-0000-0000-000000000001', now() + interval '1 day')$$,
  '23505', null, 'the duplicate check runs before anything else');

select lives_ok(
  $$select public.resolve_invitation('aaaaaaaa-0000-0000-0000-000000000001', 'accepted', now() - interval '3 days')$$,
  'resolving as accepted works');
select ok(
  (select resolved_at = sent_at from public.invitations),
  'an acceptance dated before the send time is clamped to the send time');
select is((select status::text from public.candidates where profile_key = 'ada'), 'connected', 'accepted → connected');

select throws_ok(
  $$select public.resolve_invitation('aaaaaaaa-0000-0000-0000-000000000001', 'declined')$$,
  'P0002', null, 'a resolved invitation cannot be resolved again');

select lives_ok(
  $$select public.delete_invitation('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'a mistaken invitation can be removed');
select is((select status::text from public.candidates where profile_key = 'ada'), 'approved', 'and the person returns to approved');

-- Another user cannot act on these candidates.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$select public.record_invitation_sent('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'P0002', 'Candidate not found.', 'RLS hides other users'' candidates from the functions');

reset role;
select is(
  (select project_start_date from public.settings where user_id = '11111111-1111-1111-1111-111111111111'),
  (now() at time zone 'America/Vancouver')::date,
  'a new workspace starts on today''s date in the default time zone, not UTC');

select * from finish();
rollback;
