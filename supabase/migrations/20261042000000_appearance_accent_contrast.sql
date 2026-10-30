-- Appearance gets an accent colour and a contrast choice, saved with the other appearance settings.

alter table public.settings
  add column accent text not null default 'blue' check (accent in ('blue', 'teal', 'green', 'violet', 'rose')),
  add column contrast text not null default 'standard' check (contrast in ('standard', 'high'));
