begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');
insert into public.network_people (id, user_id, full_name, normalized_name)
values
  ('f0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Riley Chen', 'riley chen'),
  ('f0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'B Contact', 'b contact');
insert into public.applications (id, user_id, title, stage) values ('d0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Developer', 'applied');
insert into public.applications (id, user_id, title, stage) values ('d0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Other', 'applied');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Referrals
select ok(public.record_referral('f0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'referral_asked'), 'asking for a referral is recorded');
select ok(not public.record_referral('f0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'referral_asked'), 'recording it again does nothing');
select is((select count(*)::int from public.application_events where kind = 'referral'), 1, 'it appears once on the timeline');
select is((select detail from public.application_events where kind = 'referral'), 'Asked Riley Chen', 'naming the person');
select is((select role from public.application_contacts where person_id = 'f0000000-0000-0000-0000-00000000000a'), 'referrer', 'and they become the application''s referrer');
select ok(public.record_referral('f0000000-0000-0000-0000-00000000000a', null, 'referral_given'), 'a referral can be recorded without an application');
select ok(public.undo_referral('f0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'referral_asked'), 'undo removes it');
select is((select count(*)::int from public.application_events where kind = 'referral'), 0, 'and its timeline entry');

-- Cross-user references are rejected.
select throws_ok($$select public.record_referral('f0000000-0000-0000-0000-00000000000b', null, 'referral_asked')$$, '23503', null, 'another user''s person cannot be used');
select throws_ok($$select public.record_referral('f0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000b', 'referral_asked')$$, '23503', null, 'nor another user''s application');

-- Company decisions are private and stored once per pair.
insert into public.company_aliases (a_key, b_key, decision) values ('amazon', 'amazon canada', 'same');
select throws_ok($$insert into public.company_aliases (a_key, b_key, decision) values ('amazon canada', 'amazon', 'same')$$, '23514', null, 'a pair is stored in one order only');
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.company_aliases), 0, 'other users don''t see your company decisions');

select * from finish();
rollback;
