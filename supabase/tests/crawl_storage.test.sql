begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
insert into public.employers (id, name, ats, board_token) values ('e0000000-0000-0000-0000-000000000002', 'Acme', 'greenhouse', 'acme-storage');

-- Four open postings with long descriptions: old and unsaved, old and saved, new, and old but looked at recently.
insert into public.jobs (id, employer_id, external_id, title, posted_at, first_seen_at, apply_url, description)
select ('b0000000-0000-0000-0000-00000000000' || n)::uuid, 'e0000000-0000-0000-0000-000000000002', n::text, 'Job ' || n, now() - interval '60 days',
       case when n = 3 then now() - interval '5 days' else now() - interval '60 days' end, 'https://boards.greenhouse.io/acme/jobs/' || n, repeat('x', 6000)
from generate_series(1, 4) n;
insert into public.job_requirements (job_id, idx, text, kind, category, embedding)
select ('b0000000-0000-0000-0000-00000000000' || n)::uuid, 0, 'SQL', 'must', 'skill', array_fill(0.1::real, array[384])::extensions.vector
from generate_series(1, 4) n;
insert into public.resumes (id, user_id, label, raw_text, profile, parsed_with, is_active)
values ('a0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Main', 'text', '{}'::jsonb, 'heuristic', true);
insert into public.job_user_states (user_id, job_id, status) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000002', 'saved');
insert into public.job_matches (user_id, job_id, resume_id, fit_score, tier, method, updated_at)
values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000009', 70, 'good', 'keywords', now() - interval '2 days');

select * from public.trim_stale_job_data();

select is((select char_length(description) from public.jobs where id = 'b0000000-0000-0000-0000-000000000001'), 4000, 'an old, unsaved posting keeps its first 4,000 characters');
select isnt((select description_trimmed_at from public.jobs where id = 'b0000000-0000-0000-0000-000000000001'), null, 'and is marked as shortened');
select is((select char_length(description) from public.jobs where id = 'b0000000-0000-0000-0000-000000000002'), 6000, 'a saved posting keeps its full text');
select is((select char_length(description) from public.jobs where id = 'b0000000-0000-0000-0000-000000000003'), 6000, 'a recent posting keeps its full text');

select is((select count(*)::int from public.job_requirements where job_id = 'b0000000-0000-0000-0000-000000000001' and embedding is null), 1, 'an unviewed old posting loses its requirement vectors');
select is((select count(*)::int from public.job_requirements where job_id = 'b0000000-0000-0000-0000-000000000002' and embedding is not null), 1, 'a saved posting keeps them');
select is((select count(*)::int from public.job_requirements where job_id = 'b0000000-0000-0000-0000-000000000003' and embedding is not null), 1, 'a recent posting keeps them');
select is((select count(*)::int from public.job_requirements where job_id = 'b0000000-0000-0000-0000-000000000004' and embedding is not null), 1, 'a posting looked at in the last 30 days keeps them');

select is((select count(*)::int from public.pending_requirement_embeddings(100) where job_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'dropped vectors are not queued to be rebuilt');

-- A source writing a fresh full description over a shortened one clears the "shortened" mark.
update public.jobs set description = repeat('y', 5000) where id = 'b0000000-0000-0000-0000-000000000001';
select is((select description_trimmed_at from public.jobs where id = 'b0000000-0000-0000-0000-000000000001'), null, 'a rewritten description is no longer marked shortened');

select ok((select public.storage_usage() ?& array['database_bytes', 'tables', 'jobs', 'jobs_shortened', 'requirement_vectors', 'ai_calls_today']), 'storage_usage reports the sizes the operator needs');
select is((select (public.storage_usage() ->> 'jobs_shortened')::bigint), (select count(*) from public.jobs where description_trimmed_at is not null), 'and counts shortened postings');

select * from finish();
rollback;
