begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- Each user's own schools and disciplines.
insert into public.universities (id, user_id, name) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'McGill University'),
  ('b1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Humber College');
insert into public.disciplines (id, user_id, name) values
  ('a2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Nursing'),
  ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Paralegal Studies');

insert into public.candidates
  (user_id, full_name, profile_url, profile_key, university, discipline,
   university_confidence, discipline_confidence, status)
values
  ('11111111-1111-1111-1111-111111111111', 'One', 'u1', 'one', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'confirmed', 'confirmed', 'approved'),
  ('11111111-1111-1111-1111-111111111111', 'Two', 'u2', 'two', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'confirmed', 'confirmed', 'approved'),
  ('11111111-1111-1111-1111-111111111111', 'Three', 'u3', 'three', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'confirmed', 'needs_review', 'awaiting_review'),
  ('22222222-2222-2222-2222-222222222222', 'Other', 'u4', 'other', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'confirmed', 'confirmed', 'approved');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select candidate_count from public.candidate_category_counts
   where discipline = 'a2000000-0000-0000-0000-000000000001' and university = 'a1000000-0000-0000-0000-000000000001' and status = 'approved' and classified),
  2, 'approved, classified candidates are grouped together');
select is(
  (select candidate_count from public.candidate_category_counts where not classified),
  1, 'a candidate with any unconfirmed field is not classified');
select is(
  (select count(*)::int from public.candidate_category_counts where discipline = 'b2000000-0000-0000-0000-000000000001'),
  0, 'the view respects RLS: another user''s counts are hidden');

reset role;
set local role anon;
select throws_ok(
  $$select * from public.candidate_category_counts$$,
  '42501', null, 'anonymous visitors cannot read the view');

select * from finish();
rollback;
