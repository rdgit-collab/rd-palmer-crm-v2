-- Allow Settings > Booking dropdown/master data maintenance.
-- Read remains open to authenticated users so the Booking module can load options.
-- Add/edit/delete is limited by RLS to Admin (role_id 1) and Super Admin (role_id 99).

grant insert, update, delete on public.booking_venues,
  public.booking_equipment_categories,
  public.booking_equipment_groups,
  public.booking_equipment_items
to authenticated;

drop policy if exists "Admins can manage booking venues" on public.booking_venues;
create policy "Admins can manage booking venues" on public.booking_venues
for all to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)))
with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)));

drop policy if exists "Admins can manage booking categories" on public.booking_equipment_categories;
create policy "Admins can manage booking categories" on public.booking_equipment_categories
for all to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)))
with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)));

drop policy if exists "Admins can manage booking groups" on public.booking_equipment_groups;
create policy "Admins can manage booking groups" on public.booking_equipment_groups
for all to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)))
with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)));

drop policy if exists "Admins can manage booking equipment items" on public.booking_equipment_items;
create policy "Admins can manage booking equipment items" on public.booking_equipment_items
for all to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)))
with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99)));
