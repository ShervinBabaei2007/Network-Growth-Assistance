-- A saved copy of an interview prep pack. The pack itself is built live from the posting, the resume and the
-- scheduled interviews (nothing is generated or invented); a saved copy records what the user prepared with, and
-- appears on the application's timeline.

create table public.interview_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index interview_preps_app_idx on public.interview_preps (application_id, created_at desc);

alter table public.interview_preps enable row level security;
create policy "owner manages interview preps" on public.interview_preps for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.interview_preps from anon;
