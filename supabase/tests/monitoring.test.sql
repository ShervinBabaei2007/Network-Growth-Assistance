begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');

-- Signed-in people cannot read or write the monitoring tables, or call its functions.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$select * from public.rum_vitals$$, '42501', null, 'a signed-in user cannot read measurements');
select throws_ok($$insert into public.client_errors (fingerprint, source, route, message) values ('x', 'browser', '/', 'm')$$, '42501', null, 'a signed-in user cannot write errors');
select throws_ok($$select public.record_vital('/zz-test', 'LCP', 1000, 'good', 'phone')$$, '42501', null, 'a signed-in user cannot call record_vital');
reset role;

-- The server records measurements.
set local role service_role;
select ok(public.record_vital('/zz-test', 'LCP', 1000, 'good', 'phone'), 'a measurement is recorded');
select public.record_vital('/zz-test', 'LCP', 2000, 'good', 'phone');
select public.record_vital('/zz-test', 'LCP', 3000, 'needs-improvement', 'phone');
select public.record_vital('/zz-test', 'LCP', 5000, 'poor', 'phone');
select is((select p75 from public.monitoring_vitals(7) where route = '/zz-test' and metric = 'LCP' and device = 'phone'), 3500::double precision, 'p75 is computed per route, metric and device');
select is((select poor_share from public.monitoring_vitals(7) where route = '/zz-test'), 25.0::numeric, 'the share rated poor is reported');

-- Values are bounded by the table.
select throws_ok($$select public.record_vital('/zz-test', 'LCP', -1, 'good', 'phone')$$, '23514', null, 'a negative value is refused');
select throws_ok($$select public.record_vital('/zz-test', 'MADE_UP', 1, 'good', 'phone')$$, '23514', null, 'an unknown metric is refused');

-- Errors are grouped by fingerprint.
select public.record_client_error('abc', 'browser', '/overview', 'boom', 'at x', null);
select public.record_client_error('abc', 'browser', '/overview', 'boom', 'at x', null);
select is((select occurrences from public.client_errors where fingerprint = 'abc'), 2, 'the same error is counted, not duplicated');

-- Old rows are pruned.
update public.rum_vitals set created_at = now() - interval '40 days' where route = '/zz-test' and value = 1000;
select ok(public.prune_monitoring() >= 1, 'old measurements are pruned');

select * from finish();
rollback;
