-- Privacy-friendly monitoring that stays inside this database: real-user page speed (Core Web Vitals) and
-- error reports. Nothing here identifies a person: no user id, email, IP address or page content is stored,
-- only the route pattern (for example /applications/[id]), a metric and its value, or a scrubbed error message.
-- The tables are written and read only by the server (service role); users and the public cannot touch them.

create table public.rum_vitals (
  id bigint generated always as identity primary key,
  route text not null check (char_length(route) <= 80),
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null check (value >= 0 and value <= 600000),
  rating text check (rating in ('good', 'needs-improvement', 'poor')),
  device text not null check (device in ('phone', 'desktop')),
  created_at timestamptz not null default now()
);
create index rum_vitals_report_idx on public.rum_vitals (route, metric, created_at);
create index rum_vitals_created_idx on public.rum_vitals (created_at);

create table public.client_errors (
  fingerprint text primary key check (char_length(fingerprint) <= 64),
  source text not null check (source in ('browser', 'server')),
  route text not null check (char_length(route) <= 80),
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 2000),
  digest text check (char_length(digest) <= 100),
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index client_errors_last_seen_idx on public.client_errors (last_seen desc);

alter table public.rum_vitals enable row level security;
alter table public.client_errors enable row level security;
revoke all on public.rum_vitals, public.client_errors from anon, authenticated;

-- Records one measurement. Refuses (returns false) when an unusual flood arrives, so a script can't fill the database.
create function public.record_vital(p_route text, p_metric text, p_value double precision, p_rating text, p_device text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.rum_vitals where created_at > now() - interval '1 hour') >= 50000 then
    return false;
  end if;
  insert into public.rum_vitals (route, metric, value, rating, device) values (p_route, p_metric, p_value, nullif(p_rating, ''), p_device);
  return true;
end;
$$;

-- Records an error, or counts another occurrence of one already seen. Distinct errors are capped.
create function public.record_client_error(p_fingerprint text, p_source text, p_route text, p_message text, p_stack text, p_digest text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.client_errors set occurrences = occurrences + 1, last_seen = now() where fingerprint = p_fingerprint;
  if found then
    return true;
  end if;
  if (select count(*) from public.client_errors) >= 2000 then
    return false;
  end if;
  insert into public.client_errors (fingerprint, source, route, message, stack, digest)
  values (p_fingerprint, p_source, p_route, p_message, nullif(p_stack, ''), nullif(p_digest, ''))
  on conflict (fingerprint) do update set occurrences = public.client_errors.occurrences + 1, last_seen = now();
  return true;
end;
$$;

-- The 75th percentile of each metric per route and device, over the last p_days days (the number Google reports).
create function public.monitoring_vitals(p_days integer default 7)
returns table (route text, metric text, device text, samples bigint, p75 double precision, poor_share numeric)
language sql
security definer
set search_path = ''
as $$
  select v.route, v.metric, v.device, count(*),
         percentile_cont(0.75) within group (order by v.value),
         round(100.0 * count(*) filter (where v.rating = 'poor') / count(*), 1)
  from public.rum_vitals v
  where v.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
  group by v.route, v.metric, v.device
  order by v.route, v.metric, v.device
$$;

-- Old measurements and errors are removed by the daily job.
create function public.prune_monitoring()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  m integer;
begin
  delete from public.rum_vitals where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.client_errors where last_seen < now() - interval '90 days';
  get diagnostics m = row_count;
  return n + m;
end;
$$;

revoke all on function public.record_vital(text, text, double precision, text, text) from public, anon, authenticated;
revoke all on function public.record_client_error(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.monitoring_vitals(integer) from public, anon, authenticated;
revoke all on function public.prune_monitoring() from public, anon, authenticated;
grant execute on function public.record_vital(text, text, double precision, text, text) to service_role;
grant execute on function public.record_client_error(text, text, text, text, text, text) to service_role;
grant execute on function public.monitoring_vitals(integer) to service_role;
grant execute on function public.prune_monitoring() to service_role;
