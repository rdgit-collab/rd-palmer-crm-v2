# Sales Document Ownership Restriction

Date: 2026-05-29

Rollback tag before this feature: `rollback-before-sales-doc-ownership-2026-05-29`

Related code commit: `6d577a7 Restrict sales docs and refine sales performance`

Follow-up commit: `db475be Fix sales manager permissions`

## Purpose

Sales users should only view quotation and invoice documents created under their own old CRM user id. Admin users should continue to view all quotation and invoice documents.

This change also refined the Salesperson Performance dashboard so it only shows active Sales role users and lets management select the month being reviewed.

Follow-up note: Sales Manager now uses its own role id (`role_id = 4`) and its own `module_permission` rows. In the frontend, Sales Manager is treated as a sales role for sales document list filtering, with the extra Activities `All Activity` tab. On 2026-06-01, Supabase quotation/invoice RLS was updated so Sales Manager is ownership-restricted the same way Sales is for quotations and invoices.

## Code Changes

### `src/pages/Dashboard.jsx`

- Added a month dropdown for Salesperson Performance.
- Added helper functions for month values/ranges using local date formatting.
- Changed Salesperson Performance to load active Sales users only:
  - Source table: `public.users`
  - Filter: `role_id = 2`
  - Excludes `status = 'Inactive'`
- Metrics now resolve owners only against Sales users:
  - Lead ownership uses `sales_lead.assigned_to`.
  - Activity count uses `activity.assigned_to`.
  - Quotation value/count uses `quotation.sales_person` or fallback `quotation.user_id`.
  - Invoice value uses `invoice.sales_person` or fallback `invoice.user_id`.
- Admin, technical, service, and other non-sales users are ignored in the Salesperson Performance table.
- Sales Manager users are included as sales users where the current dashboard and activity workflow requires it.

### `src/pages/sales/Quotations.jsx`

- Imported `useAuth` and `getLegacyUserId`.
- List query now includes `user_id`.
- For Sales and Sales Manager users, the quotation list is filtered by:
  - `quotation.user_id = getLegacyUserId(profile)`
- Admin users are not filtered in the frontend.
- New quotations now save:
  - `user_id = getLegacyUserId(profile)`
- Existing quotations keep their existing `user_id` when edited.
- Quotation items now inherit the saved quotation `user_id`.

### `src/pages/sales/Invoices.jsx`

- Imported `useAuth` and `getLegacyUserId`.
- List query now includes `user_id`.
- For Sales and Sales Manager users, the invoice list is filtered by:
  - `invoice.user_id = getLegacyUserId(profile)`
- Admin users are not filtered in the frontend.
- New invoices now save:
  - `user_id = getLegacyUserId(profile)`
- Existing invoices keep their existing `user_id` when edited.
- Invoice items now inherit the saved invoice `user_id`.

## Supabase Changes

Applied migration name:

`restrict_sales_documents_to_owner`

Old broad policies removed:

- `quotation_module_all`
- `quotation_item_module_all`
- `invoice_module_all`
- `invoice_item_module_all`

New policies created:

Quotation:

- `quotation_select_owned_for_sales`
- `quotation_insert_owned_for_sales`
- `quotation_update_owned_for_sales`
- `quotation_delete_owned_for_sales`

Quotation items:

- `quotation_item_select_owned_for_sales`
- `quotation_item_insert_owned_for_sales`
- `quotation_item_update_owned_for_sales`
- `quotation_item_delete_owned_for_sales`

Invoice:

- `invoice_select_owned_for_sales`
- `invoice_insert_owned_for_sales`
- `invoice_update_owned_for_sales`
- `invoice_delete_owned_for_sales`

Invoice items:

- `invoice_item_select_owned_for_sales`
- `invoice_item_insert_owned_for_sales`
- `invoice_item_update_owned_for_sales`
- `invoice_item_delete_owned_for_sales`

Policy logic:

- User must still have module permission via `app_private.can_access('quotations')` or `app_private.can_access('invoices')`.
- Admin role can access all rows:
  - `app_private.current_role_id() = 1`
- Non-sales roles with module permission are not ownership-restricted by the latest policies:
  - `app_private.current_role_id() not in (2, 4)`
- Sales and Sales Manager roles are ownership-restricted:
  - parent row `user_id = app_private.current_old_user_id()`
- Item rows are protected through their parent document:
  - `quotation_item.qid -> quotation.id`
  - `invoice_item.invoiceid -> invoice.id`

## Verification Done

- `npm run build` passed.
- Supabase policies verified:
  - `quotation`: 4 policies
  - `quotation_item`: 4 policies
  - `invoice`: 4 policies
  - `invoice_item`: 4 policies
- Active Sales users count at time of change: 5.

## Revert Plan

To revert the frontend changes only:

1. Revert commit `6d577a7`, or restore from tag `rollback-before-sales-doc-ownership-2026-05-29`.
2. Rebuild and redeploy.

To revert Supabase ownership restriction:

1. Drop all 16 ownership policies listed above.
2. Recreate the old broad module policies:

```sql
create policy quotation_module_all on public.quotation
for all to authenticated
using (app_private.can_access('quotations'))
with check (app_private.can_access('quotations'));

create policy quotation_item_module_all on public.quotation_item
for all to authenticated
using (app_private.can_access('quotations'))
with check (app_private.can_access('quotations'));

create policy invoice_module_all on public.invoice
for all to authenticated
using (app_private.can_access('invoices'))
with check (app_private.can_access('invoices'));

create policy invoice_item_module_all on public.invoice_item
for all to authenticated
using (app_private.can_access('invoices'))
with check (app_private.can_access('invoices'));
```

Important: reverting the frontend alone is not enough if Supabase RLS remains ownership-restricted. The policies must also be reverted for Sales users to see all quotation and invoice records again.

Additional Sales Manager rollback note:

- If removing the Sales Manager role, remove or ignore `module_permission` rows with `role_id = 4`.
- Restore `effectivePermissionRoleId` behavior only if Sales Manager should intentionally share Sales permission rows again.
