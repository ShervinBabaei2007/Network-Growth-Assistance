-- Indexes that match how two list pages sort, so a page of 25-200 rows is read straight from the index
-- instead of reading and sorting every row the user has (4.6 ms to 0.14 ms and 3.9 ms to 0.06 ms at 20,000 rows).
-- A matching index for Candidates filtered by status measured no faster, so none was added.

-- Applications, most recently changed first.
create index applications_user_changed_idx on public.applications (user_id, stage_changed_at desc);

-- People: reminders first, then by relevance (the People page order), for saved people only.
create index network_people_user_saved_order_idx on public.network_people (user_id, reminder_at asc nulls last, relevance_score desc nulls last) where saved;
