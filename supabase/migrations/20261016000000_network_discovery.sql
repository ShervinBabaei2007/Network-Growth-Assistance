-- Network discovery: known 1st-degree connections, AI-assisted people research with
-- evidence for every fact, and a small CRM for the people worth meeting.
-- Nothing here is read from LinkedIn. Every row is owned by one user and isolated by RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.known_connection_source as enum ('csv', 'linkedin_export', 'manual');
-- Proximity is never inferred: 2nd and 3rd degree are only what the user marks by hand.
create type public.network_proximity as enum ('connected', 'not_connected', 'unknown', 'manual_second', 'manual_third');
create type public.network_person_status as enum (
  'discovered',
  'shortlisted',
  'ready_to_connect',
  'connection_sent_manually',
  'connected',
  'replied',
  'follow_up',
  'archived',
  'not_relevant'
);
create type public.evidence_confidence as enum ('high', 'medium', 'low');
create type public.network_search_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.known_match_state as enum ('none', 'auto_hidden', 'needs_review', 'confirmed_same', 'confirmed_different');
create type public.search_person_tier as enum ('verified', 'possible', 'hidden_connected', 'rejected');
create type public.person_feedback_kind as enum ('great_match', 'not_relevant', 'already_connected', 'wrong_person', 'wrong_program');
create type public.network_fact_field as enum (
  'institution', 'program', 'degree', 'grad_year', 'role', 'company', 'location', 'github', 'website', 'linkedin'
);

-- ---------------------------------------------------------------------------
-- Known 1st-degree connections (imported CSV or added by hand). Emails are never stored.
-- ---------------------------------------------------------------------------
create table public.known_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0 and length(full_name) <= 200),
  first_name text check (length(first_name) <= 100),
  last_name text check (length(last_name) <= 100),
  normalized_name text not null check (length(normalized_name) > 0),
  company text check (length(company) <= 200),
  position text check (length(position) <= 300),
  linkedin_url text,
  linkedin_key text,
  connected_on date,
  source public.known_connection_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index known_connections_user_linkedin_key on public.known_connections (user_id, linkedin_key) where linkedin_key is not null;
create index known_connections_user_name_idx on public.known_connections (user_id, normalized_name);
create index known_connections_name_trgm_idx on public.known_connections using gin (normalized_name extensions.gin_trgm_ops);

create trigger known_connections_set_updated_at
before update on public.known_connections
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Searches: one research job per natural-language request
-- ---------------------------------------------------------------------------
create table public.network_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  original_query text not null check (length(btrim(original_query)) > 0 and length(original_query) <= 1000),
  criteria jsonb,
  target_count integer not null check (target_count between 1 and 100),
  status public.network_search_status not null default 'queued',
  stage text not null default 'understanding',
  -- Resumable agent state: the query plan, cursor and stop bookkeeping.
  state jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  error text,
  lease_until timestamptz,
  parent_search_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_search_id, user_id) references public.network_searches (id, user_id) on delete set null (parent_search_id)
);

create index network_searches_user_created_idx on public.network_searches (user_id, created_at desc);
create index network_searches_user_status_idx on public.network_searches (user_id, status);

create trigger network_searches_set_updated_at
before update on public.network_searches
for each row execute function public.set_updated_at();

create table public.network_search_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  search_id uuid not null,
  provider text not null,
  query text not null check (length(query) <= 500),
  family text not null,
  result_count integer,
  error text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  -- user_id first in unique keys: another user's insert fails on the ownership FK instead of
  -- revealing that a row exists.
  unique (user_id, search_id, provider, query),
  foreign key (search_id, user_id) references public.network_searches (id, user_id) on delete cascade
);

create index network_search_queries_search_idx on public.network_search_queries (search_id);

-- ---------------------------------------------------------------------------
-- Public sources: user-scoped cache of fetched public pages, and the evidence they back
-- ---------------------------------------------------------------------------
create table public.network_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  url_hash text not null,
  title text,
  provider text not null,
  -- Only a bounded excerpt of public page text is kept, to quote evidence.
  text_excerpt text check (length(text_excerpt) <= 60000),
  -- Links on the page; extracted URLs are only kept if the page really links to them.
  links text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (id, user_id),
  unique (user_id, url_hash)
);

create table public.network_search_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null,
  query_hash text not null,
  results jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider, query_hash)
);

-- ---------------------------------------------------------------------------
-- People found by research (the "candidate" of discovery; separate from outreach candidates)
-- ---------------------------------------------------------------------------
create table public.network_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0 and length(full_name) <= 200),
  first_name text,
  last_name text,
  normalized_name text not null check (length(normalized_name) > 0),
  headline text,
  current_title text,
  current_company text,
  location text,
  github_url text,
  github_login text,
  personal_website text,
  linkedin_url text,
  linkedin_key text,
  -- Strong identity signals (github:login, domain:example.com, linkedin:slug) for entity resolution.
  identity_keys text[] not null default '{}',
  proximity public.network_proximity not null default 'unknown',
  crm_status public.network_person_status not null default 'discovered',
  saved boolean not null default false,
  relevance_score smallint check (relevance_score between 0 and 100),
  confidence_score smallint check (confidence_score between 0 and 100),
  score_breakdown jsonb not null default '[]'::jsonb,
  reasons text[] not null default '{}',
  networking_value_score smallint check (networking_value_score between 0 and 100),
  reason_for_connecting text,
  conversation_angle text,
  known_connection_id uuid,
  known_match_confidence real check (known_match_confidence between 0 and 1),
  known_match_state public.known_match_state not null default 'none',
  possible_duplicate_of uuid,
  candidate_id uuid,
  tags text[] not null default '{}',
  category text check (length(category) <= 60),
  reminder_at date,
  notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (known_connection_id, user_id) references public.known_connections (id, user_id) on delete set null (known_connection_id),
  foreign key (possible_duplicate_of, user_id) references public.network_people (id, user_id) on delete set null (possible_duplicate_of),
  foreign key (candidate_id, user_id) references public.candidates (id, user_id) on delete set null (candidate_id)
);

