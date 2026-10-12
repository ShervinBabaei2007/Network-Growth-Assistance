-- Worldwide jobs: every job records where it can be done, and each user picks a country.
--
-- countries: ISO country codes ("CA", "US"), world-region tokens for remote jobs open to a
-- region ("europe", "latam", "emea"…), and "*" for remote jobs open anywhere. A search for
-- a country matches its code, its regions and "*".
-- country: the one physical country of the place shown, when there is one.
-- province: now the region inside the country when stated: a Canadian province or US state.
--
-- Additive: every existing job was found by the Canada-only search, so it's open to Canada.

alter table public.jobs
  add column countries text[] not null default '{}'
    check (array_to_string(countries, ',') ~ '^(([A-Z]{2}|\*|[a-z][a-z-]{1,20})(,|$))*$' and cardinality(countries) <= 60),
  add column country text check (country ~ '^[A-Z]{2}$');

update public.jobs set countries = '{CA}', country = case when remote and province is null then null else 'CA' end where countries = '{}';

create index jobs_countries_idx on public.jobs using gin (countries) where closed_at is null;

comment on column public.jobs.province is 'Region inside the country, when stated: a Canadian province or US state code.';

-- Search preferences: one country at a time ("*" = remote jobs open anywhere). Provinces apply to Canada.
alter table public.settings
  add column job_country text not null default 'CA' check (job_country ~ '^([A-Z]{2}|\*)$');

-- How many jobs a board has in the countries users search (it was Canada only).
alter table public.employers rename column canada_jobs to matching_jobs;

-- The countries users search, so the crawler keeps only jobs someone can see. Server only.
create or replace function public.job_search_countries()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct job_country from public.settings
$$;

revoke all on function public.job_search_countries() from public, anon, authenticated;
grant execute on function public.job_search_countries() to service_role;
