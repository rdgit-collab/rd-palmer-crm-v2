# RD Palmer CRM Go-Live Readiness Checklist

Date: 2026-05-31

Latest reviewed commit: `db475be Fix sales manager permissions`

Latest Supabase review: 2026-06-01

## Current Status

- Build status: `npm run build` passes.
- Frontend routing: routes are lazy-loaded and wrapped with an error boundary.
- Domain: `crm.rd-palmer.my` has been added to Vercel, but DNS must continue to match the CNAME shown in Vercel until the domain shows `Valid Configuration`.
- Backend: Supabase is the production backend for auth, data, storage, and RLS.

## Role Visibility Audit

Read-only Supabase checks were run with one account from each role:

| Role | Test Account | Result |
| --- | --- | --- |
| Admin | `robbin.new@rd-palmer.com` | Can access company-wide data. Admin bypasses module permission lookup in the frontend. |
| Sales Manager | `wm.fok@rd-palmer.com` | Module permissions exist for customers, contacts, leads, activities, quotations, invoices, and tickets. Quotations and invoices are now ownership-restricted by Supabase policies for `role_id = 4`, matching the frontend list filters. Activities still intentionally includes the All Activity tab. |
| Sales | `nur.khausar@rd-palmer.com` | Module permissions exist for sales modules and tickets. Quotations and invoices are ownership-restricted by Supabase policies. Other sales tables still rely more heavily on frontend filtering. |
| Service | `m.hafiz@rd-palmer.com` | Sales tables return no visible rows. Service modules and service data are visible. |

Important security note: quotation and invoice ownership is enforced in Supabase RLS for Sales and Sales Manager users. Some other sales restrictions, such as leads/activity dashboard visibility, are still partly enforced by frontend filters because Sales Manager has an intentional All Activity workflow and service screens read customer/contact data for ticket work. Lock the exact business rule before tightening those tables further.

## Already Healthy

- Role definitions are centralized in `src/lib/roles.js`.
- Settings, Users, and Catalogue are admin-only routes.
- Sales Manager has its own permission role (`role_id = 4`) instead of reusing Sales permission rows.
- Service dashboard workload table now uses active `role_id = 3` users only.
- Serial number search no longer searches all fields by default and waits for the Search button.
- Most table page sizes are now 30 rows, reducing list load pressure.
- The latest auth change prevents silent blank pages when profile or permission loading fails.
- Sales dashboard aggregation now avoids loading large historical quotation/invoice/activity batches when only recent/monthly data is needed.
- Activities no longer loads the full customer list just to display activity company names.
- Legacy catalogue lookup ids were normalized so `goodsservices.category`, `model`, and `manufacture` point to the new frontend lookup tables by matching names.
- Common Supabase performance indexes have been applied for sales, service, invoice, quotation, and serial number filters.
- The `toggle_user_active` RPC now has a fixed search path, rejects non-admin callers internally, and is no longer executable by `anon`.

## Main Go-Live Risks

1. **RLS business-rule decision remains for non-document sales tables**
   - Sales and Sales Manager quotation/invoice ownership is documented and enforced.
   - Customers, contacts, leads, and activities still need a final product decision because Sales Manager has All Activity access while some pages show personal views.
   - Service ticket flows also read customer/contact data, so do not blindly restrict those tables without browser testing service workflows.

2. **Dashboard queries still pull too much data**
   - Sales dashboard loads up to 2000 leads, 2000 activities, 2000 quotations, and 2000 invoices for calculations.
   - Service dashboard loads up to 2000 tickets, 2000 tasks, and 2000 onsite tickets.
   - This is acceptable for current testing, but it should be replaced with Supabase views or RPC summary functions before the data grows much larger.

3. **Activities page is still client-heavy**
   - Activities loads up to 5000 activity rows, then filters and paginates in the browser.
   - This should become server-side pagination and filtering.

4. **Large dropdowns need a shared remote-search pattern**
   - Customer, lead, item, contact, and serial number selectors have been improved in several places, but the app still has multiple custom dropdown implementations.
   - A shared async searchable select will reduce repeated bugs like lists stopping early.

