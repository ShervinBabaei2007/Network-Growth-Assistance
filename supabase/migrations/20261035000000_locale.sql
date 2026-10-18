-- The language a person chose, so it follows them across devices. Until they choose, the browser's language is used.
alter table public.settings
  add column locale text check (locale in ('en', 'fr-CA'));
