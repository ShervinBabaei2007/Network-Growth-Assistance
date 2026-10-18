-- Follow-ups for accepted connections. When an invitation is accepted, the app suggests the next touches:
-- a thank-you, a coffee-chat ask, and check-ins after 30 and 90 days. Each is a suggestion with a due date
-- that the user can copy, snooze, mark done or dismiss. Nothing is ever sent; the user sends every message.

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  candidate_id uuid not null,
  kind text not null check (kind in ('thank_you', 'coffee_chat', 'check_in_30', 'check_in_90')),
  due_on date not null,
  state text not null default 'suggested' check (state in ('suggested', 'done', 'dismissed')),
  done_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (candidate_id, user_id) references public.candidates (id, user_id) on delete cascade,
  unique (candidate_id, kind),
  check ((state = 'done') = (done_at is not null))
);

create index follow_ups_due_idx on public.follow_ups (user_id, due_on) where state = 'suggested';

create trigger follow_ups_set_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();

alter table public.follow_ups enable row level security;
create policy "owner manages follow-ups" on public.follow_ups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.follow_ups from anon;

-- The touches suggested after an acceptance, counted from the day it was accepted. A touch that was due
-- more than a week before today is skipped, so importing old connections doesn't pile up stale tasks.
create function public.suggest_follow_ups(p_user uuid, p_candidate uuid, p_accepted_on date, p_sample boolean)
returns void
language sql
set search_path = ''
as $$
  insert into public.follow_ups (user_id, candidate_id, kind, due_on, is_sample)
  select p_user, p_candidate, t.kind, p_accepted_on + t.days, p_sample
  from (values ('thank_you', 0), ('coffee_chat', 7), ('check_in_30', 30), ('check_in_90', 90)) as t (kind, days)
  where p_accepted_on + t.days >= current_date - 7
  on conflict (candidate_id, kind) do nothing
$$;

create function public.invitations_suggest_follow_ups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.outcome = 'accepted' and (tg_op = 'INSERT' or old.outcome is distinct from 'accepted') then
    perform public.suggest_follow_ups(new.user_id, new.candidate_id, coalesce(new.resolved_at, now())::date, new.is_sample);
  end if;
  return new;
end;
$$;

create trigger invitations_suggest_follow_ups
after insert or update of outcome on public.invitations
for each row execute function public.invitations_suggest_follow_ups();

-- Undoing an acceptance (the invitation was recorded by mistake) takes back the touches not yet acted on.
create function public.invitations_drop_follow_ups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.follow_ups where candidate_id = old.candidate_id and user_id = old.user_id and state = 'suggested';
  return old;
end;
$$;

create trigger invitations_drop_follow_ups
after delete on public.invitations
for each row execute function public.invitations_drop_follow_ups();

-- People already accepted get the touches that are still ahead of them (the same one-week rule).
select public.suggest_follow_ups(i.user_id, i.candidate_id, i.resolved_at::date, i.is_sample)
from public.invitations i
where i.outcome = 'accepted' and i.resolved_at is not null;

-- Due touches appear in the bell, using the same "Reminders" switch in Settings.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('alert', 'reminder', 'interview', 'source_problem', 'weekly_summary', 'follow_up'));
