-- =====================================================================
-- Water Dep RLS follow-up — quotation / invoice direct-access hardening
-- Date: 2026-07-07     STATUS: NOT APPLIED (review before running)
--
-- This SQL was verified against the LIVE policies on project
-- jpvjqmkvtnedpmmrddft (read from pg_policies on 2026-07-07). Each statement
-- reproduces the existing policy exactly and only:
--   (a) adds role 5 to the "sees own only" exclusion (array[2,4] -> array[2,4,5]), and
--   (b) adds a Water Dep team branch so role 5 is scoped to teammates' rows.
--
-- WHY: the existing sales-document policies restrict roles 2 and 4 to their
-- own rows and let every OTHER role with module permission see ALL rows.
-- Water Dep (role 5) is "other", so without this a Water Dep user could
-- read/update/delete ANY quotation or invoice by direct id. The app already
-- scopes every list/screen to the Water Dep team via the search RPCs, so this
-- file only closes the direct-by-id gap (defence in depth).
--
-- The helper below (app_private.is_water_team_member) was ALREADY applied via
-- migration water_dep_team_member_helper on 2026-07-07. It is repeated here
-- (idempotent) so this file is self-contained.
--
-- Before applying: re-dump current policies to confirm they still match, and
-- apply on a branch/staging first.
--   select tablename, policyname, cmd, qual, with_check from pg_policies
--   where tablename in ('quotation','quotation_item','invoice','invoice_item');
-- =====================================================================

create or replace function app_private.is_water_team_member(p_old_user_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.old_user_id = p_old_user_id
      and u.role_id = 5
      and coalesce(u.status, 'Active') <> 'Inactive'
  )
$$;
revoke all on function app_private.is_water_team_member(integer) from public;
grant execute on function app_private.is_water_team_member(integer) to authenticated;

