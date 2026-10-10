-- Phase 6: what the user says about themselves, used only to word connection notes.
alter table public.settings
  add column my_school_text text check (length(my_school_text) <= 200),
  add column my_program_text text check (length(my_program_text) <= 200),
  add column my_interests text check (length(my_interests) <= 300);