create index network_people_user_name_idx on public.network_people (user_id, normalized_name);
create index network_people_user_status_idx on public.network_people (user_id, crm_status);
create index network_people_user_proximity_idx on public.network_people (user_id, proximity);
create index network_people_user_score_idx on public.network_people (user_id, relevance_score desc);
create index network_people_user_saved_idx on public.network_people (user_id, saved) where saved;
create index network_people_identity_keys_idx on public.network_people using gin (identity_keys);

create trigger network_people_set_updated_at
before update on public.network_people
for each row execute function public.set_updated_at();

-- Each fact about a person, with the public source and the exact text that supports it.
create table public.network_person_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  field public.network_fact_field not null,
  value text not null check (length(value) <= 500),
  source_id uuid,
  source_url text not null,
  source_title text,
  extracted_text text not null check (length(extracted_text) <= 1000),
  confidence public.evidence_confidence not null,
  query_id uuid,
  created_at timestamptz not null default now(),
  foreign key (person_id, user_id) references public.network_people (id, user_id) on delete cascade,
  foreign key (source_id, user_id) references public.network_sources (id, user_id) on delete set null (source_id),
  foreign key (query_id, user_id) references public.network_search_queries (id, user_id) on delete set null (query_id),
  unique (user_id, person_id, field, value, source_url)
);

create index network_person_facts_person_idx on public.network_person_facts (person_id);

create table public.network_search_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  search_id uuid not null,
  person_id uuid not null,
  query_id uuid,
  tier public.search_person_tier not null default 'possible',
  tier_reason text,
  -- Scores are per search: the same person can match one request strongly and another weakly.
  relevance_score smallint check (relevance_score between 0 and 100),
  confidence_score smallint check (confidence_score between 0 and 100),
  score_breakdown jsonb not null default '[]'::jsonb,
  reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, search_id, person_id),
  foreign key (search_id, user_id) references public.network_searches (id, user_id) on delete cascade,
  foreign key (person_id, user_id) references public.network_people (id, user_id) on delete cascade,
  foreign key (query_id, user_id) references public.network_search_queries (id, user_id) on delete set null (query_id)
);

create index network_search_people_search_idx on public.network_search_people (search_id, tier, relevance_score desc);
create index network_search_people_person_idx on public.network_search_people (person_id);

create trigger network_search_people_set_updated_at
before update on public.network_search_people
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- CRM history, feedback and user corrections
-- ---------------------------------------------------------------------------
create table public.network_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  kind text not null check (kind in ('status_change', 'note', 'message_copied', 'linkedin_opened', 'marked_sent', 'replied', 'follow_up', 'proximity')),
  body text check (length(body) <= 2000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (person_id, user_id) references public.network_people (id, user_id) on delete cascade
);

create index network_interactions_person_idx on public.network_interactions (person_id, occurred_at desc);

create table public.network_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  search_id uuid,
  kind public.person_feedback_kind not null,
  created_at timestamptz not null default now(),
  foreign key (person_id, user_id) references public.network_people (id, user_id) on delete cascade,
  foreign key (search_id, user_id) references public.network_searches (id, user_id) on delete set null (search_id),
  unique (user_id, person_id, kind)
);

create index network_feedback_user_kind_idx on public.network_feedback (user_id, kind);

-- "This person is / isn't my connection" decisions, keyed by an identity signature so they
-- still apply when the same person is rediscovered by a later search.
create table public.network_connection_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  identity_signature text not null,
  known_connection_id uuid,
  same_person boolean not null,
  created_at timestamptz not null default now(),
  foreign key (known_connection_id, user_id) references public.known_connections (id, user_id) on delete cascade,
  unique nulls not distinct (user_id, identity_signature, known_connection_id)
);

-- What the user is looking for, used to rank people and word introductions.
alter table public.settings
  add column networking_goal text check (length(networking_goal) <= 300);

-- ---------------------------------------------------------------------------
-- Row-level security: owners only
-- ---------------------------------------------------------------------------
alter table public.known_connections enable row level security;
alter table public.network_searches enable row level security;
alter table public.network_search_queries enable row level security;
alter table public.network_sources enable row level security;
alter table public.network_search_cache enable row level security;
alter table public.network_people enable row level security;
alter table public.network_person_facts enable row level security;
alter table public.network_search_people enable row level security;
alter table public.network_interactions enable row level security;
alter table public.network_feedback enable row level security;
alter table public.network_connection_overrides enable row level security;

create policy "owner can manage known connections" on public.known_connections
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage searches" on public.network_searches
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage search queries" on public.network_search_queries
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage sources" on public.network_sources
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage search cache" on public.network_search_cache
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage people" on public.network_people
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage facts" on public.network_person_facts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage search people" on public.network_search_people
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage interactions" on public.network_interactions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage feedback" on public.network_feedback
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can manage overrides" on public.network_connection_overrides
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.known_connections, public.network_searches, public.network_search_queries,
  public.network_sources, public.network_search_cache, public.network_people, public.network_person_facts,
  public.network_search_people, public.network_interactions, public.network_feedback,
  public.network_connection_overrides from anon;
