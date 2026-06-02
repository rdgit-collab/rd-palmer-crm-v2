# Parent Child Orphan Review

Date: 2026-06-02

## Current Result

After the final archive batch, the remaining parent-child orphan counts are:

- `ticket_product.ticket_id -> ticket.id`: 0 rows
- `quotation_item.qid -> quotation.id`: 0 rows
- `invoice_item.invoiceid -> invoice.id`: 0 rows
- `calibration_checklist.cid -> calibration.id`: 0 rows
- `task.ticket_id -> ticket.id`: 0 rows
- `task.ticket_id` blank references: 0 rows

## Safe Match Check

Checked whether remaining orphan rows could be reconnected by exact alternate values:

- `quotation_item.qid` against `quotation.number` and `quotation.reference`: 0 safe matches
- `invoice_item.invoiceid` against `invoice.invoice_number`, `invoice.order_number`, and `invoice.quote_ref_number`: 0 safe matches
- `calibration_checklist.cid` against `calibration.certificate_number`, `calibration.ticket_id`, and `calibration.termid`: no safe one-to-one matches
- `ticket_product.serial_number` against `ticket.serial_number`: 0 safe matches

## Decision

No further automatic reconnect was applied because the current Supabase database did not contain a clear one-to-one parent for the remaining child rows.

The blank-ticket test task and four June 1 TID1331 development/test task rows were archived to `app_private.task_test_rows_archive_20260602` and removed from live `public.task`.

The remaining orphan child rows were archived to `app_private.parent_child_orphan_archive_20260602` and removed from live child/detail tables:

- `ticket_product`: 161 rows
- `quotation_item`: 79 rows
- `invoice_item`: 38 rows
- `calibration_checklist`: 30 rows
