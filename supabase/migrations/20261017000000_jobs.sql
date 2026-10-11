-- Jobs: recent Canadian postings from employers' public job boards (Greenhouse, Lever,
-- Ashby, SmartRecruiters, Workable, Recruitee), a fit check against the user's resume,
-- and tailored resumes and cover letters.
--
-- Postings are shared: one crawler reads each employer's board on a schedule and every
-- user reads the same rows, so outside requests grow with employers, not users. Shared
-- tables are readable by signed-in users and written only by the server (service role).
-- Everything about a person (resume, fit, documents, saved jobs) is owned by them and
-- isolated by RLS. The resume PDF itself is never stored.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.ats_kind as enum ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'fixture');
create type public.employer_status as enum ('active', 'failing', 'disabled');
create type public.job_user_status as enum ('saved', 'applied', 'dismissed');
create type public.job_fit_tier as enum ('strong', 'good', 'stretch', 'excluded');
create type public.tailored_doc_kind as enum ('resume', 'cover_letter');
create type public.tailor_mode as enum ('normal', 'apply_anyway');

-- ---------------------------------------------------------------------------
-- Employers: whose public job board the crawler reads
-- ---------------------------------------------------------------------------
create table public.employers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0 and length(name) <= 200),
  ats public.ats_kind not null,
  board_token text not null check (board_token ~ '^[A-Za-z0-9._-]{1,120}$'),
  careers_url text check (careers_url ~* '^https?://' and length(careers_url) <= 500),
  status public.employer_status not null default 'active',
  added_by uuid references auth.users (id) on delete set null,
  last_crawled_at timestamptz,
  next_crawl_at timestamptz not null default now(),
  failures integer not null default 0,
  last_error text check (length(last_error) <= 300),
  etag text check (length(etag) <= 300),
  canada_jobs integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ats, board_token)
);

create index employers_due_idx on public.employers (next_crawl_at) where status <> 'disabled';
create index employers_added_by_idx on public.employers (added_by, created_at);

