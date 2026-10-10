-- Phase 2: grouped candidate counts for the dashboard.
-- security_invoker makes the view run with the caller's permissions, so RLS still applies.
create view public.candidate_category_counts
with (security_invoker = true)
as
select
  user_id,
  discipline,
  university,
  status,
  (university_confidence = 'confirmed' and discipline_confidence = 'confirmed') as classified,
  count(*)::integer as candidate_count
from public.candidates
group by user_id, discipline, university, status, classified;

revoke all on public.candidate_category_counts from anon;
grant select on public.candidate_category_counts to authenticated;

create index candidates_user_discovered_idx on public.candidates (user_id, discovered_at);
