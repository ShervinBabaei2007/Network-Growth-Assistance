-- Employer favicons. An employer shows its own icon only when someone has confirmed its website; we never guess a
-- domain from a name. The icon is fetched once from that host (through the safe fetcher), stored here and served from
-- our own route, so a person's browser never contacts a third party.

alter table public.employers
  add column website text check (website is null or (website ~* '^https?://[^/\s]+\.[^/\s]+/?$' and char_length(website) <= 200)),
  add column has_icon boolean not null default false,
  add column icon_checked_at timestamptz;

create table public.employer_icons (
  employer_id uuid primary key references public.employers (id) on delete cascade,
  content_type text not null check (content_type in ('image/png', 'image/x-icon', 'image/jpeg', 'image/gif', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 32768),
  fetched_at timestamptz not null default now()
);
alter table public.employer_icons enable row level security;
create policy "signed-in users can read employer icons" on public.employer_icons
  for select to authenticated using (true);

-- Employers with a website that has never been checked, or was last checked over 30 days ago, oldest first.
create index employers_icon_due_idx on public.employers (icon_checked_at nulls first) where website is not null;
