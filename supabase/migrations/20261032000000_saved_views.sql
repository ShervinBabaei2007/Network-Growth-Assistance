-- Saved views: a named set of filters for a list page, kept as the page's URL search string
-- (for example "status=approved&university=..."). Opening a view just opens that URL.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page text not null check (page in ('candidates')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  query text not null default '' check (char_length(query) <= 600),
  created_at timestamptz not null default now()
);

create unique index saved_views_user_page_name_idx on public.saved_views (user_id, page, lower(btrim(name)));
create index saved_views_user_page_idx on public.saved_views (user_id, page, created_at);

alter table public.saved_views enable row level security;
create policy "owner manages saved views" on public.saved_views for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.saved_views from anon;

-- A person keeps a modest number of views; the limit is enforced here, not only in the app.
create function public.saved_views_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_views where user_id = new.user_id) >= 30 then
    raise exception 'You can keep up to 30 saved views. Delete one first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger saved_views_limit before insert on public.saved_views
  for each row execute function public.saved_views_limit();
