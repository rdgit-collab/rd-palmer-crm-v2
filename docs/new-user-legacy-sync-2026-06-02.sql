-- Guardrail for future staff creation.
--
-- Any new Supabase Auth user now receives:
-- - a public.users profile
-- - a unique users.old_user_id
-- - a matching public.legacy_users row
--
-- Updates to public.users also keep legacy_users synchronized so assignment
-- dropdowns and old-id ownership fields remain aligned.

create or replace function app_private.next_old_user_id()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_id integer;
begin
  perform pg_advisory_xact_lock(202606021001);

  select greatest(
    coalesce((select max(old_user_id) from public.users), 0),
    coalesce((select max(old_user_id) from public.legacy_users), 0)
  ) + 1
  into next_id;

  return next_id;
end;
$$;

create or replace function app_private.sync_legacy_user_from_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile public.users%rowtype;
  legacy_status text;
begin
  select * into profile
  from public.users
  where id = p_user_id;

  if not found or profile.old_user_id is null then
    return;
  end if;

  legacy_status := case when profile.status = 'Inactive' then '0' else '1' end;

  insert into public.legacy_users (
    old_user_id, email, first_name, last_name, role_id, status,
    position, department, phone, created_at, updated_at, auth_user_id
  ) values (
    profile.old_user_id, profile.email, profile.first_name, profile.last_name,
    profile.role_id, legacy_status, profile.position, profile.department,
    profile.phone, profile.created_at, now(), profile.id
  )
  on conflict (old_user_id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role_id = excluded.role_id,
    status = excluded.status,
    position = excluded.position,
    department = excluded.department,
    phone = excluded.phone,
    updated_at = excluded.updated_at,
    auth_user_id = excluded.auth_user_id;
end;
$$;

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  metadata jsonb;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  insert into public.users (
    id, old_user_id, email, first_name, last_name, role_id, position,
    department, phone, status, created_at, updated_at
  ) values (
    new.id,
    app_private.next_old_user_id(),
    new.email,
    coalesce(nullif(metadata->>'first_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'New User'),
    nullif(metadata->>'last_name', ''),
    coalesce(nullif(metadata->>'role_id', '')::integer, 2),
    nullif(metadata->>'position', ''),
    nullif(metadata->>'department', ''),
    nullif(metadata->>'phone', ''),
    'Active',
    now(),
    now()
  )
  on conflict (id) do update set
    old_user_id = coalesce(public.users.old_user_id, excluded.old_user_id),
    email = coalesce(public.users.email, excluded.email),
    first_name = coalesce(nullif(public.users.first_name, ''), excluded.first_name),
    last_name = coalesce(public.users.last_name, excluded.last_name),
    role_id = coalesce(public.users.role_id, excluded.role_id),
    position = coalesce(public.users.position, excluded.position),
    department = coalesce(public.users.department, excluded.department),
    phone = coalesce(public.users.phone, excluded.phone),
    status = coalesce(public.users.status, excluded.status),
    updated_at = now();

  return new;
end;
$$;

create or replace function app_private.handle_users_legacy_sync_before()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.old_user_id is null then
    new.old_user_id := app_private.next_old_user_id();
  end if;

  if new.status is null then
    new.status := 'Active';
  end if;

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.handle_users_legacy_sync_after()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.sync_legacy_user_from_profile(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile_sync on auth.users;
create trigger on_auth_user_created_profile_sync
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

drop trigger if exists before_users_legacy_sync on public.users;
create trigger before_users_legacy_sync
before insert or update of email, first_name, last_name, role_id, position, department, phone, status, old_user_id on public.users
for each row execute function app_private.handle_users_legacy_sync_before();

drop trigger if exists after_users_legacy_sync on public.users;
create trigger after_users_legacy_sync
after insert or update of email, first_name, last_name, role_id, position, department, phone, status, old_user_id on public.users
for each row execute function app_private.handle_users_legacy_sync_after();