create trigger employers_set_updated_at
before update on public.employers
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Jobs: Canadian postings from employer boards (shared), and postings a user pasted
-- in themselves (private to them: user_id is set and employer_id is null).
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid references public.employers (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 200),
  company text check (length(company) <= 300),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 300),
  city text check (length(city) <= 120),
  -- Two-letter province code; null only for remote roles anywhere in Canada.
  province text check (province ~ '^[A-Z]{2}$'),
  location_text text check (length(location_text) <= 300),
  remote boolean not null default false,
  -- When the employer published it; or, for boards that give no time, when the crawler
  -- first saw it on a board it had read before ("first_seen"). A job already on a board
  -- the first time it was read, with no date, is "unknown": never shown as recent.
  posted_at timestamptz not null,
  date_source text not null default 'source' check (date_source in ('source', 'first_seen', 'unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  apply_url text not null check (apply_url ~* '^https?://' and length(apply_url) <= 2000),
  description text not null default '' check (length(description) <= 60000),
  salary text check (length(salary) <= 200),
  employment_type text check (length(employment_type) <= 100),
  department text check (length(department) <= 200),
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(department, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((employer_id is null) <> (user_id is null))
);

-- Plain (not partial) unique constraints, so upserts can target them. NULLs are distinct,
-- so shared jobs (user_id null) and pasted jobs (employer_id null) never collide.
alter table public.jobs add constraint jobs_employer_external_key unique (employer_id, external_id);
alter table public.jobs add constraint jobs_user_external_key unique (user_id, external_id);
create index jobs_feed_idx on public.jobs (posted_at desc) where closed_at is null;
create index jobs_province_feed_idx on public.jobs (province, posted_at desc) where closed_at is null;
create index jobs_fts_idx on public.jobs using gin (fts);
create index jobs_employer_open_idx on public.jobs (employer_id) where closed_at is null;

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

-- One row per requirement in a posting, read once when the job is first seen.
create table public.job_requirements (
  job_id uuid not null references public.jobs (id) on delete cascade,
  idx smallint not null check (idx between 0 and 99),
  text text not null check (length(text) between 1 and 400),
  kind text not null check (kind in ('must', 'nice')),
  category text not null,
  years smallint check (years between 0 and 30),
  degree_level text check (degree_level in ('diploma', 'bachelor', 'master', 'phd')),
  embedding extensions.vector(384),
  primary key (job_id, idx)
);

create index job_requirements_pending_embedding_idx on public.job_requirements (job_id) where embedding is null;
create index job_requirements_embedding_idx on public.job_requirements using hnsw (embedding extensions.vector_cosine_ops);

-- One row per crawler tick, for monitoring.
create table public.job_crawl_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  boards integer not null default 0,
  not_modified integer not null default 0,
  failed integer not null default 0,
  new_jobs integer not null default 0,
  closed_jobs integer not null default 0,
  embedded integer not null default 0
);

create index job_crawl_runs_started_idx on public.job_crawl_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Resumes: text and parsed structure only. Bullets carry stable ids so tailored
-- bullets can cite the originals they were written from.
-- ---------------------------------------------------------------------------
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0 and length(label) <= 100),
  file_name text check (length(file_name) <= 255),
  raw_text text not null check (length(raw_text) between 1 and 60000),
  profile jsonb not null,
  -- What a resume usually doesn't say: work authorization, clearance, relocation.
  facts jsonb not null default '{}'::jsonb,
  parsed_with text not null check (parsed_with in ('ai', 'heuristic')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index resumes_one_active_idx on public.resumes (user_id) where is_active;
create index resumes_user_created_idx on public.resumes (user_id, created_at desc);

create trigger resumes_set_updated_at
before update on public.resumes
for each row execute function public.set_updated_at();

-- Each bullet, skill line and summary sentence, with its embedding, for matching.
create table public.resume_lines (
  resume_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  line_id text not null check (length(line_id) between 1 and 40),
  text text not null check (length(text) between 1 and 1000),
  embedding extensions.vector(384),
  primary key (resume_id, line_id),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Per-user state on jobs
-- ---------------------------------------------------------------------------
create table public.job_user_states (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status public.job_user_status not null,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index job_user_states_job_idx on public.job_user_states (job_id);

create trigger job_user_states_set_updated_at
before update on public.job_user_states
for each row execute function public.set_updated_at();

-- Fit of one resume for one posting. Tiers come from rules, not from a model.
create table public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  resume_id uuid not null,
  fit_score smallint not null check (fit_score between 0 and 100),
  tier public.job_fit_tier not null,
  method text not null check (method in ('ai', 'keywords', 'semantic')),
  requirement_results jsonb not null default '{}'::jsonb,
  exclusion_reasons text[] not null default '{}',
  summary text check (length(summary) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, job_id, resume_id),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);

create index job_matches_resume_tier_idx on public.job_matches (resume_id, tier, fit_score desc);
create index job_matches_job_idx on public.job_matches (job_id);

create trigger job_matches_set_updated_at
before update on public.job_matches
for each row execute function public.set_updated_at();

-- Tailored documents: what was generated (after the server's checks) and the user's
-- own edits, kept apart. One current document of each kind per match.
create table public.tailored_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_id uuid not null,
  kind public.tailored_doc_kind not null,
  mode public.tailor_mode not null default 'normal',
  method text not null default 'smart' check (method in ('smart', 'ai')),
  generated jsonb not null,
  edited jsonb,
  guard_report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, match_id, kind),
  foreign key (match_id, user_id) references public.job_matches (id, user_id) on delete cascade
);

create trigger tailored_documents_set_updated_at
before update on public.tailored_documents
for each row execute function public.set_updated_at();

-- Optional AI: the user's own Anthropic key, encrypted by the app (the plain key never
-- reaches the database or the browser).
create table public.user_ai (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  own_key_ciphertext text check (length(own_key_ciphertext) <= 1000),
  own_key_hint text check (length(own_key_hint) <= 12),
  updated_at timestamptz not null default now()
);

-- Use of the operator's AI key per day. Written only by the server, so users can't reset it.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day)
);

create trigger user_ai_set_updated_at
before update on public.user_ai
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Job search preferences
-- ---------------------------------------------------------------------------
alter table public.settings
  add column job_titles text[] not null default '{}' check (cardinality(job_titles) <= 6),
  add column job_provinces text[] not null default '{BC,ON}',
  add column job_seniority text not null default 'new_grad' check (job_seniority in ('intern', 'new_grad', 'junior', 'intermediate', 'senior')),
  add column job_exclude_keywords text[] not null default '{}' check (cardinality(job_exclude_keywords) <= 20);

