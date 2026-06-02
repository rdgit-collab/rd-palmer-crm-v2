# Final Sync Import Record - 2026-06-02

Source file:

- `/Users/roger/Downloads/filtered_2026-05-26_to_2026-06-02.sql`

Purpose:

- Bring the latest old-system data into Supabase before go-live.
- Preserve old-system visible ticket numbers.
- Convert mixed old ticket references so the new CRM links child records to `ticket.id`.

Imported row counts:

- `customer`: 10
- `contact`: 10
- `sales_lead`: 6
- `activity`: 2
- `ticket`: 31
- `ticket_product`: 512
- `task`: 61
- `calibration`: 5
- `calibration_checklist`: 20
- `rma`: 1
- `serialnumber`: 1
- `quotation`: 41
- `quotation_item`: 24
- `invoice`: 6
- `notification`: 38
- `activity_logs`: 217

Important processing notes:

- Tickets were aligned to old-system IDs and visible TID numbers.
- `TID1429` now uses internal `ticket.id = 1329`.
- `TID1430` to `TID1437` were imported from the old system.
- Task, calibration, and RMA ticket references were converted from old visible TID numbers to the new CRM internal ticket IDs.
- A temporary token-protected import RPC was created only for the import and removed afterward.
- Ticket, ticket product, and task timestamp triggers were temporarily disabled during the timestamp-preserving rerun, then re-enabled.
- Existing affected rows were backed up in `app_private.final_sync_backup_20260602`.

Verification:

- Latest visible ticket number after import: `TID1437`.
- Next expected ticket number: `TID1438`.
- Orphan check result: 0 orphan `ticket_product`, `task`, `rma`, and `calibration` rows.
- Temporary import RPC remaining count: 0.

Frontend follow-up:

- `src/pages/service/Tickets.jsx` was changed so new ticket numbers are based on the highest visible `ticket.ticket_id`, not the internal database `ticket.id`.
