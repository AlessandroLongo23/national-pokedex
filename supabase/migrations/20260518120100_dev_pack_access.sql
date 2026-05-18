-- DEV-ONLY: mirrors 20260517130000_dev_open_access.sql for the new pack
-- tables. Disables RLS so the hard-coded DEV_USER_ID can read/write without
-- authentication. Safe to re-run.
--
-- To re-add authentication later:
--   alter table public.packs_opened  enable row level security;
--   alter table public.pack_contents enable row level security;

alter table public.packs_opened  disable row level security;
alter table public.pack_contents disable row level security;

notify pgrst, 'reload schema';
