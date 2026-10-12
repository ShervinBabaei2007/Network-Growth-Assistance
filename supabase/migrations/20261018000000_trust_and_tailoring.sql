-- Trust and tailoring: verified job links, a second job source (Adzuna), resume versions
-- with per-field confidence, tailored-document versions, CVs and Improvement Notes.
--
-- Additive only: no table is dropped and no user row is deleted. Existing rows get
-- defaults. The one data change clears SmartRecruiters apply links that the app used to
-- build from a URL pattern rather than read from the board; those jobs show "Application
-- link unavailable" until the crawler reads the real link from the posting.

-- ---------------------------------------------------------------------------
-- Jobs: where each posting came from, and whether its link was verified
-- ---------------------------------------------------------------------------
create type public.job_verification_status as enum ('verified', 'expired', 'unavailable', 'failed_validation', 'pending_validation');

alter table public.jobs
  -- ats: an employer's own job board (shared). adzuna: the Adzuna search API (shared).
  -- manual: pasted in by one user (private to them).
  add column source text not null default 'ats' check (source in ('ats', 'adzuna', 'manual')),
  -- Unique id across providers that have no employer row ("adzuna:123"), for upserts.
  add column provider_key text check (length(provider_key) <= 220),
  -- The listing page at the source, when it differs from where you apply.
  add column source_url text check (source_url ~* '^https?://' and length(source_url) <= 2000),
  -- Where the apply link ended up after redirects, when it was checked.
  add column final_url text check (final_url ~* '^https?://' and length(final_url) <= 2000),
  add column canonical_url text check (length(canonical_url) <= 2000),
  add column verification_status public.job_verification_status not null default 'pending_validation',
  add column verified_at timestamptz,
  add column verification_note text check (length(verification_note) <= 300),
  add column workplace_type text check (workplace_type in ('remote', 'hybrid', 'onsite')),
  add column experience_level text check (experience_level in ('internship', 'new_grad', 'entry', 'junior', 'mid', 'senior')),
  -- "provider" when the source states the level; "title" when it was read from the job title.
  add column level_source text check (level_source in ('provider', 'title')),
  add column salary_min numeric check (salary_min >= 0),
  add column salary_max numeric check (salary_max >= 0),
  add column salary_currency text check (salary_currency ~ '^[A-Z]{3}$'),
  add column salary_period text check (salary_period in ('year', 'month', 'week', 'day', 'hour')),
  -- The source gave only a snippet of the description (Adzuna), so fit is partial.
  add column description_is_partial boolean not null default false,
  -- 'created': the source's date is when the posting was created, not published (Lever).
  add column date_note text check (date_note in ('created')),
  add column dedupe_key text check (length(dedupe_key) <= 700),
  -- 64-bit simhash of the description, as 16 hex digits, for spotting the same job twice.
  add column desc_fingerprint text check (desc_fingerprint ~ '^[0-9a-f]{16}$');

alter table public.jobs add constraint jobs_provider_key_key unique (provider_key);

update public.jobs set source = 'manual' where user_id is not null;

alter table public.jobs drop constraint jobs_check;
alter table public.jobs add constraint jobs_source_owner_check check (
  (source = 'ats' and employer_id is not null and user_id is null)
  or (source = 'manual' and user_id is not null and employer_id is null)
  or (source = 'adzuna' and employer_id is null and user_id is null and provider_key is not null)
);

-- A job without a real application link is kept (it may be saved) but can't be verified.
alter table public.jobs alter column apply_url drop not null;
alter table public.jobs add constraint jobs_verified_needs_link_check check (verification_status <> 'verified' or apply_url is not null);

-- SmartRecruiters links were built from a pattern, not read from the board. Clear them.
update public.jobs j set apply_url = null, verification_note = 'Application link unavailable'
from public.employers e
where j.employer_id = e.id and e.ats = 'smartrecruiters';

update public.jobs set verification_status = 'expired', verification_note = 'No longer listed by the source'
where closed_at is not null;

create index jobs_verified_feed_idx on public.jobs (posted_at desc) where closed_at is null and verification_status in ('verified', 'pending_validation');
create index jobs_dedupe_key_idx on public.jobs (dedupe_key) where closed_at is null;
create index jobs_pending_check_idx on public.jobs (last_seen_at) where verification_status = 'pending_validation' and closed_at is null and source = 'adzuna';

drop policy "add own pasted jobs" on public.jobs;
create policy "add own pasted jobs" on public.jobs
  for insert to authenticated with check (user_id = (select auth.uid()) and employer_id is null and source = 'manual');
drop policy "change own pasted jobs" on public.jobs;
create policy "change own pasted jobs" on public.jobs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and employer_id is null and source = 'manual');

