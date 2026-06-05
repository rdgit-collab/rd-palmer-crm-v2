-- 2026-06-05
-- Problem:
-- PostgREST could not call public.search_activities because two overloads had
-- similar named parameters. SQL could run it, but the browser RPC returned
-- PGRST203 "Could not choose the best candidate function".
--
-- Fix:
-- Drop the stale overload and reload PostgREST schema cache.

drop function if exists public.search_activities(text, text, text, text, integer, boolean, date, date, integer, integer, boolean);
notify pgrst, 'reload schema';
