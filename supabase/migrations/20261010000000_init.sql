-- Phase 1: core schema for the LinkedIn Network Growth Assistant.
-- Every user-owned row carries user_id and is isolated by row-level security.
-- LinkedIn credentials, cookies and export emails are never stored.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.discipline as enum ('ce', 'ee', 'mech', 'cs');
create type public.university as enum ('uoft', 'ubc', 'sfu', 'waterloo');
create type public.classification_confidence as enum ('confirmed', 'needs_review');
create type public.degree_level as enum ('undergraduate', 'masters', 'doctoral', 'alumni', 'other');
create type public.candidate_source as enum ('manual', 'csv', 'linkedin_export');
create type public.candidate_status as enum (
  'new',
  'awaiting_review',
  'approved',
  'invitation_sent',
  'invitation_pending',
  'connected',
  'declined_withdrawn',
  'not_a_match',
  'do_not_contact'
);
create type public.invitation_outcome as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.record_source as enum ('manual', 'linkedin_export');
create type public.queue_item_state as enum ('queued', 'sent', 'skipped');
create type public.job_status as enum ('running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings: one row per user
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  overall_target integer not null default 2000 check (overall_target > 0),
  baseline_connections integer check (baseline_connections >= 0),
  project_start_date date not null default current_date,
  discipline_priority public.discipline[] not null default array['ce', 'ee', 'mech', 'cs']::public.discipline[]
    check (
      cardinality(discipline_priority) = 4
      and discipline_priority @> array['ce', 'ee', 'mech', 'cs']::public.discipline[]
    ),
  -- Planning limits are user-entered; no universal LinkedIn allowance is assumed.
  daily_invite_target integer check (daily_invite_target >= 0),
  weekly_invite_cap integer check (weekly_invite_cap >= 0),
  monthly_note_allowance integer check (monthly_note_allowance >= 0),
  note_char_limit integer not null default 200 check (note_char_limit between 1 and 1000),
  stale_pending_days integer not null default 21 check (stale_pending_days > 0),
  count_ubco_as_ubc boolean not null default true,
  timezone text not null default 'America/Vancouver',
  paused boolean not null default false,
  pause_reason text,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Targets: discipline totals (university null) and per-university cells
-- ---------------------------------------------------------------------------
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  discipline public.discipline not null,
  university public.university,
  target_count integer not null check (target_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, discipline, university)
);

create trigger targets_set_updated_at
before update on public.targets
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  profile_url text not null,
  -- Normalized LinkedIn slug (lowercase, no query or trailing slash); the dedupe key.
  profile_key text not null check (length(profile_key) > 0),
  role text,
  degree_level public.degree_level,
  grad_year smallint check (grad_year between 1950 and 2100),
  university public.university,
  discipline public.discipline,
  raw_school_text text,
  raw_program_text text,
  university_confidence public.classification_confidence not null default 'needs_review',
  discipline_confidence public.classification_confidence not null default 'needs_review',
  source public.candidate_source not null default 'manual',
  discovered_at timestamptz not null default now(),
  status public.candidate_status not null default 'new',
  is_preexisting_connection boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_key),
  -- Lets child tables use a composite FK so rows cannot point at another user's candidate.
  unique (id, user_id),
  -- A value can only be "confirmed" if it is actually present.
  check (university is not null or university_confidence = 'needs_review'),
  check (discipline is not null or discipline_confidence = 'needs_review')
);

create index candidates_user_status_idx on public.candidates (user_id, status);
create index candidates_user_category_idx on public.candidates (user_id, discipline, university);

create trigger candidates_set_updated_at
before update on public.candidates
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  candidate_id uuid not null,
  sent_at timestamptz not null,
  note_text text,
  had_note boolean not null default false,
  outcome public.invitation_outcome not null default 'pending',
  resolved_at timestamptz,
  source public.record_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (candidate_id, user_id) references public.candidates (id, user_id) on delete cascade,
  check ((outcome = 'pending') = (resolved_at is null)),
  check (resolved_at is null or resolved_at >= sent_at)
);

-- At most one open invitation per person. user_id is included so another user's
-- insert fails on the ownership FK rather than revealing that an invite exists.
create unique index invitations_one_pending_per_candidate
  on public.invitations (user_id, candidate_id)
  where outcome = 'pending';
create index invitations_user_outcome_idx on public.invitations (user_id, outcome);
create index invitations_user_sent_at_idx on public.invitations (user_id, sent_at);

create trigger invitations_set_updated_at
before update on public.invitations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Connection snapshots: real network totals entered manually or from the export
-- ---------------------------------------------------------------------------
create table public.connection_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  total_connections integer not null check (total_connections >= 0),
  source public.record_source not null default 'manual',
  created_at timestamptz not null default now()
);

create index connection_snapshots_user_recorded_idx
  on public.connection_snapshots (user_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Daily queue
-- ---------------------------------------------------------------------------
create table public.daily_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  queue_date date not null,
  candidate_id uuid not null,
  rank integer not null check (rank > 0),
  reason text not null,
  is_alternate boolean not null default false,
  note_draft text,
  state public.queue_item_state not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (candidate_id, user_id) references public.candidates (id, user_id) on delete cascade,
  unique (user_id, queue_date, candidate_id)
);

create index daily_queue_user_date_idx on public.daily_queue (user_id, queue_date, rank);

create trigger daily_queue_set_updated_at
before update on public.daily_queue
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Job runs: one row per user, job and day makes the daily job idempotent
-- ---------------------------------------------------------------------------
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job text not null,
  run_date date not null,
  status public.job_status not null default 'running',
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, job, run_date)
);

-- ---------------------------------------------------------------------------
-- Activity logs: append-only, IDs and counts only
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (length(kind) > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_user_created_idx on public.activity_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.targets enable row level security;
alter table public.candidates enable row level security;
alter table public.invitations enable row level security;
alter table public.connection_snapshots enable row level security;
alter table public.daily_queue enable row level security;
alter table public.job_runs enable row level security;
alter table public.activity_logs enable row level security;

-- Full owner access.
create policy "owner can manage settings" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage targets" on public.targets
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage candidates" on public.candidates
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage invitations" on public.invitations
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage snapshots" on public.connection_snapshots
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage queue" on public.daily_queue
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Job runs are written only by the server (service role); owners can read theirs.
create policy "owner can read job runs" on public.job_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Activity logs are append-only for owners.
create policy "owner can read activity" on public.activity_logs
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner can append activity" on public.activity_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- The settings row is created by the signup trigger and removed with the account.
revoke insert, delete on public.settings from authenticated;
-- Signed-out visitors get no table access at all, now or for tables added later.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- New-user setup: default settings and the 250 / 125 / 125 targets
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id);

  insert into public.targets (user_id, discipline, university, target_count)
  select new.id, d.discipline, u.university, u.target_count
  from unnest(array['ce', 'ee', 'mech', 'cs']::public.discipline[]) as d (discipline)
  cross join (
    values
      (null::public.university, 250),
      ('uoft'::public.university, 125),
      ('ubc'::public.university, 125)
  ) as u (university, target_count);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
