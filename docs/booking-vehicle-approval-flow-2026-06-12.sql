-- Vehicle booking approval flow
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-12.
-- Purpose:
-- - Vehicle bookings are submitted as pending.
-- - Admin/super admin or selected vehicle approvers can approve them.
-- - The privileged update is kept in app_private; the public RPC is only a thin wrapper.

create schema if not exists app_private;

create or replace function app_private.approve_vehicle_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  requester uuid := auth.uid();
  approver_setting text;
  approved_booking public.bookings%rowtype;
  can_approve boolean := false;
begin
  if requester is null then
    raise exception 'Not authenticated.';
  end if;

  select value into approver_setting
  from public.app_setting
  where key = 'booking_vehicle_approver_user_ids';

  select exists (
    select 1
    from public.users u
    where u.id = requester
      and u.role_id in (1, 99)
      and lower(coalesce(u.status, '')) <> 'inactive'
  ) or coalesce(nullif(approver_setting, ''), '[]')::jsonb ? requester::text
  into can_approve;

  if not can_approve then
    raise exception 'You are not allowed to approve vehicle bookings.';
  end if;

  update public.bookings
  set status = 'approved', updated_at = now()
  where id = p_booking_id
    and booking_type = 'vehicle'
    and status = 'pending'
  returning * into approved_booking;

  if approved_booking.id is null then
    raise exception 'Pending vehicle booking not found.';
  end if;

  return approved_booking;
end;
$$;

revoke all on function app_private.approve_vehicle_booking(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.approve_vehicle_booking(uuid) to authenticated;

create or replace function public.approve_vehicle_booking(p_booking_id uuid)
returns public.bookings
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select * from app_private.approve_vehicle_booking(p_booking_id);
$$;

revoke all on function public.approve_vehicle_booking(uuid) from public;
revoke execute on function public.approve_vehicle_booking(uuid) from anon;
grant execute on function public.approve_vehicle_booking(uuid) to authenticated;

insert into public.app_setting (key, value, updated_at)
values
  ('booking_vehicle_approver_user_ids', '[]', now()),
  ('booking_vehicle_notification_emails', '[]', now())
on conflict (key) do nothing;
