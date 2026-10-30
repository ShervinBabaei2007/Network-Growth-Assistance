-- Saved views were for Candidates only. People, Applications and Jobs get them too.

alter table public.saved_views drop constraint saved_views_page_check;
alter table public.saved_views
  add constraint saved_views_page_check check (page in ('candidates', 'people', 'applications', 'jobs'));
