-- Cover training foreign keys used by joins and cascade checks.

create index if not exists idx_training_sessions_created_by
  on public.training_sessions(created_by);

create index if not exists idx_training_trainers_user
  on public.training_session_trainers(user_id);

create index if not exists idx_training_docs_uploaded_by
  on public.training_attendance_docs(uploaded_by);
