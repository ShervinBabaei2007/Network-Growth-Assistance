-- Two more free, official job sources, shared like the other job sites (no employer row, a
-- provider key, their own link):
--   arbeitnow: Arbeitnow's free job board API (Europe and the UK), read by the crawl job.
--   usajobs:   USAJOBS, the U.S. federal government's job site (optional; a free key).
--
-- Additive only: existing rows are unchanged.

alter table public.jobs drop constraint jobs_source_check;
alter table public.jobs add constraint jobs_source_check check (source in ('ats', 'adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs', 'manual'));

alter table public.jobs drop constraint jobs_source_owner_check;
alter table public.jobs add constraint jobs_source_owner_check check (
  (source = 'ats' and employer_id is not null and user_id is null)
  or (source = 'manual' and user_id is not null and employer_id is null)
  or (source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs') and employer_id is null and user_id is null and provider_key is not null)
);

drop index public.jobs_pending_check_idx;
create index jobs_pending_check_idx on public.jobs (last_seen_at)
  where verification_status = 'pending_validation' and closed_at is null and source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs');

create or replace function public.prune_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  update public.jobs set closed_at = now(), verification_status = 'expired', verification_note = 'No longer listed by the source'
  where closed_at is null and employer_id is not null and last_seen_at < now() - interval '3 days';
  update public.jobs set closed_at = now(), verification_status = 'unavailable', verification_note = 'Not seen in search results for 30 days'
  where closed_at is null and source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs') and last_seen_at < now() - interval '30 days';
  delete from public.jobs j
  where (j.employer_id is not null or j.source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs')) and j.closed_at < now() - interval '30 days'
    and not exists (select 1 from public.job_user_states s where s.job_id = j.id and s.status in ('saved', 'applied'));
  get diagnostics v_deleted = row_count;
  delete from public.tailored_documents where deleted_at < now() - interval '7 days';
  delete from public.job_search_cache where fetched_at < now() - interval '1 day';
  return v_deleted;
end;
$$;

revoke all on function public.prune_jobs() from public, anon, authenticated;
grant execute on function public.prune_jobs() to service_role;
