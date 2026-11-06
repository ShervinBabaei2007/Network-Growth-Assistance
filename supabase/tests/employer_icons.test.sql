begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
insert into public.employers (id, name, ats, board_token, website)
values ('e0000000-0000-0000-0000-000000000051', 'Acme', 'greenhouse', 'acme-icons', 'https://www.acme.test');

select is((select has_icon from public.employers where id = 'e0000000-0000-0000-0000-000000000051'), false, 'an employer starts without an icon');
select throws_ok($$ update public.employers set website = 'javascript:alert(1)' where id = 'e0000000-0000-0000-0000-000000000051' $$, '23514', null, 'a website must be an http(s) address');
select throws_ok($$ update public.employers set website = 'https://www.acme.test/careers' where id = 'e0000000-0000-0000-0000-000000000051' $$, '23514', null, 'a website is just the site, not a page path');

insert into public.employer_icons (employer_id, content_type, bytes) values ('e0000000-0000-0000-0000-000000000051', 'image/png', '\x89504e470d0a1a0a00'::bytea);
select is((select count(*)::int from public.employer_icons), 1, 'an icon can be stored');
select throws_ok($$ insert into public.employer_icons (employer_id, content_type, bytes) values ('e0000000-0000-0000-0000-000000000051', 'image/svg+xml', '\x3c737667'::bytea) $$, '23514', null, 'SVG is refused (it can carry script)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.employer_icons), 1, 'signed-in people can read icons');
select throws_ok($$ insert into public.employer_icons (employer_id, content_type, bytes) values ('e0000000-0000-0000-0000-000000000051', 'image/png', '\x89504e47'::bytea) $$, '42501', null, 'but cannot write them');

select * from finish();
rollback;
