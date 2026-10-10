-- Phase 5: record when and how a candidate became a connection.
-- 'invitation' = an invitation logged in the app was accepted.
-- 'export'     = LinkedIn's own data export shows the connection, with no invitation logged.
-- Nothing is ever inferred: only these two sources set a connection.
create type public.connection_source as enum ('invitation', 'export');

alter table public.candidates
  add column connected_at timestamptz,
  add column connected_via public.connection_source,
  add constraint candidates_connected_fields check ((connected_at is null) = (connected_via is null));

create index candidates_user_connected_idx on public.candidates (user_id, connected_via) where connected_via is not null;

create or replace function public.resolve_invitation(
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
  v_at timestamptz;
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

  -- An export date can be earlier than the recorded send time; never resolve before sending.
  v_at := greatest(p_resolved_at, v_invitation.sent_at);
  update public.invitations set outcome = p_outcome, resolved_at = v_at where id = v_invitation.id;

  if p_outcome = 'accepted' then
    update public.candidates
    set status = 'connected', connected_at = v_at, connected_via = 'invitation'
    where id = p_candidate_id;
  else
    update public.candidates set status = 'declined_withdrawn' where id = p_candidate_id;
  end if;
end;
$$;

create or replace function public.delete_invitation(p_candidate_id uuid)
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
  update public.candidates
  set status = 'approved', connected_at = null, connected_via = null
  where id = p_candidate_id and connected_via is distinct from 'export';
end;
$$;

-- Users may read their own job history; the server writes it with the service role.
grant select on public.job_runs to authenticated;
