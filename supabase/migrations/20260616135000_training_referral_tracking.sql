-- Training referral tracking
-- - Gives each staff user a random public referral code.
-- - Public signup can submit only the code; the database resolves ownership.
-- - Admin/Super Admin keep management access; other training users can read sessions only.

create schema if not exists private;

create table if not exists public.training_referral_codes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  referral_code text not null unique,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

alter table public.training_referral_codes enable row level security;

alter table public.training_registrations
  add column if not exists referral_code text,
  add column if not exists invited_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists invited_by_old_user_id integer,
  add column if not exists invited_by_name_snapshot text;

create index if not exists idx_training_referral_codes_user on public.training_referral_codes(user_id);
create index if not exists idx_training_referral_codes_code on public.training_referral_codes(referral_code);
create index if not exists idx_training_regs_invited_by on public.training_registrations(invited_by_user_id);
create index if not exists idx_training_regs_referral_code on public.training_registrations(referral_code);

create or replace function private.current_user_is_training_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.role_id in (1, 99)
  );
$$;

revoke all on function private.current_user_is_training_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_is_training_admin() to authenticated;

create or replace function private.ensure_training_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  generated_code text;
begin
  if new.id is null then
    return new;
  end if;

  if exists (select 1 from public.training_referral_codes where user_id = new.id) then
    return new;
  end if;

  loop
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.training_referral_codes(user_id, referral_code)
      values (new.id, generated_code);
      exit;
    exception when unique_violation then
      -- Rare collision; generate another code.
    end;
  end loop;

  return new;
end;
$$;

revoke all on function private.ensure_training_referral_code() from public;

drop trigger if exists users_training_referral_code on public.users;
create trigger users_training_referral_code
  after insert on public.users
  for each row
  execute function private.ensure_training_referral_code();

do $$
declare
  staff_user record;
  generated_code text;
begin
  for staff_user in
    select id from public.users where id is not null
  loop
    if not exists (select 1 from public.training_referral_codes where user_id = staff_user.id) then
      loop
        generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
        begin
          insert into public.training_referral_codes(user_id, referral_code)
          values (staff_user.id, generated_code);
          exit;
        exception when unique_violation then
          -- Rare collision; generate another code.
        end;
      end loop;
    end if;
  end loop;
end $$;

create or replace function private.enforce_training_public_registration_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_capacity integer;
  session_open boolean;
  registration_count integer;
  referral record;
  normalized_referral_code text;
begin
  if new.source = 'public' then
    normalized_referral_code := nullif(upper(btrim(coalesce(new.referral_code, ''))), '');
    new.referral_code := null;
    new.invited_by_user_id := null;
    new.invited_by_old_user_id := null;
    new.invited_by_name_snapshot := null;

    if normalized_referral_code is not null then
      select
        rc.referral_code,
        rc.user_id,
        u.old_user_id,
        nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as invited_by_name
      into referral
      from public.training_referral_codes rc
      join public.users u on u.id = rc.user_id
      where rc.referral_code = normalized_referral_code
        and rc.is_active is true
        and coalesce(u.status, 'Active') = 'Active'
      limit 1;

      if found then
        new.referral_code := referral.referral_code;
        new.invited_by_user_id := referral.user_id;
        new.invited_by_old_user_id := referral.old_user_id;
        new.invited_by_name_snapshot := referral.invited_by_name;
      end if;
    end if;

    select s.capacity, s.is_open
      into session_capacity, session_open
    from public.training_sessions s
    where s.id = new.session_id
    for update;

    if not found or session_open is not true then
      raise exception 'Training session is closed';
    end if;

    if coalesce(session_capacity, 0) > 0 then
      select count(*)
        into registration_count
      from public.training_registrations r
      where r.session_id = new.session_id;

      if registration_count >= session_capacity then
        raise exception 'Training session is full';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_training_public_registration_rules() from public;

drop trigger if exists training_public_registration_guard on public.training_registrations;
create trigger training_public_registration_guard
  before insert on public.training_registrations
  for each row
  execute function private.enforce_training_public_registration_rules();

drop policy if exists training_sessions_staff_all on public.training_sessions;
drop policy if exists training_regs_staff_all on public.training_registrations;
drop policy if exists training_trainers_staff_all on public.training_session_trainers;
drop policy if exists training_docs_staff_all on public.training_attendance_docs;

drop policy if exists training_sessions_staff_read on public.training_sessions;
create policy training_sessions_staff_read on public.training_sessions
  for select to authenticated
  using ((select private.current_user_can_access_training()));

drop policy if exists training_sessions_admin_insert on public.training_sessions;
create policy training_sessions_admin_insert on public.training_sessions
  for insert to authenticated
  with check ((select private.current_user_is_training_admin()));

drop policy if exists training_sessions_admin_update on public.training_sessions;
create policy training_sessions_admin_update on public.training_sessions
  for update to authenticated
  using ((select private.current_user_is_training_admin()))
  with check ((select private.current_user_is_training_admin()));

drop policy if exists training_sessions_admin_delete on public.training_sessions;
create policy training_sessions_admin_delete on public.training_sessions
  for delete to authenticated
  using ((select private.current_user_is_training_admin()));

drop policy if exists training_regs_admin_all on public.training_registrations;
create policy training_regs_admin_all on public.training_registrations
  for all to authenticated
  using ((select private.current_user_is_training_admin()))
  with check ((select private.current_user_is_training_admin()));

drop policy if exists training_trainers_staff_read on public.training_session_trainers;
create policy training_trainers_staff_read on public.training_session_trainers
  for select to authenticated
  using ((select private.current_user_can_access_training()));

drop policy if exists training_trainers_admin_all on public.training_session_trainers;
create policy training_trainers_admin_all on public.training_session_trainers
  for all to authenticated
  using ((select private.current_user_is_training_admin()))
  with check ((select private.current_user_is_training_admin()));

drop policy if exists training_docs_admin_all on public.training_attendance_docs;
create policy training_docs_admin_all on public.training_attendance_docs
  for all to authenticated
  using ((select private.current_user_is_training_admin()))
  with check ((select private.current_user_is_training_admin()));

drop policy if exists training_referral_codes_own_read on public.training_referral_codes;
create policy training_referral_codes_own_read on public.training_referral_codes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.current_user_is_training_admin()));

drop policy if exists training_referral_codes_admin_all on public.training_referral_codes;
create policy training_referral_codes_admin_all on public.training_referral_codes
  for all to authenticated
  using ((select private.current_user_is_training_admin()))
  with check ((select private.current_user_is_training_admin()));

grant select on public.training_referral_codes to authenticated;
grant select, insert, update, delete on public.training_referral_codes to service_role;

notify pgrst, 'reload schema';