-- ---------------------------------------------------------------------
-- QUOTATION
-- ---------------------------------------------------------------------
drop policy if exists quotation_select_owned_for_sales on public.quotation;
create policy quotation_select_owned_for_sales on public.quotation
for select to authenticated
using (
  (select app_private.can_access('quotations'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

drop policy if exists quotation_insert_owned_for_sales on public.quotation;
create policy quotation_insert_owned_for_sales on public.quotation
for insert to authenticated
with check (
  (select app_private.can_access('quotations'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

drop policy if exists quotation_update_owned_for_sales on public.quotation;
create policy quotation_update_owned_for_sales on public.quotation
for update to authenticated
using (
  (select app_private.can_access('quotations'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
)
with check (
  (select app_private.can_access('quotations'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

drop policy if exists quotation_delete_owned_for_sales on public.quotation;
create policy quotation_delete_owned_for_sales on public.quotation
for delete to authenticated
using (
  (select app_private.can_access('quotations'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

-- ---------------------------------------------------------------------
-- QUOTATION ITEM (scoped through parent quotation)
-- ---------------------------------------------------------------------
drop policy if exists quotation_item_select_owned_for_sales on public.quotation_item;
create policy quotation_item_select_owned_for_sales on public.quotation_item
for select to authenticated
using (
  (select app_private.can_access('quotations'))
  and exists (
    select 1 from public.quotation q
    where q.id = quotation_item.qid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or q.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(q.user_id))
      )
  )
);

drop policy if exists quotation_item_insert_owned_for_sales on public.quotation_item;
create policy quotation_item_insert_owned_for_sales on public.quotation_item
for insert to authenticated
with check (
  (select app_private.can_access('quotations'))
  and exists (
    select 1 from public.quotation q
    where q.id = quotation_item.qid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or q.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(q.user_id))
      )
  )
);

drop policy if exists quotation_item_update_owned_for_sales on public.quotation_item;
create policy quotation_item_update_owned_for_sales on public.quotation_item
for update to authenticated
using (
  (select app_private.can_access('quotations'))
  and exists (
    select 1 from public.quotation q
    where q.id = quotation_item.qid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or q.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(q.user_id))
      )
  )
)
with check (
  (select app_private.can_access('quotations'))
  and exists (
    select 1 from public.quotation q
    where q.id = quotation_item.qid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or q.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(q.user_id))
      )
  )
);

drop policy if exists quotation_item_delete_owned_for_sales on public.quotation_item;
create policy quotation_item_delete_owned_for_sales on public.quotation_item
for delete to authenticated
using (
  (select app_private.can_access('quotations'))
  and exists (
    select 1 from public.quotation q
    where q.id = quotation_item.qid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or q.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(q.user_id))
      )
  )
);

-- ---------------------------------------------------------------------
-- INVOICE
-- ---------------------------------------------------------------------
drop policy if exists invoice_select_owned_for_sales on public.invoice;
create policy invoice_select_owned_for_sales on public.invoice
for select to authenticated
using (
  (select app_private.can_access('invoices'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

drop policy if exists invoice_insert_owned_for_sales on public.invoice;
create policy invoice_insert_owned_for_sales on public.invoice
for insert to authenticated
with check (
  (select app_private.can_access('invoices'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

drop policy if exists invoice_update_owned_for_sales on public.invoice;
create policy invoice_update_owned_for_sales on public.invoice
for update to authenticated
using (
  (select app_private.can_access('invoices'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
)
with check (
  (select app_private.can_access('invoices'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

drop policy if exists invoice_delete_owned_for_sales on public.invoice;
create policy invoice_delete_owned_for_sales on public.invoice
for delete to authenticated
using (
  (select app_private.can_access('invoices'))
  and (
    (select app_private.current_role_id()) = 1
    or (select app_private.current_role_id()) <> all (array[2,4,5])
    or user_id = (select app_private.current_old_user_id())
    or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(user_id))
  )
);

-- ---------------------------------------------------------------------
-- INVOICE ITEM (scoped through parent invoice)
-- ---------------------------------------------------------------------
drop policy if exists invoice_item_select_owned_for_sales on public.invoice_item;
create policy invoice_item_select_owned_for_sales on public.invoice_item
for select to authenticated
using (
  (select app_private.can_access('invoices'))
  and exists (
    select 1 from public.invoice i
    where i.id = invoice_item.invoiceid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or i.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(i.user_id))
      )
  )
);

drop policy if exists invoice_item_insert_owned_for_sales on public.invoice_item;
create policy invoice_item_insert_owned_for_sales on public.invoice_item
for insert to authenticated
with check (
  (select app_private.can_access('invoices'))
  and exists (
    select 1 from public.invoice i
    where i.id = invoice_item.invoiceid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or i.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(i.user_id))
      )
  )
);

drop policy if exists invoice_item_update_owned_for_sales on public.invoice_item;
create policy invoice_item_update_owned_for_sales on public.invoice_item
for update to authenticated
using (
  (select app_private.can_access('invoices'))
  and exists (
    select 1 from public.invoice i
    where i.id = invoice_item.invoiceid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or i.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(i.user_id))
      )
  )
)
with check (
  (select app_private.can_access('invoices'))
  and exists (
    select 1 from public.invoice i
    where i.id = invoice_item.invoiceid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or i.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(i.user_id))
      )
  )
);

drop policy if exists invoice_item_delete_owned_for_sales on public.invoice_item;
create policy invoice_item_delete_owned_for_sales on public.invoice_item
for delete to authenticated
using (
  (select app_private.can_access('invoices'))
  and exists (
    select 1 from public.invoice i
    where i.id = invoice_item.invoiceid
      and (
        (select app_private.current_role_id()) = 1
        or (select app_private.current_role_id()) <> all (array[2,4,5])
        or i.user_id = (select app_private.current_old_user_id())
        or ((select app_private.current_role_id()) = 5 and app_private.is_water_team_member(i.user_id))
      )
  )
);
