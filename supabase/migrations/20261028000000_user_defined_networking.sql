-- Nothing about a user's networking is built in any more. Schools and disciplines were
-- fixed enums (four universities, four engineering/CS programs) with fixed targets and a
-- fixed 2,000-connection goal. Each user now keeps their own:
--   universities: any school, college or institution, with the other ways it's written
--                 (aliases) and whether it has its own per-discipline targets.
--   disciplines:  any field of study or work, with aliases, in the user's priority order.
--   targets:      per discipline, and optionally per school within it, set by the user.
-- Existing users keep everything they had: their four schools and disciplines become
-- ordinary, editable rows with the same names and aliases, and their candidates, targets
-- and progress point at them. New users start with nothing and set these up themselves.
--
-- Jobs: the level filter is no longer pre-set from a saved "seniority" (removed), and no
-- province is chosen by default (an empty list means all of Canada).

-- ---------------------------------------------------------------------------
-- 1. The user's schools and disciplines
-- ---------------------------------------------------------------------------
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 40),
  -- With targets: counted per discipline toward its own goal. Without: an extra pool that
  -- only counts toward the discipline's total.
  has_targets boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index universities_user_name_idx on public.universities (user_id, lower(btrim(name)));

create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 40),
  -- Priority: lower first.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index disciplines_user_name_idx on public.disciplines (user_id, lower(btrim(name)));

alter table public.universities enable row level security;
alter table public.disciplines enable row level security;
create policy "owner manages universities" on public.universities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner manages disciplines" on public.disciplines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.universities, public.disciplines from anon;

-- ---------------------------------------------------------------------------
-- 2. Existing users: their four schools and disciplines become their own rows
-- ---------------------------------------------------------------------------
create temporary table old_universities (code text, name text, aliases text[], has_targets boolean, pos integer) on commit drop;
insert into old_universities values
  ('uoft', 'University of Toronto', array['university of toronto', 'u of t', 'uoft', 'utoronto', 'utsc', 'utm', 'u of t scarborough', 'u of t mississauga'], true, 0),
  ('ubc', 'UBC', array['university of british columbia', 'ubc', 'ubc vancouver'], true, 1),
  ('sfu', 'SFU', array['simon fraser university', 'simon fraser', 'sfu'], false, 2),
  ('waterloo', 'University of Waterloo', array['university of waterloo', 'uwaterloo', 'uw waterloo'], false, 3);

create temporary table old_disciplines (code text, name text, aliases text[]) on commit drop;
insert into old_disciplines values
  ('ce', 'Computer Engineering', array['computer engineering', 'computer eng', 'comp eng', 'compe', 'cpen', 'cpe']),
  ('ee', 'Electrical Engineering', array['electrical engineering', 'electrical eng', 'elec eng', 'electronics engineering', 'electrical']),
  ('mech', 'Mechatronics Engineering', array['mechatronics', 'mechatronic', 'mechatronics engineering', 'mechatronic systems engineering', 'mechatronics option']),
  ('cs', 'Computer Science', array['computer science', 'computing science', 'comp sci', 'compsci', 'cpsc', 'cmpt', 'bcs', 'cs']);

insert into public.universities (user_id, name, aliases, has_targets, position)
select s.user_id, o.name,
  o.aliases || case when o.code = 'ubc' and s.count_ubco_as_ubc then array['ubc okanagan', 'ubco', 'university of british columbia okanagan'] else '{}'::text[] end,
  o.has_targets, o.pos
from public.settings s cross join old_universities o;

insert into public.disciplines (user_id, name, aliases, position)
select s.user_id, o.name, o.aliases, coalesce(array_position(s.discipline_priority::text[], o.code), 99) - 1
from public.settings s cross join old_disciplines o;

create temporary table university_map on commit drop as
  select u.user_id, o.code, u.id from public.universities u join old_universities o on o.name = u.name;
create temporary table discipline_map on commit drop as
  select d.user_id, o.code, d.id from public.disciplines d join old_disciplines o on o.name = d.name;

-- ---------------------------------------------------------------------------
-- 3. Candidates and targets point at the user's own rows
-- ---------------------------------------------------------------------------
drop view public.candidate_category_counts;
drop index if exists public.candidates_user_category_idx;

