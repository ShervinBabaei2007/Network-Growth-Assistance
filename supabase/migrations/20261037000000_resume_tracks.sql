-- Resume tracks: several base resumes ("Software", "Data", "Product"), each with its own current version.
-- A resume with no track is the main one, so everything that existed before keeps working unchanged.

alter table public.resumes
  add column track text check (track is null or (track = btrim(track) and char_length(track) between 1 and 40));

-- One current version per track (and one for the main resume), instead of one per person.
drop index public.resumes_one_active_idx;
create unique index resumes_one_active_per_track_idx on public.resumes (user_id, (coalesce(lower(track), ''))) where is_active;

-- Which track the user picked for a job. No row (or a null track) means the main resume.
create table public.job_track_choices (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  track text check (track is null or (track = btrim(track) and char_length(track) between 1 and 40)),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.job_track_choices enable row level security;
create policy "owner manages track choices" on public.job_track_choices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.job_track_choices from anon;
