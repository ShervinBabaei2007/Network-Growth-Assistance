-- Private notes on a job, and "hide this company / titles like..." filters.
-- Both are owner-only. Filters are applied by the shared Jobs feed, so the page and alerts agree.

create table public.job_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.job_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('company', 'title')),
  -- Stored lower-cased with single spaces, so matching is a plain comparison.
  pattern text not null check (pattern = lower(pattern) and pattern = btrim(pattern) and char_length(pattern) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (user_id, kind, pattern)
);

create index job_filters_user_idx on public.job_filters (user_id, created_at);

alter table public.job_notes enable row level security;
alter table public.job_filters enable row level security;
create policy "owner manages job notes" on public.job_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner manages job filters" on public.job_filters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.job_notes from anon;
revoke all on public.job_filters from anon;

create function public.job_filters_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.job_filters where user_id = new.user_id) >= 200 then
    raise exception 'You can hide up to 200 companies or title patterns. Remove some first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger job_filters_limit before insert on public.job_filters
  for each row execute function public.job_filters_limit();

create function public.job_notes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger job_notes_touch before update on public.job_notes
  for each row execute function public.job_notes_touch();
