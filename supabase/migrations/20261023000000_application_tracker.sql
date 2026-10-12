-- Application tracker: one user-owned application per attempt at a job, its stage history,
-- interviews, contacts, reminders and the documents that were sent.
--
-- Identity: an application references a job but keeps its own copy of the title, company,
-- location and link, so its history survives when the job expires or is pruned (job_id
-- becomes null). A job has at most one *open* application per user; a new attempt is only
-- made explicitly ("Apply again") after the previous one closed.
--
-- job_user_states stays as it is: it decides what the Jobs feed shows (saved, applied,
-- dismissed). Dismissed never creates or changes an application.

create type public.application_stage as enum (
  'saved', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'no_response'
);

-- Stages that end an attempt. Any stage can still be reopened.
create function public.application_stage_closed(p_stage public.application_stage)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_stage in ('accepted', 'rejected', 'withdrawn', 'no_response') $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  attempt integer not null default 1 check (attempt between 1 and 50),
  stage public.application_stage not null default 'saved',
  -- A copy of the posting at the time it was tracked.
  title text not null check (length(btrim(title)) > 0 and length(title) <= 300),
  company text check (length(company) <= 300),
  location text check (length(location) <= 300),
  apply_url text check (length(apply_url) <= 2000),
  source text check (length(source) <= 40),
  -- The day the user applied, in their own time zone.
  applied_on date,
  -- Pay offered, as the user entered it. Never converted or estimated.
  offered_pay_amount numeric(12, 2) check (offered_pay_amount >= 0),
  offered_pay_currency text check (offered_pay_currency ~ '^[A-Z]{3}$'),
  offered_pay_period text check (offered_pay_period in ('hour', 'day', 'week', 'month', 'year')),
  notes text check (length(notes) <= 10000),
  -- Bumped on every change, so two tabs can't silently overwrite each other.
  version integer not null default 1 check (version >= 1),
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, job_id, attempt),
  check ((offered_pay_amount is null) = (offered_pay_currency is null) and (offered_pay_amount is null) = (offered_pay_period is null))
);

-- At most one open attempt per job.
create unique index applications_one_open_idx on public.applications (user_id, job_id)
  where job_id is not null and stage not in ('accepted', 'rejected', 'withdrawn', 'no_response');
create index applications_user_stage_idx on public.applications (user_id, stage, stage_changed_at desc);
create index applications_job_idx on public.applications (job_id) where job_id is not null;

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null,
  kind text not null check (kind in ('created', 'migrated', 'stage', 'reopened', 'note', 'response', 'interview', 'reminder', 'contact', 'document')),
  from_stage public.application_stage,
  to_stage public.application_stage,
  occurred_at timestamptz not null default now(),
  detail text check (length(detail) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index application_events_app_idx on public.application_events (application_id, occurred_at desc);

create table public.application_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null,
  starts_at timestamptz not null,
  -- IANA zone the user scheduled it in, for the calendar file.
  timezone text not null check (length(timezone) between 1 and 64),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  kind text not null default 'other' check (kind in ('phone', 'video', 'onsite', 'technical', 'other')),
  location text check (length(location) <= 500),
  notes text check (length(notes) <= 5000),
  -- iCalendar SEQUENCE: bumped when the time changes, so calendars replace the old event.
  ics_sequence integer not null default 0 check (ics_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index application_interviews_app_idx on public.application_interviews (application_id, starts_at);
create index application_interviews_user_idx on public.application_interviews (user_id, starts_at);

create table public.application_contacts (
  application_id uuid not null,
  person_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null default 'other' check (role in ('recruiter', 'hiring_manager', 'referrer', 'interviewer', 'other')),
  created_at timestamptz not null default now(),
  primary key (application_id, person_id),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade,
  foreign key (person_id, user_id) references public.network_people (id, user_id) on delete cascade
);
create index application_contacts_person_idx on public.application_contacts (person_id);

create table public.application_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null,
  due_at timestamptz not null,
  text text not null check (length(btrim(text)) > 0 and length(text) <= 500),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index application_reminders_due_idx on public.application_reminders (user_id, due_at) where done_at is null;
create index application_reminders_app_idx on public.application_reminders (application_id);

-- What was sent: a link to the document version, plus a copy taken when it was linked.
-- The copy can't be changed, and stays if the document is later deleted.
create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null,
  tailored_document_id uuid,
  resume_id uuid,
  kind text not null check (kind in ('resume', 'cover_letter', 'cv')),
  label text not null check (length(btrim(label)) > 0 and length(label) <= 200),
  content jsonb not null check (pg_column_size(content) <= 512000),
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade,
  foreign key (tailored_document_id, user_id) references public.tailored_documents (id, user_id) on delete set null (tailored_document_id),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete set null (resume_id),
  check (num_nonnulls(tailored_document_id, resume_id) <= 1)
);
create index application_documents_app_idx on public.application_documents (application_id);

-- ---------------------------------------------------------------------------
-- Settings: tracker and appearance preferences
-- ---------------------------------------------------------------------------
alter table public.settings
  add column no_response_days integer not null default 21 check (no_response_days between 1 and 365),
  add column theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  add column density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  add column text_size text not null default 'normal' check (text_size in ('normal', 'large'));

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
-- A user can only track a job they can see: a shared listing, or a posting they pasted.
-- (Foreign keys don't apply row-level security, so this is checked here.)
create function public.applications_check_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_id is not null and (tg_op = 'INSERT' or new.job_id is distinct from old.job_id) then
    if not exists (select 1 from public.jobs j where j.id = new.job_id and (j.user_id is null or j.user_id = new.user_id)) then
      raise exception 'job not found' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_check_job
before insert or update of job_id on public.applications
for each row execute function public.applications_check_job();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();
create trigger application_interviews_touch before update on public.application_interviews for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Functions
--
-- The stage functions run as security definer, because users can't write stage, version
-- or stage events directly. Each one acts only on the caller's own rows (auth.uid()),
-- never on an id it was merely given.
-- ---------------------------------------------------------------------------

-- The signed-in user's date for an instant, in their own time zone (UTC if it's unknown).
create function public.user_local_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone coalesce(
    (select s.timezone from public.settings s where s.user_id = auth.uid() and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = s.timezone)),
    'UTC'))::date
