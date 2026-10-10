-- Phase 3: invitation lifecycle as atomic functions.
-- They run with the caller's permissions (security invoker), so RLS still decides
-- which candidates can be touched. Candidate status always mirrors the invitation.

create function public.record_invitation_sent(
  p_candidate_id uuid,
  p_sent_at timestamptz default now(),
  p_note_text text default null,
  p_source public.record_source default 'manual'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate public.candidates%rowtype;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note_text, '')), '');
begin
  select * into v_candidate from public.candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found.' using errcode = 'P0002';
  end if;
  if v_candidate.status in ('do_not_contact', 'not_a_match') then
    raise exception 'This person is marked %; an invitation cannot be recorded.',
      replace(v_candidate.status::text, '_', ' ') using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invitations where candidate_id = p_candidate_id) then
    raise exception 'An invitation to this person is already recorded.' using errcode = '23505';
  end if;
  if p_sent_at > now() + interval '5 minutes' then
    raise exception 'The sent time cannot be in the future.' using errcode = '22023';
  end if;

  insert into public.invitations (user_id, candidate_id, sent_at, note_text, had_note, source)
  values (v_candidate.user_id, p_candidate_id, p_sent_at, v_note, v_note is not null, p_source)
  returning id into v_id;

  update public.candidates set status = 'invitation_sent' where id = p_candidate_id;
  return v_id;
end;
$$;

create function public.resolve_invitation(
  p_candidate_id uuid,
  p_outcome public.invitation_outcome,
  p_resolved_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  if p_outcome = 'pending' then
    raise exception 'Choose accepted, declined or withdrawn.' using errcode = '22023';
  end if;

  select * into v_invitation from public.invitations
  where candidate_id = p_candidate_id and outcome = 'pending'
  for update;
  if not found then
    raise exception 'There is no pending invitation for this person.' using errcode = 'P0002';
  end if;

  update public.invitations
  set outcome = p_outcome,
      -- An export date can be earlier than the recorded send time; never resolve before sending.
      resolved_at = greatest(p_resolved_at, v_invitation.sent_at)
  where id = v_invitation.id;

  update public.candidates
  set status = case when p_outcome = 'accepted' then 'connected' else 'declined_withdrawn' end::public.candidate_status
  where id = p_candidate_id;
end;
$$;

-- Removes an invitation that was recorded by mistake and returns the person to "approved".
create function public.delete_invitation(p_candidate_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.invitations where candidate_id = p_candidate_id;
  if not found then
    raise exception 'No invitation is recorded for this person.' using errcode = 'P0002';
  end if;
  update public.candidates set status = 'approved' where id = p_candidate_id;
end;
$$;

revoke execute on function public.record_invitation_sent(uuid, timestamptz, text, public.record_source) from public, anon;
revoke execute on function public.resolve_invitation(uuid, public.invitation_outcome, timestamptz) from public, anon;
revoke execute on function public.delete_invitation(uuid) from public, anon;
grant execute on function public.record_invitation_sent(uuid, timestamptz, text, public.record_source) to authenticated, service_role;
grant execute on function public.resolve_invitation(uuid, public.invitation_outcome, timestamptz) to authenticated, service_role;
grant execute on function public.delete_invitation(uuid) to authenticated, service_role;

-- Trigram search over names and free text for the candidate list.
create extension if not exists pg_trgm with schema extensions;
create index candidates_search_idx on public.candidates
  using gin ((full_name || ' ' || coalesce(raw_school_text, '') || ' ' || coalesce(raw_program_text, '') || ' ' || coalesce(role, '')) extensions.gin_trgm_ops);

-- current_date is UTC; evenings in Canada are already "tomorrow" in UTC, which would put
-- the project start after today's local acceptances. Use the default settings zone instead.
alter table public.settings
  alter column project_start_date set default ((now() at time zone 'America/Vancouver')::date);
