-- Network ↔ jobs: the user's own decisions about which company names are the same
-- employer, and referrals recorded against people and applications.

-- ---------------------------------------------------------------------------
-- Company name decisions (per user, correctable)
-- ---------------------------------------------------------------------------
-- Keys are normalised names (src/lib/companies/match.ts companyKey), stored in sorted order
-- so a pair is found whichever way round it's asked.
create table public.company_aliases (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  a_key text not null check (length(a_key) between 1 and 200),
  b_key text not null check (length(b_key) between 1 and 200),
  decision text not null check (decision in ('same', 'different')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, a_key, b_key),
  check (a_key < b_key)
);
create trigger company_aliases_touch before update on public.company_aliases for each row execute function public.touch_updated_at();

alter table public.company_aliases enable row level security;
create policy "owner can manage company decisions" on public.company_aliases
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.company_aliases from anon;

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------
alter table public.network_interactions drop constraint network_interactions_kind_check;
alter table public.network_interactions add constraint network_interactions_kind_check
  check (kind in ('status_change', 'note', 'message_copied', 'linkedin_opened', 'marked_sent', 'replied', 'follow_up', 'proximity', 'referral_asked', 'referral_given'));
alter table public.network_interactions add column application_id uuid;
alter table public.network_interactions add constraint network_interactions_application_fkey
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete set null (application_id);
-- One "asked" and one "given" per person and application (a double click records once).
create unique index network_interactions_referral_once on public.network_interactions
  (user_id, person_id, coalesce(application_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  where kind in ('referral_asked', 'referral_given');

alter table public.application_events drop constraint application_events_kind_check;
alter table public.application_events add constraint application_events_kind_check
  check (kind in ('created', 'migrated', 'stage', 'reopened', 'note', 'response', 'interview', 'reminder', 'contact', 'document', 'referral'));
-- A referral entry links back to the interaction it records, so it appears once and Undo can remove it.
alter table public.application_events add column interaction_id uuid references public.network_interactions (id) on delete cascade;
create unique index application_events_interaction_once on public.application_events (interaction_id) where interaction_id is not null;

drop policy "owner can add application events" on public.application_events;
create policy "owner can add application events" on public.application_events
  for insert to authenticated with check (user_id = (select auth.uid()) and kind in ('note', 'response', 'interview', 'reminder', 'contact', 'document', 'referral'));

-- Records that the user asked someone for a referral, or was given one: on the person's
-- history and, when it's for an application, as its referrer and on its timeline. Runs as
-- the caller, so row-level security and the ownership keys apply. Returns false when it
-- was already recorded.
create function public.record_referral(p_person uuid, p_application uuid, p_kind text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
begin
  if p_kind not in ('referral_asked', 'referral_given') then
    raise exception 'unknown referral kind' using errcode = '22023';
  end if;
  insert into public.network_interactions (person_id, kind, application_id)
  values (p_person, p_kind, p_application)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  if p_application is not null then
    insert into public.application_contacts (application_id, person_id, role)
    values (p_application, p_person, 'referrer')
    on conflict (application_id, person_id) do update set role = 'referrer';
    select full_name into v_name from public.network_people where id = p_person;
    insert into public.application_events (application_id, kind, detail, interaction_id)
    values (p_application, 'referral', case when p_kind = 'referral_asked' then 'Asked ' else 'Referred by ' end || coalesce(v_name, 'a contact'), v_id);
  end if;
  return true;
end;
$$;

-- Undo: removes the record (and with it the timeline entry). The contact stays linked.
create function public.undo_referral(p_person uuid, p_application uuid, p_kind text)
returns boolean
language sql
set search_path = ''
as $$
  with gone as (
    delete from public.network_interactions
    where person_id = p_person and kind = p_kind and application_id is not distinct from p_application
    returning 1
  )
  select exists (select 1 from gone);
$$;

revoke all on function public.record_referral(uuid, uuid, text) from public, anon;
revoke all on function public.undo_referral(uuid, uuid, text) from public, anon;
grant execute on function public.record_referral(uuid, uuid, text) to authenticated;
grant execute on function public.undo_referral(uuid, uuid, text) to authenticated;
