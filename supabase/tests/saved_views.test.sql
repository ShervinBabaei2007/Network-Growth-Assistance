begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.saved_views (page, name, query) values ('candidates', 'Needs review', 'review=1')$$, 'a user saves a view');
select throws_ok($$insert into public.saved_views (page, name, query) values ('candidates', '  needs REVIEW ', 'q=x')$$, '23505', null, 'view names are unique per page, ignoring case and spaces');
select throws_ok($$insert into public.saved_views (page, name, query) values ('elsewhere', 'X', '')$$, '23514', null, 'only known pages can have views');
select throws_ok($$insert into public.saved_views (page, name, query) values ('candidates', repeat('a', 61), '')$$, '23514', null, 'names are limited to 60 characters');

insert into public.saved_views (page, name) select 'candidates', 'v' || g from generate_series(1, 29) g;
select throws_ok($$insert into public.saved_views (page, name) values ('candidates', 'one too many')$$, 'P0001', null, 'a user can keep at most 30 views');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.saved_views), 0, 'another user cannot see these views');
select throws_ok($$insert into public.saved_views (user_id, page, name) values ('11111111-1111-1111-1111-111111111111', 'candidates', 'sneaky')$$, '42501', null, 'another user cannot add views for them');

select * from finish();
rollback;
