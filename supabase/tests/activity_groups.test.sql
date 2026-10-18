begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.candidates (id, user_id, full_name, profile_url, profile_key, status, connected_via, connected_at)
values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A', 'u1', 'k1', 'approved', null, null),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'B', 'u2', 'k2', 'approved', null, null),
  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'C', 'u3', 'k3', 'approved', 'export', '2026-03-10 03:30:00+00');
-- Two invitations sent on the same Vancouver day (the second is already the next UTC day), one accepted later.
insert into public.invitations (user_id, candidate_id, sent_at, outcome, resolved_at)
values
  ('11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000001', '2026-03-10 20:00:00+00', 'pending', null),
  ('11111111-1111-1111-1111-111111111111', 'c1000000-0000-0000-0000-000000000002', '2026-03-11 02:00:00+00', 'accepted', '2026-03-12 18:00:00+00');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select sum(n)::int from public.activity_invitation_groups('11111111-1111-1111-1111-111111111111', 'America/Vancouver')), 2, 'every invitation is counted once');
select is(
  (select n from public.activity_invitation_groups('11111111-1111-1111-1111-111111111111', 'America/Vancouver') where outcome = 'pending' and sent_on = '2026-03-10'),
  1, 'days are the user''s local days, not UTC days');
select is(
  (select resolved_on from public.activity_invitation_groups('11111111-1111-1111-1111-111111111111', 'America/Vancouver') where outcome = 'accepted'),
  '2026-03-12'::date, 'the accepted day is local too');
select is(
  (select connected_on from public.activity_export_groups('11111111-1111-1111-1111-111111111111', 'America/Vancouver')),
  '2026-03-09'::date, 'an export connection at 03:30 UTC is the previous day in Vancouver');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.activity_invitation_groups('11111111-1111-1111-1111-111111111111', 'America/Vancouver')), 0, 'another user gets nothing for them');

select * from finish();
rollback;
