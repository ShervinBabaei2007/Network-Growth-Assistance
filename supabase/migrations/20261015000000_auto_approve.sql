-- Approve candidates automatically when both school and program are recognised.
alter table public.settings add column auto_approve boolean not null default false;
