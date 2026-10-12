-- Saved searches with alerts, the notification centre, and opt-in email digests.
--
-- "New" is decided by stable job identity: saved_search_matches remembers every job a
-- search has already shown (as of its baseline) or announced, so a job is announced once,
-- whatever happens to the run. Runs are claimed with a lease (skip locked), so overlapping
-- cron calls never work on the same search, and every write is keyed so a retried run
-- can't announce twice. Email is queued separately and is at-least-once (SMTP can't do
-- better); in-app notifications never depend on it.

-- ---------------------------------------------------------------------------
-- Saved searches
-- ---------------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- { v, params }: see src/lib/job-postings/feed-query.ts
  query jsonb not null check (jsonb_typeof(query) = 'object' and pg_column_size(query) <= 8192),
  query_version integer not null default 1 check (query_version >= 1),
  alert_frequency text not null default 'off' check (alert_frequency in ('off', 'daily', 'weekly')),
  -- 0 = Sunday … 6 = Saturday, and the hour, both in the user's own time zone.
  alert_weekday smallint not null default 1 check (alert_weekday between 0 and 6),
  alert_hour smallint not null default 8 check (alert_hour between 0 and 23),
  email_digest boolean not null default false,
  -- When the search last started counting from "now" (results before it aren't announced).
  baseline_at timestamptz,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text check (length(last_error) <= 500),
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index saved_searches_user_idx on public.saved_searches (user_id, created_at);
create index saved_searches_due_idx on public.saved_searches (next_run_at) where alert_frequency <> 'off';

create trigger saved_searches_touch before update on public.saved_searches for each row execute function public.touch_updated_at();

-- At most 20 saved searches per user.
create function public.saved_searches_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 20 then
    raise exception 'You can keep 20 saved searches.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger saved_searches_limit before insert on public.saved_searches for each row execute function public.saved_searches_limit();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('alert', 'reminder', 'interview', 'source_problem', 'weekly_summary')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text check (length(body) <= 2000),
  -- Always a path inside the app.
  href text check (href ~ '^/[^/\\]' and length(href) <= 500),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 16384),
  -- What this notification is about; the same thing is never notified twice.
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (id, user_id),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Every job a saved search has shown or announced.
create table public.saved_search_matches (
  saved_search_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null check (status in ('baseline', 'pending', 'notified')),
  first_matched_at timestamptz not null default now(),
  notification_id uuid,
  primary key (saved_search_id, job_id),
  foreign key (saved_search_id, user_id) references public.saved_searches (id, user_id) on delete cascade,
  foreign key (notification_id, user_id) references public.notifications (id, user_id) on delete set null (notification_id)
);
create index saved_search_matches_pending_idx on public.saved_search_matches (saved_search_id) where status = 'pending';
create index saved_search_matches_notification_idx on public.saved_search_matches (notification_id) where notification_id is not null;
create index saved_search_matches_job_idx on public.saved_search_matches (job_id);

-- Emails waiting to go out, and what happened to them.
create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_id uuid not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (length(last_error) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (notification_id, user_id) references public.notifications (id, user_id) on delete cascade
);
create index email_deliveries_due_idx on public.email_deliveries (next_attempt_at) where status = 'pending';

alter table public.settings
  add column email_notifications boolean not null default false,
  add column notify_reminders boolean not null default true,
  add column notify_interviews boolean not null default true,
  add column weekly_summary boolean not null default false;

-- ---------------------------------------------------------------------------
-- Server-only functions (the alerts cron)
-- ---------------------------------------------------------------------------

-- Leases the saved searches whose run is due. Two overlapping cron calls get different
-- searches; a crashed run's lease simply expires.
create function public.claim_due_saved_searches(p_limit integer, p_lease_seconds integer)
returns setof public.saved_searches
language sql
security definer
set search_path = ''
as $$
  update public.saved_searches s
  set lease_until = now() + make_interval(secs => p_lease_seconds)
  where s.id in (
    select id from public.saved_searches
    where alert_frequency <> 'off' and next_run_at <= now() and (lease_until is null or lease_until < now())
    order by next_run_at
    limit p_limit
    for update skip locked
  )
  returning s.*;
$$;

