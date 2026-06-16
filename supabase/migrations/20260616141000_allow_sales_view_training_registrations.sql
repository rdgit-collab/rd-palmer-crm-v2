-- Allow Sales users to view training participants.
-- Registration edits remain restricted to Admin/Super Admin by training_regs_admin_all.

drop policy if exists training_regs_sales_read on public.training_registrations;
create policy training_regs_sales_read on public.training_registrations
  for select to authenticated
  using (
    exists (
      select 1
      from public.users u
      join public.module_permission mp
        on mp.role_id = u.role_id
       and mp.module = 'training'
       and mp.can_access is true
      where u.id = (select auth.uid())
        and u.role_id = 2
    )
  );

notify pgrst, 'reload schema';
