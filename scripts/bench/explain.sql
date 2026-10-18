-- Plans and timings for the list and progress queries, as the benchmark user, with row-level security applied.
--   docker exec -i supabase_db_<project> psql -U postgres < scripts/bench/explain.sql
\set uid '''bbbbbbbb-0000-0000-0000-000000000001'''
\timing off
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', false);

\echo '== candidates: first page'
explain (analyze, costs off, timing off, summary on) select id, full_name, status, discovered_at from public.candidates order by discovered_at desc limit 50 offset 0;
\echo '== candidates: deep page (offset 19900)'
explain (analyze, costs off, timing off, summary on) select id, full_name, status, discovered_at from public.candidates order by discovered_at desc limit 50 offset 19900;
\echo '== candidates: total count'
explain (analyze, costs off, timing off, summary on) select count(*) from public.candidates;
\echo '== candidates: status filter + count'
explain (analyze, costs off, timing off, summary on) select id, full_name, status, discovered_at from public.candidates where status = 'approved' order by discovered_at desc limit 50;
explain (analyze, costs off, timing off, summary on) select count(*) from public.candidates where status = 'approved';
\echo '== candidates: review filter'
explain (analyze, costs off, timing off, summary on) select id from public.candidates where university_confidence = 'needs_review' or discipline_confidence = 'needs_review' order by discovered_at desc limit 50;
\echo '== candidates: text search'
explain (analyze, costs off, timing off, summary on) select id from public.candidates where full_name ilike '%bench-1%' or profile_key ilike '%bench-1%' or role ilike '%bench-1%' order by discovered_at desc limit 50;
\echo '== people: first page + count'
explain (analyze, costs off, timing off, summary on) select id, full_name from public.network_people where saved order by reminder_at asc nulls last, relevance_score desc nulls last limit 25;
explain (analyze, costs off, timing off, summary on) select count(*) from public.network_people where saved;
\echo '== applications: board/list'
explain (analyze, costs off, timing off, summary on) select id, title, stage from public.applications order by stage_changed_at desc limit 200;
explain (analyze, costs off, timing off, summary on) select stage, count(*) from public.applications group by stage;
\echo '== progress: invitations joined to candidates (all rows)'
explain (analyze, costs off, timing off, summary on) select i.id, i.outcome, i.sent_at, c.discipline from public.invitations i join public.candidates c on c.id = i.candidate_id and c.user_id = i.user_id;
\echo '== progress: category counts view'
explain (analyze, costs off, timing off, summary on) select * from public.candidate_category_counts;
\echo '== progress: discovered since'
explain (analyze, costs off, timing off, summary on) select count(*) from public.candidates where discovered_at >= now() - interval '7 days';