-- ---------------------------------------------------------------------------
-- Matching: the closest resume line to each requirement of the given jobs, by meaning.
-- Runs with the caller's rights, so it only ever sees the caller's own resume lines.
-- ---------------------------------------------------------------------------
create function public.match_jobs(p_resume uuid, p_jobs uuid[])
returns table (job_id uuid, idx smallint, line_id text, similarity real)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.job_id, r.idx, best.line_id, best.similarity
  from public.job_requirements r
  cross join lateral (
    select l.line_id, (1 - (l.embedding operator(extensions.<=>) r.embedding))::real as similarity
    from public.resume_lines l
    where l.resume_id = p_resume and l.embedding is not null
    order by l.embedding operator(extensions.<=>) r.embedding
    limit 1
  ) best
  where r.job_id = any (p_jobs) and r.embedding is not null;
$$;

-- How close each resume line is to any requirement of one job, for ordering bullets.
create function public.line_relevance(p_resume uuid, p_job uuid)
returns table (line_id text, similarity real)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.line_id, max(1 - (l.embedding operator(extensions.<=>) r.embedding))::real
  from public.resume_lines l
  join public.job_requirements r on r.job_id = p_job and r.embedding is not null
  where l.resume_id = p_resume and l.embedding is not null
  group by l.line_id;
$$;

-- Counts one use of the operator's AI key; false once the day's limit is reached.
create function public.consume_ai_quota(p_user uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  insert into public.ai_usage (user_id, day, used) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set used = public.ai_usage.used + 1
    where public.ai_usage.used < p_limit
  returning used into v_used;
  return v_used is not null and v_used <= p_limit;
end;
$$;

-- Daily: closes jobs no longer seen on their board, and deletes old closed jobs that
-- nobody saved or applied to.
create function public.prune_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  update public.jobs set closed_at = now()
  where closed_at is null and employer_id is not null and last_seen_at < now() - interval '3 days';
  delete from public.jobs j
  where j.employer_id is not null and j.closed_at < now() - interval '30 days'
    and not exists (select 1 from public.job_user_states s where s.job_id = j.id and s.status in ('saved', 'applied'));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Requirements still needing an embedding, for open jobs from the last 90 days (the longest
-- range the feed shows), newest first. Pasted jobs are embedded when they're added.
create function public.pending_requirement_embeddings(p_limit integer)
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
  order by j.posted_at desc, r.idx
  limit p_limit;
$$;

revoke all on function public.pending_requirement_embeddings(integer) from public, anon, authenticated;
grant execute on function public.pending_requirement_embeddings(integer) to service_role;
revoke all on function public.consume_ai_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.prune_jobs() from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer) to service_role;
grant execute on function public.prune_jobs() to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.employers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_requirements enable row level security;
alter table public.job_crawl_runs enable row level security;
alter table public.resumes enable row level security;
alter table public.resume_lines enable row level security;
alter table public.job_user_states enable row level security;
alter table public.job_matches enable row level security;
alter table public.tailored_documents enable row level security;
alter table public.user_ai enable row level security;
alter table public.ai_usage enable row level security;

-- Shared, read-only for users. The crawler writes with the service role (bypasses RLS).
create policy "signed-in users can read employers" on public.employers
  for select to authenticated using (true);
create policy "signed-in users can read crawl runs" on public.job_crawl_runs
  for select to authenticated using (true);

-- Shared jobs are readable by everyone signed in; pasted jobs only by the person who pasted them.
create policy "read shared and own jobs" on public.jobs
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy "add own pasted jobs" on public.jobs
  for insert to authenticated with check (user_id = (select auth.uid()) and employer_id is null);
create policy "change own pasted jobs" on public.jobs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and employer_id is null);
create policy "delete own pasted jobs" on public.jobs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read requirements of visible jobs" on public.job_requirements
  for select to authenticated using (exists (select 1 from public.jobs j where j.id = job_id and (j.user_id is null or j.user_id = (select auth.uid()))));
create policy "write requirements of own pasted jobs" on public.job_requirements
  for all to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid())))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid())));

create policy "owner can manage resumes" on public.resumes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage resume lines" on public.resume_lines
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage job states" on public.job_user_states
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage job matches" on public.job_matches
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage tailored documents" on public.tailored_documents
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can read ai usage" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can manage ai settings" on public.user_ai
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.employers, public.jobs, public.job_requirements, public.job_crawl_runs, public.resumes,
  public.resume_lines, public.job_user_states, public.job_matches, public.tailored_documents, public.user_ai, public.ai_usage from anon;
-- Users may only read the shared tables; the policies above can't grant what's revoked here.
revoke insert, update, delete on public.employers, public.job_crawl_runs, public.ai_usage from authenticated;
