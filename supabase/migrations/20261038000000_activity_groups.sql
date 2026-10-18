-- Progress and Analytics only need each invitation's and connection's local day, outcome and category. Grouping them in
-- the database returns a few hundred rows in one request instead of reading every row 1,000 at a time.
-- Both functions run with the caller's rights (row-level security still applies) and filter by p_user explicitly,
-- so they also work for the daily job, which uses the server's client.

create function public.activity_invitation_groups(p_user uuid, p_tz text)
returns table (
  sent_on date,
  resolved_on date,
  outcome public.invitation_outcome,
  discipline uuid,
  university uuid,
  classified boolean,
  preexisting boolean,
  n integer
)
language sql
stable
set search_path = ''
as $$
  select
    (i.sent_at at time zone p_tz)::date,
    (i.resolved_at at time zone p_tz)::date,
    i.outcome,
    c.discipline,
    c.university,
    (c.university_confidence = 'confirmed' and c.discipline_confidence = 'confirmed'),
    c.is_preexisting_connection,
    count(*)::integer
  from public.invitations i
  join public.candidates c on c.id = i.candidate_id and c.user_id = i.user_id
  where i.user_id = p_user
  group by 1, 2, 3, 4, 5, 6, 7
$$;

create function public.activity_export_groups(p_user uuid, p_tz text)
returns table (
  connected_on date,
  discipline uuid,
  university uuid,
  classified boolean,
  preexisting boolean,
  n integer
)
language sql
stable
set search_path = ''
as $$
  select
    (c.connected_at at time zone p_tz)::date,
    c.discipline,
    c.university,
    (c.university_confidence = 'confirmed' and c.discipline_confidence = 'confirmed'),
    c.is_preexisting_connection,
    count(*)::integer
  from public.candidates c
  where c.user_id = p_user and c.connected_via = 'export' and c.connected_at is not null
  group by 1, 2, 3, 4, 5
$$;

revoke all on function public.activity_invitation_groups(uuid, text) from public, anon;
revoke all on function public.activity_export_groups(uuid, text) from public, anon;
grant execute on function public.activity_invitation_groups(uuid, text) to authenticated, service_role;
grant execute on function public.activity_export_groups(uuid, text) to authenticated, service_role;
