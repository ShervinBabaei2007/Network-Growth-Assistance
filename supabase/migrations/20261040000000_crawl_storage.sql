-- Keeping the database small as more countries and employers are added.
--  1. Old postings that nobody saved keep a shortened description (the first 4,000 characters, which is all the Jobs
--     list reads) and their fingerprint; requirements were already read from the full text.
--  2. Postings nobody has looked at for 30 days lose their requirement vectors (the biggest tables by size). They are
--     not rebuilt unless someone opens the posting again, so this does not turn into a loop.
--  3. storage_usage() reports sizes for the operator.

alter table public.jobs add column description_trimmed_at timestamptz;

-- If a source writes a fresh full description over a shortened one, the "shortened" note must go.
create function public.jobs_clear_trim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.description is distinct from old.description and new.description_trimmed_at is not distinct from old.description_trimmed_at then
    new.description_trimmed_at := null;
  end if;
  return new;
end;
$$;

create trigger jobs_clear_trim before update of description on public.jobs
  for each row execute function public.jobs_clear_trim();

-- A posting is "in use" while it is new (30 days), someone has a saved/applied/dismissed state on it, or a fit check
-- for it was made in the last 30 days (the Jobs list makes one when it shows the posting).
create function public.job_in_use(p_job uuid, p_first_seen timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_first_seen > now() - interval '30 days'
    or exists (select 1 from public.job_user_states s where s.job_id = p_job)
    or exists (select 1 from public.job_matches m where m.job_id = p_job and m.updated_at > now() - interval '30 days')
$$;

-- Only postings in use are embedded, so dropped vectors aren't rebuilt.
create or replace function public.pending_requirement_embeddings(p_limit integer)
returns table (job_id uuid, idx smallint, text text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.job_id, r.idx, r.text
  from public.job_requirements r
  join public.jobs j on j.id = r.job_id
  where r.embedding is null and j.closed_at is null and j.date_source <> 'unknown' and j.posted_at > now() - interval '90 days'
    and public.job_in_use(j.id, j.first_seen_at)
  order by j.posted_at desc, r.idx
  limit p_limit;
$$;

-- Daily housekeeping for the shared postings. Bounded per run so it stays quick; it catches up over days.
create function public.trim_stale_job_data(p_batch integer default 2000)
returns table (descriptions_trimmed integer, embeddings_dropped integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trimmed integer;
  v_dropped integer;
begin
  update public.jobs
  set description = left(description, 4000), description_trimmed_at = now()
  where id in (
    select j.id from public.jobs j
    where j.user_id is null and j.description_trimmed_at is null and char_length(j.description) > 4000
      and j.first_seen_at < now() - interval '45 days'
      and not exists (select 1 from public.job_user_states s where s.job_id = j.id)
    limit p_batch);
  get diagnostics v_trimmed = row_count;

  update public.job_requirements
  set embedding = null
  where (job_id, idx) in (
    select r.job_id, r.idx from public.job_requirements r
    join public.jobs j on j.id = r.job_id
    where r.embedding is not null and not public.job_in_use(j.id, j.first_seen_at)
    limit p_batch * 5);
  get diagnostics v_dropped = row_count;

  return query select v_trimmed, v_dropped;
end;
$$;

-- What the operator watches: database size, the largest tables, vectors, shortened postings and AI use.
create function public.storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.relname, 'rows', t.n_live_tup, 'bytes', pg_total_relation_size(t.relid)) order by pg_total_relation_size(t.relid) desc)
      from (select relname, n_live_tup, relid from pg_stat_user_tables where schemaname = 'public' order by pg_total_relation_size(relid) desc limit 8) t), '[]'::jsonb),
    'jobs', (select count(*) from public.jobs),
    'jobs_shortened', (select count(*) from public.jobs where description_trimmed_at is not null),
    'requirements', (select count(*) from public.job_requirements),
    'requirement_vectors', (select count(*) from public.job_requirements where embedding is not null),
    'ai_calls_today', coalesce((select sum(used) from public.ai_usage where day = current_date), 0),
    'ai_calls_30_days', coalesce((select sum(used) from public.ai_usage where day > current_date - 30), 0)
  )
$$;

revoke all on function public.job_in_use(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.trim_stale_job_data(integer) from public, anon, authenticated;
revoke all on function public.storage_usage() from public, anon, authenticated;
grant execute on function public.job_in_use(uuid, timestamptz) to service_role;
grant execute on function public.trim_stale_job_data(integer) to service_role;
grant execute on function public.storage_usage() to service_role;
