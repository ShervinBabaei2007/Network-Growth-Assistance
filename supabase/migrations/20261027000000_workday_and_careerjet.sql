-- More jobs:
--   workday:   employers' Workday career sites, read by the crawler like the other boards
--              (board token "tenant.wdN.site", which the existing token check already allows).
--   careerjet: Careerjet's job search API (optional; a free publisher key), a shared job site
--              like Adzuna: no employer row, a provider key, its own link.
-- And a short copy of each description for the Jobs feed, which ranks up to 1,000 postings
-- per search and doesn't need their full text (up to 60,000 characters each).
--
-- Additive only: existing rows are unchanged.

alter type public.ats_kind add value if not exists 'workday';

alter table public.jobs drop constraint jobs_source_check;
alter table public.jobs add constraint jobs_source_check check (source in ('ats', 'adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs', 'careerjet', 'manual'));

alter table public.jobs drop constraint jobs_source_owner_check;
alter table public.jobs add constraint jobs_source_owner_check check (
  (source = 'ats' and employer_id is not null and user_id is null)
  or (source = 'manual' and user_id is not null and employer_id is null)
  or (source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs', 'careerjet') and employer_id is null and user_id is null and provider_key is not null)
);

drop index public.jobs_pending_check_idx;
create index jobs_pending_check_idx on public.jobs (last_seen_at)
  where verification_status = 'pending_validation' and closed_at is null and source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs', 'careerjet');

alter table public.jobs add column description_head text generated always as (left(description, 4000)) stored;

-- Careerjet listings are closed and pruned like the other job sites'; closed jobs that
-- still carry the user's own work are kept (see 20261026000000_keep_documents_on_prune).
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
  where closed_at is null and source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs', 'careerjet') and last_seen_at < now() - interval '30 days';
  delete from public.jobs j
  where (j.employer_id is not null or j.source in ('adzuna', 'jobicy', 'remotive', 'arbeitnow', 'usajobs', 'careerjet')) and j.closed_at < now() - interval '30 days'
    and not exists (select 1 from public.job_user_states s where s.job_id = j.id and s.status in ('saved', 'applied'))
    and not exists (
      select 1 from public.job_matches m join public.tailored_documents d on d.match_id = m.id
      where m.job_id = j.id and d.deleted_at is null)
    and not exists (
      select 1 from public.job_matches m join public.improvement_notes n on n.match_id = m.id
      where m.job_id = j.id);
  get diagnostics v_deleted = row_count;
  delete from public.tailored_documents where deleted_at < now() - interval '7 days';
  delete from public.job_search_cache where fetched_at < now() - interval '1 day';
  return v_deleted;
end;
$$;

revoke all on function public.prune_jobs() from public, anon, authenticated;
grant execute on function public.prune_jobs() to service_role;
