-- Expose training tables to Supabase Data API roles.
-- RLS policies still decide which rows each role can access.

grant select on public.training_sessions to anon;
grant insert on public.training_registrations to anon;

grant select, insert, update, delete on public.training_sessions to authenticated;
grant select, insert, update, delete on public.training_registrations to authenticated;
grant select, insert, update, delete on public.training_session_trainers to authenticated;
grant select, insert, update, delete on public.training_attendance_docs to authenticated;

grant select, insert, update, delete on public.training_sessions to service_role;
grant select, insert, update, delete on public.training_registrations to service_role;
grant select, insert, update, delete on public.training_session_trainers to service_role;
grant select, insert, update, delete on public.training_attendance_docs to service_role;

notify pgrst, 'reload schema';
