-- Production foundation: per-user rate limits for expensive actions, and the missing
-- ownership-checked link from a tailored document to the resume it was written from.

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------
-- One row per user, action ("bucket") and fixed time window. Users can't read or write
-- it directly; hit_rate_limit() counts for the signed-in user only (auth.uid()), so a
-- caller can't spend or reset someone else's allowance.
create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_.]{0,49}$'),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one use of `p_bucket` for the signed-in user. True when the use is allowed
-- (and counted); false when `p_max` uses in the current `p_window_seconds` window are
-- already spent. Old windows are cleaned up by prune_rate_limits().
create function public.hit_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_max < 1 or p_window_seconds < 1 or p_window_seconds > 7 * 86400 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (user_id, bucket, window_start, count)
  values (v_user, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set count = r.count + 1
    where r.count < p_max
  returning count into v_count;
  return v_count is not null;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.hit_rate_limit(text, integer, integer) to authenticated, service_role;

-- Daily cleanup: windows older than the longest allowed window can't matter any more.
create function public.prune_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.rate_limits where window_start < now() - interval '8 days' returning 1)
  select count(*)::integer from gone;
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- ---------------------------------------------------------------------------
-- tailored_documents.resume_id: owned by the same user
-- ---------------------------------------------------------------------------
-- The column was added without a foreign key. Clear values that point at a resume the
-- document's owner doesn't have (deleted, or never theirs), then enforce it. Deleting
-- the resume keeps the document and only clears the link.
update public.tailored_documents d
set resume_id = null
where d.resume_id is not null
  and not exists (select 1 from public.resumes r where r.id = d.resume_id and r.user_id = d.user_id);

alter table public.tailored_documents
  add constraint tailored_documents_resume_fkey
  foreign key (resume_id, user_id) references public.resumes (id, user_id)
  on delete set null (resume_id)
  not valid;

alter table public.tailored_documents validate constraint tailored_documents_resume_fkey;
