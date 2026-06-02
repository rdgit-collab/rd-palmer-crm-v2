# Final Sync Null Cleanup - 2026-06-03

Scope:

- Only rows from `/Users/roger/Downloads/filtered_2026-05-26_to_2026-06-02.sql`.
- No whole-database cleanup was performed.

Reason:

- The imported old-system data contained a few blank fields.
- One example caused the Activities page to crash because old activity rows had `type = null`.

Changes Applied:

- `public.activity`
  - Rows `1347` and `1348`
  - `type` changed from blank/null to `Enquiry`
  - Reason: both rows are enquiry-related and already had `priority = High` and `status = Open`.

- `public.task`
  - 9 imported task rows
  - blank/null `spare` changed to `NIL`
  - Reason: old task records commonly use `NIL` to mean no spare used.

Backup:

- Before cleanup, affected rows were backed up to:
  - `app_private.final_sync_null_cleanup_backup_20260603`

Verification:

- Imported activity blank `type`: 0
- Imported activity blank `priority`: 0
- Imported activity blank `status`: 0
- Imported task blank `spare`: 0
- Imported task blank `description`: 0
