-- A demo workspace: example data a new user can look around in, then wipe in one click.
-- Every example row is flagged is_sample, so clearing removes exactly those rows and nothing the user
-- added themselves. Sample rows are left out of the data export. They are fictional people and employers.

alter table public.universities           add column is_sample boolean not null default false;
alter table public.disciplines            add column is_sample boolean not null default false;
alter table public.targets                add column is_sample boolean not null default false;
alter table public.candidates             add column is_sample boolean not null default false;
alter table public.invitations            add column is_sample boolean not null default false;
alter table public.connection_snapshots   add column is_sample boolean not null default false;
alter table public.applications           add column is_sample boolean not null default false;
alter table public.settings               add column sample_data boolean not null default false;

-- ---------------------------------------------------------------------------
-- Start the demo. Only for an account with no data of its own; safe to call twice.
-- Runs as the caller, so row-level security applies and user ids never come from the client.
-- ---------------------------------------------------------------------------
create function public.seed_sample_data()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_schools text[] := array['Northgate University', 'Lakeshore College', 'Ridgeview Institute'];
  v_fields  text[] := array['Computer Science', 'Electrical Engineering', 'Mechanical Engineering'];
  v_school_ids uuid[] := '{}';
  v_field_ids uuid[] := '{}';
  v_id uuid;
  v_cand uuid;
  v_s int;
  v_f int;
  v_i int;
  v_state text;
  v_ago int;
  v_firsts text[] := array['Maya','Daniel','Priya','Lucas','Hannah','Omar','Sophie','Ethan','Aisha','Noah','Chloe','Arjun','Emma','Liam','Zoe','Mateo','Grace','Isaac','Nina','Owen','Fatima','Jack','Layla','Ben','Mei','Sam','Ruby','Leo','Ivy','Kai'];
  v_lasts  text[] := array['Chen','Okafor','Nair','Tremblay','Weiss','Haddad','Martin','Brooks','Rahman','Kim','Dubois','Mehta','Wilson','Novak','Fraser','Silva','Liu','Grant','Petrova','Campbell','Khan','Murphy','Ahmed','Carter','Tanaka','Ortiz','Stewart','Santos','Nguyen','Anderson'];
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if (select sample_data from public.settings where user_id = v_user) then
    return;
  end if;
  if exists (select 1 from public.candidates where user_id = v_user)
     or exists (select 1 from public.universities where user_id = v_user)
     or exists (select 1 from public.disciplines where user_id = v_user)
     or exists (select 1 from public.applications where user_id = v_user)
     or exists (select 1 from public.settings where user_id = v_user and (overall_target is not null or baseline_connections is not null)) then
    raise exception 'Example data can only be added to an empty account' using errcode = 'P0001';
  end if;

  for v_s in 1..3 loop
    insert into public.universities (name, is_sample, position) values (v_schools[v_s], true, v_s - 1) returning id into v_id;
    v_school_ids := v_school_ids || v_id;
  end loop;
  for v_f in 1..3 loop
    insert into public.disciplines (name, is_sample, position) values (v_fields[v_f], true, v_f - 1) returning id into v_id;
    v_field_ids := v_field_ids || v_id;
  end loop;

  for v_f in 1..3 loop
    insert into public.targets (discipline, university, target_count, is_sample) values (v_field_ids[v_f], null, 60 - (v_f - 1) * 15, true);
    for v_s in 1..3 loop
      insert into public.targets (discipline, university, target_count, is_sample) values (v_field_ids[v_f], v_school_ids[v_s], 20 - (v_f - 1) * 5, true);
    end loop;
  end loop;

  for v_i in 1..30 loop
    v_s := ((v_i - 1) % 3) + 1;
    v_f := (((v_i - 1) / 3) % 3) + 1;
    v_state := case when v_i % 10 = 4 then 'invitation_pending' when v_i % 10 = 7 then 'approved' when v_i = 27 then 'awaiting_review' else 'connected' end;
    v_ago := 3 + (v_i * 7) % 40;
    insert into public.candidates (
      full_name, profile_url, profile_key, role, university, discipline,
      university_confidence, discipline_confidence, status, is_sample
    ) values (
      v_firsts[v_i] || ' ' || v_lasts[v_i],
      'https://www.linkedin.com/in/sample-' || lower(v_firsts[v_i] || '-' || v_lasts[v_i]),
      'sample-' || lower(v_firsts[v_i] || '-' || v_lasts[v_i]),
      case when v_state = 'connected' then 'Example professional' else 'Example student' end,
      case when v_state = 'awaiting_review' then null else v_school_ids[v_s] end,
      case when v_state = 'awaiting_review' then null else v_field_ids[v_f] end,
      case when v_state = 'awaiting_review' then 'needs_review' else 'confirmed' end::public.classification_confidence,
      case when v_state = 'awaiting_review' then 'needs_review' else 'confirmed' end::public.classification_confidence,
      v_state::public.candidate_status,
      true
    ) returning id into v_cand;

    if v_state in ('connected', 'invitation_pending') then
      insert into public.invitations (candidate_id, sent_at, outcome, resolved_at, is_sample)
      values (
        v_cand,
        now() - make_interval(days => v_ago),
        case when v_state = 'connected' then 'accepted' else 'pending' end::public.invitation_outcome,
        case when v_state = 'connected' then now() - make_interval(days => greatest(v_ago - 3, 0)) end,
        true
      );
    end if;
  end loop;

  insert into public.connection_snapshots (recorded_at, total_connections, is_sample) values
    (now() - interval '58 days', 312, true), (now() - interval '42 days', 331, true),
    (now() - interval '28 days', 352, true), (now() - interval '14 days', 371, true),
    (now() - interval '1 day', 396, true);

  insert into public.applications (title, company, location, stage, source, applied_on, stage_changed_at, is_sample)
  select a.t, a.c, a.l, a.s::public.application_stage, 'example',
         case when a.s = 'saved' then null else current_date - (20 - a.n * 2) end,
         now() - make_interval(days => 12 - a.n), true
  from (values
    (1, 'Frontend Developer', 'Example Co. A', 'Vancouver, BC', 'saved'),
    (2, 'Platform Engineer', 'Example Co. B', 'Remote, Canada', 'saved'),
    (3, 'Junior Software Developer', 'Example Co. C', 'Toronto, ON', 'applied'),
    (4, 'Full Stack Developer', 'Example Co. D', 'Burnaby, BC', 'applied'),
    (5, 'QA Automation Engineer', 'Example Co. E', 'Remote, Canada', 'screening'),
    (6, 'Software Engineer, New Grad', 'Example Co. F', 'Vancouver, BC', 'interviewing'),
    (7, 'Backend Developer', 'Example Co. G', 'Calgary, AB', 'interviewing'),
    (8, 'Software Developer', 'Example Co. H', 'Victoria, BC', 'offer'),
    (9, 'Application Developer', 'Example Co. I', 'Ottawa, ON', 'rejected')
  ) as a (n, t, c, l, s);

  update public.settings
     set overall_target = 500,
         baseline_connections = 312,
         project_start_date = current_date - 60,
         sample_data = true
   where user_id = v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clear the demo: removes every flagged row and puts the plan back to empty.
-- ---------------------------------------------------------------------------
create function public.clear_sample_data()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  -- Invitations and queue rows go with their candidates; targets go with their disciplines.
  delete from public.candidates            where user_id = v_user and is_sample;
  delete from public.applications          where user_id = v_user and is_sample;
  delete from public.connection_snapshots  where user_id = v_user and is_sample;
  delete from public.targets               where user_id = v_user and is_sample;
  delete from public.universities          where user_id = v_user and is_sample;
  delete from public.disciplines           where user_id = v_user and is_sample;
  update public.settings
     set overall_target = null,
         baseline_connections = null,
         project_start_date = current_date,
         sample_data = false
   where user_id = v_user and sample_data;
end;
$$;

revoke all on function public.seed_sample_data(), public.clear_sample_data() from public, anon;
grant execute on function public.seed_sample_data(), public.clear_sample_data() to authenticated;
