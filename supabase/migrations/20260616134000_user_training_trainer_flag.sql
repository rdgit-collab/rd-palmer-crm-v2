-- Let admins maintain a dedicated training trainer roster from existing CRM users.

alter table public.users
  add column if not exists is_trainer boolean not null default false;

create index if not exists idx_users_training_trainers
  on public.users(is_trainer, status)
  where is_trainer is true;

notify pgrst, 'reload schema';