alter table public.candidates add column university_id uuid, add column discipline_id uuid;
update public.candidates c set university_id = m.id from university_map m where m.user_id = c.user_id and m.code = c.university::text;
update public.candidates c set discipline_id = m.id from discipline_map m where m.user_id = c.user_id and m.code = c.discipline::text;
alter table public.candidates drop column university, drop column discipline;
alter table public.candidates rename column university_id to university;
alter table public.candidates rename column discipline_id to discipline;
alter table public.candidates
  add constraint candidates_university_owned foreign key (university, user_id) references public.universities (id, user_id) on delete set null (university),
  add constraint candidates_discipline_owned foreign key (discipline, user_id) references public.disciplines (id, user_id) on delete set null (discipline),
  add constraint candidates_university_check check (university is not null or university_confidence = 'needs_review'),
  add constraint candidates_discipline_check check (discipline is not null or discipline_confidence = 'needs_review');
create index candidates_user_category_idx on public.candidates (user_id, discipline, university);
create index candidates_university_idx on public.candidates (university) where university is not null;
create index candidates_discipline_idx on public.candidates (discipline) where discipline is not null;

-- Removing a school or discipline sends its candidates back to review (their confirmed value is gone).
create function public.unconfirm_candidates_on_category_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'universities' then
    update public.candidates set university = null, university_confidence = 'needs_review' where university = old.id;
  else
    update public.candidates set discipline = null, discipline_confidence = 'needs_review' where discipline = old.id;
  end if;
  return old;
end;
$$;
create trigger universities_unconfirm_candidates before delete on public.universities
  for each row execute function public.unconfirm_candidates_on_category_delete();
create trigger disciplines_unconfirm_candidates before delete on public.disciplines
  for each row execute function public.unconfirm_candidates_on_category_delete();

alter table public.targets add column university_id uuid, add column discipline_id uuid;
update public.targets t set university_id = m.id from university_map m where m.user_id = t.user_id and m.code = t.university::text;
update public.targets t set discipline_id = m.id from discipline_map m where m.user_id = t.user_id and m.code = t.discipline::text;
alter table public.targets drop column university, drop column discipline;
delete from public.targets where discipline_id is null;
alter table public.targets rename column university_id to university;
alter table public.targets rename column discipline_id to discipline;
alter table public.targets
  alter column discipline set not null,
  add constraint targets_category_key unique nulls not distinct (user_id, discipline, university),
  add constraint targets_discipline_owned foreign key (discipline, user_id) references public.disciplines (id, user_id) on delete cascade,
  add constraint targets_university_owned foreign key (university, user_id) references public.universities (id, user_id) on delete cascade;
create index targets_university_idx on public.targets (university) where university is not null;

create view public.candidate_category_counts
with (security_invoker = true) as
select
  user_id,
  discipline,
  university,
  status,
  (university_confidence = 'confirmed' and discipline_confidence = 'confirmed') as classified,
  count(*)::integer as candidate_count
from public.candidates
group by user_id, discipline, university, status, classified;
revoke all on public.candidate_category_counts from anon;
grant select on public.candidate_category_counts to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Settings: no built-in goal, priorities, campus rule or job defaults
-- ---------------------------------------------------------------------------
alter table public.settings drop column discipline_priority, drop column count_ubco_as_ubc, drop column job_seniority;
-- The connection goal is the user's to set; until then there's none.
alter table public.settings alter column overall_target drop default, alter column overall_target drop not null;
-- No province is preferred: an empty list means all of Canada. The old built-in default is cleared.
alter table public.settings alter column job_provinces set default '{}';
update public.settings set job_provinces = '{}' where job_provinces = '{BC,ON}';

-- No built-in time zone: new users start on UTC until they choose theirs in Settings, and
-- the project start date is today's date in UTC.
alter table public.settings alter column timezone set default 'UTC';
alter table public.settings alter column project_start_date set default current_date;

-- New users get their settings row only: no schools, disciplines, targets or goal.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;

drop type public.discipline;
drop type public.university;
