# Activity Log And Super Admin Planning

Date: 2026-06-02
Branch context: `go-live-hardening-test`
Status: Planning only. No code or database changes have been made for this feature yet.

## Why This Document Exists

Roger wants an internal activity log system before go-live so that important actions inside the CRM can be traced later if something goes wrong.

The activity log should not be visible to normal Admin users. Roger is considering adding a new `Super Admin` role that can view the audit log and control role permissions.

## Current CRM Role Situation

Current role ids used by the frontend:

- `1` = Admin
- `2` = Sales
- `3` = Service
- `4` = Sales Manager

Important current behavior:

- `Admin` currently has broad access.
- In `src/lib/roles.js`, `isAdminRole(roleId)` returns true for role `1`.
- In `src/contexts/AuthContext.jsx`, Admin bypasses normal `module_permission` lookup and gets `permissions = 'admin'`.
- In `src/App.jsx`, these routes are hard-gated to Admin role `1`:
  - `/catalogue`
  - `/admin/users`
  - `/settings`
- In `src/pages/admin/Settings.jsx`, role permission controls currently live under Settings and are accessible to Admin.

This means adding a hidden audit log is not just a new page. The system needs a deliberate role split so normal Admin cannot see or control sensitive audit features.

## Recommended Direction

Create a new `Super Admin` role and treat it as the highest-trust role.

Recommended access:

- `Super Admin`
  - View activity log.
  - Manage role permissions.
  - Manage Admin users and other users.
  - Access all CRM modules.
- `Admin`
  - Continue normal CRM administration.
  - Do not view activity log.
  - Do not change role permissions.
  - Do not create/edit Super Admin users.
- Sales, Sales Manager, Service
  - No activity log access.

## Activity Log Scope

Do not log every click, page view, dropdown search, or typing action. That would create noise and unnecessary database growth.

Recommended first version logs important business actions only:

- User created, edited, activated, deactivated.
- Role permission changed.
- Customer, contact, lead, activity created/edited/deleted.
- Ticket, task, onsite ticket, RMA, calibration created/edited/completed/deleted.
- Quotation and invoice created/edited/deleted/converted.
- Catalogue and Settings lookup values created/edited/deleted.
- File uploaded or replaced where practical.

Recommended log fields:

- `id`
- `created_at`
- `actor_user_id`
- `actor_old_user_id`
- `actor_name`
- `actor_role_id`
- `module`
- `action`
- `record_table`
- `record_id`
- `record_label`
- `summary`
- Optional small `metadata` JSON for useful non-sensitive context.

Avoid storing large full-row snapshots in v1 unless there is a strong reason. A balanced log is safer and lighter.

## Performance Opinion

This should not make the system heavy if implemented carefully.

Reasons:

- One audit row per important business action is small.
- Postgres/Supabase can handle many thousands or millions of small audit rows if indexed properly.
- The Activity Log page should use server-side pagination and filters, not load all logs into the browser.

Recommended indexes:

- `created_at desc`
- `actor_old_user_id`
- `module`
- `action`
- `(record_table, record_id)`

## Security Requirements

The activity log must be protected in the database, not only hidden in the UI.

Recommended database rules:

- Enable RLS on the activity log table.
- Only Super Admin can select/read logs.
- Normal users should not be able to update or delete logs.
- Log records should be append-only.
- If frontend inserts logs directly, only allow insert through a safe RPC/function that records the current authenticated user.
- Better long-term approach: use database triggers or secure RPC helpers for critical actions so logs cannot be skipped accidentally.

## Suggested Implementation Phases

### Phase 1: Role Split

- Add `ROLE_SUPER_ADMIN`, likely role id `5`, in `src/lib/roles.js`.
- Update `roleLabel`.
- Decide whether `isAdminRole` should include Super Admin or create a separate `isSuperAdminRole`.
- Update route guards so:
  - Super Admin can access everything.
  - Admin keeps normal admin access, but not activity log or role permission control.
- Update Users screen so normal Admin cannot create/edit Super Admin users.

### Phase 2: Private Audit Log Table

- Create `activity_log` table.
- Enable RLS.
- Add policies so only Super Admin can read logs.
- Prevent update/delete from normal users.
- Add indexes for date, actor, module, action, and target record.

### Phase 3: Logging Helper

- Add a shared frontend helper such as `logActivity(...)`.
- Start with important modules only.
- The helper should fail quietly or report non-blocking errors, so a log insert failure does not prevent saving a ticket/customer/invoice.
- Do not log sensitive full data like passwords, auth tokens, or private keys.

### Phase 4: Super Admin UI

- Add an Activity Log page visible only to Super Admin.
- Add filters:
  - Date range
  - User
  - Module
  - Action
  - Record id / record label
- Use server-side pagination.
- Show newest logs first.

## Current Recommendation

Build this before go-live, but keep v1 balanced:

- Log important actions only.
- Do not log every tiny UI action.
- Keep logs private to Super Admin.
- Make the database enforce privacy with RLS.
- Use pagination and indexes so the system stays fast.

