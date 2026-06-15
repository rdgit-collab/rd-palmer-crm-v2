-- =====================================================================
-- Training Module — NEW tables only. Does NOT touch any existing table.
-- Safe to run on main or a Supabase branch. Idempotent where possible.
-- Trainers + creators link to the existing public.users table (read-only FK).
-- =====================================================================

-- ---------- training_sessions ----------
create table if not exists public.training_sessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text not null unique,
  description   text,
  overview      text,
  session_date  date,
  start_time    text,
  location      text,
  capacity      integer default 20,
  fee           numeric(12,2) default 0,
  duration      text,
  level         text,
  language      text,
  certificate   boolean default true,
  hrd_claimable boolean default true,
  outcomes      jsonb default '[]'::jsonb,
  audience      jsonb default '[]'::jsonb,
  includes      jsonb default '[]'::jsonb,
  agenda        jsonb default '[]'::jsonb,
  is_open       boolean default true,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ---------- training_registrations ----------
create table if not exists public.training_registrations (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.training_sessions(id) on delete cascade,
  participant_name text not null,
  company          text,
  email            text,
  phone            text,
  nric             text,
  industry         text,
  existing_user    boolean default false,
  hrd_claim        boolean default false,
  hr_email         text,
  source           text default 'public',           -- 'public' | 'manual'
  -- customer status milestones (timestamp = done; null = pending)
  proforma_at      timestamptz,
  paid_at          timestamptz,
  cash_at          timestamptz,
  hrd_applied_at   timestamptz,
  hrd_approved_at  timestamptz,
  hrd_released_at  timestamptz,
  created_at       timestamptz default now()
);
create index if not exists idx_training_regs_session on public.training_registrations(session_id);

-- ---------- training_session_trainers (links to public.users) ----------
create table if not exists public.training_session_trainers (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (session_id, user_id)
);
create index if not exists idx_training_trainers_session on public.training_session_trainers(session_id);

-- ---------- training_attendance_docs ----------
create table if not exists public.training_attendance_docs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  file_path   text not null,        -- path inside the existing 'crm-uploads' storage bucket
  file_name   text,
  file_size   text,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at  timestamptz default now()
);
create index if not exists idx_training_docs_session on public.training_attendance_docs(session_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.training_sessions          enable row level security;
alter table public.training_registrations      enable row level security;
alter table public.training_session_trainers   enable row level security;
alter table public.training_attendance_docs    enable row level security;

-- Authenticated staff: full access (module visibility is enforced in-app
-- via module_permission, mirroring the rest of the CRM).
drop policy if exists training_sessions_auth_all on public.training_sessions;
create policy training_sessions_auth_all on public.training_sessions
  for all to authenticated using (true) with check (true);

drop policy if exists training_regs_auth_all on public.training_registrations;
create policy training_regs_auth_all on public.training_registrations
  for all to authenticated using (true) with check (true);

drop policy if exists training_trainers_auth_all on public.training_session_trainers;
create policy training_trainers_auth_all on public.training_session_trainers
  for all to authenticated using (true) with check (true);

drop policy if exists training_docs_auth_all on public.training_attendance_docs;
create policy training_docs_auth_all on public.training_attendance_docs
  for all to authenticated using (true) with check (true);

-- Public (anon) signup page:
--   * can READ sessions (to render the landing page by slug)
--   * can INSERT their own registration
--   * cannot read other people's registrations
drop policy if exists training_sessions_anon_read on public.training_sessions;
create policy training_sessions_anon_read on public.training_sessions
  for select to anon using (true);

drop policy if exists training_regs_anon_insert on public.training_registrations;
create policy training_regs_anon_insert on public.training_registrations
  for insert to anon with check (true);

-- =====================================================================
-- Permission seed: default DENY for all non-admin roles.
-- Admin (1) and Super Admin (99) always bypass in the app, no row needed.
-- Super Admin can flip these ON in Settings → Role Permissions.
-- Roles: 2 = Sales, 3 = Service, 4 = Sales Manager
-- =====================================================================
insert into public.module_permission (role_id, module, can_access)
values (2, 'training', false), (3, 'training', false), (4, 'training', false)
on conflict (role_id, module) do nothing;
