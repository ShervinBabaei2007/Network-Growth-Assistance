-- Removes the benchmark user; every table cascades from the account.
delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000001';
