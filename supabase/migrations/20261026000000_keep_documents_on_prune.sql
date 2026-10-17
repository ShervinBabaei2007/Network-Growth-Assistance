-- prune_jobs keeps closed jobs that still carry the user's own work (tailored documents,
-- improvement notes). Deleting such a job cascaded through job_matches and silently removed
-- resumes and cover letters the user had written for it.

create index if not exists tailored_documents_match_id_idx on public.tailored_documents (match_id);
create index if not exists improvement_notes_match_id_idx on public.improvement_notes (match_id);

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
    and not exists (select 1 from public.job_user_states s where s.job_id = j.id and s.status in ('saved', 'applied'))
    -- The user's own work for the job keeps it (and so its fit check and documents).
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
