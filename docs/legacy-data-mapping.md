# Legacy Data Mapping

Date: 2026-06-01

## Canonical Rules

- Supabase Auth users use UUIDs in `auth.users.id` and `public.users.id`.
- Migrated CRM ownership still uses old Laravel integer user ids.
- `public.users.old_user_id` and `public.legacy_users.old_user_id` are the bridge between the old CRM ids and the new Supabase Auth user.
- Frontend assignment dropdowns should save `legacy_users.old_user_id` integers, not Supabase UUIDs.
- Frontend ownership fields should use `getLegacyUserId(profile)` and must not fall back to old user id `1`.

## User Id Fields

These fields are legacy integer user ids and should match `public.legacy_users.old_user_id`:

- `sales_lead.assigned_to`
- `customer.assignto`
- `customer.user_id`
- `contact.assigned_to`
- `contact.user_id`
- `activity.user_id`
- `activity.assigned_to`
- `quotation.user_id`
- `quotation_item.user_id`
- `invoice.user_id`
- `invoice_item.user_id`
- `ticket.assigned_to`
- `ticket.user_id`
- `task.assigned_to`
- `task.user_id`
- `onsiteticket.assigned_to`
- `onsiteticket.user_id`
- `calibration.user_id`
- `serialnumber.user_id`
- `notification.user_id`
- `notification.assigned_to`

## Catalogue Lookup Fields

`public.goodsservices` is being moved to the new catalogue lookup ids in reviewed batches:

- `goodsservices.category` -> `product_category.id` (converted in batch 1)
- `goodsservices.model` -> `product_model.id` (converted in batch 2)
- `goodsservices.manufacture` -> `product_manufacturer.id` (converted in batch 3)
- `goodsservices.item_type` -> `item_type.id`
- `goodsservices.tax` -> `tax.id`

Historical issue: imported `goodsservices` rows used `category`, `model`, and `manufacture`. The newer `product_*` lookup tables reused some of the same numbers for different labels, causing silent catalogue mismatch when the frontend read from `product_category`, `product_model`, and `product_manufacturer`.

Supabase migrations:

- `20260601111542 normalize_goodsservices_lookup_ids`
- `20260601124610 restore_goodsservices_original_lookup_ids`
- `20260601130835 convert_goodsservices_category_to_product_category`
- `20260601132227 convert_goodsservices_model_to_product_model`
- `20260601133531 convert_goodsservices_manufacture_to_product_manufacturer`

The first migration normalized the rows toward `product_*` tables, but the live data had already been normalized once before, so applying it again shifted labels a second time. The restore migration backs up the current values to:

- `app_private.goodsservices_lookup_restore_backup_20260601`

It then restores `goodsservices.category`, `goodsservices.model`, and `goodsservices.manufacture` back to the original imported lookup tables by reversing the name-based mapping twice.

Batch 1 converts only `goodsservices.category` from `category.id` to `product_category.id` by matching category names. It backs up pre-conversion category values to:

- `app_private.goodsservices_category_before_product_category_20260601`

Batch 2 converts only `goodsservices.model` from `model.id` to `product_model.id` by matching model names. It backs up pre-conversion model values to:

- `app_private.goodsservices_model_before_product_model_20260601`

Batch 3 converts only `goodsservices.manufacture` from `manufacture.id` to `product_manufacturer.id` by matching manufacturer names. It backs up pre-conversion manufacturer values to:

- `app_private.goodsservices_manufacture_before_product_manufacturer_20260601`

The frontend Catalogue and Settings screens now use `product_category`, `product_model`, and `product_manufacturer` for catalogue category/model/manufacturer.

## Remaining Data Cleanup Items

The latest audit found parent-child orphan references that should be reviewed before adding foreign keys:

- `ticket_product.ticket_id -> ticket.id`: 170 orphan rows
- `quotation_item.qid -> quotation.id`: 79 orphan rows
- `invoice_item.invoiceid -> invoice.id`: 38 orphan rows
- `calibration_checklist.cid -> calibration.id`: 30 orphan rows
- `task.ticket_id -> ticket.id`: 1 null reference

These were not automatically deleted because they may represent migrated historical detail rows. Review exports or old CRM context before deciding whether to archive, reconnect, or remove them.

## Frontend Guardrails Added

- `getLegacyUserId(profile)` now returns `null` instead of silently falling back to old user id `1`.
- Contact creation/edit now saves the logged-in user's legacy id instead of hard-coding `user_id: 1`.
- Quotation-to-invoice conversion now preserves quotation/item owner ids, falling back to the logged-in user's legacy id instead of old user id `1`.