5. **Old migrated text needs cleanup rules**
   - HTML content in quotation/invoice descriptions has been cleaned in the UI/PDF path, but migrated rich text should still be spot-checked.

6. **Storage/RLS needs a final audit**
   - The app uses the `crm-uploads` bucket with signed URLs.
   - Before shipping, confirm insert/select/update/delete policies match role expectations for task, onsite, calibration, certificate, and ticket attachments.

## Recommended Next Work

### Before User Acceptance Testing

- Freeze one rollback tag before the final UAT push.
- Run browser smoke tests for Admin, Sales Manager, Sales, and Service:
  - Login
  - Sidebar visibility
  - Dashboard loads
  - Create/edit/view one record in each allowed module
  - Confirm blocked modules stay hidden
- Verify PDF preview and download for quotation and invoice with:
  - One item
  - Many items crossing pages
  - Long terms and notes
- Verify migrated attachments:
  - Calibration certificate
  - Task document/photo
  - Onsite ticket document/photo

### Before Production Go-Live

- Confirm the newly added indexes are retained after production query stats settle. Supabase may report new indexes as unused until real traffic uses them.
- Replace dashboard client aggregation with Supabase summary views/RPC.
- Convert Activities to server-side filtering/pagination.
- Decide and then enforce RLS for customers, contacts, leads, and activities.
- Confirm Vercel production environment variables point to the intended Supabase project.
- Confirm DNS for `crm.rd-palmer.my` is valid in Vercel.
- Enable Supabase Auth leaked password protection in the Supabase dashboard.

SQL/reference files:

- `docs/go-live-supabase-hardening-2026-05-31.sql`
- `docs/legacy-data-audit.sql`
- `docs/legacy-data-mapping.md`

The index portion of the hardening draft was applied through Supabase MCP migration `go_live_rls_and_index_hardening_v2`.

## Supabase Changes Recorded During This Checklist

Live Supabase changes have now been made through MCP migrations.

Applied migrations after the original checklist:

- `20260601111542 normalize_goodsservices_lookup_ids`
  - Backed up original catalogue lookup values to `app_private.goodsservices_lookup_backup_20260601`.
  - Remapped `goodsservices.category`, `goodsservices.model`, and `goodsservices.manufacture` from old lookup ids to new frontend lookup ids by name.
  - Converted `goodsservices.tax = '0'` to `null`.
- `20260601112310 go_live_rls_and_index_hardening_v2`
  - Restricted quotation/invoice policies for Sales Manager (`role_id = 4`) the same way Sales (`role_id = 2`) is restricted.
  - Hardened `public.toggle_user_active`.
  - Added explicit no-client-access policies for old Laravel-only tables.
  - Added common filter/search indexes.
  - Improved the `users_self_update` RLS auth.uid initplan pattern.

Previously recorded live Supabase change still relevant:

- `module_permission` rows were added for `role_id = 4` Sales Manager:
  - `customers`
  - `contacts`
  - `leads`
  - `activities`
  - `quotations`
  - `invoices`
  - `tickets`

## Code Changes Made During This Checklist

- `src/contexts/AuthContext.jsx`
  - Added defensive handling for failed profile and module-permission loads.
  - Exposes `authError` so the app can show a clear message instead of a blank screen.
- `src/App.jsx`
  - Added a small account-access error screen for auth/profile/permission load failures.
- `src/pages/Dashboard.jsx`
  - Reduced sales dashboard aggregation load by filtering activity, quotation, and invoice metric queries by relevant date windows instead of pulling broad 2000-row batches.
- `src/pages/sales/Activities.jsx`
  - Replaced full customer lookup loading with a focused lookup for only customer ids referenced by the loaded activity rows.
- `src/lib/legacyUsers.js`
  - Removed the silent fallback to old user id `1`.
- `src/pages/sales/Contacts.jsx`
  - Contact saves now use the logged-in user's legacy id instead of hard-coding `user_id = 1`.
- `src/pages/sales/Quotations.jsx`
  - Quotation-to-invoice conversion no longer falls back to old user id `1`.
- `docs/go-live-supabase-hardening-2026-05-31.sql`
  - Added reviewed SQL draft for indexes, RLS review, and storage policy review.