-- Live searches of outside providers, so paging and reloading don't spend their quota.
create table public.job_search_cache (
  query_key text primary key check (length(query_key) between 1 and 300),
  provider text not null check (length(provider) <= 40),
  fetched_at timestamptz not null default now(),
  result_count integer not null default 0,
  status text not null check (status in ('ok', 'empty', 'timeout', 'rate_limited', 'auth', 'outage', 'malformed'))
);
create index job_search_cache_fetched_idx on public.job_search_cache (fetched_at);
alter table public.job_search_cache enable row level security;
revoke all on public.job_search_cache from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Resumes: the original is kept and never changes
-- ---------------------------------------------------------------------------
alter table public.resumes
  add column source_kind text not null default 'pdf' check (source_kind in ('pdf', 'docx', 'paste')),
  -- The uploaded file in the private "resumes" storage bucket: {user_id}/{resume_id}.{ext}
  add column original_file_path text check (length(original_file_path) <= 300),
  -- What the parser read, before any edits. Null for resumes imported before this existed.
  add column original_profile jsonb,
  -- Per-field confidence: { "<path>": { confidence, needsReview, missing?, reason?, sourceText?, alternatives? } }
  add column field_meta jsonb not null default '{}'::jsonb,
  -- The profile before the last restore, for Undo.
  add column previous_profile jsonb;

create function public.resumes_keep_original()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.raw_text is distinct from old.raw_text then
    raise exception 'The original resume text cannot be changed' using errcode = '42501';
  end if;
  if old.original_profile is not null and new.original_profile is distinct from old.original_profile then
    raise exception 'The parsed original cannot be changed' using errcode = '42501';
  end if;
  if old.original_file_path is not null and new.original_file_path is distinct from old.original_file_path then
    raise exception 'The original file cannot be replaced' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger resumes_keep_original
before update on public.resumes
for each row execute function public.resumes_keep_original();

-- ---------------------------------------------------------------------------
-- Tailored documents: several versions per job, CVs, comparison, soft delete for Undo
-- ---------------------------------------------------------------------------
alter type public.tailored_doc_kind add value if not exists 'cv';

alter table public.tailored_documents drop constraint tailored_documents_user_id_match_id_kind_key;
alter table public.tailored_documents drop constraint tailored_documents_method_check;
-- smart: reordered without AI (earlier versions only). ai: rewritten by a model and checked.
-- template: a cover-letter draft filled from the resume, not written by AI.
alter table public.tailored_documents add constraint tailored_documents_method_check check (method in ('smart', 'ai', 'template'));

alter table public.tailored_documents
  add column label text check (length(label) <= 200),
  add column comparison jsonb,
  add column resume_id uuid,
  add column resume_updated_at timestamptz,
  add column deleted_at timestamptz;

create index tailored_documents_match_idx on public.tailored_documents (user_id, match_id, kind, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Improvement Notes: advice only. Stored on their own; they never change a resume.
-- ---------------------------------------------------------------------------
create table public.improvement_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_id uuid not null,
  resume_id uuid not null,
  -- The resume version the notes were written for, to show when they're out of date.
  resume_updated_at timestamptz not null,
  method text not null check (method in ('rules', 'ai')),
  -- Why they were made: the user asked, or AI tailoring wasn't possible.
  reason text not null default 'requested' check (reason in ('requested', 'no_key', 'quota_exhausted', 'ai_failed', 'not_material')),
  report jsonb not null,
  dismissed text[] not null default '{}' check (cardinality(dismissed) <= 200),
  created_at timestamptz not null default now(),
  foreign key (match_id, user_id) references public.job_matches (id, user_id) on delete cascade,
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);

create index improvement_notes_match_idx on public.improvement_notes (user_id, match_id, created_at desc);

alter table public.improvement_notes enable row level security;
create policy "owner can manage improvement notes" on public.improvement_notes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.improvement_notes from anon;

-- ---------------------------------------------------------------------------
-- Original resume files: a private bucket, one folder per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 4194304, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "owner reads own resume files" on storage.objects
  for select to authenticated using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner uploads own resume files" on storage.objects
  for insert to authenticated with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes own resume files" on storage.objects
  for delete to authenticated using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Daily pruning: also closes search results not seen for a month and purges documents
-- deleted more than a week ago (kept that long so Undo works).
-- ---------------------------------------------------------------------------
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
  where closed_at is null and source = 'adzuna' and last_seen_at < now() - interval '30 days';
  delete from public.jobs j
  where (j.employer_id is not null or j.source = 'adzuna') and j.closed_at < now() - interval '30 days'
    and not exists (select 1 from public.job_user_states s where s.job_id = j.id and s.status in ('saved', 'applied'));
  get diagnostics v_deleted = row_count;
  delete from public.tailored_documents where deleted_at < now() - interval '7 days';
  delete from public.job_search_cache where fetched_at < now() - interval '1 day';
  return v_deleted;
end;
$$;

revoke all on function public.prune_jobs() from public, anon, authenticated;
grant execute on function public.prune_jobs() to service_role;
