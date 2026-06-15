-- =====================================================================
-- Training Module Security Hardening
-- - Replaces broad authenticated RLS with module-permission-aware policies.
-- - Keeps public signup limited to open sessions.
-- - Enforces public signup open/capacity rules at the database layer.
-- =====================================================================

create schema if not exists private;

create or replace function private.current_user_can_access_training()
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
      and (
        u.role_id in (1, 99)
        or exists (
          select 1
          from public.module_permission mp
          where mp.role_id = u.role_id
            and mp.module = 'training'
            and mp.can_access is true
        )
      )
  );
$$;

revoke all on function private.current_user_can_access_training() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_can_access_training() to authenticated;

drop policy if exists training_sessions_auth_all on public.training_sessions;
drop policy if exists training_regs_auth_all on public.training_registrations;
drop policy if exists training_trainers_auth_all on public.training_session_trainers;
drop policy if exists training_docs_auth_all on public.training_attendance_docs;
drop policy if exists training_sessions_anon_read on public.training_sessions;
drop policy if exists training_regs_anon_insert on public.training_registrations;

drop policy if exists training_sessions_staff_all on public.training_sessions;
create policy training_sessions_staff_all on public.training_sessions
  for all to authenticated
  using ((select private.current_user_can_access_training()))
  with check ((select private.current_user_can_access_training()));

drop policy if exists training_regs_staff_all on public.training_registrations;
create policy training_regs_staff_all on public.training_registrations
  for all to authenticated
  using ((select private.current_user_can_access_training()))
  with check ((select private.current_user_can_access_training()));

drop policy if exists training_trainers_staff_all on public.training_session_trainers;
create policy training_trainers_staff_all on public.training_session_trainers
  for all to authenticated
  using ((select private.current_user_can_access_training()))
  with check ((select private.current_user_can_access_training()));

drop policy if exists training_docs_staff_all on public.training_attendance_docs;
create policy training_docs_staff_all on public.training_attendance_docs
  for all to authenticated
  using ((select private.current_user_can_access_training()))
  with check ((select private.current_user_can_access_training()));

drop policy if exists training_sessions_public_open_read on public.training_sessions;
create policy training_sessions_public_open_read on public.training_sessions
  for select to anon
  using (is_open is true);

drop policy if exists training_regs_public_insert on public.training_registrations;
create policy training_regs_public_insert on public.training_registrations
  for insert to anon
  with check (
    source = 'public'
    and exists (
      select 1
      from public.training_sessions s
      where s.id = session_id
        and s.is_open is true
    )
  );

alter table public.training_registrations
  drop constraint if exists training_regs_public_required_fields;

alter table public.training_registrations
  add constraint training_regs_public_required_fields
  check (
    source <> 'public'
    or (
      length(btrim(coalesce(participant_name, ''))) > 0
      and length(btrim(coalesce(company, ''))) > 0
      and length(btrim(coalesce(email, ''))) > 0
      and length(btrim(coalesce(phone, ''))) > 0
      and length(btrim(coalesce(nric, ''))) > 0
    )
  ) not valid;

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
begin
  if new.source = 'public' then
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
