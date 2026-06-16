-- Support one-day and multi-day training sessions.

alter table public.training_sessions
  add column if not exists end_date date;

update public.training_sessions
set end_date = session_date
where end_date is null
  and session_date is not null;

notify pgrst, 'reload schema';