-- Turns a search's pending matches into one notification (and an email, if wanted), in one
-- transaction. Keyed by the run, so calling it again can't notify twice. Returns the
-- notification id, or null when there was nothing new.
create function public.deliver_alert(p_search uuid, p_run_key text, p_label text, p_href text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search public.saved_searches;
  v_count integer;
  v_id uuid;
begin
  select * into v_search from public.saved_searches where id = p_search;
  if not found then
    return null;
  end if;
  select count(*) into v_count from public.saved_search_matches where saved_search_id = p_search and status = 'pending';
  if v_count = 0 then
    return null;
  end if;
  insert into public.notifications (user_id, kind, title, href, data, dedupe_key)
  values (
    v_search.user_id, 'alert',
    left(v_count || ' new job' || case when v_count = 1 then '' else 's' end || ' for ' || p_label, 200),
    p_href,
    jsonb_build_object('saved_search_id', p_search, 'count', v_count),
    left('alert:' || p_search || ':' || p_run_key, 200)
  )
  on conflict (user_id, dedupe_key) do update
    set data = jsonb_build_object('saved_search_id', p_search, 'count', coalesce((public.notifications.data ->> 'count')::integer, 0) + v_count)
  returning id into v_id;
  update public.saved_search_matches set status = 'notified', notification_id = v_id
  where saved_search_id = p_search and status = 'pending';
  if v_search.email_digest and (select s.email_notifications from public.settings s where s.user_id = v_search.user_id) then
    insert into public.email_deliveries (user_id, notification_id) values (v_search.user_id, v_id)
    on conflict (notification_id) do nothing;
  end if;
  return v_id;
end;
$$;

-- Any other notification (reminders, interviews, summaries, source problems). Returns
-- the new id, or null when this exact notification already exists.
create function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_href text, p_dedupe text, p_data jsonb default '{}'::jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, href, data, dedupe_key)
  values (p_user, p_kind, left(p_title, 200), nullif(left(p_body, 2000), ''), p_href, coalesce(p_data, '{}'::jsonb), left(p_dedupe, 200))
  on conflict (user_id, dedupe_key) do nothing
  returning id;
$$;

-- Daily housekeeping: read notifications after 90 days, sent emails after 30.
create function public.prune_notifications()
returns integer
language sql
security definer
set search_path = ''
as $$
  with a as (delete from public.notifications where read_at is not null and read_at < now() - interval '90 days' returning 1),
       b as (delete from public.email_deliveries where status in ('sent', 'skipped') and created_at < now() - interval '30 days' returning 1)
  select ((select count(*) from a) + (select count(*) from b))::integer;
$$;

revoke all on function public.claim_due_saved_searches(integer, integer) from public, anon, authenticated;
revoke all on function public.deliver_alert(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.prune_notifications() from public, anon, authenticated;
grant execute on function public.claim_due_saved_searches(integer, integer) to service_role;
grant execute on function public.deliver_alert(uuid, text, text, text) to service_role;
grant execute on function public.notify_user(uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.prune_notifications() to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.saved_searches enable row level security;
alter table public.saved_search_matches enable row level security;
alter table public.notifications enable row level security;
alter table public.email_deliveries enable row level security;

create policy "owner can manage saved searches" on public.saved_searches
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can read matches" on public.saved_search_matches
  for select to authenticated using (user_id = (select auth.uid()));
-- Users record only the baseline (what a search already shows); announcing is the server's job.
create policy "owner can record a baseline" on public.saved_search_matches
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'baseline' and notification_id is null);
create policy "owner can reset matches" on public.saved_search_matches
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "owner can read notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can mark notifications read" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "owner can read email deliveries" on public.email_deliveries
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.saved_searches, public.saved_search_matches, public.notifications, public.email_deliveries from anon;
-- Run state belongs to the cron; users change only what the search is and when it alerts.
revoke update on public.saved_searches from authenticated;
grant update (name, query, query_version, alert_frequency, alert_weekday, alert_hour, email_digest, baseline_at, next_run_at) on public.saved_searches to authenticated;
revoke update on public.saved_search_matches from authenticated;
-- Notifications are created by the server; users only mark them read (or delete them).
revoke insert on public.notifications from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, update, delete on public.email_deliveries from authenticated;
