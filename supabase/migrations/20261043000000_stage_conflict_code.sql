-- A stale version in set_application_stage used to raise SQLSTATE 40001 (serialization_failure). PostgREST treats that as
-- "retry the transaction", so a conflict made the request hang until it timed out (about a minute) instead of telling
-- the person the application changed in another tab. The conflict now raises a custom code that is not retried.
-- Everything else in the function is unchanged.

create or replace function public.set_application_stage(
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
    raise exception 'application changed since it was loaded' using errcode = 'P0409';
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
