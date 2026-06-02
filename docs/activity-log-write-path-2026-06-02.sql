-- RD Palmer CRM activity log write path and Super Admin hardening
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-02.

-- Activity log rows are inserted by the frontend, but actor fields are populated
-- by this trigger so users cannot spoof who performed the action.
create or replace function app_private.populate_activity_log_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.users%rowtype;
begin
  select *
    into actor
    from public.users
   where id = auth.uid();

  if actor.id is null or actor.status = 'Inactive' then
    raise exception 'Only active authenticated users can write activity logs';
  end if;

  new.actor_user_id := actor.id;
  new.actor_old_user_id := actor.old_user_id;
  new.actor_name := nullif(trim(coalesce(actor.first_name, '') || ' ' || coalesce(actor.last_name, '')), '');
  new.actor_role_id := actor.role_id;
  new.created_at := now();
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  return new;
end;
$$;

drop trigger if exists activity_log_populate_actor on public.activity_log;
create trigger activity_log_populate_actor
before insert on public.activity_log
for each row
execute function app_private.populate_activity_log_actor();

revoke update, delete on public.activity_log from authenticated;
grant insert, select on public.activity_log to authenticated;

drop policy if exists activity_log_insert_active_user on public.activity_log;
create policy activity_log_insert_active_user
on public.activity_log
for insert
to authenticated
with check (app_private.is_active());

-- Harden user activation so normal Admin cannot deactivate/reactivate Super Admin
-- accounts through the RPC even if the frontend button is hidden.
create or replace function public.toggle_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = auth, public, pg_temp
as $$
declare
  target_role integer;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can change user active status';
  end if;

  select role_id into target_role
    from public.users
   where id = p_user_id;

  if target_role is null then
    raise exception 'User profile not found';
  end if;

  if target_role = 99 and not app_private.is_super_admin() then
    raise exception 'Only Super Admin can change Super Admin account status';
  end if;

  if p_active then
    update auth.users set banned_until = null where id = p_user_id;
  else
    update auth.users set banned_until = '2099-12-31 23:59:59+00' where id = p_user_id;
  end if;
end;
$$;