$$;

-- Moves an application to a stage and records it on the timeline, together. Fails with
-- 40001 when the application changed since `p_expected_version` was read.
create function public.set_application_stage(
  p_id uuid,
  p_stage public.application_stage,
  p_expected_version integer,
  p_occurred_at timestamptz default now(),
  p_detail text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.application_stage;
  v_version integer;
begin
  select stage, version into v_old, v_version from public.applications where id = p_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_version <> p_expected_version then
    raise exception 'application changed since it was loaded' using errcode = '40001';
  end if;
  if v_old = p_stage then
    return v_version;
  end if;
  update public.applications
  set stage = p_stage,
      version = version + 1,
      stage_changed_at = p_occurred_at,
      applied_on = case when p_stage = 'applied' and applied_on is null then public.user_local_date(p_occurred_at) else applied_on end
  where id = p_id
  returning version into v_version;
  insert into public.application_events (user_id, application_id, kind, from_stage, to_stage, occurred_at, detail)
  select a.user_id, a.id,
         case when public.application_stage_closed(v_old) and not public.application_stage_closed(p_stage) then 'reopened' else 'stage' end,
         v_old, p_stage, p_occurred_at, left(p_detail, 2000)
  from public.applications a where a.id = p_id;
  return v_version;
end;
$$;

-- Keeps the tracker in step with Save / I applied on a job. Creates the first application
-- for the job, or moves an open one between saved and applied. An application that has
-- moved further (screening, interviewing…) or closed is left alone: a new attempt is only
-- made by apply_again. Safe to call twice (double clicks, retries).
create function public.sync_application_for_job(p_job uuid, p_stage public.application_stage)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_app public.applications;
  v_job public.jobs;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_stage not in ('saved', 'applied') then
    raise exception 'only saved or applied' using errcode = '22023';
  end if;
  -- Only a job the caller can see: a shared listing or their own pasted posting.
  select * into v_job from public.jobs where id = p_job and (user_id is null or user_id = v_user);
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  select * into v_app from public.applications
  where user_id = v_user and job_id = p_job and not public.application_stage_closed(stage)
  for update;

  if not found then
    if exists (select 1 from public.applications where user_id = v_user and job_id = p_job) then
      -- Only closed attempts: leave them; the user can start a new one explicitly.
      return null;
    end if;
    insert into public.applications (user_id, job_id, stage, title, company, location, apply_url, source, applied_on)
    values (v_user, p_job, p_stage, v_job.title, v_job.company, v_job.location_text, v_job.apply_url, v_job.source,
            case when p_stage = 'applied' then public.user_local_date(now()) end)
    on conflict (user_id, job_id) where job_id is not null and stage not in ('accepted', 'rejected', 'withdrawn', 'no_response') do nothing
    returning * into v_app;
    if v_app.id is null then
      -- A concurrent call created it first.
      select * into v_app from public.applications
      where user_id = v_user and job_id = p_job and not public.application_stage_closed(stage);
      return v_app.id;
    end if;
    insert into public.application_events (user_id, application_id, kind, to_stage)
    values (v_user, v_app.id, 'created', p_stage);
    return v_app.id;
  end if;

  if v_app.stage in ('saved', 'applied') and v_app.stage <> p_stage then
    perform public.set_application_stage(v_app.id, p_stage, v_app.version);
  end if;
  return v_app.id;
end;
$$;

-- Undoes tracking a job (removing Save / I applied): deletes the open application only
-- while it holds nothing the user entered: still saved or applied, with no notes,
-- interviews, reminders, contacts or documents. Returns whether it was deleted.
create function public.release_application_for_job(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.applications a
  where a.user_id = auth.uid() and a.job_id = p_job and a.stage in ('saved', 'applied')
    and a.notes is null and a.offered_pay_amount is null
    and not exists (select 1 from public.application_events e where e.application_id = a.id and e.kind not in ('created', 'migrated', 'stage'))
    and not exists (select 1 from public.application_interviews i where i.application_id = a.id)
    and not exists (select 1 from public.application_reminders r where r.application_id = a.id)
    and not exists (select 1 from public.application_contacts c where c.application_id = a.id)
    and not exists (select 1 from public.application_documents d where d.application_id = a.id)
  for update;
  if v_id is null then
    return false;
  end if;
  delete from public.applications where id = v_id;
  return true;
end;
$$;

-- Starts a new attempt for a job after the last one closed, copying its posting details.
create function public.apply_again(p_id uuid, p_stage public.application_stage default 'saved')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.applications;
  v_new uuid;
begin
  select * into v_old from public.applications where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if not public.application_stage_closed(v_old.stage) or public.application_stage_closed(p_stage) then
    raise exception 'only a closed application can be started again, at an open stage' using errcode = '22023';
  end if;
  insert into public.applications (user_id, job_id, attempt, stage, title, company, location, apply_url, source, applied_on)
  select v_old.user_id, v_old.job_id,
         case when v_old.job_id is null then v_old.attempt + 1
              else (select max(attempt) + 1 from public.applications where user_id = v_old.user_id and job_id = v_old.job_id) end,
         p_stage, v_old.title, v_old.company, v_old.location, v_old.apply_url, v_old.source,
         case when p_stage = 'applied' then public.user_local_date(now()) end
  returning id into v_new;
  insert into public.application_events (user_id, application_id, kind, to_stage, detail)
  values (v_old.user_id, v_new, 'created', p_stage, 'Started again after attempt ' || v_old.attempt);
  return v_new;
end;
$$;

revoke all on function public.set_application_stage(uuid, public.application_stage, integer, timestamptz, text) from public, anon;
revoke all on function public.sync_application_for_job(uuid, public.application_stage) from public, anon;
revoke all on function public.release_application_for_job(uuid) from public, anon;
revoke all on function public.apply_again(uuid, public.application_stage) from public, anon;
revoke all on function public.user_local_date(timestamptz) from public, anon;
grant execute on function public.set_application_stage(uuid, public.application_stage, integer, timestamptz, text) to authenticated;
grant execute on function public.sync_application_for_job(uuid, public.application_stage) to authenticated;
grant execute on function public.release_application_for_job(uuid) to authenticated;
grant execute on function public.apply_again(uuid, public.application_stage) to authenticated;
grant execute on function public.user_local_date(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.application_interviews enable row level security;
alter table public.application_contacts enable row level security;
alter table public.application_reminders enable row level security;
alter table public.application_documents enable row level security;

create policy "owner can manage applications" on public.applications
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can read application events" on public.application_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add application events" on public.application_events
  for insert to authenticated with check (user_id = (select auth.uid()) and kind in ('note', 'response', 'interview', 'reminder', 'contact', 'document'));
-- Only what the user wrote can be removed (to undo it); stage history stays.
create policy "owner can remove own notes" on public.application_events
  for delete to authenticated using (user_id = (select auth.uid()) and kind in ('note', 'response'));
create policy "owner can manage interviews" on public.application_interviews
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage application contacts" on public.application_contacts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage reminders" on public.application_reminders
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage application documents" on public.application_documents
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.applications, public.application_events, public.application_interviews,
  public.application_contacts, public.application_reminders, public.application_documents from anon;
-- The timeline is append-only, and a sent document's copy never changes.
revoke update on public.application_events, public.application_documents from authenticated;
-- Stage, version and timestamps change only through set_application_stage.
revoke update on public.applications from authenticated;
grant update (notes, offered_pay_amount, offered_pay_currency, offered_pay_period, applied_on) on public.applications to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill from saved and applied jobs. Safe to run again: jobs that already have an
-- application are skipped.
-- ---------------------------------------------------------------------------
with created as (
  insert into public.applications (user_id, job_id, stage, title, company, location, apply_url, source, applied_on, stage_changed_at, created_at)
  select s.user_id, s.job_id, s.status::text::public.application_stage, j.title, j.company, j.location_text, j.apply_url, j.source,
         case when s.status = 'applied' then
           (coalesce(s.applied_at, s.updated_at) at time zone coalesce(
             (select st.timezone from public.settings st where st.user_id = s.user_id and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = st.timezone)),
             'UTC'))::date
         end,
         coalesce(s.applied_at, s.updated_at), s.updated_at
  from public.job_user_states s
  join public.jobs j on j.id = s.job_id
  where s.status in ('saved', 'applied')
    and not exists (select 1 from public.applications a where a.user_id = s.user_id and a.job_id = s.job_id)
  returning id, user_id, stage, created_at
)
insert into public.application_events (user_id, application_id, kind, to_stage, occurred_at, detail)
select user_id, id, 'migrated', stage, created_at, 'Carried over from your saved and applied jobs'
from created;
